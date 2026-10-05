import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { pickAllowed } from '@/lib/api/safe-patch'
import { puede } from '@/lib/auth/roles'

// Las mismas que deja editar el PATCH, más las que sólo se cargan al crear.
// `porcentaje_comision` queda afuera a propósito: es plata, y el PATCH ya la
// excluye — por el POST entraba igual.
const CREATE_FIELDS = [
  'nombre', 'telefono', 'email', 'rut', 'direccion',
  'ejecutivo_cuenta', 'observaciones', 'notas', 'activo',
] as const

const CREATE_ROLES = ['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion']

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
  if (!puede(session.user.rol, CREATE_ROLES)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }
  const body = await req.json()
  const insertData = pickAllowed(body, CREATE_FIELDS)
  if (!insertData.nombre || String(insertData.nombre).trim() === '') {
    return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  }
  const supabase = createServerClient()
  const { data, error } = await supabase.from('agencias').insert(insertData).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
