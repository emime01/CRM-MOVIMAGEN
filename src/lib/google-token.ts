import type { SupabaseClient } from '@supabase/supabase-js'
import { refreshAccessToken } from '@/lib/gmail'

/**
 * Token de Google vigente de un perfil (lo renueva si venció).
 * `null` si esa persona no conectó su cuenta.
 */
export async function tokenDeGoogle(supabase: SupabaseClient, perfilId: string): Promise<string | null> {
  const { data: row } = await supabase
    .from('google_tokens')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', perfilId)
    .maybeSingle()
  if (!row) return null

  if (new Date(row.expires_at) > new Date()) return row.access_token
  const refreshed = await refreshAccessToken(row.refresh_token)
  await supabase.from('google_tokens').update({
    access_token: refreshed.access_token,
    expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', perfilId)
  return refreshed.access_token
}
