'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Mail, CheckCircle, XCircle, AlertCircle, RefreshCw, Bot, Copy, KeyRound } from 'lucide-react'

const ROL_LABELS: Record<string, string> = {
  vendedor: 'Vendedor',
  asistente_ventas: 'Asistente de Ventas',
  gerente_comercial: 'Gerente Comercial',
  operaciones: 'Operaciones',
  arte: 'Arte',
  administracion: 'Administración',
}

interface Props {
  user: { id: string; name: string; email: string; rol: string }
  gmailConnected: boolean
  gmailEmail: string | null
}

export default function PerfilClient({ user, gmailConnected: initialConnected, gmailEmail: initialEmail }: Props) {
  const searchParams = useSearchParams()
  const [gmailConnected, setGmailConnected] = useState(initialConnected)
  const [gmailEmail, setGmailEmail] = useState(initialEmail)
  const [disconnecting, setDisconnecting] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  // El token plain solo aparece UNA VEZ tras generarlo. Despues solo sabemos
  // si el usuario ya tiene un token configurado (hasToken) pero no podemos
  // mostrarlo de nuevo (la DB guarda solo el hash).
  const [mcpToken, setMcpToken] = useState<string | null>(null)
  const [hasToken, setHasToken] = useState(false)
  const [mcpLoading, setMcpLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/perfil/mcp-token')
      .then(r => r.json())
      .then(d => setHasToken(!!d.has_token))
      .finally(() => setMcpLoading(false))
  }, [])

  async function generarToken() {
    if (hasToken && !confirm('¿Regenerar el token? El conector anterior dejará de funcionar y habrá que actualizar la URL en Claude.')) return
    setGenerating(true)
    try {
      const res = await fetch('/api/perfil/mcp-token', { method: 'POST' })
      const d = await res.json()
      if (res.ok) { setMcpToken(d.token); setHasToken(true) }
    } finally {
      setGenerating(false)
    }
  }

  // Solo construimos la URL si tenemos el token plain (recién generado en
  // esta sesión). Si el usuario refresca, va a tener que regenerarlo.
  const connectorUrl = mcpToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/api/mcp?key=${mcpToken}`
    : null

  function copiarUrl() {
    if (!connectorUrl) return
    navigator.clipboard.writeText(connectorUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  useEffect(() => {
    const status = searchParams.get('gmail')
    if (status === 'connected') {
      setGmailConnected(true)
      setNotice({ type: 'success', text: 'Gmail conectado correctamente.' })
    } else if (status === 'error') {
      setNotice({ type: 'error', text: 'No se pudo conectar Gmail. Intentá de nuevo.' })
    }
  }, [searchParams])

  async function handleDisconnect() {
    if (!confirm('¿Desconectar Gmail? Se eliminarán tus tokens y ya no se verificarán correos.')) return
    setDisconnecting(true)
    try {
      await fetch('/api/auth/google', { method: 'DELETE' })
      setGmailConnected(false)
      setGmailEmail(null)
      setNotice({ type: 'success', text: 'Gmail desconectado.' })
    } finally {
      setDisconnecting(false)
    }
  }

  const initials = user.name
    ? user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : user.email[0].toUpperCase()

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif', maxWidth: 600, margin: '0 auto' }}>

      {/* Notice */}
      {notice && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px',
          borderRadius: 8,
          marginBottom: 20,
          background: notice.type === 'success' ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${notice.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
          color: notice.type === 'success' ? '#15803d' : '#dc2626',
          fontSize: 13,
        }}>
          {notice.type === 'success'
            ? <CheckCircle size={16} />
            : <XCircle size={16} />}
          {notice.text}
        </div>
      )}

      {/* Profile card */}
      <div style={{
        background: '#fff',
        border: '1px solid #e5e3dc',
        borderRadius: 12,
        padding: 24,
        marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: '#eb691c',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            fontWeight: 700,
            flexShrink: 0,
          }}>
            {initials}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1a1915' }}>{user.name}</div>
            <div style={{ fontSize: 13, color: '#9a9895', marginTop: 2 }}>{user.email}</div>
            <div style={{ fontSize: 12, color: '#eb691c', fontWeight: 600, marginTop: 2 }}>
              {ROL_LABELS[user.rol] ?? user.rol}
            </div>
          </div>
        </div>
      </div>

      {/* Gmail integration card */}
      <div style={{
        background: '#fff',
        border: '1px solid #e5e3dc',
        borderRadius: 12,
        padding: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Mail size={18} color="#eb691c" />
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1a1915' }}>Integración con Gmail</span>
        </div>

        {gmailConnected ? (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: 8,
              marginBottom: 16,
            }}>
              <CheckCircle size={16} color="#15803d" />
              <span style={{ fontSize: 13, color: '#15803d', fontWeight: 600 }}>
                Conectado como {gmailEmail}
              </span>
            </div>

            <p style={{ fontSize: 13, color: '#6b6965', lineHeight: 1.6, marginBottom: 16 }}>
              El asistente Movi revisará tus correos cada 5 minutos para sugerirte acciones sobre tus leads y órdenes.
              También podés preguntarle directamente sobre información en tus emails.
            </p>

            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid #fecaca',
                background: '#fef2f2',
                color: '#dc2626',
                fontSize: 13,
                fontWeight: 600,
                cursor: disconnecting ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                opacity: disconnecting ? 0.6 : 1,
              }}
            >
              {disconnecting && <RefreshCw size={13} style={{ animation: 'spin 1s linear infinite' }} />}
              Desconectar Gmail
            </button>
          </>
        ) : (
          <>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              background: '#f9f9f7',
              border: '1px solid #e5e3dc',
              borderRadius: 8,
              marginBottom: 16,
            }}>
              <AlertCircle size={16} color="#9a9895" />
              <span style={{ fontSize: 13, color: '#6b6965' }}>Gmail no conectado</span>
            </div>

            <p style={{ fontSize: 13, color: '#6b6965', lineHeight: 1.6, marginBottom: 16 }}>
              Conectá tu cuenta de Google para que Movi pueda revisar tus correos y sugerirte acciones sobre tus leads.
              Solo se accede a tus emails en modo lectura.
            </p>

            <div style={{ fontSize: 12, color: '#9a9895', marginBottom: 16, lineHeight: 1.6 }}>
              <strong style={{ color: '#6b6965' }}>¿Qué puede hacer Movi con tus emails?</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 16 }}>
                <li>Detectar cuando un cliente confirma fechas o materiales</li>
                <li>Sugerir actualizar leads cuando llega una respuesta comercial</li>
                <li>Responder preguntas del chat usando información de tus correos</li>
                <li>Alertar si un cliente no respondió en varios días</li>
              </ul>
            </div>

            <a
              href="/api/auth/google"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 18px',
                borderRadius: 8,
                background: '#eb691c',
                color: '#fff',
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              <Mail size={15} />
              Conectar Gmail
            </a>
          </>
        )}
      </div>

      {/* Claude / MCP connector card */}
      <div style={{
        background: '#fff',
        border: '1px solid #e5e3dc',
        borderRadius: 12,
        padding: 24,
        marginTop: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <Bot size={18} color="#eb691c" />
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1a1915' }}>CRM conversacional (Claude)</span>
        </div>

        <p style={{ fontSize: 13, color: '#6b6965', lineHeight: 1.6, marginBottom: 16 }}>
          Conectá tu cuenta de Claude al CRM para consultar disponibilidad, clientes,
          cotizaciones y cargar datos conversando. Tu token personal identifica quién sos:
          ves y modificás lo que tu rol permite.
        </p>

        {hasToken && !mcpToken && !mcpLoading && (
          <div style={{ marginBottom: 14, padding: '10px 12px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
            Ya tenés un token configurado, pero por seguridad la URL no se puede mostrar de nuevo. Si la perdiste, regenerá uno nuevo (el anterior dejará de funcionar).
          </div>
        )}

        {mcpLoading ? (
          <p style={{ fontSize: 13, color: '#9a9895' }}>Cargando…</p>
        ) : mcpToken && connectorUrl ? (
          <>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b6965', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>
              Tu URL de conector
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input
                readOnly
                value={connectorUrl}
                onFocus={e => e.target.select()}
                style={{
                  flex: 1, padding: '9px 12px', border: '1px solid #e5e3dc', borderRadius: 8,
                  fontSize: 12, fontFamily: 'monospace', color: '#1a1915', background: '#f9f9f7',
                  outline: 'none', boxSizing: 'border-box',
                }}
              />
              <button onClick={copiarUrl} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px',
                borderRadius: 8, border: 'none', background: copied ? '#15803d' : '#eb691c',
                color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
                <Copy size={13} /> {copied ? 'Copiada' : 'Copiar'}
              </button>
            </div>

            <div style={{ fontSize: 12, color: '#9a9895', lineHeight: 1.7, marginBottom: 16 }}>
              <strong style={{ color: '#6b6965' }}>Cómo conectarla:</strong>
              <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                <li>En Claude (web o app) abrí <strong>Settings → Connectors</strong></li>
                <li>Elegí <strong>Add custom connector</strong></li>
                <li>Pegá la URL de arriba y guardá</li>
              </ol>
              No compartas esta URL: equivale a tu acceso personal al CRM.
            </div>

            <button onClick={generarToken} disabled={generating} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
              borderRadius: 8, border: '1px solid #e5e3dc', background: '#fff',
              color: '#6b6965', fontSize: 13, fontWeight: 600,
              cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.6 : 1,
            }}>
              <RefreshCw size={13} style={generating ? { animation: 'spin 1s linear infinite' } : undefined} />
              Regenerar token
            </button>
          </>
        ) : (
          <button onClick={generarToken} disabled={generating} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 18px',
            borderRadius: 8, border: 'none', background: '#eb691c', color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: generating ? 'not-allowed' : 'pointer',
            opacity: generating ? 0.6 : 1,
          }}>
            <KeyRound size={15} />
            {generating ? 'Generando…' : hasToken ? 'Regenerar token' : 'Generar mi token de conexión'}
          </button>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
