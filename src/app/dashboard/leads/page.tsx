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

  let leadsQuery = supabase
    .from('leads')
    .select(
      'id, cliente_id, vendedor_id, descripcion, monto_potencial, cuatrimestre, estado, notas, proxima_gestion, nota_gestion, created_at, updated_at, clientes(nombre, empresa), agencias(nombre), perfiles!leads_vendedor_id_fkey(nombre)'
    )
    .order('created_at', { ascending: false })

  if (!isGerente) {
    leadsQuery = leadsQuery.eq('vendedor_id', userId) as typeof leadsQuery
  }

  const year = new Date().getFullYear()

  const [{ data: leads }, { data: clientes }, vendedoresRes, clienteObjetivosRes] = await Promise.all([
    leadsQuery,
    supabase.from('clientes').select('id, nombre, empresa').eq('activo', true).order('nombre'),
    isGerente
      ? supabase.from('perfiles').select('id, nombre').in('rol', ['vendedor', 'asistente_ventas']).eq('activo', true).order('nombre')
      : Promise.resolve({ data: [] }),
    !isGerente
      ? supabase
          .from('cliente_objetivos')
          .select('cliente_id, ponderacion_pct, objetivo_c1, objetivo_c2, objetivo_c3, clientes(nombre, empresa)')
          .eq('vendedor_id', userId)
          .eq('year', year)
      : Promise.resolve({ data: [] }),
  ])

  return (
    <LeadsClient
      leads={leads ?? []}
      isGerente={isGerente}
      userId={userId}
      userRol={rol}
      clientes={clientes ?? []}
      vendedores={(vendedoresRes as any).data ?? []}
      clienteObjetivos={(clienteObjetivosRes as any).data ?? []}
    />
  )
}
