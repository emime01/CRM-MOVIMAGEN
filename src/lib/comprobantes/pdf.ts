import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, PDFImage } from 'pdf-lib'

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

// ─── Color palette ────────────────────────────────────────────────────────────

const ORA  = rgb(0.92, 0.41, 0.11)   // brand orange
const DORA = rgb(0.75, 0.28, 0.03)   // dark orange (circles)
const DARK = rgb(0.10, 0.10, 0.10)
const MID  = rgb(0.45, 0.45, 0.45)
const LITE = rgb(0.84, 0.84, 0.84)
const WHT  = rgb(1, 1, 1)
const ROW1 = rgb(0.99, 0.97, 0.95)   // table row alternating

// ─── Page sizes ───────────────────────────────────────────────────────────────

// Portrait A4
const PW = 595, PH = 842, PP = 28
// Landscape A4
const LW = 842, LH = 595, LP = 30

// ─── Image fetch ─────────────────────────────────────────────────────────────

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

function formatDate(d: string | null): string {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return d }
}

function drawImagePlaceholder(page: PDFPage, x: number, y: number, w: number, h: number, msg: string, font: PDFFont) {
  page.drawRectangle({ x, y, width: w, height: h, borderColor: LITE, borderWidth: 1, color: rgb(0.97, 0.97, 0.97) })
  const lines = msg.split('\n')
  const startY = y + h / 2 + (lines.length - 1) * 7
  lines.forEach((line, i) => {
    page.drawText(line, { x: x + w / 2 - line.length * 2.8, y: startY - i * 14, size: 8, font, color: MID })
  })
}

async function embedImage(pdfDoc: PDFDocument, result: ImageResult): Promise<PDFImage | null> {
  if (result.kind !== 'jpeg' && result.kind !== 'png') return null
  try {
    return result.kind === 'jpeg' ? await pdfDoc.embedJpg(result.bytes) : await pdfDoc.embedPng(result.bytes)
  } catch {
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATIC PDF (portrait A4)
// ═══════════════════════════════════════════════════════════════════════════════

function drawStaticCover(page: PDFPage, cliente: string, regular: PDFFont, bold: PDFFont) {
  const splitY = PH * 0.42          // orange: splitY → PH  (top 58%)
  const orangeH = PH - splitY

  // Orange section
  page.drawRectangle({ x: 0, y: splitY, width: PW, height: orangeH, color: ORA })
  // Decorative circles
  page.drawCircle({ x: PW * 0.18, y: PH * 0.87, size: PW * 0.32, color: DORA })
  page.drawCircle({ x: PW * 0.80, y: PH * 0.77, size: PW * 0.22, color: DORA })

  // "movimagen" (large, white)
  page.drawText('movimagen', { x: 34, y: splitY + orangeH * 0.38, size: 54, font: bold, color: WHT })
  page.drawText('Publicidad OOH', { x: PW - 160, y: splitY + orangeH * 0.21, size: 13, font: regular, color: rgb(1, 0.88, 0.78) })

  // White section: "COMPROBANTE DE CAMPANA"
  const titleY = splitY * 0.70
  page.drawText('COMPROBANTE', { x: PP, y: titleY,      size: 30, font: bold, color: ORA })
  page.drawText('DE CAMPANA',  { x: PP, y: titleY - 34, size: 30, font: bold, color: ORA })

  // Client badge bottom-right
  const label = cliente.toUpperCase().slice(0, 16)
  const bw = label.length * 9 + 24
  page.drawRectangle({ x: PW - PP - bw, y: 22, width: bw, height: 44, color: DARK })
  page.drawText(label, { x: PW - PP - bw + 12, y: 22 + 14, size: 13, font: bold, color: WHT })
}

function drawStaticHeader(page: PDFPage, data: PdfComprobante, regular: PDFFont, bold: PDFFont) {
  page.drawRectangle({ x: 0, y: PH - 64, width: PW, height: 64, color: ORA })
  page.drawText('MOVIMAGEN', { x: PP, y: PH - 28, size: 22, font: bold, color: WHT })
  page.drawText('Comprobante de campana publicitaria', { x: PP, y: PH - 48, size: 10, font: regular, color: rgb(1, 0.88, 0.78) })

  const mY = PH - 82
  page.drawText('Cliente:',  { x: PP,       y: mY,      size: 9, font: bold,    color: DARK })
  page.drawText(data.cliente, { x: PP + 46,  y: mY,      size: 9, font: regular, color: DARK })
  page.drawText('Campana:',  { x: PP,       y: mY - 14, size: 9, font: bold,    color: DARK })
  page.drawText(data.numeroCampana, { x: PP + 50, y: mY - 14, size: 9, font: regular, color: DARK })
  page.drawText('Periodo:',  { x: 200,      y: mY - 14, size: 9, font: bold,    color: DARK })
  page.drawText(`${data.fechaDesde} al ${data.fechaHasta}`, { x: 248, y: mY - 14, size: 9, font: regular, color: DARK })

  page.drawLine({ start: { x: PP, y: PH - 120 }, end: { x: PW - PP, y: PH - 120 }, thickness: 0.5, color: LITE })
}

function drawStaticFooter(page: PDFPage, pageNum: number, total: number, regular: PDFFont) {
  page.drawLine({ start: { x: PP, y: 22 }, end: { x: PW - PP, y: 22 }, thickness: 0.5, color: LITE })
  page.drawText('MOVIMAGEN - Comprobante generado automaticamente', { x: PP, y: 8, size: 7, font: regular, color: MID })
  const lbl = `Pag. ${pageNum} / ${total}`
  page.drawText(lbl, { x: PW - PP - lbl.length * 4.2, y: 8, size: 7, font: regular, color: MID })
}

export async function generateStaticPdfComprobante(data: PdfComprobante): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create()
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  // Cover
  drawStaticCover(pdfDoc.addPage([PW, PH]), data.cliente, regular, bold)

  const HEADER_H = 122
  const COL_GAP  = 14
  const IMG_COLS = 2
  const IMG_W    = (PW - PP * 2 - COL_GAP * (IMG_COLS - 1)) / IMG_COLS
  const IMG_H    = 175
  const ROW_H    = 30 + IMG_H + 16
  const avail    = PH - HEADER_H - 32
  const rpp      = Math.max(1, Math.floor(avail / ROW_H))
  const rows     = Math.ceil(data.fotos.length / IMG_COLS)
  const totalPg  = Math.max(1, Math.ceil(rows / rpp))

  const imageResults = await Promise.all(data.fotos.map(f => fetchImage(f.url)))

  const pages: PDFPage[] = []
  for (let i = 0; i < totalPg; i++) {
    const p = pdfDoc.addPage([PW, PH])
    drawStaticHeader(p, data, regular, bold)
    pages.push(p)
  }

  for (let idx = 0; idx < data.fotos.length; idx++) {
    const foto = data.fotos[idx]
    const result = imageResults[idx]
    const col = idx % IMG_COLS
    const row = Math.floor(idx / IMG_COLS)
    const page = pages[Math.floor(row / rpp)]
    const x = PP + col * (IMG_W + COL_GAP)
    const topY = PH - HEADER_H - 8 - (row % rpp) * ROW_H

    const nombre = foto.soporteNombre.length > 38 ? foto.soporteNombre.slice(0, 36) + '...' : foto.soporteNombre
    page.drawText(nombre, { x, y: topY - 11, size: 8, font: bold, color: DARK })
    if (foto.fechaRegistro) page.drawText(formatDate(foto.fechaRegistro), { x, y: topY - 22, size: 7, font: regular, color: MID })

    const boxY = topY - 30 - IMG_H
    const img = await embedImage(pdfDoc, result)
    if (img) {
      const dims = img.scaleToFit(IMG_W, IMG_H)
      page.drawImage(img, { x: x + (IMG_W - dims.width) / 2, y: boxY + (IMG_H - dims.height) / 2, width: dims.width, height: dims.height })
    } else {
      const msg = result.kind === 'unsupported' ? 'Formato no soportado\nSubir como JPG o PNG' : 'Imagen no disponible'
      drawImagePlaceholder(page, x, boxY, IMG_W, IMG_H, msg, regular)
    }
  }

  pages.forEach((p, i) => drawStaticFooter(p, i + 1, totalPg, regular))
  return Buffer.from(await pdfDoc.save())
}

// ═══════════════════════════════════════════════════════════════════════════════
// BUS PDF (landscape A4)
// ═══════════════════════════════════════════════════════════════════════════════

function drawBusCover(page: PDFPage, data: BusPdfData, regular: PDFFont, bold: PDFFont) {
  const splitY = LH * 0.40          // orange: splitY → LH  (top 60%)
  const orangeH = LH - splitY

  // Orange section
  page.drawRectangle({ x: 0, y: splitY, width: LW, height: orangeH, color: ORA })
  // Decorative circles
  page.drawCircle({ x: LW * 0.10, y: LH * 0.85, size: LH * 0.40, color: DORA })
  page.drawCircle({ x: LW * 0.52, y: LH,         size: LH * 0.48, color: DORA })

  // "movimagen"
  page.drawText('movimagen', { x: LW * 0.17, y: splitY + orangeH * 0.36, size: 82, font: bold, color: WHT })
  page.drawText('Publicidad OOH', { x: LW * 0.64, y: splitY + orangeH * 0.18, size: 18, font: regular, color: rgb(1, 0.88, 0.78) })

  // White section: "ALTA DE CAMPAÑA"
  page.drawText('ALTA DE CAMPANA', { x: LP, y: splitY * 0.62, size: 36, font: bold, color: ORA })

  // Client badge bottom-right
  const label = data.cliente.toUpperCase().slice(0, 14)
  const bw = label.length * 10 + 24
  page.drawRectangle({ x: LW - LP - bw, y: splitY * 0.14, width: bw, height: 56, color: ORA })
  page.drawText(label, { x: LW - LP - bw + 12, y: splitY * 0.14 + 18, size: 16, font: bold, color: WHT })
}

function drawBusBar(page: PDFPage, data: BusPdfData, regular: PDFFont, bold: PDFFont) {
  const BAR = 46
  page.drawRectangle({ x: 0, y: LH - BAR, width: LW, height: BAR, color: ORA })
  page.drawText('movimagen - Publicidad OOH', { x: LP, y: LH - BAR / 2 - 6, size: 12, font: bold, color: WHT })
  const right = data.cliente
  page.drawText(right, { x: LW - LP - right.length * 6.2, y: LH - BAR / 2 - 6, size: 11, font: regular, color: WHT })
}

function drawBusListPage(page: PDFPage, grupo: BusSoporteGroup, data: BusPdfData, regular: PDFFont, bold: PDFFont) {
  const BAR = 46
  drawBusBar(page, data, regular, bold)

  const titleY = LH - BAR - 34
  page.drawText(grupo.nombre.toUpperCase(), { x: LP, y: titleY, size: 26, font: bold, color: ORA })

  const dateStr = `${data.fechaDesde} al ${data.fechaHasta}`
  page.drawText(dateStr, { x: LW - LP - dateStr.length * 5.8, y: titleY, size: 12, font: regular, color: MID })

  const sepY = titleY - 16
  page.drawLine({ start: { x: LP, y: sepY }, end: { x: LW - LP, y: sepY }, thickness: 1, color: LITE })

  const tableTop = sepY - 10
  const colBus   = 130
  const tableW   = LW - LP * 2
  const rowH     = 28

  // Header row
  page.drawRectangle({ x: LP, y: tableTop - rowH, width: tableW, height: rowH, color: ORA })
  page.drawText('N BUS',              { x: LP + colBus / 2 - 20,  y: tableTop - rowH + 9, size: 10, font: bold,    color: WHT })
  page.drawText('CLIENTE / CAMPANA',  { x: LP + colBus + 20,      y: tableTop - rowH + 9, size: 10, font: bold,    color: WHT })

  let curY = tableTop - rowH
  grupo.buses.forEach((num, idx) => {
    curY -= rowH
    if (curY < 40) return
    page.drawRectangle({ x: LP, y: curY, width: tableW, height: rowH, color: idx % 2 === 0 ? ROW1 : WHT })
    page.drawText(num, { x: LP + colBus / 2 - num.length * 5.5, y: curY + 9, size: 12, font: bold,    color: ORA  })
    page.drawText(data.cliente.toUpperCase(), { x: LP + colBus + 20, y: curY + 9, size: 11, font: regular, color: DARK })
  })

  // Column divider + outer border
  page.drawLine({ start: { x: LP + colBus, y: tableTop - rowH }, end: { x: LP + colBus, y: curY }, thickness: 0.5, color: LITE })
  page.drawRectangle({ x: LP, y: curY, width: tableW, height: tableTop - rowH - curY, borderColor: LITE, borderWidth: 0.5 })

  // Footer
  page.drawLine({ start: { x: LP, y: 22 }, end: { x: LW - LP, y: 22 }, thickness: 0.5, color: LITE })
  page.drawText(`Total soporte: ${grupo.buses.length} unidades`, { x: LP, y: 6, size: 9, font: regular, color: MID })
  const pStr = `Periodo: ${data.fechaDesde} al ${data.fechaHasta}`
  page.drawText(pStr, { x: LW - LP - pStr.length * 4.8, y: 6, size: 9, font: regular, color: MID })
}

async function drawBusPhotoPage(
  page: PDFPage, foto: BusPhotoItem, idx: number,
  grupo: BusSoporteGroup, data: BusPdfData,
  result: ImageResult, pdfDoc: PDFDocument,
  regular: PDFFont, bold: PDFFont,
) {
  const BAR = 46
  drawBusBar(page, data, regular, bold)

  const subtitleY = LH - BAR - 26
  page.drawText(grupo.nombre.toUpperCase(), { x: LP, y: subtitleY, size: 20, font: bold, color: ORA })
  const uStr = `${grupo.buses.length} unidades - ${data.fechaDesde} al ${data.fechaHasta}`
  page.drawText(uStr, { x: LW - LP - uStr.length * 5.2, y: subtitleY, size: 11, font: regular, color: MID })

  const BADGE = 34
  const photoTop = subtitleY - 10
  const photoH   = photoTop - BADGE - 6
  const photoW   = LW - LP * 2

  const img = await embedImage(pdfDoc, result)
  if (img) {
    const dims = img.scaleToFit(photoW, photoH)
    page.drawImage(img, {
      x: LP + (photoW - dims.width) / 2,
      y: BADGE + 6 + (photoH - dims.height) / 2,
      width: dims.width, height: dims.height,
    })
  } else {
    const msg = result.kind === 'unsupported' ? 'Formato no soportado\nSubir como JPG o PNG' : 'Imagen no disponible'
    drawImagePlaceholder(page, LP, BADGE + 6, photoW, photoH, msg, regular)
  }

  // Orange photo-counter badge
  page.drawRectangle({ x: LP, y: 4, width: BADGE, height: BADGE, color: ORA })
  const n = String(idx + 1)
  page.drawText(n, { x: LP + BADGE / 2 - n.length * 4.5, y: 12, size: 13, font: bold, color: WHT })
}

export async function generateBusPdfComprobante(data: BusPdfData): Promise<Buffer> {
  const pdfDoc  = await PDFDocument.create()
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  // Cover (landscape)
  drawBusCover(pdfDoc.addPage([LW, LH]), data, regular, bold)

  // Pre-fetch all images in parallel
  const allFotos   = data.grupos.flatMap(g => g.fotos)
  const allResults = await Promise.all(allFotos.map(f => fetchImage(f.url)))
  let imgIdx = 0

  for (const grupo of data.grupos) {
    drawBusListPage(pdfDoc.addPage([LW, LH]), grupo, data, regular, bold)

    for (let i = 0; i < grupo.fotos.length; i++) {
      await drawBusPhotoPage(
        pdfDoc.addPage([LW, LH]), grupo.fotos[i], i,
        grupo, data, allResults[imgIdx++], pdfDoc, regular, bold,
      )
    }
  }

  return Buffer.from(await pdfDoc.save())
}

// Backward-compat alias
export const generatePdfComprobante = generateStaticPdfComprobante
