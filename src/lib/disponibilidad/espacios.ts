/**
 * Cuántos espacios de un soporte ocupa una venta o un bloqueo.
 *
 * En los soportes físicos es la cantidad (cuántas puertas, cuántos buses).
 * En los digitales no: la capacidad es la cantidad de lugares en la tanda
 * —12 en una pantalla gigante, 32 en un circuito de shopping— y un cliente
 * ocupa un lugar por cada frecuencia base que compra (30 salidas por hora en
 * una pantalla, 10 en un circuito). Es lo que cuenta la planilla de
 * disponibilidades: un cliente con el doble de salidas ocupa dos lugares.
 *
 * Antes se contaba la cantidad también acá, y un circuito vendido con sus 20
 * pantallas ocupaba 20 de los 32 lugares.
 */
export function espaciosQueOcupa(
  tipoCotizador: string | null | undefined,
  item: { cantidad?: number | null; salidas?: number | null },
): number {
  if (tipoCotizador === 'circuito') return Math.max(1, Math.round(Number(item.salidas ?? 10) / 10))
  if (tipoCotizador === 'led') return Math.max(1, Math.round(Number(item.salidas ?? 30) / 30))
  return Number(item.cantidad ?? 1)
}
