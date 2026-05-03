import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

// PATCH /api/notificaciones/[id] — mark as read
export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as { id: string }).id
  const supabase = createServerClient()

  await supabase
    .from('notificaciones')
    .update({ leida: true })
    .eq('id', params.id)
    .eq('user_id', userId)

  return NextResponse.json({ ok: true })
}

// PATCH /api/notificaciones/all — mark all as read (special id)
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  if (params.id !== 'all') return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as { id: string }).id
  const supabase = createServerClient()

  await supabase
    .from('notificaciones')
    .update({ leida: true })
    .eq('user_id', userId)
    .eq('leida', false)

  return NextResponse.json({ ok: true })
}
