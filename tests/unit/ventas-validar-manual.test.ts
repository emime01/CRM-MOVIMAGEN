import { describe, it, expect, vi } from 'vitest'

// crear-venta-manual importa notificaciones/push (web-push); no se usan acá.
vi.mock('@/lib/notificaciones', () => ({ insertarNotificaciones: vi.fn() }))

import { validarVentaManual, type VentaManualPayload } from '@/lib/ventas/crear-venta-manual'

const payload = (o: Partial<VentaManualPayload> = {}): VentaManualPayload => ({
  clienteId: 'c1', moneda: 'UYU', estado: 'borrador', items: [], ...o,
})

describe('validarVentaManual', () => {
  it('venta directa válida', () => {
    expect(validarVentaManual(payload())).toBeNull()
  })
  it('falta el cliente', () => {
    expect(validarVentaManual(payload({ clienteId: '' }))).toMatch(/clienteId/)
  })
  it('falta la moneda', () => {
    expect(validarVentaManual(payload({ moneda: '' as any }))).toMatch(/moneda/)
  })
  describe('con agencia', () => {
    const conAg = (o: Partial<VentaManualPayload>) => payload({ agenciaId: 'ag1', ...o })
    it('exige las dos comisiones', () => {
      expect(validarVentaManual(conAg({}))).toMatch(/comisión de la agencia/)
      expect(validarVentaManual(conAg({ comisionAgenciaPct: 10 }))).toMatch(/comisión de la agencia/)
      expect(validarVentaManual(conAg({ comisionAgenciaProdPct: 5 }))).toMatch(/comisión de la agencia/)
    })
    it('0 vale: la agencia no comisiona', () => {
      expect(validarVentaManual(conAg({ comisionAgenciaPct: 0, comisionAgenciaProdPct: 0 }))).toBeNull()
    })
    it('10% y 5% son válidos; 100 es el tope', () => {
      expect(validarVentaManual(conAg({ comisionAgenciaPct: 10, comisionAgenciaProdPct: 5 }))).toBeNull()
      expect(validarVentaManual(conAg({ comisionAgenciaPct: 100, comisionAgenciaProdPct: 100 }))).toBeNull()
    })
    it('rechaza negativos, más de 100, NaN, Infinity y strings', () => {
      for (const malo of [-1, 100.01, Number.NaN, Infinity, '10' as any]) {
        expect(validarVentaManual(conAg({ comisionAgenciaPct: malo, comisionAgenciaProdPct: 5 }))).toMatch(/comisión de la agencia/)
        expect(validarVentaManual(conAg({ comisionAgenciaPct: 10, comisionAgenciaProdPct: malo }))).toMatch(/comisión de la agencia/)
      }
    })
  })
  it('sin agencia, las comisiones no se validan', () => {
    expect(validarVentaManual(payload({ comisionAgenciaPct: 999 }))).toBeNull()
  })
})
