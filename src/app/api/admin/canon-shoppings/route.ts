import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { es } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!es(session.user.rol, 'administracion')) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('canon_shoppings')
    .select('id, nombre, porcentaje_canon, canon_minimo, activo')
    // Los desactivados (borrados con historia de canon) no se configuran más.
    .eq('activo', true)
    .order('nombre')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!es(session.user.rol, 'administracion')) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await req.json()
  if (!body.nombre) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('canon_shoppings')
    .insert({ nombre: body.nombre, porcentaje_canon: Number(body.porcentaje_canon) || 0, canon_minimo: Number(body.canon_minimo) || 0 })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
