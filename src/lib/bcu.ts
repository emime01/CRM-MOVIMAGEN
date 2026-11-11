/**
 * Cotización del dólar del BCU (dólar billete, código 2225), por su servicio
 * web público. El BCU publica cada día hábil; para una fecha se toma la última
 * cotización publicada hasta ese día (fin de semana o feriado → la anterior).
 */
const URL_BCU = 'https://cotizaciones.bcu.gub.uy/wscotizaciones/servlet/awsbcucotizaciones'

const sumarDias = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}

export async function cotizacionDolarBCU(fecha: string): Promise<{ fecha: string; valor: number } | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null
  const desde = sumarDias(fecha, -10)
  const body = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:cot="Cotiza"><soapenv:Header/><soapenv:Body><cot:wsbcucotizaciones.Execute><cot:Entrada><cot:Moneda><cot:item>2225</cot:item></cot:Moneda><cot:FechaDesde>${desde}</cot:FechaDesde><cot:FechaHasta>${fecha}</cot:FechaHasta><cot:Grupo>0</cot:Grupo></cot:Entrada></cot:wsbcucotizaciones.Execute></soapenv:Body></soapenv:Envelope>`
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(URL_BCU, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=utf-8' }, body, signal: ctrl.signal, cache: 'no-store' })
    clearTimeout(t)
    if (!res.ok) return null
    const xml = await res.text()
    const datos = Array.from(xml.matchAll(/<Fecha>(\d{4}-\d{2}-\d{2})<\/Fecha>[\s\S]*?<TCV>([\d.]+)<\/TCV>/g))
      .map(m => ({ fecha: m[1], valor: Number(m[2]) }))
      .filter(d => d.valor > 0 && d.fecha <= fecha)
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
    return datos.length ? { fecha: datos[datos.length - 1].fecha, valor: Math.round(datos[datos.length - 1].valor * 1000) / 1000 } : null
  } catch {
    return null
  }
}

/**
 * Respaldo si el BCU no responde: dólar BROU de datosUruguay (promedio entre
 * compra y venta). Sólo da la cotización de ahora, no la de fechas pasadas.
 * Fuente: Datos de datosUruguay.com (CC-BY-4.0).
 */
export async function cotizacionDolarBROU(): Promise<{ fecha: string; valor: number } | null> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch('https://datosuruguay.com/api/v1/exchange-rates/usd/quote', { signal: ctrl.signal, cache: 'no-store' })
    clearTimeout(t)
    if (!res.ok) return null
    const d = (await res.json())?.data
    const valor = Number(d?.average ?? ((Number(d?.buy) + Number(d?.sell)) / 2))
    if (!Number.isFinite(valor) || valor <= 0) return null
    return { fecha: String(d?.as_of ?? '').slice(0, 10), valor: Math.round(valor * 1000) / 1000 }
  } catch {
    return null
  }
}

/** La del BCU para la fecha; si el BCU no contesta, la del BROU de hoy. */
export async function cotizacionDolar(fecha: string): Promise<{ fecha: string; valor: number; fuente: 'BCU' | 'BROU' } | null> {
  const bcu = await cotizacionDolarBCU(fecha)
  if (bcu) return { ...bcu, fuente: 'BCU' }
  const brou = await cotizacionDolarBROU()
  return brou ? { ...brou, fuente: 'BROU' } : null
}
