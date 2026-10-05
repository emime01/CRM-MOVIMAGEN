import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Registro del cobro de una venta: deja la fecha, crea el pago y genera la
 * comisión del vendedor.
 *
 * Vive acá porque antes estaba dentro del cambio de estado de la OIC, que
 * ataba el cobro al carril de producción. El cobro es administrativo y corre
 * en paralelo: no cambia en qué anda la campaña.
 *
 * Idempotente: si la venta ya tiene comisión, no se duplica.
 */
export async function registrarCobro(
  supabase: SupabaseClient,
  ordenId: string,
  opts: { fecha?: string; metodo?: string; userId: string },
): Promise<{ ok: boolean; error?: string; comisionGenerada: boolean }> {
  const hoy = new Date().toISOString().slice(0, 10)
  const fechaCobro = opts.fecha || hoy

  const { error: updErr } = await supabase
    .from('ordenes_venta')
    .update({ fecha_cobro: fechaCobro, updated_at: new Date().toISOString() })
    .eq('id', ordenId)
  if (updErr) return { ok: false, error: updErr.message, comisionGenerada: false }

  // Si ya hay comisión para esta venta no se vuelve a generar.
  const { data: ya } = await supabase.from('comisiones').select('id').eq('orden_id', ordenId).maybeSingle()
  if (ya) return { ok: true, comisionGenerada: false }

  const { data: orden } = await supabase
    .from('ordenes_venta')
    .select('vendedor_id, monto_total, factura_numero')
    .eq('id', ordenId)
    .maybeSingle()
  if (!orden?.vendedor_id || !orden.monto_total) return { ok: true, comisionGenerada: false }

  const { data: vendedor } = await supabase
    .from('perfiles')
    .select('porcentaje_comision')
    .eq('id', orden.vendedor_id)
    .maybeSingle()

  const monto = Number(orden.monto_total)
  const pct = Number(vendedor?.porcentaje_comision ?? 6)
  const montoComision = Math.round(monto * pct) / 100

  const { data: pago } = await supabase
    .from('pagos')
    .insert({
      orden_id: ordenId,
      monto,
      fecha_pago: fechaCobro,
      numero_factura: orden.factura_numero ?? null,
      metodo: opts.metodo ?? null,
    })
    .select('id')
    .single()

  const { error: comErr } = await supabase.from('comisiones').insert({
    pago_id:        pago?.id ?? null,
    vendedor_id:    orden.vendedor_id,
    orden_id:       ordenId,
    monto_base:     monto,
    porcentaje:     pct,
    monto_comision: montoComision,
    estado:         'pendiente',
  })

  return { ok: true, comisionGenerada: !comErr }
}
