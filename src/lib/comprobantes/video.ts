import ffmpeg from 'fluent-ffmpeg'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import https from 'https'
import http from 'http'

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
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http
    const file = require('fs').createWriteStream(destPath)
    proto.get(url, res => {
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
    }).on('error', err => { require('fs').unlink(destPath, () => {}); reject(err) })
  })
}

function drawTextFilter(text: string, y: string, fontSize = 28) {
  const safe = text.replace(/[':]/g, ' ')
  return `drawtext=text='${safe}':fontcolor=white:fontsize=${fontSize}:x=(w-text_w)/2:y=${y}:shadowcolor=black:shadowx=2:shadowy=2`
}

// Generate a colored title slide with ffmpeg lavfi
function buildTitleSlide(tmpDir: string, data: VideoComprobante): Promise<string> {
  const outPath = path.join(tmpDir, 'title.mp4')
  const line1 = data.cliente
  const line2 = `Campaña ${data.numeroCampana}`
  const line3 = `${data.fechaDesde} → ${data.fechaHasta}`

  const vf = [
    drawTextFilter(line1, 'h/2-60', 32),
    drawTextFilter(line2, 'h/2-10', 24),
    drawTextFilter(line3, 'h/2+34', 18),
  ].join(',')

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input('color=c=#1a1a2e:s=1280x720:r=25:d=3')
      .inputFormat('lavfi')
      .videoFilters(vf)
      .outputOptions(['-c:v libx264', '-t 3', '-pix_fmt yuv420p'])
      .output(outPath)
      .on('end', () => resolve(outPath))
      .on('error', reject)
      .run()
  })
}

function buildOutroSlide(tmpDir: string): Promise<string> {
  const outPath = path.join(tmpDir, 'outro.mp4')
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input('color=c=#1a1a2e:s=1280x720:r=25:d=2')
      .inputFormat('lavfi')
      .videoFilters(drawTextFilter('MOVIMAGEN', 'h/2-20', 36))
      .outputOptions(['-c:v libx264', '-t 2', '-pix_fmt yuv420p'])
      .output(outPath)
      .on('end', () => resolve(outPath))
      .on('error', reject)
      .run()
  })
}

// Scale + re-encode a clip to 1280x720 so all segments match
function normalizeClip(input: string, output: string): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(input)
      .videoFilters('scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2')
      .audioCodec('aac')
      .videoCodec('libx264')
      .outputOptions(['-pix_fmt yuv420p', '-ar 44100', '-ac 2'])
      .output(output)
      .on('end', () => resolve(output))
      .on('error', reject)
      .run()
  })
}

export async function generateVideoComprobante(data: VideoComprobante): Promise<Buffer> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'comprobante-'))

  try {
    const parts: string[] = []

    // Title slide
    const title = await buildTitleSlide(tmpDir, data)
    parts.push(title)

    // Download + normalize each clip
    for (let i = 0; i < data.clips.length; i++) {
      const clip = data.clips[i]
      const rawPath = path.join(tmpDir, `raw_${i}.mp4`)
      const normPath = path.join(tmpDir, `clip_${i}.mp4`)
      await downloadFile(clip.url, rawPath)
      await normalizeClip(rawPath, normPath)
      parts.push(normPath)
    }

    // Outro
    const outro = await buildOutroSlide(tmpDir)
    parts.push(outro)

    // Write concat list
    const listPath = path.join(tmpDir, 'list.txt')
    const listContent = parts.map(p => `file '${p}'`).join('\n')
    await fs.writeFile(listPath, listContent)

    // Concatenate all
    const outputPath = path.join(tmpDir, 'output.mp4')
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

    const buffer = await fs.readFile(outputPath)
    return buffer
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}
