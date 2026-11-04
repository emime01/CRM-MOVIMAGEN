import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { haceAdministracion } from '@/lib/auth/roles'

/** Borrar un gasto cargado por error. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!haceAdministracion(session.user.rol)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const supabase = createServerClient()
  const { error } = await supabase.from('gastos_tarjeta').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
