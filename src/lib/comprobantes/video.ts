import ffmpeg from 'fluent-ffmpeg'
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import https from 'https'
import http from 'http'

// Use the installer-provided static binary — no system ffmpeg needed (works on Vercel Lambda).
ffmpeg.setFfmpegPath(ffmpegInstaller.path)

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

// Re-encode each clip to a uniform format so concat works reliably.
function normalizeClip(input: string, output: string): Promise<string> {
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
    const normalized: string[] = []

    for (let i = 0; i < data.clips.length; i++) {
      const clip = data.clips[i]
      const rawPath = path.join(tmpDir, `raw_${i}.mp4`)
      const normPath = path.join(tmpDir, `clip_${i}.mp4`)
      await downloadFile(clip.url, rawPath)
      await normalizeClip(rawPath, normPath)
      normalized.push(normPath)
    }

    const outputPath = path.join(tmpDir, 'output.mp4')

    if (normalized.length === 1) {
      // Single clip: just copy the normalized output.
      await fs.copyFile(normalized[0], outputPath)
    } else {
      // Multiple clips: concat via demuxer (faster, no re-encode).
      const listPath = path.join(tmpDir, 'list.txt')
      await fs.writeFile(listPath, normalized.map(p => `file '${p}'`).join('\n'))

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
