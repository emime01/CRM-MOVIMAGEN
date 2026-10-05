import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import { ESTADOS_VENTA_VIVA, altaEfectiva, bajaEfectiva } from '@/lib/ventas/asignar-buses'
import BusesClient from './BusesClient'

export const dynamic = 'force-dynamic'

/**
 * Planilla de buses.
 *
 * Lee de las órdenes de venta, no de las reservas: el bus se asigna a lo que
 * se vendió. La reserva es un bloqueo opcional y previo a la venta, que puede
 * no existir — antes la planilla colgaba de ella y por eso una venta sin
 * bloqueo no habría aparecido.
 */
export default async function BusesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const supabase = createServerClient()

  const SELECT_VENTA = `
    id, numero, estado, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real,
    clientes(nombre, empresa),
    orden_items(id, soporte_id, bus_id, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real,
      soportes(nombre, tipo, bus_id, lado_bus))
  `

  const [busesRes, soportesRes, clientesRes, ventasRes] = await Promise.all([
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
      .from('ordenes_venta')
      .select(SELECT_VENTA)
      .in('estado', ESTADOS_VENTA_VIVA as unknown as string[])
      .order('fecha_alta_prevista'),
  ])

  const soportes = soportesRes.data ?? []
  const buses = (busesRes.data ?? []).map((b: Record<string, unknown> & { id: string }) => ({
    ...b,
    soportes: soportes.filter(s => s.bus_id === b.id),
  }))
  const soportesSinAsignar = soportes.filter(s => !s.bus_id)

  const ventas = (ventasRes.data ?? []) as unknown as Array<{
    id: string
    numero: number | null
    fecha_alta_prevista: string | null
    fecha_alta_real: string | null
    fecha_baja_prevista: string | null
    fecha_baja_real: string | null
    clientes: { nombre: string; empresa: string | null } | { nombre: string; empresa: string | null }[] | null
    orden_items: Array<{
      id: string
      soporte_id: string | null
      bus_id: string | null
      fecha_alta_prevista: string | null
      fecha_alta_real: string | null
      fecha_baja_prevista: string | null
      fecha_baja_real: string | null
      soportes: { nombre: string; tipo: string | null; bus_id: string | null; lado_bus: string | null } | null
    }>
  }>

  // Ventas que tienen algún soporte de bus: son las que hay que asignar.
  // Se aplanan a la forma que usa la planilla (fechas efectivas ya resueltas).
  const pendientes = ventas
    .filter(v => v.orden_items.some(it => it.soportes?.tipo === 'bus' || it.soportes?.bus_id))
    .map(v => ({
      id: v.id,
      numero: v.numero,
      estado: 'aprobada',
      fecha_desde: altaEfectiva({}, v) ?? '',
      fecha_hasta: bajaEfectiva({}, v) ?? '',
      clientes: Array.isArray(v.clientes) ? (v.clientes[0] ?? null) : v.clientes,
      items: v.orden_items.map(it => ({
        id: it.id,
        soporte_id: it.soporte_id,
        bus_id: it.bus_id,
        soportes: it.soportes,
      })),
    }))

  // soporteClienteMap: la primera campaña por soporte (pestaña Flota).
  // soporteCampanasMap: TODAS las campañas por soporte (Planilla).
  // La fecha efectiva es la real cuando existe: las campañas se atrasan y la
  // planilla tiene que mostrar lo que pasó, no lo que estaba previsto.
  const soporteClienteMap: Record<string, { nombre: string; empresa: string | null; fecha_desde: string; fecha_hasta: string }> = {}
  const soporteCampanasMap: Record<string, Array<{ ordenItemId: string; nombre: string; empresa: string | null; fecha_desde: string; fecha_hasta: string; instalada: boolean }>> = {}

  for (const v of ventas) {
    const cli = Array.isArray(v.clientes) ? v.clientes[0] : v.clientes
    if (!cli) continue
    for (const it of v.orden_items) {
      if (!it.soporte_id) continue
      const desde = altaEfectiva(it, v)
      const hasta = bajaEfectiva(it, v)
      if (!desde || !hasta) continue
      const instalada = !!(it.fecha_alta_real || it.fecha_baja_real)
      if (!soporteClienteMap[it.soporte_id]) {
        soporteClienteMap[it.soporte_id] = { nombre: cli.nombre, empresa: cli.empresa, fecha_desde: desde, fecha_hasta: hasta }
      }
      ;(soporteCampanasMap[it.soporte_id] ??= []).push({
        ordenItemId: it.id, nombre: cli.nombre, empresa: cli.empresa,
        fecha_desde: desde, fecha_hasta: hasta, instalada,
      })
    }
  }

  return (
    <BusesClient
      initialBuses={buses as unknown as Parameters<typeof BusesClient>[0]['initialBuses']}
      initialSoportesSinAsignar={soportesSinAsignar}
      clientes={clientesRes.data ?? []}
      initialVentas={pendientes as unknown as Parameters<typeof BusesClient>[0]['initialVentas']}
      soporteClienteMap={soporteClienteMap}
      soporteCampanasMap={soporteCampanasMap}
      userRol={session.user.rol}
    />
  )
}
