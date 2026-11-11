/**
 * Presentación comercial (PowerPoint) de una cotización, igual al brochure de
 * Movimagen: la portada, una diapositiva por soporte con su foto a pantalla
 * completa (los ruteros con el formato del brochure: ruta, km, departamento,
 * vista, ubicación y tamaño), la propuesta económica si se eligen precios y
 * el cierre. Las medidas salen del brochure (1440 × 810 pt → 13,33 × 7,5 in).
 * Se arma en el navegador (pptxgenjs); `armarPresentacion` no depende de él.
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
  impactosMensuales?: number | null
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
  logosShopping?: Record<string, Img | null>
}

const NARANJA = 'EB691C'
const TINTA = '1A1A1A'
const GRIS = '6B6B6B'
const LINEA = 'E4E4E4'
const BLANCO = 'FFFFFF'
// La letra del brochure. Si la compu no la tiene, PowerPoint usa otra parecida.
const F = 'Montserrat'
const W = 13.333, H = 7.5
const PT = W / 1440 // un punto del brochure, en pulgadas

const sinTildes = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** "PANTALLA GIGANTE CURVA" → "Pantalla gigante curva" (como en el brochure). */
const nombreLindo = (t: string) => t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{3}/.test(t) ? t.charAt(0) + t.slice(1).toLowerCase() : t

/** Ancho de un texto en Montserrat negrita, en pulgadas (calibrado con el brochure). */
const anchoTexto = (t: string, pt: number) =>
  t.split('').reduce((a, c) => a + (c === ' ' ? 0.28 : /[A-ZÁÉÍÓÚÑMW]/.test(c) ? 0.74 : /[il.,:;'|!1]/.test(c) ? 0.3 : 0.6), 0) * pt / 72

/** El shopping de un soporte (para su logo), por la ubicación o el nombre. */
export function shoppingDe(i: { nombre: string; ubicacion: string | null }): string | null {
  const n = sinTildes(`${i.ubicacion ?? ''} ${i.nombre}`)
  for (const k of ['atlantico', 'colonia', 'salto', 'mercedes', 'paysandu', 'minas']) if (n.includes(k)) return k
  if (n.includes('punta del este')) return 'atlantico'
  return null
}

/** Rutero: de "Ruta IB Km. 33.000" / "Interbalnearia Km 21.7 · …" saca ruta, km, vista y margen. */
function datosRutero(i: ItemPpt) {
  const txt = sinTildes(`${i.nombre} · ${i.ubicacion ?? ''}`)
  const m = txt.match(/(?:ruta|r)\s*(ib|\d+)\s*km\.?\s*([\d.]+)/) || txt.match(/(interbalnearia)\s*km\.?\s*([\d.]+)/)
  if (!m) return null
  const ruta = m[1] === 'ib' || m[1] === 'interbalnearia' ? 'Ruta Interbalnearia' : `Ruta ${m[1]}`
  const km = Number(m[2])
  const vista = (txt.match(/(?:vista|sentido)\s+(?:hacia\s+el\s+)?(este|oeste|norte|sur)/) || [])[1]
  const margen = (txt.match(/margen\s+(derecha|izquierda)/) || [])[1]
  // El departamento: el primer tramo de la ubicación que no sea la ruta ni el km.
  const tramos = (i.ubicacion ?? '').split(/\s*[·/]\s*/).map(s => s.trim()).filter(Boolean)
  const DEPTOS = ['Montevideo', 'Canelones', 'Maldonado', 'San José', 'Colonia', 'Florida', 'Rocha', 'Lavalleja', 'Durazno', 'Soriano']
  const depto = DEPTOS.find(dp => tramos.some(t => sinTildes(t) === sinTildes(dp))) ?? DEPTOS.find(dp => sinTildes(i.ubicacion ?? '').includes(sinTildes(dp))) ?? null
  const cap = (s?: string) => s ? s[0].toUpperCase() + s.slice(1) : null
  return {
    ruta, km: `Km ${Math.floor(km)}.${String(Math.round((km % 1) * 1000)).padStart(3, '0')}`, // "Km 33.000"
    depto, vista: vista ? `Vista hacia el ${cap(vista)}` : null, margen: cap(margen),
    tamano: i.medidas || (i.ubicacion ?? '').match(/(\d+\s*x\s*\d+\s*m)/)?.[1] || null,
  }
}

/** "8 x 12 m" → "96 m² (8 x 12)", como en el brochure. */
function superficie(medidas?: string | null) {
  const m = (medidas ?? '').match(/([\d.,]+)\s*x\s*([\d.,]+)/)
  if (!m) return null
  const a = Number(m[1].replace(',', '.')), b = Number(m[2].replace(',', '.'))
  return `${Math.round(a * b).toLocaleString('es-UY')} m²  (${m[1]} x ${m[2]})`
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

  // Imagen que cubre la caja (recorta lo que sobra, sin deformar).
  const cubrir = (s: any, img: Img, x: number, y: number, w: number, h: number) =>
    s.addImage({ data: img.data, x, y, w, h: w * img.h / img.w, sizing: { type: 'cover', w, h } })
  const circuloMv = (s: any) => { if (r.mv) s.addImage({ data: r.mv.data, x: 1348 * PT, y: 17 * PT, w: 76 * PT, h: 76 * PT }) }
  const raya = (s: any, x: number, y: number, w: number, color = NARANJA, grosor = 1.5) =>
    s.addShape('line', { x, y, w, h: 0, line: { color, width: grosor } })
  // Franja naranja con el texto en blanco (el "pill" del brochure).
  const franja = (s: any, texto: string, x: number, y: number, pt: number, h = pt * 1.55 / 72, pad = 0.17) => {
    s.addText(texto, {
      x, y, w: Math.min(W - x - 0.4, anchoTexto(texto, pt) * 1.04 + 2 * pad + 0.05), h,
      fontFace: F, fontSize: pt, bold: true, color: BLANCO, fill: { color: NARANJA }, wrap: false,
      shape: 'roundRect', rectRadius: 0.05, valign: 'middle', margin: [0, pad * 72, 0, pad * 72],
    })
  }

  // ── Portada (la del brochure) ────────────────────────────────────────────
  {
    const s = pptx.addSlide()
    s.background = { color: NARANJA }
    if (r.portada) cubrir(s, r.portada, 0, 0, W, H)
    if (r.logo) { const w = 6.1; s.addImage({ data: r.logo.data, x: (W - w) / 2, y: 1.15, w, h: w * r.logo.h / r.logo.w }) }
    raya(s, 0, 2.9, 3.25, BLANCO)
    raya(s, W - 3.25, 2.9, 3.25, BLANCO)
    s.addText('PRESENTACIÓN COMERCIAL', { x: 3.25, y: 2.6, w: W - 6.5, h: 0.6, align: 'center', fontFace: F, fontSize: 24, color: BLANCO, margin: 0 })
  }

  // ── Una diapositiva por soporte ──────────────────────────────────────────
  d.items.forEach((i, n) => {
    const s = pptx.addSlide()
    s.background = { color: TINTA }
    const foto = r.fotos[n] ?? r.portada
    if (foto) cubrir(s, foto, 0, 0, W, H)
    const rutero = i.categoria === 'Ruta' ? datosRutero(i) : null

    if (rutero) {
      // Formato rutero: todo arriba, sobre una sombra.
      if (r.sombraArriba) s.addImage({ data: r.sombraArriba.data, x: 0, y: 0, w: W, h: 2.6 })
      circuloMv(s)
      raya(s, 84 * PT, 76 * PT, 53 * PT)
      s.addText(rutero.ruta.toUpperCase(), { x: 150 * PT, y: 61 * PT, w: 6, h: 30 * PT, fontFace: F, fontSize: 16, bold: true, color: NARANJA, margin: 0, valign: 'middle' })
      const wKm = anchoTexto(rutero.km, 40) * 1.13
      s.addText(rutero.km, { x: 72 * PT, y: 101 * PT, w: wKm + 0.2, h: 74 * PT, fontFace: F, fontSize: 40, bold: true, color: BLANCO, margin: 0, valign: 'middle', wrap: false })
      let x = 72 * PT + wKm + 0.2
      const sep = (xx: number) => s.addShape('line', { x: xx, y: 112 * PT, w: 0, h: 58 * PT, line: { color: NARANJA, width: 1.5 } })
      if (rutero.depto || rutero.vista) {
        sep(x); x += 0.15
        if (rutero.depto) franja(s, rutero.depto, x, 111 * PT, 16, 27 * PT, 0.07)
        if (rutero.vista) s.addText(rutero.vista, { x, y: 140 * PT, w: 3.5, h: 30 * PT, fontFace: F, fontSize: 16, bold: true, color: BLANCO, margin: 0, valign: 'middle', wrap: false })
        x += Math.max(rutero.depto ? anchoTexto(rutero.depto, 16) * 1.04 + 0.19 : 0, rutero.vista ? anchoTexto(rutero.vista, 16) * 1.04 : 0) + 0.2
      }
      if (rutero.margen || rutero.tamano) {
        sep(x); x += 0.15
        const lineas = [
          ...(rutero.margen ? [{ text: `Ubicación: ${rutero.margen}`, options: { breakLine: !!rutero.tamano } }] : []),
          ...(rutero.tamano ? [{ text: `Tamaño:  ${rutero.tamano}` }] : []),
        ]
        s.addText(lineas as any, { x, y: 110 * PT, w: 4.5, h: 60 * PT, fontFace: F, fontSize: 16, bold: true, color: BLANCO, margin: 0, valign: 'middle', wrap: false })
      }
      return
    }

    // Formato foto: sombra abajo, título (franja naranja o texto) y un dato.
    if (r.sombraAbajo) s.addImage({ data: r.sombraAbajo.data, x: 0, y: H - 3.6, w: W, h: 3.6 })
    circuloMv(s)
    const X = 80 * PT
    const shopping = i.categoria === 'Shopping' ? shoppingDe(i) : null
    const logo = shopping ? r.logosShopping?.[shopping] : null
    if (logo) {
      const lado = 0.62
      s.addShape('roundRect', { x: 0.45, y: 0.3, w: lado, h: lado, fill: { color: BLANCO }, line: { color: BLANCO }, rectRadius: 0.06 })
      const k = Math.min((lado - 0.1) / logo.w, (lado - 0.1) / logo.h)
      s.addImage({ data: logo.data, x: 0.45 + (lado - logo.w * k) / 2, y: 0.3 + (lado - logo.h * k) / 2, w: logo.w * k, h: logo.h * k })
    }

    let titulo: string, dato: { k: string; v: string } | null = null, conFranja = true
    if (i.categoria === 'Exterior') {
      // "Av. Italia y Francisco Simón" + "Medianera de 96 m² (8 x 12)"
      titulo = (i.ubicacion ?? i.nombre).split(/\s+[-·]\s+/)[0]
      const sup = superficie(i.medidas ?? (i.ubicacion ?? '').match(/(\d+\s*x\s*\d+)/)?.[1])
      dato = { k: `${nombreLindo(i.nombre).replace(/\s+edificio$/i, '')}${sup ? ' de ' : ''}`, v: sup ?? '' }
    } else if (i.categoria === 'Bus') {
      titulo = i.nombre.toUpperCase()                      // "FULL BUS", "MEGA BUS"
    } else if (i.categoria === 'Shopping') {
      titulo = nombreLindo(i.nombre).replace(/\s+shopping$/i, '') // "Puertas de ingreso", "Ascensor"
      conFranja = false
      if (i.ubicacion) dato = { k: '', v: /shopping/i.test(i.ubicacion) ? i.ubicacion : `${i.ubicacion} Shopping` }
    } else {
      // Pantallas: "Pantalla gigante Av. Rivera y L. A. de Herrera" + impactos mensuales
      titulo = `${nombreLindo(i.nombre)}${i.ubicacion ? ` ${i.ubicacion}` : ''}`
      if (i.impactosMensuales) dato = { k: 'Impactos mensuales: ', v: num(i.impactosMensuales) }
    }
    if (i.cantidad > 1) titulo = `${i.cantidad} × ${titulo}`

    const pt = anchoTexto(titulo, 28) > W - 2 ? 24 : 28
    const yTitulo = dato ? 628 * PT : 680 * PT
    if (conFranja) franja(s, titulo, X, yTitulo, pt)
    else s.addText(titulo, { x: X, y: yTitulo, w: W - 2, h: pt * 1.55 / 72, fontFace: F, fontSize: pt, bold: true, color: BLANCO, margin: 0, valign: 'middle', wrap: false })
    if (dato) {
      s.addText([
        { text: dato.k, options: { bold: false } },
        { text: dato.v, options: { bold: true } },
      ] as any, { x: X, y: 697 * PT, w: W - 2, h: 36 * PT, fontFace: F, fontSize: 19, color: BLANCO, margin: 0, valign: 'middle' })
    }
    raya(s, X, 760 * PT, 1.7)
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
      s.background = { color: BLANCO }
      circuloMv(s)
      raya(s, 0.6, 0.72, 0.45)
      s.addText('INVERSIÓN', { x: 1.15, y: 0.55, w: 6, h: 0.34, fontFace: F, fontSize: 12, bold: true, color: NARANJA, margin: 0 })
      s.addText(`Propuesta para ${d.cliente || 'vos'}${hojas > 1 ? ` (${h + 1}/${hojas})` : ''}`, { x: 0.6, y: 0.95, w: 11, h: 0.7, fontFace: F, fontSize: 26, bold: true, color: TINTA, fit: 'shrink', margin: 0 })
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
      const col = (x: number, v: string, l: string, grande = false) => {
        s.addText(v, { x, y: 5.75, w: 2.6, h: 0.7, align: 'center', fontFace: F, fontSize: grande ? 30 : 20, bold: true, color: grande ? NARANJA : TINTA, fit: 'shrink', margin: 0 })
        s.addText(l, { x, y: 6.45, w: 2.6, h: 0.3, align: 'center', fontFace: F, fontSize: 9, bold: true, color: grande ? NARANJA : GRIS, margin: 0 })
      }
      col(W - 0.6 - 3.4 - 2 * 2.4, money(t.neto), 'SIN IVA')
      col(W - 0.6 - 3.4 - 2.4, money(t.iva), 'IVA 22%')
      s.addShape('line', { x: W - 0.6 - 3.5, y: 5.85, w: 0, h: 0.85, line: { color: NARANJA, width: 1 } })
      col(W - 0.6 - 3.2, money(t.tot), 'TOTAL CON IVA', true)
      const periodo = d.desde && d.hasta ? `Campaña del ${d.desde} al ${d.hasta}.` : ''
      const notas = [periodo, d.observaciones, d.moneda === 'USD' ? 'Importes en dólares.' : 'Importes en pesos uruguayos.'].filter(Boolean).join('  ·  ')
      s.addText(notas, { x: 0.6, y: 6.95, w: W - 1.2, h: 0.35, fontFace: F, fontSize: 9, color: GRIS, fit: 'shrink', margin: 0 })
    }
  }

  // ── Cierre (el del brochure) ─────────────────────────────────────────────
  {
    const s = pptx.addSlide()
    s.background = { color: NARANJA }
    if (r.logo) { const w = 5.6; s.addImage({ data: r.logo.data, x: (W - w) / 2, y: 1.6, w, h: w * r.logo.h / r.logo.w }) }
    s.addText([
      { text: 'www.movimagen.com', options: { bold: true, breakLine: true } },
      { text: 'LinkedIn: movimagen', options: { breakLine: true } },
      { text: 'Instagram: movimagenok', options: { breakLine: true } },
      { text: ' ', options: { breakLine: true } },
      { text: 'Almirante Harwood 6411 esq. Cooper', options: { breakLine: true } },
      { text: 'Tel + (598) 2600 1881', options: { breakLine: true } },
      { text: 'Montevideo / Uruguay ·  CP. 11500' },
    ] as any, { x: 1.5, y: 3.75, w: W - 3, h: 3.3, align: 'center', valign: 'top', fontFace: F, fontSize: 16, color: BLANCO, paraSpaceAfter: 3, margin: 0 })
  }

  return pptx
}

/** Imagen achicada (≤ 1600 px) para que la presentación no pese de más. */
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
  const shoppings = Array.from(new Set(d.items.filter(i => i.categoria === 'Shopping').map(shoppingDe).filter(Boolean))) as string[]
  const [portada, logo, mv, sombraAbajo, sombraArriba, ...resto] = await Promise.all([
    cargarImagen('/presentacion/portada.jpg', 'jpeg'),
    cargarImagen('/presentacion/logo-blanco.png', 'png'),
    cargarImagen('/presentacion/mv.png', 'png'),
    cargarImagen('/presentacion/sombra-abajo.png', 'png'),
    cargarImagen('/presentacion/sombra-arriba.png', 'png'),
    ...shoppings.map(k => cargarImagen(`/logos-shoppings/${k}.png`, 'png')),
    ...d.items.map(i => (i.foto ? cargarImagen(i.foto, 'jpeg') : Promise.resolve(null))),
  ])
  const logosShopping = Object.fromEntries(shoppings.map((k, j) => [k, resto[j]]))
  const fotos = resto.slice(shoppings.length)
  const pptx = await armarPresentacion(PptxGenJS, d, { portada, logo, mv, sombraAbajo, sombraArriba, fotos, logosShopping })

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
