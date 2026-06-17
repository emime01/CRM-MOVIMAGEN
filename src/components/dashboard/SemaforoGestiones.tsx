'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertCircle, Calendar, Check } from 'lucide-react'

interface Item {
  id: string
  descripcion: string | null
  estado: string
  proxima_gestion: string
  nota_gestion: string | null
  cliente: string | null
  vendedor: string | null
  semaforo: 'rojo' | 'amarillo' | 'verde'
  dias_faltantes: number
}

const COLORES = {
  rojo:     { dot: '#dc2626', bg: 'rgba(220,38,38,0.06)', label: 'Atrasada' },
  amarillo: { dot: '#d97706', bg: 'rgba(217,119,6,0.06)', label: 'Hoy' },
  verde:    { dot: '#16a34a', bg: 'rgba(21,128,61,0.06)', label: 'Próxima' },
}

function fmtDate(d: string) {
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${day}/${m}/${y}`
}

export default function SemaforoGestiones({ ventana = 14 }: { ventana?: number }) {
  const [items, setItems] = useState<Item[]>([])
  const [resumen, setResumen] = useState({ rojo: 0, amarillo: 0, verde: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/leads/proximas-gestiones?ventana=${ventana}`)
      .then(r => r.json())
      .then(d => { setItems(d.items ?? []); setResumen(d.resumen ?? { rojo: 0, amarillo: 0, verde: 0 }) })
      .finally(() => setLoading(false))
  }, [ventana])

  const total = resumen.rojo + resumen.amarillo + resumen.verde

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Próximas gestiones</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Leads con seguimiento programado (próximos {ventana} días)</div>
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: 11, fontWeight: 700 }}>
          {(['rojo', 'amarillo', 'verde'] as const).map(c => (
            <span key={c} style={{ padding: '3px 8px', borderRadius: 5, background: COLORES[c].bg, color: COLORES[c].dot, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: COLORES[c].dot }} />
              {resumen[c]}
            </span>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 14 }}>Cargando…</div>
      ) : total === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)', padding: 18 }}>
          <Check size={14} color="#16a34a" /> Sin gestiones pendientes
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
          {items.map(it => {
            const col = COLORES[it.semaforo]
            const sublinea = it.semaforo === 'rojo'
              ? `Atrasada ${-it.dias_faltantes}d`
              : it.semaforo === 'amarillo' ? 'Hoy' : `En ${it.dias_faltantes}d`
            return (
              <Link
                key={it.id}
                href={`/dashboard/leads/${it.id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 7, background: col.bg,
                  textDecoration: 'none', color: 'var(--text-primary)',
                  borderLeft: `3px solid ${col.dot}`,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.dot, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {it.cliente ?? '—'}
                  </div>
                  {it.nota_gestion && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
                      {it.nota_gestion}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: col.dot }}>{sublinea}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1, display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
                    <Calendar size={9} /> {fmtDate(it.proxima_gestion)}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
