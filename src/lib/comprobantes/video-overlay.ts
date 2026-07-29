/**
 * Placas y overlays del video comprobante, dibujados con Canvas en el navegador.
 *
 * El texto lo rendea el propio navegador (Montserrat ya viene cargada en la
 * app), así que no dependemos de que ffmpeg.wasm traiga drawtext/freetype:
 * cada placa sale como PNG y ffmpeg sólo la superpone con `overlay`.
 *
 * Todo el diseño está pensado en 1280x720; el video final se normaliza a esa
 * medida.
 */

export const LIENZO = { w: 1280, h: 720 } as const

const NARANJA = '#EB691C'   // naranja de marca (tomado del logo oficial)
const TINTA = '#1A1A1A'
const GRIS = '#6E6E6E'
const GRIS_TEXTO = '#333333'

const BARRA_H = 90          // alto de la franja blanca sobre el clip
const MARGEN_X = 40

/** Datos de contacto de la placa final. */
const CONTACTO = [
  { label: 'Telefono', valor: '2600 1881' },
  { label: 'Página Web', valor: 'www.movimagen.com.uy' },
  { label: 'Correo Electrónico', valor: 'info@movimagen.com.uy' },
]
const DIRECCION = 'Avenida Almirante Harwood 6411 / Montevideo - Uruguay /'

export type DatosClip = {
  /** Rótulo en naranja, ej. "LED GIGANTE" (categoría del soporte). */
  rotulo: string
  /** Ubicación en itálica, ej. "Av. Rivera y L. A. de Herrera". */
  ubicacion: string
  /** Fechas ya formateadas dd/mm/aaaa. */
  fechaDesde: string
  fechaHasta: string
}

export type DatosIntro = {
  cliente: string
  campana: string
  periodo: string
}

/* ── infraestructura ─────────────────────────────────────────────────────── */

function nuevoLienzo() {
  const canvas = document.createElement('canvas')
  canvas.width = LIENZO.w
  canvas.height = LIENZO.h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No se pudo crear el canvas para el video')
  return { canvas, ctx }
}

/**
 * Montserrat entra por Google Fonts, así que hay que esperar a que esté
 * disponible: si dibujamos antes, el canvas usa la fuente de fallback y las
 * placas salen con otra tipografía.
 */
export async function esperarFuentes() {
  const pesos = ['700 40px Montserrat', '600 30px Montserrat', 'italic 40px Montserrat', '700 20px Montserrat']
  await Promise.all(pesos.map(f => document.fonts.load(f)))
  await document.fonts.ready
}

const cacheImg = new Map<string, HTMLImageElement>()

async function cargarImagen(src: string): Promise<HTMLImageElement> {
  const previa = cacheImg.get(src)
  if (previa) return previa
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.crossOrigin = 'anonymous'
    el.onload = () => resolve(el)
    el.onerror = () => reject(new Error(`No se pudo cargar ${src}`))
    el.src = src
  })
  cacheImg.set(src, img)
  return img
}

async function aPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'))
  if (!blob) throw new Error('No se pudo exportar la placa a PNG')
  return new Uint8Array(await blob.arrayBuffer())
}

/** Dibuja el pin de ubicación (el mismo de la placa final) en naranja. */
function pin(ctx: CanvasRenderingContext2D, x: number, y: number, ancho = 20) {
  const r = ancho / 2
  ctx.save()
  ctx.fillStyle = NARANJA
  ctx.beginPath()
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.moveTo(x + r, y + ancho * 1.35)
  ctx.lineTo(x + r * 0.32, y + r * 1.45)
  ctx.lineTo(x + r * 1.68, y + r * 1.45)
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.beginPath()
  ctx.arc(x + r, y + r, r * 0.38, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/* ── overlay del clip: franja blanca con rótulo, ubicación y fechas ──────── */

/**
 * PNG transparente del tamaño del video con la franja al pie. Se superpone al
 * clip tal cual (overlay=0:0), así el video queda intacto arriba.
 */
export async function renderOverlayClip(datos: DatosClip): Promise<Uint8Array> {
  const { canvas, ctx } = nuevoLienzo()
  const y0 = LIENZO.h - BARRA_H

  // franja blanca entera (sin panel aparte: el cliente la pidió toda blanca)
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, y0, LIENZO.w, BARRA_H)

  const centro = y0 + BARRA_H / 2
  ctx.textBaseline = 'middle'

  // rótulo en naranja + ubicación en itálica, corridos según el ancho real
  ctx.font = '700 40px Montserrat, sans-serif'
  ctx.fillStyle = NARANJA
  ctx.textAlign = 'left'
  ctx.fillText(datos.rotulo, MARGEN_X, centro)
  const anchoRotulo = ctx.measureText(`${datos.rotulo}  `).width

  ctx.font = 'italic 40px Montserrat, sans-serif'
  ctx.fillStyle = TINTA
  ctx.fillText(datos.ubicacion, MARGEN_X + anchoRotulo, centro)

  // fechas apiladas a la derecha
  ctx.font = '600 30px Montserrat, sans-serif'
  ctx.fillStyle = NARANJA
  ctx.textAlign = 'right'
  const xDer = LIENZO.w - MARGEN_X
  ctx.fillText(datos.fechaDesde, xDer, y0 + 28)
  ctx.fillText(datos.fechaHasta, xDer, y0 + 62)

  return aPng(canvas)
}

/* ── placa inicial ───────────────────────────────────────────────────────── */

export async function renderIntro(datos: DatosIntro): Promise<Uint8Array> {
  const { canvas, ctx } = nuevoLienzo()
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, LIENZO.w, LIENZO.h)

  const logo = await cargarImagen('/brand/logo-color-520.png')
  ctx.drawImage(logo, (LIENZO.w - logo.width) / 2, 150)

  // filete naranja como separador
  ctx.fillStyle = NARANJA
  ctx.fillRect((LIENZO.w - 120) / 2, 395, 120, 3)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const x = LIENZO.w / 2

  ctx.font = '600 19px Montserrat, sans-serif'
  ctx.fillStyle = '#8A8A8A'
  ctx.letterSpacing = '4px'
  ctx.fillText('COMPROBANTE DE CAMPAÑA', x, 450)
  ctx.letterSpacing = '0px'

  ctx.font = '700 44px Montserrat, sans-serif'
  ctx.fillStyle = TINTA
  ctx.fillText(datos.cliente, x, 508)

  ctx.font = 'italic 28px Montserrat, sans-serif'
  ctx.fillStyle = NARANJA
  const pie = [datos.campana, datos.periodo].filter(Boolean).join('  ·  ')
  ctx.fillText(pie, x, 568)

  return aPng(canvas)
}

/* ── placa final ─────────────────────────────────────────────────────────── */

export async function renderOutro(): Promise<Uint8Array> {
  const { canvas, ctx } = nuevoLienzo()
  const franjaY = 556

  // naranja plano (sin las curvas más oscuras del original)
  ctx.fillStyle = NARANJA
  ctx.fillRect(0, 0, LIENZO.w, LIENZO.h)
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, franjaY, LIENZO.w, LIENZO.h - franjaY)

  const logo = await cargarImagen('/brand/logo-blanco-700.png')
  ctx.drawImage(logo, (LIENZO.w - logo.width) / 2, (franjaY - logo.height) / 2)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  CONTACTO.forEach(({ label, valor }, i) => {
    const x = LIENZO.w * (i + 0.5) / CONTACTO.length
    ctx.font = '700 19px Montserrat, sans-serif'
    ctx.fillStyle = GRIS
    ctx.fillText(label, x, franjaY + 34)
    ctx.font = '700 20px Montserrat, sans-serif'
    ctx.fillStyle = GRIS_TEXTO
    ctx.fillText(valor, x, franjaY + 66)
  })

  // dirección con el pin, centrando el grupo (pin + texto) como una unidad
  ctx.font = '700 19px Montserrat, sans-serif'
  const anchoDir = ctx.measureText(DIRECCION).width
  const PIN_W = 20
  const HUECO = 12
  const xGrupo = (LIENZO.w - (PIN_W + HUECO + anchoDir)) / 2
  pin(ctx, xGrupo, franjaY + 96, PIN_W)
  ctx.textAlign = 'left'
  ctx.fillStyle = GRIS_TEXTO
  ctx.fillText(DIRECCION, xGrupo + PIN_W + HUECO, franjaY + 106)

  return aPng(canvas)
}
