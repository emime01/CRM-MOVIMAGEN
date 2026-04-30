import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import DisponibilidadClient from './DisponibilidadClient'
import type { SoporteConEstado } from '@/app/api/disponibilidad/route'

export const dynamic = 'force-dynamic'

export default async function DisponibilidadPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const supabase = createServerClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: soportes }, { data: ordenes }, { data: reservas }, { data: clientes }] = await Promise.all([
    supabase.from('soportes').select('id, nombre, tipo, seccion, ubicacion').eq('activo', true).order('seccion').order('nombre'),
    supabase
      .from('ordenes_venta')
      .select('id, fecha_alta_prevista, fecha_baja_prevista, fecha_alta_real, fecha_baja_real, clientes(nombre, empresa), orden_items(soporte_id)')
      .in('estado', ['aprobada', 'en_oic', 'facturada', 'cobrada'])
      .not('fecha_alta_prevista', 'is', null),
    supabase
      .from('reservas')
      .select('id, soporte_id, fecha_desde, fecha_hasta, estado, clientes(nombre, empresa)')
      .in('estado', ['pendiente', 'aprobada', 'confirmada'])
      .lte('fecha_desde', today)
      .gte('fecha_hasta', today),
    supabase.from('clientes').select('id, nombre, empresa').eq('activo', true).order('nombre'),
  ])

  const ocupadoMap = new Map<string, { cliente: string | null; fechaDesde: string; fechaHasta: string; fechaDesdePrevista: string | null; fechaHastaPrevista: string | null }>()
  const reservadoMap = new Map<string, { cliente: string | null; fechaDesde: string; fechaHasta: string }>()

  ordenes?.forEach((ord: any) => {
    const alta = (ord.fecha_alta_real ?? ord.fecha_alta_prevista) as string | null
    const baja = (ord.fecha_baja_real ?? ord.fecha_baja_prevista) as string | null
    if (!alta || !baja) return
    if (alta > today || baja < today) return

    const cli = Array.isArray(ord.clientes) ? ord.clientes[0] : ord.clientes
    const clienteNombre = cli?.empresa ?? cli?.nombre ?? null
    ;(ord.orden_items ?? []).forEach((item: any) => {
      if (!item.soporte_id || ocupadoMap.has(item.soporte_id)) return
      ocupadoMap.set(item.soporte_id, {
        cliente: clienteNombre,
        fechaDesde: alta,
        fechaHasta: baja,
        fechaDesdePrevista: ord.fecha_alta_real ? ord.fecha_alta_prevista : null,
        fechaHastaPrevista: ord.fecha_baja_real ? ord.fecha_baja_prevista : null,
      })
    })
  })

  reservas?.forEach((r: any) => {
    if (!r.soporte_id || ocupadoMap.has(r.soporte_id) || reservadoMap.has(r.soporte_id)) return
    const cli = Array.isArray(r.clientes) ? r.clientes[0] : r.clientes
    reservadoMap.set(r.soporte_id, {
      cliente: cli?.empresa ?? cli?.nombre ?? null,
      fechaDesde: r.fecha_desde,
      fechaHasta: r.fecha_hasta,
    })
  })

  const initialSoportes: SoporteConEstado[] = (soportes ?? []).map((s: any) => {
    if (ocupadoMap.has(s.id)) {
      const info = ocupadoMap.get(s.id)!
      return { id: s.id, nombre: s.nombre, tipo: s.tipo, seccion: s.seccion, ubicacion: s.ubicacion, estado: 'ocupado', cliente: info.cliente, fechaDesde: info.fechaDesde, fechaHasta: info.fechaHasta, fechaDesdePrevista: info.fechaDesdePrevista, fechaHastaPrevista: info.fechaHastaPrevista }
    }
    if (reservadoMap.has(s.id)) {
      const info = reservadoMap.get(s.id)!
      return { id: s.id, nombre: s.nombre, tipo: s.tipo, seccion: s.seccion, ubicacion: s.ubicacion, estado: 'reservado', cliente: info.cliente, fechaDesde: info.fechaDesde, fechaHasta: info.fechaHasta, fechaDesdePrevista: null, fechaHastaPrevista: null }
    }
    return { id: s.id, nombre: s.nombre, tipo: s.tipo, seccion: s.seccion, ubicacion: s.ubicacion, estado: 'libre', cliente: null, fechaDesde: null, fechaHasta: null, fechaDesdePrevista: null, fechaHastaPrevista: null }
  })

  return (
    <DisponibilidadClient
      initialSoportes={initialSoportes}
      initialFecha={today}
      clientes={(clientes ?? []).map((c: any) => ({ id: c.id, nombre: c.nombre, empresa: c.empresa ?? null }))}
      userRol={session.user.rol}
      userId={session.user.id}
    />
  )
}
