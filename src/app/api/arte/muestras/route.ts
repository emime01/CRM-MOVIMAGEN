import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const ordenId = searchParams.get('orden_id')

  const supabase = createServerClient()
  let query = supabase
    .from('muestras_impresion')
    .select('*, ordenes_venta(numero, marca, clientes(nombre, empresa)), soportes(nombre), perfiles(nombre)')
    .order('orden_id')
    .order('soporte_id')
    .order('version', { ascending: false })

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
  const { orden_id, soporte_id, storage_path, nombre_archivo, comentario, fecha_entrega } = body

  if (!orden_id) {
    return NextResponse.json({ error: 'Falta orden_id' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Calculate next version for this orden+soporte combo
  const { data: existing } = await supabase
    .from('muestras_impresion')
    .select('version')
    .eq('orden_id', orden_id)
    .eq('soporte_id', soporte_id ?? null)
    .order('version', { ascending: false })
    .limit(1)

  const nextVersion = existing && existing.length > 0 ? existing[0].version + 1 : 1

  const { data, error } = await supabase
    .from('muestras_impresion')
    .insert({
      orden_id,
      soporte_id: soporte_id || null,
      storage_path: storage_path || null,
      nombre_archivo: nombre_archivo || null,
      comentario: comentario || null,
      fecha_entrega: fecha_entrega || null,
      version: nextVersion,
      estado: 'pendiente',
      subido_por: session.user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
