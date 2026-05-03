import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

// POST /api/propuestas/[id]/aprobar
// Gerente/admin approves a cotización → marks estado=aceptada + creates orden_venta
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const canApprove = ['gerente_comercial', 'administracion', 'asistente_ventas'].includes(session.user.rol)
  if (!canApprove) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const supabase = createServerClient()

  const { data: propuesta } = await supabase
    .from('propuestas')
    .select('*, clientes(nombre, empresa)')
    .eq('id', params.id)
    .single()

  if (!propuesta) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  if (propuesta.estado === 'aceptada') return NextResponse.json({ error: 'Ya aprobada' }, { status: 400 })

  // Mark propuesta as accepted
  await supabase.from('propuestas').update({ estado: 'aceptada', updated_at: new Date().toISOString() }).eq('id', params.id)

  // Create linked orden_venta
  const { data: ordenSeq } = await supabase
    .from('ordenes_venta')
    .select('numero')
    .order('numero', { ascending: false })
    .limit(1)
    .single()

  const siguienteNumero = ((ordenSeq?.numero ?? 0) as number) + 1

  const { data: orden, error: ordenErr } = await supabase
    .from('ordenes_venta')
    .insert({
      lead_id:            propuesta.lead_id ?? null,
      cliente_id:         propuesta.cliente_id,
      vendedor_id:        propuesta.vendedor_id,
      numero:             siguienteNumero,
      estado:             'pendiente_aprobacion',
      moneda:             propuesta.moneda ?? 'UYU',
      monto_total:        propuesta.monto_total ?? null,
      fecha_alta_prevista: propuesta.fecha_inicio ?? null,
      fecha_baja_prevista: propuesta.fecha_fin ?? null,
      notas:              `Generada automáticamente desde cotización ${propuesta.numero}`,
    })
    .select('id, numero')
    .single()

  if (ordenErr) return NextResponse.json({ error: ordenErr.message }, { status: 500 })

  // Update lead estado to ganado if linked
  if (propuesta.lead_id) {
    await supabase
      .from('leads')
      .update({ estado: 'ganado', updated_at: new Date().toISOString() })
      .eq('id', propuesta.lead_id)
  }

  return NextResponse.json({ ok: true, orden_id: orden.id, orden_numero: orden.numero })
}
