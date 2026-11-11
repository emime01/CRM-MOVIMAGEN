import { describe, it, expect, vi } from 'vitest'

// El cálculo puro no toca la red, pero el módulo importa el cliente del BCU.
vi.mock('@/lib/bcu', () => ({ cotizacionDolar: vi.fn(async () => ({ fecha: '2026-11-11', valor: 40, fuente: 'BCU' })) }))

import {
  calcularCanon, aPagar, mesAnterior, cargarCanonDelMes,
  type ShoppingCanon, type Asignacion, type FacturaCanon, type ItemVenta,
} from '@/lib/canon/calcular'

const A: ShoppingCanon = { id: 'A', nombre: 'Shopping A', porcentaje_canon: 8, canon_minimo: 15000 }
const B: ShoppingCanon = { id: 'B', nombre: 'Shopping B', porcentaje_canon: 6, canon_minimo: 10000 }

const factura = (o: Partial<FacturaCanon> = {}): FacturaCanon => ({
  id: 'f1', orden_id: 'o1', numero: 'A-1001', tipo: 'factura', estado: 'emitida',
  cuota: 1, cuotas_total: 1, importe_arrendamiento: 150000, moneda: 'UYU',
  orden_numero: 77, cliente: 'Cliente SA', agencia: null, marca: null, pct_agencia: 0, ...o,
})
const item = (o: Partial<ItemVenta> = {}): ItemVenta => ({
  orden_id: 'o1', soporte_id: 'sx', soporte: 'Soporte X', cantidad: 1, semanas: 1, precio_unitario: 100000, descuento_pct: 0, ...o,
})

describe('calcularCanon: un soporte, un shopping', () => {
  it('canon = arrendamiento sin IVA × (1 − % agencia) × % canon', () => {
    const r = calcularCanon([A], [{ soporte_id: 'sx', shopping_id: 'A', peso: 1 }],
      [factura({ importe_arrendamiento: 100000, pct_agencia: 10 })], [item()])
    const l = r[0].lineas[0]
    expect(l.arrendamiento).toBe(100000)
    expect(l.neto_agencia).toBe(90000)
    expect(l.canon).toBe(7200)
    expect(l.reparto).toBeNull()
    expect(l.soportes).toEqual(['Soporte X'])
    expect(r[0].variable).toBe(7200)
  })
  it('venta directa (sin agencia): no se descuenta nada', () => {
    const r = calcularCanon([A], [{ soporte_id: 'sx', shopping_id: 'A', peso: 1 }], [factura()], [item()])
    expect(r[0].lineas[0].canon).toBe(12000) // 150000 × 8%
  })
  it('la cuota paga canon sobre su parte del arrendamiento', () => {
    // Venta de 300.000 en 2 cuotas: la cuota 1 factura 150.000.
    const r = calcularCanon([A], [{ soporte_id: 'sx', shopping_id: 'A', peso: 1 }],
      [factura({ cuota: 1, cuotas_total: 2 })], [item({ precio_unitario: 300000 })])
    expect(r[0].lineas[0].arrendamiento).toBe(150000)
    expect(r[0].lineas[0].canon).toBe(12000)
  })
  it('descuento de la línea, cantidad y semanas pesan en el reparto entre ítems', () => {
    // Ítem 1 vale 6000 (1000×2×3), ítem 2 vale 3000 (1000×2×3×50%); un shopping cada uno.
    const asig: Asignacion[] = [
      { soporte_id: 's1', shopping_id: 'A', peso: 1 },
      { soporte_id: 's2', shopping_id: 'B', peso: 1 },
    ]
    const its = [
      item({ soporte_id: 's1', soporte: 'S1', precio_unitario: 1000, cantidad: 2, semanas: 3 }),
      item({ soporte_id: 's2', soporte: 'S2', precio_unitario: 1000, cantidad: 2, semanas: 3, descuento_pct: 50 }),
    ]
    const r = calcularCanon([A, B], asig, [factura({ importe_arrendamiento: 9000 })], its)
    expect(r[0].lineas[0].arrendamiento).toBe(6000)
    expect(r[1].lineas[0].arrendamiento).toBe(3000)
  })
})

describe('calcularCanon: circuitos en varios shoppings', () => {
  it('reparte en partes iguales entre los shoppings del circuito', () => {
    const asig: Asignacion[] = [
      { soporte_id: 'sx', shopping_id: 'A', peso: 1 },
      { soporte_id: 'sc', shopping_id: 'A', peso: 1 },
      { soporte_id: 'sc', shopping_id: 'B', peso: 1 },
    ]
    const its = [
      item({ soporte_id: 'sx', soporte: 'Bus', precio_unitario: 100000 }),
      item({ soporte_id: 'sc', soporte: 'Circuito', precio_unitario: 50000 }),
    ]
    const r = calcularCanon([A, B], asig, [factura({ pct_agencia: 10 })], its)
    const la = r[0].lineas[0], lb = r[1].lineas[0]
    expect(la.arrendamiento).toBe(125000) // 100000 + mitad del circuito
    expect(la.neto_agencia).toBe(112500)
    expect(la.canon).toBe(9000)
    expect(la.reparto).toBe(2)
    expect(lb.arrendamiento).toBe(25000)
    expect(lb.canon).toBe(1350)           // 25000 × 0,9 × 6%
    expect(lb.reparto).toBe(2)
    expect(la.arrendamiento + lb.arrendamiento).toBe(150000)
  })
  it('con pesos desiguales reparte en proporción (3 a 1)', () => {
    const asig: Asignacion[] = [
      { soporte_id: 'sc', shopping_id: 'A', peso: 3 },
      { soporte_id: 'sc', shopping_id: 'B', peso: 1 },
    ]
    const r = calcularCanon([A, B], asig, [factura({ importe_arrendamiento: 80000 })], [item({ soporte_id: 'sc', soporte: 'Circuito' })])
    expect(r[0].lineas[0].arrendamiento).toBe(60000)
    expect(r[1].lineas[0].arrendamiento).toBe(20000)
  })
  it('un circuito en tres shoppings, sin perder centavos de más de 1 centésimo por parte', () => {
    const C: ShoppingCanon = { id: 'C', nombre: 'C', porcentaje_canon: 5, canon_minimo: 0 }
    const asig: Asignacion[] = ['A', 'B', 'C'].map(s => ({ soporte_id: 'sc', shopping_id: s, peso: 1 }))
    const r = calcularCanon([A, B, C], asig, [factura({ importe_arrendamiento: 100000 })], [item({ soporte_id: 'sc' })])
    const suma = r.reduce((t, x) => t + x.lineas[0].arrendamiento, 0)
    expect(r[0].lineas[0].arrendamiento).toBe(33333.33)
    expect(Math.abs(suma - 100000)).toBeLessThan(0.02)
  })
})

describe('calcularCanon: dólares', () => {
  it('pasa a pesos con la cotización de la factura y conserva el original en USD', () => {
    const r = calcularCanon([A], [{ soporte_id: 'sx', shopping_id: 'A', peso: 1 }],
      [factura({ moneda: 'USD', importe_arrendamiento: 2000, cotizacion: 40.5 })], [item()])
    const l = r[0].lineas[0]
    expect(l.moneda).toBe('UYU')
    expect(l.arrendamiento).toBe(81000)
    expect(l.usd).toBe(2000)
    expect(l.cotizacion).toBe(40.5)
    expect(l.canon).toBe(6480)
    expect(l.cotizacion_provisoria).toBe(false)
  })
  it('marca la cotización provisoria (todavía sin facturar)', () => {
    const r = calcularCanon([A], [{ soporte_id: 'sx', shopping_id: 'A', peso: 1 }],
      [factura({ moneda: 'USD', importe_arrendamiento: 1000, cotizacion: 39, cotizacion_provisoria: true })], [item()])
    expect(r[0].lineas[0].cotizacion_provisoria).toBe(true)
    expect(r[0].lineas[0].arrendamiento).toBe(39000)
  })
  it('lo en pesos no lleva cotización ni USD', () => {
    const r = calcularCanon([A], [{ soporte_id: 'sx', shopping_id: 'A', peso: 1 }], [factura()], [item()])
    expect(r[0].lineas[0].usd).toBeNull()
    expect(r[0].lineas[0].cotizacion).toBeNull()
  })
})

describe('calcularCanon: casos que no cuentan', () => {
  const asig: Asignacion[] = [{ soporte_id: 'sx', shopping_id: 'A', peso: 1 }]
  it('factura anulada no genera canon', () => {
    const r = calcularCanon([A], asig, [factura({ estado: 'anulada' })], [item()])
    expect(r[0].lineas).toHaveLength(0)
    expect(r[0].variable).toBe(0)
  })
  it('nota de crédito resta', () => {
    const r = calcularCanon([A], asig, [
      factura({ id: 'f1' }),
      factura({ id: 'nc', tipo: 'nota_credito', importe_arrendamiento: -50000, numero: 'NC-1' }),
    ], [item()])
    expect(r[0].variable).toBe(8000) // 12000 − 4000
  })
  it('soporte sin shopping asignado no paga canon', () => {
    const r = calcularCanon([A], [], [factura()], [item()])
    expect(r[0].lineas).toHaveLength(0)
  })
  it('venta sin ítems (o con total 0) se ignora', () => {
    expect(calcularCanon([A], asig, [factura()], [])[0].lineas).toHaveLength(0)
    expect(calcularCanon([A], asig, [factura()], [item({ precio_unitario: 0 })])[0].lineas).toHaveLength(0)
  })
  it('ítem sin soporte_id (ej. producción) no se imputa a ningún shopping', () => {
    const its = [item({ soporte_id: null, precio_unitario: 100000 }), item({ precio_unitario: 100000 })]
    const r = calcularCanon([A], asig, [factura({ importe_arrendamiento: 200000 })], its)
    expect(r[0].lineas[0].arrendamiento).toBe(100000)
  })
  it('un shopping inactivo (fuera de la lista) se ignora sin romper', () => {
    const r = calcularCanon([A], [{ soporte_id: 'sx', shopping_id: 'ZZ', peso: 1 }], [factura()], [item()])
    expect(r[0].lineas).toHaveLength(0)
  })
  it('ordena las líneas por cliente', () => {
    const r = calcularCanon([A], asig, [
      factura({ id: 'f1', orden_id: 'o1', cliente: 'Zeta' }),
      factura({ id: 'f2', orden_id: 'o2', cliente: 'Alfa' }),
    ], [item({ orden_id: 'o1' }), item({ orden_id: 'o2' })])
    expect(r[0].lineas.map(l => l.cliente)).toEqual(['Alfa', 'Zeta'])
  })
})

describe('aPagar', () => {
  it('paga el mínimo si el variable no lo alcanza', () => {
    expect(aPagar(9000, 15000, 0, 0)).toBe(15000)
  })
  it('paga el variable si supera el mínimo', () => {
    expect(aPagar(20000, 15000, 0, 0)).toBe(20000)
  })
  it('suma el arrastre del mes anterior y resta lo diferido', () => {
    expect(aPagar(9000, 15000, 2000, 500)).toBe(16500)
  })
  it('redondea a centésimos', () => {
    expect(aPagar(10000.004, 0, 0.1, 0.2)).toBe(9999.9)
  })
})

describe('mesAnterior', () => {
  it('mes anterior dentro del año', () => expect(mesAnterior('2026-11-01')).toBe('2026-10-01'))
  it('enero → diciembre del año anterior', () => expect(mesAnterior('2026-01-01')).toBe('2025-12-01'))
  it('marzo → febrero', () => expect(mesAnterior('2027-03-01')).toBe('2027-02-01'))
})

// ── cargarCanonDelMes con un Supabase de mentira ───────────────────────────
// Devuelve los datos de cada tabla sin mirar los filtros; `facturas` se
// consulta dos veces (las del mes y las de los planes), en ese orden.
function fakeSupabase(tablas: Record<string, any[] | any[][]>) {
  const llamadas: Record<string, number> = {}
  const from = (tabla: string) => {
    const n = (llamadas[tabla] = (llamadas[tabla] ?? 0) + 1) - 1
    const fuente = tablas[tabla]
    const data = Array.isArray(fuente?.[0]) || fuente === undefined ? ((fuente as any[][] | undefined)?.[n] ?? []) : (fuente as any[])
    const q: any = {
      select: () => q, eq: () => q, neq: () => q, in: () => q, order: () => q,
      then: (ok: any, ko: any) => Promise.resolve({ data, error: null }).then(ok, ko),
    }
    return q
  }
  return { from } as any
}

describe('cargarCanonDelMes: planes de canon (canon_planes)', () => {
  const filaFactura = {
    id: 'f1', orden_id: 'o1', numero: 'A-2001', tipo: 'factura', estado: 'emitida', cuota: 1, cuotas_total: 1,
    importe_arrendamiento: 120000, moneda: 'UYU', cotizacion: null,
    ordenes_venta: { numero: 90, estado: 'aprobada', marca: null, comision_agencia_pct: 0, clientes: { nombre: 'Cliente', empresa: 'Cliente SA' }, agencias: null },
  }
  const mk = (planes: any[], delMes: any[], delPlan: any[]) => fakeSupabase({
    canon_planes: planes,
    canon_shoppings: [{ id: 'A', nombre: 'Shopping A', porcentaje_canon: 8, canon_minimo: 0 }],
    canon_soporte_shoppings: [{ soporte_id: 'sx', shopping_id: 'A', peso: 1 }],
    facturas: [delMes, delPlan],
    orden_items: [{ orden_id: 'o1', soporte_id: 'sx', cantidad: 1, semanas: 1, precio_unitario: 120000, descuento_pct: 0, soportes: { nombre: 'Soporte X' } }],
  })
  const plan = { orden_id: 'o1', cuotas: 4, primer_mes: '2026-10-01' }

  it('el canon de toda la venta se paga en N cuotas iguales desde el mes pactado', async () => {
    // 120.000 × 8% = 9.600 → 4 cuotas de 2.400; noviembre es la cuota 2.
    const { resumen, error } = await cargarCanonDelMes(mk([plan], [filaFactura], [filaFactura]), '2026-11')
    expect(error).toBeUndefined()
    const ls = resumen[0].lineas
    expect(ls).toHaveLength(1) // no se cuenta además por su cuota de facturación
    expect(ls[0].canon).toBe(2400)
    expect(ls[0].arrendamiento).toBe(30000)
    expect(ls[0].plan).toEqual({ cuota: 2, cuotas: 4, primer_mes: '2026-10-01' })
    expect(resumen[0].variable).toBe(2400)
  })
  it('la primera y la última cuota caen en su mes; fuera del plan no hay línea', async () => {
    const primera = await cargarCanonDelMes(mk([plan], [], [filaFactura]), '2026-10')
    expect(primera.resumen[0].lineas[0].plan?.cuota).toBe(1)
    const ultima = await cargarCanonDelMes(mk([plan], [], [filaFactura]), '2027-01')
    expect(ultima.resumen[0].lineas[0].plan?.cuota).toBe(4)
    const despues = await cargarCanonDelMes(mk([plan], [], [filaFactura]), '2027-02')
    expect(despues.resumen[0].lineas).toHaveLength(0)
    const antes = await cargarCanonDelMes(mk([plan], [], [filaFactura]), '2026-09')
    expect(antes.resumen[0].lineas).toHaveLength(0)
  })
  it('sin plan, la cuota paga canon en su mes de pauta', async () => {
    const { resumen } = await cargarCanonDelMes(mk([], [filaFactura], []), '2026-11')
    expect(resumen[0].lineas[0].canon).toBe(9600)
    expect(resumen[0].lineas[0].plan).toBeUndefined()
  })
  it('una venta sin aprobar todavía no paga canon', async () => {
    const borrador = { ...filaFactura, ordenes_venta: { ...filaFactura.ordenes_venta, estado: 'borrador' } }
    const { resumen } = await cargarCanonDelMes(mk([], [borrador], []), '2026-11')
    expect(resumen[0].lineas).toHaveLength(0)
  })
  it('descuenta la comisión de la agencia pactada en la venta', async () => {
    const conAgencia = {
      ...filaFactura,
      ordenes_venta: { ...filaFactura.ordenes_venta, comision_agencia_pct: 15, agencias: { nombre: 'Agencia', porcentaje_comision: 10 } },
    }
    const { resumen } = await cargarCanonDelMes(mk([], [conAgencia], []), '2026-11')
    expect(resumen[0].lineas[0].neto_agencia).toBe(102000)
    expect(resumen[0].lineas[0].canon).toBe(8160)
  })
})
