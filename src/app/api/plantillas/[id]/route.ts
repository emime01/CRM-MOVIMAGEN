import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// GET /api/plantillas/[id] — devuelve una plantilla (para precargar)
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('plantillas_cotizacion')
    .select('id, nombre, vendedor_id, items, created_at')
    .eq('id', params.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 })

  // El vendedor solo accede a las propias o globales.
  const esAdmin = ['gerente_comercial', 'administracion'].includes(session.user.rol)
  if (!esAdmin && data.vendedor_id && data.vendedor_id !== session.user.id) {
    return NextResponse.json({ error: 'Sin permisos sobre esta plantilla' }, { status: 403 })
  }

  return NextResponse.json(data)
}

// DELETE /api/plantillas/[id] — borra (dueño o rol administrativo)
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createServerClient()
  const { data: plantilla } = await supabase
    .from('plantillas_cotizacion')
    .select('vendedor_id')
    .eq('id', params.id)
    .maybeSingle()
  if (!plantilla) return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 })

  const esAdmin = ['gerente_comercial', 'administracion'].includes(session.user.rol)
  if (!esAdmin && plantilla.vendedor_id !== session.user.id) {
    return NextResponse.json({ error: 'Sin permisos sobre esta plantilla' }, { status: 403 })
  }

  const { error } = await supabase.from('plantillas_cotizacion').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
