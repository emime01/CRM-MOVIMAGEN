import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { selectComposition, renderMedia } from '@remotion/renderer'
import type { ComprobanteProps } from '@/remotion/Comprobante'

export interface VideoClip {
  url: string
  soporteNombre: string
}

export interface VideoComprobante {
  cliente: string
  logoUrl: string | null
  introUrl: string
  outroUrl: string
  numeroCampana: string
  fechaDesde: string
  fechaHasta: string
  clips: VideoClip[]
}

const DEFAULT_CHROMIUM_PACK_URL =
  'https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar'

let cachedBundle: string | null = null
let cachedExecutablePath: string | null | undefined

async function getBundle(): Promise<string> {
  if (cachedBundle) return cachedBundle

  // Production: usar el bundle pre-armado en `next build` (scripts/build-remotion.mjs)
  // para evitar correr webpack durante un cold start de la función.
  const prebuiltDir = path.resolve(process.cwd(), '.remotion-bundle')
  const hasPrebuilt = await fs
    .stat(prebuiltDir)
    .then(s => s.isDirectory())
    .catch(() => false)
  if (hasPrebuilt) {
    cachedBundle = prebuiltDir
    return cachedBundle
  }

  // Dev fallback: bundlear en runtime. Import dinámico para que @remotion/bundler
  // (y sus deps rspack/webpack/esbuild) no entren al bundle serverless de prod.
  const { bundle } = await import('@remotion/bundler')
  const entryPoint = path.resolve(process.cwd(), 'src/remotion/index.ts')
  cachedBundle = await bundle({
    entryPoint,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    webpackOverride: (config: any) => config,
  })
  return cachedBundle
}

async function getBrowserExecutable(): Promise<string | null> {
  if (cachedExecutablePath !== undefined) return cachedExecutablePath
  const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
  if (!isServerless) {
    cachedExecutablePath = null
    return null
  }
  const chromium = (await import('@sparticuz/chromium-min')).default
  const packUrl = process.env.CHROMIUM_PACK_URL ?? DEFAULT_CHROMIUM_PACK_URL
  cachedExecutablePath = await chromium.executablePath(packUrl)
  return cachedExecutablePath
}

export async function generateVideoComprobante(data: VideoComprobante): Promise<Buffer> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comprobante-'))
  const outputPath = path.join(tmpDir, 'output.mp4')

  try {
    const [serveUrl, browserExecutable] = await Promise.all([
      getBundle(),
      getBrowserExecutable(),
    ])

    const inputProps: ComprobanteProps = {
      cliente: data.cliente,
      logoUrl: data.logoUrl,
      introUrl: data.introUrl,
      outroUrl: data.outroUrl,
      fechaDesde: data.fechaDesde,
      fechaHasta: data.fechaHasta,
      clips: data.clips,
    }

    const composition = await selectComposition({
      serveUrl,
      id: 'Comprobante',
      inputProps,
      browserExecutable,
    })

    await renderMedia({
      composition,
      serveUrl,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps,
      browserExecutable,
      // Mantener bajo el uso de memoria en serverless
      concurrency: 1,
    })

    const buffer = await fs.readFile(outputPath)
    return buffer
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}
