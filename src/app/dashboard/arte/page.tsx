import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import ArteClient from './ArteClient'
import { altaEfectiva, bajaEfectiva } from '@/lib/ventas/asignar-buses'
import { ESTADOS_VENTA_VIVA } from '@/lib/ventas/asignar-buses'
import { es } from '@/lib/auth/roles'
import { TIPOS_DIGITALES } from '@/lib/soportes/digital'

export const dynamic = 'force-dynamic'

export default async function ArteDigitalPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!es(session.user.rol, 'arte') && !es(session.user.rol, 'administracion')) redirect('/dashboard')

  const supabase = createServerClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: soportes }, { data: items }] = await Promise.all([
    supabase
      .from('soportes')
      .select('id, nombre, seccion, ubicacion, salidas_por_hora')
      // Pantallas y circuitos: `tipo` está vacío en el catálogo, el que está
      // cargado es tipo_cotizador (ver lib/soportes/digital).
      .in('tipo_cotizador', TIPOS_DIGITALES as unknown as string[])
      .eq('activo', true)
      .order('seccion'),
    supabase
      .from('orden_items')
      .select('soporte_id, salidas, fecha_alta_prevista, fecha_baja_prevista, fecha_alta_real, fecha_baja_real, ordenes_venta(id, numero, marca, estado, fecha_alta_prevista, fecha_baja_prevista, fecha_alta_real, fecha_baja_real, clientes(nombre, empresa))')
      .not('ordenes_venta', 'is', null),
  ])

  // Build campanas map (soporte_id → all active campaigns)
  // Uses effective dates: real if set, fallback to prevista
  const campanasMap: Record<string, {
    empresa: string; marca: string
    desde: string; hasta: string           // effective (real ?? prevista)
    desdePrevista: string | null            // only set when real differs
    hastaPrevista: string | null
    orden_id: string; reserva_id: string | null
    numero: number | null; salidas: number | null
  }[]> = {}

  ;(items ?? []).forEach((item: any) => {
    if (!item.soporte_id) return
    const ord = Array.isArray(item.ordenes_venta) ? item.ordenes_venta[0] : item.ordenes_venta
    if (!ord || !(ESTADOS_VENTA_VIVA as unknown as string[]).includes(ord.estado)) return

    // Las fechas de la línea (una pantalla vendida por 8 semanas dentro de una
    // venta de 13 termina antes); si la línea no tiene, las de la venta.
    const altaEf = altaEfectiva(item, ord)
    const bajaEf = bajaEfectiva(item, ord)
    const altaPrev = item.fecha_alta_prevista ?? ord.fecha_alta_prevista ?? null
    const bajaPrev = item.fecha_baja_prevista ?? ord.fecha_baja_prevista ?? null
    const altaReal = item.fecha_alta_real ?? ord.fecha_alta_real ?? null
    const bajaReal = item.fecha_baja_real ?? ord.fecha_baja_real ?? null

    // Skip if campaign ended (using effective baja)
    if (bajaEf && bajaEf < today) return
    // Skip if campaign hasn't started yet in reality (still show if only prevista missed, campaign is pending)
    // We show it as upcoming if alta_real is in the future but alta_prevista was past

    const cli = Array.isArray(ord.clientes) ? ord.clientes[0] : ord.clientes
    if (!campanasMap[item.soporte_id]) campanasMap[item.soporte_id] = []
    if (!campanasMap[item.soporte_id].some((c: any) => c.orden_id === ord.id)) {
      campanasMap[item.soporte_id].push({
        empresa: cli?.empresa ?? cli?.nombre ?? '—',
        marca: ord.marca ?? '—',
        desde: altaEf ?? '',
        hasta: bajaEf ?? '',
        desdePrevista: altaReal ? altaPrev : null,
        hastaPrevista: bajaReal ? bajaPrev : null,
        orden_id: ord.id,
        numero: ord.numero ?? null,
        salidas: item.salidas ?? null,
        reserva_id: null,
      })
    }
  })

  return (
    <ArteClient
      soportes={soportes ?? []}
      campanasMap={campanasMap}
      supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
      supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
    />
  )
}
