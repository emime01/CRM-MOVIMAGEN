'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, FileText, Plus, Trophy, MessageSquare, Calendar, AlertCircle } from 'lucide-react'

interface Cliente { id: string; nombre: string; empresa: string | null }
interface Vendedor { id: string; nombre: string }
interface Lead {
  id: string
  descripcion: string | null
  monto_potencial: number | null
  cuatrimestre: string | null
  estado: string
  notas: string | null
  motivo_perdida: string | null
  proxima_gestion: string | null
  nota_gestion: string | null
  propuesta_ganadora_id: string | null
  vendedor_id: string
  created_at: string
  updated_at: string | null
  clientes: Cliente | Cliente[] | null
  agencias: { id: string; nombre: string } | { id: string; nombre: string }[] | null
  perfiles: Vendedor | Vendedor[] | null
}
interface Propuesta {
  id: string
  numero: string | null
  nombre: string | null
  estado: string
  moneda: string | null
  monto_neto: number | null
  monto_total: number | null
  fecha_inicio: string | null
  fecha_fin: string | null
  created_at: string
}
interface Props {
  lead: Lead
  propuestas: Propuesta[]
  userRol: string
  userId: string
}

function first<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? v[0] ?? null : v
}
function fmtDate(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${day}/${m}/${y}`
}
function fmtMoney(n: number | null | undefined, moneda: string | null = 'UYU') {
  if (n == null) return '—'
  const sym = moneda === 'USD' ? 'U$S' : '$'
  return sym + Math.round(n).toLocaleString('es-UY')
}
function semaforoColor(fecha: string | null): { color: string; bg: string; label: string } | null {
  if (!fecha) return null
  const hoy = new Date().toISOString().slice(0, 10)
  const dias = Math.floor((Date.parse(fecha + 'T00:00:00') - Date.parse(hoy + 'T00:00:00')) / 86400000)
  if (dias < 0)  return { color: '#dc2626', bg: 'rgba(220,38,38,0.1)',  label: `Atrasada ${-dias}d` }
  if (dias === 0) return { color: '#b45309', bg: 'rgba(217,119,6,0.12)', label: 'Hoy' }
  return { color: '#15803d', bg: 'rgba(21,128,61,0.1)', label: `En ${dias}d` }
}

const ESTADO_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  nuevo:             { bg: '#eef3fd', color: '#2952b5', label: 'Nuevo' },
  en_conversacion:   { bg: '#fff7e5', color: '#b87900', label: 'En conversación' },
  propuesta_enviada: { bg: '#f3ecfa', color: '#6a2fb5', label: 'Propuesta enviada' },
  negociacion:       { bg: '#fff0e3', color: '#d1620e', label: 'Negociación' },
  en_seguimiento:    { bg: '#fff7e5', color: '#b87900', label: 'En seguimiento' },
  ganado:            { bg: '#e8f5ec', color: '#2f7d3f', label: 'Ganado' },
  perdido:           { bg: '#fdecec', color: '#c82f2f', label: 'Perdido' },
}

const PROP_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  borrador:  { bg: '#f1f1ef', color: '#6e6a62', label: 'Borrador' },
  enviada:   { bg: '#fff7e5', color: '#b87900', label: 'Enviada' },
  aceptada:  { bg: '#e8f5ec', color: '#2f7d3f', label: 'Aceptada' },
  rechazada: { bg: '#fdecec', color: '#c82f2f', label: 'Rechazada' },
}

export default function LeadDetalleClient({ lead, propuestas, userRol, userId }: Props) {
  const router = useRouter()
  const cli = first<Cliente>(lead.clientes)
  const ag = first<{ id: string; nombre: string }>(lead.agencias)
  const v = first<Vendedor>(lead.perfiles)
  const esVendedor = userRol === 'vendedor'
  const puedeGestionar = !esVendedor || lead.vendedor_id === userId

  const [marcando, setMarcando] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [nuevaGestion, setNuevaGestion] = useState({ nota: '', fecha: '' })
  const [guardandoGestion, setGuardandoGestion] = useState(false)

  const estadoBadge = ESTADO_BADGE[lead.estado] ?? { bg: '#f1f1ef', color: '#6e6a62', label: lead.estado }
  const sem = semaforoColor(lead.proxima_gestion)

  async function marcarGanadora(propuestaId: string) {
    if (!confirm('¿Marcar esta cotización como ganadora? El lead pasa a "ganado".')) return
    setMarcando(propuestaId); setErrorMsg(null)
    const res = await fetch(`/api/leads/${lead.id}/marcar-ganadora`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ propuesta_id: propuestaId }),
    })
    setMarcando(null)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setErrorMsg(d.error ?? 'Error'); return }
    router.refresh()
  }

  async function guardarGestion() {
    if (!nuevaGestion.nota.trim()) return
    setGuardandoGestion(true); setErrorMsg(null)
    const stamp = new Date().toISOString().slice(0, 10)
    const nuevaNotas = `${lead.notas ? lead.notas + '\n' : ''}[${stamp}] ${nuevaGestion.nota.trim()}`
    const body: Record<string, unknown> = { notas: nuevaNotas, notaGestion: nuevaGestion.nota.trim() }
    if (nuevaGestion.fecha) body.proximaGestion = nuevaGestion.fecha
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setGuardandoGestion(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setErrorMsg(d.error ?? 'Error'); return }
    setNuevaGestion({ nota: '', fecha: '' })
    router.refresh()
  }

  const section: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 18, marginBottom: 14 }
  const sectionTitle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }
  const meta: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)' }

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      <Link href="/dashboard/leads" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontSize: 12, textDecoration: 'none', marginBottom: 12 }}>
        <ChevronLeft size={14} /> Leads
      </Link>

      {/* Header */}
      <div style={{ ...section, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 6 }}>
              {cli?.empresa ?? cli?.nombre ?? '—'}
            </div>
            {lead.descripcion && (
              <div style={{ fontSize: 14, color: 'var(--text-primary)', marginBottom: 8 }}>{lead.descripcion}</div>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 5, background: estadoBadge.bg, color: estadoBadge.color }}>
                {estadoBadge.label.toUpperCase()}
              </span>
              {lead.cuatrimestre && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 5, background: '#f1f1ef', color: '#6e6a62' }}>{lead.cuatrimestre}</span>
              )}
              {sem && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 5, background: sem.bg, color: sem.color }}>
                  <Calendar size={11} /> {sem.label} · {fmtDate(lead.proxima_gestion)}
                </span>
              )}
            </div>
            <div style={{ ...meta, marginTop: 10, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <span>Vendedor: <strong style={{ color: 'var(--text-secondary)' }}>{v?.nombre ?? '—'}</strong></span>
              {ag && <span>Agencia: <strong style={{ color: 'var(--text-secondary)' }}>{ag.nombre}</strong></span>}
              <span>Potencial: <strong style={{ color: 'var(--text-secondary)' }}>{fmtMoney(lead.monto_potencial)}</strong></span>
            </div>
          </div>

          {puedeGestionar && lead.estado !== 'ganado' && lead.estado !== 'perdido' && (
            <Link
              href={`/dashboard/cotizaciones/nueva?lead=${lead.id}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 7, background: 'var(--orange)', color: '#fff',
                fontSize: 12, fontWeight: 700, textDecoration: 'none',
              }}
            >
              <Plus size={13} /> Nueva cotización
            </Link>
          )}
        </div>
      </div>

      {errorMsg && (
        <div style={{ marginBottom: 14, padding: '10px 14px', background: '#fef0f0', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 12, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={14} /> {errorMsg}
        </div>
      )}

      {/* Cotizaciones */}
      <div style={section}>
        <div style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
          <FileText size={13} /> Cotizaciones ({propuestas.length})
        </div>
        {propuestas.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: 14, textAlign: 'center' }}>
            Todavía no hay cotizaciones para este lead.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {propuestas.map(p => {
              const esGanadora = lead.propuesta_ganadora_id === p.id
              const badge = PROP_BADGE[p.estado] ?? { bg: '#f1f1ef', color: '#6e6a62', label: p.estado }
              return (
                <div key={p.id} style={{
                  border: `1px solid ${esGanadora ? '#16a34a' : 'var(--border)'}`,
                  borderRadius: 8, padding: '12px 14px', background: esGanadora ? 'rgba(21,128,61,0.04)' : '#fff',
                  position: 'relative',
                }}>
                  {esGanadora && (
                    <span style={{ position: 'absolute', top: -8, right: 12, fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 5, background: '#16a34a', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Trophy size={10} /> GANADORA
                    </span>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <Link href={`/dashboard/cotizaciones/${p.id}`} style={{ color: 'var(--text-primary)', textDecoration: 'none', flex: 1, minWidth: 220 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 700 }}>{p.numero ?? '—'}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 5, background: badge.bg, color: badge.color }}>{badge.label.toUpperCase()}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {p.nombre ?? 'Sin nombre'} · {fmtMoney(p.monto_total, p.moneda)}
                        {p.fecha_inicio && <> · {fmtDate(p.fecha_inicio)} → {fmtDate(p.fecha_fin)}</>}
                      </div>
                    </Link>
                    {puedeGestionar && !esGanadora && p.estado !== 'rechazada' && lead.estado !== 'ganado' && (
                      <button
                        onClick={() => marcarGanadora(p.id)}
                        disabled={marcando === p.id}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px',
                          borderRadius: 7, border: '1px solid #16a34a', background: 'rgba(21,128,61,0.06)',
                          color: '#15803d', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        <Trophy size={12} /> {marcando === p.id ? 'Guardando…' : 'Marcar ganadora'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Gestiones */}
      <div style={section}>
        <div style={{ ...sectionTitle, display: 'flex', alignItems: 'center', gap: 8 }}>
          <MessageSquare size={13} /> Gestiones
        </div>

        {puedeGestionar && lead.estado !== 'ganado' && lead.estado !== 'perdido' && (
          <div style={{ background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Nueva gestión</div>
            <textarea
              value={nuevaGestion.nota}
              onChange={e => setNuevaGestion(s => ({ ...s, nota: e.target.value }))}
              placeholder="¿Qué pasó? (ej: cliente pidió una semana para revisar la propuesta)"
              rows={2}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'Montserrat, sans-serif', boxSizing: 'border-box', resize: 'vertical', marginBottom: 8 }}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                Próxima gestión:
                <input type="date" value={nuevaGestion.fecha} onChange={e => setNuevaGestion(s => ({ ...s, fecha: e.target.value }))}
                  style={{ padding: '6px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontFamily: 'Montserrat, sans-serif' }}
                />
              </label>
              <button
                onClick={guardarGestion}
                disabled={guardandoGestion || !nuevaGestion.nota.trim()}
                style={{
                  marginLeft: 'auto', padding: '7px 14px', borderRadius: 7, border: 'none',
                  background: nuevaGestion.nota.trim() ? 'var(--orange)' : '#d1cfca', color: '#fff',
                  fontSize: 12, fontWeight: 600, cursor: nuevaGestion.nota.trim() ? 'pointer' : 'not-allowed',
                }}
              >
                {guardandoGestion ? 'Guardando…' : 'Guardar gestión'}
              </button>
            </div>
          </div>
        )}

        {lead.notas ? (
          <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.7, color: 'var(--text-primary)', background: '#fafaf8', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
            {lead.notas}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: 14 }}>Sin gestiones registradas todavía.</div>
        )}

        {lead.motivo_perdida && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: '#fef0f0', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>
            <strong>Motivo de pérdida:</strong> {lead.motivo_perdida}
          </div>
        )}
      </div>
    </div>
  )
}
