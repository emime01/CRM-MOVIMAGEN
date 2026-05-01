import { google } from 'googleapis'
import { createServerClient } from '@/lib/supabase-server'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
]

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  )
}

export function getAuthUrl() {
  return getOAuth2Client().generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })
}

export async function getAuthenticatedClient(perfilId: string) {
  const supabase = createServerClient()
  const { data: row } = await supabase
    .from('google_tokens')
    .select('*')
    .eq('perfil_id', perfilId)
    .maybeSingle()

  if (!row) return null

  const client = getOAuth2Client()
  client.setCredentials({
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expiry_date: row.token_expiry ? new Date(row.token_expiry).getTime() : undefined,
  })

  // Persist refreshed tokens automatically
  client.on('tokens', async (tokens) => {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (tokens.access_token) updates.access_token = tokens.access_token
    if (tokens.expiry_date) updates.token_expiry = new Date(tokens.expiry_date).toISOString()
    await supabase.from('google_tokens').update(updates).eq('perfil_id', perfilId)
  })

  return client
}
