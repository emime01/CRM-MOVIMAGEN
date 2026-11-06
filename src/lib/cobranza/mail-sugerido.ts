/**
 * Texto sugerido para que administración le escriba al cliente (o a la
 * agencia) por una factura por vencer o vencida. Belén lo copia o lo abre en
 * su correo y lo ajusta si hace falta.
 */
export interface DatosFactura {
  cliente: string
  agencia?: string | null
  numero: string | null
  importe: number
  moneda: string
  vencimiento: string | null
  cuota?: number
  cuotasTotal?: number
  campana?: string | null
}

const fecha = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—')
const plata = (n: number, m: string) => `${m === 'USD' ? 'U$S' : '$'} ${Math.round(n).toLocaleString('es-UY')}`

export function diasDeAtraso(vencimiento: string | null, hoy: string): number {
  if (!vencimiento) return 0
  return Math.round((Date.parse(hoy + 'T00:00:00Z') - Date.parse(vencimiento.slice(0, 10) + 'T00:00:00Z')) / 86400000)
}

export function mailSugerido(f: DatosFactura, hoy: string): { asunto: string; cuerpo: string } {
  const atraso = diasDeAtraso(f.vencimiento, hoy)
  const fac = f.numero ? `la factura N° ${f.numero}` : 'la factura'
  const cuota = f.cuotasTotal && f.cuotasTotal > 1 ? ` (cuota ${f.cuota} de ${f.cuotasTotal})` : ''
  const camp = f.campana ? ` correspondiente a la campaña ${f.campana}` : ''
  const saludo = `Hola, ¿cómo están?`
  const firma = `Muchas gracias.\n\nSaludos,\nAdministración · Movimagen\n2600 1881 · info@movimagen.com.uy`
  if (atraso > 0) {
    return {
      asunto: `Factura ${f.numero ?? ''} vencida · ${f.cliente}`.replace('  ', ' '),
      cuerpo: `${saludo}\n\nLes escribimos por ${fac}${cuota}${camp}, por ${plata(f.importe, f.moneda)}, que venció el ${fecha(f.vencimiento)}.\n\nNo tenemos registrado el pago todavía. ¿Nos podrían confirmar para cuándo lo tienen previsto? Si ya lo realizaron, les pedimos que nos envíen el comprobante así lo imputamos.\n\n${firma}`,
    }
  }
  return {
    asunto: `Recordatorio: vencimiento factura ${f.numero ?? ''} · ${f.cliente}`.replace('  ', ' '),
    cuerpo: `${saludo}\n\nLes recordamos que ${fac}${cuota}${camp}, por ${plata(f.importe, f.moneda)}, vence el ${fecha(f.vencimiento)}.\n\nCualquier consulta sobre la factura o la forma de pago, quedamos a las órdenes.\n\n${firma}`,
  }
}
