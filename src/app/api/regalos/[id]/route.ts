import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { puede } from '@/lib/auth/roles'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { estado, notas } = await req.json()
  if (!['pendiente', 'entregado', 'no_entregado'].includes(estado)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Sólo pedía sesión: cualquiera podía marcar entregado el regalo de otro.
  // Quien no gestiona regalos sólo puede tocar los que pidió él.
  if (!puede(session.user.rol, ['asistente_ventas', 'gerente_comercial', 'administracion'])) {
    const { data: propio } = await supabase
      .from('regalos').select('solicitado_por').eq('id', params.id).maybeSingle()
    if (!propio) return NextResponse.json({ error: 'Regalo no encontrado' }, { status: 404 })
    if (propio.solicitado_por !== session.user.id) {
      return NextResponse.json({ error: 'Sin permisos sobre este regalo' }, { status: 403 })
    }
  }

  const { error } = await supabase
    .from('regalos')
    .update({ estado, notas: notas || null, updated_at: new Date().toISOString() })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
