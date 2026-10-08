import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Seguimiento de cobranza de una factura.
 *
 * Cuando la agencia dice qué día va a pagar, Belén lo anota y vuelve a mirar
 * ese día. Acá eso es una promesa de pago en la factura, una gestión que lo
 * deja escrito y una tarea de Administración para ese día, que aparece en
 * Tareas y en el Calendario. Cuando entra el cobro, la tarea se cierra sola.
 */

export const TIPO_TAREA_PAGO = 'admin_verificar_pago'

export const TIPOS_GESTION = ['llamada', 'email', 'whatsapp', 'visita', 'promesa_pago', 'otro'] as const

/** Atraso en días desde el vencimiento: positivo es vencida, negativo falta. */
export function diasDeAtraso(vencimiento: string | null, hoy: Date = new Date()): number | null {
  if (!vencimiento) return null
  const [y, m, d] = vencimiento.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  const base = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
  return Math.round((base.getTime() - new Date(y, m - 1, d).getTime()) / 86400000)
}

/** Tramo de atraso, como se lee la columna VTO de la planilla. */
export type Tramo = 'por_vencer' | '1_30' | '31_60' | '61_90' | 'mas_90'

export function tramoDe(atraso: number | null): Tramo {
  if (atraso == null || atraso <= 0) return 'por_vencer'
  if (atraso <= 30) return '1_30'
  if (atraso <= 60) return '31_60'
  if (atraso <= 90) return '61_90'
  return 'mas_90'
}

export const TRAMO_LABEL: Record<Tramo, string> = {
  por_vencer: 'Por vencer',
  '1_30': '1 a 30 días',
  '31_60': '31 a 60 días',
  '61_90': '61 a 90 días',
  mas_90: 'Más de 90',
}

/**
 * Anota (o mueve, o quita con `fecha = null`) la promesa de pago de una
 * factura emitida, con su gestión y su tarea de seguimiento.
 */
export async function registrarPromesa(
  supabase: SupabaseClient,
  facturaId: string,
  fecha: string | null,
  opts: { userId: string; nota?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const { data: f, error } = await supabase
    .from('facturas')
    .select('id, orden_id, numero, estado, ordenes_venta(clientes(nombre, empresa))')
    .eq('id', facturaId)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!f) return { ok: false, error: 'Factura no encontrada' }
  if (f.estado !== 'emitida') return { ok: false, error: 'La promesa de pago es para una factura emitida y no cobrada' }

  const { error: uErr } = await supabase
    .from('facturas')
    .update({ fecha_pago_prometida: fecha, updated_at: new Date().toISOString() })
    .eq('id', facturaId)
  if (uErr) return { ok: false, error: uErr.message }

  // Que quede escrito, como el comentario de la planilla.
  await supabase.from('gestiones_cobranza').insert({
    orden_id: f.orden_id,
    factura_id: facturaId,
    tipo: 'promesa_pago',
    nota: opts.nota?.trim() || (fecha ? null : 'Se quitó la promesa de pago'),
    proxima_accion: fecha,
    registrado_por: opts.userId,
  })

  if (!fecha) {
    await cerrarSeguimiento(supabase, facturaId)
    return { ok: true }
  }

  const orden = Array.isArray(f.ordenes_venta) ? f.ordenes_venta[0] : f.ordenes_venta
  const cli = (Array.isArray((orden as any)?.clientes) ? (orden as any).clientes[0] : (orden as any)?.clientes) as
    { nombre?: string | null; empresa?: string | null } | null
  const cliente = cli?.empresa ?? cli?.nombre ?? 'cliente'
  const descripcion = `Verificar pago de ${cliente}${f.numero ? `, factura ${f.numero}` : ''}`

  // Una sola tarea abierta por factura: si la fecha cambia, se mueve.
  const { data: abierta } = await supabase
    .from('tasks')
    .select('id')
    .eq('factura_id', facturaId)
    .eq('tipo', TIPO_TAREA_PAGO)
    .neq('estado', 'completada')
    .limit(1)
  if (abierta?.length) {
    const { error: tErr } = await supabase
      .from('tasks')
      .update({ fecha_limite: fecha, descripcion })
      .eq('id', abierta[0].id)
    if (tErr) return { ok: false, error: tErr.message }
  } else {
    const { error: tErr } = await supabase.from('tasks').insert({
      tipo: TIPO_TAREA_PAGO,
      asignado_a_rol: 'administracion',
      orden_id: f.orden_id,
      factura_id: facturaId,
      descripcion,
      fecha_limite: fecha,
    })
    if (tErr) return { ok: false, error: tErr.message }
  }
  return { ok: true }
}

/** Cierra la tarea de seguimiento de pago de la factura, si hay una abierta. */
export async function cerrarSeguimiento(supabase: SupabaseClient, facturaId: string) {
  await supabase
    .from('tasks')
    .update({ estado: 'completada', completed_at: new Date().toISOString() })
    .eq('factura_id', facturaId)
    .eq('tipo', TIPO_TAREA_PAGO)
    .neq('estado', 'completada')
}
