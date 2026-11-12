import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { ESTADOS_BLOQUEO_VIVO, ESTADOS_VENTA_VIVA } from '@/lib/ventas/asignar-buses'
import { espaciosQueOcupa } from '@/lib/disponibilidad/espacios'
import { efAlta, efBaja, intervalosVentas, intervalosBloqueos } from '@/lib/disponibilidad/ocupacion'

export interface SoporteOcupante {
  tipo: 'venta' | 'bloqueo'
  /** Número de OIC (solo ventas). */
  numero: number | null
  cliente: string | null
}

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
  /** Quién ocupa el soporte en el rango (uso interno): venta (con OIC) o bloqueo. */
  ocupantes: SoporteOcupante[]
  /** Cuánto se vendió por encima de la capacidad. 0 si está todo bien. */
  sobreventa: number
  estado: 'libre' | 'parcial' | 'ocupado' | 'sobrevendido'
}

export interface DiaStats {
  fecha: string
  libres: number
  total: number
}

function buildOcupacion(
  soportes: any[],
  reservadoMap: Map<string, number>,
  clientesMap: Map<string, string[]>,
  ocupantesMap: Map<string, SoporteOcupante[]>,
): SoporteOcupacion[] {
  return soportes.map((s: any) => {
    const cap = s.cap ?? 1
    const reservado = reservadoMap.get(s.id) ?? 0
    const pct = Math.min(100, Math.round((reservado / cap) * 100))
    const disponible = Math.max(0, cap - reservado)
    // Vender más de lo que entra quedaba invisible: `disponible` se recortaba
    // en 0 y `pct` en 100, así que dos ventas sobre un espacio de uno se veían
    // idénticas a uno bien vendido. Se expone el excedente aparte.
    const sobreventa = Math.max(0, reservado - cap)
    const estado: SoporteOcupacion['estado'] =
      sobreventa > 0 ? 'sobrevendido' : reservado >= cap ? 'ocupado' : reservado > 0 ? 'parcial' : 'libre'
    return {
      id: s.id, nombre: s.nombre, tipo: s.tipo,
      tipo_cotizador: s.tipo_cotizador ?? null,
      seccion: s.seccion, ubicacion: s.ubicacion, categoria: s.categoria,
      cap, reservado, pct, disponible, sobreventa,
      clientes: clientesMap.get(s.id) ?? [],
      ocupantes: ocupantesMap.get(s.id) ?? [],
      estado,
    }
  })
}

function addCliente(map: Map<string, string[]>, soporteId: string, nombre: string) {
  const existing = map.get(soporteId) ?? []
  if (!existing.includes(nombre)) map.set(soporteId, [...existing, nombre])
}

function addOcupante(map: Map<string, SoporteOcupante[]>, soporteId: string, o: SoporteOcupante) {
  const existing = map.get(soporteId) ?? []
  if (!existing.some(x => x.tipo === o.tipo && x.numero === o.numero && x.cliente === o.cliente)) map.set(soporteId, [...existing, o])
}

const ORDEN_ITEMS_SELECT = 'soporte_id, cantidad, salidas, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const mes = searchParams.get('mes')
  const fecha = searchParams.get('fecha') ?? new Date().toISOString().split('T')[0]
  // Rango (?desde=&hasta=): lo que se pisa con el período. Lo usa el
  // cotizador para avisar si un soporte ya está vendido en esas fechas.
  const desdeQ = searchParams.get('desde') ?? fecha
  const hastaQ = searchParams.get('hasta') ?? desdeQ

  const supabase = createServerClient()

  const { data: soportes } = await supabase
    .from('soportes')
    .select('id, nombre, tipo, tipo_cotizador, seccion, ubicacion, categoria, cap')
    .eq('activo', true)
    .order('categoria')
    .order('nombre')

  // Para contar espacios: en pantallas y circuitos, por lugar en la tanda.
  const tipoDe = new Map<string, string | null>((soportes ?? []).map((s: any) => [s.id, s.tipo_cotizador ?? null]))

  if (mes) {
    const [y, m] = mes.split('-').map(Number)
    const daysInMonth = new Date(y, m, 0).getDate()
    const firstDay = `${mes}-01`
    const lastDay = `${mes}-${String(daysInMonth).padStart(2, '0')}`

    const [{ data: reservas, error: errBloqMes }, { data: ordenes, error: errVentasMes }] = await Promise.all([
      supabase
        .from('reservas')
        .select('fecha_desde, fecha_hasta, reserva_items(soporte_id, cantidad, fecha_alta_real, fecha_baja_real)')
        .in('estado', ESTADOS_BLOQUEO_VIVO as unknown as string[])
        .is('orden_id', null),
      supabase
        .from('ordenes_venta')
        .select(`fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real, orden_items(${ORDEN_ITEMS_SELECT})`)
        .in('estado', ESTADOS_VENTA_VIVA as unknown as string[]),
    ])
    if (errBloqMes || errVentasMes) {
      return NextResponse.json({ error: (errBloqMes ?? errVentasMes)!.message }, { status: 500 })
    }

    const capMap = new Map<string, number>((soportes ?? []).map((s: any) => [s.id, s.cap ?? 1]))
    const total = (soportes ?? []).length

    // Misma regla que el resumen de Gerencia: ver lib/disponibilidad/ocupacion.
    const intervalos = [...intervalosBloqueos(reservas, tipoDe), ...intervalosVentas(ordenes, tipoDe)]

    const dias: DiaStats[] = []
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${mes}-${String(d).padStart(2, '0')}`
      const resMap = new Map<string, number>()
      for (const iv of intervalos) {
        if (iv.desde > dateStr || iv.hasta < dateStr) continue
        resMap.set(iv.soporte_id, (resMap.get(iv.soporte_id) ?? 0) + iv.espacios)
      }

      let libres = 0
      capMap.forEach((cap, id) => { if ((resMap.get(id) ?? 0) < cap) libres++ })
      dias.push({ fecha: dateStr, libres, total })
    }

    return NextResponse.json({ dias })
  }

  // Single day mode
  const [{ data: reservas, error: errBloq }, { data: ordenes, error: errVentas }] = await Promise.all([
    supabase
      .from('reservas')
      .select('fecha_desde, fecha_hasta, clientes(nombre, empresa), reserva_items(soporte_id, cantidad, fecha_alta_real, fecha_baja_real)')
      .in('estado', ESTADOS_BLOQUEO_VIVO as unknown as string[])
        .is('orden_id', null),
    supabase
      .from('ordenes_venta')
      .select(`numero, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real, clientes(nombre, empresa), orden_items(${ORDEN_ITEMS_SELECT})`)
      .in('estado', ESTADOS_VENTA_VIVA as unknown as string[]),
  ])

  // Si cualquiera de las dos consultas falla hay que cortar acá. Siguiendo, el
  // mapa de ocupación queda vacío y TODOS los soportes aparecen libres: la
  // pantalla no se ve rota, se ve vendible, y alguien vende algo ya ocupado.
  if (errBloq || errVentas) {
    return NextResponse.json({ error: (errBloq ?? errVentas)!.message }, { status: 500 })
  }

  const reservadoMap = new Map<string, number>()
  const clientesMap = new Map<string, string[]>()
  const ocupantesMap = new Map<string, SoporteOcupante[]>()

  reservas?.forEach((r: any) => {
    const cli = Array.isArray(r.clientes) ? r.clientes[0] : r.clientes
    const nombre = cli?.empresa ?? cli?.nombre ?? null
    ;(r.reserva_items ?? []).forEach((item: any) => {
      if (!item.soporte_id) return
      // Fecha efectiva por soporte: real (si se instaló) ?? ventana de la reserva
      const desde = item.fecha_alta_real ?? r.fecha_desde
      const hasta = item.fecha_baja_real ?? r.fecha_hasta
      if (!desde || !hasta || desde > hastaQ || hasta < desdeQ) return
      reservadoMap.set(item.soporte_id, (reservadoMap.get(item.soporte_id) ?? 0) + espaciosQueOcupa(tipoDe.get(item.soporte_id), item))
      if (nombre) addCliente(clientesMap, item.soporte_id, nombre)
      addOcupante(ocupantesMap, item.soporte_id, { tipo: 'bloqueo', numero: null, cliente: nombre })
    })
  })

  ordenes?.forEach((ord: any) => {
    const cli = Array.isArray(ord.clientes) ? ord.clientes[0] : ord.clientes
    const nombre = cli?.empresa ?? cli?.nombre ?? null
    ;(ord.orden_items ?? []).forEach((item: any) => {
      if (!item.soporte_id) return
      const alta = efAlta(item, ord)
      const baja = efBaja(item, ord)
      if (!alta || !baja || alta > hastaQ || baja < desdeQ) return
      reservadoMap.set(item.soporte_id, (reservadoMap.get(item.soporte_id) ?? 0) + espaciosQueOcupa(tipoDe.get(item.soporte_id), item))
      if (nombre) addCliente(clientesMap, item.soporte_id, nombre)
      addOcupante(ocupantesMap, item.soporte_id, { tipo: 'venta', numero: ord.numero ?? null, cliente: nombre })
    })
  })

  const result = buildOcupacion(soportes ?? [], reservadoMap, clientesMap, ocupantesMap)
  return NextResponse.json({ soportes: result, fecha })
}
