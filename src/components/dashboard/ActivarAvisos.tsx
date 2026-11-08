'use client'

import { useEffect, useState } from 'react'
import { Bell, BellOff, CheckCircle } from 'lucide-react'

type Estado = 'cargando' | 'no-soportado' | 'instalar-ios' | 'bloqueado' | 'apagado' | 'activo'

function base64AUint8(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

/**
 * Activar los avisos push en este celular: tareas nuevas, ventas para
 * aprobar, cobranzas, comentarios… todo lo que llega a la campanita.
 */
export default function ActivarAvisos() {
  const [estado, setEstado] = useState<Estado>('cargando')
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        // En iPhone los avisos funcionan sólo con la app instalada en el inicio.
        setEstado(ios && !standalone ? 'instalar-ios' : 'no-soportado'); return
      }
      if (Notification.permission === 'denied') { setEstado('bloqueado'); return }
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      setEstado(sub ? 'activo' : 'apagado')
    })().catch(() => setEstado('no-soportado'))
  }, [])

  async function activar() {
    setOcupado(true); setError('')
    try {
      const { publicKey } = await fetch('/api/push/suscripcion').then(r => r.json())
      if (!publicKey) { setError('Los avisos todavía no están configurados en el servidor.'); return }
      const permiso = await Notification.requestPermission()
      if (permiso !== 'granted') { setEstado(permiso === 'denied' ? 'bloqueado' : 'apagado'); return }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'))
      await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64AUint8(publicKey) as BufferSource })
      const res = await fetch('/api/push/suscripcion', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.error ?? 'No se pudo activar'); await sub.unsubscribe(); return }
      setEstado('activo')
    } catch {
      setError('No se pudo activar en este dispositivo.')
    } finally { setOcupado(false) }
  }

  async function desactivar() {
    setOcupado(true)
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await fetch('/api/push/suscripcion', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) })
        await sub.unsubscribe()
      }
      setEstado('apagado')
    } finally { setOcupado(false) }
  }

  const btn = (bg: string, color: string): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 8,
    border: bg === '#fff' ? '1px solid #e5e3dc' : 'none', background: bg, color, fontSize: 13, fontWeight: 700,
    cursor: ocupado ? 'wait' : 'pointer', fontFamily: 'Montserrat, sans-serif', opacity: ocupado ? 0.6 : 1,
  })

  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0eee8' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1915', marginBottom: 6 }}>Avisos en el celular</div>
      <p style={{ fontSize: 12.5, color: '#6b6965', lineHeight: 1.6, margin: '0 0 12px' }}>
        Te llega un aviso aunque el CRM esté cerrado: tareas nuevas, ventas para aprobar, cobranzas, comentarios y todo lo que aparece en la campanita.
      </p>
      {estado === 'activo' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#15803d', fontWeight: 600 }}><CheckCircle size={16} /> Activados en este dispositivo</span>
          <button onClick={desactivar} disabled={ocupado} style={btn('#fff', '#6b6965')}><BellOff size={14} /> Desactivar</button>
        </div>
      )}
      {estado === 'apagado' && <button onClick={activar} disabled={ocupado} style={btn('#eb691c', '#fff')}><Bell size={14} /> Activar avisos</button>}
      {estado === 'instalar-ios' && <p style={{ fontSize: 12.5, color: '#b45309', margin: 0 }}>En iPhone, primero instalá la app (pasos de arriba) y activá los avisos desde la app instalada.</p>}
      {estado === 'bloqueado' && <p style={{ fontSize: 12.5, color: '#b45309', margin: 0 }}>Los avisos están bloqueados para el CRM. Habilitalos en los ajustes del navegador o del celular (Notificaciones) y volvé a esta pantalla.</p>}
      {estado === 'no-soportado' && <p style={{ fontSize: 12.5, color: '#9a9895', margin: 0 }}>Este navegador no admite avisos push.</p>}
      {error && <p style={{ fontSize: 12.5, color: '#dc2626', margin: '8px 0 0' }}>{error}</p>}
    </div>
  )
}
