/**
 * Presentación comercial (PowerPoint) de una cotización, con el estilo del
 * brochure de Movimagen: portada ilustrada, resumen de la campaña, una
 * diapositiva por soporte con su foto a pantalla completa, la propuesta
 * económica y el cierre con los datos de contacto. Se arma en el navegador
 * (pptxgenjs); `armarPresentacion` no depende del navegador.
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

export interface Img { data: string; w: number; h: number }
export interface Recursos {
  portada: Img | null
  logo: Img | null
  mv: Img | null
  sombraAbajo: Img | null
  sombraArriba: Img | null
  fotos: (Img | null)[]
}

const NARANJA = 'EB691C'
const TINTA = '1A1A1A'
const GRIS = '6B6B6B'
const LINEA = 'E4E4E4'
// La letra del brochure. Si la compu no la tiene, PowerPoint usa otra parecida.
const F = 'Montserrat'
const W = 13.333, H = 7.5

/** "PANTALLA GIGANTE CURVA" → "Pantalla gigante curva" (como en el brochure). */
const nombreLindo = (t: string) => t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{3}/.test(t) ? t.charAt(0) + t.slice(1).toLowerCase() : t

/** Ancho aproximado de un texto en Montserrat negrita, en pulgadas. */
const anchoTexto = (t: string, pt: number) =>
  t.split('').reduce((a, c) => a + (c === ' ' ? 0.28 : /[A-ZÁÉÍÓÚÑMW]/.test(c) ? 0.74 : /[il.,:;'|!1]/.test(c) ? 0.3 : 0.6), 0) * pt / 72

const SECCION: Record<string, string> = {
  Digital: 'Pantallas digitales', Shopping: 'Shoppings', Exterior: 'Vía pública', Bus: 'Buses', Ruta: 'Rutas',
}

/** Arma la presentación (sin descargarla). */
export async function armarPresentacion(PptxGenJS: any, d: DatosPpt, r: Recursos) {
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE' // 13,33 × 7,5 pulgadas
  pptx.author = 'Movimagen'
  pptx.company = 'Movimagen'
  pptx.title = `Propuesta ${d.cliente}`

  const sym = d.moneda === 'USD' ? 'US$ ' : '$ '
  const money = (n: number) => sym + Math.round(n).toLocaleString('es-UY')
  const num = (n: number) => Math.round(n).toLocaleString('es-UY')
  const periodo = d.desde && d.hasta ? `${d.desde} al ${d.hasta}` : ''
  const semanas = Math.max(0, ...d.items.map(i => i.semanas))

  // Imagen que cubre la caja (recorta lo que sobra, sin deformar).
  const cubrir = (s: any, img: Img, x: number, y: number, w: number, h: number) =>
    s.addImage({ data: img.data, x, y, w, h: w * img.h / img.w, sizing: { type: 'cover', w, h } })
  const circuloMv = (s: any) => { if (r.mv) s.addImage({ data: r.mv.data, x: W - 0.95, y: 0.2, w: 0.72, h: 0.72 }) }
  // "—— TÍTULO": la línea naranja y el texto en mayúsculas, como el brochure.
  const ceja = (s: any, texto: string, x: number, y: number, color = NARANJA) => {
    s.addShape('line', { x, y: y + 0.17, w: 0.45, h: 0, line: { color, width: 1.5 } })
    s.addText(texto.toUpperCase(), { x: x + 0.55, y, w: 9, h: 0.34, fontFace: F, fontSize: 12, bold: true, color, margin: 0 })
  }

  // ── Portada ──────────────────────────────────────────────────────────────
  {
    const s = pptx.addSlide()
    s.background = { color: NARANJA }
    if (r.portada) cubrir(s, r.portada, 0, 0, W, H)
    if (r.logo) { const w = 6.1; s.addImage({ data: r.logo.data, x: (W - w) / 2, y: 1.15, w, h: w * r.logo.h / r.logo.w }) }
    s.addShape('line', { x: 0, y: 2.9, w: 3.25, h: 0, line: { color: 'FFFFFF', width: 1.5 } })
    s.addShape('line', { x: W - 3.25, y: 2.9, w: 3.25, h: 0, line: { color: 'FFFFFF', width: 1.5 } })
    s.addText('PROPUESTA COMERCIAL', { x: 3.25, y: 2.6, w: W - 6.5, h: 0.6, align: 'center', fontFace: F, fontSize: 24, color: 'FFFFFF', margin: 0 })
    const para = [d.cliente, d.campana].filter(Boolean).join(' · ')
    if (para) s.addText(para, { x: 1.5, y: 3.2, w: W - 3, h: 0.5, align: 'center', fontFace: F, fontSize: 16, bold: true, color: 'FFFFFF', fit: 'shrink', margin: 0 })
  }

  // ── Tu campaña ───────────────────────────────────────────────────────────
  {
    const s = pptx.addSlide()
    s.background = { color: 'FFFFFF' }
    circuloMv(s)
    ceja(s, `Propuesta para ${d.cliente || 'vos'}`, 0.6, 0.55)
    s.addText(d.campana || 'Tu campaña en vía pública', { x: 0.6, y: 0.95, w: 9, h: 0.7, fontFace: F, fontSize: 26, bold: true, color: TINTA, fit: 'shrink', margin: 0 })
    if (periodo) s.addText(`Del ${periodo}`, { x: 0.6, y: 1.6, w: 9, h: 0.4, fontFace: F, fontSize: 13, color: GRIS, margin: 0 })

    // Lo que incluye, en dos columnas como las ciudades del brochure.
    const lineas = d.items.map(i => [
      { text: `${i.cantidad > 1 ? `${i.cantidad} × ` : ''}${nombreLindo(i.nombre)}`, options: { bold: true, color: TINTA, breakLine: !!i.ubicacion } },
      ...(i.ubicacion ? [{ text: i.ubicacion, options: { color: GRIS, fontSize: 12 } }] : []),
    ])
    const porCol = Math.ceil(lineas.length / (lineas.length > 6 ? 2 : 1))
    const cols = lineas.length > 6 ? [lineas.slice(0, porCol), lineas.slice(porCol)] : [lineas]
    cols.forEach((col, c) => {
      const x = 0.6 + c * 4.45
      if (c) s.addShape('line', { x: x - 0.25, y: 2.4, w: 0, h: 3.3, line: { color: LINEA, width: 1 } })
      s.addText(col.flatMap((l, k) => k < col.length - 1 ? [...l.slice(0, -1), { ...l[l.length - 1], options: { ...l[l.length - 1].options, breakLine: true } }] : l) as any,
        { x, y: 2.35, w: lineas.length > 6 ? 4.1 : 8.4, h: 3.6, fontFace: F, fontSize: lineas.length > 6 ? 13 : 16, valign: 'top', paraSpaceAfter: 10, ...(lineas.length > 6 ? { fit: 'shrink' } : {}), margin: 0 })
    })

    // Los números a la derecha, en naranja y separados por rayitas.
    const impactos = d.items.reduce((t, i) => t + i.impactos, 0)
    const unidades = d.items.reduce((t, i) => t + i.cantidad, 0)
    const kpis = [
      { v: String(unidades), l: unidades === 1 ? 'SOPORTE' : 'SOPORTES' },
      ...(semanas ? [{ v: String(semanas), l: semanas === 1 ? 'SEMANA' : 'SEMANAS' }] : []),
      ...(new Set(d.items.map(i => i.categoria).filter(Boolean)).size > 1 ? [{ v: String(new Set(d.items.map(i => i.categoria).filter(Boolean)).size), l: 'FORMATOS' }] : []),
    ]
    kpis.forEach((k, n) => {
      const y = 1.2 + n * 1.45
      if (n) s.addShape('line', { x: 10.35, y: y - 0.2, w: 1.3, h: 0, line: { color: NARANJA, width: 1 } })
      s.addText(k.v, { x: 9.5, y, w: 3, h: 0.7, align: 'center', fontFace: F, fontSize: 36, bold: true, color: NARANJA, margin: 0 })
      s.addText(k.l, { x: 9.5, y: y + 0.68, w: 3, h: 0.3, align: 'center', fontFace: F, fontSize: 9, bold: true, color: TINTA, margin: 0 })
    })
    if (impactos) s.addText(`+${num(impactos)} impactos estimados`, { x: 0.6, y: 6.25, w: 9, h: 0.7, fontFace: F, fontSize: 28, bold: true, color: NARANJA, fit: 'shrink', margin: 0 })
  }

  // ── Una diapositiva por soporte, con la foto a pantalla completa ─────────
  d.items.forEach((i, n) => {
    const s = pptx.addSlide()
    s.background = { color: TINTA }
    const foto = r.fotos[n] ?? r.portada
    if (foto) cubrir(s, foto, 0, 0, W, H)
    if (r.sombraArriba) s.addImage({ data: r.sombraArriba.data, x: 0, y: 0, w: W, h: 1.6 })
    if (r.sombraAbajo) s.addImage({ data: r.sombraAbajo.data, x: 0, y: H - 3.4, w: W, h: 3.4 })
    circuloMv(s)
    ceja(s, SECCION[i.categoria ?? ''] ?? i.seccion ?? i.categoria ?? 'Soporte', 0.6, 0.5, 'FFFFFF')

    // El nombre en la franja naranja.
    const titulo = `${i.cantidad > 1 ? `${i.cantidad} × ` : ''}${nombreLindo(i.nombre)}`
    const ancho = Math.min(W - 1.2, 0.4 + anchoTexto(titulo, 24))
    s.addText(titulo, { x: 0.55, y: 4.95, w: ancho, h: 0.62, fontFace: F, fontSize: 24, bold: true, color: 'FFFFFF', fill: { color: NARANJA }, rectRadius: 0.06, shape: 'roundRect', fit: 'shrink', margin: [0, 10, 0, 10] })

    const linea = (k: string, v: string) => [
      { text: `${k}: `, options: { color: 'FFFFFF' } },
      { text: v, options: { color: 'FFFFFF', bold: true } },
    ]
    const datos = [
      ...(i.ubicacion ? [linea('Ubicación', i.ubicacion)] : []),
      ...(i.impactos ? [linea('Impactos estimados', num(i.impactos))] : []),
      [
        ...(i.medidas ? linea('Medidas', i.medidas) : []),
        ...(i.medidas ? [{ text: '     ', options: {} }] : []),
        ...linea('Duración', `${i.semanas} semana${i.semanas === 1 ? '' : 's'}`),
        ...(i.salidas ? [{ text: '     ', options: {} }, ...linea('Salidas por hora', String(i.salidas))] : []),
      ],
      ...(d.incluirPrecios ? [linea('Inversión', `${money(i.arr + i.prod + i.imp)} + IVA`)] : []),
    ]
    s.addText(datos.flatMap((l, k) => k < datos.length - 1 ? [...l.slice(0, -1), { ...l[l.length - 1], options: { ...l[l.length - 1].options, breakLine: true } }] : l) as any,
      { x: 0.55, y: 5.68, w: W - 1.6, h: 1.25, fontFace: F, fontSize: 15, valign: 'top', paraSpaceAfter: 2, fit: 'shrink', margin: 0 })
    s.addShape('line', { x: 0.55, y: 7.08, w: 1.7, h: 0, line: { color: NARANJA, width: 2 } })
  })

  // ── Propuesta económica (de a 8 soportes por diapositiva) ──────────────
  if (d.incluirPrecios) {
    const POR_HOJA = 8
    const hojas = Math.max(1, Math.ceil(d.items.length / POR_HOJA))
    const borde = (abajo: string, pt = 0.75) => [{ type: 'none' }, { type: 'none' }, { type: 'solid', color: abajo, pt }, { type: 'none' }]
    const celda = (t: string, o: any = {}) => ({ text: t, options: { fontFace: F, fontSize: 11, color: TINTA, valign: 'middle', border: borde(LINEA), ...o } })
    const conProd = d.items.some(i => i.prod), conImp = d.items.some(i => i.imp)
    const cab = ['Soporte', 'Cant.', 'Semanas', 'Espacio', ...(conProd ? ['Producción'] : []), ...(conImp ? ['Impuestos'] : []), 'Subtotal']
    const extra = (conProd ? 1 : 0) + (conImp ? 1 : 0)
    const colW = [W - 1.2 - (0.8 + 1.0 + 1.6 + extra * 1.5 + 1.7), 0.8, 1.0, 1.6, ...Array(extra).fill(1.5), 1.7]

    for (let h = 0; h < hojas; h++) {
      const s = pptx.addSlide()
      s.background = { color: 'FFFFFF' }
      circuloMv(s)
      ceja(s, 'Inversión', 0.6, 0.55)
      s.addText(`Propuesta económica${hojas > 1 ? ` (${h + 1}/${hojas})` : ''}`, { x: 0.6, y: 0.95, w: 9, h: 0.7, fontFace: F, fontSize: 26, bold: true, color: TINTA, margin: 0 })
      const filas: any[] = [cab.map((t, k) => celda(t.toUpperCase(), { bold: true, fontSize: 9, color: NARANJA, align: k ? 'right' : 'left', border: borde(NARANJA, 1.5) }))]
      for (const i of d.items.slice(h * POR_HOJA, (h + 1) * POR_HOJA)) {
        filas.push([
          celda(nombreLindo(i.nombre) + (i.ubicacion ? `\n${i.ubicacion}` : ''), { bold: true }),
          celda(String(i.cantidad), { align: 'right' }), celda(String(i.semanas), { align: 'right' }),
          celda(money(i.arr), { align: 'right' }),
          ...(conProd ? [celda(i.prod ? money(i.prod) : '—', { align: 'right' })] : []),
          ...(conImp ? [celda(i.imp ? money(i.imp) : '—', { align: 'right' })] : []),
          celda(money(i.arr + i.prod + i.imp), { align: 'right', bold: true }),
        ])
      }
      s.addTable(filas, { x: 0.6, y: 1.85, w: W - 1.2, colW, margin: [4, 6, 4, 6] })
      if (h < hojas - 1) continue

      const t = d.items.reduce((a, i) => ({ neto: a.neto + i.arr + i.prod + i.imp, iva: a.iva + i.ivaArr + i.ivaProd, tot: a.tot + i.tot }), { neto: 0, iva: 0, tot: 0 })
      // Totales abajo a la derecha, como los números grandes del brochure.
      const col = (x: number, v: string, l: string, grande = false) => {
        s.addText(v, { x, y: 5.75, w: 2.6, h: 0.7, align: 'center', fontFace: F, fontSize: grande ? 30 : 20, bold: true, color: grande ? NARANJA : TINTA, fit: 'shrink', margin: 0 })
        s.addText(l, { x, y: 6.45, w: 2.6, h: 0.3, align: 'center', fontFace: F, fontSize: 9, bold: true, color: grande ? NARANJA : GRIS, margin: 0 })
      }
      col(W - 0.6 - 3.4 - 2 * 2.4, money(t.neto), 'SIN IVA')
      col(W - 0.6 - 3.4 - 2.4, money(t.iva), 'IVA 22%')
      s.addShape('line', { x: W - 0.6 - 3.5, y: 5.85, w: 0, h: 0.85, line: { color: NARANJA, width: 1 } })
      col(W - 0.6 - 3.2, money(t.tot), 'TOTAL CON IVA', true)
      const notas = [d.observaciones, d.moneda === 'USD' ? 'Importes en dólares.' : 'Importes en pesos uruguayos.'].filter(Boolean).join('  ·  ')
      s.addText(notas, { x: 0.6, y: 6.95, w: W - 1.2, h: 0.35, fontFace: F, fontSize: 9, color: GRIS, fit: 'shrink', margin: 0 })
    }
  }

  // ── Cierre ───────────────────────────────────────────────────────────────
  {
    const s = pptx.addSlide()
    s.background = { color: NARANJA }
    if (r.logo) { const w = 5.6; s.addImage({ data: r.logo.data, x: (W - w) / 2, y: 1.1, w, h: w * r.logo.h / r.logo.w }) }
    const vendedor = [d.vendedor?.nombre, d.vendedor?.email].filter(Boolean) as string[]
    s.addText([
      ...(vendedor.length ? [{ text: vendedor.join('  ·  '), options: { bold: true, breakLine: true } }, { text: ' ', options: { breakLine: true } }] : []),
      { text: 'www.movimagen.com', options: { bold: true, breakLine: true } },
      { text: 'LinkedIn: movimagen', options: { breakLine: true } },
      { text: 'Instagram: movimagenok', options: { breakLine: true } },
      { text: ' ', options: { breakLine: true } },
      { text: 'Almirante Harwood 6411 esq. Cooper', options: { breakLine: true } },
      { text: 'Tel + (598) 2600 1881', options: { breakLine: true } },
      { text: 'Montevideo / Uruguay · CP. 11500' },
    ] as any, { x: 1.5, y: 3.55, w: W - 3, h: 3.6, align: 'center', valign: 'top', fontFace: F, fontSize: 16, color: 'FFFFFF', paraSpaceAfter: 3, margin: 0 })
  }

  return pptx
}

/** Foto achicada a JPEG (≤ 1600 px) para que la presentación no pese de más. */
async function cargarImagen(url: string, tipo: 'jpeg' | 'png', max = 1600): Promise<Img | null> {
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.src = url
    await img.decode()
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k)
    const c = document.createElement('canvas'); c.width = w; c.height = h
    c.getContext('2d')!.drawImage(img, 0, 0, w, h)
    return { data: c.toDataURL(`image/${tipo}`, 0.85), w, h }
  } catch { return null }
}

export async function generarPptPropuesta(d: DatosPpt): Promise<void> {
  const PptxGenJS = (await import('pptxgenjs')).default
  const [portada, logo, mv, sombraAbajo, sombraArriba, ...fotos] = await Promise.all([
    cargarImagen('/presentacion/portada.jpg', 'jpeg'),
    cargarImagen('/presentacion/logo-blanco.png', 'png'),
    cargarImagen('/presentacion/mv.png', 'png'),
    cargarImagen('/presentacion/sombra-abajo.png', 'png'),
    cargarImagen('/presentacion/sombra-arriba.png', 'png'),
    ...d.items.map(i => (i.foto ? cargarImagen(i.foto, 'jpeg') : Promise.resolve(null))),
  ])
  const pptx = await armarPresentacion(PptxGenJS, d, { portada, logo, mv, sombraAbajo, sombraArriba, fotos })

  const archivo = `Propuesta ${d.cliente || 'Movimagen'}${d.campana ? ` - ${d.campana}` : ''}.pptx`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\\/:*?"<>|]/g, '')
  // Descarga propia: con writeFile algunos navegadores lo bajaban como
  // "download", sin nombre ni extensión.
  const blob = await pptx.write({ outputType: 'blob' }) as Blob
  const url = URL.createObjectURL(new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }))
  const a = document.createElement('a')
  a.href = url; a.download = archivo
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
