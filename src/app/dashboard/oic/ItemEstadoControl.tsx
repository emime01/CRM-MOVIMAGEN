'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Campo = 'estado_grabado' | 'estado_produccion'

const OPCIONES: Record<Campo, Array<{ value: string; label: string; bg: string; color: string }>> = {
  estado_grabado: [
    { value: 'pendiente', label: 'Pendiente', bg: '#fef9ec', color: '#b45309' },
    { value: 'grabado',   label: 'Grabado',   bg: '#f0fdf4', color: '#15803d' },
  ],
  estado_produccion: [
    { value: 'pendiente',     label: 'Pendiente',     bg: '#f1f0ec', color: '#6b6965' },
    { value: 'en_produccion', label: 'En producción', bg: '#eff6ff', color: '#1d4ed8' },
    { value: 'producido',     label: 'Producido',     bg: '#fef3ec', color: '#eb691c' },
    { value: 'instalado',     label: 'Instalado',     bg: '#f0fdf4', color: '#15803d' },
  ],
}

export default function ItemEstadoControl({
  itemId, campo, valor,
}: {
  itemId: string
  campo: Campo
  valor: string | null
}) {
  const router = useRouter()
  const [value, setValue] = useState(valor ?? 'pendiente')
  const [saving, setSaving] = useState(false)

  const opts = OPCIONES[campo]
  const current = opts.find(o => o.value === value) ?? opts[0]

  async function cambiar(nuevo: string) {
    const prev = value
    setValue(nuevo)
    setSaving(true)
    try {
      const res = await fetch(`/api/orden-items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [campo]: nuevo }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        alert(d.error ?? 'Error al actualizar')
        setValue(prev)
        return
      }
      router.refresh()
    } catch {
      setValue(prev)
    } finally {
      setSaving(false)
    }
  }

  return (
    <select
      value={value}
      disabled={saving}
      onChange={e => cambiar(e.target.value)}
      style={{
        appearance: 'none',
        border: 'none',
        borderRadius: 6,
        padding: '3px 22px 3px 9px',
        fontSize: 11,
        fontWeight: 700,
        fontFamily: 'Montserrat, sans-serif',
        cursor: saving ? 'wait' : 'pointer',
        background: `${current.bg} url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='3'><path d='M6 9l6 6 6-6'/></svg>") no-repeat right 6px center`,
        color: current.color,
        opacity: saving ? 0.6 : 1,
      }}
      title="Cambiar estado"
    >
      {opts.map(o => <option key={o.value} value={o.value} style={{ background: '#fff', color: '#1a1915' }}>{o.label}</option>)}
    </select>
  )
}
