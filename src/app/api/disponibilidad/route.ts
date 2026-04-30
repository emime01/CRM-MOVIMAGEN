import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export interface SoporteConEstado {
  id: string
  nombre: string
  tipo: string | null
  seccion: string | null
  ubicacion: string | null
  estado: 'libre' | 'reservado' | 'ocupado'
  cliente: string | null
  fechaDesde: string | null
  fechaHasta: string | null
  // shown when real differs from prevista
  fechaDesdePrevista: string | null
  fechaHastaPrevista: string | null
}

// Returns the effective date using real if set, fallback to prevista
function efAlta(ord: { fecha_alta_real: string | null; fecha_alta_prevista: string | null }): string | null {
  return ord.fecha_alta_real ?? ord.fecha_alta_prevista
}
function efBaja(ord: { fecha_baja_real: string | null; fecha_baja_prevista: string | null }): string | null {
  return ord.fecha_baja_real ?? ord.fecha_baja_prevista
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const fecha = searchParams.get('fecha') ?? new Date().toISOString().split('T')[0]

  const supabase = createServerClient()

  const [{ data: soportes }, { data: ordenes }, { data: reservas }] = await Promise.all([
    supabase
      .from('soportes')
      .select('id, nombre, tipo, seccion, ubicacion')
      .eq('activo', true)
      .order('seccion')
      .order('nombre'),
    // Fetch all active-state orders without date filter — apply COALESCE in JS
    supabase
      .from('ordenes_venta')
      .select('id, fecha_alta_prevista, fecha_baja_prevista, fecha_alta_real, fecha_baja_real, clientes(nombre, empresa), orden_items(soporte_id)')
      .in('estado', ['aprobada', 'en_oic', 'facturada', 'cobrada'])
      .not('fecha_alta_prevista', 'is', null),
    supabase
      .from('reservas')
      .select('id, soporte_id, fecha_desde, fecha_hasta, estado, clientes(nombre, empresa)')
      .in('estado', ['pendiente', 'aprobada', 'confirmada'])
      .lte('fecha_desde', fecha)
      .gte('fecha_hasta', fecha),
  ])

  const ocupadoMap = new Map<string, { cliente: string | null; fechaDesde: string; fechaHasta: string; fechaDesdePrevista: string | null; fechaHastaPrevista: string | null }>()
  const reservadoMap = new Map<string, { cliente: string | null; fechaDesde: string; fechaHasta: string }>()

  ordenes?.forEach((ord: any) => {
    const alta = efAlta(ord)
    const baja = efBaja(ord)
    // Order covers the queried date using effective (real) dates
    if (!alta || !baja) return
    if (alta > fecha || baja < fecha) return

    const cli = Array.isArray(ord.clientes) ? ord.clientes[0] : ord.clientes
    const clienteNombre = cli?.empresa ?? cli?.nombre ?? null
    ;(ord.orden_items ?? []).forEach((item: any) => {
      if (!item.soporte_id) return
      if (!ocupadoMap.has(item.soporte_id)) {
        ocupadoMap.set(item.soporte_id, {
          cliente: clienteNombre,
          fechaDesde: alta,
          fechaHasta: baja,
          // Only expose prevista when it differs from real
          fechaDesdePrevista: ord.fecha_alta_real ? ord.fecha_alta_prevista : null,
          fechaHastaPrevista: ord.fecha_baja_real ? ord.fecha_baja_prevista : null,
        })
      }
    })
  })

  reservas?.forEach((r: any) => {
    if (!r.soporte_id || ocupadoMap.has(r.soporte_id)) return
    if (reservadoMap.has(r.soporte_id)) return
    const cli = Array.isArray(r.clientes) ? r.clientes[0] : r.clientes
    reservadoMap.set(r.soporte_id, {
      cliente: cli?.empresa ?? cli?.nombre ?? null,
      fechaDesde: r.fecha_desde,
      fechaHasta: r.fecha_hasta,
    })
  })

  const result: SoporteConEstado[] = (soportes ?? []).map((s: any) => {
    if (ocupadoMap.has(s.id)) {
      const info = ocupadoMap.get(s.id)!
      return {
        id: s.id, nombre: s.nombre, tipo: s.tipo, seccion: s.seccion, ubicacion: s.ubicacion,
        estado: 'ocupado', cliente: info.cliente,
        fechaDesde: info.fechaDesde, fechaHasta: info.fechaHasta,
        fechaDesdePrevista: info.fechaDesdePrevista, fechaHastaPrevista: info.fechaHastaPrevista,
      }
    }
    if (reservadoMap.has(s.id)) {
      const info = reservadoMap.get(s.id)!
      return {
        id: s.id, nombre: s.nombre, tipo: s.tipo, seccion: s.seccion, ubicacion: s.ubicacion,
        estado: 'reservado', cliente: info.cliente,
        fechaDesde: info.fechaDesde, fechaHasta: info.fechaHasta,
        fechaDesdePrevista: null, fechaHastaPrevista: null,
      }
    }
    return {
      id: s.id, nombre: s.nombre, tipo: s.tipo, seccion: s.seccion, ubicacion: s.ubicacion,
      estado: 'libre', cliente: null, fechaDesde: null, fechaHasta: null,
      fechaDesdePrevista: null, fechaHastaPrevista: null,
    }
  })

  return NextResponse.json({ soportes: result, fecha })
}
