import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createServerClient()
  const rol = session.user.rol

  let query = supabase
    .from('regalos')
    .select('id, estado, notas, created_at, contacto_id, contactos(nombres, apellidos, cumple_dia, cumple_mes, cuenta_id, tipo_cuenta), perfiles!solicitado_por(nombre)')
    .order('created_at', { ascending: false })

  // Asistente sees ALL pending; vendedor sees only their own
  if (rol !== 'asistente_ventas' && rol !== 'administracion' && rol !== 'gerente_comercial') {
    query = query.eq('solicitado_por', session.user.id) as typeof query
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { contactoId } = await req.json()
  const supabase = createServerClient()

  // Check if already pending for this year
  const startOfYear = `${new Date().getFullYear()}-01-01`
  const { data: existing } = await supabase
    .from('regalos')
    .select('id, estado')
    .eq('contacto_id', contactoId)
    .gte('created_at', startOfYear)
    .maybeSingle()

  if (existing) return NextResponse.json(existing)

  const { data, error } = await supabase
    .from('regalos')
    .insert({ contacto_id: contactoId, solicitado_por: session.user.id, estado: 'pendiente' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
