import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import CalendarioClient from './CalendarioClient'

export const dynamic = 'force-dynamic'

const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : v ?? null)

export default async function CalendarioPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!['operaciones', 'administracion', 'gerente_comercial'].includes(session.user.rol)) redirect('/dashboard')

  const supabase = createServerClient()

  const [{ data: ordenes }, { data: tasks }] = await Promise.all([
    supabase
      .from('ordenes_venta')
      .select(`
        id, numero, estado,
        fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real,
        clientes(nombre, empresa)
      `)
      .in('estado', ['aprobada', 'en_oic', 'facturada', 'cobrada']),
    supabase
      .from('tasks')
      .select(`
        id, tipo, descripcion, fecha_limite, estado, asignado_a_rol,
        ordenes_venta(numero, clientes(nombre, empresa)),
        soportes(nombre)
      `)
      .in('estado', ['pendiente', 'en_progreso'])
      .not('fecha_limite', 'is', null),
  ])

  // Eventos de alta y baja de campaña
  const eventos: Array<{
    id: string
    kind: 'alta' | 'baja' | 'tarea'
    fecha: string
    titulo: string
    sub: string | null
    orden_id: string | null
  }> = []

  for (const o of (ordenes ?? []) as any[]) {
    const cli = first<any>(o.clientes)
    const cliente = cli?.empresa ?? cli?.nombre ?? '—'
    const numero = o.numero ? `OIC #${String(o.numero).padStart(5, '0')}` : 'OIC'
    const alta = o.fecha_alta_real ?? o.fecha_alta_prevista
    const baja = o.fecha_baja_real ?? o.fecha_baja_prevista
    if (alta) eventos.push({ id: `alta-${o.id}`, kind: 'alta', fecha: alta, titulo: cliente, sub: numero, orden_id: o.id })
    if (baja) eventos.push({ id: `baja-${o.id}`, kind: 'baja', fecha: baja, titulo: cliente, sub: numero, orden_id: o.id })
  }

  for (const t of (tasks ?? []) as any[]) {
    const ord = first<any>(t.ordenes_venta)
    const cli = first<any>(ord?.clientes)
    const sop = first<any>(t.soportes)
    const cliente = cli?.empresa ?? cli?.nombre ?? null
    eventos.push({
      id: `tarea-${t.id}`,
      kind: 'tarea',
      fecha: t.fecha_limite,
      titulo: t.descripcion ?? 'Tarea',
      sub: [cliente, sop?.nombre].filter(Boolean).join(' · ') || null,
      orden_id: null,
    })
  }

  return <CalendarioClient eventos={eventos} />
}
