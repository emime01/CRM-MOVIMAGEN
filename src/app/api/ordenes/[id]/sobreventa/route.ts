import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { detectarSobreventa, textoSobreventa } from '@/lib/ventas/sobreventa'

export const dynamic = 'force-dynamic'

// Lo que quedaría sobrevendido si se aprueba esta venta. Se consulta ANTES de
// aprobar: el aviso salía recién después, cuando ya no había vuelta atrás.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const lista = await detectarSobreventa(createServerClient(), params.id)
  return NextResponse.json({ sobreventa: lista, avisos: lista.map(textoSobreventa) })
}
