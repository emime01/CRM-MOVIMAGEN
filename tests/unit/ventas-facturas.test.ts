import { describe, it, expect } from 'vitest'
import {
  planDeCuotas, primerDiaDelMes, calcularVencimiento, puedeVerFacturas, puedePlanificar,
  puedeAdministrarFacturas, CONDICION_PAGO_POR_DEFECTO,
} from '@/lib/ventas/facturas'
import { diasDeAtraso, tramoDe } from '@/lib/ventas/cobranza'
import { estaCerrada, ESTADOS_VENTA } from '@/lib/ventas/estados'

const plan = (o: Partial<Parameters<typeof planDeCuotas>[0]> = {}) =>
  planDeCuotas({ cuotas: 3, desde: '2026-11-20', total: 122000, arrendamiento: 100000, produccion: 0, moneda: 'UYU', ...o })

describe('planDeCuotas', () => {
  it('reparte en cuotas mensuales y la última absorbe el redondeo', () => {
    const p = plan()
    expect(p.map(c => c.importe_total)).toEqual([40666.66, 40666.66, 40666.68])
    expect(p.map(c => c.importe_arrendamiento)).toEqual([33333.33, 33333.33, 33333.34])
    expect(p.map(c => c.cuota)).toEqual([1, 2, 3])
    expect(p.every(c => c.cuotas_total === 3)).toBe(true)
  })
  it('la suma de las cuotas es exactamente el total', () => {
    const p = plan({ cuotas: 7, total: 987654.32, arrendamiento: 800000.01, produccion: 50000.5 })
    const suma = (k: 'importe_total' | 'importe_arrendamiento' | 'importe_produccion') =>
      Math.round(p.reduce((t, c) => t + c[k], 0) * 100) / 100
    expect(suma('importe_total')).toBe(987654.32)
    expect(suma('importe_arrendamiento')).toBe(800000.01)
    expect(suma('importe_produccion')).toBe(50000.5)
  })
  it('cada cuota cae en el primer día de un mes consecutivo, cruzando el año', () => {
    expect(plan().map(c => c.mes_pauta)).toEqual(['2026-11-01', '2026-12-01', '2027-01-01'])
  })
  it('una sola cuota es el total', () => {
    const [c] = plan({ cuotas: 1 })
    expect(c.importe_total).toBe(122000)
    expect(c.importe_arrendamiento).toBe(100000)
  })
  it('acota la cantidad de cuotas entre 1 y 60 y descarta decimales', () => {
    expect(plan({ cuotas: 0 })).toHaveLength(1)
    expect(plan({ cuotas: -3 })).toHaveLength(1)
    expect(plan({ cuotas: 100 })).toHaveLength(60)
    expect(plan({ cuotas: 2.7 })).toHaveLength(2)
    expect(plan({ cuotas: Number.NaN })).toHaveLength(1)
  })
  it('conserva la moneda', () => {
    expect(plan({ moneda: 'USD' }).every(c => c.moneda === 'USD')).toBe(true)
  })
  // BUG PROBABLE (no se corrige acá): `repartir` hace Math.floor((total / n) * 100), y con
  // binario flotante 1,15 × 100 da 114,99999999999999, así que una cuota de $ 1,15 sale
  // como $ 1,14 y la última absorbe el centavo ($ 1,16). La suma da bien, pero las cuotas
  // quedan desparejas cuando deberían ser iguales.
  it('repartir 2,30 en 2 cuotas da 1,15 + 1,15 (sin error de coma flotante)', () => {
    const p = plan({ cuotas: 2, total: 2.30, arrendamiento: 2.30 })
    expect(p.map(c => c.importe_arrendamiento)).toEqual([1.15, 1.15])
  })
})

describe('fechas de facturación', () => {
  it('primerDiaDelMes', () => {
    expect(primerDiaDelMes('2026-11-20')).toBe('2026-11-01')
    expect(primerDiaDelMes('2026-11-20', 2)).toBe('2027-01-01')
    expect(primerDiaDelMes('2026-01-31', 13)).toBe('2027-02-01')
  })
  it('vencimiento = emisión + condición de pago en días', () => {
    expect(CONDICION_PAGO_POR_DEFECTO).toBe(60)
    expect(calcularVencimiento('2026-11-11', 60)).toBe('2027-01-10')
    expect(calcularVencimiento('2026-12-15', 30)).toBe('2027-01-14')
    expect(calcularVencimiento('2028-02-01', 28)).toBe('2028-02-29') // bisiesto
    expect(calcularVencimiento('2026-11-11', 0)).toBe('2026-11-11')
  })
})

describe('cobranza: atraso y tramos', () => {
  const hoy = new Date(2026, 10, 11, 15, 30) // 11/11/2026
  it('días de atraso: positivo vencida, negativo faltan', () => {
    expect(diasDeAtraso('2026-11-11', hoy)).toBe(0)
    expect(diasDeAtraso('2026-11-01', hoy)).toBe(10)
    expect(diasDeAtraso('2026-11-21', hoy)).toBe(-10)
  })
  it('sin vencimiento o con formato inválido → null', () => {
    expect(diasDeAtraso(null, hoy)).toBeNull()
    expect(diasDeAtraso('basura', hoy)).toBeNull()
  })
  it('tramos como la columna VTO de la planilla', () => {
    expect(tramoDe(null)).toBe('por_vencer')
    expect(tramoDe(-5)).toBe('por_vencer')
    expect(tramoDe(0)).toBe('por_vencer')
    expect(tramoDe(1)).toBe('1_30')
    expect(tramoDe(30)).toBe('1_30')
    expect(tramoDe(31)).toBe('31_60')
    expect(tramoDe(60)).toBe('31_60')
    expect(tramoDe(61)).toBe('61_90')
    expect(tramoDe(90)).toBe('61_90')
    expect(tramoDe(91)).toBe('mas_90')
  })
})

describe('permisos de facturas', () => {
  it('roles comerciales y administración ven todas', () => {
    expect(puedeVerFacturas('gerente_comercial', 'u1', 'otro')).toBe(true)
    expect(puedeVerFacturas('administracion', 'u1', 'otro')).toBe(true)
    expect(puedeVerFacturas('asistente_ventas', 'u1', 'otro')).toBe(true)
  })
  it('el vendedor ve las suyas y las compartidas, no las ajenas', () => {
    expect(puedeVerFacturas('vendedor', 'u1', 'u1')).toBe(true)
    expect(puedeVerFacturas('vendedor', 'u2', 'u1', 'u2')).toBe(true)
    expect(puedeVerFacturas('vendedor', 'u3', 'u1', 'u2')).toBe(false)
  })
  it('sin rol no ve nada', () => {
    expect(puedeVerFacturas(null, 'u1', 'u1')).toBe(false)
    expect(puedeVerFacturas(undefined, 'u1', 'u1')).toBe(false)
  })
  it('planificar: el titular sí, con quien se comparte no', () => {
    expect(puedePlanificar('vendedor', 'u1', 'u1')).toBe(true)
    expect(puedePlanificar('vendedor', 'u2', 'u1')).toBe(false)
  })
  it('emitir y cobrar: sólo administración, no el vendedor', () => {
    expect(puedeAdministrarFacturas('administracion')).toBe(true)
    expect(puedeAdministrarFacturas('vendedor')).toBe(false)
    expect(puedeAdministrarFacturas(null)).toBe(false)
  })
})

describe('estados de venta', () => {
  it('aprobada y los estados heredados son venta cerrada', () => {
    for (const e of ['aprobada', 'en_oic', 'facturada', 'cobrada']) expect(estaCerrada(e)).toBe(true)
  })
  it('borrador, pendiente y rechazada no', () => {
    for (const e of ['borrador', 'pendiente_aprobacion', 'rechazada', null, undefined, '']) expect(estaCerrada(e)).toBe(false)
  })
  it('la máquina tiene 4 estados', () => {
    expect([...ESTADOS_VENTA]).toEqual(['borrador', 'pendiente_aprobacion', 'aprobada', 'rechazada'])
  })
})
