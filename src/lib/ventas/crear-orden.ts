import type { SupabaseClient } from '@supabase/supabase-js'
import { armarPlanDeFacturas, CONDICION_PAGO_POR_DEFECTO } from './facturas'
import { insertarNotificaciones } from '@/lib/notificaciones'

/**
 * Creación de la OIC a partir de una cotización aceptada.
 *
 * Vive acá y no dentro del route porque se usa en dos lados: al aceptar la
 * cotización (el camino normal, todo en un paso) y desde el botón de respaldo
 * para cotizaciones que quedaron aceptadas sin OIC.
 */

/** Mapeo de tipo_cotizador → qué necesita el ítem antes de salir al aire. */
export function flagsPorTipo(tipo: string | null): { requiere_grabado: boolean; requiere_produccion: boolean } {
  if (!tipo) return { requiere_grabado: false, requiere_produccion: false }
  const digital = ['led', 'circuito'].includes(tipo)
  const impreso = ['estatico_bus', 'estatico_shopping', 'medianera', 'rutero', 'banner_shopping'].includes(tipo)
  return { requiere_grabado: digital, requiere_produccion: impreso }
}

/**
 * Hasta cuándo sale un ítem: el fin de la campaña, salvo que el ítem tenga más
 * semanas (un banner con mínimo de 13 en una campaña de 4). Sin esto, la
 * línea quedaba con la baja de la campaña y la disponibilidad liberaba el
 * espacio antes de tiempo.
 */
function bajaDelItem(inicio: string | null, fin: string | null, semanas: number): string | null {
  if (!inicio) return fin
  const d = new Date(inicio + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + semanas * 7 - 1)
  const porSemanas = d.toISOString().slice(0, 10)
  return !fin || porSemanas > fin ? porSemanas : fin
}

export type ResultadoCrearOrden = {
  ok: boolean
  ordenId?: string
  numero?: number
  error?: string
  /** Código para que el route elija el status HTTP. */
  motivo?: 'no_encontrada' | 'no_aceptada' | 'ya_existe' | 'error'
}

/**
 * La OIC nace lista para que la apruebe el gerente: aprobar la venta es un solo
 * hecho, no hace falta un paso intermedio de "mandar a aprobación".
 */
const ESTADO_INICIAL = 'pendiente_aprobacion'

export async function crearOrdenDesdePropuesta(
  supabase: SupabaseClient,
  propuestaId: string,
  userId: string,
): Promise<ResultadoCrearOrden> {
  const { data: propuesta } = await supabase
    .from('propuestas')
    .select('*, propuesta_items(*)')
    .eq('id', propuestaId)
    .single()

  if (!propuesta) return { ok: false, error: 'Cotización no encontrada', motivo: 'no_encontrada' }
  if (propuesta.estado !== 'aceptada') {
    return { ok: false, error: 'La cotización debe estar aceptada por el cliente primero', motivo: 'no_aceptada' }
  }

  // Evitar duplicar OIC si ya existe una desde esta cotización
  const { data: existing } = await supabase
    .from('ordenes_venta')
    .select('id, numero')
    .eq('propuesta_id', propuestaId)
    .maybeSingle()
  if (existing) {
    return { ok: false, error: 'Ya hay una orden creada desde esta cotización', motivo: 'ya_existe', ordenId: existing.id }
  }

  // Condición de pago: la pactada en la cotización; si no, la recomendada de
  // la agencia; si no, la habitual.
  let condicionPagoDias: number = propuesta.condicion_pago_dias ?? CONDICION_PAGO_POR_DEFECTO
  if (propuesta.condicion_pago_dias == null && propuesta.agencia_id) {
    const { data: ag } = await supabase.from('agencias').select('condicion_pago_dias').eq('id', propuesta.agencia_id).maybeSingle()
    if (ag?.condicion_pago_dias != null) condicionPagoDias = ag.condicion_pago_dias
  }

  const itemsCot = (propuesta.propuesta_items ?? []) as any[]
  const inicio: string | null = propuesta.fecha_inicio ?? null
  const bajas = itemsCot.map(it => bajaDelItem(inicio, propuesta.fecha_fin ?? null, it.semanas ?? 1))
  // La venta termina cuando termina su último ítem.
  const bajaVenta = bajas.reduce<string | null>((max, b) => (b && (!max || b > max) ? b : max), propuesta.fecha_fin ?? null)

  const { data: orden, error: ordenErr } = await supabase
    .from('ordenes_venta')
    .insert({
      propuesta_id:         propuesta.id,
      lead_id:              propuesta.lead_id ?? null,
      cliente_id:           propuesta.cliente_id,
      // La agencia viene del lead, pasa por la cotización y llega acá, que es
      // donde se liquidan sus comisiones.
      agencia_id:           propuesta.agencia_id ?? null,
      // Marca y campaña hacen el mismo recorrido: se cargan una vez arriba y
      // llegan hasta el comprobante sin que nadie las vuelva a tipear.
      marca:                propuesta.marca ?? null,
      campana:              propuesta.campana ?? null,
      vendedor_id:          propuesta.vendedor_id ?? userId,
      // El número lo pone la base (el mismo contador que usa la venta cargada
      // a mano). Antes se pedía a una función `nextval` que no existe y caía
      // en max+1, que corre aparte del contador: una venta desde cotización
      // y una manual podían salir con el mismo número.
      estado:               ESTADO_INICIAL,
      moneda:               propuesta.moneda ?? 'UYU',
      monto_total:          propuesta.monto_total ?? null,
      // La comisión sale del neto, no del total facturado: si no, el mismo
      // negocio comisionaba distinto según si la venta vino de una cotización
      // (con IVA) o se cargó a mano (sin IVA).
      monto_neto:           propuesta.monto_neto ?? propuesta.monto_total ?? null,
      monto_arrendamiento:  propuesta.monto_arrendamiento ?? propuesta.monto_neto ?? propuesta.monto_total ?? null,
      monto_produccion:     propuesta.monto_produccion ?? 0,
      // La comisión de agencia pactada viaja de la cotización a la venta.
      comision_agencia_pct:      propuesta.comision_agencia_pct ?? null,
      comision_agencia_prod_pct: propuesta.comision_agencia_prod_pct ?? null,
      condicion_pago_dias:  condicionPagoDias,
      // Banderas de la venta según lo que lleva: arte y operaciones las usan
      // para saber si hay material digital o impresión (quedaban en false).
      tiene_digital:        (itemsCot as any[]).some(it => flagsPorTipo(it.tipo_cotizador).requiere_grabado),
      tiene_produccion:     (itemsCot as any[]).some(it => flagsPorTipo(it.tipo_cotizador).requiere_produccion) || Number(propuesta.monto_produccion ?? 0) > 0,
      fecha_alta_prevista:  inicio,
      fecha_baja_prevista:  bajaVenta,
      // Provenance: la OIC ya queda vinculada a la cotización por propuesta_id.
      // (ordenes_venta no tiene columna `notas`; usamos detalles_texto para la nota.)
      detalles_texto:       `Generada desde cotización ${propuesta.numero ?? ''}`.trim(),
    })
    .select('id, numero')
    .single()

  if (ordenErr || !orden) {
    return { ok: false, error: ordenErr?.message ?? 'No se pudo crear la orden', motivo: 'error' }
  }

  // Items: copiar de propuesta_items → orden_items con fechas por ítem
  const items = itemsCot
  if (items.length > 0) {
    const itemRows = items.map((it: any, i: number) => ({
      orden_id:             orden.id,
      soporte_id:           it.soporte_id ?? null,
      cantidad:             it.cantidad_soportes ?? it.cantidad ?? 1,
      semanas:              it.semanas ?? 1,
      salidas:              it.salidas_elegidas ?? null,
      precio_unitario:      it.precio_unitario ?? 0,
      descuento_pct:        0,
      nota:                 null,
      fecha_alta_prevista:  inicio,
      fecha_baja_prevista:  bajas[i],
      ...flagsPorTipo(it.tipo_cotizador),
    }))
    const { error: itemsErr } = await supabase.from('orden_items').insert(itemRows)
    if (itemsErr) {
      await supabase.from('ordenes_venta').delete().eq('id', orden.id)
      return { ok: false, error: 'Error al copiar items: ' + itemsErr.message, motivo: 'error' }
    }
  }

  // El plan de facturación: las cuotas que pactó el vendedor, una por mes
  // desde el alta. Si algo falla acá la venta queda igual —el plan se puede
  // rearmar desde la pantalla—, pero se avisa.
  const plan = await armarPlanDeFacturas(supabase, orden.id, propuesta.cuotas ?? 1)
  if (!plan.ok) console.error(`No se pudo armar el plan de facturas de la OIC ${orden.numero}:`, plan.error)

  // Lead ganado: la venta se concreta al existir la OIC.
  if (propuesta.lead_id) {
    await supabase
      .from('leads')
      .update({ estado: 'ganado', updated_at: new Date().toISOString() })
      .eq('id', propuesta.lead_id)
  }

  await supabase.from('orden_historial').insert({
    orden_id:     orden.id,
    perfil_id:    userId,
    estado_nuevo: ESTADO_INICIAL,
    comentario:   `Creada desde cotización ${propuesta.numero ?? ''}`.trim(),
  })

  // Vincular la reserva de esta cotización con la OIC, para que el estado de la
  // venta pueda arrastrar el de la reserva. Best-effort a propósito: si la
  // migración v26 todavía no corrió, la venta no debe romperse por esto.
  await vincularReserva(supabase, propuestaId, orden.id)

  await notificarOicPendiente(supabase, orden.id)

  return { ok: true, ordenId: orden.id, numero: orden.numero }
}

/**
 * Deja la reserva de la cotización apuntando a la OIC.
 *
 * Se intenta primero por `propuesta_id` (el vínculo correcto, agregado en v26) y
 * si esa columna no existe todavía se cae a buscar por el lead. Cualquier error
 * se ignora: es un enlace de conveniencia, no parte del alta de la venta.
 */
export async function vincularReserva(supabase: SupabaseClient, propuestaId: string, ordenId: string) {
  try {
    const { error } = await supabase
      .from('reservas')
      .update({ orden_id: ordenId })
      .eq('propuesta_id', propuestaId)
      .is('orden_id', null)
    if (!error) return

    // Respaldo: v26 sin aplicar → ubicar la reserva por el lead de la cotización.
    const { data: propuesta } = await supabase
      .from('propuestas')
      .select('lead_id')
      .eq('id', propuestaId)
      .maybeSingle()
    if (!propuesta?.lead_id) return
    await supabase
      .from('reservas')
      .update({ orden_id: ordenId })
      .eq('lead_id', propuesta.lead_id)
      .is('orden_id', null)
  } catch {
    /* enlace opcional: nunca debe tumbar la creación de la venta */
  }
}

/** Avisa a los gerentes que hay una OIC esperando su aprobación. */
export async function notificarOicPendiente(supabase: SupabaseClient, ordenId: string) {
  const [{ data: orden }, { data: gerentes }] = await Promise.all([
    supabase.from('ordenes_venta').select('numero, clientes(nombre, empresa)').eq('id', ordenId).maybeSingle(),
    supabase.from('perfiles').select('id').eq('rol', 'gerente_comercial'),
  ])
  if (!orden || !gerentes?.length) return

  const cli: any = Array.isArray(orden.clientes) ? orden.clientes[0] : orden.clientes
  const clienteNombre = cli?.empresa ?? cli?.nombre ?? 'cliente'
  await insertarNotificaciones(supabase, 
    gerentes.map((g: { id: string }) => ({
      user_id:   g.id,
      tipo:      'orden_pendiente',
      titulo:    'OIC esperando tu aprobación',
      mensaje:   `OIC #${orden.numero} · ${clienteNombre}`,
      link:      `/dashboard/ventas/${ordenId}`,
      entity_id: ordenId,
    }))
  )
}
