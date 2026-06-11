import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

/**
 * GET /api/disponibilidad/soporte/[id]?fecha=YYYY-MM-DD
 *
 * Devuelve quién ocupa este soporte en la fecha indicada:
 *   - campañas activas (orden_items aprobadas/en_oic/facturadas/cobradas)
 *   - reservas pendientes/aprobadas/confirmadas
 *
 * Lo usa el modal "Detalle de campaña" en /dashboard/disponibilidad.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const fecha = searchParams.get('fecha') ?? new Date().toISOString().split('T')[0]

  const supabase = createServerClient()

  const [{ data: soporte }, { data: items }, { data: reservas }] = await Promise.all([
    supabase.from('soportes').select('id, nombre, categoria, tipo, seccion, ubicacion, cap').eq('id', params.id).maybeSingle(),
    supabase
      .from('orden_items')
      .select(`
        id, cantidad, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real,
        ordenes_venta(id, numero, estado, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real,
          clientes(nombre, empresa), perfiles!ordenes_venta_vendedor_id_fkey(nombre)
        )
      `)
      .eq('soporte_id', params.id),
    supabase
      .from('reserva_items')
      .select(`
        id, cantidad,
        reservas(id, estado, fecha_desde, fecha_hasta, clientes(nombre, empresa), perfiles!reservas_vendedor_id_fkey(nombre))
      `)
      .eq('soporte_id', params.id),
  ])

  if (!soporte) return NextResponse.json({ error: 'Soporte no encontrado' }, { status: 404 })

  const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : v ?? null)

  const campañas = (items ?? [])
    .map((it: any) => {
      const ord = first<any>(it.ordenes_venta)
      if (!ord || !['aprobada', 'en_oic', 'facturada', 'cobrada'].includes(ord.estado)) return null
      const alta = it.fecha_alta_real ?? it.fecha_alta_prevista ?? ord.fecha_alta_real ?? ord.fecha_alta_prevista
      const baja = it.fecha_baja_real ?? it.fecha_baja_prevista ?? ord.fecha_baja_real ?? ord.fecha_baja_prevista
      if (!alta || !baja || alta > fecha || baja < fecha) return null
      const cli = first<any>(ord.clientes)
      const v = first<any>(ord.perfiles)
      return {
        orden_item_id:        it.id,
        orden_id:             ord.id,
        orden_numero:         ord.numero,
        orden_estado:         ord.estado,
        cliente:              cli?.empresa ?? cli?.nombre ?? null,
        vendedor:             v?.nombre ?? null,
        cantidad:             it.cantidad ?? 1,
        fecha_alta_prevista:  it.fecha_alta_prevista ?? ord.fecha_alta_prevista ?? null,
        fecha_alta_real:      it.fecha_alta_real ?? ord.fecha_alta_real ?? null,
        fecha_baja_prevista:  it.fecha_baja_prevista ?? ord.fecha_baja_prevista ?? null,
        fecha_baja_real:      it.fecha_baja_real ?? ord.fecha_baja_real ?? null,
      }
    })
    .filter(Boolean)

  const reservasActivas = (reservas ?? [])
    .map((ri: any) => {
      const r = first<any>(ri.reservas)
      if (!r || !['pendiente', 'aprobada', 'confirmada'].includes(r.estado)) return null
      if (r.fecha_desde > fecha || r.fecha_hasta < fecha) return null
      const cli = first<any>(r.clientes)
      const v = first<any>(r.perfiles)
      return {
        reserva_id:  r.id,
        estado:      r.estado,
        cliente:     cli?.empresa ?? cli?.nombre ?? null,
        vendedor:    v?.nombre ?? null,
        cantidad:    ri.cantidad ?? 1,
        fecha_desde: r.fecha_desde,
        fecha_hasta: r.fecha_hasta,
      }
    })
    .filter(Boolean)

  return NextResponse.json({ soporte, fecha, campañas, reservas: reservasActivas })
}
