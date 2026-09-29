import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { recalcularObjetivos } from '@/lib/objetivos/recalcular'

const ALLOWED_ROLES = ['asistente_ventas', 'gerente_comercial', 'administracion']

/**
 * POST /api/objetivos/asignar
 *
 * Asigna (o cambia) el vendedor de uno o varios clientes y recalcula los
 * objetivos del año.
 *
 * Existe porque la asignación sólo se podía hacer importando el Excel: si un
 * cliente quedaba sin dueño —o cambiaba de vendedor— no había forma de
 * arreglarlo desde el CRM, y sus objetivos no sumaban para nadie.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!ALLOWED_ROLES.includes(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  let body: { asignaciones?: { clienteId: string; vendedorId: string | null }[]; year?: number }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const asignaciones = body.asignaciones ?? []
  if (asignaciones.length === 0) {
    return NextResponse.json({ error: 'No hay asignaciones para guardar' }, { status: 400 })
  }

  const year = body.year ?? new Date().getFullYear()
  const supabase = createServerClient()

  // Validar que los vendedores existan y sean del área comercial, para no
  // dejar el objetivo colgado de un id que no corresponde.
  const idsVendedor = Array.from(new Set(asignaciones.map(a => a.vendedorId).filter(Boolean))) as string[]
  if (idsVendedor.length > 0) {
    const { data: validos } = await supabase
      .from('perfiles')
      .select('id')
      .in('id', idsVendedor)
      .in('rol', ['vendedor', 'asistente_ventas', 'gerente_comercial'])
    const setValidos = new Set((validos ?? []).map(v => v.id))
    const invalido = idsVendedor.find(id => !setValidos.has(id))
    if (invalido) {
      return NextResponse.json({ error: 'Alguno de los vendedores no existe o no es del área comercial' }, { status: 400 })
    }
  }

  let actualizados = 0
  for (const { clienteId, vendedorId } of asignaciones) {
    if (!clienteId) continue
    // El dueño se guarda en el cliente y se replica en su objetivo del año,
    // que es lo que después se suma por vendedor.
    const [{ error: errCli }, { error: errObj }] = await Promise.all([
      supabase.from('clientes').update({ vendedor_id: vendedorId, updated_at: new Date().toISOString() }).eq('id', clienteId),
      supabase.from('cliente_objetivos').update({ vendedor_id: vendedorId, updated_at: new Date().toISOString() }).eq('cliente_id', clienteId).eq('year', year),
    ])
    if (!errCli && !errObj) actualizados++
  }

  const resumen = await recalcularObjetivos(supabase, year)

  return NextResponse.json({
    ok: true,
    actualizados,
    vendedores_con_objetivo: resumen.vendedores,
    clientes_sin_vendedor: resumen.sinVendedor,
  })
}
