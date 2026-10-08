/**
 * Fechas en hora de Uruguay.
 *
 * `new Date().toISOString().slice(0, 10)` es la fecha en UTC: de 21:00 a
 * medianoche en Montevideo ya es el día siguiente. Un cobro registrado a las
 * 22:00 del 31 de octubre quedaba del 1 de noviembre, y su comisión caía en
 * noviembre.
 */
export const ZONA_UY = 'America/Montevideo'

/** "AAAA-MM-DD" de hoy en Uruguay. */
export function hoyUY(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString('en-CA', { timeZone: ZONA_UY })
}

/** "AAAA-MM" del mes en curso en Uruguay. */
export function mesUY(ahora: Date = new Date()): string {
  return hoyUY(ahora).slice(0, 7)
}
