import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

/**
 * POST /api/propuestas/[id]/lead
 *
 * Asigna, cambia o quita el lead asociado a una cotización.
 *
 * Body opciones:
 *   { lead_id: "uuid" }                   → asocia a un lead existente
 *   { lead_id: null }                     → quita la asociación
 *   { crear_nuevo: { descripcion, ... } } → crea un lead nuevo para el cliente
 *                                            de la cotización y lo asocia
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: {
    lead_id?: string | null
    crear_nuevo?: { descripcion?: string; monto_potencial?: number; cuatrimestre?: string }
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const supabase = createServerClient()

  const { data: propuesta } = await supabase
    .from('propuestas')
    .select('id, cliente_id, vendedor_id')
    .eq('id', params.id)
    .maybeSingle()
  if (!propuesta) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })

  // Vendedor solo puede modificar sus propias cotizaciones
  if (session.user.rol === 'vendedor' && propuesta.vendedor_id !== session.user.id) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  let leadId: string | null

  if (body.crear_nuevo) {
    if (!propuesta.cliente_id) {
      return NextResponse.json({ error: 'La cotización no tiene cliente, no puedo crear un lead sin cliente' }, { status: 400 })
    }
    const { data: nuevo, error } = await supabase
      .from('leads')
      .insert({
        cliente_id:      propuesta.cliente_id,
        vendedor_id:     propuesta.vendedor_id ?? session.user.id,
        descripcion:     body.crear_nuevo.descripcion ?? null,
        monto_potencial: body.crear_nuevo.monto_potencial ?? null,
        cuatrimestre:    body.crear_nuevo.cuatrimestre ?? null,
        estado:          'en_seguimiento',
      })
      .select('id')
      .single()
    if (error || !nuevo) return NextResponse.json({ error: error?.message ?? 'No se pudo crear el lead' }, { status: 500 })
    leadId = nuevo.id
  } else {
    leadId = body.lead_id ?? null
    // Si se pasó un lead_id, validar que pertenezca al mismo cliente
    if (leadId) {
      const { data: lead } = await supabase.from('leads').select('cliente_id').eq('id', leadId).maybeSingle()
      if (!lead) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
      if (propuesta.cliente_id && lead.cliente_id && lead.cliente_id !== propuesta.cliente_id) {
        return NextResponse.json({ error: 'El lead pertenece a otro cliente' }, { status: 400 })
      }
    }
  }

  const { error } = await supabase
    .from('propuestas')
    .update({ lead_id: leadId, updated_at: new Date().toISOString() })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, lead_id: leadId })
}
