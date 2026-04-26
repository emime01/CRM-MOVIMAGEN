import ffmpeg from 'fluent-ffmpeg'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import https from 'https'
import http from 'http'

ffmpeg.setFfmpegPath(ffmpegInstaller.path)

// Bundled at build time; included via next.config outputFileTracingIncludes.
const FONT_PATH = path.resolve(process.cwd(), 'src/lib/comprobantes/fonts/Montserrat-Bold.ttf')

export interface VideoClip {
  url: string
  soporteNombre: string
}

export interface VideoComprobante {
  cliente: string
  numeroCampana: string
  fechaDesde: string
  fechaHasta: string
  clips: VideoClip[]
  introUrl?: string | null
  outroUrl?: string | null
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    const file = require('fs').createWriteStream(destPath)
    proto.get(url, res => {
      // Follow redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close()
        require('fs').unlink(destPath, () => {})
        downloadFile(res.headers.location, destPath).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        file.close()
        require('fs').unlink(destPath, () => {})
        reject(new Error(`Download failed (${res.statusCode}) for ${url}`))
        return
      }
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
    }).on('error', err => { require('fs').unlink(destPath, () => {}); reject(err) })
  })
}

// Escape text for ffmpeg drawtext filter — single quotes, colons, backslashes, percents.
function escapeDrawText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "’")
    .replace(/%/g, '\\%')
}

// Escape font path for drawtext (special chars in filter args).
function escapeFontPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:')
}

function buildOverlayFilter(soporteNombre: string, fechaDesde: string, fechaHasta: string): string {
  const top = escapeDrawText(soporteNombre.toUpperCase())
  const bottom = escapeDrawText(`${fechaDesde}  -  ${fechaHasta}`)
  const ff = escapeFontPath(FONT_PATH)

  // Top label: soporte name with semi-transparent black box
  const topLabel = `drawtext=fontfile='${ff}':text='${top}':fontsize=36:fontcolor=white:x=(w-text_w)/2:y=40:box=1:boxcolor=black@0.55:boxborderw=14`
  // Bottom label: date range
  const bottomLabel = `drawtext=fontfile='${ff}':text='${bottom}':fontsize=24:fontcolor=white:x=(w-text_w)/2:y=h-th-40:box=1:boxcolor=black@0.55:boxborderw=12`

  return [
    'scale=1280:720:force_original_aspect_ratio=decrease',
    'pad=1280:720:(ow-iw)/2:(oh-ih)/2:black',
    topLabel,
    bottomLabel,
  ].join(',')
}

function normalizeClipWithOverlay(input: string, output: string, vf: string): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .videoFilters(vf)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-pix_fmt yuv420p',
        '-r 25',
        '-ar 44100',
        '-ac 2',
        '-preset veryfast',
        '-movflags +faststart',
      ])
      .output(output)
      .on('end', () => resolve(output))
      .on('error', reject)
      .run()
  })
}

function normalizeNoOverlay(input: string, output: string): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .videoFilters('scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black')
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-pix_fmt yuv420p',
        '-r 25',
        '-ar 44100',
        '-ac 2',
        '-preset veryfast',
        '-movflags +faststart',
      ])
      .output(output)
      .on('end', () => resolve(output))
      .on('error', reject)
      .run()
  })
}

export async function generateVideoComprobante(data: VideoComprobante): Promise<Buffer> {
  if (data.clips.length === 0) {
    throw new Error('No hay clips para generar el comprobante')
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comprobante-'))

  try {
    const parts: string[] = []

    // Intro
    if (data.introUrl) {
      try {
        const rawIntro = path.join(tmpDir, 'raw_intro.mp4')
        const normIntro = path.join(tmpDir, 'intro.mp4')
        await downloadFile(data.introUrl, rawIntro)
        await normalizeNoOverlay(rawIntro, normIntro)
        parts.push(normIntro)
      } catch (err) {
        console.error('Intro skipped:', err)
      }
    }

    // Clips with text overlay
    for (let i = 0; i < data.clips.length; i++) {
      const clip = data.clips[i]
      const rawPath = path.join(tmpDir, `raw_${i}.mp4`)
      const normPath = path.join(tmpDir, `clip_${i}.mp4`)
      await downloadFile(clip.url, rawPath)
      const vf = buildOverlayFilter(clip.soporteNombre, data.fechaDesde, data.fechaHasta)
      await normalizeClipWithOverlay(rawPath, normPath, vf)
      parts.push(normPath)
    }

    // Outro
    if (data.outroUrl) {
      try {
        const rawOutro = path.join(tmpDir, 'raw_outro.mp4')
        const normOutro = path.join(tmpDir, 'outro.mp4')
        await downloadFile(data.outroUrl, rawOutro)
        await normalizeNoOverlay(rawOutro, normOutro)
        parts.push(normOutro)
      } catch (err) {
        console.error('Outro skipped:', err)
      }
    }

    const outputPath = path.join(tmpDir, 'output.mp4')

    if (parts.length === 1) {
      await fs.copyFile(parts[0], outputPath)
    } else {
      const listPath = path.join(tmpDir, 'list.txt')
      await fs.writeFile(listPath, parts.map(p => `file '${p}'`).join('\n'))

      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(listPath)
          .inputOptions(['-f concat', '-safe 0'])
          .videoCodec('copy')
          .audioCodec('copy')
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', reject)
          .run()
      })
    }

    return await fs.readFile(outputPath)
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}
