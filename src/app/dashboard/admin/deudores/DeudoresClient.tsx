'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Phone, Plus, X } from 'lucide-react'

export interface DeudorRow {
  id: string
  numero: number | null
  cliente: string
  monto_total: number | null
  moneda: string
  vendedor: string
  dias: number
  ultima_gestion: { tipo: string; created_at: string; proxima_accion: string | null } | null
}

const TIPO_LABEL: Record<string, string> = {
  llamada: 'Llamada', email: 'Email', whatsapp: 'WhatsApp',
  visita: 'Visita', promesa_pago: 'Promesa de pago', otro: 'Otro',
}

const fmt = (n: number | null, moneda: string) => {
  const sym = moneda === 'USD' ? 'U$S' : '$'
  return `${sym} ${Number(n ?? 0).toLocaleString('es-UY', { maximumFractionDigits: 0 })}`
}
const fmtFecha = (s: string | null) => {
  if (!s) return '—'
  return new Date(s.length <= 10 ? s + 'T12:00:00' : s).toLocaleDateString('es-UY', { day: '2-digit', month: 'short' })
}

const urgencyColor = (d: number) => (d > 60 ? '#dc2626' : d > 30 ? '#d97706' : '#0284c7')
const urgencyLabel = (d: number) => (d > 60 ? 'Crítico' : d > 30 ? 'Vencido' : 'Vigente')
const urgencyBg = (d: number) => (d > 60 ? 'rgba(220,38,38,0.1)' : d > 30 ? 'rgba(217,119,6,0.1)' : 'rgba(2,132,199,0.1)')

export default function DeudoresClient({ rows }: { rows: DeudorRow[] }) {
  const router = useRouter()
  const [target, setTarget] = useState<DeudorRow | null>(null)
  const [tipo, setTipo] = useState('llamada')
  const [nota, setNota] = useState('')
  const [proxima, setProxima] = useState('')
  const [saving, setSaving] = useState(false)

  const totalDeuda = rows.reduce((s, o) => s + Number(o.monto_total ?? 0), 0)
  const totalVencido = rows.filter(r => r.dias > 30).reduce((s, o) => s + Number(o.monto_total ?? 0), 0)

  function abrir(row: DeudorRow) {
    setTarget(row); setTipo('llamada'); setNota(''); setProxima('')
  }

  async function guardar() {
    if (!target) return
    setSaving(true)
    try {
      const res = await fetch('/api/cobranza', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orden_id: target.id, tipo, nota: nota.trim() || undefined, proxima_accion: proxima || undefined }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Error al registrar'); return }
      setTarget(null)
      router.refresh()
    } finally { setSaving(false) }
  }

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total en deuda', value: '$ ' + totalDeuda.toLocaleString('es-UY', { maximumFractionDigits: 0 }), color: 'var(--text-primary)' },
          { label: 'Monto vencido (+30 días)', value: '$ ' + totalVencido.toLocaleString('es-UY', { maximumFractionDigits: 0 }), color: '#d97706' },
          { label: 'Órdenes pendientes', value: String(rows.length), color: 'var(--text-primary)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          Órdenes facturadas sin cobrar
        </div>
        {rows.length === 0 ? (
          <p style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Sin deudores registrados.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
                {['N° Orden', 'Cliente', 'Monto', 'Días', 'Estado', 'Última gestión', ''].map((h, i) => (
                  <th key={h || i} style={{ padding: '10px 16px', textAlign: i === 2 || i === 3 ? 'right' : 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', ...(i === 4 ? { textAlign: 'center' } : {}) }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(o => (
                <tr key={o.id} style={{ borderBottom: '1px solid var(--border)', background: o.dias > 60 ? 'rgba(220,38,38,0.03)' : 'transparent' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 700, fontFamily: 'monospace', fontSize: 12 }}>
                    <Link href={`/dashboard/ventas/${o.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>{o.numero ?? '—'}</Link>
                  </td>
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>{o.cliente}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(o.monto_total, o.moneda)}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: urgencyColor(o.dias) }}>{o.dias}d</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{ background: urgencyBg(o.dias), color: urgencyColor(o.dias), padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700 }}>{urgencyLabel(o.dias)}</span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                    {o.ultima_gestion ? (
                      <div>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{TIPO_LABEL[o.ultima_gestion.tipo] ?? o.ultima_gestion.tipo}</span>
                        {' · '}{fmtFecha(o.ultima_gestion.created_at)}
                        {o.ultima_gestion.proxima_accion && (
                          <div style={{ fontSize: 11, color: '#d97706' }}>↻ próx. {fmtFecha(o.ultima_gestion.proxima_accion)}</div>
                        )}
                      </div>
                    ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button onClick={() => abrir(o)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: '#fff', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <Plus size={13} /> Gestión
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal registrar gestión */}
      {target && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setTarget(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 440, maxWidth: '92vw' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Phone size={16} style={{ color: 'var(--orange)' }} /> Registrar gestión de cobranza
              </h3>
              <button onClick={() => setTarget(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9a9895', padding: 4 }}><X size={16} /></button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>
              {target.cliente} · OIC {target.numero ?? target.id.slice(0, 6)} · {fmt(target.monto_total, target.moneda)}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Tipo de gestión
                <select value={tipo} onChange={e => setTipo(e.target.value)} style={inp}>
                  {Object.entries(TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Nota
                <textarea value={nota} onChange={e => setNota(e.target.value)} rows={3} placeholder="Ej: Hablé con contaduría, prometen pago el viernes." style={{ ...inp, resize: 'vertical' }} />
              </label>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                Próxima acción (opcional)
                <input type="date" value={proxima} onChange={e => setProxima(e.target.value)} style={inp} />
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button onClick={() => setTarget(null)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={guardar} disabled={saving} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--orange)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
                {saving ? 'Guardando…' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 10px', marginTop: 4, border: '1px solid var(--border)', borderRadius: 7,
  fontSize: 13, fontFamily: 'Montserrat, sans-serif', boxSizing: 'border-box',
}
