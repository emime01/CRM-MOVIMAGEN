import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { hoyUY } from '@/lib/fechas'
import {
  armarPlanDeFacturas, calcularVencimiento, primerDiaDelMes,
  puedeVerFacturas, puedePlanificar, puedeAdministrarFacturas,
} from '@/lib/ventas/facturas'

export const dynamic = 'force-dynamic'

const CAMPOS = `id, orden_id, cuota, cuotas_total, mes_pauta, tipo, estado, numero, fecha_emision,
  importe_arrendamiento, importe_produccion, importe_total, moneda,
  fecha_vencimiento, fecha_pago_prometida, fecha_cobro, metodo_cobro, notas`

async function cargarOrden(supabase: ReturnType<typeof createServerClient>, id: string) {
  const { data, error } = await supabase
    .from('ordenes_venta')
    .select('id, vendedor_id, moneda, condicion_pago_dias, estado')
    .eq('id', id)
    .maybeSingle()
  return { orden: data, error }
}

/**
 * GET /api/ordenes/[id]/facturas
 *
 * Las cuotas y notas de crédito de la venta, con la condición de pago.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createServerClient()
  const { orden, error } = await cargarOrden(supabase, params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!orden) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })
  if (!puedeVerFacturas(session.user.rol, session.user.id, orden.vendedor_id)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { data, error: fErr } = await supabase
    .from('facturas')
    .select(CAMPOS)
    .eq('orden_id', params.id)
    .order('cuota')
    .order('tipo')
  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 })

  return NextResponse.json({
    facturas: data ?? [],
    condicion_pago_dias: orden.condicion_pago_dias,
    puede_planificar: puedePlanificar(session.user.rol, session.user.id, orden.vendedor_id),
    puede_administrar: puedeAdministrarFacturas(session.user.rol),
  })
}

/**
 * POST /api/ordenes/[id]/facturas
 *
 *   { accion: 'replanificar', cuotas }     rearma las cuotas previstas
 *   { accion: 'condicion', dias }          cambia la condición de pago
 *   { accion: 'nota_credito', ... }        agrega una nota de crédito
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { orden, error } = await cargarOrden(supabase, params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!orden) return NextResponse.json({ error: 'Orden no encontrada' }, { status: 404 })

  const planifica = puedePlanificar(session.user.rol, session.user.id, orden.vendedor_id)
  const administra = puedeAdministrarFacturas(session.user.rol)

  switch (body.accion) {
    case 'replanificar': {
      if (!planifica) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
      const cuotas = Number(body.cuotas)
      if (!Number.isInteger(cuotas) || cuotas < 1 || cuotas > 60) {
        return NextResponse.json({ error: 'La cantidad de cuotas tiene que estar entre 1 y 60' }, { status: 400 })
      }
      const r = await armarPlanDeFacturas(supabase, params.id, cuotas)
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 })
      return NextResponse.json({ ok: true, creadas: r.creadas })
    }

    case 'condicion': {
      if (!planifica && !administra) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
      const dias = Number(body.dias)
      if (!Number.isInteger(dias) || dias < 0 || dias > 365) {
        return NextResponse.json({ error: 'La condición de pago tiene que estar entre 0 y 365 días' }, { status: 400 })
      }
      const { error: uErr } = await supabase
        .from('ordenes_venta')
        .update({ condicion_pago_dias: dias, updated_at: new Date().toISOString() })
        .eq('id', params.id)
      if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })

      // La condición nueva vale para lo que se emita de acá en más. Correr el
      // vencimiento de lo ya emitido es cosa de Administración: si no, un
      // vendedor podía hacer que sus facturas vencidas parecieran al día.
      if (!administra) return NextResponse.json({ ok: true })

      // Las emitidas que todavía se deben vencen con la condición nueva.
      const { data: abiertas } = await supabase
        .from('facturas')
        .select('id, fecha_emision')
        .eq('orden_id', params.id)
        .eq('estado', 'emitida')
      for (const f of abiertas ?? []) {
        if (!f.fecha_emision) continue
        await supabase.from('facturas')
          .update({ fecha_vencimiento: calcularVencimiento(f.fecha_emision, dias), updated_at: new Date().toISOString() })
          .eq('id', f.id)
      }
      return NextResponse.json({ ok: true })
    }

    case 'nota_credito': {
      if (!administra) return NextResponse.json({ error: 'Sólo Administración emite notas de crédito' }, { status: 403 })
      const total = Number(body.importe_total)
      if (!Number.isFinite(total) || total === 0) {
        return NextResponse.json({ error: 'Indicá el importe de la nota de crédito' }, { status: 400 })
      }
      const numero = typeof body.numero === 'string' ? body.numero.trim() : ''
      if (!numero) return NextResponse.json({ error: 'Indicá el número de la nota de crédito' }, { status: 400 })
      const fecha = typeof body.fecha_emision === 'string' && body.fecha_emision ? body.fecha_emision : hoyUY()
      const mes = typeof body.mes_pauta === 'string' && body.mes_pauta ? primerDiaDelMes(body.mes_pauta) : primerDiaDelMes(fecha)
      // Una nota de crédito resta: se guarda en negativo aunque la carguen positiva.
      const neg = (v: unknown) => -Math.abs(Number(v) || 0)

      const { data, error: iErr } = await supabase.from('facturas').insert({
        orden_id: params.id,
        cuota: Number(body.cuota) || 1,
        cuotas_total: Number(body.cuotas_total) || 1,
        mes_pauta: mes,
        tipo: 'nota_credito',
        estado: 'emitida',
        numero,
        fecha_emision: fecha,
        importe_arrendamiento: neg(body.importe_arrendamiento),
        importe_produccion: neg(body.importe_produccion),
        importe_total: neg(total),
        moneda: orden.moneda ?? 'UYU',
        notas: typeof body.notas === 'string' ? body.notas : null,
        emitida_por: session.user.id,
      }).select('id').single()
      if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 })
      return NextResponse.json({ ok: true, id: data.id }, { status: 201 })
    }

    default:
      return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  }
}
