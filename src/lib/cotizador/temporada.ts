/**
 * Temporada alta de Punta del Este: diciembre, enero y febrero.
 *
 * Un soporte con precio_semanal_alta cobra cada semana al precio de la
 * temporada en la que empieza esa semana; si la campaña arranca en alta, el
 * mínimo de semanas es semanas_minimas_alta. Sin precio_semanal_alta, el
 * precio es el mismo todo el año.
 */
export const MESES_ALTA = [12, 1, 2]

export interface SoporteTemporada {
  precio_semanal: number | null
  precio_semanal_alta?: number | null
  semanas_minimas?: number | null
  semanas_minimas_alta?: number | null
}

export const esTemporadaAlta = (iso: string) => MESES_ALTA.includes(Number(iso.slice(5, 7)))

const sumarDias = (iso: string, n: number) => {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}

/** Semanas mínimas según cuándo arranca la campaña. */
export function semanasMinimas(s: SoporteTemporada, inicio?: string | null): number {
  if (s.precio_semanal_alta != null && inicio && esTemporadaAlta(inicio) && s.semanas_minimas_alta) {
    return Math.max(s.semanas_minimas ?? 1, s.semanas_minimas_alta)
  }
  return s.semanas_minimas || 1
}

/** Suma de los precios semanales de las `semanas` que arrancan en `inicio`. */
export function precioDeSemanas(s: SoporteTemporada, semanas: number, inicio?: string | null): number {
  const baja = Number(s.precio_semanal ?? 0)
  if (s.precio_semanal_alta == null || !inicio) return baja * semanas
  let total = 0
  for (let k = 0; k < semanas; k++) {
    total += esTemporadaAlta(sumarDias(inicio, k * 7)) ? Number(s.precio_semanal_alta) : baja
  }
  return total
}
