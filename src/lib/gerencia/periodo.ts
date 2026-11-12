/**
 * Períodos de la gerencia. La empresa trabaja por cuatrimestres:
 * Q1 ene–abr, Q2 may–ago, Q3 sep–dic (igual que el Inicio y los objetivos).
 */

export interface Cuatrimestre {
  label: string
  start: string
  end: string
}

/** El cuatrimestre de una fecha AAAA-MM-DD. */
export function cuatrimestreDe(fecha: string): Cuatrimestre {
  const y = Number(fecha.slice(0, 4))
  const m = Number(fecha.slice(5, 7))
  if (m <= 4) return { label: `Q1-${y}`, start: `${y}-01-01`, end: `${y}-04-30` }
  if (m <= 8) return { label: `Q2-${y}`, start: `${y}-05-01`, end: `${y}-08-31` }
  return { label: `Q3-${y}`, start: `${y}-09-01`, end: `${y}-12-31` }
}

/** El mes AAAA-MM desplazado `n` meses. */
export function sumarMeses(mes: string, n: number): string {
  const y = Number(mes.slice(0, 4))
  const m = Number(mes.slice(5, 7)) - 1 + n
  const yy = y + Math.floor(m / 12)
  const mm = ((m % 12) + 12) % 12
  return `${yy}-${String(mm + 1).padStart(2, '0')}`
}

/** Último día (AAAA-MM-DD) de un mes AAAA-MM. */
export function ultimoDiaDelMes(mes: string): string {
  const y = Number(mes.slice(0, 4))
  const m = Number(mes.slice(5, 7))
  return `${mes}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
}
