'use client'

import { useState, useMemo, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { X, Upload, Trash2, Play, FileText, Film, Loader2 } from 'lucide-react'

interface SoporteInfo { id: string; nombre: string; tipo: string | null; es_digital: boolean | null }
interface ReservaItem { id: string; soporte_id: string; soportes: SoporteInfo | null }
interface Reserva {
  id: string
  fecha_desde: string
  fecha_hasta: string
  estado: string
  clientes: { id: string; nombre: string; empresa: string | null } | null
  reserva_items: ReservaItem[]
}
interface Registro {
  id: string
  soporte_id: string
  reserva_id: string | null
  tipo: 'foto' | 'video'
  storage_path: string
  nombre_archivo: string | null
  notas: string | null
  fecha_registro: string
  subido_por: string | null
}

interface Props {
  reservas: Reserva[]
  soportes: SoporteInfo[]
  userId: string
  userRol: string
  supabaseUrl: string
  supabaseAnonKey: string
}

const inputStyle: React.CSSProperties = {
  height: 36, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 13, fontFamily: 'Montserrat, sans-serif', outline: 'none', boxSizing: 'border-box',
}

function fmtFecha(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default function RegistrosClient({ reservas, userId, userRol, supabaseUrl, supabaseAnonKey }: Props) {
  const supabase = useMemo(() => createClient(supabaseUrl, supabaseAnonKey), [supabaseUrl, supabaseAnonKey])
  const storageUrl = `${supabaseUrl}/storage/v1/object/public/registros`

  const [filterCliente, setFilterCliente] = useState('')
  const [filterTipo, setFilterTipo] = useState<'todos' | 'digital' | 'estatico'>('todos')

  // registros keyed by soporte_id+reserva_id
  const [registrosMap, setRegistrosMap] = useState<Record<string, Registro[]>>({})
  const [loadedKeys, setLoadedKeys] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [lightbox, setLightbox] = useState<{ url: string; tipo: 'foto' | 'video' } | null>(null)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Comprobante generation state (keyed by reserva_id)
  const [generando, setGenerando] = useState<Record<string, boolean>>({})
  const [comprobantesMap, setComprobantesMap] = useState<Record<string, Array<{ tipo: string; url: string }>>>({})

  async function handleGenerarComprobante(reservaId: string) {
    setGenerando(prev => ({ ...prev, [reservaId]: true }))
    try {
      const res = await fetch('/api/comprobantes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reserva_id: reservaId }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error desconocido' }))
        alert(err.error ?? 'Error generando comprobante')
        return
      }
      const data = await res.json()
      setComprobantesMap(prev => ({ ...prev, [reservaId]: data.comprobantes }))
    } finally {
      setGenerando(prev => ({ ...prev, [reservaId]: false }))
    }
  }

  const canDelete = (reg: Registro) =>
    reg.subido_por === userId || ['administracion', 'operaciones'].includes(userRol)

  const reservasFiltradas = useMemo(() => {
    let list = reservas
    if (filterCliente) {
      const q = filterCliente.toLowerCase()
      list = list.filter(r => {
        const cli = r.clientes
        return (cli?.empresa ?? cli?.nombre ?? '').toLowerCase().includes(q)
      })
    }
    if (filterTipo !== 'todos') {
      list = list.filter(r => r.reserva_items.some(it => {
        const digital = it.soportes?.es_digital ?? false
        return filterTipo === 'digital' ? digital : !digital
      }))
    }
    return list
  }, [reservas, filterCliente, filterTipo])

  async function loadRegistros(soporteId: string, reservaId: string) {
    const key = `${soporteId}__${reservaId}`
    if (loadedKeys.has(key)) return
    setLoadedKeys(prev => new Set(prev).add(key))
    const res = await fetch(`/api/registros?soporte_id=${soporteId}&reserva_id=${reservaId}`)
    if (!res.ok) return
    const data: Registro[] = await res.json()
    setRegistrosMap(prev => ({ ...prev, [key]: data }))
  }

  async function handleUpload(soporteId: string, reservaId: string, files: FileList | null) {
    if (!files || files.length === 0) return
    const key = `${soporteId}__${reservaId}`
    setUploading(prev => ({ ...prev, [key]: true }))

    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop() ?? 'bin'
      const path = `${reservaId}/${soporteId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const tipo: 'foto' | 'video' = file.type.startsWith('video/') ? 'video' : 'foto'

      const { error: storageErr } = await supabase.storage.from('registros').upload(path, file, { upsert: false })
      if (storageErr) { alert(`Error subiendo ${file.name}: ${storageErr.message}`); continue }

      const res = await fetch('/api/registros', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soporte_id: soporteId, reserva_id: reservaId, tipo, storage_path: path, nombre_archivo: file.name }),
      })
      if (!res.ok) { alert('Error guardando registro'); continue }
      const created: Registro = await res.json()
      setRegistrosMap(prev => ({ ...prev, [key]: [created, ...(prev[key] ?? [])] }))
    }
    setUploading(prev => ({ ...prev, [key]: false }))
  }

  async function handleDelete(reg: Registro, key: string) {
    if (!confirm('¿Eliminar este registro?')) return
    const res = await fetch(`/api/registros/${reg.id}`, { method: 'DELETE' })
    if (!res.ok) { alert('Error al eliminar'); return }
    setRegistrosMap(prev => ({ ...prev, [key]: (prev[key] ?? []).filter(r => r.id !== reg.id) }))
  }

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterTipo} onChange={e => setFilterTipo(e.target.value as 'todos' | 'digital' | 'estatico')} style={{ ...inputStyle, width: 160 }}>
          <option value="todos">Todos los tipos</option>
          <option value="digital">Digital</option>
          <option value="estatico">Estático</option>
        </select>
        <input
          placeholder="Filtrar por cliente..."
          value={filterCliente}
          onChange={e => setFilterCliente(e.target.value)}
          style={{ ...inputStyle, width: 220 }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {reservasFiltradas.length} reserva{reservasFiltradas.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Reserva cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {reservasFiltradas.map(reserva => {
          const cli = reserva.clientes
          const items = reserva.reserva_items.filter(it => {
            if (filterTipo === 'todos') return true
            const digital = it.soportes?.es_digital ?? false
            return filterTipo === 'digital' ? digital : !digital
          })

          return (
            <div key={reserva.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              {/* Reserva header */}
              <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                    {reserva.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                    {fmtFecha(reserva.fecha_desde)} → {fmtFecha(reserva.fecha_hasta)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* Comprobante download links if already generated */}
                  {(comprobantesMap[reserva.id] ?? []).map(c => (
                    <a
                      key={c.tipo}
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, background: '#fff', color: 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', fontFamily: 'Montserrat, sans-serif' }}
                    >
                      {c.tipo === 'video' ? <Film size={12} /> : <FileText size={12} />}
                      {c.tipo === 'video' ? 'Video' : c.tipo === 'pdf_buses' ? 'PDF Buses' : 'PDF'}
                    </a>
                  ))}
                  {/* Generate comprobante button */}
                  <button
                    onClick={() => handleGenerarComprobante(reserva.id)}
                    disabled={generando[reserva.id]}
                    title="Generar comprobante"
                    style={{ fontSize: 12, padding: '4px 10px', border: 'none', borderRadius: 6, background: generando[reserva.id] ? '#e5e7eb' : '#1a1a2e', color: generando[reserva.id] ? 'var(--text-muted)' : '#fff', cursor: generando[reserva.id] ? 'not-allowed' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'Montserrat, sans-serif' }}
                  >
                    {generando[reserva.id] ? <Loader2 size={12} /> : <Film size={12} />}
                    {generando[reserva.id] ? 'Generando...' : 'Comprobante'}
                  </button>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{cli?.empresa ?? cli?.nombre ?? '—'}</div>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: reserva.estado === 'confirmada' ? '#f0fdf4' : '#fef9ec', color: reserva.estado === 'confirmada' ? '#15803d' : '#b45309' }}>
                      {reserva.estado}
                    </span>
                  </div>
                </div>
              </div>

              {/* Soporte rows */}
              {items.map(item => {
                if (!item.soportes) return null
                const soporte = item.soportes
                const key = `${soporte.id}__${reserva.id}`
                const regs = registrosMap[key]
                const isLoaded = loadedKeys.has(key)
                const isUploading = uploading[key]
                const digital = soporte.es_digital ?? false

                return (
                  <div key={item.id} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{soporte.nombre}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: digital ? '#eef2ff' : '#fafafa', color: digital ? '#4338ca' : 'var(--text-muted)', border: '1px solid var(--border)' }}>
                          {digital ? 'Digital' : 'Estático'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {!isLoaded && (
                          <button
                            onClick={() => loadRegistros(soporte.id, reserva.id)}
                            style={{ fontSize: 12, padding: '4px 10px', border: '1px solid var(--border)', borderRadius: 6, background: '#fff', cursor: 'pointer', color: 'var(--text-secondary)', fontFamily: 'Montserrat, sans-serif' }}
                          >
                            Ver registros
                          </button>
                        )}
                        <button
                          onClick={() => fileInputRefs.current[key]?.click()}
                          disabled={isUploading}
                          style={{ fontSize: 12, padding: '4px 10px', border: 'none', borderRadius: 6, background: 'var(--orange)', color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, opacity: isUploading ? 0.6 : 1, fontFamily: 'Montserrat, sans-serif' }}
                        >
                          <Upload size={12} /> {isUploading ? 'Subiendo...' : 'Agregar'}
                        </button>
                        <input
                          ref={el => { fileInputRefs.current[key] = el }}
                          type="file"
                          accept="image/*,video/*"
                          multiple
                          style={{ display: 'none' }}
                          onChange={e => handleUpload(soporte.id, reserva.id, e.target.files)}
                        />
                      </div>
                    </div>

                    {/* Media grid — lazy, only renders when loaded */}
                    {isLoaded && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {(regs ?? []).length === 0 && (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin registros aún.</span>
                        )}
                        {(regs ?? []).map(reg => {
                          const url = `${storageUrl}/${reg.storage_path}`
                          return (
                            <div key={reg.id} style={{ position: 'relative', width: 110, height: 90, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', background: '#f3f4f6', flexShrink: 0 }}>
                              {reg.tipo === 'foto' ? (
                                // Lazy-loaded thumbnail
                                <img
                                  src={url}
                                  alt={reg.nombre_archivo ?? ''}
                                  loading="lazy"
                                  onClick={() => setLightbox({ url, tipo: 'foto' })}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer', display: 'block' }}
                                />
                              ) : (
                                // Video: show play icon, open in lightbox on click
                                <div
                                  onClick={() => setLightbox({ url, tipo: 'video' })}
                                  style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', gap: 4 }}
                                >
                                  <Play size={28} style={{ color: 'var(--orange)' }} />
                                  <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{reg.nombre_archivo ?? 'video'}</span>
                                </div>
                              )}
                              {/* Delete button */}
                              <button
                                onClick={e => { e.stopPropagation(); handleDelete(reg, key) }}
                                title="Eliminar"
                                style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.55)', border: 'none', borderRadius: 4, cursor: 'pointer', padding: 3, display: 'flex', alignItems: 'center' }}
                              >
                                <Trash2 size={10} color="#fff" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}

        {reservasFiltradas.length === 0 && (
          <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 13 }}>
            No hay reservas que coincidan con los filtros.
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}
          onClick={() => setLightbox(null)}
        >
          <button onClick={() => setLightbox(null)} style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, padding: 8, cursor: 'pointer' }}>
            <X size={20} color="#fff" />
          </button>
          {lightbox.tipo === 'foto' ? (
            <img
              src={lightbox.url}
              alt=""
              style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <video
              src={lightbox.url}
              controls
              autoPlay
              style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8 }}
              onClick={e => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </div>
  )
}
