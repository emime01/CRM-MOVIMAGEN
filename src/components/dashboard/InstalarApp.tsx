'use client'

import { useEffect, useState } from 'react'
import { Smartphone, CheckCircle } from 'lucide-react'
import ActivarAvisos from './ActivarAvisos'

// El evento que Chrome/Android dispara cuando la app se puede instalar.
interface PromptInstalar extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * Tarjeta "App en el celular" de Mi Perfil: en Android instala con un botón;
 * en iPhone (Safari no tiene botón de instalar) explica los dos pasos.
 */
export default function InstalarApp() {
  const [prompt, setPrompt] = useState<PromptInstalar | null>(null)
  const [instalada, setInstalada] = useState(false)
  const [esIOS, setEsIOS] = useState(false)

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
    setInstalada(standalone)
    setEsIOS(/iphone|ipad|ipod/i.test(navigator.userAgent))
    const onPrompt = (e: Event) => { e.preventDefault(); setPrompt(e as PromptInstalar) }
    const onInstalada = () => { setInstalada(true); setPrompt(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalada)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalada)
    }
  }, [])

  async function instalar() {
    if (!prompt) return
    await prompt.prompt()
    const r = await prompt.userChoice
    if (r.outcome === 'accepted') setInstalada(true)
    setPrompt(null)
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e3dc', borderRadius: 12, padding: 24, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <Smartphone size={18} color="#eb691c" />
        <span style={{ fontSize: 15, fontWeight: 700, color: '#1a1915' }}>App en el celular</span>
      </div>

      {instalada ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#15803d', fontWeight: 600 }}>
          <CheckCircle size={16} /> Ya estás usando la app instalada.
        </div>
      ) : (
        <>
          <p style={{ fontSize: 13, color: '#6b6965', lineHeight: 1.6, margin: '0 0 14px' }}>
            Instalá el CRM en tu celular: queda con su ícono en la pantalla de inicio y se abre a pantalla completa, como una app.
          </p>
          {prompt ? (
            <button
              onClick={instalar}
              style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#eb691c', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' }}
            >
              Instalar la app
            </button>
          ) : esIOS ? (
            <ol style={{ fontSize: 13, color: '#4a4845', lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
              <li>Abrí el CRM en <strong>Safari</strong>.</li>
              <li>Tocá el botón <strong>Compartir</strong> (el cuadrado con la flecha).</li>
              <li>Elegí <strong>Agregar a inicio</strong>.</li>
            </ol>
          ) : (
            <ol style={{ fontSize: 13, color: '#4a4845', lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
              <li>Abrí el CRM en <strong>Chrome</strong> desde el celular.</li>
              <li>Tocá el menú <strong>⋮</strong> y elegí <strong>Instalar app</strong> (o "Agregar a pantalla principal").</li>
            </ol>
          )}
        </>
      )}

      <ActivarAvisos />
    </div>
  )
}
