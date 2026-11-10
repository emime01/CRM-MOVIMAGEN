import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Comisión de la agencia de una factura: se registra cuando la cuota se marca
 * facturada (antes se calculaba recién al cobrar). Sale de lo pactado en la
 * venta: % sobre el arrendamiento sin IVA y % sobre la producción sin IVA.
 * Las notas de crédito restan (comisión negativa).
 *
 * Sin la migración v49 (tabla comisiones_agencia) no hace nada.
 */
export async function registrarComisionAgencia(supabase: SupabaseClient, facturaId: string): Promise<void> {
  const { data: f } = await supabase
    .from('facturas')
    .select('id, orden_id, tipo, moneda, importe_arrendamiento, importe_produccion, ordenes_venta(agencia_id, comision_agencia_pct, comision_agencia_prod_pct)')
    .eq('id', facturaId).maybeSingle()
  if (!f) return
  const o: any = Array.isArray(f.ordenes_venta) ? f.ordenes_venta[0] : f.ordenes_venta
  if (!o?.agencia_id) return
  const pctArr = Number(o.comision_agencia_pct ?? 0), pctProd = Number(o.comision_agencia_prod_pct ?? 0)
  const arr = Number(f.importe_arrendamiento ?? 0), prod = Number(f.importe_produccion ?? 0)
  const monto = Math.round((arr * pctArr + prod * pctProd)) / 100
  if (!monto) return
  await supabase.from('comisiones_agencia').upsert({
    factura_id: f.id, orden_id: f.orden_id, agencia_id: o.agencia_id,
    base_arr: arr, base_prod: prod, pct_arr: pctArr, pct_prod: pctProd, monto,
    moneda: f.moneda ?? 'UYU', updated_at: new Date().toISOString(),
  }, { onConflict: 'factura_id', ignoreDuplicates: false })
}

/** La comisión de la agencia de una factura, si hay (para el cobro). */
export async function comisionAgenciaDe(supabase: SupabaseClient, facturaId: string): Promise<{ id: string; monto: number; estado: string } | null> {
  const { data, error } = await supabase.from('comisiones_agencia').select('id, monto, estado').eq('factura_id', facturaId).maybeSingle()
  if (error || !data) return null
  return { id: data.id, monto: Number(data.monto), estado: data.estado }
}
