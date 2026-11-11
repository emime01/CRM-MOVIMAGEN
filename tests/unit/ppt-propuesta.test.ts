import { describe, it, expect } from 'vitest'
import { ubicacionCorta, shoppingDe } from '@/lib/cotizador/ppt-propuesta'

describe('ubicacionCorta', () => {
  it('corta en el guion con espacios', () => {
    expect(ubicacionCorta('Av Italia y Caldas - visual publico hacia el Este')).toBe('Av Italia y Caldas')
  })
  it('corta en punto medio, barra y paréntesis', () => {
    expect(ubicacionCorta('Rambla Mansa · Parada 5')).toBe('Rambla Mansa')
    expect(ubicacionCorta('Bv. Artigas / 18 de Julio')).toBe('Bv. Artigas')
    expect(ubicacionCorta('Rambla (frente al mar)')).toBe('Rambla')
    expect(ubicacionCorta('Av. Italia – esquina Propios')).toBe('Av. Italia')
  })
  it('un guion pegado a una palabra no corta', () => {
    expect(ubicacionCorta('Ruta 8 Brigadier-General')).toBe('Ruta 8 Brigadier-General')
  })
  it('vacío o nulo → null', () => {
    expect(ubicacionCorta(null)).toBeNull()
    expect(ubicacionCorta(undefined)).toBeNull()
    expect(ubicacionCorta('')).toBeNull()
    expect(ubicacionCorta('   ')).toBeNull()
  })
})

describe('shoppingDe', () => {
  it('detecta el shopping por nombre o ubicación, ignorando tildes y mayúsculas', () => {
    expect(shoppingDe({ nombre: 'Pantalla Colonia Shopping', ubicacion: null })).toBe('colonia')
    expect(shoppingDe({ nombre: 'LED', ubicacion: 'Paysandú Shopping' })).toBe('paysandu')
    expect(shoppingDe({ nombre: 'Banner Salto', ubicacion: null })).toBe('salto')
    expect(shoppingDe({ nombre: 'Banner', ubicacion: 'Mercedes' })).toBe('mercedes')
    expect(shoppingDe({ nombre: 'Banner', ubicacion: 'Minas' })).toBe('minas')
  })
  it('Punta del Este es el shopping Atlántico', () => {
    expect(shoppingDe({ nombre: 'Pantalla', ubicacion: 'Punta del Este' })).toBe('atlantico')
    expect(shoppingDe({ nombre: 'Pantalla Atlántico', ubicacion: null })).toBe('atlantico')
  })
  it('un soporte callejero sin shopping → null', () => {
    expect(shoppingDe({ nombre: 'Medianera 18 de Julio', ubicacion: 'Montevideo' })).toBeNull()
    expect(shoppingDe({ nombre: 'Bus', ubicacion: null })).toBeNull()
  })
  // BUG PROBABLE (no se corrige acá): la detección es por subcadena, así que una medianera en
  // la Av. Colonia o en la calle Mercedes de Montevideo se toma por el shopping de Colonia o
  // Mercedes y se le pone ese logo en la presentación.
  it.todo('una calle "Mercedes" o "Av. Colonia" de Montevideo no es el shopping de esa ciudad')
})
