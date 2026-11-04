'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'

const CATEGORIAS = ['combustible', 'viáticos', 'entretenimiento', 'materiales', 'otros']

const inputSt: React.CSSProperties = {
  height: 34, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13,
  fontFamily: 'Montserrat, sans-serif', background: 'var(--bg-card)', color: 'var(--text-primary)', boxSizing: 'border-box',
}
const lblSt: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }

/** Formulario para cargar un gasto de tarjeta. */
export function NuevoGasto({ hoy }: { hoy: string }) {
  const router = useRouter()
  const [form, setForm] = useState({ fecha: hoy, monto: '', categoria: 'combustible', descripcion: '', oic: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setGuardando(true); setError(null)
    const res = await fetch('/api/gastos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, monto: Number(form.monto), oic: form.oic || null }),
    })
    setGuardando(false)
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'No se pudo guardar'); return }
    setForm(f => ({ ...f, monto: '', descripcion: '', oic: '' }))
    router.refresh()
  }

  return (
    <form onSubmit={guardar} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>Cargar gasto</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <label style={lblSt}>Fecha<input type="date" required value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} style={inputSt} /></label>
        <label style={lblSt}>Monto ($)<input type="number" min="0.01" step="0.01" required value={form.monto} onChange={e => setForm({ ...form, monto: e.target.value })} style={{ ...inputSt, width: 120 }} /></label>
        <label style={lblSt}>Categoría
          <select value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })} style={{ ...inputSt, textTransform: 'capitalize' }}>
            {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label style={{ ...lblSt, flex: 1, minWidth: 180 }}>Descripción<input value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} style={inputSt} /></label>
        <label style={lblSt}>Venta (OIC nº, opcional)<input type="number" min="1" value={form.oic} onChange={e => setForm({ ...form, oic: e.target.value })} style={{ ...inputSt, width: 110 }} /></label>
        <button type="submit" disabled={guardando} style={{ height: 34, padding: '0 14px', border: 'none', borderRadius: 8, background: 'var(--orange)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'Montserrat, sans-serif' }}>
          <Plus size={14} /> {guardando ? 'Guardando…' : 'Agregar'}
        </button>
      </div>
      {error && <p style={{ margin: '10px 0 0', fontSize: 12, color: '#dc2626' }}>{error}</p>}
    </form>
  )
}

/** Borrar un gasto cargado por error. */
export function BorrarGasto({ id }: { id: string }) {
  const router = useRouter()
  async function borrar() {
    if (!confirm('¿Borrar este gasto?')) return
    const res = await fetch(`/api/gastos/${id}`, { method: 'DELETE' })
    if (!res.ok) { alert((await res.json().catch(() => ({}))).error ?? 'No se pudo borrar'); return }
    router.refresh()
  }
  return (
    <button onClick={borrar} title="Borrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
      <Trash2 size={13} />
    </button>
  )
}
