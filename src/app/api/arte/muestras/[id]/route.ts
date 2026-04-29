import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['arte', 'administracion'].includes(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const body = await req.json()
  const { estado, comentario, fecha_entrega, storage_path, nombre_archivo } = body

  if (estado && !['pendiente', 'aprobado', 'rechazado'].includes(estado)) {
    return NextResponse.json({ error: 'Estado invalido' }, { status: 400 })
  }

  const supabase = createServerClient()
  const updates: Record<string, unknown> = {}
  if (estado !== undefined) updates.estado = estado
  if (comentario !== undefined) updates.comentario = comentario
  if (fecha_entrega !== undefined) updates.fecha_entrega = fecha_entrega
  if (storage_path !== undefined) updates.storage_path = storage_path
  if (nombre_archivo !== undefined) updates.nombre_archivo = nombre_archivo

  const { data, error } = await supabase
    .from('muestras_impresion')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['arte', 'administracion'].includes(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const supabase = createServerClient()
  const { error } = await supabase
    .from('muestras_impresion')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
