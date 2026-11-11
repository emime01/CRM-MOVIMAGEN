import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { timingSafeEqual } from 'node:crypto'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { puede } from '@/lib/auth/roles'
import { sincronizarHub } from '@/lib/hub/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

// /api/cron/hub-sync[?dry=1]
// Diario por Vercel Cron (GET con Authorization: Bearer CRON_SECRET) o a mano
// por un usuario con sesión (gerente_comercial / administracion) desde el
// botón de Soportes. Con ?dry=1 calcula sin escribir.
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization') ?? ''
  let autorizado = !!cronSecret && safeEq(auth, `Bearer ${cronSecret}`)

  if (!autorizado) {
    const session = await getServerSession(authOptions)
    autorizado = !!session?.user && puede(session.user.rol, ['gerente_comercial', 'administracion'])
  }
  if (!autorizado) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dry = req.nextUrl.searchParams.get('dry') === '1'
  try {
    const resumen = await sincronizarHub(createServerClient(), { dry })
    return NextResponse.json(resumen)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error en la sincronización' }, { status: 500 })
  }
}

// Vercel Cron llama con GET.
export const GET = POST
