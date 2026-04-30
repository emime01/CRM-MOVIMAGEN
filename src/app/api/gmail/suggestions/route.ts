import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

// GET /api/gmail/suggestions → list pending suggestions for current user
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as { id: string }).id
  const supabase = createServerClient()

  const { data } = await supabase
    .from('email_suggestions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('received_at', { ascending: false })
    .limit(50)

  return NextResponse.json(data ?? [])
}
