/**
 * Armado del video comprobante en el navegador con ffmpeg.wasm.
 *
 * Corre íntegramente en la máquina de quien genera el comprobante: no hace
 * falta ffmpeg en el servidor (imposible en Vercel Hobby) ni un servicio de
 * video pago. Cada clip se normaliza a 1280x720, se le quema la franja con
 * ubicación y fechas, y al final se concatena con las placas de inicio y
 * cierre.
 *
 * Se usa el core de un solo hilo a propósito: el multihilo exige
 * SharedArrayBuffer y por lo tanto headers COOP/COEP en toda la app, que
 * romperían la carga de imágenes desde Supabase.
 */

import { LIENZO, renderIntro, renderOutro, renderOverlayClip, esperarFuentes, type DatosClip, type DatosIntro } from './video-overlay'

/** Versión fijada: si flota, un cambio del CDN puede romper la generación. */
const CORE_VERSION = '0.12.6'
/**
 * De dónde sale el core (≈32MB, queda en la caché del navegador después de la
 * primera vez). Por defecto viene del CDN; si algún día conviene servirlo desde
 * el propio dominio, basta setear NEXT_PUBLIC_FFMPEG_CORE_BASE.
 *
 * Tiene que ser la build ESM: el worker corre como módulo, así que carga el
 * core con `import()` y espera un export default. Con la build UMD falla con
 * "failed to import ffmpeg-core.js".
 */
const CORE_BASE =
  process.env.NEXT_PUBLIC_FFMPEG_CORE_BASE ?? `https://unpkg.com/@ffmpeg/core@${CORE_VERSION}/dist/esm`

/**
 * Worker propio, servido desde /public.
 *
 * Por defecto @ffmpeg/ffmpeg resuelve su worker con `import.meta.url`, que al
 * empaquetar se pierde y tira "Failed to construct 'URL'". Pasándolo explícito
 * el problema desaparece. El archivo se genera con:
 *
 *   npx esbuild node_modules/@ffmpeg/ffmpeg/dist/esm/worker.js \
 *     --bundle --format=esm --minify --outfile=public/ffmpeg/worker.js
 *
 * Por eso @ffmpeg/ffmpeg está fijado a una versión exacta en package.json: si
 * se actualiza, hay que regenerar este archivo.
 */
const WORKER_URL = '/ffmpeg/worker.js'

const FPS = 25
const DUR_INTRO = 3
const DUR_OUTRO = 3

/** Sin audio en todos los segmentos: el comprobante no lleva música y así el
 *  concat no falla por mezclar segmentos con y sin pista. */
const ENCODE = [
  '-an',
  '-c:v', 'libx264',
  '-preset', 'ultrafast',
  '-crf', '26',
  '-pix_fmt', 'yuv420p',
]

export type ClipComprobante = DatosClip & { url: string }

export type ProgresoVideo = {
  /** 0..1 sobre el total del trabajo. */
  ratio: number
  /** Texto corto para mostrar en la UI. */
  detalle: string
}

type Opciones = {
  intro: DatosIntro
  clips: ClipComprobante[]
  onProgreso?: (p: ProgresoVideo) => void
}

/** Escala el clip a 1280x720 sin deformarlo (bandas negras si no es 16:9). */
const FILTRO_NORMALIZAR =
  `scale=${LIENZO.w}:${LIENZO.h}:force_original_aspect_ratio=decrease,` +
  `pad=${LIENZO.w}:${LIENZO.h}:(ow-iw)/2:(oh-ih)/2:color=black,fps=${FPS}`

export async function generarVideoComprobante({ intro, clips, onProgreso }: Opciones): Promise<Blob> {
  if (clips.length === 0) throw new Error('No hay clips para armar el video')

  const avisar = (ratio: number, detalle: string) =>
    onProgreso?.({ ratio: Math.max(0, Math.min(1, ratio)), detalle })

  avisar(0, 'Preparando…')
  await esperarFuentes()

  // Import dinámico: ffmpeg.wasm sólo existe en el navegador.
  const [{ FFmpeg }, { fetchFile, toBlobURL }] = await Promise.all([
    import('@ffmpeg/ffmpeg'),
    import('@ffmpeg/util'),
  ])

  const ffmpeg = new FFmpeg()

  avisar(0.02, 'Cargando el motor de video (una sola vez)…')
  await ffmpeg.load({
    classWorkerURL: new URL(WORKER_URL, window.location.origin).toString(),
    coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm'),
  })

  // El progreso de ffmpeg es por comando; lo mapeamos al tramo del paso actual.
  let tramo = { desde: 0, hasta: 0, detalle: '' }
  ffmpeg.on('progress', ({ progress }) => {
    if (tramo.hasta <= tramo.desde) return
    const r = tramo.desde + (tramo.hasta - tramo.desde) * Math.max(0, Math.min(1, progress))
    avisar(r, tramo.detalle)
  })

  const segmentos: string[] = []
  const total = clips.length + 2          // placas + clips
  const PISO = 0.1                        // lo anterior ya consumió este tramo
  const paso = (1 - PISO) / total

  try {
    /* ── placa inicial ─────────────────────────────────────────────────── */
    tramo = { desde: PISO, hasta: PISO + paso, detalle: 'Armando la placa inicial…' }
    avisar(tramo.desde, tramo.detalle)
    await ffmpeg.writeFile('intro.png', await renderIntro(intro))
    await ffmpeg.exec([
      '-loop', '1', '-i', 'intro.png', '-t', String(DUR_INTRO), '-r', String(FPS),
      ...ENCODE, 'seg_00.mp4',
    ])
    segmentos.push('seg_00.mp4')
    await ffmpeg.deleteFile('intro.png')

    /* ── clips ─────────────────────────────────────────────────────────── */
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i]
      const base = PISO + paso * (i + 1)
      tramo = {
        desde: base,
        hasta: base + paso,
        detalle: `Procesando ${clip.ubicacion} (${i + 1} de ${clips.length})…`,
      }
      avisar(tramo.desde, tramo.detalle)

      const entrada = `in_${i}.mp4`
      const capa = `ov_${i}.png`
      const salida = `seg_${String(i + 1).padStart(2, '0')}.mp4`

      await ffmpeg.writeFile(entrada, await fetchFile(clip.url))
      await ffmpeg.writeFile(capa, await renderOverlayClip(clip))
      await ffmpeg.exec([
        '-i', entrada, '-i', capa,
        '-filter_complex', `[0:v]${FILTRO_NORMALIZAR}[v];[v][1:v]overlay=0:0:format=auto[out]`,
        '-map', '[out]',
        ...ENCODE, salida,
      ])
      segmentos.push(salida)

      // Liberar memoria del wasm antes del clip siguiente.
      await ffmpeg.deleteFile(entrada)
      await ffmpeg.deleteFile(capa)
    }

    /* ── placa final ───────────────────────────────────────────────────── */
    const baseOutro = PISO + paso * (clips.length + 1)
    tramo = { desde: baseOutro, hasta: baseOutro + paso, detalle: 'Armando la placa final…' }
    avisar(tramo.desde, tramo.detalle)
    await ffmpeg.writeFile('outro.png', await renderOutro())
    const segOutro = `seg_${String(clips.length + 1).padStart(2, '0')}.mp4`
    await ffmpeg.exec([
      '-loop', '1', '-i', 'outro.png', '-t', String(DUR_OUTRO), '-r', String(FPS),
      ...ENCODE, segOutro,
    ])
    segmentos.push(segOutro)
    await ffmpeg.deleteFile('outro.png')

    /* ── unir todo ─────────────────────────────────────────────────────── */
    tramo = { desde: 0.97, hasta: 1, detalle: 'Uniendo todo…' }
    avisar(tramo.desde, tramo.detalle)
    const lista = segmentos.map(s => `file '${s}'`).join('\n')
    await ffmpeg.writeFile('lista.txt', new TextEncoder().encode(lista))
    // Los segmentos comparten códec y parámetros, así que se pegan sin recodificar.
    await ffmpeg.exec([
      '-f', 'concat', '-safe', '0', '-i', 'lista.txt',
      '-c', 'copy', '-movflags', '+faststart', 'comprobante.mp4',
    ])

    const datos = await ffmpeg.readFile('comprobante.mp4')
    const bytes = typeof datos === 'string' ? new TextEncoder().encode(datos) : datos
    avisar(1, 'Listo')
    // Copia sobre un ArrayBuffer propio: el buffer del wasm se reutiliza.
    return new Blob([new Uint8Array(bytes)], { type: 'video/mp4' })
  } finally {
    try { ffmpeg.terminate() } catch { /* ya terminado */ }
  }
}
