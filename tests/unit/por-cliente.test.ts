import { describe, it, expect } from 'vitest'
import { resumenPorCliente, totalColumna } from '@/lib/administracion/por-cliente'

const coca = { cliente_id: 'c1', agencia_id: null, moneda: 'UYU', clientes: { id: 'c1', nombre: 'Coca Cola', empresa: null } }
const banco = { cliente_id: 'c2', agencia_id: 'a1', moneda: 'USD', clientes: { id: 'c2', nombre: 'Banco', empresa: 'Banco SA' }, agencias: { id: 'a1', nombre: 'Agencia X' } }

const base = {
  ventas: [
    { id: 'v1', ...coca, monto_neto: 1000, monto_total: 1220, created_at: '2026-03-10T10:00:00Z' },
    { id: 'v2', ...coca, monto_neto: 500, monto_total: 610, created_at: '2025-12-10T10:00:00Z' }, // fuera
    { id: 'v3', ...banco, monto_neto: 300, monto_total: 366, created_at: '2026-05-01T10:00:00Z' },
  ],
  facturas: [
    { tipo: 'factura', estado: 'cobrada', fecha_emision: '2026-03-15', importe_total: 610, moneda: 'UYU', ordenes_venta: coca },
    { tipo: 'factura', estado: 'emitida', fecha_emision: '2026-04-15', fecha_vencimiento: '2026-05-15', importe_total: 610, moneda: 'UYU', ordenes_venta: coca },
    { tipo: 'nota_credito', estado: 'emitida', fecha_emision: '2026-04-20', importe_total: 100, moneda: 'UYU', ordenes_venta: coca },
    { tipo: 'factura', estado: 'emitida', fecha_emision: '2026-05-05', fecha_vencimiento: '2026-12-05', importe_total: 366, moneda: 'USD', ordenes_venta: banco },
    { tipo: 'factura', estado: 'prevista', importe_total: 200, moneda: 'USD', ordenes_venta: banco },
  ],
  pagos: [
    { monto: 590, fecha_pago: '2026-04-01', ordenes_venta: coca },
    { monto: 50, fecha_pago: '2025-11-01', ordenes_venta: coca }, // fuera
  ],
  desde: '2026-01', hasta: '2026-12', hoy: '2026-11-24',
}

describe('facturación y ventas por cliente', () => {
  it('por cliente: vendido, facturado (menos NC), cobrado, pendiente, vencido y a facturar', () => {
    const r = resumenPorCliente({ ...base, agrupar: 'cliente' })
    const c = r.find(f => f.clave === 'c1')!
    expect(c.nombre).toBe('Coca Cola')
    expect(c.ventas).toBe(1)
    expect(c.vendido).toEqual({ UYU: 1000 })
    expect(c.facturado).toEqual({ UYU: 1120 })   // 610 + 610 − 100
    expect(c.cobrado).toEqual({ UYU: 590 })
    expect(c.pendiente).toEqual({ UYU: 610 })
    expect(c.vencido).toEqual({ UYU: 610 })
    const b = r.find(f => f.clave === 'c2')!
    expect(b.nombre).toBe('Banco SA')
    expect(b.vendido).toEqual({ USD: 300 })
    expect(b.pendiente).toEqual({ USD: 366 })
    expect(b.vencido).toEqual({})
    expect(b.aFacturar).toEqual({ USD: 200 })
  })
  it('por agencia: lo directo va junto', () => {
    const r = resumenPorCliente({ ...base, agrupar: 'agencia' })
    expect(r.map(f => f.nombre).sort()).toEqual(['Agencia X', 'Directo (sin agencia)'])
    expect(totalColumna(r, 'facturado')).toEqual({ UYU: 1120, USD: 366 })
  })
  it('un período sin movimiento no muestra filas vacías salvo lo pendiente', () => {
    const r = resumenPorCliente({ ...base, desde: '2024-01', hasta: '2024-12', agrupar: 'cliente' })
    expect(r.every(f => Object.keys(f.vendido).length === 0 && Object.keys(f.facturado).length === 0)).toBe(true)
    expect(r.find(f => f.clave === 'c1')!.pendiente).toEqual({ UYU: 610 })
  })
})
