import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import BandejaClient from './BandejaClient'

export const dynamic = 'force-dynamic'

const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : v ?? null)

export default async function BandejaPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!['gerente_comercial', 'administracion'].includes(session.user.rol)) redirect('/dashboard')

  const supabase = createServerClient()

  const [{ data: ordenes }, { data: reservas }] = await Promise.all([
    supabase
      .from('ordenes_venta')
      .select(`
        id, numero, monto_total, moneda, created_at, marca,
        clientes(nombre, empresa),
        vendedor:perfiles!ordenes_venta_vendedor_id_fkey(nombre)
      `)
      .eq('estado', 'pendiente_aprobacion')
      .order('created_at', { ascending: true }),
    supabase
      .from('reservas')
      .select(`
        id, fecha_desde, fecha_hasta, created_at, notas,
        clientes(nombre, empresa),
        vendedor:perfiles!reservas_vendedor_id_fkey(nombre),
        reserva_items(id, cantidad, soportes(nombre))
      `)
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: true }),
  ])

  const ordenesPend = (ordenes ?? []).map((o: any) => {
    const cli = first<any>(o.clientes)
    const vend = first<any>(o.vendedor)
    return {
      id: o.id,
      numero: o.numero as number | null,
      monto_total: o.monto_total as number | null,
      moneda: (o.moneda as string) ?? 'UYU',
      marca: (o.marca as string) ?? null,
      created_at: o.created_at as string,
      cliente: cli?.empresa ?? cli?.nombre ?? '—',
      vendedor: vend?.nombre ?? '—',
    }
  })

  const reservasPend = (reservas ?? []).map((r: any) => {
    const cli = first<any>(r.clientes)
    const vend = first<any>(r.vendedor)
    const items = (r.reserva_items ?? []) as Array<{ cantidad: number; soportes: any }>
    const totalSoportes = items.reduce((s, it) => s + (it.cantidad ?? 1), 0)
    const nombres = items.map(it => first<any>(it.soportes)?.nombre).filter(Boolean) as string[]
    return {
      id: r.id,
      fecha_desde: r.fecha_desde as string,
      fecha_hasta: r.fecha_hasta as string,
      created_at: r.created_at as string,
      cliente: cli?.empresa ?? cli?.nombre ?? '—',
      vendedor: vend?.nombre ?? '—',
      total_soportes: totalSoportes,
      soportes: nombres,
    }
  })

  return <BandejaClient ordenes={ordenesPend} reservas={reservasPend} rol={session.user.rol} />
}
