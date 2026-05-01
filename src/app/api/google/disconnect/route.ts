import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const perfilId = (session.user as { id: string }).id
  const supabase = createServerClient()

  await supabase.from('google_tokens').delete().eq('perfil_id', perfilId)
  await supabase.from('email_suggestions').delete().eq('perfil_id', perfilId)

  return NextResponse.json({ ok: true })
}
