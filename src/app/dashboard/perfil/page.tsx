import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import PerfilClient from './PerfilClient'

export const dynamic = 'force-dynamic'

export default async function PerfilPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const userId = (session.user as { id: string }).id
  const supabase = createServerClient()

  const { data: tokenRow } = await supabase
    .from('google_tokens')
    .select('gmail_email, updated_at')
    .eq('user_id', userId)
    .maybeSingle()

  return (
    <PerfilClient
      user={{
        id: userId,
        name: session.user.name ?? '',
        email: session.user.email ?? '',
        rol: (session.user as { rol: string }).rol,
      }}
      gmailConnected={!!tokenRow}
      gmailEmail={tokenRow?.gmail_email ?? null}
    />
  )
}
