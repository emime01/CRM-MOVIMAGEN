import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/bcu', () => ({ cotizacionDolar: vi.fn(async () => ({ fecha: '2026-11-11', valor: 40, fuente: 'BCU' })) }))

import { aplicarDiferidos, mesSiguiente, type FilaDiferida, type LineaCanon, type ResumenShopping } from '@/lib/canon/calcular'

const SH = { id: 'A', nombre: 'Shopping A', porcentaje_canon: 8, canon_minimo: 0 }
const linea = (id: string, canon: number, cliente = 'Cliente'): LineaCanon => ({
  factura_id: id, orden_id: 'o', orden_numero: 1, numero: null, tipo: 'factura', cuota: 1, cuotas_total: 1,
  cliente, agencia: null, marca: null, soportes: [], moneda: 'UYU', arrendamiento: 0, pct_agencia: 0,
  neto_agencia: 0, pct_canon: 8, canon, reparto: null,
})
const resumen = (...ls: LineaCanon[]): ResumenShopping[] => [
  { shopping: SH, lineas: ls, variable: ls.reduce((t, l) => t + l.canon, 0), variable_usd: 0 },
]
const fila = (linea_id: string, mes_pauta: string, mes_destino: string): FilaDiferida =>
  ({ shopping_id: 'A', linea_id, mes_pauta: `${mes_pauta}-01`, mes_destino: `${mes_destino}-01` })

const raw = {
  '2026-10': resumen(linea('f1', 100), linea('f2', 50), linea('plan-o9', 30)),
  '2026-11': resumen(linea('f3', 70)),
  '2026-12': resumen(linea('f4', 10)),
}
const ids = (r: ResumenShopping[]) => r[0].lineas.map(l => l.factura_id).sort()

describe('aplicarDiferidos', () => {
  it('sin filas deja el mes igual', () => {
    const r = aplicarDiferidos(raw, [], '2026-10')
    expect(ids(r)).toEqual(['f1', 'f2', 'plan-o9'])
    expect(r[0].variable).toBe(180)
    expect(r[0].diferidas).toEqual([])
  })

  it('la línea diferida desaparece del mes de origen y de su variable', () => {
    const r = aplicarDiferidos(raw, [fila('f1', '2026-10', '2026-11')], '2026-10')
    expect(ids(r)).toEqual(['f2', 'plan-o9'])
    expect(r[0].variable).toBe(80)
    expect(r[0].diferidas).toHaveLength(1)
    expect(r[0].diferidas![0]).toMatchObject({ factura_id: 'f1', mes_destino: '2026-11' })
  })

  it('aparece como línea normal en el mes de destino, marcada con su origen', () => {
    const r = aplicarDiferidos(raw, [fila('f1', '2026-10', '2026-11')], '2026-11')
    expect(ids(r)).toEqual(['f1', 'f3'])
    expect(r[0].variable).toBe(170)
    expect(r[0].lineas.find(l => l.factura_id === 'f1')!.diferida_de).toBe('2026-10')
    expect(r[0].lineas.find(l => l.factura_id === 'f3')!.diferida_de).toBeUndefined()
  })

  it('al diferirla de nuevo se mueve: sale del destino anterior y entra en el nuevo', () => {
    const filas = [fila('f1', '2026-10', '2026-12')]
    expect(ids(aplicarDiferidos(raw, filas, '2026-11'))).toEqual(['f3'])
    expect(ids(aplicarDiferidos(raw, filas, '2026-12'))).toEqual(['f1', 'f4'])
    expect(aplicarDiferidos(raw, filas, '2026-10')[0].diferidas![0].mes_destino).toBe('2026-12')
  })

  it('devolver (sin la fila) restaura la línea en su mes', () => {
    expect(ids(aplicarDiferidos(raw, [], '2026-10'))).toEqual(['f1', 'f2', 'plan-o9'])
    expect(ids(aplicarDiferidos(raw, [], '2026-11'))).toEqual(['f3'])
  })

  it('las líneas de plan (plan-<orden>) también se difieren', () => {
    const filas = [fila('plan-o9', '2026-10', '2026-11')]
    expect(ids(aplicarDiferidos(raw, filas, '2026-10'))).toEqual(['f1', 'f2'])
    const nov = aplicarDiferidos(raw, filas, '2026-11')
    expect(ids(nov)).toEqual(['f3', 'plan-o9'])
    expect(nov[0].variable).toBe(100)
  })

  it('no mezcla shoppings ni confunde líneas de distinto mes con el mismo id', () => {
    const otra: FilaDiferida = { ...fila('f1', '2026-10', '2026-11'), shopping_id: 'B' }
    expect(ids(aplicarDiferidos(raw, [otra], '2026-10'))).toEqual(['f1', 'f2', 'plan-o9'])
    const conPlan = { ...raw, '2026-11': resumen(linea('plan-o9', 5)) }
    const r = aplicarDiferidos(conPlan, [fila('plan-o9', '2026-10', '2026-11')], '2026-11')
    expect(r[0].lineas.map(l => l.canon).sort((a, b) => a - b)).toEqual([5, 30])
  })

  it('no muta la entrada', () => {
    aplicarDiferidos(raw, [fila('f1', '2026-10', '2026-11')], '2026-10')
    expect(raw['2026-10'][0].lineas).toHaveLength(3)
  })
})

describe('mesSiguiente', () => {
  it('pasa de año', () => {
    expect(mesSiguiente('2026-12-01')).toBe('2027-01-01')
    expect(mesSiguiente('2026-10-01')).toBe('2026-11-01')
  })
})
