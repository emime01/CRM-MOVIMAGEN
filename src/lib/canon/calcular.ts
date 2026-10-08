import type { SupabaseClient } from '@supabase/supabase-js'
import { ESTADOS_VENTA_VIVA } from '@/lib/ventas/asignar-buses'

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
      const parteItem = Number(f.importe_arrendamiento ?? 0) * valorItem(it) / total
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
        soportes: Array.from(x.soportes), moneda: f.moneda,
        arrendamiento: arr, pct_agencia: f.pct_agencia, neto_agencia: neto, pct_canon: pct,
        canon: r2(neto * pct / 100), reparto: x.reparto,
      })
    }
  }

  return shoppings.map(s => {
    const ls = (lineas.get(s.id) ?? []).sort((a, b) => a.cliente.localeCompare(b.cliente))
    return {
      shopping: s,
      lineas: ls,
      variable: r2(ls.filter(l => l.moneda !== 'USD').reduce((t, l) => t + l.canon, 0)),
      variable_usd: r2(ls.filter(l => l.moneda === 'USD').reduce((t, l) => t + l.canon, 0)),
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

/** Trae de la base todo lo del mes y lo calcula. `mes` es "AAAA-MM". */
export async function cargarCanonDelMes(supabase: SupabaseClient, mes: string): Promise<{ resumen: ResumenShopping[]; error?: string }> {
  const [shRes, asigRes, factRes] = await Promise.all([
    supabase.from('canon_shoppings').select('id, nombre, porcentaje_canon, canon_minimo').eq('activo', true).order('nombre'),
    supabase.from('canon_soporte_shoppings').select('soporte_id, shopping_id, peso'),
    supabase
      .from('facturas')
      .select(`
        id, orden_id, numero, tipo, estado, cuota, cuotas_total, importe_arrendamiento, moneda,
        ordenes_venta(numero, estado, marca, comision_agencia_pct,
          clientes(nombre, empresa), agencias(nombre, porcentaje_comision))
      `)
      .eq('mes_pauta', `${mes}-01`)
      .neq('estado', 'anulada'),
  ])
  const error = shRes.error?.message ?? asigRes.error?.message ?? factRes.error?.message
  if (error) return { resumen: [], error }

  const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : v ?? null)
  const vivas = new Set<string>(ESTADOS_VENTA_VIVA)
  const facturas: FacturaCanon[] = []
  for (const f of factRes.data ?? []) {
    const o = first<any>(f.ordenes_venta)
    // Una venta sin aprobar todavía no salió.
    if (!o || !vivas.has(o.estado)) continue
    const cli = first<any>(o.clientes)
    const ag = first<any>(o.agencias)
    facturas.push({
      id: f.id, orden_id: f.orden_id, numero: f.numero, tipo: f.tipo, estado: f.estado,
      cuota: f.cuota, cuotas_total: f.cuotas_total,
      importe_arrendamiento: Number(f.importe_arrendamiento ?? 0), moneda: f.moneda ?? 'UYU',
      orden_numero: o.numero ?? null, cliente: cli?.empresa ?? cli?.nombre ?? '—',
      agencia: ag?.nombre ?? null, marca: o.marca ?? null,
      // Sin agencia (venta directa) no hay nada que descontar.
      pct_agencia: ag ? Number(o.comision_agencia_pct ?? ag.porcentaje_comision ?? 0) : 0,
    })
  }

  let items: ItemVenta[] = []
  const ordenes = Array.from(new Set(facturas.map(f => f.orden_id)))
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
  return { resumen: calcularCanon(shoppings, (asigRes.data ?? []) as Asignacion[], facturas, items) }
}
