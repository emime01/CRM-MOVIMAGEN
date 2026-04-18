'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Pencil, Upload, Check } from 'lucide-react'
import type { SoporteRow } from './page'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SoporteForm {
  nombre: string
  categoria: string
  tipo: string
  seccion: string
  ubicacion: string
  precio_base: string
  precio_semanal: string
  tiene_iva: boolean
}

interface ImportRow {
  nombre: string
  categoria?: string
  tipo?: string
  seccion?: string
  ubicacion?: string
  precio_semanal: number
  tiene_iva: boolean
}

interface Props {
  initialSoportes: SoporteRow[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIAS = ['Shopping', 'Digital', 'Exterior', 'Bus', 'Otro']
const TIPOS = ['estatico_shopping', 'banner_shopping', 'circuito', 'medianera', 'led', 'estatico_bus', 'otro']

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyForm(): SoporteForm {
  return { nombre: '', categoria: '', tipo: '', seccion: '', ubicacion: '', precio_base: '', precio_semanal: '', tiene_iva: false }
}

function soporteToForm(s: SoporteRow): SoporteForm {
  return {
    nombre: s.nombre,
    categoria: s.categoria ?? '',
    tipo: s.tipo ?? '',
    seccion: s.seccion ?? '',
    ubicacion: s.ubicacion ?? '',
    precio_base: s.precio_base != null ? String(s.precio_base) : '',
    precio_semanal: s.precio_semanal != null ? String(s.precio_semanal) : '',
    tiene_iva: s.tiene_iva,
  }
}

function formatCurrency(v: number | null) {
  if (v == null) return '—'
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(v)
}

function tipoLabel(t: string) {
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ─── Soporte Modal ────────────────────────────────────────────────────────────

function SoporteModal({ soporte, onClose, onSaved }: {
  soporte: SoporteRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = soporte != null
  const [form, setForm] = useState<SoporteForm>(() => isEdit ? soporteToForm(soporte!) : emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof SoporteForm>(key: K, val: SoporteForm[K]) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.nombre.trim()) { setError('El nombre es requerido'); return }
    setSaving(true); setError(null)

    const body = {
      nombre: form.nombre.trim(),
      categoria: form.categoria || undefined,
      tipo: form.tipo || undefined,
      seccion: form.seccion || undefined,
      ubicacion: form.ubicacion || undefined,
      precio_base: form.precio_base !== '' ? Number(form.precio_base) : null,
      precio_semanal: form.precio_semanal !== '' ? Number(form.precio_semanal) : null,
      tiene_iva: form.tiene_iva,
    }

    const res = await fetch(
      isEdit ? `/api/soportes/${soporte!.id}` : '/api/soportes',
      { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    )
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Error al guardar')
      return
    }
    onSaved()
  }

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', border: '1px solid #e5e3dc',
    borderRadius: 8, fontSize: 13, fontFamily: 'Montserrat, sans-serif',
    color: '#1a1915', background: '#fff', outline: 'none', boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#4a4845', marginBottom: 5 }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid #e5e3dc' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1a1915' }}>{isEdit ? 'Editar soporte' : 'Nuevo soporte'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9a9895' }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 20px 24px' }}>
          {/* Nombre */}
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Nombre *</label>
            <input type="text" value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Nombre del soporte" style={inp} />
          </div>

          {/* Categoría + Tipo */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Categoría</label>
              <select value={form.categoria} onChange={e => set('categoria', e.target.value)} style={inp}>
                <option value="">— Sin categoría —</option>
                {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Tipo</label>
              <select value={form.tipo} onChange={e => set('tipo', e.target.value)} style={inp}>
                <option value="">— Sin tipo —</option>
                {TIPOS.map(t => <option key={t} value={t}>{tipoLabel(t)}</option>)}
              </select>
            </div>
          </div>

          {/* Sección + Ubicación */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Sección</label>
              <input type="text" value={form.seccion} onChange={e => set('seccion', e.target.value)} placeholder="Ej: Centro, Norte" style={inp} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Ubicación</label>
              <input type="text" value={form.ubicacion} onChange={e => set('ubicacion', e.target.value)} placeholder="Dirección" style={inp} />
            </div>
          </div>

          {/* Precios */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Precio base (ARS)</label>
              <input type="number" value={form.precio_base} onChange={e => set('precio_base', e.target.value)} placeholder="0" min={0} style={inp} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={lbl}>Precio semanal (ARS)</label>
              <input type="number" value={form.precio_semanal} onChange={e => set('precio_semanal', e.target.value)} placeholder="0" min={0} style={inp} />
            </div>
          </div>

          {/* IVA */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <div onClick={() => set('tiene_iva', !form.tiene_iva)} style={{
                width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                border: form.tiene_iva ? '2px solid #eb691c' : '1.5px solid #c5c2bb',
                background: form.tiene_iva ? '#eb691c' : '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}>
                {form.tiene_iva && <Check size={12} color="#fff" strokeWidth={3} />}
              </div>
              <span style={{ fontSize: 13, color: '#1a1915', fontWeight: 500 }}>Incluye IVA (gravado)</span>
            </label>
            <p style={{ margin: '4px 0 0 30px', fontSize: 11, color: '#9a9895' }}>
              Los soportes exentos no incluyen IVA en las propuestas.
            </p>
          </div>

          {error && (
            <div style={{ marginBottom: 14, padding: '8px 12px', background: '#fef0f0', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #e5e3dc', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', color: '#4a4845' }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ padding: '9px 20px', border: 'none', borderRadius: 8, background: saving ? '#c45a10' : '#eb691c', cursor: saving ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', color: '#fff', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear soporte'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Import Modal ─────────────────────────────────────────────────────────────

function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null); setSuccess(null); setRows(null)

    try {
      const XLSX = await import('xlsx')
      const ab = await file.arrayBuffer()
      const wb = XLSX.read(ab, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws)

      const parsed: ImportRow[] = data.map((row, i) => {
        const nombre = String(row['nombre'] ?? row['Nombre'] ?? row['NOMBRE'] ?? '').trim()
        if (!nombre) throw new Error(`Fila ${i + 2}: nombre vacío`)

        const ps = row['precio_semanal'] ?? row['Precio Semanal'] ?? row['PRECIO_SEMANAL'] ?? 0
        const precio_semanal = Number(ps)
        if (isNaN(precio_semanal)) throw new Error(`Fila ${i + 2}: precio_semanal inválido`)

        const ivaRaw = String(row['tiene_iva'] ?? row['Tiene IVA'] ?? row['iva'] ?? row['IVA'] ?? 'no').toLowerCase()
        const tiene_iva = ['si', 'sí', 'true', '1', 'yes'].includes(ivaRaw)

        const categoria = String(row['categoria'] ?? row['Categoria'] ?? row['Categoría'] ?? row['CATEGORIA'] ?? '').trim() || undefined
        const tipo = String(row['tipo'] ?? row['Tipo'] ?? row['TIPO'] ?? '').trim() || undefined
        const seccion = String(row['seccion'] ?? row['Seccion'] ?? row['Sección'] ?? row['SECCION'] ?? '').trim() || undefined
        const ubicacion = String(row['ubicacion'] ?? row['Ubicacion'] ?? row['Ubicación'] ?? row['UBICACION'] ?? '').trim() || undefined

        return { nombre, categoria, tipo, seccion, ubicacion, precio_semanal, tiene_iva }
      })

      setRows(parsed)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al procesar el archivo')
    }
  }

  async function handleImport() {
    if (!rows?.length) return
    setImporting(true); setError(null)

    const res = await fetch('/api/soportes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: rows }),
    })
    setImporting(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Error al importar')
      return
    }
    const d = await res.json()
    setSuccess(`${d.count ?? rows.length} soportes importados correctamente`)
    setTimeout(() => onImported(), 1500)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 640, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid #e5e3dc' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1a1915' }}>Importar desde Excel</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9a9895' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '20px 20px 24px' }}>
          <div style={{ padding: '12px 14px', background: '#f9f8f5', border: '1px solid #e5e3dc', borderRadius: 8, marginBottom: 20, fontSize: 12, color: '#4a4845', lineHeight: 1.7 }}>
            <strong>Columnas requeridas:</strong>{' '}
            {['nombre', 'precio_semanal', 'tiene_iva (si/no)'].map(c => (
              <code key={c} style={{ background: '#e5e3dc', padding: '1px 5px', borderRadius: 4, marginRight: 4 }}>{c}</code>
            ))}<br />
            <strong>Columnas opcionales:</strong>{' '}
            {['categoria', 'tipo', 'seccion', 'ubicacion'].map(c => (
              <code key={c} style={{ background: '#e5e3dc', padding: '1px 5px', borderRadius: 4, marginRight: 4 }}>{c}</code>
            ))}<br />
            La primera fila debe ser el encabezado. Se aceptan .xlsx, .xls y .csv.
          </div>

          <div style={{ marginBottom: 20 }}>
            <input type="file" accept=".xlsx,.xls,.csv" ref={fileRef} onChange={handleFile} style={{ display: 'none' }} />
            <button onClick={() => fileRef.current?.click()} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px',
              border: '1.5px dashed #c5c2bb', borderRadius: 8, background: '#fafaf8',
              cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', color: '#4a4845',
            }}>
              <Upload size={16} /> Seleccionar archivo
            </button>
          </div>

          {error && (
            <div style={{ marginBottom: 14, padding: '8px 12px', background: '#fef0f0', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>{error}</div>
          )}
          {success && (
            <div style={{ marginBottom: 14, padding: '8px 12px', background: 'rgba(21,128,61,0.08)', border: '1px solid #86efac', borderRadius: 8, fontSize: 12, color: '#15803d', fontWeight: 600 }}>{success}</div>
          )}

          {rows && rows.length > 0 && !success && (
            <>
              <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 600, color: '#1a1915' }}>Vista previa — {rows.length} filas</div>
              <div style={{ border: '1px solid #e5e3dc', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f9f8f5', borderBottom: '1px solid #e5e3dc' }}>
                        {['Nombre', 'Categoría', 'Tipo', 'Precio semanal', 'IVA'].map(h => (
                          <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, color: '#9a9895', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 10).map((r, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f4f3f0' }}>
                          <td style={{ padding: '7px 12px', color: '#1a1915', fontWeight: 600, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nombre}</td>
                          <td style={{ padding: '7px 12px', color: '#4a4845' }}>{r.categoria ?? '—'}</td>
                          <td style={{ padding: '7px 12px', color: '#4a4845' }}>{r.tipo ?? '—'}</td>
                          <td style={{ padding: '7px 12px', color: '#4a4845' }}>${r.precio_semanal.toLocaleString('es-AR')}</td>
                          <td style={{ padding: '7px 12px', color: r.tiene_iva ? '#15803d' : '#9a9895' }}>{r.tiene_iva ? 'Sí' : 'No'}</td>
                        </tr>
                      ))}
                      {rows.length > 10 && (
                        <tr>
                          <td colSpan={5} style={{ padding: '8px 12px', textAlign: 'center', color: '#9a9895', fontSize: 11 }}>… y {rows.length - 10} más</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #e5e3dc', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', color: '#4a4845' }}>Cancelar</button>
                <button onClick={handleImport} disabled={importing} style={{ padding: '9px 20px', border: 'none', borderRadius: 8, background: importing ? '#c45a10' : '#eb691c', cursor: importing ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', color: '#fff', opacity: importing ? 0.7 : 1 }}>
                  {importing ? 'Importando...' : `Importar ${rows.length} soportes`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SoportesClient({ initialSoportes }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [soportes, setSoportes] = useState<SoporteRow[]>(initialSoportes)
  const [editingSoporte, setEditingSoporte] = useState<SoporteRow | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filtroActivo, setFiltroActivo] = useState<'todos' | 'activos' | 'inactivos'>('activos')

  function handleSaved() {
    setShowModal(false)
    setEditingSoporte(null)
    startTransition(() => { router.refresh() })
  }

  function handleImported() {
    setShowImport(false)
    startTransition(() => { router.refresh() })
  }

  async function handleDeactivate(id: string) {
    if (!confirm('¿Desactivar este soporte?')) return
    setDeletingId(id)
    await fetch(`/api/soportes/${id}`, { method: 'DELETE' })
    setDeletingId(null)
    setSoportes(prev => prev.map(s => s.id === id ? { ...s, activo: false } : s))
  }

  async function handleActivate(id: string) {
    setDeletingId(id)
    await fetch(`/api/soportes/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: true }),
    })
    setDeletingId(null)
    setSoportes(prev => prev.map(s => s.id === id ? { ...s, activo: true } : s))
  }

  const filtered = soportes.filter(s => {
    if (filtroActivo === 'activos' && !s.activo) return false
    if (filtroActivo === 'inactivos' && s.activo) return false
    if (search) {
      const q = search.toLowerCase()
      const matches = s.nombre.toLowerCase().includes(q) ||
        (s.categoria ?? '').toLowerCase().includes(q) ||
        (s.tipo ?? '').toLowerCase().includes(q) ||
        (s.seccion ?? '').toLowerCase().includes(q)
      if (!matches) return false
    }
    return true
  })

  const activos   = soportes.filter(s => s.activo).length
  const inactivos = soportes.filter(s => !s.activo).length

  const th: React.CSSProperties = {
    padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700,
    color: '#9a9895', textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap',
  }

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif', minHeight: '100%' }}>

      {showModal && (
        <SoporteModal
          soporte={editingSoporte}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
        />
      )}
      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImported={handleImported} />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1a1915', margin: 0 }}>Soportes publicitarios</h1>
          <p style={{ color: '#9a9895', fontSize: 13, marginTop: 3 }}>{activos} activos · {inactivos} inactivos</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowImport(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid #e5e3dc', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', color: '#4a4845' }}>
            <Upload size={14} /> Importar Excel
          </button>
          <button onClick={() => { setEditingSoporte(null); setShowModal(true) }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#eb691c', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', cursor: 'pointer' }}>
            <Plus size={15} /> Nuevo soporte
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text" placeholder="Buscar por nombre, categoría, tipo o sección..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ padding: '7px 12px', border: '1px solid #e5e3dc', borderRadius: 8, fontSize: 13, fontFamily: 'Montserrat, sans-serif', color: '#1a1915', background: '#fff', outline: 'none', minWidth: 280 }}
        />
        <div style={{ display: 'flex', gap: 4, background: '#f4f3f0', borderRadius: 8, padding: 3 }}>
          {(['activos', 'todos', 'inactivos'] as const).map(v => (
            <button key={v} onClick={() => setFiltroActivo(v)} style={{
              padding: '5px 12px', border: 'none', borderRadius: 6, cursor: 'pointer',
              fontSize: 12, fontWeight: 600, fontFamily: 'Montserrat, sans-serif',
              background: filtroActivo === v ? '#fff' : 'transparent',
              color: filtroActivo === v ? '#1a1915' : '#6e6a62',
              boxShadow: filtroActivo === v ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            }}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: '#9a9895' }}>{filtered.length} resultado{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: '#9a9895' }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#4a4845', margin: 0 }}>Sin soportes para mostrar</p>
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e5e3dc', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9f8f5', borderBottom: '1px solid #e5e3dc' }}>
                  <th style={th}>Nombre</th>
                  <th style={th}>Categoría</th>
                  <th style={th}>Tipo</th>
                  <th style={th}>Sección</th>
                  <th style={th}>Precio semanal</th>
                  <th style={th}>IVA</th>
                  <th style={th}>Estado</th>
                  <th style={{ ...th, textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f4f3f0', opacity: s.activo ? 1 : 0.5 }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1a1915' }}>
                      {s.nombre}
                      {s.ubicacion && <div style={{ fontSize: 11, color: '#9a9895', fontWeight: 400 }}>{s.ubicacion}</div>}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#4a4845' }}>{s.categoria ?? '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#4a4845' }}>{s.tipo ? tipoLabel(s.tipo) : '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#4a4845' }}>{s.seccion ?? '—'}</td>
                    <td style={{ padding: '10px 12px', color: '#4a4845' }}>{formatCurrency(s.precio_semanal)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: s.tiene_iva ? 'rgba(37,99,235,0.1)' : '#f4f3f0', color: s.tiene_iva ? '#2563eb' : '#9a9895' }}>
                        {s.tiene_iva ? 'Gravado' : 'Exento'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: s.activo ? 'rgba(21,128,61,0.1)' : 'rgba(107,114,128,0.1)', color: s.activo ? '#15803d' : '#6b7280' }}>
                        {s.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        <button onClick={() => { setEditingSoporte(s); setShowModal(true) }} title="Editar"
                          style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid #e5e3dc', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4a4845' }}>
                          <Pencil size={13} />
                        </button>
                        {s.activo ? (
                          <button onClick={() => handleDeactivate(s.id)} disabled={deletingId === s.id} title="Desactivar"
                            style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid #fca5a5', background: '#fff', cursor: deletingId === s.id ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626', opacity: deletingId === s.id ? 0.5 : 1 }}>
                            <X size={13} />
                          </button>
                        ) : (
                          <button onClick={() => handleActivate(s.id)} disabled={deletingId === s.id} title="Reactivar"
                            style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid #86efac', background: '#fff', cursor: deletingId === s.id ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#15803d', opacity: deletingId === s.id ? 0.5 : 1 }}>
                            <Check size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
