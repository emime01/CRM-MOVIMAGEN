import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * Datos que necesita el navegador para armar el video comprobante.
 *
 * El video es sólo para pantallas LED/digitales: los buses y los soportes
 * estáticos se documentan con foto y salen por PDF (ver /api/comprobantes).
 */

const ROLES_HABILITADOS = ['operaciones', 'administracion', 'asistente_ventas', 'gerente_comercial']

type SoporteInfo = {
  id: string
  nombre: string
  categoria: string | null
  ubicacion: string | null
  es_digital: boolean | null
  bus_id: string | null
}

function fmt(iso: string | null): string {
  if (!iso) return ''
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function periodo(desde: string | null, hasta: string | null): string {
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre']
  if (!desde) return ''
  const d = new Date(`${desde.slice(0, 10)}T00:00:00`)
  const h = hasta ? new Date(`${hasta.slice(0, 10)}T00:00:00`) : null
  const ini = `${meses[d.getMonth()]} ${d.getFullYear()}`
  if (!h) return ini
  const fin = `${meses[h.getMonth()]} ${h.getFullYear()}`
  return ini === fin ? ini : `${meses[d.getMonth()]} – ${fin}`
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!ROLES_HABILITADOS.includes(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const reservaId = req.nextUrl.searchParams.get('reserva_id')
  if (!reservaId) return NextResponse.json({ error: 'reserva_id requerido' }, { status: 400 })

  const supabase = createServerClient()

  const { data: reserva } = await supabase
    .from('reservas')
    .select(`
      id, fecha_desde, fecha_hasta,
      clientes(nombre, empresa),
      reserva_items(
        soporte_id, fecha_alta_real, fecha_baja_real,
        soportes(id, nombre, categoria, ubicacion, es_digital, bus_id)
      )
    `)
    .eq('id', reservaId)
    .single()

  if (!reserva) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 })

  const items = reserva.reserva_items as unknown as Array<{
    soporte_id: string
    fecha_alta_real: string | null
    fecha_baja_real: string | null
    soportes: SoporteInfo | null
  }>

  // Sólo soportes digitales sin bus: esos son los que llevan video.
  const digitales = items.filter(it => it.soportes?.es_digital && !it.soportes?.bus_id)
  const infoPorSoporte = new Map(digitales.map(it => [it.soporte_id, it]))

  const { data: registros } = await supabase
    .from('registros')
    .select('soporte_id, storage_path, tipo, fecha_registro')
    .eq('reserva_id', reservaId)
    .eq('tipo', 'video')
    .in('soporte_id', digitales.map(it => it.soporte_id))
    .order('fecha_registro')

  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/registros`

  const clips = (registros ?? []).map(r => {
    const item = infoPorSoporte.get(r.soporte_id)
    const sop = item?.soportes
    // La fecha real de instalación manda sobre la provisoria de la reserva.
    const desde = item?.fecha_alta_real ?? reserva.fecha_desde
    const hasta = item?.fecha_baja_real ?? reserva.fecha_hasta
    return {
      url: `${base}/${r.storage_path}`,
      rotulo: (sop?.categoria ?? 'LED').toUpperCase(),
      ubicacion: sop?.ubicacion ?? sop?.nombre ?? '',
      fechaDesde: fmt(desde),
      fechaHasta: fmt(hasta),
    }
  })

  const cli = Array.isArray(reserva.clientes) ? reserva.clientes[0] : reserva.clientes

  return NextResponse.json({
    reserva_id: reserva.id,
    cliente: cli?.empresa ?? cli?.nombre ?? 'Cliente',
    periodo: periodo(reserva.fecha_desde, reserva.fecha_hasta),
    clips,
  })
}
