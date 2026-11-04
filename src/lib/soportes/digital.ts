/**
 * Si un soporte es digital (pantalla LED o circuito de pantallas).
 *
 * Se decide por `tipo_cotizador`, que está cargado en todo el catálogo. Las
 * columnas `tipo` y `es_digital` quedaron vacías en las pantallas y los
 * circuitos: la Planilla digital de arte salía sin ninguna pantalla y
 * Registros trataba las LED como estáticas. Se siguen respetando por si
 * algún soporte las tiene marcadas.
 */
export const TIPOS_DIGITALES = ['led', 'circuito'] as const

export function esDigital(s: { tipo_cotizador?: string | null; tipo?: string | null; es_digital?: boolean | null } | null | undefined): boolean {
  if (!s) return false
  return s.es_digital === true || s.tipo === 'led' || (TIPOS_DIGITALES as readonly string[]).includes(s.tipo_cotizador ?? '')
}
