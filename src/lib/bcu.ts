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
