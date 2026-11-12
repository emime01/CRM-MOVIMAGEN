import { comoNeto, sumarPorMoneda, type TotalPorMoneda } from '@/lib/money'

/**
 * Embudo comercial por vendedor: leads creados → propuestas enviadas → ventas.
 * Las ventas se miden sin IVA (monto_neto), como los objetivos.
 */

export interface PerfilEmbudo { id: string; nombre: string; rol?: string | null }
export interface FilaEmbudo {
  id: string
  nombre: string
  leads: number
  propuestas: number
  ventas: number
  /** propuestas ÷ leads, en %. null si no hay leads. */
  convLeadPropuesta: number | null
  /** ventas ÷ propuestas, en %. null si no hay propuestas. */
  convPropuestaVenta: number | null
  /** ventas ÷ leads, en %. null si no hay leads. */
  convTotal: number | null
  monto: TotalPorMoneda
}

const conv = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null)

export function construirEmbudo(input: {
  perfiles: readonly PerfilEmbudo[]
  leads: ReadonlyArray<{ vendedor_id?: string | null }>
  propuestas: ReadonlyArray<{ vendedor_id?: string | null }>
  ventas: ReadonlyArray<{ vendedor_id?: string | null; monto_neto?: unknown; monto_total?: unknown; moneda?: unknown }>
}): { filas: FilaEmbudo[]; total: FilaEmbudo } {
  const filas: FilaEmbudo[] = []
  for (const p of input.perfiles) {
    const leads = input.leads.filter(l => l.vendedor_id === p.id).length
    const propuestas = input.propuestas.filter(x => x.vendedor_id === p.id).length
    const ventasP = input.ventas.filter(v => v.vendedor_id === p.id)
    // El gerente que vende entra como un vendedor más, pero sólo con actividad.
    if (p.rol === 'gerente_comercial' && leads + propuestas + ventasP.length === 0) continue
    filas.push(fila(p.id, p.nombre, leads, propuestas, ventasP))
  }
  filas.sort((a, b) => b.ventas - a.ventas || b.propuestas - a.propuestas || a.nombre.localeCompare(b.nombre))
  // Total del equipo: sólo de los que aparecen en la tabla.
  const ids = new Set(filas.map(f => f.id))
  const total = fila(
    'total', 'Total',
    input.leads.filter(l => l.vendedor_id && ids.has(l.vendedor_id)).length,
    input.propuestas.filter(x => x.vendedor_id && ids.has(x.vendedor_id)).length,
    input.ventas.filter(v => v.vendedor_id && ids.has(v.vendedor_id)),
  )
  return { filas, total }
}

function fila(id: string, nombre: string, leads: number, propuestas: number, ventas: ReadonlyArray<any>): FilaEmbudo {
  return {
    id, nombre, leads, propuestas, ventas: ventas.length,
    convLeadPropuesta: conv(propuestas, leads),
    convPropuestaVenta: conv(ventas.length, propuestas),
    convTotal: conv(ventas.length, leads),
    monto: sumarPorMoneda(comoNeto(ventas)),
  }
}
