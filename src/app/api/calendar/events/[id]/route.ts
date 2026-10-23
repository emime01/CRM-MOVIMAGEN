import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { tokenDeGoogle } from '@/lib/google-token'
import { deleteEvent, updateEvent } from '@/lib/calendar'

const getValidToken = (userId: string) => tokenDeGoogle(createServerClient(), userId)

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
