'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pendiente: { bg: 'rgba(217,119,6,0.12)',  color: '#d97706', label: 'Pendiente' },
  pagada:    { bg: 'rgba(21,128,61,0.12)',  color: '#15803d', label: 'Pagada' },
  cancelada: { bg: 'rgba(107,114,128,0.12)', color: '#6b7280', label: 'Cancelada' },
}

export default function ComisionEstadoToggle({ id, estado }: { id: string; estado: string }) {
  const router = useRouter()
  const [current, setCurrent] = useState(estado)
  const [loading, setLoading] = useState(false)

  const style = STYLES[current] ?? STYLES.pendiente

  async function toggle() {
    const next = current === 'pagada' ? 'pendiente' : 'pagada'
    const verb = next === 'pagada' ? 'pagada' : 'pendiente'
    if (!confirm(`¿Marcar esta comisión como ${verb}?`)) return
    setLoading(true)
    try {
      const res = await fetch(`/api/comisiones/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: next }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(j.error ?? 'Error al actualizar')
        return
      }
      setCurrent(next)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={loading || current === 'cancelada'}
      title={current === 'cancelada' ? 'Cancelada' : 'Click para alternar pendiente / pagada'}
      style={{
        background: style.bg,
        color: style.color,
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        border: 'none',
        cursor: current === 'cancelada' ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.6 : 1,
      }}
    >
      {style.label}
    </button>
  )
}
