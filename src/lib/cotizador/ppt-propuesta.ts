/**
 * Presentación comercial (PowerPoint) de una cotización, para mostrarle al
 * cliente: portada, una diapositiva por soporte con su foto, la inversión y
 * el cierre con los datos de contacto. Se arma en el navegador (pptxgenjs).
 */

export interface ItemPpt {
  nombre: string
  ubicacion: string | null
  categoria: string | null
  seccion: string | null
  medidas?: string | null
  foto: string | null
  cantidad: number
  semanas: number
  salidas?: number | null
  impactos: number
  arr: number
  prod: number
  imp: number      // impuestos municipales / MTOP
  ivaArr: number
  ivaProd: number
  tot: number
}

export interface DatosPpt {
  numero: string
  cliente: string
  campana: string
  marca: string
  desde: string
  hasta: string
  moneda: string
  observaciones: string
  incluirPrecios: boolean
  vendedor?: { nombre?: string | null; email?: string | null } | null
  items: ItemPpt[]
}

const NARANJA = 'EB691C'
const TINTA = '1A1915'
const GRIS = '6E6A62'
const CLARO = 'F4F3F0'
// Arial: Montserrat no viene en PowerPoint y el cliente vería otra letra.
const FUENTE = 'Arial'

const COLOR_CAT: Record<string, string> = {
  Digital: 'EB691C', Shopping: '7C3AED', Exterior: '059669', Bus: 'D97706', Ruta: '0284C7',
}

/** Foto achicada a JPEG (≤ 1600 px) para que la presentación no pese de más. */
async function fotoBase64(url: string, max = 1600): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await img.decode()
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k)
    const c = document.createElement('canvas'); c.width = w; c.height = h
    c.getContext('2d')!.drawImage(img, 0, 0, w, h)
    return { data: c.toDataURL('image/jpeg', 0.85), w, h }
  } catch { return null }
}

async function pngBase64(url: string): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const img = new Image(); img.src = url; await img.decode()
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
    c.getContext('2d')!.drawImage(img, 0, 0)
    return { data: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight }
  } catch { return null }
}

export async function generarPptPropuesta(d: DatosPpt): Promise<void> {
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE' // 13,33 × 7,5 pulgadas
  pptx.author = 'Movimagen'
  pptx.company = 'Movimagen'
  pptx.title = `Propuesta ${d.cliente}`

  const W = 13.333, H = 7.5
  const sym = d.moneda === 'USD' ? 'US$ ' : '$ '
  const money = (n: number) => sym + Math.round(n).toLocaleString('es-UY')
  const miles = (n: number) => n >= 1e6 ? `${(n / 1e6).toLocaleString('es-UY', { maximumFractionDigits: 1 })} M` : n >= 1e3 ? `${Math.round(n / 1e3).toLocaleString('es-UY')} mil` : String(Math.round(n))
  const periodo = d.desde && d.hasta ? `${d.desde} al ${d.hasta}` : ''

  const [logoBlanco, logoNaranja] = await Promise.all([pngBase64('/brand/logo-blanco-700.png'), pngBase64('/brand/logo-color-520.png')])
  const fotos = await Promise.all(d.items.map(i => (i.foto ? fotoBase64(i.foto) : Promise.resolve(null))))

  const pie = (s: any) => {
    if (logoNaranja) { const h = 0.32; s.addImage({ data: logoNaranja.data, x: W - 0.5 - h * logoNaranja.w / logoNaranja.h, y: H - 0.55, w: h * logoNaranja.w / logoNaranja.h, h }) }
  }

  // ── Portada ──────────────────────────────────────────────────────────────
  {
    const s = pptx.addSlide()
    s.background = { color: NARANJA }
    if (logoBlanco) { const h = 0.75; s.addImage({ data: logoBlanco.data, x: 0.8, y: 0.7, w: h * logoBlanco.w / logoBlanco.h, h }) }
    s.addText('PROPUESTA COMERCIAL', { x: 0.8, y: 2.55, w: 11.5, h: 0.5, fontFace: FUENTE, fontSize: 16, bold: true, color: 'FFE3D2', charSpacing: 4 })
    s.addText(d.cliente || 'Cliente', { x: 0.8, y: 3.05, w: 11.5, h: 1.2, fontFace: FUENTE, fontSize: 48, bold: true, color: 'FFFFFF', fit: 'shrink' })
    const sub = [d.campana, d.marca].filter(Boolean).join(' · ')
    if (sub) s.addText(sub, { x: 0.8, y: 4.25, w: 11.5, h: 0.6, fontFace: FUENTE, fontSize: 22, color: 'FFFFFF' })
    if (periodo) s.addText(`Campaña del ${periodo}`, { x: 0.8, y: 4.9, w: 11.5, h: 0.5, fontFace: FUENTE, fontSize: 16, color: 'FFE3D2' })
    s.addText(new Date().toLocaleDateString('es-UY', { day: 'numeric', month: 'long', year: 'numeric' }) + (d.numero ? ` · ${d.numero}` : ''),
      { x: 0.8, y: 6.6, w: 8, h: 0.4, fontFace: FUENTE, fontSize: 12, color: 'FFE3D2' })
  }

  // ── Resumen de la campaña ────────────────────────────────────────────────
  {
    const s = pptx.addSlide()
    s.background = { color: 'FFFFFF' }
    s.addText('Tu campaña', { x: 0.8, y: 0.6, w: 11, h: 0.8, fontFace: FUENTE, fontSize: 32, bold: true, color: TINTA })
    s.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.45, w: 1.2, h: 0.08, fill: { color: NARANJA }, line: { color: NARANJA } })
    const unidades = d.items.reduce((t, i) => t + i.cantidad, 0)
    const impactos = d.items.reduce((t, i) => t + i.impactos, 0)
    const kpis = [
      { v: String(unidades), l: unidades === 1 ? 'soporte' : 'soportes' },
      { v: periodo ? `${Math.max(...d.items.map(i => i.semanas))} sem.` : '—', l: periodo || 'duración' },
      ...(impactos ? [{ v: miles(impactos), l: 'impactos estimados' }] : []),
      ...(d.incluirPrecios ? [{ v: money(d.items.reduce((t, i) => t + i.tot, 0)), l: 'inversión total con IVA' }] : []),
    ]
    const ancho = (W - 1.6 - (kpis.length - 1) * 0.3) / kpis.length
    kpis.forEach((k, n) => {
      const x = 0.8 + n * (ancho + 0.3)
      s.addShape(pptx.ShapeType.roundRect, { x, y: 2.1, w: ancho, h: 1.8, fill: { color: CLARO }, line: { color: CLARO }, rectRadius: 0.12 })
      s.addText(k.v, { x, y: 2.35, w: ancho, h: 0.8, align: 'center', fontFace: FUENTE, fontSize: 30, bold: true, color: NARANJA, fit: 'shrink' })
      s.addText(k.l, { x, y: 3.15, w: ancho, h: 0.5, align: 'center', fontFace: FUENTE, fontSize: 13, color: GRIS })
    })
    // Lista de lo que incluye
    const lineas = d.items.map(i => ({
      text: `${i.cantidad > 1 ? `${i.cantidad} × ` : ''}${i.nombre}${i.ubicacion ? ` — ${i.ubicacion}` : ''} · ${i.semanas} sem.`,
      options: { bullet: { code: '25CF' }, color: TINTA, breakLine: true },
    }))
    s.addText(lineas as any, { x: 0.8, y: 4.3, w: 11.7, h: 2.6, fontFace: FUENTE, fontSize: 14, valign: 'top', paraSpaceAfter: 4, fit: 'shrink' })
    pie(s)
  }

  // ── Una diapositiva por soporte ──────────────────────────────────────────
  d.items.forEach((i, n) => {
    const s = pptx.addSlide()
    s.background = { color: 'FFFFFF' }
    const FW = 8.2
    const foto = fotos[n]
    if (foto) {
      s.addImage({ data: foto.data, x: 0, y: 0, w: FW, h: H, sizing: { type: 'cover', w: FW, h: H } })
    } else {
      s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: FW, h: H, fill: { color: CLARO }, line: { color: CLARO } })
      s.addText(i.nombre, { x: 0.5, y: H / 2 - 0.6, w: FW - 1, h: 1.2, align: 'center', fontFace: FUENTE, fontSize: 26, bold: true, color: 'C9C6C0' })
    }
    const color = COLOR_CAT[i.categoria ?? ''] ?? NARANJA
    const x = FW + 0.5, ancho = W - FW - 0.9
    s.addShape(pptx.ShapeType.rect, { x: FW, y: 0, w: 0.12, h: H, fill: { color }, line: { color } })
    s.addText((i.seccion || i.categoria || '').toUpperCase(), { x, y: 0.6, w: ancho, h: 0.4, fontFace: FUENTE, fontSize: 11, bold: true, color, charSpacing: 2 })
    s.addText(i.nombre, { x, y: 1.0, w: ancho, h: 1.2, fontFace: FUENTE, fontSize: 26, bold: true, color: TINTA, valign: 'top', fit: 'shrink' })
    if (i.ubicacion) s.addText(i.ubicacion, { x, y: 2.2, w: ancho, h: 0.9, fontFace: FUENTE, fontSize: 14, color: GRIS, valign: 'top', fit: 'shrink' })
    const datos: [string, string][] = [
      ['Cantidad', String(i.cantidad)],
      ['Duración', `${i.semanas} semana${i.semanas === 1 ? '' : 's'}`],
      ...(periodo ? [['Período', periodo] as [string, string]] : []),
      ...(i.medidas ? [['Medidas', i.medidas] as [string, string]] : []),
      ...(i.salidas ? [['Salidas por hora', String(i.salidas)] as [string, string]] : []),
      ...(i.impactos ? [['Impactos estimados', miles(i.impactos)] as [string, string]] : []),
      ...(d.incluirPrecios ? [['Inversión (sin IVA)', money(i.arr + i.prod + i.imp)] as [string, string]] : []),
    ]
    datos.forEach(([k, v], j) => {
      const y = 3.3 + j * 0.52
      s.addText(k, { x, y, w: ancho * 0.48, h: 0.42, fontFace: FUENTE, fontSize: 12, color: GRIS })
      s.addText(v, { x: x + ancho * 0.48, y, w: ancho * 0.52, h: 0.42, fontFace: FUENTE, fontSize: 12, bold: true, color: TINTA, align: 'right', fit: 'shrink' })
    })
    pie(s)
  })

  // ── Inversión ────────────────────────────────────────────────────────────
  if (d.incluirPrecios) {
    const s = pptx.addSlide()
    s.background = { color: 'FFFFFF' }
    s.addText('Inversión', { x: 0.8, y: 0.5, w: 11, h: 0.8, fontFace: FUENTE, fontSize: 32, bold: true, color: TINTA })
    s.addShape(pptx.ShapeType.rect, { x: 0.8, y: 1.35, w: 1.2, h: 0.08, fill: { color: NARANJA }, line: { color: NARANJA } })
    const cab = ['Soporte', 'Cant.', 'Sem.', 'Arrendamiento', 'Producción', 'Impuestos', 'Total s/IVA']
    const celda = (t: string, o: any = {}) => ({ text: t, options: { fontFace: FUENTE, fontSize: 11, color: TINTA, ...o } })
    const filas: any[] = [cab.map((t, k) => celda(t, { bold: true, color: 'FFFFFF', fill: { color: NARANJA }, align: k ? 'right' : 'left' }))]
    for (const i of d.items) {
      filas.push([
        celda(`${i.nombre}${i.ubicacion ? `\n${i.ubicacion}` : ''}`),
        celda(String(i.cantidad), { align: 'right' }), celda(String(i.semanas), { align: 'right' }),
        celda(money(i.arr), { align: 'right' }), celda(i.prod ? money(i.prod) : '—', { align: 'right' }),
        celda(i.imp ? money(i.imp) : '—', { align: 'right' }), celda(money(i.arr + i.prod + i.imp), { align: 'right', bold: true }),
      ])
    }
    const t = d.items.reduce((a, i) => ({ arr: a.arr + i.arr, prod: a.prod + i.prod, imp: a.imp + i.imp, iva: a.iva + i.ivaArr + i.ivaProd, tot: a.tot + i.tot }), { arr: 0, prod: 0, imp: 0, iva: 0, tot: 0 })
    const neto = t.arr + t.prod + t.imp
    filas.push([celda('Subtotal sin IVA', { bold: true, fill: { color: CLARO } }), celda('', { fill: { color: CLARO } }), celda('', { fill: { color: CLARO } }),
      celda(money(t.arr), { align: 'right', bold: true, fill: { color: CLARO } }), celda(money(t.prod), { align: 'right', bold: true, fill: { color: CLARO } }),
      celda(money(t.imp), { align: 'right', bold: true, fill: { color: CLARO } }), celda(money(neto), { align: 'right', bold: true, fill: { color: CLARO } })])
    s.addTable(filas, { x: 0.8, y: 1.7, w: W - 1.6, colW: [4.6, 0.8, 0.8, 1.6, 1.4, 1.3, 1.233], border: { type: 'solid', color: 'E5E3DC', pt: 0.75 }, autoPage: true, autoPageRepeatHeader: true })
    s.addText([
      { text: `IVA ${money(t.iva)}   ·   `, options: { color: GRIS } },
      { text: `TOTAL ${money(t.tot)}`, options: { color: NARANJA, bold: true } },
    ] as any, { x: 0.8, y: H - 1.25, w: W - 1.6, h: 0.5, align: 'right', fontFace: FUENTE, fontSize: 18 })
    if (d.observaciones) s.addText(d.observaciones, { x: 0.8, y: H - 0.75, w: 9, h: 0.4, fontFace: FUENTE, fontSize: 10, color: GRIS, fit: 'shrink' })
    pie(s)
  }

  // ── Cierre ───────────────────────────────────────────────────────────────
  {
    const s = pptx.addSlide()
    s.background = { color: NARANJA }
    s.addText('¡Gracias!', { x: 0.8, y: 2.3, w: 11.5, h: 1.2, fontFace: FUENTE, fontSize: 54, bold: true, color: 'FFFFFF' })
    const contacto = [d.vendedor?.nombre, d.vendedor?.email].filter(Boolean).join(' · ')
    s.addText([contacto, 'www.movimagen.com.uy'].filter(Boolean).join('\n'), { x: 0.8, y: 3.7, w: 11.5, h: 1.2, fontFace: FUENTE, fontSize: 18, color: 'FFFFFF', valign: 'top' })
    if (logoBlanco) { const h = 0.6; s.addImage({ data: logoBlanco.data, x: 0.8, y: H - 1.3, w: h * logoBlanco.w / logoBlanco.h, h }) }
  }

  const archivo = `Propuesta ${d.cliente || 'Movimagen'}${d.campana ? ` - ${d.campana}` : ''}.pptx`.replace(/[\\/:*?"<>|]/g, '')
  // Descarga propia: con writeFile algunos navegadores lo bajaban como
  // "download", sin nombre ni extensión.
  const blob = await pptx.write({ outputType: 'blob' }) as Blob
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }))
  const a = document.createElement('a')
  a.href = url; a.download = archivo
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
