import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const ROLES_PERMITIDOS = ['arte', 'operaciones', 'administracion']

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!ROLES_PERMITIDOS.includes(session.user.rol)) {
    return NextResponse.json({ error: 'Solo arte, operaciones o administración pueden registrar fechas reales' }, { status: 403 })
  }

  const body = await req.json()
  const { fecha_alta_real, fecha_baja_real } = body

  // Validate date format if provided
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (fecha_alta_real && !dateRegex.test(fecha_alta_real)) {
    return NextResponse.json({ error: 'Formato de fecha_alta_real inválido (YYYY-MM-DD)' }, { status: 400 })
  }
  if (fecha_baja_real && !dateRegex.test(fecha_baja_real)) {
    return NextResponse.json({ error: 'Formato de fecha_baja_real inválido (YYYY-MM-DD)' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Verify order exists
  const { data: orden, error: fetchErr } = await supabase
    .from('ordenes_venta')
    .select('id, fecha_alta_prevista, fecha_baja_prevista, fecha_alta_real, fecha_baja_real, estado')
    .eq('id', params.id)
    .single()

  if (fetchErr || !orden) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })

  // Cross-validate: real alta must be before real baja
  const altaEfectiva = fecha_alta_real ?? orden.fecha_alta_real
  const bajaEfectiva = fecha_baja_real ?? orden.fecha_baja_real
  if (altaEfectiva && bajaEfectiva && altaEfectiva > bajaEfectiva) {
    return NextResponse.json({ error: 'La fecha de alta real no puede ser posterior a la baja real' }, { status: 400 })
  }

  const updates: Record<string, string | null> = {}
  // Allow explicit null to clear a date
  if ('fecha_alta_real' in body) updates.fecha_alta_real = fecha_alta_real ?? null
  if ('fecha_baja_real' in body) updates.fecha_baja_real = fecha_baja_real ?? null

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('ordenes_venta')
    .update(updates)
    .eq('id', params.id)
    .select('id, fecha_alta_prevista, fecha_baja_prevista, fecha_alta_real, fecha_baja_real')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
