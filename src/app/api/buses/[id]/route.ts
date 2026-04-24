import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const canManage = ['operaciones', 'administracion'].includes(session.user.rol)
  if (!canManage) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await req.json()
  const supabase = createServerClient()

  const { soporteAssignments, ...busFields } = body

  const { error } = await supabase
    .from('buses')
    .update({ ...busFields, updated_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update soporte-bus assignments: { soporteId, ladoBus } pairs
  // soporteAssignments = [{ soporteId, ladoBus }] — set bus_id on each soporte, clear old ones
  if (soporteAssignments !== undefined) {
    // Clear existing assignments for this bus
    await supabase.from('soportes').update({ bus_id: null, lado_bus: null }).eq('bus_id', params.id)

    // Set new assignments
    for (const { soporteId, ladoBus } of soporteAssignments as { soporteId: string; ladoBus: string }[]) {
      if (!soporteId) continue
      await supabase.from('soportes').update({ bus_id: params.id, lado_bus: ladoBus }).eq('id', soporteId)
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const canManage = ['operaciones', 'administracion'].includes(session.user.rol)
  if (!canManage) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const supabase = createServerClient()
  const { error } = await supabase
    .from('buses')
    .update({ activo: false, updated_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
