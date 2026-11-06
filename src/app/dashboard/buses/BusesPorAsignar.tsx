'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Bus, Check, X } from 'lucide-react'
import type { VentaBus, LineaBus } from '@/lib/buses/por-asignar'

interface BusOpcion { id: string; numero: string; categoria: string | null }

const fmt = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—')

/**
 * Ventas con soportes de bus y cuántos buses tiene asignados cada línea
 * ("FullBus Exclusivo · 1 de 3"). Operaciones elige los buses acá.
 */
export default function BusesPorAsignar({ ventas, buses, tablaLista }: { ventas: VentaBus[]; buses: BusOpcion[]; tablaLista: boolean }) {
  const [abierta, setAbierta] = useState<{ venta: VentaBus; linea: LineaBus } | null>(null)
  const pendientes = ventas.filter(v => v.faltan > 0)
  const [verTodas, setVerTodas] = useState(false)
  const lista = verTodas ? ventas : pendientes

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
          <Bus size={16} /> Buses por asignar
          <span style={{ background: pendientes.length ? '#fef3c7' : '#dcfce7', color: pendientes.length ? '#b45309' : '#15803d', borderRadius: 10, padding: '2px 8px', fontSize: 11 }}>
            {pendientes.length ? `${pendientes.length} venta${pendientes.length > 1 ? 's' : ''}` : 'al día'}
          </span>
        </div>
        <button onClick={() => setVerTodas(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--orange)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
          {verTodas ? 'Sólo pendientes' : 'Ver todas'}
        </button>
      </div>
      {!tablaLista && (
        <div style={{ padding: '10px 18px', background: '#fef3c7', color: '#92400e', fontSize: 12 }}>
          Falta correr la migración v46 en Supabase: hasta entonces cada línea admite un solo bus.
        </div>
      )}
      {lista.length === 0 ? (
        <div style={{ padding: '18px', fontSize: 13, color: 'var(--text-muted)' }}>No hay ventas con buses pendientes de asignar.</div>
      ) : lista.map(v => (
        <div key={v.id} style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
            <a href={`/dashboard/ventas/${v.id}`} style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textDecoration: 'none' }}>
              OIC #{v.numero} · {v.cliente}
            </a>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fmt(v.desde)} → {fmt(v.hasta)}</span>
          </div>
          {v.lineas.map(l => {
            const completa = l.buses.length >= l.cantidad
            return (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '4px 0', fontSize: 12 }}>
                <span style={{ minWidth: 170, color: 'var(--text-secondary)', fontWeight: 600 }}>{l.soporte}</span>
                <span style={{ color: completa ? '#15803d' : '#b45309', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {completa ? <Check size={12} /> : <AlertTriangle size={12} />} {l.buses.length} de {l.cantidad}
                </span>
                <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {l.buses.map(b => <span key={b.id} style={{ background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 6px' }}>#{b.numero}</span>)}
                </span>
                <button onClick={() => setAbierta({ venta: v, linea: l })}
                  style={{ marginLeft: 'auto', padding: '4px 10px', borderRadius: 6, border: '1px solid var(--orange)', background: completa ? 'transparent' : 'var(--orange)', color: completa ? 'var(--orange)' : '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                  {completa ? 'Cambiar' : 'Elegir buses'}
                </button>
              </div>
            )
          })}
        </div>
      ))}
      {abierta && <ElegirBuses venta={abierta.venta} linea={abierta.linea} buses={buses} onClose={() => setAbierta(null)} />}
    </div>
  )
}

function ElegirBuses({ venta, linea, buses, onClose }: { venta: VentaBus; linea: LineaBus; buses: BusOpcion[]; onClose: () => void }) {
  const router = useRouter()
  const [elegidos, setElegidos] = useState<string[]>(linea.buses.map(b => b.id))
  const [q, setQ] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const filtrados = useMemo(() => buses.filter(b => !q.trim() || b.numero.includes(q.trim())).slice(0, 300), [buses, q])

  const toggle = (id: string) => setElegidos(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= linea.cantidad ? prev : [...prev, id])

  async function guardar() {
    setGuardando(true); setMsg(null)
    const res = await fetch(`/api/orden-items/${linea.id}/buses`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bus_ids: elegidos }),
    })
    const data = await res.json().catch(() => ({}))
    setGuardando(false)
    if (!res.ok) { setMsg(data.error ?? 'No se pudo guardar'); return }
    router.refresh()
    if (data.conflictos?.length) {
      setMsg('No se asignaron: ' + data.conflictos.map((c: any) => `#${c.numero} (${c.motivo})`).join(', '))
      setElegidos(prev => prev.filter(id => !data.conflictos.some((c: any) => c.bus_id === id)))
      return
    }
    if (data.aviso) { setMsg(data.aviso); return }
    onClose()
  }

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #e5e3dc' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800 }}>{linea.soporte} · {elegidos.length} de {linea.cantidad}</div>
            <div style={{ fontSize: 12, color: '#6e6a62' }}>OIC #{venta.numero} · {venta.cliente} · {fmt(venta.desde)} → {fmt(venta.hasta)}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
        </div>
        <div style={{ padding: '10px 18px' }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por número de bus…"
            style={{ width: '100%', height: 36, padding: '0 10px', border: '1px solid #e5e3dc', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
        </div>
        <div style={{ overflowY: 'auto', padding: '0 18px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 6 }}>
          {filtrados.map(b => {
            const on = elegidos.includes(b.id)
            return (
              <button key={b.id} onClick={() => toggle(b.id)}
                style={{ padding: '6px 4px', borderRadius: 6, border: `1px solid ${on ? 'var(--orange)' : '#e5e3dc'}`, background: on ? '#fdf0e7' : '#fff', cursor: 'pointer', fontSize: 12, fontWeight: on ? 700 : 500 }}>
                #{b.numero}
                {b.categoria && <div style={{ fontSize: 9, color: '#9a9895' }}>{b.categoria.replace('_', ' ')}</div>}
              </button>
            )
          })}
        </div>
        {msg && <div style={{ margin: '10px 18px 0', fontSize: 12, color: '#b91c1c' }}>{msg}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid #e5e3dc', marginTop: 10 }}>
          <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e3dc', background: '#fff', cursor: 'pointer' }}>Cancelar</button>
          <button onClick={guardar} disabled={guardando}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--orange)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
