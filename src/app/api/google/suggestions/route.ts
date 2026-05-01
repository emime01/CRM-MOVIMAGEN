import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

// GET: return all suggestions for current user
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const perfilId = (session.user as { id: string }).id
  const supabase = createServerClient()

  const { data } = await supabase
    .from('email_suggestions')
    .select('*')
    .eq('perfil_id', perfilId)
    .order('created_at', { ascending: false })

  return NextResponse.json(data ?? [])
}

// PATCH: update status (accepted | dismissed)
export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const perfilId = (session.user as { id: string }).id
  const { id, status } = await req.json()

  if (!id || !['accepted', 'dismissed'].includes(status)) {
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { error } = await supabase
    .from('email_suggestions')
    .update({ status })
    .eq('id', id)
    .eq('perfil_id', perfilId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
