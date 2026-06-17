import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

/**
 * POST /api/leads/[id]/marcar-ganadora
 * body: { propuesta_id }
 *
 * Marca el lead como ganado con la cotización seleccionada como ganadora.
 * Las demás cotizaciones del lead quedan en su estado actual (no se tocan):
 * son info que queremos preservar para análisis.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const canMark = ['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion'].includes(session.user.rol)
  if (!canMark) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  let body: { propuesta_id?: string }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }
  if (!body.propuesta_id) return NextResponse.json({ error: 'Falta propuesta_id' }, { status: 400 })

  const supabase = createServerClient()
  const { data: propuesta } = await supabase
    .from('propuestas')
    .select('id, lead_id')
    .eq('id', body.propuesta_id)
    .maybeSingle()
  if (!propuesta) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
  if (propuesta.lead_id && propuesta.lead_id !== params.id) {
    return NextResponse.json({ error: 'La cotización pertenece a otro lead' }, { status: 400 })
  }

  // Si la cotización no tenía lead_id, asociarla a este lead
  if (!propuesta.lead_id) {
    await supabase.from('propuestas').update({ lead_id: params.id }).eq('id', propuesta.id)
  }

  const { error } = await supabase
    .from('leads')
    .update({
      estado: 'ganado',
      propuesta_ganadora_id: body.propuesta_id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
