import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import DisponibilidadClient from './DisponibilidadClient'

export const dynamic = 'force-dynamic'

export default async function DisponibilidadPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const supabase = createServerClient()
  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nombre, empresa')
    .eq('activo', true)
    .order('nombre')

  return (
    <DisponibilidadClient
      userRol={session.user.rol}
      userId={session.user.id}
      clientes={(clientes ?? []).map((c: any) => ({ id: c.id, nombre: c.nombre, empresa: c.empresa ?? null }))}
    />
  )
}
