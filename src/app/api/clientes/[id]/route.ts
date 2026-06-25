import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { pickAllowed } from '@/lib/api/safe-patch'

// Campos editables por cualquier rol con permisos.
const EDITABLE_FIELDS = [
  'nombre',
  'empresa',
  'telefono',
  'email',
  'direccion',
  'observaciones',
  'tipo_cliente',
  'agencia_id',
  'activo',
] as const

// Reasignar dueño del cliente es operación administrativa.
const ADMIN_FIELDS = ['vendedor_id'] as const

const EDIT_ROLES = ['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion']
const ADMIN_ROLES = ['asistente_ventas', 'gerente_comercial', 'administracion']

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!EDIT_ROLES.includes(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Vendedor solo puede tocar sus propios clientes.
  if (session.user.rol === 'vendedor') {
    const { data: cli } = await supabase
      .from('clientes')
      .select('vendedor_id')
      .eq('id', params.id)
      .maybeSingle()
    if (!cli) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    if (cli.vendedor_id !== session.user.id) {
      return NextResponse.json({ error: 'Sin permisos sobre este cliente' }, { status: 403 })
    }
  }

  const updates: Record<string, unknown> = {
    ...pickAllowed(body, EDITABLE_FIELDS),
    updated_at: new Date().toISOString(),
  }

  // Solo administracion / gerencia puede reasignar dueño.
  if (ADMIN_ROLES.includes(session.user.rol)) {
    Object.assign(updates, pickAllowed(body, ADMIN_FIELDS))
  }

  const { error } = await supabase.from('clientes').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!ADMIN_ROLES.includes(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }
  const supabase = createServerClient()
  const { error } = await supabase.from('clientes').update({ activo: false, updated_at: new Date().toISOString() }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
