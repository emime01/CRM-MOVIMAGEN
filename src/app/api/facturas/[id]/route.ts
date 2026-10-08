import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { estaCerrada } from '@/lib/ventas/estados'
import { registrarCobroDeFactura } from '@/lib/ventas/cobrar'
import { registrarPromesa, cerrarSeguimiento } from '@/lib/ventas/cobranza'
import {
  calcularVencimiento, primerDiaDelMes, CONDICION_PAGO_POR_DEFECTO,
  puedePlanificar, puedeAdministrarFacturas,
} from '@/lib/ventas/facturas'

export const dynamic = 'force-dynamic'

const fechaValida = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const importe = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

/**
 * PATCH /api/facturas/[id]
 *
 *   { accion: 'editar', mes_pauta?, importe_*?, fecha_vencimiento?, notas? }
 *   { accion: 'emitir', numero, fecha_emision?, importe_*? }
 *   { accion: 'cobrar', fecha?, metodo? }
 *   { accion: 'anular', motivo? }
 *   { accion: 'promesa', fecha_pago_prometida | null, nota? }
 *
 * Una cuota prevista la ajusta quien planifica la venta. Una vez emitida es un
 * documento: sólo Administración la cobra, la anula o le corrige el
 * vencimiento.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: factura, error } = await supabase
    .from('facturas')
    .select('id, orden_id, estado, tipo, importe_total, ordenes_venta(vendedor_id, estado, condicion_pago_dias)')
    .eq('id', params.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!factura) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })

  const orden = (Array.isArray(factura.ordenes_venta) ? factura.ordenes_venta[0] : factura.ordenes_venta) as
    { vendedor_id: string | null; estado: string; condicion_pago_dias: number | null } | null
  const planifica = puedePlanificar(session.user.rol, session.user.id, orden?.vendedor_id ?? null)
  const administra = puedeAdministrarFacturas(session.user.rol)
  const ahora = new Date().toISOString()

  switch (body.accion) {
    case 'editar': {
      const updates: Record<string, unknown> = { updated_at: ahora }

      if (factura.estado === 'prevista') {
        if (!planifica && !administra) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
        if (body.mes_pauta !== undefined) {
          if (!fechaValida(body.mes_pauta)) return NextResponse.json({ error: 'Mes inválido' }, { status: 400 })
          updates.mes_pauta = primerDiaDelMes(body.mes_pauta)
        }
        for (const campo of ['importe_arrendamiento', 'importe_produccion', 'importe_total'] as const) {
          if (body[campo] === undefined) continue
          const v = importe(body[campo])
          if (v === null || v < 0) return NextResponse.json({ error: 'Importe inválido' }, { status: 400 })
          updates[campo] = v
        }
      } else if (factura.estado === 'emitida') {
        // Emitida ya es un documento: los importes no se tocan (para eso
        // está la nota de crédito). Administración puede corregir el
        // vencimiento y el mes de pauta, y anotar.
        if (!administra) return NextResponse.json({ error: 'La factura ya se emitió: sólo Administración la modifica' }, { status: 403 })
        if (body.fecha_vencimiento !== undefined) {
          if (!fechaValida(body.fecha_vencimiento)) return NextResponse.json({ error: 'Vencimiento inválido' }, { status: 400 })
          updates.fecha_vencimiento = body.fecha_vencimiento
        }
        if (body.mes_pauta !== undefined) {
          if (!fechaValida(body.mes_pauta)) return NextResponse.json({ error: 'Mes inválido' }, { status: 400 })
          updates.mes_pauta = primerDiaDelMes(body.mes_pauta)
        }
      } else {
        return NextResponse.json({ error: `Una factura ${factura.estado} no se edita` }, { status: 409 })
      }
      if (body.notas !== undefined) updates.notas = typeof body.notas === 'string' ? body.notas : null

      const { error: uErr } = await supabase.from('facturas').update(updates).eq('id', params.id)
      if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    case 'emitir': {
      if (!administra) return NextResponse.json({ error: 'Sólo Administración emite facturas' }, { status: 403 })
      if (factura.estado !== 'prevista') return NextResponse.json({ error: 'La cuota ya se emitió' }, { status: 409 })
      // Antes de la aprobación del gerente no hay nada que facturar.
      if (!estaCerrada(orden?.estado)) {
        return NextResponse.json({ error: 'La venta tiene que estar aprobada para facturarla' }, { status: 400 })
      }
      const numero = typeof body.numero === 'string' ? body.numero.trim() : ''
      if (!numero) return NextResponse.json({ error: 'Indicá el número de factura' }, { status: 400 })
      const fecha = fechaValida(body.fecha_emision) ? body.fecha_emision : ahora.slice(0, 10)
      const dias = orden?.condicion_pago_dias ?? CONDICION_PAGO_POR_DEFECTO

      const updates: Record<string, unknown> = {
        estado: 'emitida',
        numero,
        fecha_emision: fecha,
        fecha_vencimiento: calcularVencimiento(fecha, dias),
        emitida_por: session.user.id,
        updated_at: ahora,
      }
      // Al emitir se puede ajustar el importe: a veces se factura una parte y
      // el resto se corre de mes.
      for (const campo of ['importe_arrendamiento', 'importe_produccion', 'importe_total'] as const) {
        if (body[campo] === undefined) continue
        const v = importe(body[campo])
        if (v === null || v < 0) return NextResponse.json({ error: 'Importe inválido' }, { status: 400 })
        updates[campo] = v
      }

      const { data: emitidas, error: uErr } = await supabase
        .from('facturas').update(updates).eq('id', params.id).eq('estado', 'prevista').select('id')
      if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
      if (!emitidas?.length) return NextResponse.json({ error: 'La cuota ya se emitió' }, { status: 409 })

      await supabase.from('orden_historial').insert({
        orden_id: factura.orden_id,
        perfil_id: session.user.id,
        estado_nuevo: orden?.estado ?? null,
        comentario: `Facturada · ${numero}`,
      })
      return NextResponse.json({ ok: true, fecha_vencimiento: updates.fecha_vencimiento })
    }

    case 'cobrar': {
      if (!administra) return NextResponse.json({ error: 'Sólo Administración registra cobros' }, { status: 403 })
      const r = await registrarCobroDeFactura(supabase, params.id, {
        fecha: fechaValida(body.fecha) ? body.fecha : undefined,
        metodo: typeof body.metodo === 'string' && body.metodo.trim() ? body.metodo.trim() : undefined,
        userId: session.user.id,
      })
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 })

      await supabase.from('orden_historial').insert({
        orden_id: factura.orden_id,
        perfil_id: session.user.id,
        estado_nuevo: orden?.estado ?? null,
        comentario: `Cobrada${typeof body.metodo === 'string' && body.metodo ? ` · ${body.metodo}` : ''}`,
      })
      return NextResponse.json({ ok: true, comision_generada: r.comisionGenerada })
    }

    case 'anular': {
      if (!administra) return NextResponse.json({ error: 'Sólo Administración anula facturas' }, { status: 403 })
      if (factura.estado === 'cobrada') {
        return NextResponse.json({ error: 'Una factura cobrada no se anula: se corrige con una nota de crédito' }, { status: 409 })
      }
      if (factura.estado === 'anulada') return NextResponse.json({ ok: true })
      const motivo = typeof body.motivo === 'string' && body.motivo.trim() ? body.motivo.trim() : null
      const { error: uErr } = await supabase.from('facturas')
        .update({ estado: 'anulada', notas: motivo, updated_at: ahora })
        .eq('id', params.id)
      if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
      await cerrarSeguimiento(supabase, params.id)
      return NextResponse.json({ ok: true })
    }

    case 'promesa': {
      if (!administra) return NextResponse.json({ error: 'Sólo Administración registra promesas de pago' }, { status: 403 })
      if (factura.estado !== 'emitida') {
        return NextResponse.json({ error: 'La promesa de pago es para una factura emitida y no cobrada' }, { status: 409 })
      }
      const prometida = body.fecha_pago_prometida
      const fecha = prometida == null ? null : fechaValida(prometida) ? prometida : undefined
      if (fecha === undefined) return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
      // La promesa deja una gestión escrita y una tarea de Administración
      // para ese día, que se cierra sola cuando entra el cobro.
      const r = await registrarPromesa(supabase, params.id, fecha, {
        userId: session.user.id,
        nota: typeof body.nota === 'string' ? body.nota : null,
      })
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 409 })
      return NextResponse.json({ ok: true })
    }

    default:
      return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
  }
}
