import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { buildOAuthUrl } from '@/lib/gmail'
import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'

// GET /api/auth/google → redirect to Google OAuth consent screen
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as { id: string }).id
  const state = Buffer.from(JSON.stringify({ userId, ts: Date.now() })).toString('base64url')

  return NextResponse.redirect(buildOAuthUrl(state))
}

// DELETE /api/auth/google → disconnect Gmail
export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServerClient()
  const userId = (session.user as { id: string }).id

  await supabase.from('google_tokens').delete().eq('user_id', userId)

  return NextResponse.json({ ok: true })
}
