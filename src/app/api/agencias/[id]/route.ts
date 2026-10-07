import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { pickAllowed } from '@/lib/api/safe-patch'
import { puede } from '@/lib/auth/roles'

const EDITABLE_FIELDS = [
  'nombre',
  'telefono',
  'email',
  'direccion',
  'observaciones',
  'activo',
  'ejecutivo_cuenta',
  // Lo recomendado: sólo precarga la comisión de cada venta, que es la que
  // vale. Por eso se puede editar acá (con los roles de este endpoint).
  'porcentaje_comision',
  'porcentaje_comision_produccion',
] as const

const ADMIN_ROLES = ['asistente_ventas', 'gerente_comercial', 'administracion']

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puede(session.user.rol, ADMIN_ROLES)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const supabase = createServerClient()
  const updates = {
    ...pickAllowed(body, EDITABLE_FIELDS),
    updated_at: new Date().toISOString(),
  }
  const { error } = await supabase.from('agencias').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puede(session.user.rol, ADMIN_ROLES)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }
  const supabase = createServerClient()
  const { error } = await supabase.from('agencias').update({ activo: false, updated_at: new Date().toISOString() }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
