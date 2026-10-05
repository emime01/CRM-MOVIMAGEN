import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import ClienteHistorialClient from './ClienteHistorialClient'
import { puede } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

export default async function ClienteHistorialPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!puede(session.user.rol, ['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion'])) {
    redirect('/dashboard')
  }

  const supabase = createServerClient()
  const id = params.id

  const [clienteRes, leadsRes, ordenesRes, objetivoRes] = await Promise.all([
    supabase.from('clientes').select('id, nombre, empresa, email, telefono, rut, tipo_cliente, vendedor_id, logo_url, perfiles!clientes_vendedor_id_fkey(nombre)').eq('id', id).single(),
    supabase.from('leads').select('id, estado, descripcion, monto_potencial, cuatrimestre, notas, created_at, perfiles!leads_vendedor_id_fkey(nombre)').eq('cliente_id', id).order('created_at', { ascending: false }),
    supabase.from('ordenes_venta').select('id, estado, monto_total, cuatrimestre_asociado, created_at, perfiles!ordenes_venta_vendedor_id_fkey(nombre)').eq('cliente_id', id).order('created_at', { ascending: false }),
    supabase.from('cliente_objetivos').select('objetivo_c1, objetivo_c2, objetivo_c3, ponderacion_pct, year').eq('cliente_id', id).order('year', { ascending: false }).limit(1).maybeSingle(),
  ])

  if (!clienteRes.data) redirect('/dashboard/cuentas')

  return (
    <ClienteHistorialClient
      cliente={clienteRes.data as any}
      leads={(leadsRes.data ?? []) as any}
      ordenes={(ordenesRes.data ?? []) as any}
      objetivo={objetivoRes.data ?? null}
    />
  )
}
