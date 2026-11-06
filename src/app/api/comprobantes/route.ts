import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { puede } from '@/lib/auth/roles'
import type { BusPhotoItem, BusSoporteGroup } from '@/lib/comprobantes/pdf'

export const dynamic = 'force-dynamic'
// En Vercel Hobby el límite real es ~60s (maxDuration=300 sólo aplica en Pro).
export const maxDuration = 60

// La generación de video (ffmpeg) no es viable en Vercel Hobby: el binario es
// pesado y el proceso excede el límite de tiempo/memoria. Queda detrás de un
// flag apagado por defecto; si se pasa a Pro (o se mueve fuera de Vercel),
// setear COMPROBANTE_VIDEO=on. Con el flag apagado, el comprobante son PDFs.
const VIDEO_ENABLED = process.env.COMPROBANTE_VIDEO === 'on'

type SoporteInfo = {
  id: string
  nombre: string
  es_digital: boolean | null
  tipo_cotizador?: string | null
  bus_id: string | null
  buses: { numero: string | null } | null
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const canGenerate = puede(session.user.rol, ['operaciones', 'administracion', 'asistente_ventas', 'gerente_comercial'])
  if (!canGenerate) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  // El comprobante documenta lo que se vendió, así que cuelga de la orden de
  // venta. Antes colgaba de la reserva, que es un bloqueo opcional y previo:
  // una venta sin bloqueo se quedaba sin comprobante posible.
  const body = await req.json()
  const orden_id: string | undefined = body.orden_id ?? body.reserva_id
  if (!orden_id) return NextResponse.json({ error: 'orden_id requerido' }, { status: 400 })

  const supabase = createServerClient()

  const { data: reserva } = await supabase
    .from('ordenes_venta')
    .select(`
      id, numero, campana, marca, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real,
      clientes(nombre, empresa),
      orden_items(
        id, soporte_id, bus_id,
        soportes(id, nombre, es_digital, tipo_cotizador, bus_id, buses!bus_id(numero))
      )
    `)
    .eq('id', orden_id)
    .single()

  if (!reserva) return NextResponse.json({ error: 'Orden de venta no encontrada' }, { status: 404 })

  const cli = Array.isArray(reserva.clientes) ? reserva.clientes[0] : reserva.clientes
  // Manda la fecha real cuando existe: el comprobante muestra lo que pasó.
  // dd/mm/aaaa: el comprobante lo lee el cliente (antes salía 2026-12-01).
  const fechaUY = (f: string | null) => (f ? f.slice(0, 10).split('-').reverse().join('/') : '')
  const fechaDesde = fechaUY(reserva.fecha_alta_real ?? reserva.fecha_alta_prevista)
  const fechaHasta = fechaUY(reserva.fecha_baja_real ?? reserva.fecha_baja_prevista)
  const clienteNombre = cli?.empresa ?? cli?.nombre ?? 'Cliente'
  // Lo que el cliente reconoce: la campaña, si no la marca, si no la OIC.
  // Antes era un pedazo del id interno ("c7133bd0").
  const numeroCampana = [reserva.campana, reserva.marca].filter(Boolean).join(' · ') || (reserva.numero ? `OIC #${reserva.numero}` : '—')
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const registrosBase = `${supabaseUrl}/storage/v1/object/public/registros`
  const assetsBase = `${supabaseUrl}/storage/v1/object/public/assets`
  const introUrl = `${assetsBase}/comprobantes/intro.mp4`
  const outroUrl = `${assetsBase}/comprobantes/outro.mp4`

  const items = (reserva.orden_items as unknown as Array<{
    id: string
    soporte_id: string
    soportes: SoporteInfo | null
  }>)

  // Los buses de cada línea ("FullBus × 3" → tres buses, v46). Si la tabla
  // todavía no existe, se usa el bus del soporte como antes.
  const busesPorSoporte = new Map<string, string[]>()
  {
    const { data: rel } = await supabase.from('orden_item_buses').select('orden_item_id, buses(numero)').in('orden_item_id', items.map(i => i.id))
    const soporteDeItem = new Map(items.map(i => [i.id, i.soporte_id]))
    for (const r of (rel ?? []) as any[]) {
      const b = Array.isArray(r.buses) ? r.buses[0] : r.buses
      const sid = soporteDeItem.get(r.orden_item_id)
      if (b?.numero && sid) (busesPorSoporte.get(sid) ?? busesPorSoporte.set(sid, []).get(sid)!).push(String(b.numero))
    }
  }
  const esDeBus = (sid: string) => {
    const s = soporteMap.get(sid)
    return s?.bus_id != null || s?.tipo_cotizador === 'estatico_bus' || busesPorSoporte.has(sid)
  }

  const soporteIds = items.map(it => it.soporte_id).filter(Boolean)
  const { data: registros } = await supabase
    .from('registros')
    .select('*')
    .in('soporte_id', soporteIds)
    .eq('orden_id', orden_id)
    .order('fecha_registro')

  const soporteMap = new Map<string, SoporteInfo | null>(items.map(it => [it.soporte_id, it.soportes]))

  const videoRegistros  = (registros ?? []).filter(r => r.tipo === 'video')
  const fotoRegistros   = (registros ?? []).filter(r => r.tipo === 'foto')
  const busRegistros    = fotoRegistros.filter(r => esDeBus(r.soporte_id))
  const staticRegistros = fotoRegistros.filter(r => !esDeBus(r.soporte_id))

  if (videoRegistros.length === 0 && fotoRegistros.length === 0) {
    return NextResponse.json({ error: 'No hay registros subidos para esta venta' }, { status: 400 })
  }

  const generated: { tipo: string; path: string }[] = []
  const errors: { tipo: string; message: string }[] = []

  // Los PDF se generan PRIMERO (rápidos y confiables en cualquier plan). El
  // video, si está habilitado, va al final para no bloquearlos.

  // ── PDF comprobante — buses (landscape, lista + fotos grandes) ────────────
  if (busRegistros.length > 0) {
    try {
      const { generateBusPdfComprobante } = await import('@/lib/comprobantes/pdf')

      // Group by soporte nombre (e.g., "Lateral Extra Izquierdo")
      const grupoMap = new Map<string, { buses: Set<string>; fotos: BusPhotoItem[] }>()
      for (const r of busRegistros) {
        const s = soporteMap.get(r.soporte_id)
        const nombre   = s?.nombre ?? r.soporte_id
        const asignados = busesPorSoporte.get(r.soporte_id) ?? []
        const busNumero = asignados.length === 1 ? asignados[0] : (s?.buses?.numero ?? (asignados.length ? null : 'N/A'))
        if (!grupoMap.has(nombre)) grupoMap.set(nombre, { buses: new Set(), fotos: [] })
        const g = grupoMap.get(nombre)!
        // El listado lleva todos los buses asignados a la línea.
        for (const n of asignados) g.buses.add(n)
        if (!asignados.length && busNumero) g.buses.add(busNumero)
        g.fotos.push({ url: `${registrosBase}/${r.storage_path}`, soporteNombre: nombre, busNumero, fechaRegistro: r.fecha_registro })
      }
      const grupos: BusSoporteGroup[] = Array.from(grupoMap.entries()).map(([nombre, { buses, fotos }]) => ({
        nombre,
        buses: Array.from(buses).sort((a, b) => Number(a) - Number(b)),
        fotos,
      }))

      const buffer = await generateBusPdfComprobante({
        cliente: clienteNombre, numeroCampana,
        fechaDesde: fechaDesde, fechaHasta: fechaHasta,
        grupos,
      })
      const busPath = `${orden_id}/comprobante_buses.pdf`
      const { error: upErr } = await supabase.storage.from('comprobantes').upload(busPath, buffer, { contentType: 'application/pdf', upsert: true })
      if (upErr) throw new Error(`Upload falló: ${upErr.message}`)
      generated.push({ tipo: 'pdf_buses', path: busPath })
    } catch (err) {
      console.error('Bus PDF generation error:', err)
      errors.push({ tipo: 'pdf_buses', message: err instanceof Error ? err.message : String(err) })
    }
  }

  // ── PDF comprobante — estáticos regulares (portrait, grilla 2 col) ────────
  if (staticRegistros.length > 0) {
    try {
      const { generateStaticPdfComprobante } = await import('@/lib/comprobantes/pdf')
      const fotos = staticRegistros.map(r => ({
        url: `${registrosBase}/${r.storage_path}`,
        soporteNombre: soporteMap.get(r.soporte_id)?.nombre ?? r.soporte_id,
        fechaRegistro: r.fecha_registro,
      }))
      const buffer = await generateStaticPdfComprobante({
        cliente: clienteNombre, numeroCampana,
        fechaDesde: fechaDesde, fechaHasta: fechaHasta,
        fotos,
      })
      const pdfPath = `${orden_id}/comprobante_estaticos.pdf`
      const { error: upErr } = await supabase.storage.from('comprobantes').upload(pdfPath, buffer, { contentType: 'application/pdf', upsert: true })
      if (upErr) throw new Error(`Upload falló: ${upErr.message}`)
      generated.push({ tipo: 'pdf', path: pdfPath })
    } catch (err) {
      console.error('Static PDF generation error:', err)
      errors.push({ tipo: 'pdf', message: err instanceof Error ? err.message : String(err) })
    }
  }

  // ── Video comprobante (best-effort, sólo con el flag habilitado) ──────────
  if (VIDEO_ENABLED && videoRegistros.length > 0) {
    try {
      const { generateVideoComprobante } = await import('@/lib/comprobantes/video')
      const clips = videoRegistros.map(r => ({
        url: `${registrosBase}/${r.storage_path}`,
        soporteNombre: soporteMap.get(r.soporte_id)?.nombre ?? r.soporte_id,
      }))
      const buffer = await generateVideoComprobante({
        cliente: clienteNombre, numeroCampana,
        fechaDesde: fechaDesde, fechaHasta: fechaHasta,
        clips, introUrl, outroUrl,
      })
      const videoPath = `${orden_id}/video.mp4`
      const { error: upErr } = await supabase.storage.from('comprobantes').upload(videoPath, buffer, { contentType: 'video/mp4', upsert: true })
      if (upErr) throw new Error(`Upload falló: ${upErr.message}`)
      generated.push({ tipo: 'video', path: videoPath })
    } catch (err) {
      console.error('Video generation error:', err)
      errors.push({ tipo: 'video', message: err instanceof Error ? err.message : String(err) })
    }
  }

  if (generated.length === 0) {
    // Caso típico en Hobby: sólo hay videos subidos y el video está deshabilitado.
    if (!VIDEO_ENABLED && fotoRegistros.length === 0 && videoRegistros.length > 0) {
      return NextResponse.json({ error: 'La generación de video está deshabilitada en este plan. Subí fotos para generar el comprobante en PDF.' }, { status: 400 })
    }
    const detail = errors.map(e => `${e.tipo}: ${e.message}`).join(' | ') || 'Error desconocido'
    return NextResponse.json({ error: `Error generando comprobante - ${detail}` }, { status: 500 })
  }

  const publicBase = `${supabaseUrl}/storage/v1/object/public/comprobantes`
  return NextResponse.json({
    ok: true,
    comprobantes: generated.map(g => ({ tipo: g.tipo, url: `${publicBase}/${g.path}` })),
    errors: errors.length > 0 ? errors : undefined,
  })
}
