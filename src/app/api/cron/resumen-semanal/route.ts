import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { timingSafeEqual } from 'node:crypto'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { puede } from '@/lib/auth/roles'
import { hoyUY } from '@/lib/fechas'
import { cargarDatosResumenSemanal, enviarResumenSemanal } from '@/lib/avisos/semanal-datos'
import { construirResumenSemanal } from '@/lib/avisos/semanal'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

/**
 * Resumen semanal para la gerencia comercial (lunes 08:00 de Uruguay).
 *
 *   · Cron (Authorization: Bearer CRON_SECRET): manda el mail.
 *       ?dry=1   → no manda; devuelve asunto y destinatarios.
 *   · Sesión de gerente comercial o admin:
 *       ?preview=1 → devuelve el HTML del resumen, sin mandar nada.
 *   · ?fecha=AAAA-MM-DD simula otro "hoy" (el resumen es de la semana anterior).
 *
 * CRON_SECRET es obligatorio: sin él el envío queda cerrado (503).
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const fechaQ = url.searchParams.get('fecha')
  if (fechaQ && !/^\d{4}-\d{2}-\d{2}$/.test(fechaQ)) return NextResponse.json({ error: 'fecha inválida (AAAA-MM-DD)' }, { status: 400 })
  const hoy = fechaQ ?? hoyUY()

  if (url.searchParams.get('preview') === '1') {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!puede(session.user.rol, ['gerente_comercial'])) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
    try {
      const datos = await cargarDatosResumenSemanal(createServerClient(), hoy)
      const { html } = construirResumenSemanal(datos, process.env.NEXTAUTH_URL ?? undefined)
      return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? 'No se pudo armar el resumen' }, { status: 500 })
    }
  }

  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET no configurado' }, { status: 503 })
  if (!safeEq(req.headers.get('authorization') ?? '', `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const r = await enviarResumenSemanal(createServerClient(), { dry: url.searchParams.get('dry') === '1', hoy })
    return NextResponse.json(r)
  } catch (e: any) {
    console.error('Resumen semanal falló', e)
    return NextResponse.json({ ok: false, error: e?.message ?? 'Error' }, { status: 500 })
  }
}

// Mismo criterio que el cron diario: Vercel llama con GET, pero también se acepta POST.
export const POST = GET
