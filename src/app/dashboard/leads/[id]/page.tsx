import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import LeadDetalleClient from './LeadDetalleClient'

export const dynamic = 'force-dynamic'

export default async function LeadDetallePage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion'].includes(session.user.rol)) {
    redirect('/dashboard')
  }

  const supabase = createServerClient()

  const [{ data: lead }, { data: propuestas }] = await Promise.all([
    supabase
      .from('leads')
      .select(`
        id, descripcion, monto_potencial, cuatrimestre, estado, notas, motivo_perdida,
        proxima_gestion, nota_gestion, propuesta_ganadora_id, vendedor_id,
        created_at, updated_at,
        clientes(id, nombre, empresa),
        agencias(id, nombre),
        perfiles(id, nombre)
      `)
      .eq('id', params.id)
      .maybeSingle(),
    supabase
      .from('propuestas')
      .select('id, numero, nombre, estado, moneda, monto_neto, monto_total, fecha_inicio, fecha_fin, created_at')
      .eq('lead_id', params.id)
      .order('created_at', { ascending: false }),
  ])

  if (!lead) notFound()

  // Vendedor solo puede ver sus propios leads
  if (session.user.rol === 'vendedor' && lead.vendedor_id !== session.user.id) {
    redirect('/dashboard/leads')
  }

  return (
    <LeadDetalleClient
      lead={lead as any}
      propuestas={(propuestas ?? []) as any}
      userRol={session.user.rol}
      userId={session.user.id}
    />
  )
}
