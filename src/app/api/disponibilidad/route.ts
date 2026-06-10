import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export interface SoporteOcupacion {
  id: string
  nombre: string
  tipo: string | null
  tipo_cotizador: string | null
  seccion: string | null
  ubicacion: string | null
  categoria: string | null
  cap: number
  reservado: number
  pct: number
  disponible: number
  clientes: string[]
  estado: 'libre' | 'parcial' | 'ocupado'
}

export interface DiaStats {
  fecha: string
  libres: number
  total: number
}

// Effective dates: prefer item.real → item.prevista → orden.real → orden.prevista
function efAlta(item: any, ord: any): string | null {
  return item.fecha_alta_real ?? item.fecha_alta_prevista ?? ord.fecha_alta_real ?? ord.fecha_alta_prevista ?? null
}
function efBaja(item: any, ord: any): string | null {
  return item.fecha_baja_real ?? item.fecha_baja_prevista ?? ord.fecha_baja_real ?? ord.fecha_baja_prevista ?? null
}

function buildOcupacion(
  soportes: any[],
  reservadoMap: Map<string, number>,
  clientesMap: Map<string, string[]>,
): SoporteOcupacion[] {
  return soportes.map((s: any) => {
    const cap = s.cap ?? 1
    const reservado = reservadoMap.get(s.id) ?? 0
    const pct = Math.min(100, Math.round((reservado / cap) * 100))
    const disponible = Math.max(0, cap - reservado)
    const estado: SoporteOcupacion['estado'] =
      reservado >= cap ? 'ocupado' : reservado > 0 ? 'parcial' : 'libre'
    return {
      id: s.id, nombre: s.nombre, tipo: s.tipo,
      tipo_cotizador: s.tipo_cotizador ?? null,
      seccion: s.seccion, ubicacion: s.ubicacion, categoria: s.categoria,
      cap, reservado, pct, disponible,
      clientes: clientesMap.get(s.id) ?? [],
      estado,
    }
  })
}

function addCliente(map: Map<string, string[]>, soporteId: string, nombre: string) {
  const existing = map.get(soporteId) ?? []
  if (!existing.includes(nombre)) map.set(soporteId, [...existing, nombre])
}

const ORDEN_ITEMS_SELECT = 'soporte_id, cantidad, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes')
  const fecha = searchParams.get('fecha') ?? new Date().toISOString().split('T')[0]

  const supabase = createServerClient()

  const { data: soportes } = await supabase
    .from('soportes')
    .select('id, nombre, tipo, tipo_cotizador, seccion, ubicacion, categoria, cap')
    .eq('activo', true)
    .order('categoria')
    .order('nombre')

  if (mes) {
    const [y, m] = mes.split('-').map(Number)
    const daysInMonth = new Date(y, m, 0).getDate()
    const firstDay = `${mes}-01`
    const lastDay = `${mes}-${String(daysInMonth).padStart(2, '0')}`

    const [{ data: reservas }, { data: ordenes }] = await Promise.all([
      supabase
        .from('reservas')
        .select('fecha_desde, fecha_hasta, reserva_items(soporte_id, cantidad)')
        .in('estado', ['pendiente', 'aprobada', 'confirmada'])
        .lte('fecha_desde', lastDay)
        .gte('fecha_hasta', firstDay),
      supabase
        .from('ordenes_venta')
        .select(`fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real, orden_items(${ORDEN_ITEMS_SELECT})`)
        .in('estado', ['aprobada', 'en_oic', 'facturada', 'cobrada']),
    ])

    const capMap = new Map<string, number>((soportes ?? []).map((s: any) => [s.id, s.cap ?? 1]))
    const total = (soportes ?? []).length

    const dias: DiaStats[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${mes}-${String(d).padStart(2, '0')}`
      const resMap = new Map<string, number>()

      reservas?.forEach((r: any) => {
        if (r.fecha_desde > dateStr || r.fecha_hasta < dateStr) return
        ;(r.reserva_items ?? []).forEach((item: any) => {
          if (item.soporte_id)
            resMap.set(item.soporte_id, (resMap.get(item.soporte_id) ?? 0) + (item.cantidad ?? 1))
        })
      })

      ordenes?.forEach((ord: any) => {
        ;(ord.orden_items ?? []).forEach((item: any) => {
          if (!item.soporte_id) return
          const alta = efAlta(item, ord)
          const baja = efBaja(item, ord)
          if (!alta || !baja || alta > dateStr || baja < dateStr) return
          resMap.set(item.soporte_id, (resMap.get(item.soporte_id) ?? 0) + (item.cantidad ?? 1))
        })
      })

      let libres = 0
      capMap.forEach((cap, id) => { if ((resMap.get(id) ?? 0) < cap) libres++ })
      dias.push({ fecha: dateStr, libres, total })
    }

    return NextResponse.json({ dias })
  }

  // Single day mode
  const [{ data: reservas }, { data: ordenes }] = await Promise.all([
    supabase
      .from('reservas')
      .select('clientes(nombre, empresa), reserva_items(soporte_id, cantidad)')
      .in('estado', ['pendiente', 'aprobada', 'confirmada'])
      .lte('fecha_desde', fecha)
      .gte('fecha_hasta', fecha),
    supabase
      .from('ordenes_venta')
      .select(`fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real, clientes(nombre, empresa), orden_items(${ORDEN_ITEMS_SELECT})`)
      .in('estado', ['aprobada', 'en_oic', 'facturada', 'cobrada']),
  ])

  const reservadoMap = new Map<string, number>()
  const clientesMap = new Map<string, string[]>()

  reservas?.forEach((r: any) => {
    const cli = Array.isArray(r.clientes) ? r.clientes[0] : r.clientes
    const nombre = cli?.empresa ?? cli?.nombre ?? null
    ;(r.reserva_items ?? []).forEach((item: any) => {
      if (!item.soporte_id) return
      reservadoMap.set(item.soporte_id, (reservadoMap.get(item.soporte_id) ?? 0) + (item.cantidad ?? 1))
      if (nombre) addCliente(clientesMap, item.soporte_id, nombre)
    })
  })

  ordenes?.forEach((ord: any) => {
    const cli = Array.isArray(ord.clientes) ? ord.clientes[0] : ord.clientes
    const nombre = cli?.empresa ?? cli?.nombre ?? null
    ;(ord.orden_items ?? []).forEach((item: any) => {
      if (!item.soporte_id) return
      const alta = efAlta(item, ord)
      const baja = efBaja(item, ord)
      if (!alta || !baja || alta > fecha || baja < fecha) return
      reservadoMap.set(item.soporte_id, (reservadoMap.get(item.soporte_id) ?? 0) + (item.cantidad ?? 1))
      if (nombre) addCliente(clientesMap, item.soporte_id, nombre)
    })
  })

  const result = buildOcupacion(soportes ?? [], reservadoMap, clientesMap)
  return NextResponse.json({ soportes: result, fecha })
}
