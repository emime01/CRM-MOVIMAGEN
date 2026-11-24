import { esMoneda, netoSinIva, type Moneda, type TotalPorMoneda } from '@/lib/money'

/**
 * Facturación y ventas por cliente (o por agencia), para Administración.
 *
 * Del período elegido (meses 'YYYY-MM' desde/hasta, inclusive):
 *   · vendido    ventas vivas cargadas en el período, sin IVA
 *   · facturado  facturas emitidas en el período, con IVA, menos notas de crédito
 *   · cobrado    pagos con fecha en el período (lo que entró de verdad)
 * A hoy, sin importar el período:
 *   · pendiente  facturas emitidas sin cobrar
 *   · vencido    de esas, las que ya vencieron
 *   · aFacturar  cuotas previstas que todavía no se facturaron
 * Todo separado por moneda: sumar pesos y dólares no significa nada.
 */

type Rel<T> = T | T[] | null | undefined
const uno = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v ?? null)

export interface Cuenta { id: string; nombre?: string | null; empresa?: string | null }
export interface OrdenRef { cliente_id?: string | null; agencia_id?: string | null; moneda?: unknown; clientes?: Rel<Cuenta>; agencias?: Rel<{ id: string; nombre: string | null }> }
export interface VentaPC extends OrdenRef { id: string; monto_neto?: unknown; monto_total?: unknown; created_at: string }
export interface FacturaPC {
  tipo?: string | null; estado?: string | null; fecha_emision?: string | null; fecha_vencimiento?: string | null
  importe_total?: unknown; moneda?: unknown; ordenes_venta?: Rel<OrdenRef>
}
export interface PagoPC { monto?: unknown; fecha_pago?: string | null; ordenes_venta?: Rel<OrdenRef> }

export type Agrupar = 'cliente' | 'agencia'
export const CAMPOS = ['vendido', 'facturado', 'cobrado', 'pendiente', 'vencido', 'aFacturar'] as const
export type Campo = typeof CAMPOS[number]

export interface FilaPC extends Record<Campo, TotalPorMoneda> {
  clave: string
  nombre: string
  /** Para ir a la cuenta (sólo agrupando por cliente). */
  clienteId: string | null
  ventas: number
}

const DIRECTO = '__directo__'

function claveYNombre(o: OrdenRef | null, agrupar: Agrupar): { clave: string; nombre: string; clienteId: string | null } {
  if (agrupar === 'agencia') {
    const a = uno(o?.agencias)
    const id = o?.agencia_id ?? a?.id ?? null
    return id ? { clave: id, nombre: a?.nombre ?? '—', clienteId: null } : { clave: DIRECTO, nombre: 'Directo (sin agencia)', clienteId: null }
  }
  const c = uno(o?.clientes)
  const id = o?.cliente_id ?? c?.id ?? null
  return { clave: id ?? '—', nombre: c?.empresa || c?.nombre || '—', clienteId: id }
}

export function resumenPorCliente(opts: {
  ventas: readonly VentaPC[]; facturas: readonly FacturaPC[]; pagos: readonly PagoPC[]
  desde: string; hasta: string; hoy: string; agrupar: Agrupar
}): FilaPC[] {
  const { desde, hasta, hoy, agrupar } = opts
  const enPeriodo = (f?: string | null) => !!f && f.slice(0, 7) >= desde && f.slice(0, 7) <= hasta
  const filas = new Map<string, FilaPC>()
  const fila = (o: OrdenRef | null) => {
    const k = claveYNombre(o, agrupar)
    let f = filas.get(k.clave)
    if (!f) {
      f = { ...k, ventas: 0, vendido: {}, facturado: {}, cobrado: {}, pendiente: {}, vencido: {}, aFacturar: {} }
      filas.set(k.clave, f)
    }
    return f
  }
  const sumar = (t: TotalPorMoneda, m: unknown, n: number) => {
    const mon: Moneda = esMoneda(m) ? m : 'UYU'
    t[mon] = Math.round(((t[mon] ?? 0) + n) * 100) / 100
  }

  for (const v of opts.ventas) {
    if (!enPeriodo(v.created_at)) continue
    const f = fila(v)
    f.ventas++
    sumar(f.vendido, v.moneda, netoSinIva(v))
  }
  for (const fa of opts.facturas) {
    const o = uno(fa.ordenes_venta)
    const imp = Number(fa.importe_total ?? 0) || 0
    const mon = fa.moneda ?? o?.moneda
    const nc = fa.tipo === 'nota_credito'
    if ((fa.estado === 'emitida' || fa.estado === 'cobrada') && enPeriodo(fa.fecha_emision)) {
      sumar(fila(o).facturado, mon, nc ? -Math.abs(imp) : imp)
    }
    if (fa.estado === 'emitida' && !nc) {
      const f = fila(o)
      sumar(f.pendiente, mon, imp)
      if (fa.fecha_vencimiento && fa.fecha_vencimiento < hoy) sumar(f.vencido, mon, imp)
    }
    if (fa.estado === 'prevista' && !nc) sumar(fila(o).aFacturar, mon, imp)
  }
  for (const p of opts.pagos) {
    if (!enPeriodo(p.fecha_pago)) continue
    const o = uno(p.ordenes_venta)
    sumar(fila(o).cobrado, o?.moneda, Number(p.monto ?? 0) || 0)
  }

  // Sólo las filas con algo que mostrar.
  return Array.from(filas.values()).filter(f => CAMPOS.some(c => Object.values(f[c]).some(n => (n ?? 0) !== 0)))
}

/** Suma de una columna de todas las filas, por moneda. */
export function totalColumna(filas: readonly FilaPC[], campo: Campo): TotalPorMoneda {
  const t: TotalPorMoneda = {}
  for (const f of filas) for (const [m, n] of Object.entries(f[campo]) as [Moneda, number][]) t[m] = Math.round(((t[m] ?? 0) + n) * 100) / 100
  return t
}
