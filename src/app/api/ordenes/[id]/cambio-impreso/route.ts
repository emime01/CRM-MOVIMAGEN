import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { crearOicCambioImpreso } from '@/lib/cambios-material/lib'

/**
 * POST /api/ordenes/[id]/cambio-impreso
 *
 * Crea una OIC HIJA tipo "cambio_material" sobre la OIC `[id]` con los
 * ítems impresos (todos por defecto, o los indicados en soporte_ids).
 * La hija nace en borrador, solo cobra producción (arrendamiento en 0).
 * Solo operaciones, administracion y asistente_ventas pueden iniciarlo.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!['operaciones', 'administracion', 'asistente_ventas'].includes(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  let body: { soporte_ids?: string[] } = {}
  try { body = await req.json() } catch { /* allow empty body */ }

  const supabase = createServerClient()
  const r = await crearOicCambioImpreso(supabase, {
    oicOrigenId:        params.id,
    soporteIds:         body.soporte_ids,
    creadoPorPerfilId:  session.user.id,
  })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error?.includes('no encontrada') ? 404 : 400 })
  return NextResponse.json({ ok: true, orden_id: r.ordenId, numero: r.numero, items_copiados: r.itemsCopiados })
}
