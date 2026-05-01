import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getOAuth2Client } from '@/lib/google/auth'
import { createServerClient } from '@/lib/supabase-server'
import { google } from 'googleapis'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  const cookieStore = cookies()
  const perfilId = cookieStore.get('google_oauth_uid')?.value

  if (error || !code) {
    return NextResponse.redirect(new URL('/dashboard/perfil?gmail=error', req.url))
  }
  if (!perfilId) {
    return NextResponse.redirect(new URL('/dashboard/perfil?gmail=expired', req.url))
  }

  try {
    const client = getOAuth2Client()
    const { tokens } = await client.getToken(code)
    client.setCredentials(tokens)

    // Fetch the connected Gmail address
    const oauth2 = google.oauth2({ version: 'v2', auth: client })
    const { data: userInfo } = await oauth2.userinfo.get()
    const gmailEmail = userInfo.email ?? ''

    const supabase = createServerClient()
    await supabase.from('google_tokens').upsert(
      {
        perfil_id: perfilId,
        gmail_email: gmailEmail,
        access_token: tokens.access_token ?? '',
        refresh_token: tokens.refresh_token ?? null,
        token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'perfil_id' },
    )

    cookieStore.delete('google_oauth_uid')
    return NextResponse.redirect(new URL('/dashboard/perfil?gmail=ok', req.url))
  } catch {
    return NextResponse.redirect(new URL('/dashboard/perfil?gmail=error', req.url))
  }
}
