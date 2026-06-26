import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

const ESTADOS_VALIDOS = ['pendiente', 'pagada', 'cancelada'] as const

// PATCH /api/comisiones/[id]  { estado: 'pendiente' | 'pagada' | 'cancelada' }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (session.user.rol !== 'administracion') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  let body: { estado?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }
  if (!body.estado || !ESTADOS_VALIDOS.includes(body.estado as typeof ESTADOS_VALIDOS[number])) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { error } = await supabase
    .from('comisiones')
    .update({ estado: body.estado })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
