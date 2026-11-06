/**
 * PDF de la cotización, con el formato del cotizador del hub de Movimagen
 * (public/planificador en movimagen-hub): banda naranja con el logo,
 * "COTIZACIÓN" y la fecha; campaña y cliente; cuatro indicadores (el total
 * en naranja); desglose de la inversión; una tarjeta por soporte con el color
 * de su categoría; pie con la página.
 *
 * Corre en el navegador. jsPDF se baja la primera vez que se usa, como en el
 * hub, para no sumarlo a la carga de la pantalla.
 */

export interface ItemPdf {
  nombre: string
  ubicacion: string | null
  categoria: string | null
  seccion: string | null
  semanas: number
  arr: number
  ivaArr: number
  prod: number
  ivaProd: number
  mun: number
  esMTOP: boolean
  imp: number
  cpm: number
  tot: number
}

export interface DatosPdf {
  numero: string
  campana: string
  cliente: string
  marca: string
  desde: string
  hasta: string
  moneda: string
  observaciones: string
  items: ItemPdf[]
}

declare global { interface Window { jspdf?: any } }

function cargarJsPDF(): Promise<any> {
  if (window.jspdf) return Promise.resolve(window.jspdf)
  return new Promise((res, rej) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
    s.onload = () => res(window.jspdf)
    s.onerror = () => rej(new Error('No se pudo cargar jsPDF'))
    document.head.appendChild(s)
  })
}

async function imagen(src: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const i = new Image()
    i.crossOrigin = 'anonymous'
    i.src = src
    await i.decode()
    const c = document.createElement('canvas')
    c.width = i.naturalWidth; c.height = i.naturalHeight
    c.getContext('2d')!.drawImage(i, 0, 0)
    return { data: c.toDataURL('image/png'), w: i.naturalWidth, h: i.naturalHeight }
  } catch { return null }
}

// Mismos colores por categoría que el hub.
const COLOR_CAT: Record<string, string> = {
  'Pantallas Gigantes': '#FF5C1A', 'Banners Shopping': '#7C3AED', 'Circuito Shopping': '#FB923C', 'Estáticos Shopping': '#7C3AED',
  Exterior: '#059669', 'Grandes Formatos': '#059669', Bus: '#D97706', Ruta: '#0284C7',
  Digital: '#FF5C1A', Shopping: '#7C3AED',
}
function categoriaPdf(i: ItemPdf): string {
  const sec = (i.seccion ?? '').toUpperCase()
  if (i.categoria === 'Digital') return sec === 'PANTALLAS GIGANTES' ? 'Pantallas Gigantes' : 'Circuito Shopping'
  if (i.categoria === 'Shopping') return sec.includes('BANNER') ? 'Banners Shopping' : 'Estáticos Shopping'
  return i.categoria ?? '—'
}
const rgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)] as const

export async function generarPdfCotizacion(d: DatosPdf): Promise<void> {
  const { jsPDF } = await cargarJsPDF()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210, M = 16, CW = W - M * 2
  let y = 0
  const O = [255, 92, 26] as const, INK = [28, 25, 23] as const, MUT = [130, 122, 114] as const, HAIR = [224, 218, 210] as const
  const sym = d.moneda === 'USD' ? 'U$S ' : '$'
  const fmt = (n: number) => Math.round(n).toLocaleString('es-UY')
  const fmtM = (n: number) => (!n ? '0' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'k' : String(Math.round(n)))
  const setT = (c: readonly number[]) => doc.setTextColor(c[0], c[1], c[2])
  const titulo = (t: string) => {
    doc.setFontSize(9); doc.setFont('helvetica', 'bold'); setT(MUT); doc.text(t, M, y); y += 3.5
    doc.setDrawColor(O[0], O[1], O[2]); doc.setLineWidth(0.4); doc.line(M, y, W - M, y); y += 6
  }
  const salto = (n: number) => { if (y + n > 285) { doc.addPage(); y = M } }

  // Banda naranja con el logo blanco
  doc.setFillColor(O[0], O[1], O[2]); doc.rect(0, 0, W, 26, 'F')
  const logo = await imagen('/brand/logo-blanco-700.png')
  if (logo) { const h = 8; doc.addImage(logo.data, 'PNG', M, 9, h * logo.w / logo.h, h) }
  else { doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.text('MOVIMAGEN', M, 15) }
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8)
  doc.text(`COTIZACIÓN ${d.numero}`, W - M, 11, { align: 'right' })
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(255, 225, 210)
  doc.text(new Date().toLocaleDateString('es-UY', { year: 'numeric', month: 'long', day: 'numeric' }), W - M, 17, { align: 'right' })

  // Campaña y cliente
  doc.setFillColor(250, 247, 243); doc.rect(0, 26, W, 16, 'F')
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); setT(INK)
  doc.text([d.campana, d.marca].filter(Boolean).join(' · ') || 'Propuesta', M, 33)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); setT(MUT)
  if (d.desde || d.hasta) doc.text(`${d.desde} – ${d.hasta}`, M, 38)
  if (d.cliente) { doc.setFontSize(9); doc.text(d.cliente, W - M, 34, { align: 'right' }) }
  y = 50

  // Indicadores
  const t = d.items.reduce((a, i) => ({
    imp: a.imp + i.imp, arr: a.arr + i.arr, tot: a.tot + i.tot, ivaArr: a.ivaArr + i.ivaArr,
    prod: a.prod + i.prod + i.ivaProd, mun: a.mun + (i.esMTOP ? 0 : i.mun), mtop: a.mtop + (i.esMTOP ? i.mun : 0),
  }), { imp: 0, arr: 0, tot: 0, ivaArr: 0, prod: 0, mun: 0, mtop: 0 })
  // Como en el hub: el CPM sale de la inversión de los soportes con impactos.
  const conImp = d.items.filter(i => i.imp > 0)
  const invConImp = conImp.reduce((a, i) => a + i.tot, 0)
  const cpm = t.imp > 0 ? invConImp / t.imp * 1000 : 0
  const parcial = t.imp > 0 && conImp.length < d.items.length ? ` (${conImp.length}/${d.items.length})` : ''
  // Sin "(1/4)" en el rótulo (no se entendía): si no todos los soportes
  // miden impactos, va una nota abajo de los indicadores.
  const kpis: [string, string][] = [['IMPACTOS' + (parcial ? ' *' : ''), fmtM(t.imp)], ['CPM PROM.' + (parcial ? ' *' : ''), cpm > 0 ? sym + cpm.toFixed(2) : '—'], ['ARRENDAMIENTO', sym + fmt(t.arr)], ['TOTAL', sym + fmt(t.tot)]]
  const kW = CW / 4
  kpis.forEach(([lbl, val], i) => {
    const x = M + i * kW, hero = i === 3
    if (hero) { doc.setFillColor(O[0], O[1], O[2]); doc.roundedRect(x, y, kW - 3, 20, 2, 2, 'F') }
    else { doc.setDrawColor(HAIR[0], HAIR[1], HAIR[2]); doc.setLineWidth(0.3); doc.roundedRect(x, y, kW - 3, 20, 2, 2, 'S') }
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal')
    doc.setTextColor(hero ? 255 : MUT[0], hero ? 210 : MUT[1], hero ? 185 : MUT[2]); doc.text(lbl, x + 4, y + 7)
    doc.setFontSize(12); doc.setFont('helvetica', 'bold')
    doc.setTextColor(hero ? 255 : INK[0], hero ? 255 : INK[1], hero ? 255 : INK[2]); doc.text(val, x + 4, y + 15)
  })
  y += 24
  if (parcial) {
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); setT(MUT)
    doc.text(`* Impactos y CPM de los ${conImp.length} soportes con medición de audiencia (de ${d.items.length}).`, M, y)
  }
  y += 5

  // Desglose
  titulo('DESGLOSE DE INVERSIÓN')
  const desg: [string, number][] = [['Arrendamiento base', t.arr],
    ...(t.ivaArr > 0 ? [['IVA arrendamiento (22%)', t.ivaArr] as [string, number]] : []),
    ...(t.mun > 0 ? [['Impuestos municipales', t.mun] as [string, number]] : []),
    ...(t.mtop > 0 ? [['Impuesto MTOP', t.mtop] as [string, number]] : []),
    ...(t.prod > 0 ? [['Producción e instalación (IVA incluido)', t.prod] as [string, number]] : [])]
  for (const [lbl, val] of desg) {
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); setT(INK); doc.text(lbl, M + 1, y)
    doc.setFont('helvetica', 'bold'); doc.text(sym + fmt(val), W - M - 1, y, { align: 'right' })
    y += 3; doc.setDrawColor(HAIR[0], HAIR[1], HAIR[2]); doc.setLineWidth(0.2); doc.line(M, y, W - M, y); y += 5
  }
  doc.setFillColor(O[0], O[1], O[2]); doc.roundedRect(M, y, CW, 11, 2, 2, 'F')
  doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(255, 220, 200); doc.text('TOTAL CAMPAÑA', M + 5, y + 7)
  doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255); doc.text(sym + fmt(t.tot), W - M - 5, y + 7, { align: 'right' })
  y += 19

  // Detalle de soportes
  titulo('DETALLE DE SOPORTES')
  for (const i of d.items) {
    salto(24)
    doc.setDrawColor(HAIR[0], HAIR[1], HAIR[2]); doc.setLineWidth(0.3); doc.roundedRect(M, y, CW, 22, 2, 2, 'S')
    const cat = categoriaPdf(i), cc = rgb(COLOR_CAT[cat] ?? '#78716C')
    doc.setFillColor(cc[0], cc[1], cc[2]); doc.roundedRect(M + 4, y + 4, 3, 14, 1, 1, 'F')
    doc.setFontSize(9.5); doc.setFont('helvetica', 'bold'); setT(INK); doc.text(i.nombre, M + 11, y + 8)
    doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(cc[0], cc[1], cc[2]); doc.text(cat.toUpperCase(), M + 11, y + 12.5)
    // La ubicación entra en el ancho disponible, cortada en una palabra.
    doc.setFontSize(7.5); doc.setFont('helvetica', 'normal'); setT(MUT)
    const ubic = doc.splitTextToSize(i.ubicacion ?? '', CW - 70)
    doc.text(ubic[0] + (ubic.length > 1 ? '…' : ''), M + 11, y + 17)
    const det = [i.semanas + ' sem', i.imp ? fmt(i.imp) + ' imp' : '', i.cpm ? 'CPM ' + sym + i.cpm.toFixed(2) : ''].filter(Boolean).join('   ·   ')
    doc.setFontSize(7); doc.text(det, M + 11, y + 20.5)
    doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(O[0], O[1], O[2]); doc.text(sym + fmt(i.tot), W - M - 5, y + 10, { align: 'right' })
    const sub: string[] = []
    if (i.ivaArr) sub.push('IVA ' + sym + fmt(i.ivaArr))
    if (i.mun) sub.push((i.esMTOP ? 'MTOP ' : 'Mun ') + sym + fmt(i.mun))
    if (i.prod) sub.push('Prod ' + sym + fmt(i.prod + i.ivaProd))
    if (sub.length) { doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); setT(MUT); doc.text(sub.join('   '), W - M - 5, y + 16, { align: 'right' }) }
    y += 26
  }

  if (d.observaciones) {
    salto(20); titulo('OBSERVACIONES')
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); setT(INK)
    const lineas = doc.splitTextToSize(d.observaciones, CW)
    doc.text(lineas, M, y); y += lineas.length * 4 + 4
  }

  // Pie
  const pages = doc.internal.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p); doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setT(MUT)
    doc.text('Movimagen · Publicidad exterior · 2600 1881 · info@movimagen.com.uy', M, 293)
    doc.text(p + '/' + pages, W - M, 293, { align: 'right' })
  }
  const archivo = ((d.campana || d.numero || 'cotizacion').replace(/[^\w]+/g, '_')) + '_movimagen.pdf'
  doc.save(archivo)
}
