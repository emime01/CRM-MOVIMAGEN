import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { puedeAdministrarFacturas } from '@/lib/ventas/facturas'
import { comisionAgenciaDe, descuentoAgencia } from '@/lib/ventas/comision-agencia'

export const dynamic = 'force-dynamic'

/**
 * GET /api/facturas/[id]/comision-agencia
 *
 * Para el cobro de una factura de agencia: cuánto es la comisión, su IVA, lo
 * que se descuenta la agencia (comisión + IVA) y lo que entra (el neto).
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puedeAdministrarFacturas(session.user.rol)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const supabase = createServerClient()
  const { data: f } = await supabase.from('facturas').select('id, importe_total, moneda').eq('id', params.id).maybeSingle()
  if (!f) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })

  const com = await comisionAgenciaDe(supabase, params.id)
  if (!com) return NextResponse.json({ hay: false })
  const d = descuentoAgencia(com.monto)
  const total = Number(f.importe_total ?? 0)
  return NextResponse.json({
    hay: true,
    estado: com.estado,
    moneda: f.moneda ?? 'UYU',
    total_factura: total,
    comision: d.comision,
    iva: d.iva,
    descuento: d.total,
    neto: Math.round((total - d.total) * 100) / 100,
  })
}
