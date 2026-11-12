import type { SupabaseClient } from '@supabase/supabase-js'
import { hoyUY } from '@/lib/fechas'
import { enviarMail, mailConfigurado, mailsDePerfiles } from '@/lib/mail'
import { ESTADOS_VENTA_VIVA } from '@/lib/ventas/asignar-buses'
import { comoNeto, sumarPorMoneda } from '@/lib/money'
import { cuatrimestreDe } from '@/lib/objetivos/cuatrimestre'
import { cargarOcupaciones, ocupacionPorFormato, soportesLibres } from '@/lib/disponibilidad/ocupacion-mes'
import { DIAS_AVISO_RENOVACION, DIAS_SEGUIMIENTO_PROPUESTA, TIPO_TAREA_RENOVACION, finDeCampana } from '@/lib/ventas/renovaciones'
import { asuntoSemanal, construirResumenSemanal, semanaAnterior, sumarDias, type DatosResumenSemanal } from '@/lib/avisos/semanal'

const BASE = process.env.NEXTAUTH_URL ?? 'https://crm-movimagen.vercel.app'
const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : v ?? null)
const nombreCli = (c: any) => { const x = first<any>(c); return x?.empresa ?? x?.nombre ?? '—' }
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
/** Roles que reciben el resumen. */
export const ROLES_RESUMEN_SEMANAL = ['gerente_comercial', 'admin_sistema'] as const
const ESTADOS_LEAD_ABIERTO = ['nuevo', 'en_conversacion', 'propuesta_enviada', 'negociacion']

/** Primer y último día de un mes "AAAA-MM", más su nombre ("noviembre 2026"). */
function rangoMes(ym: string) {
  const [y, m] = ym.split('-').map(Number)
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { desde: `${ym}-01`, hasta: `${ym}-${String(ultimo).padStart(2, '0')}`, etiqueta: `${MESES[m - 1]} ${y}` }
}
function mesSiguiente(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}
/** Instante del inicio / fin de un día de Uruguay (UTC-3). */
const inicioDia = (d: string) => `${d}T00:00:00-03:00`
const finDia = (d: string) => `${d}T23:59:59.999-03:00`

function sinError(r: { error: any; data: any }): any[] {
  if (r.error) throw new Error(r.error.message ?? String(r.error))
  return r.data ?? []
}

/**
 * Junta los números del resumen. Cada sección se calcula por separado: si una
 * falla (por ejemplo, una migración que falta) se avisa en el mail y el resto
 * sale igual.
 */
export async function cargarDatosResumenSemanal(supabase: SupabaseClient, hoy: string = hoyUY()): Promise<DatosResumenSemanal> {
  const semana = semanaAnterior(hoy)
  const cuat = cuatrimestreDe(hoy)
  const avisos: string[] = []
  const seccion = async <T,>(nombre: string, vacio: T, fn: () => Promise<T>): Promise<T> => {
    try { return await fn() } catch (e) {
      console.error(`Resumen semanal: falló "${nombre}"`, e)
      avisos.push(nombre)
      return vacio
    }
  }

  const perfiles = sinError(await supabase.from('perfiles').select('id, nombre, rol, activo')) as any[]
  const nombreDe = new Map<string, string>(perfiles.map(p => [p.id, p.nombre ?? '—']))
  const vend = (id: string | null | undefined) => (id ? nombreDe.get(id) ?? '—' : 'Sin vendedor')

  // ── Ventas de la semana ──
  const ventas = await seccion<DatosResumenSemanal['ventas']>('ventas de la semana', { cantidad: 0, total: {}, porVendedor: [], top: [] }, async () => {
    const rows = sinError(await supabase.from('ordenes_venta')
      .select('id, numero, vendedor_id, monto_total, monto_neto, moneda, clientes(nombre, empresa), orden_items(soportes(categoria))')
      .in('estado', ESTADOS_VENTA_VIVA as unknown as string[])
      .gte('created_at', inicioDia(semana.desde)).lte('created_at', finDia(semana.hasta))) as any[]
    const netas = comoNeto(rows)
    const porV = new Map<string, any[]>()
    for (const r of netas) porV.set(r.vendedor_id ?? '', [...(porV.get(r.vendedor_id ?? '') ?? []), r])
    return {
      cantidad: netas.length,
      total: sumarPorMoneda(netas),
      porVendedor: Array.from(porV, ([id, rs]) => ({ nombre: vend(id || null), cantidad: rs.length, total: sumarPorMoneda(rs) }))
        .sort((a, b) => b.cantidad - a.cantidad || (b.total.UYU ?? 0) - (a.total.UYU ?? 0)),
      top: [...netas].sort((a, b) => b.monto_total - a.monto_total).slice(0, 5).map(r => {
        const formatos = Array.from(new Set((r.orden_items ?? []).map((i: any) => first<any>(i.soportes)?.categoria).filter(Boolean))) as string[]
        return { numero: r.numero ?? null, cliente: nombreCli(r.clientes), formato: formatos.join(' / ') || '—', monto: r.monto_total, moneda: r.moneda ?? 'UYU' }
      }),
    }
  })

  // ── Cuatrimestre vs objetivo (misma cuenta que el dashboard) ──
  const objetivos = await seccion<DatosResumenSemanal['objetivos']>('avance del cuatrimestre', { total: { vendido: 0, vendidoUSD: 0, objetivo: 0 }, porVendedor: [] }, async () => {
    const [vRes, oRes] = await Promise.all([
      supabase.from('ordenes_venta').select('vendedor_id, monto_total, monto_neto, moneda')
        .in('estado', ESTADOS_VENTA_VIVA as unknown as string[])
        .gte('created_at', inicioDia(cuat.start)).lte('created_at', finDia(cuat.end)),
      supabase.from('objetivos').select('vendedor_id, objetivo_monto').eq('cuatrimestre', cuat.label),
    ])
    const netas = comoNeto(sinError(vRes) as any[])
    const objs = sinError(oRes) as any[]
    const ids = new Set<string>(perfiles.filter(p => p.activo && p.rol === 'vendedor').map(p => p.id))
    for (const r of netas) if (r.vendedor_id) ids.add(r.vendedor_id)
    for (const o of objs) if (o.vendedor_id) ids.add(o.vendedor_id)
    const porVendedor = Array.from(ids).map(id => {
      const t = sumarPorMoneda(netas.filter(r => r.vendedor_id === id))
      const objetivo = objs.filter(o => o.vendedor_id === id).reduce((s, o) => s + Number(o.objetivo_monto ?? 0), 0)
      return { nombre: vend(id), vendido: t.UYU ?? 0, vendidoUSD: t.USD ?? 0, objetivo }
    }).sort((a, b) => b.vendido - a.vendido || a.nombre.localeCompare(b.nombre, 'es'))
    const t = sumarPorMoneda(netas)
    return { total: { vendido: t.UYU ?? 0, vendidoUSD: t.USD ?? 0, objetivo: objs.reduce((s, o) => s + Number(o.objetivo_monto ?? 0), 0) }, porVendedor }
  })

  // ── Propuestas ──
  // No hay fecha de envío en la base: se usa `updated_at`, que se mueve al
  // enviar, aceptar o rechazar (mismo criterio que el seguimiento del cron).
  const propuestas = await seccion<DatosResumenSemanal['propuestas']>('propuestas', { enviadas: 0, aceptadas: 0, sinRespuesta: [] }, async () => {
    const [eRes, aRes] = await Promise.all([
      supabase.from('propuestas').select('id, numero, vendedor_id, updated_at, clientes(nombre, empresa)').eq('estado', 'enviada'),
      supabase.from('propuestas').select('id', { count: 'exact', head: true }).eq('estado', 'aceptada')
        .gte('updated_at', inicioDia(semana.desde)).lte('updated_at', finDia(semana.hasta)),
    ])
    const enviadas = sinError(eRes) as any[]
    if (aRes.error) throw new Error(aRes.error.message)
    const ahora = Date.now()
    const dias = (p: any) => Math.floor((ahora - new Date(p.updated_at).getTime()) / 86400000)
    return {
      enviadas: enviadas.filter(p => p.updated_at >= inicioDia(semana.desde) && p.updated_at <= finDia(semana.hasta)).length,
      aceptadas: aRes.count ?? 0,
      sinRespuesta: enviadas.filter(p => dias(p) >= DIAS_SEGUIMIENTO_PROPUESTA)
        .map(p => ({ numero: p.numero ?? `#${String(p.id).slice(0, 6)}`, cliente: nombreCli(p.clientes), vendedor: vend(p.vendedor_id), dias: dias(p) }))
        .sort((a, b) => b.dias - a.dias),
    }
  })

  // ── Ocupación ──
  const ocupacion = await seccion<DatosResumenSemanal['ocupacion']>('ocupación', null, async () => {
    const { soportes, ocupaciones, error } = await cargarOcupaciones(supabase)
    if (error) throw new Error(error)
    const ym = hoy.slice(0, 7), a = rangoMes(ym), b = rangoMes(mesSiguiente(ym))
    return {
      mesActual: { etiqueta: a.etiqueta, formatos: ocupacionPorFormato(soportes, ocupaciones, a.desde, a.hasta) },
      mesSiguiente: { etiqueta: b.etiqueta, formatos: ocupacionPorFormato(soportes, ocupaciones, b.desde, b.hasta) },
      libres30: soportesLibres(soportes, ocupaciones, hoy, sumarDias(hoy, 30)),
      totalSoportes: soportes.length,
    }
  })

  // ── Cobranza ──
  const cobranza = await seccion<DatosResumenSemanal['cobranza']>('cobranza', { facturado: {}, cobrado: {}, deudaVencida: {}, facturasVencidas: 0 }, async () => {
    const base = () => supabase.from('facturas').select('importe_total, moneda').eq('tipo', 'factura')
    const [fRes, cRes, vRes] = await Promise.all([
      base().in('estado', ['emitida', 'cobrada']).gte('fecha_emision', semana.desde).lte('fecha_emision', semana.hasta),
      base().eq('estado', 'cobrada').gte('fecha_cobro', semana.desde).lte('fecha_cobro', semana.hasta),
      base().eq('estado', 'emitida').lt('fecha_vencimiento', hoy),
    ])
    const suma = (rows: any[]) => sumarPorMoneda(rows.map(r => ({ monto_total: r.importe_total, moneda: r.moneda })))
    const vencidas = sinError(vRes) as any[]
    return { facturado: suma(sinError(fRes)), cobrado: suma(sinError(cRes)), deudaVencida: suma(vencidas), facturasVencidas: vencidas.length }
  })

  // ── Alertas ──
  const renovaciones = await seccion<DatosResumenSemanal['alertas']['renovaciones']>('renovaciones', [], async () => {
    const rows = sinError(await supabase.from('tasks')
      .select('id, orden_id, ordenes_venta(numero, vendedor_id, fecha_baja_prevista, fecha_baja_real, clientes(nombre, empresa), orden_items(fecha_baja_prevista, fecha_baja_real))')
      .eq('tipo', TIPO_TAREA_RENOVACION).neq('estado', 'completada')) as any[]
    const limite = sumarDias(hoy, DIAS_AVISO_RENOVACION)
    return rows.map(t => ({ o: first<any>(t.ordenes_venta) })).filter(x => x.o)
      .map(({ o }) => ({ o, fin: finDeCampana(o) }))
      .filter(({ fin }) => fin && fin >= hoy && fin <= limite)
      .map(({ o, fin }) => ({ cliente: nombreCli(o.clientes), vendedor: vend(o.vendedor_id), fin: fin!, numero: o.numero ?? null }))
      .sort((a, b) => a.fin.localeCompare(b.fin))
  })
  const pendientesAprobacion = await seccion<DatosResumenSemanal['alertas']['pendientesAprobacion']>('ventas pendientes de aprobación', [], async () => {
    const rows = sinError(await supabase.from('ordenes_venta')
      .select('numero, vendedor_id, monto_total, monto_neto, moneda, clientes(nombre, empresa)')
      .eq('estado', 'pendiente_aprobacion')) as any[]
    return comoNeto(rows).map(r => ({ numero: r.numero ?? null, cliente: nombreCli(r.clientes), monto: r.monto_total, moneda: r.moneda ?? 'UYU', vendedor: vend(r.vendedor_id) }))
  })
  const gestionesVencidas = await seccion<DatosResumenSemanal['alertas']['gestionesVencidas']>('gestiones vencidas', [], async () => {
    const rows = sinError(await supabase.from('leads').select('vendedor_id')
      .in('estado', ESTADOS_LEAD_ABIERTO).lt('proxima_gestion', hoy)) as any[]
    const n = new Map<string, number>()
    for (const r of rows) n.set(r.vendedor_id ?? '', (n.get(r.vendedor_id ?? '') ?? 0) + 1)
    return Array.from(n, ([id, cantidad]) => ({ vendedor: vend(id || null), cantidad })).sort((a, b) => b.cantidad - a.cantidad)
  })

  return {
    hoy, semana,
    cuatrimestre: { label: cuat.label, displayLabel: cuat.displayLabel },
    ventas, objetivos, propuestas, ocupacion, cobranza,
    alertas: { renovaciones, pendientesAprobacion, gestionesVencidas },
    avisos,
  }
}

export interface Destinatario { id: string; nombre: string; rol: string; email: string }

/** Gerentes comerciales y administradores activos que tienen mail. */
export async function destinatariosResumenSemanal(supabase: SupabaseClient): Promise<Destinatario[]> {
  const { data: perfiles } = await supabase.from('perfiles').select('id, nombre, rol')
    .eq('activo', true).in('rol', ROLES_RESUMEN_SEMANAL as unknown as string[])
  const correos = await mailsDePerfiles(supabase)
  return ((perfiles ?? []) as any[]).filter(p => correos.get(p.id)).map(p => ({ id: p.id, nombre: p.nombre, rol: p.rol, email: correos.get(p.id)! }))
}

export type ResultadoEnvioSemanal =
  | { ok: boolean; dry: true; asunto: string; mailConfigurado: boolean; destinatarios: { nombre: string; rol: string; email: string }[] }
  | { ok: boolean; enviados: number; asunto?: string; destinatarios?: number; motivo?: string }

/**
 * Manda el resumen semanal. Sin SMTP configurado no hace nada y lo dice
 * (nunca rompe). Con `dry` sólo informa asunto y destinatarios.
 */
export async function enviarResumenSemanal(
  supabase: SupabaseClient, opts: { dry?: boolean; hoy?: string } = {},
): Promise<ResultadoEnvioSemanal> {
  const hoy = opts.hoy ?? hoyUY()
  const asunto = asuntoSemanal(semanaAnterior(hoy))
  const smtp = mailConfigurado()

  if (opts.dry) {
    const dest = await destinatariosResumenSemanal(supabase)
    return { ok: true, dry: true, asunto, mailConfigurado: smtp, destinatarios: dest.map(({ nombre, rol, email }) => ({ nombre, rol, email })) }
  }
  if (!smtp) return { ok: false, enviados: 0, motivo: 'Mail sin configurar: faltan SMTP_HOST, SMTP_USER y/o SMTP_PASS. No se mandó nada.' }

  const dest = await destinatariosResumenSemanal(supabase)
  if (!dest.length) return { ok: true, enviados: 0, asunto, destinatarios: 0, motivo: 'No hay gerentes comerciales ni administradores activos con mail.' }

  const datos = await cargarDatosResumenSemanal(supabase, hoy)
  const { html } = construirResumenSemanal(datos, BASE)
  let enviados = 0
  for (const d of dest) if (await enviarMail(d.email, asunto, html)) enviados++
  return { ok: enviados > 0, enviados, asunto, destinatarios: dest.length, ...(enviados < dest.length ? { motivo: 'Algunos mails no se pudieron enviar (ver logs).' } : {}) }
}
