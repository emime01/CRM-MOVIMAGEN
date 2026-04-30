import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import ArteClient from './ArteClient'

export const dynamic = 'force-dynamic'

export default async function ArteDigitalPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (session.user.rol !== 'arte' && session.user.rol !== 'administracion') redirect('/dashboard')

  const supabase = createServerClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: soportes }, { data: items }, { data: ordenesRaw }] = await Promise.all([
    supabase
      .from('soportes')
      .select('id, nombre, seccion, ubicacion, salidas_por_hora')
      .eq('tipo', 'led')
      .eq('activo', true)
      .order('seccion'),
    supabase
      .from('orden_items')
      .select('soporte_id, ordenes_venta(id, numero, marca, estado, fecha_alta_prevista, fecha_baja_prevista, fecha_alta_real, fecha_baja_real, clientes(nombre, empresa))')
      .not('ordenes_venta', 'is', null),
    supabase
      .from('ordenes_venta')
      .select(`
        id, numero, marca, estado, fecha_alta_prevista, fecha_baja_prevista, fecha_alta_real, fecha_baja_real,
        clientes(nombre, empresa),
        orden_items(soporte_id, soportes(id, nombre, tipo))
      `)
      .in('estado', ['aprobada', 'en_oic', 'facturada', 'cobrada'])
      .order('fecha_alta_prevista', { ascending: false }),
  ])

  // Build campanas map (soporte_id → all active campaigns)
  // Uses effective dates: real if set, fallback to prevista
  const campanasMap: Record<string, {
    empresa: string; marca: string
    desde: string; hasta: string           // effective (real ?? prevista)
    desdePrevista: string | null            // only set when real differs
    hastaPrevista: string | null
    orden_id: string; reserva_id: string | null
  }[]> = {}

  ;(items ?? []).forEach((item: any) => {
    if (!item.soporte_id) return
    const ord = Array.isArray(item.ordenes_venta) ? item.ordenes_venta[0] : item.ordenes_venta
    if (!ord || !['aprobada', 'en_oic', 'facturada', 'cobrada'].includes(ord.estado)) return

    const altaEf = (ord.fecha_alta_real ?? ord.fecha_alta_prevista) as string | null
    const bajaEf = (ord.fecha_baja_real ?? ord.fecha_baja_prevista) as string | null

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
        desdePrevista: ord.fecha_alta_real ? (ord.fecha_alta_prevista ?? null) : null,
        hastaPrevista: ord.fecha_baja_real ? (ord.fecha_baja_prevista ?? null) : null,
        orden_id: ord.id,
        reserva_id: null,
      })
    }
  })

  // Build ordenes with their static soportes (for muestras tab)
  const ordenes = (ordenesRaw ?? []).map((ord: any) => {
    const cli = Array.isArray(ord.clientes) ? ord.clientes[0] : ord.clientes
    const soportesDeOrden = (ord.orden_items ?? [])
      .map((it: any) => {
        const s = Array.isArray(it.soportes) ? it.soportes[0] : it.soportes
        return s ? { id: s.id, nombre: s.nombre, tipo: s.tipo } : null
      })
      .filter(Boolean)
      .filter((s: any) => s.tipo !== 'led')

    if (soportesDeOrden.length === 0) return null
    return {
      id: ord.id,
      numero: ord.numero,
      marca: ord.marca,
      estado: ord.estado,
      fecha_alta_prevista: ord.fecha_alta_prevista,
      fecha_baja_prevista: ord.fecha_baja_prevista,
      fecha_alta_real: ord.fecha_alta_real,
      fecha_baja_real: ord.fecha_baja_real,
      cliente_nombre: cli?.empresa ?? cli?.nombre ?? '—',
      soportes: soportesDeOrden,
    }
  }).filter(Boolean)

  return (
    <ArteClient
      soportes={soportes ?? []}
      campanasMap={campanasMap}
      ordenes={ordenes as any}
      supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
      supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
      userId={session.user.id}
    />
  )
}
