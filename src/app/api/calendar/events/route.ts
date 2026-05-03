import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { refreshAccessToken } from '@/lib/gmail'
import { listEvents, createEvent } from '@/lib/calendar'

async function getValidToken(userId: string) {
  const supabase = createServerClient()
  const { data: row } = await supabase
    .from('google_tokens')
    .select('*')
    .eq('user_id', userId)
    .single()
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

// GET /api/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const from = searchParams.get('from') ? new Date(searchParams.get('from')!) : new Date()
  const to = searchParams.get('to') ? new Date(searchParams.get('to')!) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

  const userId = (session.user as { id: string }).id
  const accessToken = await getValidToken(userId)
  if (!accessToken) return NextResponse.json({ error: 'not_connected' }, { status: 404 })

  try {
    const events = await listEvents(accessToken, from, to)
    return NextResponse.json(events)
  } catch (err: unknown) {
    if ((err as { status?: number }).status === 403) {
      return NextResponse.json({ error: 'insufficient_scope' }, { status: 403 })
    }
    return NextResponse.json({ error: 'calendar_error' }, { status: 500 })
  }
}

// POST /api/calendar/events
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as { id: string }).id
  const accessToken = await getValidToken(userId)
  if (!accessToken) return NextResponse.json({ error: 'not_connected' }, { status: 404 })

  const body = await req.json()
  const { summary, description, start, end, crmType, crmLeadId } = body
  if (!summary || !start || !end) {
    return NextResponse.json({ error: 'summary, start y end son requeridos' }, { status: 400 })
  }

  const event = await createEvent(accessToken, { summary, description, start, end, crmType, crmLeadId })
  return NextResponse.json(event, { status: 201 })
}
