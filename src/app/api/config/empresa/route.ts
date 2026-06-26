import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { pickAllowed } from '@/lib/api/safe-patch'

export const dynamic = 'force-dynamic'

const FIELDS = ['nombre', 'razon_social', 'rut', 'direccion', 'telefono', 'email'] as const

// GET /api/config/empresa — datos del emisor (cualquier usuario autenticado)
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('config_empresa')
    .select('nombre, razon_social, rut, direccion, telefono, email')
    .eq('id', 1)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ empresa: data ?? null })
}

// PUT /api/config/empresa — actualizar (solo administracion)
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (session.user.rol !== 'administracion') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const updates = pickAllowed(body, FIELDS)
  const nombre = String(updates.nombre ?? '').trim()
  if (!nombre) {
    return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  }
  updates.nombre = nombre

  const supabase = createServerClient()
  // upsert sobre la fila única (id = 1)
  const { data, error } = await supabase
    .from('config_empresa')
    .upsert({ id: 1, ...updates, updated_at: new Date().toISOString() }, { onConflict: 'id' })
    .select('nombre, razon_social, rut, direccion, telefono, email')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
