import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'

// GET — devuelve el token actual (si existe) y la URL del conector
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createServerClient()
  const { data } = await supabase.from('perfiles').select('mcp_token').eq('id', session.user.id).maybeSingle()
  return NextResponse.json({ token: data?.mcp_token ?? null })
}

// POST — genera (o regenera) el token personal. Regenerar invalida el anterior.
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const token = `mvmg_${randomBytes(24).toString('base64url')}`
  const supabase = createServerClient()
  const { error } = await supabase.from('perfiles').update({ mcp_token: token }).eq('id', session.user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ token })
}
