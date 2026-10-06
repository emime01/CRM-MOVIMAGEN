import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { pickAllowed } from '@/lib/api/safe-patch'
import { puede } from '@/lib/auth/roles'

const CONTACTO_FIELDS = [
  'cuenta_id', 'tipo_cuenta', 'nombres', 'apellidos', 'cargo',
  'telefono1', 'telefono2', 'mail1', 'mail2',
  'cumple_dia', 'cumple_mes', 'notas', 'activo',
] as const

const CONTACTO_ROLES = ['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion']

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puede(session.user.rol, CONTACTO_ROLES)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }
  const body = await req.json()
  const supabase = createServerClient()
  // Allowlist: antes entraba el body crudo, con cualquier columna.
  const { error } = await supabase.from('contactos').update({ ...pickAllowed(body, CONTACTO_FIELDS), updated_at: new Date().toISOString() }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puede(session.user.rol, CONTACTO_ROLES)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }
  const supabase = createServerClient()
  const { error } = await supabase.from('contactos').update({ activo: false, updated_at: new Date().toISOString() }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
