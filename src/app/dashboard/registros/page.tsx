import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import { ESTADOS_VENTA_VIVA } from '@/lib/ventas/asignar-buses'
import RegistrosClient from './RegistrosClient'

export const dynamic = 'force-dynamic'

export default async function RegistrosPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const supabase = createServerClient()

  // Los registros documentan lo vendido, así que se listan las ventas vivas.
  // Antes se listaban reservas: una venta sin bloqueo previo no aparecía acá.
  const [ventasRes, soportesRes] = await Promise.all([
    supabase
      .from('ordenes_venta')
      .select(`
        id, numero, estado, campana, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real,
        clientes(id, nombre, empresa),
        orden_items(
          id, soporte_id,
          soportes(id, nombre, tipo, es_digital)
        )
      `)
      .in('estado', ESTADOS_VENTA_VIVA as unknown as string[])
      .order('fecha_alta_prevista', { ascending: false }),
    supabase
      .from('soportes')
      .select('id, nombre, tipo, es_digital')
      .eq('activo', true)
      .order('nombre'),
  ])

  // Se aplana a la forma que usa la pantalla; la fecha real manda cuando existe.
  const ventas: Parameters<typeof RegistrosClient>[0]['ventas'] = (ventasRes.data ?? []).map((v: any) => ({
    id: v.id,
    numero: v.numero,
    estado: v.estado,
    campana: v.campana ?? null,
    fecha_desde: v.fecha_alta_real ?? v.fecha_alta_prevista ?? '',
    fecha_hasta: v.fecha_baja_real ?? v.fecha_baja_prevista ?? '',
    clientes: Array.isArray(v.clientes) ? (v.clientes[0] ?? null) : v.clientes,
    items: v.orden_items ?? [],
  }))

  return (
    <RegistrosClient
      ventas={ventas}
      soportes={soportesRes.data ?? []}
      userId={session.user.id}
      userRol={session.user.rol}
      supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
      supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
    />
  )
}
