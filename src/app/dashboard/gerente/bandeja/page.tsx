import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import BandejaClient from './BandejaClient'
import { puede } from '@/lib/auth/roles'
import { detectarSobreventa, textoSobreventa } from '@/lib/ventas/sobreventa'

export const dynamic = 'force-dynamic'

const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : v ?? null)

export default async function BandejaPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!puede(session.user.rol, ['gerente_comercial', 'administracion'])) redirect('/dashboard')

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

  // Para decidir sin abrir cada venta: lo que quedaría sobrevendido y el
  // último comentario (el vendedor a veces pide ahí que se rechace).
  const ids = (ordenes ?? []).map((o: any) => o.id)
  const [sobreventas, { data: comentarios }] = await Promise.all([
    Promise.all(ids.map(id => detectarSobreventa(supabase, id).catch(() => []))),
    ids.length
      ? supabase.from('comentarios_orden').select('orden_id, mensaje, created_at, perfiles(nombre)').in('orden_id', ids).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
  ])
  const ultimoComentario: Record<string, { mensaje: string; autor: string }> = {}
  for (const c of (comentarios ?? []) as any[]) {
    if (ultimoComentario[c.orden_id]) continue
    ultimoComentario[c.orden_id] = { mensaje: c.mensaje, autor: first<any>(c.perfiles)?.nombre ?? '' }
  }

  const ordenesPend = (ordenes ?? []).map((o: any, i: number) => {
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
      sobreventa: (sobreventas[i] ?? []).map(textoSobreventa),
      comentario: ultimoComentario[o.id] ?? null,
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
