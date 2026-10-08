import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect, notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import CotizadorClient from '../../../cotizaciones/[id]/CotizadorClient'
import { es } from '@/lib/auth/roles'

/**
 * Cotizador dentro del lead: /dashboard/leads/[id]/cotizar
 *
 * Es la única puerta de entrada para crear una cotización. Antes se podía
 * cotizar "suelto" desde la sección de cotizaciones, y el lead quedaba como un
 * paso opcional que nadie completaba. Naciendo desde el lead, el cliente y la
 * agencia vienen dados y toda venta queda con su origen.
 */
export default async function CotizarDesdeLeadPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const supabase = createServerClient()
  const { data: lead } = await supabase
    .from('leads')
    .select(`
      id, descripcion, vendedor_id, cliente_id, agencia_id,
      clientes(id, nombre, empresa),
      agencias(id, nombre, porcentaje_comision, porcentaje_comision_produccion, condicion_pago_dias)
    `)
    .eq('id', params.id)
    .maybeSingle()

  if (!lead) notFound()

  // Un vendedor sólo cotiza sobre sus propios leads.
  if (session.user.rol === 'vendedor' && lead.vendedor_id !== session.user.id) {
    redirect('/dashboard/leads')
  }

  // El lead necesita un cliente: es lo que la cotización hereda.
  if (!lead.cliente_id) {
    redirect(`/dashboard/leads/${params.id}?falta=cliente`)
  }

  const cliente: any = Array.isArray(lead.clientes) ? lead.clientes[0] : lead.clientes
  const agencia: any = Array.isArray(lead.agencias) ? lead.agencias[0] : lead.agencias

  return (
    <CotizadorClient
      propuestaId={null}
      rol={session.user.rol}
      userId={session.user.id}
      lead={{
        id: lead.id,
        descripcion: lead.descripcion ?? null,
        clienteId: lead.cliente_id,
        clienteNombre: cliente?.empresa ?? cliente?.nombre ?? 'Cliente',
        agenciaNombre: agencia?.nombre ?? null,
        agenciaComisionPct: agencia?.porcentaje_comision ?? null,
        agenciaComisionProdPct: agencia?.porcentaje_comision_produccion ?? null,
        agenciaCondicionPagoDias: agencia?.condicion_pago_dias ?? null,
      }}
    />
  )
}
