import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import LeadsClient from './LeadsClient'
import { puede } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

export default async function LeadsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!puede(session.user.rol, ['vendedor', 'asistente_ventas', 'gerente_comercial'])) redirect('/dashboard')

  const supabase = createServerClient()
  const rol = session.user.rol
  const userId = session.user.id
  const isGerente = rol === 'gerente_comercial'

  let leadsQuery = supabase
    .from('leads')
    .select(
      'id, cliente_id, agencia_id, vendedor_id, descripcion, campana, monto_potencial, cuatrimestre, estado, notas, proxima_gestion, nota_gestion, created_at, updated_at, clientes(nombre, empresa), agencias(nombre), perfiles!leads_vendedor_id_fkey(nombre)'
    )
    .order('created_at', { ascending: false })

  if (!isGerente) {
    leadsQuery = leadsQuery.eq('vendedor_id', userId) as typeof leadsQuery
  }

  const year = new Date().getFullYear()

  const [{ data: leads }, { data: clientes }, vendedoresRes, clienteObjetivosRes, { data: agencias }] = await Promise.all([
    leadsQuery,
    supabase.from('clientes').select('id, nombre, empresa, agencia_id').eq('activo', true).order('nombre'),
    isGerente
      ? supabase.from('perfiles').select('id, nombre').in('rol', ['vendedor', 'asistente_ventas', 'gerente_comercial']).eq('activo', true).order('nombre')
      : Promise.resolve({ data: [] }),
    !isGerente
      ? supabase
          .from('cliente_objetivos')
          .select('cliente_id, ponderacion_pct, objetivo_c1, objetivo_c2, objetivo_c3, clientes(nombre, empresa)')
          .eq('vendedor_id', userId)
          .eq('year', year)
      : Promise.resolve({ data: [] }),
    // Sólo las activas: las desactivadas ("X / Directo", duplicados) no se ofrecen.
    supabase.from('agencias').select('id, nombre').eq('activo', true).order('nombre'),
  ])

  return (
    <LeadsClient
      leads={leads ?? []}
      isGerente={isGerente}
      userId={userId}
      userRol={rol}
      clientes={clientes ?? []}
      agencias={agencias ?? []}
      vendedores={(vendedoresRes as any).data ?? []}
      clienteObjetivos={(clienteObjetivosRes as any).data ?? []}
    />
  )
}
