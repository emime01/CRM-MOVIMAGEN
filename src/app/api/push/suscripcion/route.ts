import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/** La clave pública para suscribirse (o null si push no está configurado). */
export async function GET() {
  return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY ?? null })
}

/** Guarda la suscripción de este celular para la persona logueada. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const endpoint = body?.endpoint, p256dh = body?.keys?.p256dh, auth = body?.keys?.auth
  if (typeof endpoint !== 'string' || !endpoint.startsWith('https://') || typeof p256dh !== 'string' || typeof auth !== 'string') {
    return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 })
  }
  const { error } = await createServerClient().from('push_suscripciones').upsert({
    perfil_id: session.user.id, endpoint, p256dh, auth,
    user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
  }, { onConflict: 'endpoint' })
  if (error) {
    const falta = /push_suscripciones/.test(error.message)
    return NextResponse.json({ error: falta ? 'Falta correr la migración v48 en Supabase.' : error.message }, { status: falta ? 503 : 500 })
  }
  return NextResponse.json({ ok: true })
}

/** Desactiva las notificaciones de este celular. */
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const body = await req.json().catch(() => null)
  if (typeof body?.endpoint !== 'string') return NextResponse.json({ error: 'Falta endpoint' }, { status: 400 })
  await createServerClient().from('push_suscripciones').delete().eq('endpoint', body.endpoint).eq('perfil_id', session.user.id)
  return NextResponse.json({ ok: true })
}
