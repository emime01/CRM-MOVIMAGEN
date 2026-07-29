import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * URL firmada para que el navegador suba el video comprobante directo al
 * bucket.
 *
 * El video no puede pasar por esta función: en Vercel Hobby el body de una
 * serverless function está limitado a ~4.5MB y un comprobante de varios clips
 * lo supera. Con la URL firmada el archivo va del navegador a Supabase sin
 * intermediarios, y además no depende de las policies del bucket porque el
 * token lo emite el service_role.
 */

const ROLES_HABILITADOS = ['operaciones', 'administracion', 'asistente_ventas', 'gerente_comercial']

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!ROLES_HABILITADOS.includes(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { reserva_id } = await req.json()
  if (!reserva_id) return NextResponse.json({ error: 'reserva_id requerido' }, { status: 400 })

  const supabase = createServerClient()

  // Validar que la reserva exista antes de firmar cualquier subida.
  const { data: reserva } = await supabase.from('reservas').select('id').eq('id', reserva_id).maybeSingle()
  if (!reserva) return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 })

  const path = `${reserva_id}/comprobante_video.mp4`

  // upsert para poder regenerar el video de una misma reserva.
  const { data, error } = await supabase.storage
    .from('comprobantes')
    .createSignedUploadUrl(path, { upsert: true })

  if (error || !data) {
    return NextResponse.json({ error: `No se pudo preparar la subida: ${error?.message ?? 'error desconocido'}` }, { status: 500 })
  }

  const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comprobantes/${path}`

  return NextResponse.json({ path, token: data.token, url: publicUrl })
}
