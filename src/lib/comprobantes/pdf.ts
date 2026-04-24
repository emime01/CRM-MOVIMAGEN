import { PDFDocument, StandardFonts, rgb, PDFPage } from 'pdf-lib'

export interface PhotoItem {
  url: string
  soporteNombre: string
  fechaRegistro: string
}

export interface PdfComprobante {
  cliente: string
  numeroCampana: string
  fechaDesde: string
  fechaHasta: string
  fotos: PhotoItem[]
}

async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  } catch {
    return null
  }
}

function drawHeader(page: PDFPage, data: PdfComprobante, font: ReturnType<typeof Object>, boldFont: ReturnType<typeof Object>) {
  const { width, height } = page.getSize()

  // Orange header bar
  page.drawRectangle({ x: 0, y: height - 70, width, height: 70, color: rgb(0.92, 0.41, 0.11) })

  page.drawText('MOVIMAGEN', {
    x: 24, y: height - 30,
    size: 20, font: boldFont as never, color: rgb(1, 1, 1),
  })
  page.drawText('Comprobante de campaña', {
    x: 24, y: height - 52,
    size: 11, font: font as never, color: rgb(1, 0.9, 0.8),
  })

  // Client info
  page.drawText(`Cliente: ${data.cliente}`, { x: 24, y: height - 90, size: 10, font: boldFont as never, color: rgb(0.1, 0.1, 0.1) })
  page.drawText(`Campaña: ${data.numeroCampana}   |   ${data.fechaDesde} → ${data.fechaHasta}`, { x: 24, y: height - 108, size: 9, font: font as never, color: rgb(0.3, 0.3, 0.3) })
  page.drawLine({ start: { x: 24, y: height - 118 }, end: { x: width - 24, y: height - 118 }, thickness: 0.5, color: rgb(0.8, 0.8, 0.8) })
}

export async function generatePdfComprobante(data: PdfComprobante): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const W = 595, H = 842 // A4
  const colPad = 24
  const imgW = (W - colPad * 3) / 2
  const imgH = 160
  const headerH = 130

  let page = pdfDoc.addPage([W, H])
  drawHeader(page, data, font, boldFont)

  let col = 0
  let rowY = H - headerH - 20

  for (const foto of data.fotos) {
    // Start new page if not enough space
    if (rowY - imgH - 40 < 40) {
      page = pdfDoc.addPage([W, H])
      drawHeader(page, data, font, boldFont)
      col = 0
      rowY = H - headerH - 20
    }

    const x = colPad + col * (imgW + colPad)

    // Caption
    page.drawText(foto.soporteNombre, { x, y: rowY, size: 9, font: boldFont, color: rgb(0.1, 0.1, 0.1) })
    page.drawText(foto.fechaRegistro, { x, y: rowY - 13, size: 8, font, color: rgb(0.5, 0.5, 0.5) })

    const bytes = await fetchImageBytes(foto.url)
    if (bytes) {
      try {
        const isJpg = foto.url.toLowerCase().match(/\.jpe?g/)
        const img = isJpg ? await pdfDoc.embedJpg(bytes) : await pdfDoc.embedPng(bytes)
        const dims = img.scaleToFit(imgW, imgH)
        page.drawImage(img, { x, y: rowY - 18 - dims.height, width: dims.width, height: dims.height })
      } catch {
        // Draw placeholder if image fails
        page.drawRectangle({ x, y: rowY - 18 - imgH, width: imgW, height: imgH, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 1 })
        page.drawText('Imagen no disponible', { x: x + 10, y: rowY - 18 - imgH / 2, size: 9, font, color: rgb(0.5, 0.5, 0.5) })
      }
    }

    col++
    if (col >= 2) {
      col = 0
      rowY -= imgH + 50
    }
  }

  const pdfBytes = await pdfDoc.save()
  return Buffer.from(pdfBytes)
}
