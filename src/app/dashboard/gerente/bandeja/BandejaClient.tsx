'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, X, Inbox, FileText, CalendarClock, ChevronRight } from 'lucide-react'

interface OrdenPend {
  id: string
  numero: number | null
  monto_total: number | null
  moneda: string
  marca: string | null
  created_at: string
  cliente: string
  vendedor: string
}

interface ReservaPend {
  id: string
  fecha_desde: string
  fecha_hasta: string
  created_at: string
  cliente: string
  vendedor: string
  total_soportes: number
  soportes: string[]
}

const fmtMoney = (n: number | null, moneda: string) => {
  if (n == null) return '—'
  const sym = moneda === 'USD' ? 'U$S' : '$'
  return `${sym} ${Number(n).toLocaleString('es-UY', { maximumFractionDigits: 0 })}`
}

const fmtDate = (s: string | null) => {
  if (!s) return '—'
  return new Date(s.length <= 10 ? s + 'T12:00:00' : s).toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })
}

const diasDesde = (s: string) => {
  const d = Math.floor((Date.now() - new Date(s).getTime()) / 86400000)
  if (d <= 0) return 'hoy'
  if (d === 1) return 'hace 1 día'
  return `hace ${d} días`
}

export default function BandejaClient({
  ordenes, reservas, rol,
}: {
  ordenes: OrdenPend[]
  reservas: ReservaPend[]
  rol: string
}) {
  const router = useRouter()
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [rejectTarget, setRejectTarget] = useState<{ kind: 'orden' | 'reserva'; id: string } | null>(null)
  const [motivo, setMotivo] = useState('')

  const puedeAprobarOIC = rol === 'gerente_comercial'

  async function aprobarOrden(id: string) {
    setLoadingId(id)
    try {
      const res = await fetch(`/api/ordenes/${id}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'aprobada', comentario: 'Aprobada desde bandeja' }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Error al aprobar'); return }
      router.refresh()
    } finally { setLoadingId(null) }
  }

  async function aprobarReserva(id: string) {
    setLoadingId(id)
    try {
      const res = await fetch(`/api/reservas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'aprobada' }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Error al aprobar'); return }
      router.refresh()
    } finally { setLoadingId(null) }
  }

  async function confirmarRechazo() {
    if (!rejectTarget) return
    const { kind, id } = rejectTarget
    setLoadingId(id)
    try {
      const url = kind === 'orden' ? `/api/ordenes/${id}/estado` : `/api/reservas/${id}`
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'rechazada', comentario: motivo.trim() || undefined }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Error al rechazar'); return }
      setRejectTarget(null)
      setMotivo('')
      router.refresh()
    } finally { setLoadingId(null) }
  }

  const total = ordenes.length + reservas.length

  const card: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
    padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16,
  }
  const btnApprove: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8,
    border: 'none', background: '#2f7d3f', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  }
  const btnReject: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8,
    border: '1px solid #c82f2f', background: '#fff', color: '#c82f2f', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  }

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Inbox size={20} style={{ color: 'var(--orange)' }} />
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Bandeja de aprobaciones</h1>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 24px' }}>
        {total === 0 ? 'No hay nada esperando tu decisión.' : `${total} ${total === 1 ? 'ítem requiere' : 'ítems requieren'} tu atención.`}
      </p>

      {total === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <Check size={40} style={{ color: '#2f7d3f', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 14 }}>Todo al día. No hay OICs ni reservas pendientes.</p>
        </div>
      )}

      {/* OICs pendientes de aprobación */}
      {ordenes.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <FileText size={15} style={{ color: 'var(--text-secondary)' }} />
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Órdenes esperando aprobación
              <span style={{ marginLeft: 8, background: 'rgba(217,119,6,0.12)', color: '#d97706', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{ordenes.length}</span>
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ordenes.map(o => (
              <div key={o.id} style={card}>
                <Link href={`/dashboard/ventas/${o.id}`} style={{ flex: 1, minWidth: 0, textDecoration: 'none' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>
                      OIC #{o.numero ? String(o.numero).padStart(5, '0') : o.id.slice(0, 6)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {diasDesde(o.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginTop: 3 }}>
                    {o.cliente}{o.marca ? ` · ${o.marca}` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {fmtMoney(o.monto_total, o.moneda)} · vendedor {o.vendedor}
                  </div>
                </Link>
                {puedeAprobarOIC ? (
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => setRejectTarget({ kind: 'orden', id: o.id })} disabled={loadingId === o.id} style={btnReject}>
                      <X size={14} /> Rechazar
                    </button>
                    <button onClick={() => aprobarOrden(o.id)} disabled={loadingId === o.id} style={btnApprove}>
                      <Check size={14} /> Aprobar
                    </button>
                  </div>
                ) : (
                  <Link href={`/dashboard/ventas/${o.id}`} style={{ color: 'var(--text-muted)', flexShrink: 0 }}><ChevronRight size={18} /></Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reservas pendientes */}
      {reservas.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <CalendarClock size={15} style={{ color: 'var(--text-secondary)' }} />
            <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              Reservas pendientes
              <span style={{ marginLeft: 8, background: 'rgba(37,99,235,0.12)', color: '#2563eb', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>{reservas.length}</span>
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {reservas.map(r => (
              <div key={r.id} style={card}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{r.cliente}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· {diasDesde(r.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                    {fmtDate(r.fecha_desde)} → {fmtDate(r.fecha_hasta)} · {r.total_soportes} soporte{r.total_soportes === 1 ? '' : 's'} · vendedor {r.vendedor}
                  </div>
                  {r.soportes.length > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.soportes.slice(0, 4).join(', ')}{r.soportes.length > 4 ? `, +${r.soportes.length - 4}` : ''}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                  <button onClick={() => setRejectTarget({ kind: 'reserva', id: r.id })} disabled={loadingId === r.id} style={btnReject}>
                    <X size={14} /> Rechazar
                  </button>
                  <button onClick={() => aprobarReserva(r.id)} disabled={loadingId === r.id} style={btnApprove}>
                    <Check size={14} /> Aprobar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setRejectTarget(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 420 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
              Rechazar {rejectTarget.kind === 'orden' ? 'orden' : 'reserva'}
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>
              Indicá el motivo para que el vendedor pueda corregir{rejectTarget.kind === 'orden' ? ' la OIC' : ' la reserva'}.
            </p>
            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              rows={4}
              placeholder="Motivo del rechazo…"
              style={{ width: '100%', padding: 10, border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'Montserrat, sans-serif', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button onClick={() => setRejectTarget(null)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmarRechazo} disabled={loadingId === rejectTarget.id} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#c82f2f', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Rechazar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
