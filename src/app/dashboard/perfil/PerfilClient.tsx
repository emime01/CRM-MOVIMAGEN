'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Mail, CheckCircle, XCircle, AlertCircle, RefreshCw } from 'lucide-react'

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

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
