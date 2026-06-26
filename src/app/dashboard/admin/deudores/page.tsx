import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import DeudoresClient, { type DeudorRow } from './DeudoresClient'

export const dynamic = 'force-dynamic'

const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : v ?? null)

function diasDesde(dateStr: string | null): number {
  if (!dateStr) return 0
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

export default async function DeudoresPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (session.user.rol !== 'administracion') redirect('/dashboard')
  const supabase = createServerClient()

  const { data: facturadas } = await supabase
    .from('ordenes_venta')
    .select('id, numero, monto_total, moneda, estado, created_at, fecha_alta_prevista, clientes(nombre, empresa), perfiles(nombre)')
    .eq('estado', 'facturada')
    .order('created_at', { ascending: true })
    .limit(500)

  const orders = facturadas ?? []
  const ids = orders.map(o => o.id)

  // Última gestión de cobranza por orden (la más reciente)
  const ultimaGestion = new Map<string, { tipo: string; created_at: string; proxima_accion: string | null }>()
  if (ids.length > 0) {
    const { data: gestiones } = await supabase
      .from('gestiones_cobranza')
      .select('orden_id, tipo, created_at, proxima_accion')
      .in('orden_id', ids)
      .order('created_at', { ascending: false })
    for (const g of gestiones ?? []) {
      if (!ultimaGestion.has(g.orden_id)) {
        ultimaGestion.set(g.orden_id, { tipo: g.tipo, created_at: g.created_at, proxima_accion: g.proxima_accion })
      }
    }
  }

  const rows: DeudorRow[] = orders.map(o => {
    const cli = first<any>(o.clientes)
    const vend = first<any>(o.perfiles)
    const g = ultimaGestion.get(o.id) ?? null
    return {
      id: o.id,
      numero: o.numero as number | null,
      cliente: cli?.empresa ?? cli?.nombre ?? '—',
      monto_total: o.monto_total as number | null,
      moneda: (o.moneda as string) ?? 'UYU',
      vendedor: vend?.nombre ?? '—',
      dias: diasDesde(o.created_at as string),
      ultima_gestion: g,
    }
  })

  return <DeudoresClient rows={rows} />
}
