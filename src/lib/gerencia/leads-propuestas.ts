/**
 * Leads abiertos y propuestas enviadas, por vendedor: cuántos leads ya
 * recibieron al menos una propuesta, cuántos siguen sin cotizar y cuántas
 * propuestas (contando versiones) se mandaron por lead.
 */

export interface FilaLeadsPropuestas {
  id: string
  nombre: string
  leads: number
  conPropuesta: number
  sinPropuesta: number
  propuestas: number
  /** Propuestas enviadas por lead cotizado (null si ninguno). */
  promedio: number | null
  /** % de leads abiertos que ya recibieron propuesta. */
  pctCotizado: number | null
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null)

export function construirLeadsPropuestas(input: {
  perfiles: ReadonlyArray<{ id: string; nombre: string; rol?: string | null }>
  leads: ReadonlyArray<{ id: string; vendedor_id?: string | null }>
  propuestas: ReadonlyArray<{ lead_id?: string | null }>
}): { filas: FilaLeadsPropuestas[]; total: FilaLeadsPropuestas } {
  const porLead = new Map<string, number>()
  for (const p of input.propuestas) if (p.lead_id) porLead.set(p.lead_id, (porLead.get(p.lead_id) ?? 0) + 1)

  const fila = (id: string, nombre: string, leads: ReadonlyArray<{ id: string }>): FilaLeadsPropuestas => {
    const cotizados = leads.filter(l => (porLead.get(l.id) ?? 0) > 0)
    const propuestas = cotizados.reduce((t, l) => t + (porLead.get(l.id) ?? 0), 0)
    return {
      id, nombre, leads: leads.length, conPropuesta: cotizados.length, sinPropuesta: leads.length - cotizados.length,
      propuestas, promedio: cotizados.length ? Math.round((propuestas / cotizados.length) * 10) / 10 : null,
      pctCotizado: pct(cotizados.length, leads.length),
    }
  }

  const filas: FilaLeadsPropuestas[] = []
  for (const p of input.perfiles) {
    const suyos = input.leads.filter(l => l.vendedor_id === p.id)
    if (!suyos.length) continue
    filas.push(fila(p.id, p.nombre, suyos))
  }
  filas.sort((a, b) => b.leads - a.leads || a.nombre.localeCompare(b.nombre))
  const ids = new Set(filas.map(f => f.id))
  const total = fila('total', 'Total', input.leads.filter(l => l.vendedor_id && ids.has(l.vendedor_id)))
  return { filas, total }
}
