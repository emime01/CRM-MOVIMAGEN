import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// GET /api/notificaciones — unread notifications for current user
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as { id: string }).id
  const supabase = createServerClient()

  const { data } = await supabase
    .from('notificaciones')
    .select('id, tipo, titulo, mensaje, link, leida, created_at')
    .eq('user_id', userId)
    .eq('leida', false)
    .order('created_at', { ascending: false })
    .limit(30)

  return NextResponse.json(data ?? [])
}
