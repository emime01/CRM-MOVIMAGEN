import { describe, it, expect } from 'vitest'
import {
  intervalosVentas, intervalosBloqueos, ocupacionPorSoporte, sumarDias,
} from '@/lib/disponibilidad/ocupacion'
import { ocupacionPorFormato, soportesConLugar } from '@/lib/gerencia/ocupacion'
import { cuatrimestreDe, sumarMeses, ultimoDiaDelMes } from '@/lib/gerencia/periodo'
import { construirEmbudo } from '@/lib/gerencia/embudo'
import { facturadoVsCobrado } from '@/lib/gerencia/facturado-cobrado'
import { descuentoPorFormato } from '@/lib/gerencia/descuento'

describe('periodo', () => {
  it('cuatrimestres', () => {
    expect(cuatrimestreDe('2026-11-12')).toEqual({ label: 'Q3-2026', start: '2026-09-01', end: '2026-12-31' })
    expect(cuatrimestreDe('2026-04-30').label).toBe('Q1-2026')
    expect(cuatrimestreDe('2026-08-01').label).toBe('Q2-2026')
  })
  it('meses', () => {
    expect(sumarMeses('2026-11', 2)).toBe('2027-01')
    expect(sumarMeses('2026-01', -1)).toBe('2025-12')
    expect(ultimoDiaDelMes('2026-02')).toBe('2026-02-28')
    expect(ultimoDiaDelMes('2028-02')).toBe('2028-02-29')
  })
})

describe('ocupación', () => {
  const tipoDe = new Map<string, string | null>([['a', null], ['led', 'led']])
  const caps = new Map([['a', 2], ['led', 12], ['b', 1]])
  const ordenes = [{
    fecha_alta_prevista: '2026-11-01', fecha_baja_prevista: '2026-11-10',
    orden_items: [
      { soporte_id: 'a', cantidad: 1 },
      // 60 salidas = 2 lugares de la tanda
      { soporte_id: 'led', salidas: 60, fecha_alta_real: '2026-11-05', fecha_baja_prevista: '2026-11-14' },
    ],
  }]
  const reservas = [{
    fecha_desde: '2026-11-08', fecha_hasta: '2026-11-12',
    reserva_items: [{ soporte_id: 'a', cantidad: 1 }, { soporte_id: 'b', cantidad: 1 }],
  }]

  it('intervalos de venta usan fechas efectivas y espaciosQueOcupa', () => {
    const iv = intervalosVentas(ordenes, tipoDe)
    expect(iv).toEqual([
      { soporte_id: 'a', desde: '2026-11-01', hasta: '2026-11-10', espacios: 1 },
      { soporte_id: 'led', desde: '2026-11-05', hasta: '2026-11-14', espacios: 2 },
    ])
  })
  it('ignora items sin fechas', () => {
    expect(intervalosVentas([{ orden_items: [{ soporte_id: 'a' }] }], tipoDe)).toEqual([])
    expect(intervalosBloqueos([{ reserva_items: [{ soporte_id: 'a' }] }], tipoDe)).toEqual([])
  })
  it('espacios-día vendidos y reservados, y el bloqueo no pisa la venta', () => {
    const r = ocupacionPorSoporte(
      caps, intervalosVentas(ordenes, tipoDe), intervalosBloqueos(reservas, tipoDe), '2026-11-01', '2026-11-30',
    )
    const a = r.get('a')!
    expect(a.dias).toBe(30)
    expect(a.ventaDias).toBe(10)
    expect(a.bloqueoDias).toBe(5) // 8..12, cap 2 → entra siempre
    expect(a.diasConLugar).toBe(27) // del 8 al 10 venta + bloqueo llenan los 2 espacios
  })
  it('sin ocupación todo queda libre y con lugar', () => {
    const r = ocupacionPorSoporte(caps, [], [], '2026-11-01', '2026-11-30')
    expect(r.get('led')).toMatchObject({ ventaDias: 0, bloqueoDias: 0, diasConLugar: 30 })
  })
  it('recorta la sobreventa a la capacidad', () => {
    const iv = [
      { soporte_id: 'b', desde: '2026-11-01', hasta: '2026-11-02', espacios: 1 },
      { soporte_id: 'b', desde: '2026-11-01', hasta: '2026-11-02', espacios: 1 },
    ]
    const b = ocupacionPorSoporte(caps, iv, [], '2026-11-01', '2026-11-04').get('b')!
    expect(b.ventaDias).toBe(2)
    expect(b.diasConLugar).toBe(2)
  })
  it('un rango parcial dentro del mes sólo cuenta lo que se pisa', () => {
    const iv = [{ soporte_id: 'b', desde: '2026-10-25', hasta: '2026-11-03', espacios: 1 }]
    expect(ocupacionPorSoporte(caps, iv, [], '2026-11-01', '2026-11-30').get('b')!.ventaDias).toBe(3)
  })
  it('sumarDias', () => {
    expect(sumarDias('2026-11-30', 1)).toBe('2026-12-01')
    expect(sumarDias('2026-11-12', 29)).toBe('2026-12-11')
  })

  it('agrega por formato y cuenta soportes con lugar', () => {
    const sop = [
      { id: 'a', categoria: 'Exterior' }, { id: 'led', categoria: 'Digital' }, { id: 'b', categoria: null },
    ]
    const iv = [{ soporte_id: 'b', desde: '2026-11-01', hasta: '2026-11-30', espacios: 1 }]
    const oc = ocupacionPorSoporte(caps, iv, [], '2026-11-01', '2026-11-30')
    const f = ocupacionPorFormato(sop, oc)
    expect(f.map(x => x.formato)).toEqual(['Digital', 'Exterior', 'Otro'])
    expect(f.find(x => x.formato === 'Otro')).toMatchObject({ pctVendido: 100, pctReservado: 0 })
    expect(f.find(x => x.formato === 'Digital')!.pctVendido).toBe(0)
    expect(soportesConLugar(oc)).toBe(2)
  })
  it('sin soportes, sin formatos', () => {
    expect(ocupacionPorFormato([], new Map())).toEqual([])
  })
})

describe('embudo', () => {
  const perfiles = [
    { id: 'v1', nombre: 'Ana', rol: 'vendedor' },
    { id: 'v2', nombre: 'Beto', rol: 'vendedor' },
    { id: 'g', nombre: 'Gerente', rol: 'gerente_comercial' },
  ]
  it('cuenta etapas, conversión y monto sin IVA; oculta al gerente sin actividad', () => {
    const { filas, total } = construirEmbudo({
      perfiles,
      leads: [{ vendedor_id: 'v1' }, { vendedor_id: 'v1' }, { vendedor_id: 'v1' }, { vendedor_id: 'v1' }, { vendedor_id: 'v2' }],
      propuestas: [{ vendedor_id: 'v1' }, { vendedor_id: 'v1' }],
      ventas: [{ vendedor_id: 'v1', monto_neto: 1000, moneda: 'UYU' }, { vendedor_id: 'v1', monto_total: 122, moneda: 'USD' }],
    })
    expect(filas.map(f => f.id)).toEqual(['v1', 'v2'])
    const ana = filas[0]
    expect(ana).toMatchObject({ leads: 4, propuestas: 2, ventas: 2, convLeadPropuesta: 50, convPropuestaVenta: 100, convTotal: 50 })
    expect(ana.monto).toEqual({ UYU: 1000, USD: 100 })
    expect(filas[1]).toMatchObject({ leads: 1, propuestas: 0, ventas: 0, convPropuestaVenta: null })
    expect(total).toMatchObject({ leads: 5, propuestas: 2, ventas: 2 })
  })
  it('el gerente que vende aparece', () => {
    const { filas } = construirEmbudo({ perfiles, leads: [], propuestas: [], ventas: [{ vendedor_id: 'g', monto_neto: 5, moneda: 'UYU' }] })
    expect(filas.map(f => f.id)).toContain('g')
  })
  it('sin datos no divide por cero', () => {
    const { filas, total } = construirEmbudo({ perfiles, leads: [], propuestas: [], ventas: [] })
    expect(filas.every(f => f.convTotal === null)).toBe(true)
    expect(total).toMatchObject({ leads: 0, convLeadPropuesta: null })
  })
})

describe('facturado vs cobrado', () => {
  it('resta notas de crédito, separa monedas y sólo cuenta el mes y los estados vivos', () => {
    const r = facturadoVsCobrado(
      [
        { tipo: 'factura', estado: 'emitida', fecha_emision: '2026-11-03', importe_total: 1000, moneda: 'UYU' },
        { tipo: 'factura', estado: 'cobrada', fecha_emision: '2026-11-10', importe_total: 500, moneda: 'UYU' },
        { tipo: 'nota_credito', estado: 'emitida', fecha_emision: '2026-11-11', importe_total: -200, moneda: 'UYU' },
        { tipo: 'nota_credito', estado: 'emitida', fecha_emision: '2026-11-11', importe_total: 100, moneda: 'UYU' },
        { tipo: 'factura', estado: 'prevista', fecha_emision: '2026-11-11', importe_total: 9999, moneda: 'UYU' },
        { tipo: 'factura', estado: 'emitida', fecha_emision: '2026-10-30', importe_total: 7777, moneda: 'UYU' },
        { tipo: 'factura', estado: 'emitida', fecha_emision: '2026-11-05', importe_total: 100, moneda: 'USD', cotizacion: 40 },
        { tipo: 'factura', estado: 'emitida', fecha_emision: '2026-11-06', importe_total: 50, moneda: 'USD' },
      ],
      [
        { monto: 600, fecha_pago: '2026-11-04', moneda: 'UYU' },
        { monto: 999, fecha_pago: '2026-10-31', moneda: 'UYU' },
        { monto: 100, fecha_pago: '2026-11-09', moneda: 'USD' },
      ],
      '2026-11',
    )
    const uyu = r.find(x => x.moneda === 'UYU')!
    expect(uyu).toMatchObject({ facturado: 1200, cobrado: 600, diferencia: 600, pctCobrado: 50 })
    const usd = r.find(x => x.moneda === 'USD')!
    expect(usd).toMatchObject({ facturado: 150, cobrado: 100, facturadoEnPesos: 4000, sinCotizacion: 1 })
    expect(usd.pctCobrado).toBe(67)
  })
  it('sin datos devuelve vacío', () => {
    expect(facturadoVsCobrado([], [], '2026-11')).toEqual([])
  })
  it('cobrado sin facturado: porcentaje nulo', () => {
    const r = facturadoVsCobrado([], [{ monto: 10, fecha_pago: '2026-11-01' }], '2026-11')
    expect(r[0]).toMatchObject({ facturado: 0, cobrado: 10, pctCobrado: null })
  })
})

describe('descuento por formato', () => {
  const soportes = [
    { id: 'a', categoria: 'Exterior', precio_semanal: 1000 },
    { id: 'b', categoria: 'Exterior', precio_semanal: 2000 },
    { id: 'c', categoria: 'Digital', precio_semanal: null },
  ]
  it('promedio ponderado por lista, combinando precio y descuento_pct', () => {
    const r = descuentoPorFormato([
      { soporte_id: 'a', cantidad: 1, semanas: 4, precio_unitario: 1000, descuento_pct: 10 }, // lista 4000, real 3600
      { soporte_id: 'b', cantidad: 2, semanas: 2, precio_unitario: 1500, descuento_pct: 0 }, // lista 8000, real 6000
    ], soportes)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ formato: 'Exterior', items: 2, lista: 12000, real: 9600, descuentoPct: 20 })
  })
  it('sin lista o sin precio queda fuera ("—")', () => {
    expect(descuentoPorFormato([
      { soporte_id: 'c', cantidad: 1, semanas: 1, precio_unitario: 100 },
      { soporte_id: 'a', cantidad: 1, semanas: 1, precio_unitario: null },
      { soporte_id: 'zzz', precio_unitario: 1 },
    ], soportes)).toEqual([])
  })
  it('precio por encima de lista da descuento negativo', () => {
    expect(descuentoPorFormato([{ soporte_id: 'a', precio_unitario: 1100 }], soportes)[0].descuentoPct).toBe(-10)
  })
})
