import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import AgendaClient from './AgendaClient'

export const dynamic = 'force-dynamic'

export default async function AgendaPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const userId = (session.user as { id: string }).id
  const supabase = createServerClient()

  // Check if user has Google connected
  const { data: tokenRow } = await supabase
    .from('google_tokens')
    .select('gmail_email')
    .eq('user_id', userId)
    .maybeSingle()

  // Fetch active leads for event creation form
  const { data: leads } = await supabase
    .from('leads')
    .select('id, descripcion, clientes(nombre, empresa)')
    .eq('vendedor_id', userId)
    .in('estado', ['nuevo', 'en_conversacion', 'propuesta_enviada'])
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <AgendaClient
      googleConnected={!!tokenRow}
      leads={(leads ?? []).map(l => ({
        id: l.id,
        label: (l.clientes as { nombre?: string; empresa?: string } | null)?.empresa
          || (l.clientes as { nombre?: string } | null)?.nombre
          || l.descripcion
          || 'Lead sin nombre',
      }))}
    />
  )
}
