import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import type { BusPhotoItem, BusSoporteGroup } from '@/lib/comprobantes/pdf'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

type SoporteInfo = {
  id: string
  nombre: string
  es_digital: boolean | null
  bus_id: string | null
  buses: { numero_bus: string | null } | null
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const canGenerate = ['operaciones', 'administracion', 'asistente_ventas', 'gerente_comercial'].includes(session.user.rol)
  if (!canGenerate) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { reserva_id } = await req.json()
  if (!reserva_id) return NextResponse.json({ error: 'reserva_id requerido' }, { status: 400 })

  const supabase = createServerClient()

  const { data: reserva } = await supabase
    .from('reservas')
    .select(`
      id, fecha_desde, fecha_hasta,
      clientes(nombre, empresa),
      reserva_items(
        soporte_id,
        soportes(id, nombre, es_digital, bus_id, buses(numero_bus))
      )
    `)
    .eq('id', reserva_id)
    .single()

  if (!reserva) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 })

  const cli = Array.isArray(reserva.clientes) ? reserva.clientes[0] : reserva.clientes
  const clienteNombre = cli?.empresa ?? cli?.nombre ?? 'Cliente'
  const numeroCampana = reserva_id.slice(0, 8)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const registrosBase = `${supabaseUrl}/storage/v1/object/public/registros`
  const assetsBase = `${supabaseUrl}/storage/v1/object/public/assets`
  const introUrl = `${assetsBase}/comprobantes/intro.mp4`
  const outroUrl = `${assetsBase}/comprobantes/outro.mp4`

  const items = (reserva.reserva_items as unknown as Array<{
    soporte_id: string
    soportes: SoporteInfo | null
  }>)

  const soporteIds = items.map(it => it.soporte_id).filter(Boolean)
  const { data: registros } = await supabase
    .from('registros')
    .select('*')
    .in('soporte_id', soporteIds)
    .eq('reserva_id', reserva_id)
    .order('fecha_registro')

  const soporteMap = new Map<string, SoporteInfo | null>(items.map(it => [it.soporte_id, it.soportes]))

  const videoRegistros  = (registros ?? []).filter(r => r.tipo === 'video')
  const fotoRegistros   = (registros ?? []).filter(r => r.tipo === 'foto')
  const busRegistros    = fotoRegistros.filter(r => soporteMap.get(r.soporte_id)?.bus_id != null)
  const staticRegistros = fotoRegistros.filter(r => !soporteMap.get(r.soporte_id)?.bus_id)

  if (videoRegistros.length === 0 && fotoRegistros.length === 0) {
    return NextResponse.json({ error: 'No hay registros subidos para esta reserva' }, { status: 400 })
  }

  const generated: { tipo: string; path: string }[] = []
  const errors: { tipo: string; message: string }[] = []

  // ── Video comprobante ─────────────────────────────────────────────────────
  if (videoRegistros.length > 0) {
    try {
      const { generateVideoComprobante } = await import('@/lib/comprobantes/video')
      const clips = videoRegistros.map(r => ({
        url: `${registrosBase}/${r.storage_path}`,
        soporteNombre: soporteMap.get(r.soporte_id)?.nombre ?? r.soporte_id,
      }))
      const buffer = await generateVideoComprobante({
        cliente: clienteNombre, numeroCampana,
        fechaDesde: reserva.fecha_desde, fechaHasta: reserva.fecha_hasta,
        clips, introUrl, outroUrl,
      })
      const videoPath = `${reserva_id}/video.mp4`
      const { error: upErr } = await supabase.storage.from('comprobantes').upload(videoPath, buffer, { contentType: 'video/mp4', upsert: true })
      if (upErr) throw new Error(`Upload falló: ${upErr.message}`)
      generated.push({ tipo: 'video', path: videoPath })
    } catch (err) {
      console.error('Video generation error:', err)
      errors.push({ tipo: 'video', message: err instanceof Error ? err.message : String(err) })
    }
  }

  // ── PDF comprobante — buses (landscape, lista + fotos grandes) ────────────
  if (busRegistros.length > 0) {
    try {
      const { generateBusPdfComprobante } = await import('@/lib/comprobantes/pdf')

      // Group by soporte nombre (e.g., "Lateral Extra Izquierdo")
      const grupoMap = new Map<string, { buses: Set<string>; fotos: BusPhotoItem[] }>()
      for (const r of busRegistros) {
        const s = soporteMap.get(r.soporte_id)
        const nombre   = s?.nombre ?? r.soporte_id
        const busNumero = s?.buses?.numero_bus ?? 'N/A'
        if (!grupoMap.has(nombre)) grupoMap.set(nombre, { buses: new Set(), fotos: [] })
        const g = grupoMap.get(nombre)!
        g.buses.add(busNumero)
        g.fotos.push({ url: `${registrosBase}/${r.storage_path}`, soporteNombre: nombre, busNumero, fechaRegistro: r.fecha_registro })
      }
      const grupos: BusSoporteGroup[] = Array.from(grupoMap.entries()).map(([nombre, { buses, fotos }]) => ({
        nombre,
        buses: Array.from(buses).sort((a, b) => Number(a) - Number(b)),
        fotos,
      }))

      const buffer = await generateBusPdfComprobante({
        cliente: clienteNombre, numeroCampana,
        fechaDesde: reserva.fecha_desde, fechaHasta: reserva.fecha_hasta,
        grupos,
      })
      const busPath = `${reserva_id}/comprobante_buses.pdf`
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
        fechaDesde: reserva.fecha_desde, fechaHasta: reserva.fecha_hasta,
        fotos,
      })
      const pdfPath = `${reserva_id}/comprobante_estaticos.pdf`
      const { error: upErr } = await supabase.storage.from('comprobantes').upload(pdfPath, buffer, { contentType: 'application/pdf', upsert: true })
      if (upErr) throw new Error(`Upload falló: ${upErr.message}`)
      generated.push({ tipo: 'pdf', path: pdfPath })
    } catch (err) {
      console.error('Static PDF generation error:', err)
      errors.push({ tipo: 'pdf', message: err instanceof Error ? err.message : String(err) })
    }
  }

  if (generated.length === 0) {
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
