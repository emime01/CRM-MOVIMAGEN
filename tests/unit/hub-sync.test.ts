import { describe, it, expect } from 'vitest'
import { calcularParche, nombreDesdeHub } from '@/lib/hub/sync'

describe('nombreDesdeHub', () => {
  it('saca la temporada del nombre del Hub', () => {
    expect(nombreDesdeHub('PUNTA DEL ESTE CIRCUITO SHOPPING (TEMP BAJA)')).toBe('PUNTA DEL ESTE CIRCUITO SHOPPING')
    expect(nombreDesdeHub('PUNTA DEL ESTE ESCALERA SHOPPING (TEMP ALTA)')).toBe('PUNTA DEL ESTE ESCALERA SHOPPING')
    expect(nombreDesdeHub('COLONIA BANNER GIGANTE SHOPPING')).toBe('COLONIA BANNER GIGANTE SHOPPING')
    expect(nombreDesdeHub('  ')).toBeNull()
  })
})

describe('calcularParche · nombre', () => {
  const crm = (nombre: string) => ({ id: 'c1', nombre, ubicacion: 'Colonia', activo: true } as any)
  it('toma el nombre del Hub cuando difiere', () => {
    const p = calcularParche({ id: 'h1', nombre: 'COLONIA BANNER GIGANTE SHOPPING' } as any, crm('BANNER GIGANTE SHOPPING'), null)
    expect(p.nombre).toBe('COLONIA BANNER GIGANTE SHOPPING')
  })
  it('no cambia si ya es igual (sin la temporada)', () => {
    const p = calcularParche({ id: 'h1', nombre: 'PUNTA DEL ESTE ESCALERA SHOPPING (TEMP ALTA)' } as any, crm('PUNTA DEL ESTE ESCALERA SHOPPING'), null)
    expect(p.nombre).toBeUndefined()
  })
})
