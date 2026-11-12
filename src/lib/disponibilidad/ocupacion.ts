import { espaciosQueOcupa } from './espacios'

/**
 * La regla de ocupación de la planilla de disponibilidad, en funciones puras.
 * La usan la API de disponibilidad (vista mensual) y el resumen de Gerencia,
 * para que los dos cuenten exactamente igual: venta viva + bloqueo vivo contra
 * la capacidad del soporte, con `espaciosQueOcupa` para pantallas y circuitos.
 */

export interface Intervalo {
  soporte_id: string
  /** AAAA-MM-DD, inclusive. */
  desde: string
  hasta: string
  espacios: number
}

// Fechas efectivas: item.real → item.prevista → orden.real → orden.prevista
export function efAlta(item: any, ord: any): string | null {
  return item.fecha_alta_real ?? item.fecha_alta_prevista ?? ord.fecha_alta_real ?? ord.fecha_alta_prevista ?? null
}
export function efBaja(item: any, ord: any): string | null {
  return item.fecha_baja_real ?? item.fecha_baja_prevista ?? ord.fecha_baja_real ?? ord.fecha_baja_prevista ?? null
}

/** Ventas vivas (ya filtradas por estado) → lo que ocupa cada item y cuándo. */
export function intervalosVentas(ordenes: any[] | null | undefined, tipoDe: Map<string, string | null>): Intervalo[] {
  const out: Intervalo[] = []
  for (const ord of ordenes ?? []) {
    for (const item of ord.orden_items ?? []) {
      if (!item.soporte_id) continue
      const desde = efAlta(item, ord)
      const hasta = efBaja(item, ord)
      if (!desde || !hasta) continue
      out.push({ soporte_id: item.soporte_id, desde, hasta, espacios: espaciosQueOcupa(tipoDe.get(item.soporte_id), item) })
    }
  }
  return out
}

/** Bloqueos vivos (reservas sin venta): real del item ?? ventana de la reserva. */
export function intervalosBloqueos(reservas: any[] | null | undefined, tipoDe: Map<string, string | null>): Intervalo[] {
  const out: Intervalo[] = []
  for (const r of reservas ?? []) {
    for (const item of r.reserva_items ?? []) {
      if (!item.soporte_id) continue
      const desde = item.fecha_alta_real ?? r.fecha_desde
      const hasta = item.fecha_baja_real ?? r.fecha_hasta
      if (!desde || !hasta) continue
      out.push({ soporte_id: item.soporte_id, desde, hasta, espacios: espaciosQueOcupa(tipoDe.get(item.soporte_id), item) })
    }
  }
  return out
}

const DIA_MS = 86_400_000
const aMs = (f: string) => {
  const [y, m, d] = f.slice(0, 10).split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

/** Suma `n` días a una fecha AAAA-MM-DD. */
export function sumarDias(fecha: string, n: number): string {
  return new Date(aMs(fecha) + n * DIA_MS).toISOString().slice(0, 10)
}

export interface OcupacionSoporte {
  cap: number
  /** Días del rango (cap × días es la capacidad total en espacios-día). */
  dias: number
  /** Espacios-día vendidos (por día, recortado a la capacidad). */
  ventaDias: number
  /** Espacios-día bloqueados, sobre lo que la venta no ocupa. */
  bloqueoDias: number
  /** Días en que todavía queda al menos un espacio sin vender ni bloquear. */
  diasConLugar: number
}

/**
 * Ocupación por soporte entre `desde` y `hasta` (inclusive), día por día:
 * cada día la venta se recorta a la capacidad y el bloqueo a lo que queda.
 * `caps`: id → capacidad de cada soporte activo.
 */
export function ocupacionPorSoporte(
  caps: Map<string, number>,
  ventas: Intervalo[],
  bloqueos: Intervalo[],
  desde: string,
  hasta: string,
): Map<string, OcupacionSoporte> {
  const base = aMs(desde)
  const dias = Math.max(0, Math.round((aMs(hasta) - base) / DIA_MS) + 1)
  const venta = new Map<string, number[]>()
  const bloq = new Map<string, number[]>()

  const acumular = (dest: Map<string, number[]>, lista: Intervalo[]) => {
    for (const iv of lista) {
      if (!caps.has(iv.soporte_id)) continue
      const i0 = Math.max(0, Math.round((aMs(iv.desde) - base) / DIA_MS))
      const i1 = Math.min(dias - 1, Math.round((aMs(iv.hasta) - base) / DIA_MS))
      if (i1 < i0) continue
      let arr = dest.get(iv.soporte_id)
      if (!arr) { arr = new Array(dias).fill(0); dest.set(iv.soporte_id, arr) }
      for (let i = i0; i <= i1; i++) arr[i] += iv.espacios
    }
  }
  acumular(venta, ventas)
  acumular(bloq, bloqueos)

  const out = new Map<string, OcupacionSoporte>()
  caps.forEach((cap, id) => {
    const v = venta.get(id)
    const b = bloq.get(id)
    let ventaDias = 0, bloqueoDias = 0, diasConLugar = 0
    for (let i = 0; i < dias; i++) {
      const vi = Math.min(cap, v?.[i] ?? 0)
      const bi = Math.min(cap - vi, b?.[i] ?? 0)
      ventaDias += vi
      bloqueoDias += bi
      // Mismo criterio que la planilla: libre si venta + bloqueo < capacidad.
      if ((v?.[i] ?? 0) + (b?.[i] ?? 0) < cap) diasConLugar++
    }
    out.set(id, { cap, dias, ventaDias, bloqueoDias, diasConLugar })
  })
  return out
}
