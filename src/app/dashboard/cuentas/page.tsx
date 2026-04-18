import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import CuentasClient from './CuentasClient'

export const dynamic = 'force-dynamic'

export default async function CuentasPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion'].includes(session.user.rol)) {
    redirect('/dashboard')
  }

  const supabase = createServerClient()

  const [clientesRes, agenciasRes, contactosRes, vendedoresRes] = await Promise.all([
    supabase
      .from('clientes')
      .select('id, nombre, empresa, email, telefono, rut, activo, tipo_cliente, vendedor_id')
      .order('nombre'),
    supabase
      .from('agencias')
      .select('id, nombre, email, telefono, ejecutivo_cuenta, porcentaje_comision, activo')
      .order('nombre'),
    supabase
      .from('contactos')
      .select('id, nombres, apellidos, mail1, mail2, telefono1, telefono2, cumple_dia, cumple_mes, cuenta_id, tipo_cuenta, activo')
      .eq('activo', true)
      .order('nombres'),
    supabase
      .from('perfiles')
      .select('id, nombre')
      .in('rol', ['vendedor', 'asistente_ventas', 'gerente_comercial'])
      .eq('activo', true)
      .order('nombre'),
  ])

  return (
    <CuentasClient
      initialClientes={clientesRes.data ?? []}
      initialAgencias={agenciasRes.data ?? []}
      initialContactos={contactosRes.data ?? []}
      vendedores={vendedoresRes.data ?? []}
      userRol={session.user.rol}
    />
  )
}
