import { describe, it, expect } from 'vitest'
import { emparejarCliente, emparejarVendedor, nombreBaseCliente, nombrePropio, trimestreDe } from '@/lib/ventas/historicas'

const clientes = [
  { id: 'coca', nombre: 'Coca Cola', empresa: 'Montevideo Refrescos' },
  { id: 'cona', nombre: 'Conaprole', empresa: null },
  { id: 'ort', nombre: 'Universidad ORT', empresa: 'ORT' },
  { id: 'mov', nombre: 'Movistar', empresa: 'Telefónica Móviles' },
  { id: 'sb', nombre: 'SBI', empresa: null },
  { id: 'dup1', nombre: 'Lema', empresa: null },
  { id: 'dup2', nombre: 'LEMA', empresa: null },
]

describe('ventas históricas', () => {
  it('nombre base sin el detalle de campaña', () => {
    expect(nombreBaseCliente('Coca Cola ( Lat. Full )')).toBe('Coca Cola')
    expect(nombreBaseCliente('Movistar - curva (mayo)')).toBe('Movistar')
    expect(nombreBaseCliente('Black & Decker (UVA)')).toBe('Black & Decker')
    expect(nombreBaseCliente('Piano Piano')).toBe('Piano Piano')
  })
  it('empareja por nombre, empresa o comienzo del texto', () => {
    expect(emparejarCliente('Coca Cola - promo tapitas', clientes)).toBe('coca')
    expect(emparejarCliente('Conaprole renovacion anual', clientes)).toBe('cona')
    expect(emparejarCliente('ORT Post Grados', clientes)).toBe('ort')
    expect(emparejarCliente('SBI ( Renovación + LED )', clientes)).toBe('sb')
    expect(emparejarCliente('Movistar NOVIEMBRE', clientes)).toBe('mov')
  })
  it('no asocia si no está o si es ambiguo', () => {
    expect(emparejarCliente('Ortopedia Central', clientes)).toBeNull()
    expect(emparejarCliente('Lema', clientes)).toBeNull()
    expect(emparejarCliente('Mostaza', clientes)).toBeNull()
  })
  it('vendedores por nombre y apodo; los que ya no están quedan sin perfil', () => {
    const perfiles = [{ id: 'g', nombre: 'Gonzalo' }, { id: 'f', nombre: 'Federico' }, { id: 'fa', nombre: 'Fabián' }, { id: 'p', nombre: '[PRUEBA] Federico' }]
    expect(emparejarVendedor('GONZALO', perfiles)).toBe('g')
    expect(emparejarVendedor('FEDE', perfiles)).toBe('f')
    expect(emparejarVendedor('FABIAN', perfiles)).toBe('fa')
    expect(emparejarVendedor('NACHO', perfiles)).toBeNull()
    expect(emparejarVendedor('CAMILLE / NATALIA', perfiles)).toBeNull()
  })
  it('trimestres y nombres', () => {
    expect(trimestreDe('2026-03-31')).toBe(1)
    expect(trimestreDe('2026-04-01')).toBe(2)
    expect(trimestreDe('2026-11-24')).toBe(4)
    expect(nombrePropio('CAMILLE / NATALIA')).toBe('Camille / Natalia')
  })
})
