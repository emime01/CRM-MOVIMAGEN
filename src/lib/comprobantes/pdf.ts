import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, PDFImage } from 'pdf-lib'

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

    // Detect by Content-Type first
    if (ct.includes('jpeg') || ct.includes('jpg')) return { kind: 'jpeg', bytes }
    if (ct.includes('png')) return { kind: 'png', bytes }

    // Detect by magic bytes as fallback
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return { kind: 'jpeg', bytes }
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { kind: 'png', bytes }

    // Unsupported format (WebP, HEIC, AVIF, etc.)
    const mime = ct.split(';')[0].trim() || 'desconocido'
    return { kind: 'unsupported', mime }
  } catch {
    return { kind: 'error' }
  }
}

function formatDate(d: string | null): string {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return d
  }
}

const BRAND_ORANGE = rgb(0.92, 0.41, 0.11)
const DARK       = rgb(0.1,  0.1,  0.1)
const MID        = rgb(0.4,  0.4,  0.4)
const LIGHT      = rgb(0.85, 0.85, 0.85)
const WHITE      = rgb(1,    1,    1)

const W = 595, H = 842          // A4 pt
const PAD = 28
const HEADER_H = 120
const CAPTION_H = 30            // space above each image for caption
const FOOTER_H = 24
const COL_GAP = 14
const IMG_COLS = 2
const IMG_W = (W - PAD * 2 - COL_GAP * (IMG_COLS - 1)) / IMG_COLS
const IMG_H = 175               // max image height

function drawHeader(page: PDFPage, data: PdfComprobante, regular: PDFFont, bold: PDFFont) {
  // Orange bar
  page.drawRectangle({ x: 0, y: H - 64, width: W, height: 64, color: BRAND_ORANGE })

  // Logo / company
  page.drawText('MOVIMAGEN', { x: PAD, y: H - 28, size: 22, font: bold, color: WHITE })
  page.drawText('Comprobante de campaña publicitaria', { x: PAD, y: H - 48, size: 10, font: regular, color: rgb(1, 0.88, 0.78) })

  // Meta row
  const metaY = H - 82
  page.drawText(`Cliente:`, { x: PAD, y: metaY, size: 9, font: bold, color: DARK })
  page.drawText(data.cliente, { x: PAD + 46, y: metaY, size: 9, font: regular, color: DARK })

  page.drawText(`Campaña:`, { x: PAD, y: metaY - 14, size: 9, font: bold, color: DARK })
  page.drawText(data.numeroCampana, { x: PAD + 50, y: metaY - 14, size: 9, font: regular, color: DARK })

  page.drawText(`Período:`, { x: 200, y: metaY - 14, size: 9, font: bold, color: DARK })
  page.drawText(`${data.fechaDesde} al ${data.fechaHasta}`, { x: 200 + 46, y: metaY - 14, size: 9, font: regular, color: DARK })

  // Separator
  page.drawLine({ start: { x: PAD, y: H - HEADER_H }, end: { x: W - PAD, y: H - HEADER_H }, thickness: 0.5, color: LIGHT })
}

function drawFooter(page: PDFPage, pageNum: number, totalPages: number, regular: PDFFont) {
  page.drawLine({ start: { x: PAD, y: FOOTER_H + 4 }, end: { x: W - PAD, y: FOOTER_H + 4 }, thickness: 0.5, color: LIGHT })
  page.drawText('MOVIMAGEN - Comprobante generado automaticamente', { x: PAD, y: 8, size: 7, font: regular, color: MID })
  const pageLabel = `Pág. ${pageNum} / ${totalPages}`
  page.drawText(pageLabel, { x: W - PAD - pageLabel.length * 4.2, y: 8, size: 7, font: regular, color: MID })
}

export async function generatePdfComprobante(data: PdfComprobante): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create()
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const bold    = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  // Pre-fetch all images so we know total pages
  const imageResults = await Promise.all(data.fotos.map(f => fetchImage(f.url)))

  // Calculate how many rows we need
  const totalItems = data.fotos.length
  const rowsNeeded = Math.ceil(totalItems / IMG_COLS)
  const rowH = CAPTION_H + IMG_H + 16
  const availH = H - HEADER_H - FOOTER_H - 8
  const rowsPerPage = Math.max(1, Math.floor(availH / rowH))
  const totalPages = Math.max(1, Math.ceil(rowsNeeded / rowsPerPage))

  const pages: PDFPage[] = []
  for (let i = 0; i < totalPages; i++) {
    const p = pdfDoc.addPage([W, H])
    drawHeader(p, data, regular, bold)
    pages.push(p)
  }

  for (let idx = 0; idx < data.fotos.length; idx++) {
    const foto = data.fotos[idx]
    const result = imageResults[idx]

    const col = idx % IMG_COLS
    const row = Math.floor(idx / IMG_COLS)
    const pageIdx = Math.floor(row / rowsPerPage)
    const rowInPage = row % rowsPerPage

    const page = pages[pageIdx]
    const x = PAD + col * (IMG_W + COL_GAP)
    const topY = H - HEADER_H - 8 - rowInPage * rowH

    // Caption
    const nombre = foto.soporteNombre.length > 38 ? foto.soporteNombre.slice(0, 36) + '...' : foto.soporteNombre
    page.drawText(nombre, { x, y: topY - 11, size: 8, font: bold, color: DARK })
    if (foto.fechaRegistro) {
      page.drawText(formatDate(foto.fechaRegistro), { x, y: topY - 22, size: 7, font: regular, color: MID })
    }

    // Image area
    const imgBoxY = topY - CAPTION_H - IMG_H
    const imgBoxH = IMG_H

    if (result.kind === 'jpeg' || result.kind === 'png') {
      try {
        let embedded: PDFImage
        if (result.kind === 'jpeg') {
          embedded = await pdfDoc.embedJpg(result.bytes)
        } else {
          embedded = await pdfDoc.embedPng(result.bytes)
        }
        const dims = embedded.scaleToFit(IMG_W, imgBoxH)
        // Center inside the box
        const offsetX = (IMG_W - dims.width) / 2
        const offsetY = (imgBoxH - dims.height) / 2
        page.drawImage(embedded, { x: x + offsetX, y: imgBoxY + offsetY, width: dims.width, height: dims.height })
      } catch {
        drawImagePlaceholder(page, x, imgBoxY, IMG_W, imgBoxH, 'Error al cargar imagen', regular)
      }
    } else if (result.kind === 'unsupported') {
      drawImagePlaceholder(page, x, imgBoxY, IMG_W, imgBoxH, `Formato no soportado\nSubir como JPG o PNG`, regular)
    } else {
      drawImagePlaceholder(page, x, imgBoxY, IMG_W, imgBoxH, 'Imagen no disponible', regular)
    }
  }

  // Draw footers
  pages.forEach((p, i) => drawFooter(p, i + 1, totalPages, regular))

  return Buffer.from(await pdfDoc.save())
}

function drawImagePlaceholder(page: PDFPage, x: number, y: number, w: number, h: number, msg: string, font: PDFFont) {
  page.drawRectangle({ x, y, width: w, height: h, borderColor: LIGHT, borderWidth: 1, color: rgb(0.97, 0.97, 0.97) })
  const lines = msg.split('\n')
  const startY = y + h / 2 + (lines.length - 1) * 7
  lines.forEach((line, i) => {
    page.drawText(line, { x: x + w / 2 - line.length * 2.8, y: startY - i * 14, size: 8, font, color: MID })
  })
}
