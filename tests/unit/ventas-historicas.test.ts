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
  it('reconoce las partes de un nombre compuesto y sin espacios', () => {
    const cs = [
      { id: 'cc', nombre: 'Coca Cola - Sprite - Fanta', empresa: null },
      { id: 'mt', nombre: 'Movistar / Tigo', empresa: null },
      { id: 'py', nombre: 'PedidosYa', empresa: null },
      { id: 'u1', nombre: 'Unilever (programatica)', empresa: null },
      { id: 'u2', nombre: 'Unilever (tradicional)', empresa: null },
    ]
    expect(emparejarCliente('Coca Cola Verano', cs)).toBe('cc')
    expect(emparejarCliente('Movistar NOVIEMBRE', cs)).toBe('mt')
    expect(emparejarCliente('Pedidos Ya', cs)).toBe('py')
    expect(emparejarCliente('UNILEVER', cs)).toBeNull() // dos cuentas de Unilever: ambiguo
  })
  it('el nombre completo gana a una parte; las partes genéricas no cuentan', () => {
    const cs = [
      { id: 'sb', nombre: 'SBI Seguros', empresa: null },
      { id: 'sb2', nombre: 'SBI Seguros (Marcelo Lena)', empresa: null },
      { id: 'ms', nombre: 'Montesol - yerba / café - Madre Tierra', empresa: null },
      { id: 'rbs', nombre: 'RBS - Peliculas', empresa: null },
    ]
    expect(emparejarCliente('SBI Seguros', cs)).toBe('sb')
    expect(emparejarCliente('YERBA SARA', cs)).toBeNull()
    expect(emparejarCliente('RBS', cs)).toBe('rbs')
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
