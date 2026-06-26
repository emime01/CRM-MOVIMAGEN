'use client'

import { useState } from 'react'

export interface Empresa {
  nombre: string
  razon_social: string | null
  rut: string | null
  direccion: string | null
  telefono: string | null
  email: string | null
}

const CAMPOS: Array<{ key: keyof Empresa; label: string; placeholder?: string }> = [
  { key: 'nombre',       label: 'Nombre comercial' },
  { key: 'razon_social', label: 'Razón social',  placeholder: 'Ej: Giralor S.A.' },
  { key: 'rut',          label: 'RUT',            placeholder: 'Ej: 21XXXXXX0013' },
  { key: 'direccion',    label: 'Dirección' },
  { key: 'telefono',     label: 'Teléfono' },
  { key: 'email',        label: 'Email' },
]

export default function EmpresaConfigForm({ initial, canEdit }: { initial: Empresa | null; canEdit: boolean }) {
  const base: Empresa = initial ?? { nombre: 'Movimagen', razon_social: null, rut: null, direccion: null, telefono: null, email: null }
  const [form, setForm] = useState<Empresa>(base)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  function set(key: keyof Empresa, val: string) {
    setForm(f => ({ ...f, [key]: val }))
    setMsg(null)
  }

  async function guardar() {
    if (!form.nombre.trim()) { setMsg({ ok: false, text: 'El nombre es obligatorio' }); return }
    setSaving(true); setMsg(null)
    const res = await fetch('/api/config/empresa', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (!res.ok) { const d = await res.json().catch(() => ({})); setMsg({ ok: false, text: d.error ?? 'Error al guardar' }); return }
    setMsg({ ok: true, text: 'Datos guardados' })
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 7,
    fontSize: 13, fontFamily: 'Montserrat, sans-serif', boxSizing: 'border-box', background: canEdit ? '#fff' : 'var(--bg-app)',
  }
  const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 4 }

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Datos de la empresa</div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Aparecen en el membrete de la factura</span>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 16 }}>
          {CAMPOS.map(c => (
            <div key={c.key}>
              <label style={lbl}>{c.label}</label>
              <input
                value={(form[c.key] ?? '') as string}
                onChange={e => set(c.key, e.target.value)}
                placeholder={c.placeholder}
                disabled={!canEdit}
                style={inp}
              />
            </div>
          ))}
        </div>
        {canEdit ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={guardar} disabled={saving}
              style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--orange)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
            {msg && <span style={{ fontSize: 12, fontWeight: 600, color: msg.ok ? '#15803d' : '#dc2626' }}>{msg.text}</span>}
          </div>
        ) : (
          <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Solo administración puede editar estos datos.</p>
        )}
      </div>
    </div>
  )
}
