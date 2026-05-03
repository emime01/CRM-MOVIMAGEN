import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { refreshAccessToken } from '@/lib/gmail'
import { deleteEvent, updateEvent } from '@/lib/calendar'

async function getValidToken(userId: string) {
  const supabase = createServerClient()
  const { data: row } = await supabase.from('google_tokens').select('*').eq('user_id', userId).single()
  if (!row) return null
  let accessToken = row.access_token
  if (new Date(row.expires_at) <= new Date()) {
    const refreshed = await refreshAccessToken(row.refresh_token)
    accessToken = refreshed.access_token
    await supabase.from('google_tokens').update({
      access_token: accessToken,
      expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId)
  }
  return accessToken
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as { id: string }).id
  const accessToken = await getValidToken(userId)
  if (!accessToken) return NextResponse.json({ error: 'not_connected' }, { status: 404 })
  await deleteEvent(accessToken, params.id)
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as { id: string }).id
  const accessToken = await getValidToken(userId)
  if (!accessToken) return NextResponse.json({ error: 'not_connected' }, { status: 404 })
  const body = await req.json()
  const event = await updateEvent(accessToken, params.id, body)
  return NextResponse.json(event)
}
