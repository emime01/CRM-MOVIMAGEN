'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Mail, RefreshCw, CheckCircle, XCircle, Loader2, Wifi, WifiOff } from 'lucide-react'

interface Suggestion {
  id: string
  from_name: string
  from_email: string
  subject: string
  snippet: string
  suggestion: string
  status: 'pending' | 'accepted' | 'dismissed'
  created_at: string
}

export default function PerfilPage() {
  const searchParams = useSearchParams()
  const [connected, setConnected] = useState<boolean | null>(null)
  const [gmailEmail, setGmailEmail] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  const gmailParam = searchParams.get('gmail')

  const checkConnection = useCallback(async () => {
    const res = await fetch('/api/google/suggestions')
    if (res.ok) {
      const data = await res.json()
      setConnected(true)
      if (data.length > 0) setSuggestions(data)
    } else {
      setConnected(false)
    }
  }, [])

  useEffect(() => {
    checkConnection()
    if (gmailParam === 'ok') setStatusMsg('¡Gmail conectado exitosamente!')
    else if (gmailParam === 'error') setStatusMsg('Hubo un error conectando Gmail. Intentá de nuevo.')
    else if (gmailParam === 'expired') setStatusMsg('La sesión expiró. Volvé a intentarlo.')
  }, [gmailParam, checkConnection])

  async function handleFetchEmails() {
    setLoadingSuggestions(true)
    setStatusMsg('')
    try {
      const res = await fetch('/api/google/emails')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setSuggestions(data)
      setStatusMsg(data.length === 0 ? 'No hay emails con sugerencias nuevas.' : '')
    } catch {
      setStatusMsg('Error al obtener emails.')
    } finally {
      setLoadingSuggestions(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('¿Desconectar Gmail? Se eliminarán todas las sugerencias guardadas.')) return
    setDisconnecting(true)
    await fetch('/api/google/disconnect', { method: 'POST' })
    setConnected(false)
    setSuggestions([])
    setDisconnecting(false)
    setStatusMsg('Gmail desconectado.')
  }

  async function updateStatus(id: string, status: 'accepted' | 'dismissed') {
    await fetch('/api/google/suggestions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status } : s))
  }

  const pending = suggestions.filter(s => s.status === 'pending')
  const actioned = suggestions.filter(s => s.status !== 'pending')

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 24 }}>
        Mi Perfil
      </h2>

      {/* Gmail connection card */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 24,
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: '#fef2f2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Mail size={20} color="#ef4444" />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Gmail</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Conectá tu cuenta para recibir sugerencias de acción basadas en tus emails
            </div>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            {connected === null ? (
              <Loader2 size={18} color="var(--text-muted)" style={{ animation: 'spin 1s linear infinite' }} />
            ) : connected ? (
              <Wifi size={18} color="#22c55e" />
            ) : (
              <WifiOff size={18} color="var(--text-muted)" />
            )}
          </div>
        </div>

        {statusMsg && (
          <div style={{
            padding: '10px 14px',
            borderRadius: 8,
            background: statusMsg.includes('error') || statusMsg.includes('Error') ? '#fef2f2' : '#f0fdf4',
            color: statusMsg.includes('error') || statusMsg.includes('Error') ? '#ef4444' : '#16a34a',
            fontSize: 13,
            marginBottom: 16,
          }}>
            {statusMsg}
          </div>
        )}

        {connected === false && (
          <a
            href="/api/google/connect"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 20px',
              background: 'var(--orange)',
              color: '#fff',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              fontFamily: 'Montserrat, sans-serif',
            }}
          >
            <Mail size={15} />
            Conectar Gmail
          </a>
        )}

        {connected && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {gmailEmail && (
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Conectado como <strong>{gmailEmail}</strong>
              </span>
            )}
            <button
              onClick={handleFetchEmails}
              disabled={loadingSuggestions}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '9px 16px',
                background: 'var(--orange)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: loadingSuggestions ? 'not-allowed' : 'pointer',
                opacity: loadingSuggestions ? 0.7 : 1,
                fontFamily: 'Montserrat, sans-serif',
              }}
            >
              {loadingSuggestions
                ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Analizando...</>
                : <><RefreshCw size={14} /> Analizar emails</>
              }
            </button>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              style={{
                padding: '9px 16px',
                background: 'transparent',
                color: '#ef4444',
                border: '1px solid #fecaca',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: disconnecting ? 'not-allowed' : 'pointer',
                fontFamily: 'Montserrat, sans-serif',
              }}
            >
              Desconectar
            </button>
          </div>
        )}
      </div>

      {/* Pending suggestions */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
            Sugerencias pendientes ({pending.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pending.map(s => (
              <SuggestionCard key={s.id} s={s} onUpdate={updateStatus} />
            ))}
          </div>
        </div>
      )}

      {/* Actioned suggestions */}
      {actioned.length > 0 && (
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 12 }}>
            Historial
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {actioned.map(s => (
              <SuggestionCard key={s.id} s={s} onUpdate={updateStatus} />
            ))}
          </div>
        </div>
      )}

      {connected && suggestions.length === 0 && !loadingSuggestions && (
        <div style={{
          textAlign: 'center',
          padding: '48px 24px',
          color: 'var(--text-muted)',
          fontSize: 13,
        }}>
          <Mail size={32} style={{ opacity: 0.3, display: 'block', margin: '0 auto 12px' }} />
          Hacé clic en <strong>Analizar emails</strong> para ver sugerencias de tus últimos emails.
        </div>
      )}
    </div>
  )
}

function SuggestionCard({
  s,
  onUpdate,
}: {
  s: Suggestion
  onUpdate: (id: string, status: 'accepted' | 'dismissed') => void
}) {
  const isPending = s.status === 'pending'
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${s.status === 'accepted' ? '#bbf7d0' : s.status === 'dismissed' ? 'var(--border)' : 'var(--border)'}`,
      borderRadius: 10,
      padding: 16,
      opacity: s.status === 'dismissed' ? 0.5 : 1,
    }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
            {s.subject || '(sin asunto)'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            {s.from_name ? `${s.from_name} <${s.from_email}>` : s.from_email}
          </div>
          <div style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            marginBottom: 10,
            fontStyle: 'italic',
            lineHeight: 1.5,
          }}>
            "{s.snippet}"
          </div>
          <div style={{
            fontSize: 13,
            color: '#1d4ed8',
            background: '#eff6ff',
            borderRadius: 6,
            padding: '8px 12px',
            lineHeight: 1.5,
          }}>
            <strong>Sugerencia:</strong> {s.suggestion}
          </div>
        </div>
        {isPending && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            <button
              onClick={() => onUpdate(s.id, 'accepted')}
              title="Marcar como atendido"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: '1px solid #bbf7d0',
                background: '#f0fdf4',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <CheckCircle size={16} color="#16a34a" />
            </button>
            <button
              onClick={() => onUpdate(s.id, 'dismissed')}
              title="Descartar"
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'transparent',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <XCircle size={16} color="var(--text-muted)" />
            </button>
          </div>
        )}
        {!isPending && (
          <div style={{ flexShrink: 0 }}>
            {s.status === 'accepted'
              ? <CheckCircle size={16} color="#16a34a" />
              : <XCircle size={16} color="var(--text-muted)" />
            }
          </div>
        )}
      </div>
    </div>
  )
}
