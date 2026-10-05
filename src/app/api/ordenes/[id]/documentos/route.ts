import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: { nombre: string; url: string; tipo?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('orden_documentos')
    .insert({
      orden_id: params.id,
      nombre: body.nombre,
      url: body.url,
      tipo: body.tipo || 'otro',
      subido_por: session.user.id,
    })
    .select('id, nombre, url, tipo, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const docId = searchParams.get('docId')
  if (!docId) return NextResponse.json({ error: 'docId requerido' }, { status: 400 })

  const supabase = createServerClient()
  // Se ata el documento a la orden de la URL: sin esto, con sólo saber un
  // docId se podía borrar el adjunto de cualquier venta.
  const { error } = await supabase
    .from('orden_documentos')
    .delete()
    .eq('id', docId)
    .eq('orden_id', params.id)
    .eq('orden_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
