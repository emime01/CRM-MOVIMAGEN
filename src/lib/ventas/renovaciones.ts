import type { SupabaseClient } from '@supabase/supabase-js'
import { proximoNumeroCotizacion } from '@/lib/cotizaciones/numero'
import { idEnOrden } from '@/lib/cotizador/orden-items'
import { calcularItem, salidasDefault, type SoportePrecio } from '@/lib/cotizador/calcular'
import { altaEfectiva, bajaEfectiva } from '@/lib/ventas/asignar-buses'

/**
 * Renovaciones: a los vendedores se les avisa 30 días antes de que termine
 * una campaña (tarea + notificación, desde el cron) y desde la venta pueden
 * armar la cotización de renovación con un botón.
 */

export const TIPO_TAREA_RENOVACION = 'vendedor_renovacion'
export const TIPO_TAREA_SEGUIMIENTO_PROPUESTA = 'vendedor_seguimiento_propuesta'
/** Área de las tareas del vendedor. */
export const AREA_TAREA_VENTAS = 'ventas'
/** Con cuántos días de anticipación se avisa de la renovación. */
export const DIAS_AVISO_RENOVACION = 30

/** Una fecha "AAAA-MM-DD" corrida n días. */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(fecha.slice(0, 10) + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Días de calendario entre dos fechas (b - a). */
function diasEntre(a: string, b: string): number {
  return Math.round((new Date(b.slice(0, 10) + 'T12:00:00Z').getTime() - new Date(a.slice(0, 10) + 'T12:00:00Z').getTime()) / 86400000)
}

/** "2026-12-05" → "05/12". */
export function ddmm(fecha: string): string {
  const [, m, d] = fecha.slice(0, 10).split('-')
  return `${d}/${m}`
}

/** Fecha en que termina la campaña de una venta: la de la orden, o la del último ítem. */
export function finDeCampana(orden: any): string | null {
  const deOrden = orden?.fecha_baja_real ?? orden?.fecha_baja_prevista ?? null
  if (deOrden) return String(deOrden).slice(0, 10)
  const items = (orden?.orden_items ?? []) as any[]
  const bajas = items.map(it => bajaEfectiva(it, orden)).filter(Boolean).map(b => String(b).slice(0, 10))
  return bajas.length ? bajas.reduce((m, b) => (b > m ? b : m)) : null
}

export function nombreCliente(cli: any): string {
  const c = Array.isArray(cli) ? cli[0] : cli
  return c?.empresa || c?.nombre || 'cliente'
}

/** Cierra la tarea de renovación de la venta, si hay una abierta. */
export async function cerrarTareaRenovacion(supabase: SupabaseClient, ordenId: string) {
  try {
    await supabase
      .from('tasks')
      .update({ estado: 'completada', completed_at: new Date().toISOString() })
      .eq('orden_id', ordenId)
      .eq('tipo', TIPO_TAREA_RENOVACION)
      .neq('estado', 'completada')
  } catch {
    // Sin la migración v50 no hay tarea que cerrar: no debe romper nada.
  }
}

/** Cierra el seguimiento abierto de una cotización (se aceptó, se rechazó o volvió a borrador). */
export async function cerrarSeguimientoPropuesta(supabase: SupabaseClient, propuestaId: string) {
  try {
    await supabase
      .from('tasks')
      .update({ estado: 'completada', completed_at: new Date().toISOString() })
      .eq('propuesta_id', propuestaId)
      .eq('tipo', TIPO_TAREA_SEGUIMIENTO_PROPUESTA)
      .neq('estado', 'completada')
  } catch {
    // Sin la migración v50 no hay tarea que cerrar: no debe romper el cambio de estado.
  }
}

export type ResultadoRenovacion = { ok: boolean; propuestaId?: string; numero?: string; error?: string; status?: number; aviso?: string }

/**
 * Arma la cotización de renovación de una venta: mismo cliente, agencia y
 * soportes, empezando el día después de que termina la campaña y con la misma
 * duración. Los precios son los vigentes del catálogo (si un soporte ya no
 * está, se copia el precio unitario de la venta). Nace en borrador.
 */
export async function armarRenovacion(
  supabase: SupabaseClient,
  ordenId: string,
  userId: string,
): Promise<ResultadoRenovacion> {
  const { data: ordenRaw } = await supabase
    .from('ordenes_venta')
    .select(`
      id, numero, estado, cliente_id, agencia_id, vendedor_id, moneda, marca, campana,
      condicion_pago_dias, comision_agencia_pct, comision_agencia_prod_pct,
      fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real,
      clientes(nombre, empresa),
      orden_items(id, soporte_id, cantidad, semanas, salidas, precio_unitario,
        fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real)
    `)
    .eq('id', ordenId)
    .maybeSingle()
  const orden = ordenRaw as any
  if (!orden) return { ok: false, error: 'Venta no encontrada', status: 404 }

  const fin = finDeCampana(orden)
  const alta = altaEfectiva(null, orden) as string | null
  const items = (orden.orden_items ?? []) as any[]
  if (!fin) return { ok: false, error: 'La venta no tiene fecha de fin de campaña', status: 400 }
  if (!items.length) return { ok: false, error: 'La venta no tiene líneas para renovar', status: 400 }

  // Mismo largo de campaña, corrido al día siguiente del fin.
  const inicioNuevo = sumarDias(fin, 1)
  const maxSemanas = Math.max(1, ...items.map(it => Number(it.semanas) || 1))
  const dias = alta && alta.slice(0, 10) <= fin ? diasEntre(alta, fin) + 1 : maxSemanas * 7
  const finNuevo = sumarDias(inicioNuevo, dias - 1)

  // Precios vigentes del catálogo.
  const ids = Array.from(new Set(items.map(it => it.soporte_id).filter(Boolean)))
  const { data: soportes } = ids.length
    ? await supabase.from('soportes').select('*').in('id', ids)
    : { data: [] as any[] }
  const porId = new Map<string, any>((soportes ?? []).map((s: any) => [s.id, s]))

  let monto = { arr: 0, prod: 0, mun: 0, imp: 0, tot: 0 }
  let copiados = 0
  const filas = items.map((it, i) => {
    const s = it.soporte_id ? porId.get(it.soporte_id) : null
    const cantidad = Number(it.cantidad) || 1
    const semanas = Number(it.semanas) || 1
    if (s && s.activo !== false) {
      const sp = s as SoportePrecio
      const salidas = it.salidas ?? salidasDefault(sp)
      const c = calcularItem({ soporte: sp, semanas, cantidad, salidas, inicio: inicioNuevo })
      monto = { arr: monto.arr + c.arr, prod: monto.prod + c.prod, mun: monto.mun + c.mun, imp: monto.imp + c.imp, tot: monto.tot + c.tot }
      return {
        id: idEnOrden(i), soporte_id: s.id, nombre_soporte: s.nombre, ubicacion: s.ubicacion ?? null,
        categoria_soporte: s.categoria ?? null, tipo_cotizador: s.tipo_cotizador ?? null,
        cantidad, cantidad_soportes: cantidad, salidas_elegidas: salidas, semanas: c.sem,
        precio_unitario: s.precio_semanal ?? 0, subtotal: c.tot, impactos_calc: c.imp,
      }
    }
    // Soporte dado de baja o línea sin soporte: se copia el precio de la venta.
    copiados++
    const unit = Number(it.precio_unitario) || 0
    const sub = unit * cantidad
    monto = { ...monto, arr: monto.arr + sub, tot: monto.tot + sub }
    return {
      id: idEnOrden(i), soporte_id: it.soporte_id ?? null, nombre_soporte: s?.nombre ?? 'Soporte',
      ubicacion: s?.ubicacion ?? null, categoria_soporte: s?.categoria ?? null, tipo_cotizador: s?.tipo_cotizador ?? null,
      cantidad, cantidad_soportes: cantidad, salidas_elegidas: it.salidas ?? null, semanas,
      precio_unitario: unit, subtotal: sub, impactos_calc: null,
    }
  })

  // La cotización la lleva el vendedor de la venta (si no tiene, quien la arma).
  const vendedorId: string = orden.vendedor_id ?? userId

  // Toda cotización cuelga de un lead: el abierto de ese cliente y vendedor, o uno nuevo.
  const { data: abiertos } = await supabase.from('leads').select('id')
    .eq('cliente_id', orden.cliente_id).eq('vendedor_id', vendedorId)
    .not('estado', 'in', '(ganado,perdido)').order('created_at', { ascending: false }).limit(1)
  let leadId = abiertos?.[0]?.id as string | undefined
  const nombreCampana = orden.campana || orden.marca || nombreCliente(orden.clientes)
  const nombre = `${nombreCampana} · Renovación`
  if (!leadId) {
    const { data: lead, error: lErr } = await supabase.from('leads').insert({
      cliente_id: orden.cliente_id, vendedor_id: vendedorId, estado: 'en_conversacion',
      agencia_id: orden.agencia_id ?? null,
      descripcion: nombre, monto_potencial: Math.round(monto.arr + monto.prod + monto.mun),
    }).select('id').single()
    if (lErr || !lead) return { ok: false, error: `No se pudo crear el lead de la renovación: ${lErr?.message ?? 'desconocido'}`, status: 500 }
    leadId = lead.id
  }

  const numero = await proximoNumeroCotizacion(supabase)
  const { data: propuesta, error } = await supabase.from('propuestas').insert({
    lead_id: leadId,
    cliente_id: orden.cliente_id,
    agencia_id: orden.agencia_id ?? null,
    vendedor_id: vendedorId,
    numero,
    nombre,
    marca: orden.marca ?? null,
    campana: orden.campana ?? null,
    estado: 'borrador',
    fecha_inicio: inicioNuevo,
    fecha_fin: finNuevo,
    moneda: orden.moneda ?? 'UYU',
    condicion_pago_dias: orden.condicion_pago_dias ?? null,
    comision_agencia_pct: orden.agencia_id ? (orden.comision_agencia_pct ?? null) : null,
    comision_agencia_prod_pct: orden.agencia_id ? (orden.comision_agencia_prod_pct ?? null) : null,
    monto_neto: monto.arr + monto.prod + monto.mun,
    monto_arrendamiento: monto.arr,
    monto_produccion: monto.prod,
    monto_total: monto.tot,
    monto_impactos: monto.imp,
  }).select('id, numero').single()
  if (error || !propuesta) return { ok: false, error: error?.message ?? 'No se pudo crear la cotización', status: 500 }

  const { error: itemsErr } = await supabase.from('propuesta_items').insert(filas.map(f => ({ ...f, propuesta_id: propuesta.id })))
  if (itemsErr) {
    await supabase.from('propuestas').delete().eq('id', propuesta.id)
    return { ok: false, error: `No se pudieron cargar las líneas: ${itemsErr.message}`, status: 500 }
  }

  await cerrarTareaRenovacion(supabase, ordenId)

  return {
    ok: true, propuestaId: propuesta.id, numero: propuesta.numero,
    aviso: copiados ? `${copiados} línea(s) conservan el precio de la venta porque el soporte ya no está en el catálogo.` : undefined,
  }
}

// ── Avisos del cron diario ──────────────────────────────────────────────────

type Notificar = (n: { user_id: string; tipo: string; titulo: string; mensaje: string; link: string; entity_id: string }) => Promise<unknown>

/** Código de Postgres para violación de índice único: otra corrida ya creó la tarea. */
const DUPLICADA = '23505'

/**
 * Tarea "Ofrecer renovación" para cada venta viva que termina dentro de los
 * próximos 30 días. Una sola por venta, para siempre (aunque se complete):
 * si ya hubo tarea, no se vuelve a avisar. Las campañas que ya terminaron no
 * generan nada, para no inundar con ventas viejas que siguen "vivas".
 */
export async function avisosRenovacion(
  supabase: SupabaseClient,
  hoy: string,
  vivas: readonly string[],
  notificar: Notificar,
): Promise<{ creadas: number; error?: string }> {
  const limite = sumarDias(hoy, DIAS_AVISO_RENOVACION)
  const { data: ordenes, error } = await supabase
    .from('ordenes_venta')
    .select(`id, numero, vendedor_id, marca, campana, fecha_baja_prevista, fecha_baja_real,
      clientes(nombre, empresa),
      orden_items(fecha_baja_prevista, fecha_baja_real)`)
    .in('estado', vivas as unknown as string[])
    .not('vendedor_id', 'is', null)
  if (error) return { creadas: 0, error: error.message }

  const candidatas = (ordenes ?? [])
    .map((o: any) => ({ o, fin: finDeCampana(o) }))
    .filter(({ fin }) => fin && fin >= hoy && fin <= limite) as { o: any; fin: string }[]
  if (!candidatas.length) return { creadas: 0 }

  const { data: previas, error: pErr } = await supabase
    .from('tasks').select('orden_id')
    .eq('tipo', TIPO_TAREA_RENOVACION)
    .in('orden_id', candidatas.map(c => c.o.id))
  if (pErr) return { creadas: 0, error: pErr.message }
  const yaTienen = new Set((previas ?? []).map((t: any) => t.orden_id))

  let creadas = 0
  for (const { o, fin } of candidatas) {
    if (yaTienen.has(o.id)) continue
    const cliente = nombreCliente(o.clientes)
    const campana = o.campana || o.marca || (o.numero ? `OIC #${o.numero}` : 'campaña')
    const descripcion = `Ofrecer renovación — ${cliente} · ${campana}, termina el ${ddmm(fin)}`
    const { error: iErr } = await supabase.from('tasks').insert({
      tipo: TIPO_TAREA_RENOVACION,
      asignado_a_rol: AREA_TAREA_VENTAS,
      asignado_a: o.vendedor_id,
      orden_id: o.id,
      descripcion,
      // Una semana para ofrecerla (nunca después de que termine la campaña).
      fecha_limite: sumarDias(hoy, 7) < fin ? sumarDias(hoy, 7) : fin,
    })
    if (iErr) {
      if (iErr.code === DUPLICADA) continue
      return { creadas, error: iErr.message }
    }
    creadas++
    await notificar({
      user_id: o.vendedor_id, tipo: 'renovacion_proxima',
      titulo: `Renovación: ${cliente} termina el ${ddmm(fin)}`,
      mensaje: `La campaña ${campana} de ${cliente} termina el ${ddmm(fin)}. Ofrecé la renovación: desde la venta podés armar la cotización con un botón.`,
      link: `/dashboard/ventas/${o.id}`, entity_id: o.id,
    })
  }
  return { creadas }
}

/** Días sin novedades para pedir seguimiento de una cotización enviada. */
export const DIAS_SEGUIMIENTO_PROPUESTA = 6

/**
 * Tarea de seguimiento para cada cotización 'enviada' sin cambios hace 6 días o
 * más. No se apila: si ya hay una abierta, o se cerró hace menos de 6 días,
 * no se crea otra. Se cierra sola al aceptar, rechazar o volver a borrador.
 */
export async function avisosSeguimientoPropuesta(
  supabase: SupabaseClient,
  hoy: string,
  notificar: Notificar,
): Promise<{ creadas: number; error?: string }> {
  const corte = new Date(Date.now() - DIAS_SEGUIMIENTO_PROPUESTA * 86400000).toISOString()
  const { data: propuestas, error } = await supabase
    .from('propuestas')
    .select('id, numero, vendedor_id, clientes(nombre, empresa)')
    .eq('estado', 'enviada')
    .not('vendedor_id', 'is', null)
    .lte('updated_at', corte)
  if (error) return { creadas: 0, error: error.message }
  if (!propuestas?.length) return { creadas: 0 }

  const { data: previas, error: pErr } = await supabase
    .from('tasks').select('propuesta_id')
    .eq('tipo', TIPO_TAREA_SEGUIMIENTO_PROPUESTA)
    .in('propuesta_id', propuestas.map((p: any) => p.id))
    .or(`estado.neq.completada,completed_at.gte.${corte}`)
  if (pErr) return { creadas: 0, error: pErr.message }
  const yaTienen = new Set((previas ?? []).map((t: any) => t.propuesta_id))

  let creadas = 0
  for (const p of propuestas as any[]) {
    if (yaTienen.has(p.id)) continue
    const cliente = nombreCliente(p.clientes)
    const numero = p.numero ?? `#${String(p.id).slice(0, 6)}`
    const { error: iErr } = await supabase.from('tasks').insert({
      tipo: TIPO_TAREA_SEGUIMIENTO_PROPUESTA,
      asignado_a_rol: AREA_TAREA_VENTAS,
      asignado_a: p.vendedor_id,
      propuesta_id: p.id,
      descripcion: `Seguimiento de propuesta ${numero} — ${cliente}`,
      fecha_limite: hoy,
    })
    if (iErr) {
      if (iErr.code === DUPLICADA) continue
      return { creadas, error: iErr.message }
    }
    creadas++
    await notificar({
      user_id: p.vendedor_id, tipo: 'propuesta_seguimiento',
      titulo: `Seguimiento de propuesta ${numero}`,
      mensaje: `La propuesta ${numero} de ${cliente} lleva ${DIAS_SEGUIMIENTO_PROPUESTA} días o más enviada sin respuesta. Hacé seguimiento con el cliente.`,
      link: `/dashboard/cotizaciones/${p.id}`, entity_id: p.id,
    })
  }
  return { creadas }
}
