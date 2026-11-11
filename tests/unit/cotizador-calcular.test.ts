import { describe, it, expect } from 'vitest'
import {
  calcularItem, totales, salidasDefault, esImpuestoMTOP, etiquetaImpuesto, IVA_RATE,
  type SoportePrecio, type ItemPlan,
} from '@/lib/cotizador/calcular'
import { montosDeLinea } from '@/lib/ventas/montos-linea'

const base: SoportePrecio = {
  id: 's1', nombre: 'Bus', ubicacion: null, categoria: null, tipo_cotizador: 'estatico_bus',
  precio_semanal: 12000, tiene_iva: true, costo_produccion: 3500, impuestos_municipales: 0,
  impactos_mensuales: null, semanas_minimas: 4,
}
const item = (s: Partial<SoportePrecio>, o: Partial<ItemPlan> = {}): ItemPlan => ({
  soporte: { ...base, ...s }, semanas: 4, cantidad: 1, salidas: null, ...o,
})

describe('IVA', () => {
  it('es 22% (Uruguay)', () => expect(IVA_RATE).toBe(0.22))
})

describe('calcularItem: soporte estático gravado', () => {
  it('1 unidad, 4 semanas', () => {
    const c = calcularItem(item({}))
    expect(c.arr).toBe(48000)
    expect(c.ivaArr).toBeCloseTo(10560, 2)
    expect(c.prod).toBe(3500)
    expect(c.ivaProd).toBeCloseTo(770, 2)
    expect(c.mun).toBe(0)
    expect(c.tot).toBeCloseTo(48000 + 10560 + 3500 + 770, 2)
    expect(c.sem).toBe(4)
    expect(c.mul).toBe(1)
  })
  it('cantidad multiplica arrendamiento, producción e impuesto', () => {
    const c = calcularItem(item({ impuestos_municipales: 400 }, { cantidad: 2 }))
    expect(c.arr).toBe(96000)
    expect(c.prod).toBe(7000)
    expect(c.mun).toBe(400 * 4 * 2)
    expect(c.tot).toBeCloseTo(96000 + 21120 + 7000 + 1540 + 3200, 2)
  })
  it('por debajo del mínimo se cobra el mínimo de semanas', () => {
    const c = calcularItem(item({}, { semanas: 1 }))
    expect(c.sem).toBe(4)
    expect(c.arr).toBe(48000)
  })
  it('por encima del mínimo se cobran las semanas pedidas', () => {
    const c = calcularItem(item({}, { semanas: 8 }))
    expect(c.sem).toBe(8)
    expect(c.arr).toBe(96000)
  })
})

describe('calcularItem: IVA', () => {
  it('soporte exento: sin IVA sobre arrendamiento, pero la producción siempre lleva IVA', () => {
    const c = calcularItem(item({ tiene_iva: false }))
    expect(c.ivaArr).toBe(0)
    expect(c.ivaProd).toBeCloseTo(3500 * 0.22, 2)
    expect(c.tot).toBeCloseTo(48000 + 3500 * 1.22, 2)
  })
  it('sin costo de producción (null) no suma producción ni su IVA', () => {
    const c = calcularItem(item({ costo_produccion: null }))
    expect(c.prod).toBe(0)
    expect(c.ivaProd).toBe(0)
  })
})

describe('calcularItem: rutero con impuesto MTOP', () => {
  it('el impuesto va por semana, sin IVA', () => {
    const c = calcularItem(item(
      { tipo_cotizador: 'rutero', precio_semanal: 9000, tiene_iva: false, costo_produccion: 0, impuestos_municipales: 1500, semanas_minimas: 13 },
      { semanas: 13 },
    ))
    expect(c.arr).toBe(117000)
    expect(c.mun).toBe(19500)
    expect(c.tot).toBe(136500)
  })
  it('etiquetas del impuesto', () => {
    expect(esImpuestoMTOP('rutero')).toBe(true)
    expect(esImpuestoMTOP('led')).toBe(false)
    expect(esImpuestoMTOP(null)).toBe(false)
    expect(etiquetaImpuesto('rutero')).toBe('Imp. MTOP')
    expect(etiquetaImpuesto('medianera')).toBe('Imp. Mun.')
  })
})

describe('calcularItem: salidas (LED y circuito)', () => {
  it('salidas por defecto', () => {
    expect(salidasDefault({ ...base, tipo_cotizador: 'led' })).toBe(30)
    expect(salidasDefault({ ...base, tipo_cotizador: 'circuito' })).toBe(10)
    expect(salidasDefault(base)).toBeNull()
  })
  it('LED: 45 salidas sobre base 30 cobra 1,5×', () => {
    const c = calcularItem(item({ tipo_cotizador: 'led', precio_semanal: 20000, costo_produccion: 0 }, { salidas: 45 }))
    expect(c.mul).toBe(1.5)
    expect(c.arr).toBe(4 * 20000 * 1.5)
  })
  it('circuito: 5 salidas sobre base 10 cobra la mitad', () => {
    const c = calcularItem(item({ tipo_cotizador: 'circuito', precio_semanal: 8000, costo_produccion: 0 }, { salidas: 5 }))
    expect(c.mul).toBe(0.5)
    expect(c.arr).toBe(4 * 8000 * 0.5)
  })
  it('sin salidas el multiplicador es 1', () => {
    expect(calcularItem(item({ tipo_cotizador: 'led' }, { salidas: null })).mul).toBe(1)
  })
  it('las salidas no afectan a un soporte estático', () => {
    expect(calcularItem(item({}, { salidas: 60 })).mul).toBe(1)
  })
})

describe('calcularItem: impactos y CPM', () => {
  it('impactos = mensuales × semanas / 4,33 × cantidad × salidas', () => {
    const c = calcularItem(item({ tipo_cotizador: 'led', impactos_mensuales: 433000, costo_produccion: 0 }, { salidas: 45 }))
    expect(c.imp).toBe(600000) // 433000/4.33 = 100000 por semana × 4 × 1,5
  })
  it('CPM = total / impactos × 1000', () => {
    const c = calcularItem(item({ impactos_mensuales: 433000 }))
    expect(c.imp).toBe(400000)
    expect(c.cpm).toBeCloseTo((c.tot / 400000) * 1000, 6)
  })
  it('sin impactos el CPM es 0 (no Infinity)', () => {
    const c = calcularItem(item({ impactos_mensuales: null }))
    expect(c.imp).toBe(0)
    expect(c.cpm).toBe(0)
  })
})

describe('calcularItem: temporada alta', () => {
  const punta = { precio_semanal: 10000, precio_semanal_alta: 18000, semanas_minimas: 2, semanas_minimas_alta: 4, costo_produccion: 0 }
  it('arrancando en alta se cobra el mínimo de alta a precio de alta', () => {
    const c = calcularItem(item(punta, { semanas: 2, inicio: '2026-12-01' }))
    expect(c.sem).toBe(4)
    expect(c.arr).toBe(72000)
    expect(c.ivaArr).toBeCloseTo(72000 * 0.22, 2)
  })
  it('arrancando en baja rige el mínimo normal con semanas mezcladas', () => {
    const c = calcularItem(item(punta, { semanas: 4, inicio: '2026-11-24' }))
    expect(c.sem).toBe(4)
    expect(c.arr).toBe(10000 + 3 * 18000)
  })
})

describe('totales', () => {
  it('suma los resultados de cada línea', () => {
    const a = calcularItem(item({}))
    const b = calcularItem(item({ tiene_iva: false, impuestos_municipales: 100 }, { cantidad: 3 }))
    const t = totales([a, b])
    expect(t.arr).toBe(a.arr + b.arr)
    expect(t.prod).toBe(a.prod + b.prod)
    expect(t.mun).toBe(a.mun + b.mun)
    expect(t.tot).toBeCloseTo(a.tot + b.tot, 6)
  })
  it('lista vacía → ceros', () => {
    expect(totales([])).toEqual({ arr: 0, prod: 0, mun: 0, imp: 0, tot: 0 })
  })
})

describe('montosDeLinea (venta manual) coincide con el cotizador', () => {
  it('mismo total para una línea equivalente, sin descuento', () => {
    const s = { tiene_iva: true, costo_produccion: 3500, impuestos_municipales: 400 }
    const c = calcularItem(item({ impuestos_municipales: 400 }, { semanas: 6, cantidad: 3 }))
    const m = montosDeLinea({ precioUnitario: 12000, cantidad: 3, semanas: 6 }, s)
    expect(m.arr).toBeCloseTo(c.arr, 6)
    expect(m.ivaArr).toBeCloseTo(c.ivaArr, 6)
    expect(m.prod).toBeCloseTo(c.prod, 6)
    expect(m.ivaProd).toBeCloseTo(c.ivaProd, 6)
    expect(m.imp).toBeCloseTo(c.mun, 6)
    expect(m.total).toBeCloseTo(c.tot, 6)
  })
})
