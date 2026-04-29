import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const soporteId = searchParams.get('soporte_id')
  const ordenId = searchParams.get('orden_id')

  const supabase = createServerClient()
  let query = supabase
    .from('materiales_digitales')
    .select('*, soportes(nombre), ordenes_venta(numero, marca), perfiles(nombre)')
    .eq('activo', true)
    .order('created_at', { ascending: false })

  if (soporteId) query = query.eq('soporte_id', soporteId) as typeof query
  if (ordenId) query = query.eq('orden_id', ordenId) as typeof query

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['arte', 'administracion'].includes(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const body = await req.json()
  const { soporte_id, orden_id, reserva_id, storage_path, nombre_archivo, descripcion } = body

  if (!soporte_id || !storage_path) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('materiales_digitales')
    .insert({
      soporte_id,
      orden_id: orden_id || null,
      reserva_id: reserva_id || null,
      storage_path,
      nombre_archivo: nombre_archivo || null,
      descripcion: descripcion || null,
      subido_por: session.user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['arte', 'administracion'].includes(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

  const supabase = createServerClient()
  const { error } = await supabase
    .from('materiales_digitales')
    .update({ activo: false })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
