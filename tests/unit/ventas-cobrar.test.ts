import { describe, it, expect } from 'vitest'
import {
  registrarCobroDeFactura, repartirComision, mesDeLiquidacion, PORCENTAJE_COMISION_VENDEDOR,
} from '@/lib/ventas/cobrar'

describe('repartirComision', () => {
  it('tasa de la planilla: 6,75%', () => expect(PORCENTAJE_COMISION_VENDEDOR).toBe(6.75))

  it('vendedor único: 6,75% del arrendamiento sin IVA', () => {
    expect(repartirComision(100000, 'v1', null)).toEqual([
      { vendedor_id: 'v1', monto_base: 100000, monto_comision: 6750, compartida_con: null },
    ])
  })
  it('redondea la comisión al centésimo', () => {
    // 1000,50 × 6,75% = 67,53375
    expect(repartirComision(1000.5, 'v1', null)[0].monto_comision).toBe(67.53)
  })
  it('venta compartida: mitad y mitad, y las mitades suman exacto', () => {
    const [t, c] = repartirComision(1000.5, 'v1', 'v2')
    expect(t.vendedor_id).toBe('v1')
    expect(c.vendedor_id).toBe('v2')
    expect(t.compartida_con).toBe('v2')
    expect(c.compartida_con).toBe('v1')
    expect(Math.round((t.monto_comision + c.monto_comision) * 100) / 100).toBe(67.53)
    expect(Math.round((t.monto_base + c.monto_base) * 100) / 100).toBe(1000.5)
    // El centavo que sobra va al titular.
    expect(t.monto_comision).toBe(33.77)
    expect(c.monto_comision).toBe(33.76)
  })
  it('compartida con montos pares: mitades iguales', () => {
    const [t, c] = repartirComision(200000, 'v1', 'v2')
    expect(t.monto_comision).toBe(6750)
    expect(c.monto_comision).toBe(6750)
    expect(t.monto_base).toBe(100000)
  })
  it('compartir con uno mismo es venta de un solo vendedor', () => {
    const r = repartirComision(100000, 'v1', 'v1')
    expect(r).toHaveLength(1)
    expect(r[0].compartida_con).toBeNull()
  })
  it('acepta otro porcentaje', () => {
    expect(repartirComision(50000, 'v1', null, 5)[0].monto_comision).toBe(2500)
  })
  it('base 0 → comisión 0', () => {
    expect(repartirComision(0, 'v1', null)[0].monto_comision).toBe(0)
  })
})

describe('mesDeLiquidacion', () => {
  it('es el primer día del mes del cobro', () => {
    expect(mesDeLiquidacion('2026-10-31')).toBe('2026-10-01')
    expect(mesDeLiquidacion('2026-11-01')).toBe('2026-11-01')
  })
})

// ── registrarCobroDeFactura con un Supabase de mentira ─────────────────────
type Escrituras = { tabla: string; op: 'update' | 'insert'; datos: any }[]

function fakeSupabase(cfg: {
  factura?: any | null
  cobradas?: any[]               // resultado del UPDATE condicional (CAS)
  comisionesPrevias?: any[]
  orden?: any
  pagoId?: string
}) {
  const escrituras: Escrituras = []
  const from = (tabla: string) => {
    let op: 'select' | 'update' | 'insert' = 'select'
    const q: any = {
      select: () => q, eq: () => q, neq: () => q, in: () => q, limit: () => q,
      update: (d: any) => { op = 'update'; escrituras.push({ tabla, op: 'update', datos: d }); return q },
      insert: (d: any) => { op = 'insert'; escrituras.push({ tabla, op: 'insert', datos: d }); return q },
      maybeSingle: async () => ({
        data: tabla === 'facturas' ? (cfg.factura ?? null) : tabla === 'ordenes_venta' ? (cfg.orden ?? null) : null, error: null,
      }),
      single: async () => ({ data: { id: cfg.pagoId ?? 'pago-1' }, error: null }),
      then: (ok: any, ko: any) => {
        let data: any = []
        if (tabla === 'facturas' && op === 'update') data = cfg.cobradas ?? [{ id: 'f1' }]
        if (tabla === 'comisiones' && op === 'select') data = cfg.comisionesPrevias ?? []
        return Promise.resolve({ data, error: null }).then(ok, ko)
      },
    }
    return q
  }
  return { client: { from } as any, escrituras }
}

const emitida = (o: any = {}) => ({
  id: 'f1', orden_id: 'o1', tipo: 'factura', estado: 'emitida', numero: 'A-3001',
  importe_total: 122000, importe_arrendamiento: 100000, moneda: 'UYU', ...o,
})

describe('registrarCobroDeFactura', () => {
  it('factura inexistente', async () => {
    const { client } = fakeSupabase({ factura: null })
    expect(await registrarCobroDeFactura(client, 'f1', { userId: 'u' })).toEqual({ ok: false, error: 'Factura no encontrada', comisionGenerada: false })
  })

  it.each(['prevista', 'cobrada', 'anulada'])('no cobra una factura en estado %s', async estado => {
    const { client, escrituras } = fakeSupabase({ factura: emitida({ estado }) })
    const r = await registrarCobroDeFactura(client, 'f1', { userId: 'u' })
    expect(r.ok).toBe(false)
    expect(escrituras).toHaveLength(0)
  })

  it('doble clic: si otro pedido ya la cobró (CAS vacío) no duplica pago ni comisión', async () => {
    const { client, escrituras } = fakeSupabase({ factura: emitida(), cobradas: [] })
    const r = await registrarCobroDeFactura(client, 'f1', { userId: 'u' })
    expect(r).toEqual({ ok: false, error: 'La factura ya se había cobrado', comisionGenerada: false })
    expect(escrituras.filter(e => e.tabla === 'pagos' || e.tabla === 'comisiones')).toHaveLength(0)
  })

  it('cobro total: pago por el importe total y comisión 6,75% sobre el arrendamiento', async () => {
    const { client, escrituras } = fakeSupabase({ factura: emitida(), orden: { vendedor_id: 'v1', vendedor_compartido_id: null } })
    const r = await registrarCobroDeFactura(client, 'f1', { userId: 'admin', fecha: '2026-11-05', metodo: 'transferencia' })
    expect(r).toEqual({ ok: true, comisionGenerada: true })

    const upd = escrituras.find(e => e.tabla === 'facturas' && e.op === 'update')!.datos
    expect(upd).toMatchObject({ estado: 'cobrada', fecha_cobro: '2026-11-05', metodo_cobro: 'transferencia', cobrada_por: 'admin' })

    const pago = escrituras.find(e => e.tabla === 'pagos')!.datos
    expect(pago).toMatchObject({ orden_id: 'o1', monto: 122000, fecha_pago: '2026-11-05', numero_factura: 'A-3001', metodo: 'transferencia' })

    const com = escrituras.find(e => e.tabla === 'comisiones')!.datos
    expect(com).toHaveLength(1)
    expect(com[0]).toMatchObject({
      vendedor_id: 'v1', monto_base: 100000, monto_comision: 6750, porcentaje: 6.75, moneda: 'UYU',
      mes_liquidacion: '2026-11-01', estado: 'pendiente', factura_id: 'f1', pago_id: 'pago-1', tipo: 'venta',
    })
  })

  it('cobro parcial / neto de la comisión de la agencia: el pago es lo que entró, la comisión sigue siendo sobre el arrendamiento', async () => {
    const { client, escrituras } = fakeSupabase({ factura: emitida(), orden: { vendedor_id: 'v1', vendedor_compartido_id: null } })
    // La agencia descontó 10% sobre arrendamiento: entran 112.000 de los 122.000.
    const r = await registrarCobroDeFactura(client, 'f1', { userId: 'admin', fecha: '2026-11-05', montoPagado: 112000 })
    expect(r.ok).toBe(true)
    expect(escrituras.find(e => e.tabla === 'pagos')!.datos.monto).toBe(112000)
    expect(escrituras.find(e => e.tabla === 'comisiones')!.datos[0].monto_comision).toBe(6750)
  })

  it('montoPagado 0 se respeta (no cae al total)', async () => {
    const { client, escrituras } = fakeSupabase({ factura: emitida(), orden: { vendedor_id: 'v1' } })
    await registrarCobroDeFactura(client, 'f1', { userId: 'admin', montoPagado: 0 })
    expect(escrituras.find(e => e.tabla === 'pagos')!.datos.monto).toBe(0)
  })

  it('venta compartida: dos comisiones que suman el total', async () => {
    const { client, escrituras } = fakeSupabase({ factura: emitida({ importe_arrendamiento: 1000.5 }), orden: { vendedor_id: 'v1', vendedor_compartido_id: 'v2' } })
    await registrarCobroDeFactura(client, 'f1', { userId: 'admin', fecha: '2026-11-05' })
    const com = escrituras.find(e => e.tabla === 'comisiones')!.datos
    expect(com).toHaveLength(2)
    expect(Math.round((com[0].monto_comision + com[1].monto_comision) * 100) / 100).toBe(67.53)
  })

  it('el mes de liquidación es el del cobro, no el de hoy', async () => {
    const { client, escrituras } = fakeSupabase({ factura: emitida(), orden: { vendedor_id: 'v1' } })
    await registrarCobroDeFactura(client, 'f1', { userId: 'admin', fecha: '2026-10-31' })
    expect(escrituras.find(e => e.tabla === 'comisiones')!.datos[0].mes_liquidacion).toBe('2026-10-01')
  })

  it('factura en dólares: la comisión queda en dólares', async () => {
    const { client, escrituras } = fakeSupabase({ factura: emitida({ moneda: 'USD', importe_arrendamiento: 2000, importe_total: 2440 }), orden: { vendedor_id: 'v1' } })
    await registrarCobroDeFactura(client, 'f1', { userId: 'admin', fecha: '2026-11-05' })
    const c = escrituras.find(e => e.tabla === 'comisiones')!.datos[0]
    expect(c.moneda).toBe('USD')
    expect(c.monto_comision).toBe(135)
  })

  it('nota de crédito: registra el pago pero no genera comisión', async () => {
    const { client, escrituras } = fakeSupabase({ factura: emitida({ tipo: 'nota_credito', importe_total: -12200, importe_arrendamiento: -10000 }), orden: { vendedor_id: 'v1' } })
    const r = await registrarCobroDeFactura(client, 'f1', { userId: 'admin' })
    expect(r).toEqual({ ok: true, comisionGenerada: false })
    expect(escrituras.some(e => e.tabla === 'comisiones')).toBe(false)
  })

  it('idempotente: si la factura ya tiene comisión no la repite', async () => {
    const { client, escrituras } = fakeSupabase({ factura: emitida(), comisionesPrevias: [{ id: 'c1' }], orden: { vendedor_id: 'v1' } })
    const r = await registrarCobroDeFactura(client, 'f1', { userId: 'admin' })
    expect(r).toEqual({ ok: true, comisionGenerada: false })
    expect(escrituras.some(e => e.tabla === 'comisiones')).toBe(false)
  })

  it('venta sin vendedor, o toda producción (arrendamiento 0): no hay comisión', async () => {
    const sinVendedor = fakeSupabase({ factura: emitida(), orden: { vendedor_id: null } })
    expect((await registrarCobroDeFactura(sinVendedor.client, 'f1', { userId: 'a' })).comisionGenerada).toBe(false)
    const soloProduccion = fakeSupabase({ factura: emitida({ importe_arrendamiento: 0 }), orden: { vendedor_id: 'v1' } })
    expect((await registrarCobroDeFactura(soloProduccion.client, 'f1', { userId: 'a' })).comisionGenerada).toBe(false)
  })

  it('error de lectura de la base se devuelve sin cobrar', async () => {
    const client: any = { from: () => { const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: null, error: { message: 'boom' } }) }; return q } }
    expect(await registrarCobroDeFactura(client, 'f1', { userId: 'u' })).toEqual({ ok: false, error: 'boom', comisionGenerada: false })
  })
})
