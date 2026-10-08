import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Lo que se le liquida al vendedor sobre el arrendamiento sin IVA. Es el
 * porcentaje de la planilla de comisiones de Administración; se usa cuando el
 * perfil del vendedor no tiene uno propio cargado.
 */
export const PORCENTAJE_COMISION_VENDEDOR = 6.75

/**
 * Registro del cobro de UNA factura: la marca cobrada, crea el pago y genera
 * la comisión del vendedor sobre el arrendamiento de esa factura.
 *
 * Antes el cobro era de la venta entera. Con cuotas, cada factura se cobra por
 * su lado y cada cobro genera su comisión: es lo que hace la planilla, que
 * liquida comisión por número de factura.
 *
 * El cobro es administrativo y corre en paralelo a la producción: no cambia
 * en qué anda la campaña. Las fechas de cobro de la venta las actualiza un
 * trigger de la base a partir de sus facturas.
 *
 * Idempotente: la comisión es una por factura (índice único en la base), y si
 * ya existe no se vuelve a generar.
 */
export async function registrarCobroDeFactura(
  supabase: SupabaseClient,
  facturaId: string,
  opts: { fecha?: string; metodo?: string; userId: string },
): Promise<{ ok: boolean; error?: string; comisionGenerada: boolean }> {
  const hoy = new Date().toISOString().slice(0, 10)
  const fechaCobro = opts.fecha || hoy

  const { data: factura, error: fErr } = await supabase
    .from('facturas')
    .select('id, orden_id, tipo, estado, numero, importe_total, importe_arrendamiento')
    .eq('id', facturaId)
    .maybeSingle()
  if (fErr) return { ok: false, error: fErr.message, comisionGenerada: false }
  if (!factura) return { ok: false, error: 'Factura no encontrada', comisionGenerada: false }
  if (factura.estado !== 'emitida') {
    return { ok: false, error: 'Sólo se puede cobrar una factura emitida y todavía no cobrada', comisionGenerada: false }
  }

  const { data: cobradas, error: updErr } = await supabase
    .from('facturas')
    .update({
      estado: 'cobrada',
      fecha_cobro: fechaCobro,
      metodo_cobro: opts.metodo ?? null,
      cobrada_por: opts.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', facturaId)
    .eq('estado', 'emitida') // CAS: un doble clic no cobra dos veces
    .select('id')
  if (updErr) return { ok: false, error: updErr.message, comisionGenerada: false }
  // Si otro pedido la cobró entre la lectura y acá, no se duplica el pago.
  if (!cobradas?.length) return { ok: false, error: 'La factura ya se había cobrado', comisionGenerada: false }

  const { data: pago } = await supabase
    .from('pagos')
    .insert({
      orden_id: factura.orden_id,
      monto: Number(factura.importe_total),
      fecha_pago: fechaCobro,
      numero_factura: factura.numero ?? null,
      metodo: opts.metodo ?? null,
    })
    .select('id')
    .single()

  // Las notas de crédito no generan comisión por sí solas.
  if (factura.tipo !== 'factura') return { ok: true, comisionGenerada: false }

  // Con `maybeSingle()` dos filas devuelven error y `data` en null, así que
  // un chequeo anti-duplicados así se rompe justo cuando ya hay duplicado.
  const { data: ya } = await supabase.from('comisiones').select('id').eq('factura_id', facturaId).limit(1)
  if (ya?.length) return { ok: true, comisionGenerada: false }

  const { data: orden } = await supabase
    .from('ordenes_venta')
    .select('vendedor_id')
    .eq('id', factura.orden_id)
    .maybeSingle()
  if (!orden?.vendedor_id) return { ok: true, comisionGenerada: false }

  const { data: vendedor } = await supabase
    .from('perfiles')
    .select('porcentaje_comision')
    .eq('id', orden.vendedor_id)
    .maybeSingle()

  // Base de la comisión: el arrendamiento sin IVA de esta factura. La
  // producción no comisiona —en la planilla, una venta que es toda producción
  // tiene la comisión en blanco— y el IVA tampoco.
  const base = Number(factura.importe_arrendamiento ?? 0)
  if (base <= 0) return { ok: true, comisionGenerada: false }
  const pct = Number(vendedor?.porcentaje_comision ?? PORCENTAJE_COMISION_VENDEDOR)
  const montoComision = Math.round(base * pct) / 100

  const { error: comErr } = await supabase.from('comisiones').insert({
    pago_id:        pago?.id ?? null,
    vendedor_id:    orden.vendedor_id,
    orden_id:       factura.orden_id,
    factura_id:     facturaId,
    monto_base:     base,
    porcentaje:     pct,
    monto_comision: montoComision,
    estado:         'pendiente',
  })

  return { ok: true, comisionGenerada: !comErr }
}
