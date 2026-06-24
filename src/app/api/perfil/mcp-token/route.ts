import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { randomBytes, createHash } from 'node:crypto'

export const dynamic = 'force-dynamic'

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * GET — devuelve si el usuario ya tiene un token configurado (sin el plain).
 * El token nunca se guarda en plaintext: solo guardamos sha256 y por eso
 * tampoco se puede recuperar. Si lo perdiste, regeneralo con POST.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createServerClient()
  const { data } = await supabase.from('perfiles').select('mcp_token_hash').eq('id', session.user.id).maybeSingle()
  return NextResponse.json({ token: null, has_token: !!data?.mcp_token_hash })
}

/**
 * POST — genera (o regenera) el token personal. Regenerar invalida el anterior.
 * Devuelve el plain UNA SOLA VEZ; la DB solo guarda el hash.
 */
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const token = `mvmg_${randomBytes(24).toString('base64url')}`
  const supabase = createServerClient()
  const { error } = await supabase
    .from('perfiles')
    .update({ mcp_token_hash: hashToken(token) })
    .eq('id', session.user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ token, has_token: true })
}
