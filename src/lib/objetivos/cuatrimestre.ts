/**
 * Cuatrimestre comercial: Q1 ene–abr, Q2 may–ago, Q3 sep–dic.
 * Es la misma cuenta que hace el dashboard (`getCurrentQuarter`), pero sobre
 * una fecha "AAAA-MM-DD" dada, para poder reusarla fuera de la pantalla.
 * `label` es el valor de la columna `objetivos.cuatrimestre`.
 */
export interface Cuatrimestre { label: string; displayLabel: string; start: string; end: string }

export function cuatrimestreDe(fecha: string): Cuatrimestre {
  const year = Number(fecha.slice(0, 4))
  const month = Number(fecha.slice(5, 7))
  if (month <= 4) return { label: `Q1-${year}`, displayLabel: 'Q1', start: `${year}-01-01`, end: `${year}-04-30` }
  if (month <= 8) return { label: `Q2-${year}`, displayLabel: 'Q2', start: `${year}-05-01`, end: `${year}-08-31` }
  return { label: `Q3-${year}`, displayLabel: 'Q3', start: `${year}-09-01`, end: `${year}-12-31` }
}
