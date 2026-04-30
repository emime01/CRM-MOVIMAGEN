import { exchangeCode } from '@/lib/gmail'
import { createServerClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error || !code || !state) {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/dashboard/perfil?gmail=error`)
  }

  let userId: string
  try {
    const decoded = JSON.parse(Buffer.from(state, 'base64url').toString())
    userId = decoded.userId
    if (!userId) throw new Error('no userId')
  } catch {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/dashboard/perfil?gmail=error`)
  }

  try {
    const tokens = await exchangeCode(code)
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    const supabase = createServerClient()
    await supabase.from('google_tokens').upsert({
      user_id: userId,
      gmail_email: tokens.email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/dashboard/perfil?gmail=connected`)
  } catch {
    return NextResponse.redirect(`${process.env.NEXTAUTH_URL}/dashboard/perfil?gmail=error`)
  }
}
