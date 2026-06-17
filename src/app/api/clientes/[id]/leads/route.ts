import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/clientes/[id]/leads?activos=1
 *
 * Lista leads del cliente. ?activos=1 (default true) excluye ganado/perdido.
 * Usado por el modal "Asignar a lead" en el cotizador.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const soloActivos = searchParams.get('activos') !== '0'

  const supabase = createServerClient()
  let q = supabase
    .from('leads')
    .select('id, descripcion, estado, monto_potencial, proxima_gestion, created_at, perfiles(nombre)')
    .eq('cliente_id', params.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (soloActivos) q = q.not('estado', 'in', '(ganado,perdido)')
  // Vendedor solo ve sus propios leads
  if (session.user.rol === 'vendedor') q = q.eq('vendedor_id', session.user.id)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ leads: data ?? [] })
}
