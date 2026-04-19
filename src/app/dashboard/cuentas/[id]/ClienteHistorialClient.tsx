'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

const fmt = (n: number | null) =>
  n == null ? '—' : '$' + Number(n).toLocaleString('es-UY', { maximumFractionDigits: 0 })

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })

const y = new Date().getFullYear()
const QUARTER_OPTIONS = [
  { value: '', label: 'Todos los cuatrimestres' },
  { value: `Q1-${y}`, label: `Q1-${y}` },
  { value: `Q2-${y}`, label: `Q2-${y}` },
  { value: `Q3-${y}`, label: `Q3-${y}` },
]

type JR<T> = T | T[] | null
function jn<T>(v: JR<T>): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

interface Cliente {
  id: string; nombre: string; empresa: string | null
  email: string | null; telefono: string | null; rut: string | null
  tipo_cliente: string | null
  perfiles: JR<{ nombre: string }>
}

interface Lead {
  id: string; estado: string; descripcion: string | null
  monto_potencial: number | null; cuatrimestre: string | null
  notas: string | null; created_at: string
  perfiles: JR<{ nombre: string }>
}

interface Orden {
  id: string; estado: string; monto_total: number | null
  cuatrimestre_asociado: string | null; created_at: string
  perfiles: JR<{ nombre: string }>
}

interface Objetivo {
  objetivo_c1: number | null; objetivo_c2: number | null
  objetivo_c3: number | null; ponderacion_pct: number | null; year: number
}

const ESTADO_LEAD: Record<string, { color: string; bg: string; label: string }> = {
  nuevo:             { color: '#6b7280', bg: '#f3f4f6', label: 'Nuevo' },
  en_conversacion:   { color: '#1d4ed8', bg: '#eff6ff', label: 'En conversación' },
  propuesta_enviada: { color: '#92400e', bg: '#fffbeb', label: 'Propuesta enviada' },
  negociacion:       { color: '#c45a10', bg: '#fef3ec', label: 'Negociación' },
  ganado:            { color: '#166534', bg: '#e6f7ef', label: 'Ganado' },
  perdido:           { color: '#991b1b', bg: '#fef0f0', label: 'Perdido' },
}

const ESTADO_ORDEN: Record<string, { color: string; bg: string; label: string }> = {
  borrador:             { color: '#6b7280', bg: '#f3f4f6', label: 'Borrador' },
  pendiente_aprobacion: { color: '#d97706', bg: '#fffbeb', label: 'Pend. aprobación' },
  aprobada:             { color: '#16a34a', bg: '#f0fdf4', label: 'Aprobada' },
  en_oic:               { color: '#c45a10', bg: '#fef3ec', label: 'En OIC' },
  facturada:            { color: '#0284c7', bg: '#eff6ff', label: 'Facturada' },
  cobrada:              { color: '#15803d', bg: '#dcfce7', label: 'Cobrada' },
  rechazada:            { color: '#dc2626', bg: '#fef2f2', label: 'Rechazada' },
}

function Badge({ estado, map }: { estado: string; map: Record<string, { color: string; bg: string; label: string }> }) {
  const s = map[estado] ?? { color: '#6b7280', bg: '#f3f4f6', label: estado }
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, color: s.color, background: s.bg }}>
      {s.label}
    </span>
  )
}

export default function ClienteHistorialClient({ cliente, leads, ordenes, objetivo }: {
  cliente: Cliente; leads: Lead[]; ordenes: Orden[]; objetivo: Objetivo | null
}) {
  const [tab, setTab] = useState<'leads' | 'ventas'>('leads')
  const [cuatrimestre, setCuatrimestre] = useState('')

  const filteredLeads = useMemo(() =>
    cuatrimestre ? leads.filter(l => l.cuatrimestre === cuatrimestre) : leads,
    [leads, cuatrimestre])

  const filteredOrdenes = useMemo(() =>
    cuatrimestre ? ordenes.filter(o => o.cuatrimestre_asociado === cuatrimestre) : ordenes,
    [ordenes, cuatrimestre])

  const vendedor = jn(cliente.perfiles)?.nombre ?? '—'
  const totalVentas = ordenes.filter(o => ['aprobada','en_oic','facturada','cobrada'].includes(o.estado)).reduce((s, o) => s + Number(o.monto_total ?? 0), 0)
  const leadsGanados = leads.filter(l => l.estado === 'ganado').length

  const tabBtn = (t: typeof tab): React.CSSProperties => ({
    padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: tab === t ? 700 : 500, fontFamily: 'Montserrat, sans-serif',
    background: tab === t ? 'var(--orange)' : 'transparent',
    color: tab === t ? '#fff' : 'var(--text-secondary)',
  })

  const selectStyle: React.CSSProperties = {
    padding: '7px 28px 7px 10px', border: '1px solid var(--border)', borderRadius: 8,
    fontSize: 13, fontFamily: 'Montserrat, sans-serif', color: 'var(--text-primary)',
    background: '#fff', cursor: 'pointer', outline: 'none', appearance: 'none',
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239a9895' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
  }

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      {/* Back */}
      <Link href="/dashboard/cuentas" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none', marginBottom: 18 }}>
        <ArrowLeft size={14} /> Volver a Cuentas
      </Link>

      {/* Header */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{cliente.nombre}</h2>
            {cliente.empresa && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>{cliente.empresa}</div>}
            <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
              {cliente.email && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{cliente.email}</span>}
              {cliente.telefono && <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{cliente.telefono}</span>}
              {cliente.rut && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>RUT: {cliente.rut}</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Vendedor: <strong>{vendedor}</strong></div>
          </div>
          {/* KPIs */}
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'Total ventas', value: fmt(totalVentas), color: 'var(--orange)' },
              { label: 'Leads ganados', value: String(leadsGanados), color: '#15803d' },
              { label: 'Total leads', value: String(leads.length), color: 'var(--text-primary)' },
            ].map(k => (
              <div key={k.label} style={{ background: 'var(--bg-app)', borderRadius: 8, padding: '10px 16px', minWidth: 110, textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Objetivos */}
        {objetivo && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', alignSelf: 'center' }}>
              Objetivos {objetivo.year} ({objetivo.ponderacion_pct ?? 100}% pond.)
            </div>
            {[['C1', objetivo.objetivo_c1], ['C2', objetivo.objetivo_c2], ['C3', objetivo.objetivo_c3]].map(([q, v]) => (
              <div key={String(q)} style={{ fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)', marginRight: 4 }}>{q}:</span>
                <strong style={{ color: 'var(--text-primary)' }}>{fmt(v as number | null)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabs + filter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 4 }}>
          <button style={tabBtn('leads')} onClick={() => setTab('leads')}>
            Leads <span style={{ opacity: 0.7, marginLeft: 4, fontSize: 11 }}>({leads.length})</span>
          </button>
          <button style={tabBtn('ventas')} onClick={() => setTab('ventas')}>
            Ventas <span style={{ opacity: 0.7, marginLeft: 4, fontSize: 11 }}>({ordenes.length})</span>
          </button>
        </div>
        <select value={cuatrimestre} onChange={e => setCuatrimestre(e.target.value)} style={selectStyle}>
          {QUARTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Leads tab */}
      {tab === 'leads' && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          {filteredLeads.length === 0 ? (
            <p style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>Sin leads para este período.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
                  {['Fecha', 'Estado', 'Descripción', 'Monto potencial', 'Cuatrimestre', 'Vendedor'].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredLeads.map(l => (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(l.created_at)}</td>
                    <td style={{ padding: '12px 16px' }}><Badge estado={l.estado} map={ESTADO_LEAD} /></td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', maxWidth: 240 }}>{l.descripcion ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--orange)' }}>{fmt(l.monto_potencial)}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12 }}>{l.cuatrimestre ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>{jn(l.perfiles)?.nombre ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Ventas tab */}
      {tab === 'ventas' && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          {filteredOrdenes.length === 0 ? (
            <p style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>Sin ventas para este período.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
                  {['Fecha', 'Estado', 'Monto', 'Cuatrimestre', 'Vendedor', ''].map(h => (
                    <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredOrdenes.map(o => (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>{fmtDate(o.created_at)}</td>
                    <td style={{ padding: '12px 16px' }}><Badge estado={o.estado} map={ESTADO_ORDEN} /></td>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(o.monto_total)}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12 }}>{o.cuatrimestre_asociado ?? '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>{jn(o.perfiles)?.nombre ?? '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <Link href={`/dashboard/ventas/${o.id}`} style={{ fontSize: 11, color: 'var(--orange)', textDecoration: 'none', fontWeight: 600 }}>
                        Ver detalle →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
