import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ordenes/[id]/comentarios
 * POST /api/ordenes/[id]/comentarios   body: { mensaje }
 *
 * Hilo de comentarios sobre una OIC. Cualquier usuario autenticado del CRM
 * que vea la OIC puede leer y comentar — útil para que vendedor, arte y
 * operaciones se comuniquen sobre ese trabajo sin salir del sistema.
 */

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('comentarios_orden')
    .select('id, mensaje, created_at, perfil_id, perfiles(nombre, rol)')
    .eq('orden_id', params.id)
    .order('created_at', { ascending: true })
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ comentarios: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: { mensaje?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }
  const mensaje = (body.mensaje ?? '').trim()
  if (!mensaje) return NextResponse.json({ error: 'Mensaje vacío' }, { status: 400 })
  if (mensaje.length > 2000) return NextResponse.json({ error: 'Mensaje demasiado largo' }, { status: 400 })

  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('comentarios_orden')
    .insert({ orden_id: params.id, perfil_id: session.user.id, mensaje })
    .select('id, mensaje, created_at, perfil_id, perfiles(nombre, rol)')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notificar a las personas involucradas en la OIC (vendedor, arte y
  // operaciones con tasks de esa orden) salvo al propio autor.
  const { data: orden } = await supabase
    .from('ordenes_venta')
    .select('numero, vendedor_id, clientes(nombre, empresa), tasks(asignado_a)')
    .eq('id', params.id)
    .maybeSingle()
  if (orden) {
    const cli: any = Array.isArray(orden.clientes) ? orden.clientes[0] : orden.clientes
    const clienteNombre = cli?.empresa ?? cli?.nombre ?? 'cliente'
    const destinatariosSet = new Set<string>()
    if (orden.vendedor_id && orden.vendedor_id !== session.user.id) destinatariosSet.add(orden.vendedor_id)
    ;((orden as any).tasks ?? []).forEach((t: any) => {
      if (t.asignado_a && t.asignado_a !== session.user.id) destinatariosSet.add(t.asignado_a)
    })
    if (destinatariosSet.size > 0) {
      await supabase.from('notificaciones').insert(
        Array.from(destinatariosSet).map(uid => ({
          user_id:   uid,
          tipo:      'orden_comentario',
          titulo:    'Nuevo comentario en una OIC',
          mensaje:   `OIC #${orden.numero} · ${clienteNombre}: ${mensaje.slice(0, 80)}${mensaje.length > 80 ? '…' : ''}`,
          link:      `/dashboard/ventas/${params.id}`,
          entity_id: params.id,
        })),
      )
    }
  }

  return NextResponse.json(data, { status: 201 })
}
