import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const all = searchParams.get('all') === 'true'
  const supabase = createServerClient()
  let query = supabase.from('agencias').select('id, nombre, email, telefono, rut, ejecutivo_cuenta, porcentaje_comision, incluye_produccion, notas, activo').order('nombre')
  if (!all) query = query.eq('activo', true) as typeof query
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const body = await req.json()
  const supabase = createServerClient()
  const { data, error } = await supabase.from('agencias').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
