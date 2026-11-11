import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { estaCerrada } from '@/lib/ventas/estados'
import { registrarCobroDeFactura } from '@/lib/ventas/cobrar'
import { registrarPromesa, cerrarSeguimiento } from '@/lib/ventas/cobranza'
import { hoyUY } from '@/lib/fechas'
import { cotizacionDolar } from '@/lib/bcu'
import { registrarComisionAgencia, comisionAgenciaDe, descuentoAgencia as descuentoAgencia_ } from '@/lib/ventas/comision-agencia'
import {
  calcularVencimiento, primerDiaDelMes, CONDICION_PAGO_POR_DEFECTO,
  puedePlanificar, puedeAdministrarFacturas,
} from '@/lib/ventas/facturas'

export const dynamic = 'force-dynamic'

/**
 * Arrendamiento + producción (sin IVA) no puede pasar el total facturado,
 * que es eso más IVA. Es lo que impide inflar la base de la comisión.
 */
function importesInconsistentes(
  actual: { importe_arrendamiento: unknown; importe_produccion: unknown; importe_total: unknown },
  updates: Record<string, unknown>,
): string | null {
  const v = (k: 'importe_arrendamiento' | 'importe_produccion' | 'importe_total') =>
    Number(updates[k] !== undefined ? updates[k] : actual[k] ?? 0)
  if (v('importe_arrendamiento') + v('importe_produccion') > v('importe_total') + 0.01) {
    return 'Arrendamiento más producción (sin IVA) no puede ser mayor que el total de la cuota'
  }
  return null
}

const fechaValida = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
const importe = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

/**
 * PATCH /api/facturas/[id]
 *
 *   { accion: 'editar', mes_pauta?, importe_*?, fecha_vencimiento?, notas? }
 *   { accion: 'emitir', numero, fecha_emision?, importe_*?, cotizacion? }   (cotizacion: sólo USD)
 *   { accion: 'cobrar', fecha?, metodo?, monto?, descuenta_agencia? }
 *       monto < total: cobro parcial · descuenta_agencia: pagó el neto de la comisión de la agencia
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
    .select('id, orden_id, estado, tipo, cuota, mes_pauta, moneda, importe_total, importe_arrendamiento, importe_produccion, ordenes_venta(vendedor_id, estado, condicion_pago_dias)')
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
        const tocaImportes = ['importe_arrendamiento', 'importe_produccion', 'importe_total'].some(c => body[c] !== undefined)
        // Con la venta aprobada, los importes los ajusta Administración: el
        // arrendamiento de la cuota es la base de la comisión del vendedor.
        if (tocaImportes && !administra && estaCerrada(orden?.estado)) {
          return NextResponse.json({ error: 'La venta ya está aprobada: los importes de las cuotas los ajusta Administración' }, { status: 403 })
        }
        for (const campo of ['importe_arrendamiento', 'importe_produccion', 'importe_total'] as const) {
          if (body[campo] === undefined) continue
          const v = importe(body[campo])
          if (v === null || v < 0) return NextResponse.json({ error: 'Importe inválido' }, { status: 400 })
          updates[campo] = v
        }
        // Sólo si se tocan: lo migrado de antes puede no cumplirlo y no por eso
        // hay que trabar cambiar el mes.
        const err = tocaImportes ? importesInconsistentes(factura, updates) : null
        if (err) return NextResponse.json({ error: err }, { status: 400 })
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
      const fecha = fechaValida(body.fecha_emision) ? body.fecha_emision : hoyUY()
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
      // Si sólo cambió el total, arrendamiento y producción bajan en la misma
      // proporción: si no, la comisión y el canon seguían sobre la cuota
      // entera aunque se facturara la mitad.
      const totalAntes = Number(factura.importe_total ?? 0)
      const totalNuevo = updates.importe_total !== undefined ? Number(updates.importe_total) : totalAntes
      if (totalNuevo !== totalAntes && totalAntes > 0
          && updates.importe_arrendamiento === undefined && updates.importe_produccion === undefined) {
        const k = totalNuevo / totalAntes
        updates.importe_arrendamiento = Math.round(Number(factura.importe_arrendamiento ?? 0) * k * 100) / 100
        updates.importe_produccion = Math.round(Number(factura.importe_produccion ?? 0) * k * 100) / 100
      }
      const tocaImportes = ['importe_arrendamiento', 'importe_produccion', 'importe_total'].some(c => updates[c] !== undefined)
      const errImp = tocaImportes ? importesInconsistentes(factura, updates) : null
      if (errImp) return NextResponse.json({ error: errImp }, { status: 400 })

      // En dólares, la cotización del día de la factura (la que eligió
      // Administración o, si no vino, la del BCU): el canon se paga en pesos.
      if (factura.moneda === 'USD') {
        const c = importe(body.cotizacion)
        if (c && c > 0) updates.cotizacion = c
        else {
          const bcu = await cotizacionDolar(fecha)
          if (bcu) updates.cotizacion = bcu.valor
        }
      }

      let { data: emitidas, error: uErr } = await supabase
        .from('facturas').update(updates).eq('id', params.id).eq('estado', 'prevista').select('id')
      if (uErr && updates.cotizacion !== undefined && /cotizacion/.test(uErr.message)) {
        // Sin la migración v49 todavía: se factura igual, sin guardar la cotización.
        delete updates.cotizacion
        ;({ data: emitidas, error: uErr } = await supabase
          .from('facturas').update(updates).eq('id', params.id).eq('estado', 'prevista').select('id'))
      }
      if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
      if (!emitidas?.length) return NextResponse.json({ error: 'La cuota ya se emitió' }, { status: 409 })

      // Lo que no se facturó queda en una cuota nueva, el mes siguiente.
      let resto: number | null = null
      if (factura.tipo === 'factura' && totalNuevo < totalAntes) {
        resto = Math.round((totalAntes - totalNuevo) * 100) / 100
        const { data: todas } = await supabase
          .from('facturas').select('cuota').eq('orden_id', factura.orden_id).eq('tipo', 'factura')
        const nueva = Math.max(0, ...(todas ?? []).map(t => Number(t.cuota))) + 1
        await supabase.from('facturas').insert({
          orden_id: factura.orden_id,
          cuota: nueva,
          cuotas_total: nueva,
          mes_pauta: primerDiaDelMes(factura.mes_pauta, 1),
          tipo: 'factura',
          estado: 'prevista',
          importe_arrendamiento: Math.round((Number(factura.importe_arrendamiento ?? 0) - Number(updates.importe_arrendamiento ?? factura.importe_arrendamiento ?? 0)) * 100) / 100,
          importe_produccion: Math.round((Number(factura.importe_produccion ?? 0) - Number(updates.importe_produccion ?? factura.importe_produccion ?? 0)) * 100) / 100,
          importe_total: resto,
          moneda: factura.moneda ?? 'UYU',
          notas: `Resto de la cuota ${factura.cuota}`,
        })
        await supabase.from('facturas').update({ cuotas_total: nueva }).eq('orden_id', factura.orden_id).eq('tipo', 'factura')
      }

      // La comisión de la agencia se registra al facturar.
      await registrarComisionAgencia(supabase, params.id).catch(() => {})

      await supabase.from('orden_historial').insert({
        orden_id: factura.orden_id,
        perfil_id: session.user.id,
        estado_nuevo: orden?.estado ?? null,
        comentario: `Facturada · ${numero}${resto ? ` (parcial; el resto pasa a una cuota nueva)` : ''}${updates.cotizacion ? ` · cotización ${updates.cotizacion}` : ''}`,
      })
      return NextResponse.json({ ok: true, fecha_vencimiento: updates.fecha_vencimiento, resto })
    }

    case 'cobrar': {
      if (!administra) return NextResponse.json({ error: 'Sólo Administración registra cobros' }, { status: 403 })

      // Cobro parcial: la factura se parte en dos. Lo cobrado queda en esta
      // fila (y la comisión sale sobre esa parte); el saldo pasa a una fila
      // nueva con el mismo número, emitida y con el mismo vencimiento.
      const total = Number(factura.importe_total ?? 0)

      // La agencia se descontó su comisión del pago: pagó el neto. La factura
      // queda cobrada entera (no queda saldo) y la comisión, "descontada"
      // (no se le debe nada a la agencia).
      // monto = lo que se descontó la agencia (comisión + IVA).
      let descuentoAgencia: { id: string; monto: number } | null = null
      if (body.descuenta_agencia === true) {
        const com = await comisionAgenciaDe(supabase, params.id)
        if (!com) return NextResponse.json({ error: 'Esta factura no tiene comisión de agencia registrada' }, { status: 409 })
        if (com.estado === 'pagada') return NextResponse.json({ error: 'La comisión de esta factura ya se le pagó a la agencia' }, { status: 409 })
        // La agencia se descuenta la comisión MÁS el IVA.
        const d = descuentoAgencia_(com.monto)
        if (d.total >= total) return NextResponse.json({ error: 'La comisión de la agencia con IVA no puede ser mayor que la factura' }, { status: 409 })
        descuentoAgencia = { id: com.id, monto: d.total }
      }

      const monto = !descuentoAgencia && body.monto !== undefined && body.monto !== null && body.monto !== '' ? importe(body.monto) : null
      let saldoId: string | null = null
      if (monto !== null) {
        if (factura.tipo !== 'factura' || factura.estado !== 'emitida') {
          return NextResponse.json({ error: 'El cobro parcial es para una factura emitida' }, { status: 409 })
        }
        if (monto <= 0 || monto > total + 0.005) {
          return NextResponse.json({ error: 'El importe cobrado tiene que ser mayor que 0 y no pasar el total de la factura' }, { status: 400 })
        }
      }
      if (monto !== null && monto < total - 0.005) {
        const { data: completa } = await supabase.from('facturas').select('*').eq('id', params.id).maybeSingle()
        if (!completa) return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 })
        const k = monto / total
        const r2 = (n: unknown) => Math.round(Number(n ?? 0) * 100) / 100
        const arrCobrado = r2(Number(completa.importe_arrendamiento ?? 0) * k)
        const prodCobrado = r2(Number(completa.importe_produccion ?? 0) * k)
        const { id: _id, created_at: _c, updated_at: _u, ...resto } = completa as Record<string, unknown>
        const { data: saldo, error: sErr } = await supabase.from('facturas').insert({
          ...resto,
          estado: 'emitida',
          importe_total: r2(total - monto),
          importe_arrendamiento: r2(Number(completa.importe_arrendamiento ?? 0) - arrCobrado),
          importe_produccion: r2(Number(completa.importe_produccion ?? 0) - prodCobrado),
          notas: `Saldo de la factura ${completa.numero ?? ''} (cobro parcial de ${monto})`.trim(),
        }).select('id').single()
        if (sErr || !saldo) return NextResponse.json({ error: sErr?.message ?? 'No se pudo registrar el saldo' }, { status: 500 })
        saldoId = saldo.id
        const { error: pErr } = await supabase.from('facturas').update({
          importe_total: monto, importe_arrendamiento: arrCobrado, importe_produccion: prodCobrado, updated_at: ahora,
        }).eq('id', params.id).eq('estado', 'emitida')
        if (pErr) {
          await supabase.from('facturas').delete().eq('id', saldoId)
          return NextResponse.json({ error: pErr.message }, { status: 500 })
        }
      }

      const fechaCobro = fechaValida(body.fecha) ? body.fecha : undefined
      const r = await registrarCobroDeFactura(supabase, params.id, {
        fecha: fechaCobro,
        metodo: typeof body.metodo === 'string' && body.metodo.trim() ? body.metodo.trim() : undefined,
        userId: session.user.id,
        montoPagado: descuentoAgencia ? Math.round((total - descuentoAgencia.monto) * 100) / 100 : undefined,
      })
      if (!r.ok) {
        // Si no se pudo cobrar, se deshace la partición.
        if (saldoId) {
          await supabase.from('facturas').update({
            importe_total: factura.importe_total, importe_arrendamiento: factura.importe_arrendamiento,
            importe_produccion: factura.importe_produccion,
          }).eq('id', params.id)
          await supabase.from('facturas').delete().eq('id', saldoId)
        }
        return NextResponse.json({ error: r.error }, { status: 409 })
      }

      if (descuentoAgencia) {
        await supabase.from('comisiones_agencia')
          .update({ estado: 'descontada', fecha_pago: fechaCobro ?? hoyUY(), updated_at: ahora })
          .eq('id', descuentoAgencia.id)
      }

      await supabase.from('orden_historial').insert({
        orden_id: factura.orden_id,
        perfil_id: session.user.id,
        estado_nuevo: orden?.estado ?? null,
        comentario: `Cobrada${saldoId ? ` en parte (${monto} de ${total})` : ''}${descuentoAgencia ? ` · la agencia descontó su comisión + IVA (${descuentoAgencia.monto}); entró ${Math.round((total - descuentoAgencia.monto) * 100) / 100}` : ''}${typeof body.metodo === 'string' && body.metodo ? ` · ${body.metodo}` : ''}`,
      })
      return NextResponse.json({ ok: true, comision_generada: r.comisionGenerada, saldo_id: saldoId })
    }

    case 'deshacer_cobro': {
      // Un cobro cargado por error (otra factura, otro importe): vuelve a
      // emitida y se borran el pago y la comisión que generó, si la comisión
      // todavía no se liquidó ni pagó.
      if (!administra) return NextResponse.json({ error: 'Sólo Administración corrige cobros' }, { status: 403 })
      if (factura.estado !== 'cobrada') return NextResponse.json({ error: 'La factura no está cobrada' }, { status: 409 })
      const { data: comisiones } = await supabase.from('comisiones').select('id, estado, pago_id').eq('factura_id', params.id)
      if ((comisiones ?? []).some((c: any) => c.estado === 'liquidada' || c.estado === 'pagada')) {
        return NextResponse.json({ error: 'La comisión de este cobro ya se liquidó: no se puede deshacer desde acá' }, { status: 409 })
      }
      const pagoIds = (comisiones ?? []).map((c: any) => c.pago_id).filter(Boolean)
      if (comisiones?.length) await supabase.from('comisiones').delete().eq('factura_id', params.id)
      if (pagoIds.length) await supabase.from('pagos').delete().in('id', pagoIds)
      const { error: uErr } = await supabase.from('facturas').update({
        estado: 'emitida', fecha_cobro: null, metodo_cobro: null, cobrada_por: null, updated_at: ahora,
      }).eq('id', params.id).eq('estado', 'cobrada')
      if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
      // Si la agencia se había descontado la comisión en ese cobro, vuelve a pendiente.
      await supabase.from('comisiones_agencia').update({ estado: 'pendiente', fecha_pago: null, updated_at: ahora })
        .eq('factura_id', params.id).eq('estado', 'descontada')
      await supabase.from('orden_historial').insert({
        orden_id: factura.orden_id,
        perfil_id: session.user.id,
        estado_nuevo: orden?.estado ?? null,
        comentario: 'Cobro deshecho: la factura vuelve a emitida',
      })
      return NextResponse.json({ ok: true })
    }

    case 'anular': {
      if (!administra) return NextResponse.json({ error: 'Sólo Administración anula facturas' }, { status: 403 })
      if (factura.estado === 'cobrada') {
        return NextResponse.json({ error: 'Una factura cobrada no se anula: se corrige con una nota de crédito' }, { status: 409 })
      }
      if (factura.estado === 'anulada') return NextResponse.json({ ok: true })
      const motivo = typeof body.motivo === 'string' && body.motivo.trim() ? body.motivo.trim() : null
      // CAS: si entró un cobro entre la lectura y acá, no se anula lo cobrado.
      const { data: anuladas, error: uErr } = await supabase.from('facturas')
        .update({ estado: 'anulada', notas: motivo, updated_at: ahora })
        .eq('id', params.id)
        .in('estado', ['prevista', 'emitida'])
        .select('id')
      if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
      if (!anuladas?.length) return NextResponse.json({ error: 'La factura cambió mientras tanto (¿se cobró?). Recargá la página.' }, { status: 409 })
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
