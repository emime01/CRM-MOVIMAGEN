import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import NuevaOrdenForm from './NuevaOrdenForm'

export default async function NuevaOrdenPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const supabase = createServerClient()

  const [soportesRes, clientesRes, agenciasRes, vendedoresRes, configRes] = await Promise.all([
    supabase
      .from('soportes')
      .select('id, nombre, categoria, tipo, precio_base, precio_semanal, costo_produccion')
      .eq('activo', true)
      .order('categoria')
      .order('nombre'),

    supabase
      .from('clientes')
      .select('id, nombre, empresa')
      .order('nombre'),

    supabase
      .from('agencias')
      .select('id, nombre')
      .order('nombre'),

    supabase
      .from('perfiles')
      .select('id, nombre')
      .in('rol', ['vendedor', 'asistente_ventas', 'gerente_comercial'])
      .order('nombre'),

    supabase
      .from('config')
      .select('valor')
      .eq('clave', 'formas_pago')
      .maybeSingle(),
  ])

  let formasPago: string[] = []
  if (configRes.data?.valor) {
    try {
      formasPago = JSON.parse(configRes.data.valor)
    } catch {
      formasPago = []
    }
  }

  return (
    <NuevaOrdenForm
      soportes={soportesRes.data ?? []}
      clientes={clientesRes.data ?? []}
      agencias={agenciasRes.data ?? []}
      vendedores={vendedoresRes.data ?? []}
      formasPago={formasPago}
      currentUserId={session.user.id}
    />
  )
}
