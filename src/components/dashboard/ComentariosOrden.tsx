'use client'

import { useEffect, useState } from 'react'
import { Send, MessageSquare } from 'lucide-react'

interface Comentario {
  id: string
  mensaje: string
  created_at: string
  perfil_id: string
  perfiles: { nombre: string; rol: string } | { nombre: string; rol: string }[] | null
}

function first<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function fmtWhen(iso: string) {
  const d = new Date(iso)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const ymd = new Date(d); ymd.setHours(0, 0, 0, 0)
  const diff = (today.getTime() - ymd.getTime()) / 86400000
  const hora = d.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })
  if (diff === 0) return `Hoy ${hora}`
  if (diff === 1) return `Ayer ${hora}`
  return d.toLocaleDateString('es-UY', { day: '2-digit', month: 'short' }) + ' ' + hora
}

const ROL_COLOR: Record<string, string> = {
  vendedor:          '#2563eb',
  asistente_ventas:  '#7c3aed',
  gerente_comercial: '#dc2626',
  administracion:    '#475569',
  operaciones:       '#0891b2',
  arte:              '#a855f7',
}

export default function ComentariosOrden({ ordenId, currentUserId }: { ordenId: string; currentUserId: string }) {
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [mensaje, setMensaje] = useState('')
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)

  async function fetchComentarios() {
    setLoading(true)
    const r = await fetch(`/api/ordenes/${ordenId}/comentarios`)
    if (r.ok) {
      const d = await r.json()
      setComentarios(d.comentarios ?? [])
    }
    setLoading(false)
  }
  useEffect(() => { fetchComentarios() }, [ordenId])  // eslint-disable-line react-hooks/exhaustive-deps

  async function enviar() {
    if (!mensaje.trim() || enviando) return
    setEnviando(true)
    const r = await fetch(`/api/ordenes/${ordenId}/comentarios`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mensaje: mensaje.trim() }),
    })
    setEnviando(false)
    if (r.ok) {
      setMensaje('')
      fetchComentarios()
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      enviar()
    }
  }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
        <MessageSquare size={14} color="var(--text-muted)" />
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Comentarios ({comentarios.length})
        </span>
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 14 }}>Cargando…</div>
      ) : comentarios.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: 14 }}>
          Sin comentarios todavía. Usá este hilo para coordinar con arte y operaciones sobre esta OIC.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14, maxHeight: 360, overflowY: 'auto' }}>
          {comentarios.map(c => {
            const p = first<{ nombre: string; rol: string }>(c.perfiles)
            const propio = c.perfil_id === currentUserId
            const rolColor = ROL_COLOR[p?.rol ?? ''] ?? '#6b7280'
            const initials = (p?.nombre ?? '?').split(' ').filter(Boolean).map(s => s[0]).slice(0, 2).join('').toUpperCase()
            return (
              <div key={c.id} style={{ display: 'flex', gap: 10, flexDirection: propio ? 'row-reverse' : 'row' }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', background: rolColor + '20',
                  color: rolColor, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, flexShrink: 0,
                }}>
                  {initials}
                </div>
                <div style={{
                  background: propio ? 'rgba(235,105,28,0.06)' : 'var(--bg-app)',
                  border: '1px solid var(--border)',
                  borderRadius: 8, padding: '8px 12px', maxWidth: '78%',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, fontSize: 11 }}>
                    <strong style={{ color: 'var(--text-primary)' }}>{p?.nombre ?? '—'}</strong>
                    <span style={{ color: rolColor, fontWeight: 600 }}>· {p?.rol ?? ''}</span>
                    <span style={{ color: 'var(--text-muted)' }}>· {fmtWhen(c.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.mensaje}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          value={mensaje}
          onChange={e => setMensaje(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Escribí un comentario… (Cmd/Ctrl+Enter para enviar)"
          rows={2}
          style={{
            flex: 1, padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7,
            fontSize: 13, fontFamily: 'Montserrat, sans-serif', resize: 'vertical',
            background: 'var(--bg-app)', boxSizing: 'border-box',
          }}
        />
        <button
          onClick={enviar}
          disabled={!mensaje.trim() || enviando}
          style={{
            padding: '8px 14px', borderRadius: 7, border: 'none',
            background: mensaje.trim() ? 'var(--orange)' : '#d1cfca',
            color: '#fff', fontSize: 12, fontWeight: 700,
            cursor: mensaje.trim() ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
          }}
        >
          <Send size={12} /> {enviando ? '…' : 'Enviar'}
        </button>
      </div>
    </div>
  )
}
