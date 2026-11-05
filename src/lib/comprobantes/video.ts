import ffmpeg from 'fluent-ffmpeg'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import https from 'https'
import http from 'http'
import { MONTSERRAT_BOLD_B64 } from './fuente'

ffmpeg.setFfmpegPath(ffmpegInstaller.path)

// Montserrat-Bold.ttf embedded as base64 so it's always in the JS bundle
// regardless of Vercel file-tracing behaviour.
const FONT_B64 = MONTSERRAT_BOLD_B64

let _fontPath: string | null = null
async function ensureFont(): Promise<string> {
  if (_fontPath) return _fontPath
  const p = path.join(os.tmpdir(), 'comprobante-font.ttf')
  await fs.writeFile(p, Buffer.from(FONT_B64, 'base64'))
  _fontPath = p
  return p
}

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

function escapeDrawText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "’")
    .replace(/%/g, '\\%')
}

function escapeFontPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:')
}

function formatDDMMYYYY(d: string): string {
  if (!d) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(d)) {
    const [y, m, day] = d.slice(0, 10).split('-')
    return `${day}-${m}-${y}`
  }
  return d
}

async function buildOverlayFilter(soporteNombre: string, fechaDesde: string, fechaHasta: string): Promise<string> {
  const fontPath = await ensureFont()
  const nameText = escapeDrawText(soporteNombre.toUpperCase())
  const dateText = escapeDrawText(`DESDE: ${formatDDMMYYYY(fechaDesde)}  HASTA: ${formatDDMMYYYY(fechaHasta)}`)
  const ff = escapeFontPath(fontPath)

  const whiteBox = `drawbox=x=0:y=h-120:w=iw:h=120:color=white@1.0:t=fill`
  const nameLabel = `drawtext=fontfile='${ff}':text='${nameText}':fontsize=38:fontcolor=0xEB691C:x=(w-text_w)/2:y=h-100`
  const dateLabel = `drawtext=fontfile='${ff}':text='${dateText}':fontsize=26:fontcolor=0xEB691C:x=(w-text_w)/2:y=h-50`

  return [
    'scale=1280:720:force_original_aspect_ratio=decrease',
    'pad=1280:720:(ow-iw)/2:(oh-ih)/2:black',
    whiteBox,
    nameLabel,
    dateLabel,
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

    for (let i = 0; i < data.clips.length; i++) {
      const clip = data.clips[i]
      const rawPath = path.join(tmpDir, `raw_${i}.mp4`)
      const normPath = path.join(tmpDir, `clip_${i}.mp4`)
      await downloadFile(clip.url, rawPath)
      const vf = await buildOverlayFilter(clip.soporteNombre, data.fechaDesde, data.fechaHasta)
      await normalizeClipWithOverlay(rawPath, normPath, vf)
      parts.push(normPath)
    }

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
