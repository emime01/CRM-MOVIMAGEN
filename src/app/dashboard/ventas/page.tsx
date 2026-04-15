import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import VentasClient from './VentasClient'

export default async function VentasPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const supabase = createServerClient()
  const rol = session.user.rol
  const vendedorId = session.user.id

  let query = supabase
    .from('ordenes_venta')
    .select(`
      id, numero, monto_total, moneda, estado, created_at,
      clientes(nombre),
      agencias(nombre),
      perfiles!vendedor_id(nombre)
    `)
    .order('created_at', { ascending: false })
    .limit(200)

  // Vendedores only see their own orders
  if (rol === 'vendedor' || rol === 'asistente_ventas') {
    query = query.eq('vendedor_id', vendedorId) as typeof query
  }

  const { data: ordenes } = await query

  return <VentasClient ordenes={ordenes ?? []} userRol={rol} />
}
