import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import BusesClient from './BusesClient'

export const dynamic = 'force-dynamic'

export default async function BusesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const supabase = createServerClient()

  const [busesRes, soportesRes, clientesRes, reservasRes, activasRes] = await Promise.all([
    supabase
      .from('buses')
      .select('*, clientes!buses_cliente_actual_id_fkey(nombre, empresa)')
      .eq('activo', true)
      .order('numero'),
    supabase
      .from('soportes')
      .select('id, nombre, tipo, lado_bus, bus_id')
      .eq('activo', true)
      .order('nombre'),
    supabase
      .from('clientes')
      .select('id, nombre, empresa')
      .eq('activo', true)
      .order('nombre'),
    supabase
      .from('reservas')
      .select('id, fecha_desde, fecha_hasta, estado, clientes(nombre, empresa), reserva_items(id, soporte_id, bus_id, soportes(nombre, tipo, bus_id, lado_bus))')
      .eq('estado', 'aprobada')
      .order('fecha_desde'),
    supabase
      .from('reservas')
      .select('estado, fecha_desde, fecha_hasta, clientes(nombre, empresa), reserva_items(soporte_id)')
      .in('estado', ['aprobada', 'confirmada']),
  ])

  const soportes = soportesRes.data ?? []
  const buses = (busesRes.data ?? []).map((b: Record<string, unknown> & { id: string }) => ({
    ...b,
    soportes: soportes.filter(s => s.bus_id === b.id),
  }))
  const soportesSinAsignar = soportes.filter(s => !s.bus_id)

  const reservasData = (reservasRes.data ?? []) as unknown as Array<{
    reserva_items: { soportes: { tipo: string | null; bus_id: string | null } | null }[]
  }>
  const reservas = reservasData.filter(r =>
    r.reserva_items.some(it => it.soportes?.tipo === 'bus' || it.soportes?.bus_id)
  )

  // Build soporte_id → cliente+fechas for active (aprobada/confirmada) reservations
  const soporteClienteMap: Record<string, { nombre: string; empresa: string | null; fecha_desde: string; fecha_hasta: string }> = {}
  for (const r of (activasRes.data ?? []) as unknown as Array<{
    fecha_desde: string
    fecha_hasta: string
    clientes: { nombre: string; empresa: string | null } | { nombre: string; empresa: string | null }[] | null
    reserva_items: { soporte_id: string }[]
  }>) {
    const cli = Array.isArray(r.clientes) ? r.clientes[0] : r.clientes
    if (!cli) continue
    for (const it of r.reserva_items) {
      if (it.soporte_id && !soporteClienteMap[it.soporte_id]) {
        soporteClienteMap[it.soporte_id] = { nombre: cli.nombre, empresa: cli.empresa, fecha_desde: r.fecha_desde, fecha_hasta: r.fecha_hasta }
      }
    }
  }

  return (
    <BusesClient
      initialBuses={buses as unknown as Parameters<typeof BusesClient>[0]['initialBuses']}
      initialSoportesSinAsignar={soportesSinAsignar}
      clientes={clientesRes.data ?? []}
      initialReservas={reservas as unknown as Parameters<typeof BusesClient>[0]['initialReservas']}
      soporteClienteMap={soporteClienteMap}
      userRol={session.user.rol}
    />
  )
}
