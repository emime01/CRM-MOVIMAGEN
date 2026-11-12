import type { OcupacionSoporte } from '@/lib/disponibilidad/ocupacion'

/**
 * Ocupación por formato (soportes.categoria) para el resumen de Gerencia.
 * % vendido = espacios-día de ventas vivas ÷ capacidad en espacios-día;
 * % reservado = lo mismo con los bloqueos vivos (se muestra aparte).
 */

export const FORMATOS_ORDEN = ['Digital', 'Shopping', 'Exterior', 'Ruta', 'Bus', 'Otro'] as const

export interface OcupacionFormato {
  formato: string
  soportes: number
  capDias: number
  ventaDias: number
  bloqueoDias: number
  /** 0–100, redondeado. */
  pctVendido: number
  pctReservado: number
}

export function nombreFormato(categoria: string | null | undefined): string {
  const c = (categoria ?? '').trim()
  return c || 'Otro'
}

const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0)

export function ocupacionPorFormato(
  soportes: ReadonlyArray<{ id: string; categoria?: string | null }>,
  ocupacion: Map<string, OcupacionSoporte>,
): OcupacionFormato[] {
  const acc = new Map<string, OcupacionFormato>()
  for (const s of soportes) {
    const o = ocupacion.get(s.id)
    if (!o) continue
    const formato = nombreFormato(s.categoria)
    const f = acc.get(formato) ?? { formato, soportes: 0, capDias: 0, ventaDias: 0, bloqueoDias: 0, pctVendido: 0, pctReservado: 0 }
    f.soportes++
    f.capDias += o.cap * o.dias
    f.ventaDias += o.ventaDias
    f.bloqueoDias += o.bloqueoDias
    acc.set(formato, f)
  }
  const orden = (f: string) => {
    const i = (FORMATOS_ORDEN as readonly string[]).indexOf(f)
    return i === -1 ? FORMATOS_ORDEN.length : i
  }
  return Array.from(acc.values())
    .map(f => ({ ...f, pctVendido: pct(f.ventaDias, f.capDias), pctReservado: pct(f.bloqueoDias, f.capDias) }))
    .sort((a, b) => orden(a.formato) - orden(b.formato) || a.formato.localeCompare(b.formato))
}

/** Cuántos soportes tienen algún espacio libre en el rango calculado. */
export function soportesConLugar(ocupacion: Map<string, OcupacionSoporte>): number {
  let n = 0
  ocupacion.forEach(o => { if (o.diasConLugar > 0) n++ })
  return n
}
