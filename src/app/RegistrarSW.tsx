'use client'

import { useEffect } from 'react'

/** Registra el service worker de la app instalable (sólo en producción). */
export default function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => { /* sin SW el CRM anda igual */ })
  }, [])
  return null
}
