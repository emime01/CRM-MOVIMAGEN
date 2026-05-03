import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const reservaId = searchParams.get('reserva_id')
  const soporteId = searchParams.get('soporte_id')

  const supabase = createServerClient()
  let query = supabase
    .from('registros')
    .select('*, soportes(nombre, tipo, es_digital), perfiles(nombre)')
    .order('created_at', { ascending: false })

  if (reservaId) query = query.eq('reserva_id', reservaId)
  if (soporteId) query = query.eq('soporte_id', soporteId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Vendedores solo consultan; carga la hace operaciones / administración / ventas internas.
  const canUpload = ['administracion', 'operaciones', 'asistente_ventas', 'gerente_comercial'].includes(session.user.rol)
  if (!canUpload) return NextResponse.json({ error: 'Sin permisos para subir registros' }, { status: 403 })

  const body = await req.json()
  const { soporte_id, reserva_id, tipo, storage_path, nombre_archivo, notas, fecha_registro } = body

  if (!soporte_id || !tipo || !storage_path) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('registros')
    .insert({
      soporte_id,
      reserva_id: reserva_id || null,
      tipo,
      storage_path,
      nombre_archivo: nombre_archivo || null,
      notas: notas || null,
      fecha_registro: fecha_registro || new Date().toISOString().split('T')[0],
      subido_por: session.user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
