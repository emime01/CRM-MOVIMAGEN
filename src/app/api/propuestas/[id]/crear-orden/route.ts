import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { crearOrdenDesdePropuesta } from '@/lib/ventas/crear-orden'

/**
 * POST /api/propuestas/[id]/crear-orden
 *
 * Respaldo para cotizaciones que quedaron aceptadas sin OIC. En el camino normal
 * la OIC ya se crea al aceptar la cotización (ver /aprobar), así que acá no hace
 * falta pasar por este paso.
 *
 * La OIC nace en 'pendiente_aprobacion' y avisa al gerente.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const canCreate = ['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion'].includes(session.user.rol)
  if (!canCreate) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const supabase = createServerClient()

  // Ownership: un vendedor solo crea OICs sobre sus propias cotizaciones.
  if (session.user.rol === 'vendedor') {
    const { data: propia } = await supabase
      .from('propuestas')
      .select('vendedor_id')
      .eq('id', params.id)
      .maybeSingle()
    if (!propia) return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 })
    if (propia.vendedor_id !== session.user.id) {
      return NextResponse.json({ error: 'Sin permisos sobre esta cotización' }, { status: 403 })
    }
  }

  const r = await crearOrdenDesdePropuesta(supabase, params.id, session.user.id)

  if (!r.ok) {
    const status = r.motivo === 'no_encontrada' ? 404
      : r.motivo === 'ya_existe' ? 409
      : r.motivo === 'error' ? 500
      : 400
    return NextResponse.json({ error: r.error, orden_id: r.ordenId }, { status })
  }

  return NextResponse.json({ ok: true, orden_id: r.ordenId, orden_numero: r.numero })
}
