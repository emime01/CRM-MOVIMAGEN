import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

const ALLOWED_ROLES = ['asistente_ventas', 'gerente_comercial', 'administracion']

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!ALLOWED_ROLES.includes(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { vendedorId, cuatrimestre, monto } = await req.json()
  if (!vendedorId || !cuatrimestre) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })

  const supabase = createServerClient()

  // Delete existing then insert (simple upsert)
  await supabase.from('objetivos').delete().eq('vendedor_id', vendedorId).eq('cuatrimestre', cuatrimestre)

  if (monto > 0) {
    const { error } = await supabase.from('objetivos').insert({
      vendedor_id: vendedorId,
      cuatrimestre,
      objetivo_monto: monto,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
