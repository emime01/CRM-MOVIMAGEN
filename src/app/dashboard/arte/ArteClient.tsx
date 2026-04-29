'use client'

import { useState, useMemo, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Upload, Trash2, X, CheckCircle, XCircle, Clock, Plus, ChevronDown, ChevronRight, Eye } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Soporte {
  id: string
  nombre: string
  seccion: string | null
  ubicacion: string | null
  salidas_por_hora: number | null
}

interface CampanaInfo {
  empresa: string
  marca: string
  desde: string
  hasta: string
  orden_id: string
  reserva_id: string | null
}

interface Material {
  id: string
  soporte_id: string
  orden_id: string | null
  reserva_id: string | null
  storage_path: string
  nombre_archivo: string | null
  descripcion: string | null
  activo: boolean
  created_at: string
}

interface OrdenConSoportes {
  id: string
  numero: string | null
  marca: string | null
  estado: string
  fecha_alta_prevista: string | null
  fecha_baja_prevista: string | null
  cliente_nombre: string
  soportes: Array<{ id: string; nombre: string; tipo: string | null }>
}

interface Muestra {
  id: string
  orden_id: string
  soporte_id: string | null
  version: number
  storage_path: string | null
  nombre_archivo: string | null
  estado: 'pendiente' | 'aprobado' | 'rechazado'
  comentario: string | null
  fecha_entrega: string | null
  created_at: string
}

interface Props {
  soportes: Soporte[]
  campanasMap: Record<string, CampanaInfo>
  ordenes: OrdenConSoportes[]
  supabaseUrl: string
  supabaseAnonKey: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  height: 36, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 13, fontFamily: 'Montserrat, sans-serif', outline: 'none', background: 'var(--bg-card)',
  color: 'var(--text-primary)', boxSizing: 'border-box',
}

const btnPrimary: React.CSSProperties = {
  padding: '6px 14px', border: 'none', borderRadius: 8, background: 'var(--orange)',
  color: '#fff', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif', fontSize: 12,
  fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5,
}

const btnSecondary: React.CSSProperties = {
  padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-card)',
  color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'Montserrat, sans-serif', fontSize: 12,
  fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 5,
}

function fmtFecha(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function estadoBadge(estado: string) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    pendiente: { bg: '#fef9ec', color: '#b45309', label: 'Pendiente' },
    aprobado:  { bg: '#f0fdf4', color: '#15803d', label: 'Aprobado' },
    rechazado: { bg: '#fef2f2', color: '#dc2626', label: 'Rechazado' },
  }
  const s = map[estado] ?? map.pendiente
  return (
    <span style={{ background: s.bg, color: s.color, padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700 }}>
      {s.label}
    </span>
  )
}

// ─── Tab: Planilla Digital ────────────────────────────────────────────────────

function PlanillaTab({
  soportes, campanasMap, supabase, storageUrl,
}: {
  soportes: Soporte[]
  campanasMap: Record<string, CampanaInfo>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
  storageUrl: string
}) {
  const [materialesMap, setMaterialesMap] = useState<Record<string, Material[]>>({})
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [lightbox, setLightbox] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const total = soportes.length
  const ocupadas = soportes.filter(s => campanasMap[s.id]).length

  async function loadMateriales(soporteId: string) {
    if (loadedIds.has(soporteId)) return
    setLoadedIds(prev => new Set(prev).add(soporteId))
    const res = await fetch(`/api/arte/materiales?soporte_id=${soporteId}`)
    if (!res.ok) return
    const data: Material[] = await res.json()
    setMaterialesMap(prev => ({ ...prev, [soporteId]: data }))
  }

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else {
        next.add(id)
        loadMateriales(id)
      }
      return next
    })
  }

  async function handleUpload(soporteId: string, files: FileList | null) {
    if (!files || files.length === 0) return
    const campana = campanasMap[soporteId]
    setUploading(prev => ({ ...prev, [soporteId]: true }))

    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop() ?? 'bin'
      const path = `digitales/${soporteId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

      const { error: storageErr } = await supabase.storage.from('arte').upload(path, file, { upsert: false })
      if (storageErr) { alert(`Error subiendo ${file.name}: ${storageErr.message}`); continue }

      const res = await fetch('/api/arte/materiales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          soporte_id: soporteId,
          orden_id: campana?.orden_id ?? null,
          reserva_id: campana?.reserva_id ?? null,
          storage_path: path,
          nombre_archivo: file.name,
        }),
      })
      if (!res.ok) { alert('Error guardando material'); continue }
      const created: Material = await res.json()
      setMaterialesMap(prev => ({ ...prev, [soporteId]: [created, ...(prev[soporteId] ?? [])] }))
    }

    setUploading(prev => ({ ...prev, [soporteId]: false }))
  }

  async function handleDelete(mat: Material) {
    if (!confirm('¿Eliminar este material?')) return
    const res = await fetch(`/api/arte/materiales?id=${mat.id}`, { method: 'DELETE' })
    if (!res.ok) { alert('Error al eliminar'); return }
    setMaterialesMap(prev => ({
      ...prev,
      [mat.soporte_id]: (prev[mat.soporte_id] ?? []).filter(m => m.id !== mat.id),
    }))
  }

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total pantallas LED', value: total, color: 'var(--text-primary)' },
          { label: 'Con campaña activa', value: ocupadas, color: 'var(--orange)' },
          { label: 'Libres', value: total - ocupadas, color: '#15803d' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Soporte rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {soportes.map(s => {
          const campana = campanasMap[s.id]
          const isExpanded = expanded.has(s.id)
          const mats = materialesMap[s.id] ?? []
          const isUploading = uploading[s.id]

          return (
            <div key={s.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              {/* Header row */}
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={() => toggle(s.id)}
                  style={{ ...btnSecondary, padding: '4px 6px', minWidth: 28, justifyContent: 'center' }}
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{s.nombre}</span>
                  {s.ubicacion && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>{s.ubicacion}</span>}
                </div>

                {campana ? (
                  <div style={{ textAlign: 'right', minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>{campana.empresa}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{campana.marca} · {fmtFecha(campana.desde)} - {fmtFecha(campana.hasta)}</div>
                  </div>
                ) : (
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 5, background: '#f0fdf4', color: '#15803d' }}>Libre</span>
                )}

                <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {loadedIds.has(s.id) ? `${mats.length} material${mats.length !== 1 ? 'es' : ''}` : ''}
                </span>

                <button
                  onClick={() => fileRefs.current[s.id]?.click()}
                  disabled={isUploading}
                  style={{ ...btnPrimary, opacity: isUploading ? 0.6 : 1 }}
                >
                  <Upload size={12} />
                  {isUploading ? 'Subiendo...' : 'Subir material'}
                </button>
                <input
                  ref={el => { fileRefs.current[s.id] = el }}
                  type="file"
                  accept="image/*,video/*,.pdf,.ai,.psd,.eps,.png,.jpg,.jpeg,.mp4,.mov"
                  multiple
                  style={{ display: 'none' }}
                  onChange={e => handleUpload(s.id, e.target.files)}
                />
              </div>

              {/* Expanded: material grid */}
              {isExpanded && (
                <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg-app)' }}>
                  {mats.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin materiales cargados.</p>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {mats.map(mat => {
                        const url = `${storageUrl}/${mat.storage_path}`
                        const isImg = /\.(jpe?g|png|gif|webp)$/i.test(mat.nombre_archivo ?? '')
                        const isVideo = /\.(mp4|mov|webm|avi)$/i.test(mat.nombre_archivo ?? '')
                        return (
                          <div key={mat.id} style={{ position: 'relative', width: 120, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-card)', flexShrink: 0 }}>
                            {isImg ? (
                              <img
                                src={url} alt={mat.nombre_archivo ?? ''}
                                loading="lazy"
                                style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block', cursor: 'pointer' }}
                                onClick={() => setLightbox(url)}
                              />
                            ) : (
                              <div style={{ height: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer' }} onClick={() => window.open(url, '_blank')}>
                                {isVideo ? '🎬' : '📄'}
                                <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', padding: '0 4px', wordBreak: 'break-all' }}>{mat.nombre_archivo}</span>
                              </div>
                            )}
                            <div style={{ padding: '4px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>{mat.nombre_archivo ?? 'archivo'}</span>
                              <button
                                onClick={() => handleDelete(mat)}
                                title="Eliminar"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}
                              >
                                <Trash2 size={12} color="var(--text-muted)" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }} onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer' }}>
            <X size={20} color="#fff" />
          </button>
          <img src={lightbox} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }} onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  )
}

// ─── Tab: Muestras de Impresión ───────────────────────────────────────────────

function MuestrasTab({
  ordenes, supabase, storageUrl,
}: {
  ordenes: OrdenConSoportes[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
  storageUrl: string
}) {
  const [muestrasMap, setMuestrasMap] = useState<Record<string, Muestra[]>>({})
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editComentario, setEditComentario] = useState('')
  const [editFecha, setEditFecha] = useState('')
  const [filterEstado, setFilterEstado] = useState<'todos' | 'pendiente' | 'aprobado' | 'rechazado'>('todos')
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  async function loadMuestras(ordenId: string) {
    if (loadedIds.has(ordenId)) return
    setLoadedIds(prev => new Set(prev).add(ordenId))
    const res = await fetch(`/api/arte/muestras?orden_id=${ordenId}`)
    if (!res.ok) return
    const data: Muestra[] = await res.json()
    setMuestrasMap(prev => ({ ...prev, [ordenId]: data }))
  }

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else {
        next.add(id)
        loadMuestras(id)
      }
      return next
    })
  }

  async function handleUpload(ordenId: string, soporteId: string | null, files: FileList | null) {
    if (!files || files.length === 0) return
    const key = `${ordenId}__${soporteId ?? 'general'}`
    setUploading(prev => ({ ...prev, [key]: true }))

    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop() ?? 'bin'
      const path = `muestras/${ordenId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

      const { error: storageErr } = await supabase.storage.from('arte').upload(path, file, { upsert: false })
      if (storageErr) { alert(`Error subiendo ${file.name}: ${storageErr.message}`); continue }

      const res = await fetch('/api/arte/muestras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orden_id: ordenId, soporte_id: soporteId, storage_path: path, nombre_archivo: file.name }),
      })
      if (!res.ok) { alert('Error guardando muestra'); continue }
      const created: Muestra = await res.json()
      setMuestrasMap(prev => ({ ...prev, [ordenId]: [created, ...(prev[ordenId] ?? [])] }))
    }

    setUploading(prev => ({ ...prev, [key]: false }))
  }

  async function handleAddMuestra(ordenId: string) {
    const res = await fetch('/api/arte/muestras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orden_id: ordenId }),
    })
    if (!res.ok) { alert('Error'); return }
    const created: Muestra = await res.json()
    setMuestrasMap(prev => ({ ...prev, [ordenId]: [created, ...(prev[ordenId] ?? [])] }))
    setEditingId(created.id)
    setEditComentario('')
    setEditFecha('')
  }

  async function handleEstado(muestra: Muestra, estado: 'aprobado' | 'rechazado' | 'pendiente') {
    const res = await fetch(`/api/arte/muestras/${muestra.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    })
    if (!res.ok) { alert('Error'); return }
    const updated: Muestra = await res.json()
    setMuestrasMap(prev => ({
      ...prev,
      [muestra.orden_id]: (prev[muestra.orden_id] ?? []).map(m => m.id === updated.id ? updated : m),
    }))
  }

  async function handleSaveEdit(muestra: Muestra) {
    const res = await fetch(`/api/arte/muestras/${muestra.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comentario: editComentario || null, fecha_entrega: editFecha || null }),
    })
    if (!res.ok) { alert('Error'); return }
    const updated: Muestra = await res.json()
    setMuestrasMap(prev => ({
      ...prev,
      [muestra.orden_id]: (prev[muestra.orden_id] ?? []).map(m => m.id === updated.id ? updated : m),
    }))
    setEditingId(null)
  }

  async function handleDelete(muestra: Muestra) {
    if (!confirm('¿Eliminar esta muestra?')) return
    const res = await fetch(`/api/arte/muestras/${muestra.id}`, { method: 'DELETE' })
    if (!res.ok) { alert('Error al eliminar'); return }
    setMuestrasMap(prev => ({
      ...prev,
      [muestra.orden_id]: (prev[muestra.orden_id] ?? []).filter(m => m.id !== muestra.id),
    }))
  }

  const ordenesFiltradas = useMemo(() => {
    if (filterEstado === 'todos') return ordenes
    return ordenes.filter(o => {
      const muestras = muestrasMap[o.id] ?? []
      if (muestras.length === 0) return filterEstado === 'pendiente'
      return muestras.some(m => m.estado === filterEstado)
    })
  }, [ordenes, filterEstado, muestrasMap])

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
        <select value={filterEstado} onChange={e => setFilterEstado(e.target.value as typeof filterEstado)} style={{ ...inputStyle, width: 180 }}>
          <option value="todos">Todos los estados</option>
          <option value="pendiente">Pendiente</option>
          <option value="aprobado">Aprobado</option>
          <option value="rechazado">Rechazado</option>
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {ordenesFiltradas.length} orden{ordenesFiltradas.length !== 1 ? 'es' : ''}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {ordenesFiltradas.map(orden => {
          const isExpanded = expanded.has(orden.id)
          const muestras = muestrasMap[orden.id] ?? []
          const pendientes = muestras.filter(m => m.estado === 'pendiente').length
          const aprobadas = muestras.filter(m => m.estado === 'aprobado').length
          const rechazadas = muestras.filter(m => m.estado === 'rechazado').length

          return (
            <div key={orden.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              {/* Orden header */}
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <button onClick={() => toggle(orden.id)} style={{ ...btnSecondary, padding: '4px 6px', minWidth: 28, justifyContent: 'center' }}>
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{orden.numero ?? '—'}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{orden.cliente_nombre}</span>
                    {orden.marca && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>{orden.marca}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {orden.soportes.map(s => s.nombre).join(', ')}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  {loadedIds.has(orden.id) && (
                    <>
                      {pendientes > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: '#fef9ec', color: '#b45309' }}>{pendientes} pend.</span>}
                      {aprobadas > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: '#f0fdf4', color: '#15803d' }}>{aprobadas} aprobada{aprobadas !== 1 ? 's' : ''}</span>}
                      {rechazadas > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 5, background: '#fef2f2', color: '#dc2626' }}>{rechazadas} rechazada{rechazadas !== 1 ? 's' : ''}</span>}
                    </>
                  )}
                  <button onClick={() => handleAddMuestra(orden.id)} style={btnPrimary}>
                    <Plus size={12} /> Nueva muestra
                  </button>
                </div>
              </div>

              {/* Muestras list */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-app)' }}>
                  {muestras.length === 0 ? (
                    <p style={{ margin: 0, padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin muestras registradas.</p>
                  ) : (
                    muestras.map(muestra => {
                      const soporteNombre = orden.soportes.find(s => s.id === muestra.soporte_id)?.nombre ?? (muestra.soporte_id ? 'Soporte' : 'General')
                      const fileKey = `${orden.id}__${muestra.soporte_id ?? 'general'}`
                      const isUploading = uploading[fileKey]
                      const hasFile = !!muestra.storage_path
                      const fileUrl = hasFile ? `${storageUrl}/${muestra.storage_path}` : null

                      return (
                        <div key={muestra.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                          {/* Version badge */}
                          <div style={{ width: 40, height: 40, borderRadius: 8, background: 'var(--orange-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--orange)' }}>v{muestra.version}</span>
                          </div>

                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 200 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{soporteNombre}</span>
                              {estadoBadge(muestra.estado)}
                              {muestra.fecha_entrega && (
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                  Entregada: {fmtFecha(muestra.fecha_entrega)}
                                </span>
                              )}
                            </div>

                            {editingId === muestra.id ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                <input
                                  placeholder="Comentario..."
                                  value={editComentario}
                                  onChange={e => setEditComentario(e.target.value)}
                                  style={{ ...inputStyle, height: 32, width: '100%' }}
                                />
                                <input
                                  type="date"
                                  value={editFecha}
                                  onChange={e => setEditFecha(e.target.value)}
                                  style={{ ...inputStyle, height: 32, width: 160 }}
                                />
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <button onClick={() => handleSaveEdit(muestra)} style={{ ...btnPrimary, fontSize: 11 }}>Guardar</button>
                                  <button onClick={() => setEditingId(null)} style={{ ...btnSecondary, fontSize: 11 }}>Cancelar</button>
                                </div>
                              </div>
                            ) : (
                              muestra.comentario && (
                                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>{muestra.comentario}</p>
                              )
                            )}
                          </div>

                          {/* Actions */}
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                            {/* File upload */}
                            {!hasFile ? (
                              <>
                                <button
                                  onClick={() => fileRefs.current[muestra.id]?.click()}
                                  disabled={isUploading}
                                  style={{ ...btnSecondary, opacity: isUploading ? 0.6 : 1, fontSize: 11 }}
                                >
                                  <Upload size={11} /> {isUploading ? 'Subiendo...' : 'Adjuntar'}
                                </button>
                                <input
                                  ref={el => { fileRefs.current[muestra.id] = el }}
                                  type="file"
                                  accept="image/*,.pdf"
                                  style={{ display: 'none' }}
                                  onChange={async e => {
                                    const files = e.target.files
                                    if (!files || files.length === 0) return
                                    setUploading(prev => ({ ...prev, [muestra.id]: true }))
                                    const file = files[0]
                                    const ext = file.name.split('.').pop() ?? 'bin'
                                    const path = `muestras/${orden.id}/${muestra.id}.${ext}`
                                    const { error: sErr } = await supabase.storage.from('arte').upload(path, file, { upsert: true })
                                    if (sErr) { alert(sErr.message); setUploading(prev => ({ ...prev, [muestra.id]: false })); return }
                                    const res = await fetch(`/api/arte/muestras/${muestra.id}`, {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ storage_path: path, nombre_archivo: file.name } as Record<string, unknown>),
                                    })
                                    if (res.ok) {
                                      const updated: Muestra = await res.json()
                                      setMuestrasMap(prev => ({ ...prev, [orden.id]: (prev[orden.id] ?? []).map(m => m.id === updated.id ? updated : m) }))
                                    }
                                    setUploading(prev => ({ ...prev, [muestra.id]: false }))
                                  }}
                                />
                              </>
                            ) : (
                              <a href={fileUrl!} target="_blank" rel="noopener noreferrer" style={{ ...btnSecondary, fontSize: 11, textDecoration: 'none' }}>
                                <Eye size={11} /> Ver
                              </a>
                            )}

                            {/* Approval buttons */}
                            {muestra.estado === 'pendiente' && (
                              <>
                                <button
                                  onClick={() => handleEstado(muestra, 'aprobado')}
                                  style={{ ...btnSecondary, fontSize: 11, color: '#15803d', borderColor: '#15803d' }}
                                >
                                  <CheckCircle size={11} /> Aprobado
                                </button>
                                <button
                                  onClick={() => handleEstado(muestra, 'rechazado')}
                                  style={{ ...btnSecondary, fontSize: 11, color: '#dc2626', borderColor: '#dc2626' }}
                                >
                                  <XCircle size={11} /> Rechazado
                                </button>
                              </>
                            )}
                            {muestra.estado !== 'pendiente' && (
                              <button
                                onClick={() => handleEstado(muestra, 'pendiente')}
                                style={{ ...btnSecondary, fontSize: 11 }}
                              >
                                <Clock size={11} /> Reabrir
                              </button>
                            )}

                            {/* Edit / Delete */}
                            <button onClick={() => { setEditingId(muestra.id); setEditComentario(muestra.comentario ?? ''); setEditFecha(muestra.fecha_entrega ?? '') }} style={{ ...btnSecondary, fontSize: 11 }}>
                              Editar
                            </button>
                            <button onClick={() => handleDelete(muestra)} style={{ ...btnSecondary, fontSize: 11, color: '#dc2626', borderColor: '#dc2626' }}>
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          )
        })}

        {ordenesFiltradas.length === 0 && (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 13 }}>
            No hay ordenes que coincidan.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ArteClient({ soportes, campanasMap, ordenes, supabaseUrl, supabaseAnonKey }: Props) {
  const supabase = useMemo(() => createClient(supabaseUrl, supabaseAnonKey), [supabaseUrl, supabaseAnonKey])
  const storageUrl = `${supabaseUrl}/storage/v1/object/public/arte`

  const [tab, setTab] = useState<'planilla' | 'muestras'>('planilla')

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px', fontSize: 13, fontWeight: 600, cursor: 'pointer', border: 'none',
    borderBottom: active ? '2px solid var(--orange)' : '2px solid transparent',
    background: 'none', color: active ? 'var(--orange)' : 'var(--text-muted)',
    fontFamily: 'Montserrat, sans-serif',
  })

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        <button style={tabStyle(tab === 'planilla')} onClick={() => setTab('planilla')}>Planilla Digital</button>
        <button style={tabStyle(tab === 'muestras')} onClick={() => setTab('muestras')}>Muestras de Impresion</button>
      </div>

      {tab === 'planilla' && (
        <PlanillaTab
          soportes={soportes}
          campanasMap={campanasMap}
          supabase={supabase}
          storageUrl={storageUrl}
        />
      )}
      {tab === 'muestras' && (
        <MuestrasTab
          ordenes={ordenes}
          supabase={supabase}
          storageUrl={storageUrl}
        />
      )}
    </div>
  )
}
