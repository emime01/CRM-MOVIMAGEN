import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Recalcula la tabla `objetivos` (total por vendedor y cuatrimestre) sumando
 * los objetivos por cliente de `cliente_objetivos`.
 *
 * Vive acá porque se dispara desde dos lados: la importación del Excel y el
 * reasignar clientes a un vendedor. Antes sólo corría al importar, así que
 * cambiar el dueño de un cliente dejaba los totales viejos para siempre.
 *
 * El objetivo de un vendedor es la suma de los objetivos de sus clientes, así
 * que un cliente sin dueño no suma para nadie: ese es el caso que dejaba todo
 * en cero sin avisar.
 */
export async function recalcularObjetivos(
  supabase: SupabaseClient,
  year: number,
): Promise<{ vendedores: number; cuatrimestres: number; sinVendedor: number }> {
  const { data: filas } = await supabase
    .from('cliente_objetivos')
    .select('vendedor_id, objetivo_c1, objetivo_c2, objetivo_c3')
    .eq('year', year)

  const sinVendedor = (filas ?? []).filter(f => !f.vendedor_id).length

  // Sumar por vendedor y cuatrimestre
  const totales: Record<string, Record<string, number>> = {}
  for (const f of filas ?? []) {
    if (!f.vendedor_id) continue
    const porQ = (totales[f.vendedor_id] ??= {})
    porQ[`Q1-${year}`] = (porQ[`Q1-${year}`] ?? 0) + Number(f.objetivo_c1 ?? 0)
    porQ[`Q2-${year}`] = (porQ[`Q2-${year}`] ?? 0) + Number(f.objetivo_c2 ?? 0)
    porQ[`Q3-${year}`] = (porQ[`Q3-${year}`] ?? 0) + Number(f.objetivo_c3 ?? 0)
  }

  const cuatrimestres = [`Q1-${year}`, `Q2-${year}`, `Q3-${year}`]

  // Los objetivos escritos a mano no los maneja esta función. Antes se
  // borraban junto con el resto y el vendedor quedaba sin objetivo de un día
  // para el otro, sin que nadie tocara el suyo.
  const { data: manuales } = await supabase
    .from('objetivos')
    .select('vendedor_id, cuatrimestre')
    .in('cuatrimestre', cuatrimestres)
    .eq('origen', 'manual')

  const esManual = new Set((manuales ?? []).map(m => `${m.vendedor_id}|${m.cuatrimestre}`))

  // Se reescribe el año entero salvo los manuales: si un vendedor se quedó sin
  // clientes, su objetivo tiene que desaparecer, no quedar con el total
  // anterior.
  await supabase.from('objetivos').delete().in('cuatrimestre', cuatrimestres).eq('origen', 'planilla')

  const aInsertar: { vendedor_id: string; cuatrimestre: string; objetivo_monto: number; origen: string }[] = []
  for (const [vendedorId, porQ] of Object.entries(totales)) {
    for (const [cuatrimestre, monto] of Object.entries(porQ)) {
      // El objetivo escrito a mano gana sobre la suma de la planilla: quien lo
      // escribió sabe algo que la planilla no dice.
      if (esManual.has(`${vendedorId}|${cuatrimestre}`)) continue
      if (monto > 0) aInsertar.push({ vendedor_id: vendedorId, cuatrimestre, objetivo_monto: monto, origen: 'planilla' })
    }
  }
  if (aInsertar.length > 0) {
    await supabase.from('objetivos').insert(aInsertar)
  }

  return { vendedores: Object.keys(totales).length, cuatrimestres: aInsertar.length, sinVendedor }
}
