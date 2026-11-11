import { describe, it, expect } from 'vitest'
import { registrarComisionAgencia, comisionAgenciaDe } from '@/lib/ventas/comision-agencia'

function fakeSupabase(factura: any | null, comisionRow: any | null = null) {
  const upserts: { datos: any; opts: any }[] = []
  const from = (tabla: string) => {
    const q: any = {
      select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: tabla === 'facturas' ? factura : comisionRow, error: null }),
      upsert: async (datos: any, opts: any) => { upserts.push({ datos, opts }); return { error: null } },
    }
    return q
  }
  return { client: { from } as any, upserts }
}

const fila = (o: any = {}, orden: any = {}) => ({
  id: 'f1', orden_id: 'o1', tipo: 'factura', moneda: 'UYU', importe_arrendamiento: 100000, importe_produccion: 20000,
  ordenes_venta: { agencia_id: 'ag1', comision_agencia_pct: 10, comision_agencia_prod_pct: 5, ...orden }, ...o,
})

describe('registrarComisionAgencia', () => {
  it('% sobre arrendamiento + % sobre producción, sin IVA', async () => {
    const { client, upserts } = fakeSupabase(fila())
    await registrarComisionAgencia(client, 'f1')
    expect(upserts).toHaveLength(1)
    expect(upserts[0].datos).toMatchObject({
      factura_id: 'f1', orden_id: 'o1', agencia_id: 'ag1',
      base_arr: 100000, base_prod: 20000, pct_arr: 10, pct_prod: 5, monto: 11000, moneda: 'UYU',
    })
    expect(upserts[0].opts).toEqual({ onConflict: 'factura_id', ignoreDuplicates: false })
  })
  it('una cuota comisiona sobre sus importes, no sobre los de la venta entera', async () => {
    const { client, upserts } = fakeSupabase(fila({ importe_arrendamiento: 33333.33, importe_produccion: 0 }))
    await registrarComisionAgencia(client, 'f1')
    expect(upserts[0].datos.monto).toBe(3333.33)
  })
  it('nota de crédito: comisión negativa', async () => {
    const { client, upserts } = fakeSupabase(fila({ tipo: 'nota_credito', importe_arrendamiento: -50000, importe_produccion: 0 }))
    await registrarComisionAgencia(client, 'f1')
    expect(upserts[0].datos.monto).toBe(-5000)
  })
  it('acepta ordenes_venta como arreglo (join de PostgREST)', async () => {
    const f = fila(); f.ordenes_venta = [f.ordenes_venta] as any
    const { client, upserts } = fakeSupabase(f)
    await registrarComisionAgencia(client, 'f1')
    expect(upserts[0].datos.monto).toBe(11000)
  })
  it('conserva la moneda de la factura', async () => {
    const { client, upserts } = fakeSupabase(fila({ moneda: 'USD', importe_arrendamiento: 2000, importe_produccion: 0 }))
    await registrarComisionAgencia(client, 'f1')
    expect(upserts[0].datos).toMatchObject({ moneda: 'USD', monto: 200 })
  })
  it('sin agencia (venta directa): no registra nada', async () => {
    const { client, upserts } = fakeSupabase(fila({}, { agencia_id: null }))
    await registrarComisionAgencia(client, 'f1')
    expect(upserts).toHaveLength(0)
  })
  it('comisión pactada en 0: no registra nada', async () => {
    const { client, upserts } = fakeSupabase(fila({}, { comision_agencia_pct: 0, comision_agencia_prod_pct: 0 }))
    await registrarComisionAgencia(client, 'f1')
    expect(upserts).toHaveLength(0)
  })
  it('factura inexistente: no hace nada', async () => {
    const { client, upserts } = fakeSupabase(null)
    await registrarComisionAgencia(client, 'f1')
    expect(upserts).toHaveLength(0)
  })
  it('porcentajes null cuentan como 0', async () => {
    const { client, upserts } = fakeSupabase(fila({}, { comision_agencia_pct: null, comision_agencia_prod_pct: 5 }))
    await registrarComisionAgencia(client, 'f1')
    expect(upserts[0].datos).toMatchObject({ pct_arr: 0, monto: 1000 })
  })
})

describe('comisionAgenciaDe', () => {
  it('devuelve id, monto numérico y estado', async () => {
    const { client } = fakeSupabase(null, { id: 'c1', monto: '11000.50', estado: 'pendiente' })
    expect(await comisionAgenciaDe(client, 'f1')).toEqual({ id: 'c1', monto: 11000.5, estado: 'pendiente' })
  })
  it('sin comisión → null', async () => {
    const { client } = fakeSupabase(null, null)
    expect(await comisionAgenciaDe(client, 'f1')).toBeNull()
  })
})
