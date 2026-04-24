import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
// Long timeout for video generation
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const canGenerate = ['operaciones', 'administracion', 'asistente_ventas', 'gerente_comercial'].includes(session.user.rol)
  if (!canGenerate) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { reserva_id } = await req.json()
  if (!reserva_id) return NextResponse.json({ error: 'reserva_id requerido' }, { status: 400 })

  const supabase = createServerClient()

  // Fetch reserva + registros
  const { data: reserva } = await supabase
    .from('reservas')
    .select(`
      id, numero_reserva, fecha_desde, fecha_hasta,
      clientes(nombre, empresa),
      reserva_items(
        soporte_id,
        soportes(id, nombre, es_digital)
      )
    `)
    .eq('id', reserva_id)
    .single()

  if (!reserva) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 })

  const cli = Array.isArray(reserva.clientes) ? reserva.clientes[0] : reserva.clientes
  const clienteNombre = cli?.empresa ?? cli?.nombre ?? 'Cliente'
  const numeroCampana = reserva.numero_reserva ?? reserva_id.slice(0, 8)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const storageBase = `${supabaseUrl}/storage/v1/object/public/registros`

  const items = (reserva.reserva_items as unknown as Array<{
    soporte_id: string
    soportes: { id: string; nombre: string; es_digital: boolean | null } | null
  }>)

  const soporteIds = items.map(it => it.soporte_id).filter(Boolean)
  const { data: registros } = await supabase
    .from('registros')
    .select('*')
    .in('soporte_id', soporteIds)
    .eq('reserva_id', reserva_id)
    .order('fecha_registro')

  const soporteMap = new Map(items.map(it => [it.soporte_id, it.soportes]))

  const videoRegistros = (registros ?? []).filter(r => r.tipo === 'video')
  const fotoRegistros  = (registros ?? []).filter(r => r.tipo === 'foto')

  const generated: { tipo: string; path: string }[] = []

  // ── Video comprobante ─────────────────────────────────────────────────────
  if (videoRegistros.length > 0) {
    const { generateVideoComprobante } = await import('@/lib/comprobantes/video')
    const clips = videoRegistros.map(r => ({
      url: `${storageBase}/${r.storage_path}`,
      soporteNombre: soporteMap.get(r.soporte_id)?.nombre ?? r.soporte_id,
    }))

    try {
      const buffer = await generateVideoComprobante({
        cliente: clienteNombre,
        numeroCampana,
        fechaDesde: reserva.fecha_desde,
        fechaHasta: reserva.fecha_hasta,
        clips,
      })

      const videoPath = `${reserva_id}/video_${Date.now()}.mp4`
      await supabase.storage.from('comprobantes').upload(videoPath, buffer, { contentType: 'video/mp4', upsert: true })
      generated.push({ tipo: 'video', path: videoPath })
    } catch (err) {
      console.error('Video generation error:', err)
    }
  }

  // ── PDF comprobante ───────────────────────────────────────────────────────
  if (fotoRegistros.length > 0) {
    const { generatePdfComprobante } = await import('@/lib/comprobantes/pdf')
    const fotos = fotoRegistros.map(r => ({
      url: `${storageBase}/${r.storage_path}`,
      soporteNombre: soporteMap.get(r.soporte_id)?.nombre ?? r.soporte_id,
      fechaRegistro: r.fecha_registro,
    }))

    try {
      const buffer = await generatePdfComprobante({
        cliente: clienteNombre,
        numeroCampana,
        fechaDesde: reserva.fecha_desde,
        fechaHasta: reserva.fecha_hasta,
        fotos,
      })

      const pdfPath = `${reserva_id}/comprobante_${Date.now()}.pdf`
      await supabase.storage.from('comprobantes').upload(pdfPath, buffer, { contentType: 'application/pdf', upsert: true })
      generated.push({ tipo: 'pdf', path: pdfPath })
    } catch (err) {
      console.error('PDF generation error:', err)
    }
  }

  if (generated.length === 0) {
    return NextResponse.json({ error: 'No hay registros para generar comprobante' }, { status: 400 })
  }

  const publicBase = `${supabaseUrl}/storage/v1/object/public/comprobantes`
  return NextResponse.json({
    ok: true,
    comprobantes: generated.map(g => ({
      tipo: g.tipo,
      url: `${publicBase}/${g.path}`,
    })),
  })
}
