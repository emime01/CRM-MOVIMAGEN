'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users } from 'lucide-react'

/**
 * "Compartida con": el segundo vendedor de la venta. La comisión de cada
 * cobro se reparte mitad y mitad.
 */
export default function VentaCompartida({
  ordenId, vendedorId, compartido, vendedores, puedeEditar,
}: {
  ordenId: string
  vendedorId: string | null
  compartido: { id: string; nombre: string } | null
  vendedores: { id: string; nombre: string }[]
  puedeEditar: boolean
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(compartido?.id ?? '')
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    setGuardando(true)
    try {
      const res = await fetch(`/api/ordenes/${ordenId}/compartida`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendedor_compartido_id: valor || null }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'No se pudo guardar'); return }
      setEditando(false)
      router.refresh()
    } finally { setGuardando(false) }
  }

  if (editando) {
    return (
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={valor} onChange={e => setValor(e.target.value)}
          style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontFamily: 'Montserrat, sans-serif' }}>
          <option value="">No es compartida</option>
          {vendedores.filter(v => v.id !== vendedorId).map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
        </select>
        <button onClick={guardar} disabled={guardando}
          style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: 'var(--orange)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          {guardando ? '…' : 'Guardar'}
        </button>
        <button onClick={() => { setEditando(false); setValor(compartido?.id ?? '') }}
          style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', fontSize: 12, cursor: 'pointer' }}>
          Cancelar
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
      {compartido ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Users size={13} style={{ color: 'var(--orange)' }} /> {compartido.nombre} <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>· mitad y mitad</span>
        </span>
      ) : <span style={{ color: 'var(--text-muted)' }}>No</span>}
      {puedeEditar && (
        <button onClick={() => setEditando(true)}
          style={{ background: 'none', border: 'none', color: 'var(--orange)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
          Cambiar
        </button>
      )}
    </div>
  )
}
