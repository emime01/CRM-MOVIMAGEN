import { describe, it, expect } from 'vitest'
import { construirLeadsPropuestas } from '@/lib/gerencia/leads-propuestas'

describe('construirLeadsPropuestas', () => {
  const perfiles = [{ id: 'v1', nombre: 'Fabián' }, { id: 'g1', nombre: 'Gonzalo', rol: 'gerente_comercial' }, { id: 'v2', nombre: 'Sin leads' }]
  const leads = [{ id: 'l1', vendedor_id: 'v1' }, { id: 'l2', vendedor_id: 'v1' }, { id: 'l3', vendedor_id: 'v1' }, { id: 'l4', vendedor_id: 'g1' }]
  const propuestas = [{ lead_id: 'l1' }, { lead_id: 'l1' }, { lead_id: 'l1' }, { lead_id: 'l2' }, { lead_id: 'l4' }, { lead_id: 'otro' }]

  it('cuenta leads cotizados, sin cotizar y propuestas por lead', () => {
    const { filas, total } = construirLeadsPropuestas({ perfiles, leads, propuestas })
    const f = filas.find(x => x.id === 'v1')!
    expect(f).toMatchObject({ leads: 3, conPropuesta: 2, sinPropuesta: 1, propuestas: 4, promedio: 2, pctCotizado: 67 })
    expect(filas.find(x => x.id === 'g1')).toMatchObject({ leads: 1, conPropuesta: 1, propuestas: 1 })
    expect(filas.some(x => x.id === 'v2')).toBe(false)
    expect(total).toMatchObject({ leads: 4, conPropuesta: 3, sinPropuesta: 1, propuestas: 5 })
  })

  it('sin propuestas: promedio y % en null/0', () => {
    const { total } = construirLeadsPropuestas({ perfiles, leads: [{ id: 'x', vendedor_id: 'v1' }], propuestas: [] })
    expect(total).toMatchObject({ leads: 1, conPropuesta: 0, promedio: null, pctCotizado: 0 })
  })
})
