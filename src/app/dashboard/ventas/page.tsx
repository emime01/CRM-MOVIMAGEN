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
  // Las ventas las ven todos, a propósito: es información que el equipo
  // necesita (qué se vendió, a quién, en qué soportes). Lo que es de cada
  // vendedor son sus leads y cotizaciones; y las cuotas y cobros de una venta
  // los ve sólo su vendedor (ver puedeVerFacturas).
  const { data: ordenes } = await query

  return <VentasClient ordenes={ordenes ?? []} userRol={session.user.rol} userId={session.user.id} />
}
