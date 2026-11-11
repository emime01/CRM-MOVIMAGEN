import { describe, it, expect } from 'vitest'
import { montosDeLinea, sumarMontos, redondear } from '@/lib/ventas/montos-linea'

const medianera = { tiene_iva: true, costo_produccion: 2000, impuestos_municipales: 500 }

describe('montosDeLinea', () => {
  it('con descuento, IVA, producción e impuesto', () => {
    const m = montosDeLinea({ precioUnitario: 8000, cantidad: 3, semanas: 4, descuentoPct: 10 }, medianera)
    expect(m.arr).toBeCloseTo(86400, 2)        // 8000×3×4×0,9
    expect(m.ivaArr).toBeCloseTo(19008, 2)     // 22%
    expect(m.prod).toBe(6000)
    expect(m.ivaProd).toBeCloseTo(1320, 2)
    expect(m.imp).toBe(6000)                   // 500×4×3, sin IVA
    expect(m.total).toBeCloseTo(118728, 2)
  })
  it('soporte exento: sin IVA de arrendamiento', () => {
    const m = montosDeLinea({ precioUnitario: 5000, cantidad: 1, semanas: 2 }, { ...medianera, tiene_iva: false })
    expect(m.ivaArr).toBe(0)
    expect(m.ivaProd).toBeCloseTo(440, 2)
  })
  it('producción por unidad 0 = renovación: no se vuelve a producir', () => {
    const m = montosDeLinea({ precioUnitario: 5000, cantidad: 2, semanas: 2, produccionUnitario: 0 }, medianera)
    expect(m.prod).toBe(0)
    expect(m.ivaProd).toBe(0)
  })
  it('producción por unidad explícita pisa la del catálogo', () => {
    const m = montosDeLinea({ precioUnitario: 5000, cantidad: 2, semanas: 1, produccionUnitario: 1250 }, medianera)
    expect(m.prod).toBe(2500)
  })
  it('sin soporte en catálogo: sólo el arrendamiento', () => {
    const m = montosDeLinea({ precioUnitario: 1000, cantidad: 2, semanas: 3 }, null)
    expect(m).toEqual({ arr: 6000, ivaArr: 0, prod: 0, ivaProd: 0, imp: 0, total: 6000 })
  })
  it('cantidad/semanas negativas o NaN se tratan como 0', () => {
    const m = montosDeLinea({ precioUnitario: 1000, cantidad: -2, semanas: Number.NaN }, medianera)
    expect(m.total).toBe(0)
  })
})

describe('sumarMontos / redondear', () => {
  it('suma campo a campo', () => {
    const a = montosDeLinea({ precioUnitario: 1000, cantidad: 1, semanas: 1 }, medianera)
    const b = montosDeLinea({ precioUnitario: 2000, cantidad: 1, semanas: 1 }, null)
    const s = sumarMontos([a, b])
    expect(s.arr).toBe(3000)
    expect(s.total).toBeCloseTo(a.total + b.total, 6)
  })
  it('redondea a centésimos', () => {
    expect(redondear(10.126)).toBe(10.13)
    expect(redondear(0.1 + 0.2)).toBe(0.3)
  })
})
