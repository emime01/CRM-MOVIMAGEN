import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import LeadsClient from './LeadsClient'

export const dynamic = 'force-dynamic'

export default async function LeadsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const supabase = createServerClient()
  const rol = session.user.rol
  const userId = session.user.id

  const isGerente = rol === 'gerente_comercial'

  let query = supabase
    .from('leads')
    .select(
      'id, descripcion, monto_potencial, cuatrimestre, estado, notas, created_at, clientes(nombre, empresa), agencias(nombre), perfiles!leads_vendedor_id_fkey(nombre)'
    )
    .order('created_at', { ascending: false })

  if (!isGerente) {
    query = query.eq('vendedor_id', userId) as typeof query
  }

  const { data: leads } = await query

  return (
    <LeadsClient
      leads={leads ?? []}
      isGerente={isGerente}
    />
  )
}
