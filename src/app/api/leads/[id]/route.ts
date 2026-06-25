import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

const LEADS_ROLES = ['vendedor', 'gerente_comercial']

// Ownership: el vendedor solo puede tocar leads asignados a él. Gerente y
// administracion ven/editan todo.
async function checkOwnership(
  supabase: ReturnType<typeof createServerClient>,
  leadId: string,
  session: { user: { id: string; rol: string } },
): Promise<NextResponse | null> {
  if (session.user.rol !== 'vendedor') return null
  const { data: lead } = await supabase.from('leads').select('vendedor_id').eq('id', leadId).maybeSingle()
  if (!lead) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
  if (lead.vendedor_id !== session.user.id) {
    return NextResponse.json({ error: 'Sin permisos sobre este lead' }, { status: 403 })
  }
  return null
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!LEADS_ROLES.includes(session.user.rol)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const supabase = createServerClient()
  const denied = await checkOwnership(supabase, params.id, session as any)
  if (denied) return denied

  let body: {
    clienteId?: string
    agenciaId?: string
    descripcion?: string
    montoPotencial?: number | null
    cuatrimestre?: string
    estado?: string
    notas?: string
    motivoPerdida?: string
    proximaGestion?: string | null
    notaGestion?: string | null
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.clienteId !== undefined) updates.cliente_id = body.clienteId || null
  if (body.agenciaId !== undefined) updates.agencia_id = body.agenciaId || null
  if (body.descripcion !== undefined) updates.descripcion = body.descripcion || null
  if (body.montoPotencial !== undefined) updates.monto_potencial = body.montoPotencial
  if (body.cuatrimestre !== undefined) updates.cuatrimestre = body.cuatrimestre || null
  if (body.estado !== undefined) updates.estado = body.estado
  if (body.notas !== undefined) updates.notas = body.notas || null
  if (body.motivoPerdida !== undefined) updates.motivo_perdida = body.motivoPerdida || null
  if (body.proximaGestion !== undefined) updates.proxima_gestion = body.proximaGestion || null
  if (body.notaGestion !== undefined) updates.nota_gestion = body.notaGestion || null

  const { error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!LEADS_ROLES.includes(session.user.rol)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const supabase = createServerClient()
  const denied = await checkOwnership(supabase, params.id, session as any)
  if (denied) return denied

  const { error } = await supabase.from('leads').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
