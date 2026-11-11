import type { SupabaseClient } from '@supabase/supabase-js'
import { ESTADOS_VENTA_VIVA } from '@/lib/ventas/asignar-buses'
import { cotizacionDolar } from '@/lib/bcu'
import { hoyUY } from '@/lib/fechas'

/**
 * Canon de shoppings por mes, como el "Informe mensual de canon".
 *
 * Se liquida en el mes en que sale la pauta: cada cuota de una venta tiene su
 * mes (`facturas.mes_pauta`), así que una venta en seis cuotas paga canon seis
 * meses, cada uno por su cuota. Por línea:
 *
 *   arrendamiento sin IVA de la cuota, en la parte que corresponde a los
 *   soportes del shopping  ×  (1 − % de la agencia)  ×  % de canon
 *
 * La producción no entra. Un circuito está en varios shoppings y su parte se
 * reparte entre ellos según el peso (por defecto, partes iguales). Las notas
 * de crédito restan. Por shopping se paga el mayor entre el canon variable y
 * el mínimo, más lo que vino del mes anterior y menos lo que se pasa al
 * siguiente.
 *
 * Todo en pesos: lo facturado en dólares se pasa con la cotización de la
 * factura (la que se eligió al marcarla facturada); si todavía no se facturó,
 * con la del BCU de hoy, como provisoria.
 *
 * Una venta puede tener su propio plan de canon (canon_planes): el canon de
 * toda la venta se le paga al shopping en N cuotas iguales desde un mes dado,
 * en vez de cuota por cuota según la facturación.
 */

export const IVA = 0.22

export type ShoppingCanon = { id: string; nombre: string; porcentaje_canon: number; canon_minimo: number }
export type Asignacion = { soporte_id: string; shopping_id: string; peso: number }
export type ItemVenta = {
  orden_id: string; soporte_id: string | null; soporte?: string | null
  cantidad: number | null; semanas: number | null; precio_unitario: number | null; descuento_pct: number | null
}
export type FacturaCanon = {
  id: string; orden_id: string; numero: string | null; tipo: string; estado: string
  cuota: number; cuotas_total: number; importe_arrendamiento: number; moneda: string
  orden_numero: number | null; cliente: string; agencia: string | null; marca: string | null
  /** % de comisión de la agencia pactado en la venta (o el recomendado, si es vieja). */
  pct_agencia: number
  /** Pesos por dólar (sólo USD). */
  cotizacion?: number | null
  /** La cotización no es la de la factura sino la del día (todavía sin facturar). */
  cotizacion_provisoria?: boolean
}

export type LineaCanon = {
  factura_id: string; orden_id: string; orden_numero: number | null; numero: string | null; tipo: string
  cuota: number; cuotas_total: number; cliente: string; agencia: string | null; marca: string | null
  soportes: string[]; moneda: string
  /** Arrendamiento sin IVA de la cuota que le toca a este shopping. */
  arrendamiento: number
  pct_agencia: number
  neto_agencia: number
  pct_canon: number
  canon: number
  /** Si es un circuito, en cuántas partes se repartió. */
  reparto: number | null
  /** Facturado en dólares: lo original y la cotización usada. */
  usd?: number | null
  cotizacion?: number | null
  cotizacion_provisoria?: boolean
  /** Viene de un plan de cuotas de canon de la venta ("cuota k de n del canon"). */
  plan?: { cuota: number; cuotas: number; primer_mes: string } | null
}

export type ResumenShopping = {
  shopping: ShoppingCanon
  lineas: LineaCanon[]
  variable: number      // en pesos
  variable_usd: number  // lo vendido en dólares, aparte
}

const r2 = (n: number) => Math.round(n * 100) / 100

const valorItem = (it: ItemVenta) =>
  Number(it.precio_unitario ?? 0) * Number(it.cantidad ?? 1) * Number(it.semanas ?? 1) * (1 - Number(it.descuento_pct ?? 0) / 100)

/** El cálculo, sin base de datos: recibe todo armado y devuelve cada shopping. */
export function calcularCanon(
  shoppings: ShoppingCanon[],
  asignaciones: Asignacion[],
  facturas: FacturaCanon[],
  items: ItemVenta[],
): ResumenShopping[] {
  const porSoporte = new Map<string, Asignacion[]>()
  for (const a of asignaciones) {
    const l = porSoporte.get(a.soporte_id) ?? []
    l.push(a)
    porSoporte.set(a.soporte_id, l)
  }
  const itemsPorOrden = new Map<string, ItemVenta[]>()
  for (const it of items) {
    const l = itemsPorOrden.get(it.orden_id) ?? []
    l.push(it)
    itemsPorOrden.set(it.orden_id, l)
  }
  const pctCanon = new Map(shoppings.map(s => [s.id, Number(s.porcentaje_canon ?? 0)]))
  const lineas = new Map<string, LineaCanon[]>(shoppings.map(s => [s.id, []]))

  for (const f of facturas) {
    if (f.estado === 'anulada') continue
    const its = itemsPorOrden.get(f.orden_id) ?? []
    const total = its.reduce((s, it) => s + valorItem(it), 0)
    if (total <= 0) continue

    // Lo de cada shopping en esta factura, juntando los ítems.
    const acum = new Map<string, { arr: number; soportes: Set<string>; reparto: number | null }>()
    for (const it of its) {
      if (!it.soporte_id) continue
      const asig = porSoporte.get(it.soporte_id)
      if (!asig?.length) continue
      // En pesos: lo facturado en dólares, por su cotización.
      const enPesos = Number(f.importe_arrendamiento ?? 0) * (f.moneda === 'USD' ? Number(f.cotizacion ?? 0) : 1)
      const parteItem = enPesos * valorItem(it) / total
      const pesoTotal = asig.reduce((s, a) => s + Number(a.peso || 1), 0)
      for (const a of asig) {
        if (!lineas.has(a.shopping_id)) continue
        const x = acum.get(a.shopping_id) ?? { arr: 0, soportes: new Set<string>(), reparto: null }
        x.arr += parteItem * Number(a.peso || 1) / pesoTotal
        if (it.soporte) x.soportes.add(it.soporte)
        if (asig.length > 1) x.reparto = asig.length
        acum.set(a.shopping_id, x)
      }
    }

    for (const [shoppingId, x] of Array.from(acum)) {
      const arr = r2(x.arr)
      const neto = r2(arr * (1 - f.pct_agencia / 100))
      const pct = pctCanon.get(shoppingId) ?? 0
      lineas.get(shoppingId)!.push({
        factura_id: f.id, orden_id: f.orden_id, orden_numero: f.orden_numero, numero: f.numero, tipo: f.tipo,
        cuota: f.cuota, cuotas_total: f.cuotas_total, cliente: f.cliente, agencia: f.agencia, marca: f.marca,
        soportes: Array.from(x.soportes), moneda: 'UYU',
        arrendamiento: arr, pct_agencia: f.pct_agencia, neto_agencia: neto, pct_canon: pct,
        canon: r2(neto * pct / 100), reparto: x.reparto,
        usd: f.moneda === 'USD' && f.cotizacion ? r2(x.arr / Number(f.cotizacion)) : null,
        cotizacion: f.moneda === 'USD' ? Number(f.cotizacion ?? 0) : null,
        cotizacion_provisoria: f.moneda === 'USD' ? !!f.cotizacion_provisoria : false,
      })
    }
  }

  return shoppings.map(s => {
    const ls = (lineas.get(s.id) ?? []).sort((a, b) => a.cliente.localeCompare(b.cliente))
    return {
      shopping: s,
      lineas: ls,
      // Todo en pesos (lo de dólares ya viene convertido).
      variable: r2(ls.reduce((t, l) => t + l.canon, 0)),
      variable_usd: 0,
    }
  })
}

/** Lo que se paga en el mes: el mayor entre variable y mínimo, más arrastre, menos lo diferido. */
export function aPagar(variable: number, minimo: number, arrastre: number, diferido: number): number {
  return r2(Math.max(variable, minimo) + arrastre - diferido)
}

/** Primer día del mes anterior a "AAAA-MM-01". */
export function mesAnterior(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 2, 1))
  return d.toISOString().slice(0, 10)
}

const mesesEntre = (desde01: string, hasta01: string) => {
  const [y1, m1] = desde01.split('-').map(Number), [y2, m2] = hasta01.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1)
}

const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : v ?? null)

const SELECT_FACTURAS = `
  id, orden_id, numero, tipo, estado, cuota, cuotas_total, importe_arrendamiento, moneda, cotizacion,
  ordenes_venta(numero, estado, marca, comision_agencia_pct,
    clientes(nombre, empresa), agencias(nombre, porcentaje_comision))
`

/** Facturas de la base → FacturaCanon (sólo de ventas aprobadas). */
function aFacturasCanon(filas: any[], cotizHoy: number | null): FacturaCanon[] {
  const vivas = new Set<string>(ESTADOS_VENTA_VIVA)
  const out: FacturaCanon[] = []
  for (const f of filas) {
    const o = first<any>(f.ordenes_venta)
    // Una venta sin aprobar todavía no salió.
    if (!o || !vivas.has(o.estado)) continue
    const cli = first<any>(o.clientes)
    const ag = first<any>(o.agencias)
    const usd = (f.moneda ?? 'UYU') === 'USD'
    out.push({
      id: f.id, orden_id: f.orden_id, numero: f.numero, tipo: f.tipo, estado: f.estado,
      cuota: f.cuota, cuotas_total: f.cuotas_total,
      importe_arrendamiento: Number(f.importe_arrendamiento ?? 0), moneda: f.moneda ?? 'UYU',
      orden_numero: o.numero ?? null, cliente: cli?.empresa ?? cli?.nombre ?? '—',
      agencia: ag?.nombre ?? null, marca: o.marca ?? null,
      // Sin agencia (venta directa) no hay nada que descontar.
      pct_agencia: ag ? Number(o.comision_agencia_pct ?? ag.porcentaje_comision ?? 0) : 0,
      cotizacion: usd ? (f.cotizacion ? Number(f.cotizacion) : cotizHoy) : null,
      cotizacion_provisoria: usd && !f.cotizacion,
    })
  }
  return out
}

/** Trae de la base todo lo del mes y lo calcula. `mes` es "AAAA-MM". */
export async function cargarCanonDelMes(supabase: SupabaseClient, mes: string): Promise<{ resumen: ResumenShopping[]; error?: string }> {
  const mes01 = `${mes}-01`
  // La tabla de planes es de la migración v49: sin ella, ningún plan.
  const planesRes = await supabase.from('canon_planes').select('orden_id, cuotas, primer_mes')
  const planes = planesRes.error ? [] : (planesRes.data ?? []) as { orden_id: string; cuotas: number; primer_mes: string }[]
  const conPlan = new Set(planes.map(p => p.orden_id))
  const planesDelMes = planes.filter(p => {
    const k = mesesEntre(p.primer_mes.slice(0, 7) + '-01', mes01)
    return k >= 0 && k < p.cuotas
  })

  const conCotizacion = async (q: (sel: string) => any) => {
    // Sin la columna cotizacion (antes de v49), se lee sin ella.
    let r = await q(SELECT_FACTURAS)
    if (r.error && /cotizacion/.test(r.error.message)) r = await q(SELECT_FACTURAS.replace(', cotizacion', ''))
    return r
  }

  const [shRes, asigRes, factRes, planFactRes] = await Promise.all([
    supabase.from('canon_shoppings').select('id, nombre, porcentaje_canon, canon_minimo').eq('activo', true).order('nombre'),
    supabase.from('canon_soporte_shoppings').select('soporte_id, shopping_id, peso'),
    conCotizacion(sel => supabase.from('facturas').select(sel).eq('mes_pauta', mes01).neq('estado', 'anulada')),
    planesDelMes.length
      ? conCotizacion(sel => supabase.from('facturas').select(sel).in('orden_id', planesDelMes.map(p => p.orden_id)).neq('estado', 'anulada'))
      : Promise.resolve({ data: [], error: null }),
  ])
  const error = shRes.error?.message ?? asigRes.error?.message ?? factRes.error?.message ?? planFactRes.error?.message
  if (error) return { resumen: [], error }

  // Cotización del día para lo que está en dólares y todavía no se facturó.
  const todas = [...(factRes.data ?? []), ...(planFactRes.data ?? [])] as any[]
  const faltaCotiz = todas.some(f => f.moneda === 'USD' && !f.cotizacion)
  const cotizHoy = faltaCotiz ? (await cotizacionDolar(hoyUY()))?.valor ?? null : null

  // Las ventas con plan no se liquidan cuota por cuota.
  const facturas = aFacturasCanon((factRes.data ?? []).filter((f: any) => !conPlan.has(f.orden_id)), cotizHoy)
  const facturasPlan = aFacturasCanon(planFactRes.data ?? [], cotizHoy)

  let items: ItemVenta[] = []
  const ordenes = Array.from(new Set([...facturas, ...facturasPlan].map(f => f.orden_id)))
  if (ordenes.length) {
    const { data, error: iErr } = await supabase
      .from('orden_items')
      .select('orden_id, soporte_id, cantidad, semanas, precio_unitario, descuento_pct, soportes(nombre)')
      .in('orden_id', ordenes)
    if (iErr) return { resumen: [], error: iErr.message }
    items = (data ?? []).map((it: any) => ({ ...it, soporte: first<any>(it.soportes)?.nombre ?? null }))
  }

  const shoppings = (shRes.data ?? []).map(s => ({
    id: s.id, nombre: s.nombre, porcentaje_canon: Number(s.porcentaje_canon ?? 0), canon_minimo: Number(s.canon_minimo ?? 0),
  }))
  const asig = (asigRes.data ?? []) as Asignacion[]
  const resumen = calcularCanon(shoppings, asig, facturas, items)

  // Planes: el canon de toda la venta, dividido en sus cuotas.
  if (planesDelMes.length) {
    const delPlan = calcularCanon(shoppings, asig, facturasPlan, items)
    for (const r of delPlan) {
      const destino = resumen.find(x => x.shopping.id === r.shopping.id)!
      for (const p of planesDelMes) {
        const ls = r.lineas.filter(l => l.orden_id === p.orden_id)
        if (!ls.length) continue
        const n = p.cuotas
        const k = mesesEntre(p.primer_mes.slice(0, 7) + '-01', mes01) + 1
        const suma = (fn: (l: LineaCanon) => number) => r2(ls.reduce((t, l) => t + fn(l), 0) / n)
        destino.lineas.push({
          ...ls[0],
          factura_id: `plan-${p.orden_id}`, numero: ls.map(l => l.numero).filter(Boolean).join(', ') || null, tipo: 'factura',
          cuota: k, cuotas_total: n,
          soportes: Array.from(new Set(ls.flatMap(l => l.soportes))),
          arrendamiento: suma(l => l.arrendamiento), neto_agencia: suma(l => l.neto_agencia), canon: suma(l => l.canon),
          usd: null, cotizacion_provisoria: ls.some(l => l.cotizacion_provisoria),
          plan: { cuota: k, cuotas: n, primer_mes: p.primer_mes },
        })
      }
      destino.lineas.sort((a, b) => a.cliente.localeCompare(b.cliente))
      destino.variable = r2(destino.lineas.reduce((t, l) => t + l.canon, 0))
    }
  }
  return { resumen }
}

