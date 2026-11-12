import { describe, it, expect } from 'vitest'
import {
  construirResumenSemanal, semanaAnterior, plataTotales, asuntoSemanal, type DatosResumenSemanal,
} from '@/lib/avisos/semanal'
import { diasSolapados, ocupacionPorFormato, soportesLibres } from '@/lib/disponibilidad/ocupacion-mes'
import { cuatrimestreDe } from '@/lib/objetivos/cuatrimestre'

const vacio = (): DatosResumenSemanal => ({
  hoy: '2026-11-16',
  semana: { desde: '2026-11-09', hasta: '2026-11-15' },
  cuatrimestre: { label: 'Q3-2026', displayLabel: 'Q3' },
  ventas: { cantidad: 0, total: {}, porVendedor: [], top: [] },
  objetivos: { total: { vendido: 0, vendidoUSD: 0, objetivo: 0 }, porVendedor: [] },
  propuestas: { enviadas: 0, aceptadas: 0, sinRespuesta: [] },
  ocupacion: null,
  cobranza: { facturado: {}, cobrado: {}, deudaVencida: {}, facturasVencidas: 0 },
  alertas: { renovaciones: [], pendientesAprobacion: [], gestionesVencidas: [] },
  avisos: [],
})

describe('semanaAnterior', () => {
  it('un lunes es la semana que acaba de terminar', () => {
    expect(semanaAnterior('2026-11-16')).toEqual({ desde: '2026-11-09', hasta: '2026-11-15' })
  })
  it('un jueves también es la semana anterior a la actual', () => {
    expect(semanaAnterior('2026-11-12')).toEqual({ desde: '2026-11-02', hasta: '2026-11-08' })
  })
  it('un domingo cuenta como parte de su semana', () => {
    expect(semanaAnterior('2026-11-15')).toEqual({ desde: '2026-11-02', hasta: '2026-11-08' })
  })
  it('cruza el fin de año', () => {
    expect(semanaAnterior('2027-01-04')).toEqual({ desde: '2026-12-28', hasta: '2027-01-03' })
  })
})

describe('cuatrimestreDe', () => {
  it('Q1, Q2, Q3', () => {
    expect(cuatrimestreDe('2026-04-30').label).toBe('Q1-2026')
    expect(cuatrimestreDe('2026-05-01').label).toBe('Q2-2026')
    expect(cuatrimestreDe('2026-11-12')).toMatchObject({ label: 'Q3-2026', start: '2026-09-01', end: '2026-12-31' })
  })
})

describe('construirResumenSemanal', () => {
  it('asunto con el lunes de la semana resumida', () => {
    const r = construirResumenSemanal(vacio())
    expect(r.asunto).toBe('Resumen semanal Movimagen · semana del 09/11')
    expect(asuntoSemanal({ desde: '2026-12-28' })).toBe('Resumen semanal Movimagen · semana del 28/12')
  })

  it('sin ventas: no rompe y lo dice', () => {
    const r = construirResumenSemanal(vacio())
    expect(r.html).toContain('No hubo ventas cerradas en la semana.')
    expect(r.texto).toContain('No hubo ventas cerradas en la semana.')
    expect(r.html).toContain('No se pudo calcular la ocupación')
    expect(r.html).not.toContain('undefined')
    expect(r.html).not.toContain('NaN')
  })

  it('con ventas: cuenta, monto, por vendedor y top', () => {
    const d = vacio()
    d.ventas = {
      cantidad: 2, total: { UYU: 150000 },
      porVendedor: [{ nombre: 'Ana', cantidad: 1, total: { UYU: 100000 } }, { nombre: 'Beto', cantidad: 1, total: { UYU: 50000 } }],
      top: [{ numero: 12, cliente: 'Coca <Cola>', formato: 'LED', monto: 100000, moneda: 'UYU' }],
    }
    const r = construirResumenSemanal(d)
    expect(r.html).toContain('2 ventas')
    expect(r.html).toContain('$ 150.000')
    expect(r.html).toContain('Ana')
    expect(r.html).toContain('Coca &lt;Cola&gt; (OIC #12)')
    expect(r.html).not.toContain('Coca <Cola>')
    expect(r.texto).toContain('Coca <Cola> (OIC #12) · LED · $ 100.000')
  })

  it('avance vs objetivo, con dólares aparte', () => {
    const d = vacio()
    d.objetivos = {
      total: { vendido: 500000, vendidoUSD: 1000, objetivo: 2000000 },
      porVendedor: [{ nombre: 'Ana', vendido: 500000, vendidoUSD: 0, objetivo: 1000000 }, { nombre: 'Sin objetivo', vendido: 0, vendidoUSD: 0, objetivo: 0 }],
    }
    const r = construirResumenSemanal(d)
    expect(r.html).toContain('25%')
    expect(r.html).toContain('50%')
    expect(r.html).toContain('U$S 1.000')
    expect(r.html).toContain('—')
  })

  it('propuestas sin respuesta, ocupación, cobranza y alertas', () => {
    const d = vacio()
    d.propuestas = { enviadas: 3, aceptadas: 1, sinRespuesta: [{ numero: 'COT-7', cliente: 'Antel', vendedor: 'Ana', dias: 9 }] }
    d.ocupacion = {
      mesActual: { etiqueta: 'noviembre 2026', formatos: [{ formato: 'LED', pct: 80 }] },
      mesSiguiente: { etiqueta: 'diciembre 2026', formatos: [{ formato: 'LED', pct: 40 }, { formato: 'Ruta', pct: 10 }] },
      libres30: 5, totalSoportes: 40,
    }
    d.cobranza = { facturado: { UYU: 1000, USD: 50 }, cobrado: {}, deudaVencida: { UYU: 2500000 }, facturasVencidas: 4 }
    d.alertas = {
      renovaciones: [{ cliente: 'Antel', vendedor: 'Ana', fin: '2026-12-01', numero: 3 }],
      pendientesAprobacion: [{ numero: 20, cliente: 'Tienda', monto: 80000, moneda: 'UYU', vendedor: 'Beto' }],
      gestionesVencidas: [{ vendedor: 'Beto', cantidad: 6 }],
    }
    const r = construirResumenSemanal(d)
    expect(r.html).toContain('Enviadas en la semana: 3 · Aceptadas: 1')
    expect(r.html).toContain('COT-7')
    expect(r.html).toContain('80%')
    expect(r.html).toContain('Soportes libres en los próximos 30 días: 5 de 40')
    expect(r.html).toContain('$ 1.000 + U$S 50')
    expect(r.html).toContain('$ 2.500.000 (4 facturas)')
    expect(r.html).toContain('01/12/2026')
    expect(r.html).toContain('Ventas pendientes de aprobación: 1')
    expect(r.html).toContain('Gestiones de leads vencidas por vendedor')
  })

  it('avisa las secciones que no se pudieron cargar', () => {
    const d = vacio()
    d.avisos = ['cobranza']
    expect(construirResumenSemanal(d).html).toContain('No se pudo cargar: cobranza.')
  })
})

describe('plataTotales', () => {
  it('cero y negativos', () => {
    expect(plataTotales({})).toBe('$ 0')
    expect(plataTotales({ UYU: -1500 })).toBe('-$ 1.500')
  })
})

describe('ocupación', () => {
  const soportes = [
    { id: 'a', categoria: 'LED', cap: 10 },
    { id: 'b', categoria: 'LED', cap: 10 },
    { id: 'c', categoria: 'Ruta', cap: 1 },
    { id: 'd', categoria: null, cap: null },
  ]
  it('días solapados, inclusive', () => {
    expect(diasSolapados('2026-11-01', '2026-11-05', '2026-11-04', '2026-11-30')).toBe(2)
    expect(diasSolapados('2026-10-01', '2026-10-31', '2026-11-01', '2026-11-30')).toBe(0)
  })
  it('% por formato sobre capacidad × días', () => {
    // Noviembre (30 días): A ocupa 5 de 10 espacios todo el mes; C vendido media vez.
    const oc = [
      { soporte_id: 'a', espacios: 5, alta: '2026-10-15', baja: '2026-12-31' },
      { soporte_id: 'c', espacios: 1, alta: '2026-11-01', baja: '2026-11-15' },
    ]
    const r = ocupacionPorFormato(soportes, oc, '2026-11-01', '2026-11-30')
    expect(r.find(x => x.formato === 'LED')).toMatchObject({ soportes: 2, pct: 25 })
    expect(r.find(x => x.formato === 'Ruta')?.pct).toBe(50)
    expect(r.find(x => x.formato === 'Sin categoría')?.pct).toBe(0)
  })
  it('sobreventa no pasa del 100%', () => {
    const oc = [{ soporte_id: 'c', espacios: 3, alta: '2026-11-01', baja: '2026-11-30' }]
    expect(ocupacionPorFormato(soportes, oc, '2026-11-01', '2026-11-30').find(x => x.formato === 'Ruta')?.pct).toBe(100)
  })
  it('soportes libres: ninguna venta en el rango', () => {
    const oc = [
      { soporte_id: 'a', espacios: 1, alta: '2026-11-20', baja: '2026-11-25' },
      { soporte_id: 'c', espacios: 1, alta: '2026-01-01', baja: '2026-11-11' },
    ]
    expect(soportesLibres(soportes, oc, '2026-11-12', '2026-12-12')).toBe(3) // b, c, d
    expect(soportesLibres(soportes, [], '2026-11-12', '2026-12-12')).toBe(4)
  })
})
