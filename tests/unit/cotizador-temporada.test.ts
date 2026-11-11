import { describe, it, expect } from 'vitest'
import { esTemporadaAlta, semanasMinimas, precioDeSemanas } from '@/lib/cotizador/temporada'

// Soporte de Punta del Este con precio de temporada alta (dic-feb).
const punta = {
  precio_semanal: 10000,
  precio_semanal_alta: 18000,
  semanas_minimas: 2,
  semanas_minimas_alta: 4,
}

describe('esTemporadaAlta', () => {
  it('diciembre, enero y febrero son alta', () => {
    expect(esTemporadaAlta('2026-12-01')).toBe(true)
    expect(esTemporadaAlta('2027-01-15')).toBe(true)
    expect(esTemporadaAlta('2027-02-28')).toBe(true)
  })
  it('el resto del año es baja', () => {
    expect(esTemporadaAlta('2026-11-30')).toBe(false)
    expect(esTemporadaAlta('2027-03-01')).toBe(false)
    expect(esTemporadaAlta('2026-07-10')).toBe(false)
  })
})

describe('semanasMinimas', () => {
  it('sin precio de alta usa semanas_minimas todo el año', () => {
    expect(semanasMinimas({ precio_semanal: 5000, semanas_minimas: 4 }, '2026-12-10')).toBe(4)
  })
  it('arrancando en alta rige el mínimo de alta', () => {
    expect(semanasMinimas(punta, '2026-12-10')).toBe(4)
  })
  it('arrancando en baja rige el mínimo normal, aunque la campaña caiga en alta', () => {
    expect(semanasMinimas(punta, '2026-11-24')).toBe(2)
  })
  it('sin fecha de inicio rige el mínimo normal', () => {
    expect(semanasMinimas(punta, null)).toBe(2)
    expect(semanasMinimas(punta)).toBe(2)
  })
  it('nunca baja del mínimo normal si el de alta es menor', () => {
    expect(semanasMinimas({ ...punta, semanas_minimas: 6, semanas_minimas_alta: 4 }, '2027-01-05')).toBe(6)
  })
  it('sin mínimos cargados (null o 0) es 1 semana', () => {
    expect(semanasMinimas({ precio_semanal: 1000 })).toBe(1)
    expect(semanasMinimas({ precio_semanal: 1000, semanas_minimas: 0 })).toBe(1)
    expect(semanasMinimas({ precio_semanal: 1000, semanas_minimas: null })).toBe(1)
  })
})

describe('precioDeSemanas', () => {
  it('sin precio de alta: precio × semanas', () => {
    expect(precioDeSemanas({ precio_semanal: 7500 }, 4, '2026-12-01')).toBe(30000)
  })
  it('sin fecha de inicio: precio normal aunque haya precio de alta', () => {
    expect(precioDeSemanas(punta, 3)).toBe(30000)
  })
  it('campaña entera en alta', () => {
    expect(precioDeSemanas(punta, 4, '2026-12-01')).toBe(72000)
  })
  it('campaña entera en baja', () => {
    expect(precioDeSemanas(punta, 3, '2026-06-01')).toBe(30000)
  })
  it('cada semana va al precio de la temporada en que empieza', () => {
    // 24/11 baja; 1/12, 8/12 y 15/12 alta.
    expect(precioDeSemanas(punta, 4, '2026-11-24')).toBe(10000 + 3 * 18000)
    // 22/2 alta; 1/3 y 8/3 baja.
    expect(precioDeSemanas(punta, 3, '2027-02-22')).toBe(18000 + 2 * 10000)
  })
  it('cruza el año (dic → ene) sin cortar la temporada', () => {
    expect(precioDeSemanas(punta, 6, '2026-12-15')).toBe(6 * 18000)
  })
  it('acepta un inicio con hora (ISO completo)', () => {
    expect(precioDeSemanas(punta, 2, '2026-12-01T03:00:00.000Z')).toBe(36000)
  })
  it('precio de alta 0 se respeta (no cae al normal)', () => {
    expect(precioDeSemanas({ precio_semanal: 10000, precio_semanal_alta: 0 }, 2, '2026-12-01')).toBe(0)
  })
})
