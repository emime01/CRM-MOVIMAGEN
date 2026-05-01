import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAuthUrl } from '@/lib/google/auth'
import { cookies } from 'next/headers'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const perfilId = (session.user as { id: string }).id

  // Store perfil ID in a short-lived cookie so callback knows who's connecting
  const cookieStore = cookies()
  cookieStore.set('google_oauth_uid', perfilId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 10, // 10 minutes
    path: '/',
  })

  return NextResponse.redirect(getAuthUrl())
}
