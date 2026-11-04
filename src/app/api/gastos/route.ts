import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { haceAdministracion } from '@/lib/auth/roles'
import { hoyUY } from '@/lib/fechas'

const CATEGORIAS_GASTO = ['combustible', 'viáticos', 'entretenimiento', 'materiales', 'otros'] as const

/**
 * Cargar un gasto de tarjeta. La pantalla Gastos los mostraba pero no había
 * forma de cargarlos. Los lleva administración (Belén).
 *
 * La venta es opcional y se indica por su número (OIC); de ella sale el
 * vendedor, porque el gasto no guarda uno propio.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!haceAdministracion(session.user.rol)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  let body: { fecha?: string; monto?: number | string; categoria?: string; descripcion?: string; oic?: number | string | null }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const monto = Number(body.monto)
  if (!Number.isFinite(monto) || monto <= 0) return NextResponse.json({ error: 'Indicá el monto' }, { status: 400 })
  const fecha = typeof body.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.fecha) ? body.fecha : hoyUY()
  const categoria = (CATEGORIAS_GASTO as readonly string[]).includes(body.categoria ?? '') ? body.categoria! : 'otros'

  const supabase = createServerClient()
  let ordenId: string | null = null
  const oic = body.oic === null || body.oic === undefined || body.oic === '' ? null : Number(body.oic)
  if (oic !== null) {
    if (!Number.isInteger(oic)) return NextResponse.json({ error: 'El número de venta no es válido' }, { status: 400 })
    const { data: orden } = await supabase.from('ordenes_venta').select('id').eq('numero', oic).maybeSingle()
    if (!orden) return NextResponse.json({ error: `No existe la venta OIC #${oic}` }, { status: 404 })
    ordenId = orden.id
  }

  const { data, error } = await supabase
    .from('gastos_tarjeta')
    // mes y anio son obligatorios en la tabla (salen de la fecha), igual que
    // la descripción: si no se escribe, va la categoría.
    .insert({
      fecha, monto, categoria, orden_id: ordenId,
      mes: Number(fecha.slice(5, 7)), anio: Number(fecha.slice(0, 4)),
      descripcion: body.descripcion?.trim() || categoria,
    })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id }, { status: 201 })
}
