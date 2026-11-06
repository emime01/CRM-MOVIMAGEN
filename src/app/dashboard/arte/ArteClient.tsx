'use client'

import { useState, useMemo, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Upload, Trash2, X, ChevronDown, ChevronRight } from 'lucide-react'
import { avisar, confirmar } from '@/components/ui/dialogos'
import { subirArchivo } from '@/lib/storage/subir'

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
  desde: string        // effective date (real ?? prevista)
  hasta: string
  desdePrevista: string | null   // only set when real differs
  hastaPrevista: string | null
  orden_id: string
  reserva_id: string | null
  numero?: number | null
  salidas?: number | null
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

interface Props {
  soportes: Soporte[]
  campanasMap: Record<string, CampanaInfo[]>
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

// ─── Tab: Planilla Digital ────────────────────────────────────────────────────

// Modal for setting real dates on a campaign
function FechaRealModal({ campana, onClose, onSaved }: {
  campana: CampanaInfo & { index: number }
  onClose: () => void
  onSaved: (ordenId: string, altaReal: string | null, bajaReal: string | null) => void
}) {
  const [altaReal, setAltaReal] = useState(campana.desde !== campana.desdePrevista ? campana.desde : '')
  const [bajaReal, setBajaReal] = useState(campana.hasta !== campana.hastaPrevista ? campana.hasta : '')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const body: Record<string, string | null> = {}
    if (altaReal) body.fecha_alta_real = altaReal
    if (bajaReal) body.fecha_baja_real = bajaReal
    const res = await fetch(`/api/ordenes/${campana.orden_id}/fechas-reales`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(false)
    if (!res.ok) { avisar('Error guardando fechas'); return }
    onSaved(campana.orden_id, altaReal || null, bajaReal || null)
    onClose()
  }

  async function handleClear() {
    if (!await confirmar('¿Borrar las fechas reales y volver a las previstas?')) return
    setSaving(true)
    await fetch(`/api/ordenes/${campana.orden_id}/fechas-reales`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha_alta_real: null, fecha_baja_real: null }),
    })
    setSaving(false)
    onSaved(campana.orden_id, null, null)
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 12, padding: 24, minWidth: 340, maxWidth: 420, width: '90vw' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>Registrar fechas reales</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 12, color: 'var(--text-muted)' }}>
          <strong>{campana.empresa}</strong> — {campana.marca}<br />
          Fechas previstas: <strong>{campana.desdePrevista ?? campana.desde}</strong> → <strong>{campana.hastaPrevista ?? campana.hasta}</strong>
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>FECHA ALTA REAL</label>
            <input type="date" value={altaReal} onChange={e => setAltaReal(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>FECHA BAJA REAL</label>
            <input type="date" value={bajaReal} min={altaReal || undefined} onChange={e => setBajaReal(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'space-between' }}>
          <button onClick={handleClear} disabled={saving} style={{ ...btnSecondary, fontSize: 11, color: '#dc2626', borderColor: '#dc2626' }}>
            Borrar fechas reales
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={btnSecondary}>Cancelar</button>
            <button onClick={handleSave} disabled={saving || (!altaReal && !bajaReal)} style={{ ...btnPrimary, opacity: (saving || (!altaReal && !bajaReal)) ? 0.6 : 1 }}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PlanillaTab({
  soportes, campanasMap: initialCampanasMap, supabase, storageUrl,
}: {
  soportes: Soporte[]
  campanasMap: Record<string, CampanaInfo[]>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
  storageUrl: string
}) {
  const [campanasMap, setCampanasMap] = useState(initialCampanasMap)
  const [materialesMap, setMaterialesMap] = useState<Record<string, Material[]>>({})
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [modalCampana, setModalCampana] = useState<(CampanaInfo & { index: number }) | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const total = soportes.length
  // "Con campaña activa" cuenta sólo lo que está al aire hoy; lo que empieza
  // más adelante figura igual en la lista, pero no ocupa la pantalla todavía.
  const hoyISO = new Date().toISOString().slice(0, 10)
  const ocupadas = soportes.filter(s => (campanasMap[s.id] ?? []).some(c => !c.desde || c.desde <= hoyISO)).length

  function handleFechaRealSaved(ordenId: string, altaReal: string | null, bajaReal: string | null) {
    setCampanasMap(prev => {
      const next = { ...prev }
      for (const soporteId of Object.keys(next)) {
        next[soporteId] = next[soporteId].map(c => {
          if (c.orden_id !== ordenId) return c
          // Recalculate effective dates
          const nuevaDesde = altaReal ?? (c.desdePrevista ?? c.desde)
          const nuevaHasta = bajaReal ?? (c.hastaPrevista ?? c.hasta)
          return {
            ...c,
            desde: nuevaDesde,
            hasta: nuevaHasta,
            desdePrevista: altaReal ? (c.desdePrevista ?? c.desde) : null,
            hastaPrevista: bajaReal ? (c.hastaPrevista ?? c.hasta) : null,
          }
        })
      }
      return next
    })
  }

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
    const campana = (campanasMap[soporteId] ?? [])[0] ?? null
    setUploading(prev => ({ ...prev, [soporteId]: true }))

    for (const file of Array.from(files)) {
      const subida = await subirArchivo(supabase, 'arte', file, `digitales/${soporteId}`)
      if ('error' in subida) { avisar(`Error subiendo ${file.name}: ${subida.error}`); continue }
      const path = subida.path

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
      if (!res.ok) { avisar('Error guardando material'); continue }
      const created: Material = await res.json()
      setMaterialesMap(prev => ({ ...prev, [soporteId]: [created, ...(prev[soporteId] ?? [])] }))
    }

    setUploading(prev => ({ ...prev, [soporteId]: false }))
  }

  async function handleDelete(mat: Material) {
    if (!await confirmar('¿Eliminar este material?')) return
    const res = await fetch(`/api/arte/materiales?id=${mat.id}`, { method: 'DELETE' })
    if (!res.ok) { avisar('Error al eliminar'); return }
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
          { label: 'Pantallas y circuitos', value: total, color: 'var(--text-primary)' },
          { label: 'Con campaña activa', value: ocupadas, color: 'var(--orange)' },
          { label: 'Libres hoy', value: total - ocupadas, color: '#15803d' },
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
          const campanas = campanasMap[s.id] ?? []
          const isExpanded = expanded.has(s.id)
          const mats = materialesMap[s.id] ?? []
          const isUploading = uploading[s.id]

          return (
            <div key={s.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
              {/* Header row */}
              <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <button
                  onClick={() => toggle(s.id)}
                  style={{ ...btnSecondary, padding: '4px 6px', minWidth: 28, justifyContent: 'center', marginTop: 2 }}
                >
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                {/* Soporte name */}
                <div style={{ minWidth: 140 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{s.nombre}</div>
                  {s.ubicacion && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{s.ubicacion}</div>}
                </div>

                {/* Campaigns list */}
                <div style={{ flex: 1, minWidth: 200 }}>
                  {campanas.length === 0 ? (
                    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 5, background: '#f0fdf4', color: '#15803d' }}>Libre</span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {campanas.map((c, i) => {
                        const hasReal = !!(c.desdePrevista || c.hastaPrevista)
                        const dias = c.hasta ? Math.ceil((new Date(c.hasta + 'T00:00:00').getTime() - Date.now()) / 86400000) : null
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{c.empresa}</span>
                                {c.marca && c.marca !== '—' && (
                                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.marca}</span>
                                )}
                                {c.numero != null && (
                                  <a href={`/dashboard/ventas/${c.orden_id}`} style={{ fontSize: 11, fontWeight: 700, color: 'var(--orange)', textDecoration: 'none' }}>OIC #{c.numero}</a>
                                )}
                                {c.salidas ? <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{c.salidas} salidas/h</span> : null}
                                {/* Effective dates */}
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {fmtFecha(c.desde)} → {fmtFecha(c.hasta)}
                                </span>
                                {/* Vence soon badge */}
                                {dias !== null && dias <= 30 && dias >= 0 && (
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: dias <= 7 ? '#fef2f2' : '#fef9ec', color: dias <= 7 ? '#dc2626' : '#b45309' }}>
                                    {dias === 0 ? 'vence hoy' : `${dias}d`}
                                  </span>
                                )}
                                {/* Real date indicator */}
                                {hasReal && (
                                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: '#eef2ff', color: '#4338ca' }}>
                                    real
                                  </span>
                                )}
                              </div>
                              {/* Show prevista when real differs */}
                              {hasReal && (
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                                  Prevista: {fmtFecha(c.desdePrevista ?? c.desde)} → {fmtFecha(c.hastaPrevista ?? c.hasta)}
                                </div>
                              )}
                            </div>
                            {/* Set real dates button */}
                            <button
                              onClick={() => setModalCampana({ ...c, index: i })}
                              style={{ ...btnSecondary, fontSize: 10, padding: '3px 8px', flexShrink: 0 }}
                              title="Registrar fecha real de inicio/baja"
                            >
                              Fecha real
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Material count + upload */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  {loadedIds.has(s.id) && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {mats.length} material{mats.length !== 1 ? 'es' : ''}
                    </span>
                  )}
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
                    accept="image/*,video/*,.mp4,.mov,.pdf,.ai,.psd,.eps,.png,.jpg,.jpeg"
                    multiple
                    style={{ display: 'none' }}
                    onChange={e => handleUpload(s.id, e.target.files)}
                  />
                </div>
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
                                📄
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

      {/* Fecha real modal */}
      {modalCampana && (
        <FechaRealModal
          campana={modalCampana}
          onClose={() => setModalCampana(null)}
          onSaved={handleFechaRealSaved}
        />
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ArteClient({ soportes, campanasMap, supabaseUrl, supabaseAnonKey }: Props) {
  const supabase = useMemo(() => createClient(supabaseUrl, supabaseAnonKey), [supabaseUrl, supabaseAnonKey])
  const storageUrl = `${supabaseUrl}/storage/v1/object/public/arte`

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      <PlanillaTab
        soportes={soportes}
        campanasMap={campanasMap}
        supabase={supabase}
        storageUrl={storageUrl}
      />
    </div>
  )
}
