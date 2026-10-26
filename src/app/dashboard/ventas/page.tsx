import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import VentasClient from './VentasClient'

export const dynamic = 'force-dynamic'

export default async function VentasPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const supabase = createServerClient()

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
  // El vendedor ve sus ventas y las que comparte, como pasa con sus leads y
  // cotizaciones. Antes veía las de todos los vendedores.
  if (session.user.rol === 'vendedor') {
    query = query.or(`vendedor_id.eq.${session.user.id},vendedor_compartido_id.eq.${session.user.id}`)
  }
  const { data: ordenes } = await query

  return <VentasClient ordenes={ordenes ?? []} userRol={session.user.rol} userId={session.user.id} />
}
