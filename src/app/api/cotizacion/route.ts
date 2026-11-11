import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { cotizacionDolar } from '@/lib/bcu'
import { hoyUY } from '@/lib/fechas'

export const dynamic = 'force-dynamic'

/** GET /api/cotizacion?fecha=AAAA-MM-DD → la cotización del dólar (BCU; si no responde, BROU de hoy). */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const fecha = req.nextUrl.searchParams.get('fecha') || hoyUY()
  const c = await cotizacionDolar(fecha)
  if (!c) return NextResponse.json({ error: 'No se pudo consultar la cotización (BCU ni BROU)' }, { status: 502 })
  return NextResponse.json(c)
}
