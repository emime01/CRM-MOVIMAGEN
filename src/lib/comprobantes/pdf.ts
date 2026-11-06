import {
  PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, PDFImage,
  pushGraphicsState, popGraphicsState, moveTo, lineTo, appendBezierCurve, closePath, clip, endPath,
} from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import { MONTSERRAT_BOLD_B64 } from './fuente'
import { PORTADA_BANDA_JPG, BARRA_MV_PNG, CONTRATAPA_JPG } from './plantilla'

/**
 * Comprobante de campaña en PDF, con el diseño de la plantilla de Movimagen
 * (la del comprobante de Pronto+): hojas apaisadas 16:9.
 *
 *   1. Portada: la banda naranja con el logo; abajo, el cliente y la campaña.
 *   2. Listado: tablas "N° | soporte" con el cliente en cada fila (los buses
 *      de cada soporte, o los soportes de la campaña) y el DESDE/HASTA.
 *   3. Fotos: hasta tres por hoja, con marco naranja redondeado.
 *   4. Contratapa con los datos de contacto.
 *
 * Las hojas interiores llevan la barra naranja a la derecha con el isotipo MV.
 * La portada ya no dice "ALTA BUSES" ni lleva el logo del cliente.
 */

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface PhotoItem {
  url: string
  soporteNombre: string
  fechaRegistro: string | null
}

export interface PdfComprobante {
  cliente: string
  numeroCampana: string
  fechaDesde: string
  fechaHasta: string
  fotos: PhotoItem[]
  /**
   * Período propio de cada soporte ("dd/mm/aaaa"), por nombre, cuando no es
   * el de toda la campaña: un rutero de 8 semanas dentro de una venta de 13
   * no puede decir "hasta" la fecha del banner.
   */
  periodos?: Record<string, { desde: string; hasta: string }>
}

/** "15/12/2026"–"09/02/2027" → "15/12 AL 09/02" para la fila del listado. */
function periodoCorto(p: { desde: string; hasta: string }): string {
  const c = (f: string) => f.split('/').slice(0, 2).join('/')
  return `${c(p.desde)} AL ${c(p.hasta)}`
}

export interface BusPhotoItem {
  url: string
  soporteNombre: string
  busNumero: string | null
  fechaRegistro: string | null
}

export interface BusSoporteGroup {
  nombre: string
  buses: string[]
  fotos: BusPhotoItem[]
}

export interface BusPdfData {
  cliente: string
  numeroCampana: string
  fechaDesde: string
  fechaHasta: string
  grupos: BusSoporteGroup[]
}

// ─── Plantilla ───────────────────────────────────────────────────────────────

// 16:9, como la plantilla (1440×810 pt escalado a 960×540).
const W = 960, H = 540
const BARRA_X = 859            // la barra naranja de la derecha arranca acá
const FONDO = rgb(0xf4 / 255, 0xf4 / 255, 0xf4 / 255)
const NARANJA = rgb(0xec / 255, 0x69 / 255, 0x1a / 255)
const GRIS = rgb(0x73 / 255, 0x73 / 255, 0x73 / 255)
const NEGRO = rgb(0.06, 0.06, 0.06)
const BLANCO = rgb(1, 1, 1)

interface Recursos {
  bold: PDFFont
  regular: PDFFont
  portada: PDFImage
  barra: PDFImage
  contratapa: PDFImage
}

async function prepararDocumento(): Promise<{ pdfDoc: PDFDocument; r: Recursos }> {
  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)
  const b64 = (s: string) => Uint8Array.from(Buffer.from(s, 'base64'))
  const [bold, regular, portada, barra, contratapa] = await Promise.all([
    pdfDoc.embedFont(b64(MONTSERRAT_BOLD_B64), { subset: true }),
    pdfDoc.embedFont(StandardFonts.Helvetica),
    pdfDoc.embedJpg(b64(PORTADA_BANDA_JPG)),
    pdfDoc.embedPng(b64(BARRA_MV_PNG)),
    pdfDoc.embedJpg(b64(CONTRATAPA_JPG)),
  ])
  return { pdfDoc, r: { bold, regular, portada, barra, contratapa } }
}

/** "01/12/2026" → "01-12-2026", como en la plantilla. */
const fechaGuiones = (f: string) => f.replace(/\//g, '-')

/** Achica el tamaño hasta que el texto entre en el ancho. */
function tamañoQueEntra(texto: string, font: PDFFont, max: number, ancho: number, min = 6): number {
  let t = max
  while (t > min && font.widthOfTextAtSize(texto, t) > ancho) t -= 0.5
  return t
}

/** Recorta el texto con "…" si no entra ni al tamaño mínimo. */
function recortar(texto: string, font: PDFFont, size: number, ancho: number): string {
  if (font.widthOfTextAtSize(texto, size) <= ancho) return texto
  let t = texto
  while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > ancho) t = t.slice(0, -1)
  return t + '…'
}

function textoCentrado(page: PDFPage, texto: string, cx: number, y: number, size: number, font: PDFFont, color = NEGRO) {
  page.drawText(texto, { x: cx - font.widthOfTextAtSize(texto, size) / 2, y, size, font, color })
}

function textoDerecha(page: PDFPage, texto: string, xDer: number, y: number, size: number, font: PDFFont, color = NEGRO) {
  page.drawText(texto, { x: xDer - font.widthOfTextAtSize(texto, size), y, size, font, color })
}

/** Camino de un rectángulo redondeado en coordenadas PDF (y desde abajo). */
function caminoRedondeado(x: number, y: number, w: number, h: number, r: number) {
  const k = r * 0.5523
  return [
    moveTo(x + r, y),
    lineTo(x + w - r, y), appendBezierCurve(x + w - r + k, y, x + w, y + r - k, x + w, y + r),
    lineTo(x + w, y + h - r), appendBezierCurve(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h),
    lineTo(x + r, y + h), appendBezierCurve(x + r - k, y + h, x, y + h - r + k, x, y + h - r),
    lineTo(x, y + r), appendBezierCurve(x, y + r - k, x + r - k, y, x + r, y),
    closePath(),
  ]
}

/** Dibuja la imagen llenando el recuadro (recortada, como "cover") con esquinas redondeadas. */
function imagenQueLlena(page: PDFPage, img: PDFImage, x: number, y: number, w: number, h: number, r: number) {
  const escala = Math.max(w / img.width, h / img.height)
  const iw = img.width * escala, ih = img.height * escala
  page.pushOperators(pushGraphicsState(), ...caminoRedondeado(x, y, w, h, r), clip(), endPath())
  page.drawImage(img, { x: x + (w - iw) / 2, y: y + (h - ih) / 2, width: iw, height: ih })
  page.pushOperators(popGraphicsState())
}

/** Rectángulo redondeado (y desde arriba de la hoja, como en el SVG). */
function rectRedondeado(page: PDFPage, x: number, yTop: number, w: number, h: number, r: number, color = NARANJA) {
  const path = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`
  page.drawSvgPath(path, { x, y: H - yTop, color })
}

// ─── Hojas ───────────────────────────────────────────────────────────────────

function hojaInterior(pdfDoc: PDFDocument, r: Recursos): PDFPage {
  const page = pdfDoc.addPage([W, H])
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: FONDO })
  page.drawImage(r.barra, { x: BARRA_X, y: 0, width: W - BARRA_X, height: H })
  return page
}

function portada(pdfDoc: PDFDocument, r: Recursos, cliente: string, campana: string) {
  const page = pdfDoc.addPage([W, H])
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: BLANCO })
  // Banda naranja con el logo: 24 pt de blanco arriba, como la plantilla.
  const bandaH = W * (r.portada.height / r.portada.width)
  page.drawImage(r.portada, { x: 0, y: H - 24 - bandaH, width: W, height: bandaH })

  // Abajo: el cliente (donde la plantilla decía "ALTA BUSES") y la campaña.
  const base = 34
  const izq = cliente.toUpperCase()
  const t1 = tamañoQueEntra(izq, r.bold, 34, W * 0.55, 14)
  page.drawText(recortar(izq, r.bold, t1, W * 0.55), { x: 16, y: base, size: t1, font: r.bold, color: GRIS })
  if (campana && campana !== '—') {
    const der = campana.toUpperCase()
    const t2 = tamañoQueEntra(der, r.bold, 22, W * 0.38, 10)
    textoDerecha(page, recortar(der, r.bold, t2, W * 0.38), W - 24, base + 4, t2, r.bold, NARANJA)
  }
}

function contratapa(pdfDoc: PDFDocument, r: Recursos) {
  const page = pdfDoc.addPage([W, H])
  page.drawImage(r.contratapa, { x: 0, y: 0, width: W, height: H })
}

/** DESDE / HASTA abajo a la derecha, en naranja. */
function periodo(page: PDFPage, r: Recursos, desde: string, hasta: string) {
  const xDer = BARRA_X - 34
  if (desde) page.drawText(`DESDE EL ${fechaGuiones(desde)}`, { x: xDer - r.bold.widthOfTextAtSize(`DESDE EL ${fechaGuiones(desde)}`, 13.5), y: 26, size: 13.5, font: r.bold, color: NARANJA })
  if (hasta) page.drawText(`HASTA EL ${fechaGuiones(hasta)}`, { x: xDer - r.bold.widthOfTextAtSize(`HASTA EL ${fechaGuiones(hasta)}`, 13.5), y: 8, size: 13.5, font: r.bold, color: NARANJA })
}

// ─── Listado: tablas "N° | soporte" ─────────────────────────────────────────

interface Columna { titulo: string; filas: { numero: string; texto: string }[] }

const TABLA_W = 228
const TABLA_GAP = 42
const HEADER_TOP = 54           // desde arriba de la hoja
const HEADER_H = 26
const PRIMERA_FILA = 102        // línea base de la primera fila, desde arriba
const PASO_FILA = 20
const FILAS_POR_COL = 20

/** Parte las columnas largas: cada tabla de la hoja muestra hasta 20 filas. */
function partirColumnas(cols: Columna[]): Columna[] {
  const out: Columna[] = []
  for (const c of cols) {
    for (let i = 0; i < Math.max(1, c.filas.length); i += FILAS_POR_COL) {
      out.push({ titulo: c.titulo, filas: c.filas.slice(i, i + FILAS_POR_COL) })
    }
  }
  return out
}

function hojasDeListado(pdfDoc: PDFDocument, r: Recursos, columnas: Columna[], desde: string, hasta: string) {
  const partes = partirColumnas(columnas)
  const contenidoW = BARRA_X
  for (let i = 0; i < partes.length; i += 2) {
    const page = hojaInterior(pdfDoc, r)
    const enHoja = partes.slice(i, i + 2)
    const totalW = enHoja.length * TABLA_W + (enHoja.length - 1) * TABLA_GAP
    let x = (contenidoW - totalW) / 2
    for (const col of enHoja) {
      // Encabezado naranja: "N°" y el nombre del soporte.
      page.drawRectangle({ x, y: H - HEADER_TOP - HEADER_H, width: TABLA_W, height: HEADER_H, color: NARANJA })
      const yHeader = H - HEADER_TOP - HEADER_H / 2 - 3.6
      textoCentrado(page, 'N°', x + 35, yHeader, 10.5, r.bold, BLANCO)
      const titulo = col.titulo
      const tTit = tamañoQueEntra(titulo, r.bold, 10.5, TABLA_W - 80, 7)
      textoCentrado(page, recortar(titulo, r.bold, tTit, TABLA_W - 80), x + 132, yHeader, tTit, r.bold, BLANCO)
      col.filas.forEach((f, j) => {
        const y = H - PRIMERA_FILA - j * PASO_FILA - 4
        textoCentrado(page, f.numero, x + 41, y, 11, r.bold, NEGRO)
        const tFila = tamañoQueEntra(f.texto, r.bold, 11, TABLA_W - 80, 7)
        textoCentrado(page, recortar(f.texto, r.bold, tFila, TABLA_W - 80), x + 132, y, tFila, r.bold, NEGRO)
      })
      x += TABLA_W + TABLA_GAP
    }
    periodo(page, r, desde, hasta)
  }
}

// ─── Fotos ───────────────────────────────────────────────────────────────────

type ImageResult =
  | { kind: 'jpeg' | 'png'; bytes: Uint8Array }
  | { kind: 'unsupported'; mime: string }
  | { kind: 'error' }

async function fetchImage(url: string): Promise<ImageResult> {
  try {
    const res = await fetch(url)
    if (!res.ok) return { kind: 'error' }
    const bytes = new Uint8Array(await res.arrayBuffer())
    const ct = res.headers.get('content-type') ?? ''
    if (ct.includes('jpeg') || ct.includes('jpg')) return { kind: 'jpeg', bytes }
    if (ct.includes('png'))  return { kind: 'png',  bytes }
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return { kind: 'jpeg', bytes }
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { kind: 'png', bytes }
    return { kind: 'unsupported', mime: ct.split(';')[0].trim() || 'desconocido' }
  } catch {
    return { kind: 'error' }
  }
}

async function embedImage(pdfDoc: PDFDocument, result: ImageResult): Promise<PDFImage | null> {
  if (result.kind !== 'jpeg' && result.kind !== 'png') return null
  try {
    return result.kind === 'jpeg' ? await pdfDoc.embedJpg(result.bytes) : await pdfDoc.embedPng(result.bytes)
  } catch {
    return null
  }
}

interface Celda { x: number; top: number; w: number; h: number }

/**
 * Dónde va cada foto, según cuántas entran en la hoja y su orientación
 * (como la plantilla: la foto vertical ocupa la columna alta de la derecha).
 * Devuelve las celdas en el mismo orden que las fotos.
 */
function celdas(aspectos: number[]): Celda[] {
  const M = 24, G = 22, ancho = BARRA_X - M * 2, alto = H - M * 2
  const n = aspectos.length
  if (n === 1) return [{ x: M, top: M, w: ancho, h: alto }]
  if (n === 2) {
    // Dos horizontales, una arriba de la otra; si no, lado a lado.
    if (aspectos.every(a => a >= 1.2)) {
      const h = (alto - G) / 2
      return [{ x: M, top: M, w: ancho, h }, { x: M, top: M + h + G, w: ancho, h }]
    }
    const w = (ancho - G) / 2
    return [{ x: M, top: M, w, h: alto }, { x: M + w + G, top: M, w, h: alto }]
  }
  // 3: dos a la izquierda y la más vertical en la columna alta de la derecha.
  const wIzq = ancho * 0.56, wDer = ancho - wIzq - G, hIzq = (alto - G) / 2
  const izq1 = { x: M, top: M, w: wIzq, h: hIzq }
  const izq2 = { x: M, top: M + hIzq + G, w: wIzq, h: hIzq }
  const der = { x: M + wIzq + G, top: M, w: wDer, h: alto }
  const masVertical = aspectos.indexOf(Math.min(...aspectos))
  const out: Celda[] = []
  let k = 0
  for (let j = 0; j < 3; j++) out.push(j === masVertical ? der : (k++ === 0 ? izq1 : izq2))
  return out
}

const MARCO = 8                 // grosor del marco naranja
const LEYENDA = 12              // lugar para la leyenda debajo de la foto

async function hojasDeFotos(
  pdfDoc: PDFDocument, r: Recursos,
  fotos: { url: string; leyenda: string }[],
) {
  const resultados = await Promise.all(fotos.map(f => fetchImage(f.url)))
  for (let i = 0; i < fotos.length; i += 3) {
    const page = hojaInterior(pdfDoc, r)
    const lote = fotos.slice(i, i + 3)
    const imgs = await Promise.all(lote.map((_, j) => embedImage(pdfDoc, resultados[i + j])))
    const cs = celdas(imgs.map(im => (im ? im.width / im.height : 1.33)))
    for (let j = 0; j < lote.length; j++) {
      const c = cs[j]
      const img = imgs[j]
      // Como la plantilla: la foto llena la celda (recortada) dentro de un
      // marco naranja redondeado.
      const fw = c.w, fh = c.h - LEYENDA
      rectRedondeado(page, c.x, c.top, fw, fh, 16)
      const ix = c.x + MARCO, iw = fw - MARCO * 2, ih = fh - MARCO * 2
      const iy = H - (c.top + MARCO) - ih
      if (img) {
        imagenQueLlena(page, img, ix, iy, iw, ih, 10)
      } else {
        page.drawRectangle({ x: ix, y: iy, width: iw, height: ih, color: BLANCO })
        const msg = resultados[i + j].kind === 'unsupported' ? 'Formato no soportado: subir como JPG o PNG' : 'Imagen no disponible'
        textoCentrado(page, msg, ix + iw / 2, iy + ih / 2, 10, r.regular, GRIS)
      }
      const ley = recortar(lote[j].leyenda, r.regular, 8, fw)
      page.drawText(ley, { x: c.x + 2, y: H - (c.top + fh) - 10, size: 8, font: r.regular, color: GRIS })
    }
  }
}

const fechaCorta = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('-') : '')

// ─── Comprobante de soportes estáticos ───────────────────────────────────────

export async function generateStaticPdfComprobante(data: PdfComprobante): Promise<Buffer> {
  const { pdfDoc, r } = await prepararDocumento()
  portada(pdfDoc, r, data.cliente, data.numeroCampana)

  // Listado de los soportes de la campaña.
  const soportes = Array.from(new Set(data.fotos.map(f => f.soporteNombre)))
  const propio = (nombre: string) => {
    const p = data.periodos?.[nombre]
    return p && (p.desde !== data.fechaDesde || p.hasta !== data.fechaHasta) ? p : null
  }
  hojasDeListado(pdfDoc, r, [{
    titulo: 'SOPORTE',
    filas: soportes.map((s, i) => {
      const p = propio(s)
      return { numero: String(i + 1), texto: (p ? `${s} · ${periodoCorto(p)}` : s).toUpperCase() }
    }),
  }], data.fechaDesde, data.fechaHasta)

  await hojasDeFotos(pdfDoc, r, data.fotos.map(f => {
    const p = propio(f.soporteNombre)
    return {
      url: f.url,
      leyenda: [f.soporteNombre, p ? periodoCorto(p).toLowerCase() : null, fechaCorta(f.fechaRegistro)].filter(Boolean).join(' · '),
    }
  }))

  contratapa(pdfDoc, r)
  return Buffer.from(await pdfDoc.save())
}

// ─── Comprobante de buses ────────────────────────────────────────────────────

export async function generateBusPdfComprobante(data: BusPdfData): Promise<Buffer> {
  const { pdfDoc, r } = await prepararDocumento()
  portada(pdfDoc, r, data.cliente, data.numeroCampana)

  // Una tabla por soporte: el número de cada bus y el cliente.
  const cliente = data.cliente.toUpperCase()
  hojasDeListado(pdfDoc, r, data.grupos.map(g => ({
    titulo: g.nombre.toUpperCase(),
    filas: g.buses.map(n => ({ numero: n, texto: cliente })),
  })), data.fechaDesde, data.fechaHasta)

  await hojasDeFotos(pdfDoc, r, data.grupos.flatMap(g => g.fotos.map(f => ({
    url: f.url,
    leyenda: [g.nombre, f.busNumero && f.busNumero !== 'N/A' ? `Bus ${f.busNumero}` : null, fechaCorta(f.fechaRegistro)].filter(Boolean).join(' · '),
  }))))

  contratapa(pdfDoc, r)
  return Buffer.from(await pdfDoc.save())
}

// Backward-compat alias
export const generatePdfComprobante = generateStaticPdfComprobante
