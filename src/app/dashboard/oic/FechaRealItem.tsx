'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { avisar } from '@/components/ui/dialogos'

/**
 * Fecha real de instalación de una línea. Operaciones no tenía dónde cargarla
 * salvo para caras de bus: ahora va acá, línea por línea. Al marcar
 * "Instalado" se completa sola con la fecha del día si estaba vacía.
 */
export default function FechaRealItem({ itemId, valor, campo = 'fecha_alta_real' }: {
  itemId: string
  valor: string | null
  campo?: 'fecha_alta_real' | 'fecha_baja_real'
}) {
  const router = useRouter()
  const [v, setV] = useState(valor ?? '')
  const [saving, setSaving] = useState(false)

  async function guardar(nueva: string) {
    const prev = v
    setV(nueva)
    setSaving(true)
    try {
      const res = await fetch(`/api/orden-items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [campo]: nueva || null }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        avisar(d.error ?? 'No se pudo guardar la fecha')
        setV(prev)
        return
      }
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <input
      type="date"
      value={v}
      disabled={saving}
      onChange={e => guardar(e.target.value)}
      title={campo === 'fecha_alta_real' ? 'Fecha real de instalación' : 'Fecha real de baja'}
      style={{
        border: '1px solid #e5e3dc', borderRadius: 6, padding: '3px 6px', fontSize: 12,
        fontFamily: 'Montserrat, sans-serif', color: v ? '#15803d' : '#9a9895', background: '#fff',
        opacity: saving ? 0.6 : 1,
      }}
    />
  )
}
