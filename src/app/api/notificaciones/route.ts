import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// GET /api/notificaciones — unread notifications for current user
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as { id: string }).id
  const supabase = createServerClient()

  const { data } = await supabase
    .from('notificaciones')
    .select('id, tipo, titulo, mensaje, link, leida, created_at')
    .eq('user_id', userId)
    .eq('leida', false)
    .order('created_at', { ascending: false })
    .limit(30)

  // Un "OIC esperando tu aprobación" de una venta que ya no está pendiente
  // (la aprobó otro, se rechazó o se retiró) no tiene nada que hacer: se marca
  // leído acá, así no queda colgado en la campanita.
  const pendientes = (data ?? []).filter(n => n.tipo === 'orden_pendiente' && n.link)
  if (pendientes.length) {
    const idDe = (link: string) => link.split('/').pop() ?? ''
    const ids = Array.from(new Set(pendientes.map(n => idDe(n.link!))))
    const { data: ordenes } = await supabase.from('ordenes_venta').select('id, estado').in('id', ids)
    const sigue = new Set((ordenes ?? []).filter(o => o.estado === 'pendiente_aprobacion').map(o => o.id))
    const resueltas = pendientes.filter(n => !sigue.has(idDe(n.link!))).map(n => n.id)
    if (resueltas.length) {
      await supabase.from('notificaciones').update({ leida: true }).in('id', resueltas)
      return NextResponse.json((data ?? []).filter(n => !resueltas.includes(n.id)))
    }
  }

  return NextResponse.json(data ?? [])
}
