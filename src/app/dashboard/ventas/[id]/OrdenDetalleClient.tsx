'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Check, X, Upload, FileText, ChevronDown, ChevronRight } from 'lucide-react'

type JoinedNombre = { id?: string; nombre: string; empresa?: string | null } | { id?: string; nombre: string; empresa?: string | null }[] | null

interface OrdenItem {
  id: string
  cantidad: number
  semanas: number
  salidas: number | null
  segundos: number | null
  precio_unitario: number
  descuento_pct: number
  nota: string | null
  requiere_grabado: boolean
  requiere_produccion: boolean
  soportes: { id: string; nombre: string; tipo: string | null; categoria: string | null; ubicacion: string | null } | { id: string; nombre: string; tipo: string | null; categoria: string | null; ubicacion: string | null }[] | null
}

function soporteInfo(val: OrdenItem['soportes']): { nombre: string; ubicacion: string | null } {
  if (!val) return { nombre: '—', ubicacion: null }
  if (Array.isArray(val)) {
    const s = val[0]
    return { nombre: s?.nombre ?? '—', ubicacion: s?.ubicacion ?? null }
  }
  return { nombre: val.nombre, ubicacion: val.ubicacion }
}

interface HistorialItem {
  id: string
  estado_nuevo: string
  comentario: string | null
  created_at: string
  perfiles: { nombre: string } | { nombre: string }[] | null
}

interface DocumentoItem {
  id: string
  nombre: string
  url: string
  tipo: string | null
  created_at: string
}

interface Orden {
  id: string
  numero: number | null
  estado: string
  moneda: string | null
  monto_total: number | null
  created_at: string
  contacto: string | null
  facturar_a: string | null
  marca: string | null
  referencia: string | null
  validez: string | null
  fecha_alta_prevista: string | null
  fecha_baja_prevista: string | null
  fecha_alta_real: string | null
  fecha_baja_real: string | null
  es_canje: boolean | null
  incluir_reportes: boolean | null
  es_mensualizada: boolean | null
  tiene_produccion: boolean | null
  tiene_digital: boolean | null
  forma_pago_arrend: string | null
  comentario_arrend: string | null
  forma_pago_prod: string | null
  comentario_prod: string | null
  detalles_texto: string | null
  adjunto_url: string | null
  motivo_rechazo: string | null
  aprobado_at: string | null
  lead_id: string | null
  cliente_id: string | null
  clientes: JoinedNombre
  agencias: JoinedNombre
  perfiles: JoinedNombre
  orden_items: OrdenItem[]
  orden_historial: HistorialItem[]
  orden_documentos: DocumentoItem[]
}

interface LeadRow {
  id: string
  descripcion: string | null
  monto_potencial: number | null
  cuatrimestre: string | null
  estado: string
  notas: string | null
  created_at: string
  updated_at: string | null
  perfiles: { nombre: string } | { nombre: string }[] | null
}

interface Props {
  orden: Orden
  leads: LeadRow[]
  userRol: string
  userId: string
}

const ESTADO_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  borrador:             { bg: '#f1f1ef', color: '#6e6a62', label: 'Borrador' },
  pendiente_aprobacion: { bg: '#fff7e5', color: '#b87900', label: 'Pend. aprobación' },
  aprobada:             { bg: '#e8f5ec', color: '#2f7d3f', label: 'Aprobada' },
  rechazada:            { bg: '#fdecec', color: '#c82f2f', label: 'Rechazada' },
  en_oic:               { bg: '#fff0e3', color: '#d1620e', label: 'En OIC' },
  facturada:            { bg: '#e8f5ec', color: '#2f7d3f', label: 'Facturada' },
  cobrada:              { bg: '#e8f5ec', color: '#2f7d3f', label: 'Cobrada' },
}

const LEAD_ESTADO_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  nuevo:              { bg: '#eef3fd', color: '#2952b5', label: 'Nuevo' },
  en_conversacion:    { bg: '#fff7e5', color: '#b87900', label: 'En conversación' },
  propuesta_enviada:  { bg: '#f3ecfa', color: '#6a2fb5', label: 'Propuesta enviada' },
  negociacion:        { bg: '#fff0e3', color: '#d1620e', label: 'Negociación' },
  ganado:             { bg: '#e8f5ec', color: '#2f7d3f', label: 'Ganado' },
  perdido:            { bg: '#fdecec', color: '#c82f2f', label: 'Perdido' },
}

function joinedNombre(val: JoinedNombre): string {
  if (!val) return '—'
  if (Array.isArray(val)) return val[0]?.nombre ?? '—'
  return val.nombre ?? '—'
}

function joinedEmpresa(val: JoinedNombre): string | null {
  if (!val) return null
  if (Array.isArray(val)) return val[0]?.empresa ?? null
  return val.empresa ?? null
}

function formatMoney(amount: number | null, currency: string = 'USD') {
  if (amount == null) return '—'
  return new Intl.NumberFormat('es-UY', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateTime(dateStr: string) {
  return new Date(dateStr).toLocaleString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const sectionStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 20,
  marginBottom: 16,
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--text-primary)',
  marginBottom: 14,
  paddingBottom: 10,
  borderBottom: '1px solid var(--border)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
}

const fieldLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  marginBottom: 4,
}

const fieldValue: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text-primary)',
  fontWeight: 500,
}

export default function OrdenDetalleClient({ orden, leads, userRol, userId }: Props) {
  const router = useRouter()
  const [expandedLead, setExpandedLead] = useState<string | null>(null)
  const [expandedHistorial, setExpandedHistorial] = useState(true)
  const [docFile, setDocFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [documentos, setDocumentos] = useState(orden.orden_documentos ?? [])
  const [showReject, setShowReject] = useState(false)
  const [motivoRechazo, setMotivoRechazo] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const canApprove = (userRol === 'gerente_comercial' || userRol === 'administracion') && orden.estado === 'pendiente_aprobacion'
  const canUploadDoc = true
  const canSendToApproval = orden.estado === 'borrador' && (userRol === 'vendedor' || userRol === 'gerente_comercial' || userRol === 'administracion') && (Array.isArray(orden.perfiles) ? orden.perfiles[0]?.id === userId : orden.perfiles?.id === userId || userRol === 'gerente_comercial' || userRol === 'administracion')

  const badge = ESTADO_BADGE[orden.estado] ?? { bg: '#f1f1ef', color: '#6e6a62', label: orden.estado }
  const numero = orden.numero ? `#${String(orden.numero).padStart(5, '0')}` : `#${orden.id.slice(0, 6)}`

  async function handleChangeEstado(nuevoEstado: string, comentario?: string, extra: Record<string, unknown> = {}) {
    setActionLoading(true)
    try {
      await fetch(`/api/ordenes/${orden.id}/estado`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado, comentario }),
      })
      if (Object.keys(extra).length > 0) {
        await fetch(`/api/ordenes/${orden.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(extra),
        })
      }
      router.refresh()
    } finally {
      setActionLoading(false)
    }
  }

  async function handleAprobar() {
    await handleChangeEstado('aprobada', 'Aprobada por gerente', { aprobado_por: userId, aprobado_at: new Date().toISOString() })
  }

  async function handleRechazar() {
    if (!motivoRechazo.trim()) return
    await handleChangeEstado('rechazada', motivoRechazo, { motivo_rechazo: motivoRechazo })
    setShowReject(false)
    setMotivoRechazo('')
  }

  async function handleEnviarAprobacion() {
    await handleChangeEstado('pendiente_aprobacion', 'Enviada para aprobación')
  }

  async function handleUploadDoc() {
    if (!docFile) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', docFile)
      const upRes = await fetch('/api/upload', { method: 'POST', body: fd })
      if (!upRes.ok) return
      const { url } = await upRes.json()

      const res = await fetch(`/api/ordenes/${orden.id}/documentos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: docFile.name, url, tipo: docFile.type.includes('pdf') ? 'pdf' : 'otro' }),
      })
      if (res.ok) {
        const doc = await res.json()
        setDocumentos(prev => [...prev, doc])
        setDocFile(null)
      }
    } finally {
      setUploading(false)
    }
  }

  async function handleDeleteDoc(docId: string) {
    const res = await fetch(`/api/ordenes/${orden.id}/documentos?docId=${docId}`, { method: 'DELETE' })
    if (res.ok) setDocumentos(prev => prev.filter(d => d.id !== docId))
  }

  function itemTotal(item: OrdenItem): number {
    const bruto = item.precio_unitario * item.cantidad * item.semanas
    return bruto * (1 - (item.descuento_pct ?? 0) / 100)
  }

  const subtotal = orden.orden_items.reduce((sum, item) => sum + itemTotal(item), 0)
  const iva = subtotal * 0.22
  const totalCalc = subtotal + iva

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Link href="/dashboard/ventas" style={{ color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, textDecoration: 'none' }}>
            <ChevronLeft size={18} /> Ventas
          </Link>
          <div style={{ height: 22, width: 1, background: 'var(--border)' }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            Orden {numero}
          </h1>
          <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: badge.bg, color: badge.color }}>
            {badge.label}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canSendToApproval && (
            <button
              onClick={handleEnviarAprobacion}
              disabled={actionLoading}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--orange)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              Enviar para aprobación
            </button>
          )}
          {canApprove && (
            <>
              <button
                onClick={() => setShowReject(true)}
                disabled={actionLoading}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1px solid #c82f2f', background: '#fff', color: '#c82f2f', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                <X size={15} /> Rechazar
              </button>
              <button
                onClick={handleAprobar}
                disabled={actionLoading}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: '#2f7d3f', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                <Check size={15} /> Aprobar venta
              </button>
            </>
          )}
        </div>
      </div>

      {/* Reject modal */}
      {showReject && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowReject(false)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 420 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>Rechazar orden</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 14px' }}>Indicá el motivo del rechazo para que el vendedor pueda hacer las correcciones.</p>
            <textarea
              value={motivoRechazo}
              onChange={e => setMotivoRechazo(e.target.value)}
              rows={4}
              placeholder="Motivo del rechazo..."
              style={{ width: '100%', padding: 10, border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'Montserrat, sans-serif', resize: 'vertical', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button onClick={() => setShowReject(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleRechazar} disabled={!motivoRechazo.trim() || actionLoading} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#c82f2f', color: '#fff', fontSize: 13, fontWeight: 600, cursor: motivoRechazo.trim() ? 'pointer' : 'not-allowed', opacity: motivoRechazo.trim() ? 1 : 0.5 }}>Rechazar</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div>
          {/* Datos principales */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Datos de la orden</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={fieldLabel}>Cliente</div>
                <div style={fieldValue}>{joinedNombre(orden.clientes)}</div>
                {joinedEmpresa(orden.clientes) && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{joinedEmpresa(orden.clientes)}</div>}
              </div>
              <div>
                <div style={fieldLabel}>Agencia</div>
                <div style={fieldValue}>{joinedNombre(orden.agencias)}</div>
              </div>
              <div>
                <div style={fieldLabel}>Vendedor</div>
                <div style={fieldValue}>{joinedNombre(orden.perfiles)}</div>
              </div>
              <div>
                <div style={fieldLabel}>Contacto</div>
                <div style={fieldValue}>{orden.contacto ?? '—'}</div>
              </div>
              <div>
                <div style={fieldLabel}>Marca</div>
                <div style={fieldValue}>{orden.marca ?? '—'}</div>
              </div>
              <div>
                <div style={fieldLabel}>Referencia</div>
                <div style={fieldValue}>{orden.referencia ?? '—'}</div>
              </div>
              <div>
                <div style={fieldLabel}>Facturar a</div>
                <div style={fieldValue}>{orden.facturar_a === 'agencia' ? 'Agencia' : 'Cliente final'}</div>
              </div>
              <div>
                <div style={fieldLabel}>Moneda</div>
                <div style={fieldValue}>{orden.moneda ?? 'USD'}</div>
              </div>
              <div>
                <div style={fieldLabel}>Fecha alta {orden.fecha_alta_real ? 'real' : 'prevista'}</div>
                <div style={fieldValue}>
                  {formatDate(orden.fecha_alta_real ?? orden.fecha_alta_prevista)}
                  {orden.fecha_alta_real && orden.fecha_alta_real !== orden.fecha_alta_prevista && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                      (prevista: {formatDate(orden.fecha_alta_prevista)})
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div style={fieldLabel}>Fecha baja {orden.fecha_baja_real ? 'real' : 'prevista'}</div>
                <div style={fieldValue}>
                  {formatDate(orden.fecha_baja_real ?? orden.fecha_baja_prevista)}
                  {orden.fecha_baja_real && orden.fecha_baja_real !== orden.fecha_baja_prevista && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                      (prevista: {formatDate(orden.fecha_baja_prevista)})
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div style={fieldLabel}>Validez</div>
                <div style={fieldValue}>{formatDate(orden.validez)}</div>
              </div>
              <div>
                <div style={fieldLabel}>Fecha creación</div>
                <div style={fieldValue}>{formatDate(orden.created_at)}</div>
              </div>
            </div>
          </div>

          {/* Productos */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Productos ({orden.orden_items.length})</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f7f6f3' }}>
                    {['Soporte', 'Cant.', 'Semanas', 'P.Unit.', 'Desc.', 'Total', 'Nota'].map(h => (
                      <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orden.orden_items.map((item, i) => {
                    const sInfo = soporteInfo(item.soportes)
                    return (
                    <tr key={item.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '10px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {sInfo.nombre}
                        {sInfo.ubicacion && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>{sInfo.ubicacion}</div>}
                      </td>
                      <td style={{ padding: '10px' }}>{item.cantidad}</td>
                      <td style={{ padding: '10px' }}>{item.semanas}</td>
                      <td style={{ padding: '10px' }}>{formatMoney(item.precio_unitario, orden.moneda ?? 'USD')}</td>
                      <td style={{ padding: '10px' }}>{item.descuento_pct}%</td>
                      <td style={{ padding: '10px', fontWeight: 600 }}>{formatMoney(itemTotal(item), orden.moneda ?? 'USD')}</td>
                      <td style={{ padding: '10px', fontSize: 12, color: 'var(--text-muted)' }}>{item.nota ?? '—'}</td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <div style={{ width: 260, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: 'var(--text-secondary)' }}><span>Subtotal</span><span>{formatMoney(subtotal, orden.moneda ?? 'USD')}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: 'var(--text-muted)' }}><span>IVA (22%)</span><span>{formatMoney(iva, orden.moneda ?? 'USD')}</span></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 0', marginTop: 4, borderTop: '2px solid var(--border)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                  <span>Total</span>
                  <span style={{ color: 'var(--orange)' }}>{formatMoney(totalCalc, orden.moneda ?? 'USD')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Detalles texto libre */}
          {orden.detalles_texto && (
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>Descripción / Notas</div>
              <div style={{ fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {orden.detalles_texto}
              </div>
            </div>
          )}

          {/* Condiciones de pago */}
          {(orden.forma_pago_arrend || orden.forma_pago_prod) && (
            <div style={sectionStyle}>
              <div style={sectionTitleStyle}>Condiciones de pago</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                  <div style={fieldLabel}>Arrendamiento</div>
                  <div style={fieldValue}>{orden.forma_pago_arrend ?? '—'}</div>
                  {orden.comentario_arrend && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{orden.comentario_arrend}</div>}
                </div>
                <div>
                  <div style={fieldLabel}>Producción</div>
                  <div style={fieldValue}>{orden.forma_pago_prod ?? '—'}</div>
                  {orden.comentario_prod && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{orden.comentario_prod}</div>}
                </div>
              </div>
            </div>
          )}

          {/* Motivo de rechazo */}
          {orden.motivo_rechazo && (
            <div style={{ ...sectionStyle, borderColor: '#c82f2f', background: '#fdecec' }}>
              <div style={{ ...sectionTitleStyle, color: '#c82f2f', borderBottomColor: '#f5c2c2' }}>Motivo de rechazo</div>
              <div style={{ fontSize: 13, color: '#8a1f1f', whiteSpace: 'pre-wrap' }}>{orden.motivo_rechazo}</div>
            </div>
          )}

          {/* Documentos */}
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Documentos adjuntos</div>
            {orden.adjunto_url && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#f7f6f3', borderRadius: 8, marginBottom: 10 }}>
                <FileText size={16} color="#eb691c" />
                <a href={orden.adjunto_url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>
                  Adjunto principal
                </a>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(del formulario)</span>
              </div>
            )}
            {documentos.length === 0 && !orden.adjunto_url && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '14px 0' }}>
                No hay documentos. Subí PDFs, imágenes o documentos de la orden.
              </div>
            )}
            {documentos.map(doc => (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#f7f6f3', borderRadius: 8, marginBottom: 8 }}>
                <FileText size={16} color="#eb691c" />
                <a href={doc.url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', textDecoration: 'none', fontWeight: 500 }}>
                  {doc.nombre}
                </a>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(doc.created_at)}</span>
                <button onClick={() => handleDeleteDoc(doc.id)} style={{ padding: 4, border: 'none', background: 'transparent', cursor: 'pointer', color: '#c82f2f' }}>
                  <X size={14} />
                </button>
              </div>
            ))}
            {canUploadDoc && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, padding: 12, border: '1px dashed var(--border)', borderRadius: 8 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 6, background: '#fff', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12 }}>
                  <input type="file" style={{ display: 'none' }} onChange={e => setDocFile(e.target.files?.[0] ?? null)} />
                  <Upload size={13} /> Seleccionar
                </label>
                <span style={{ flex: 1, fontSize: 12, color: 'var(--text-muted)' }}>{docFile ? docFile.name : 'Ningún archivo seleccionado'}</span>
                {docFile && (
                  <button onClick={handleUploadDoc} disabled={uploading} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', background: 'var(--orange)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {uploading ? 'Subiendo...' : 'Subir'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Historial */}
          <div style={sectionStyle}>
            <div
              style={{ ...sectionTitleStyle, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              onClick={() => setExpandedHistorial(v => !v)}
            >
              <span>Historial de la orden ({orden.orden_historial.length})</span>
              {expandedHistorial ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </div>
            {expandedHistorial && (
              <div style={{ position: 'relative', paddingLeft: 20 }}>
                <div style={{ position: 'absolute', left: 6, top: 4, bottom: 4, width: 2, background: 'var(--border)' }} />
                {orden.orden_historial.map(h => {
                  const b = ESTADO_BADGE[h.estado_nuevo] ?? { bg: '#f1f1ef', color: '#6e6a62', label: h.estado_nuevo }
                  return (
                    <div key={h.id} style={{ position: 'relative', paddingBottom: 12 }}>
                      <div style={{ position: 'absolute', left: -18, top: 6, width: 10, height: 10, borderRadius: '50%', background: b.color }} />
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 14, fontSize: 10, fontWeight: 600, background: b.bg, color: b.color, marginRight: 6 }}>{b.label}</span>
                        {joinedNombre(h.perfiles)}
                      </div>
                      {h.comentario && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{h.comentario}</div>}
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{formatDateTime(h.created_at)}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Lead history */}
        <div>
          <div style={sectionStyle}>
            <div style={sectionTitleStyle}>Historial de leads ({leads.length})</div>
            {leads.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', padding: '14px 0' }}>
                Sin leads para este cliente
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {leads.map(lead => {
                  const lb = LEAD_ESTADO_BADGE[lead.estado] ?? { bg: '#f1f1ef', color: '#6e6a62', label: lead.estado }
                  const isOpen = expandedLead === lead.id
                  return (
                    <div key={lead.id} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: '#fff' }}>
                      <div
                        onClick={() => setExpandedLead(isOpen ? null : lead.id)}
                        style={{ padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                      >
                        <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 14, fontSize: 10, fontWeight: 600, background: lb.bg, color: lb.color, flexShrink: 0 }}>
                          {lb.label}
                        </span>
                        <div style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {lead.descripcion ?? '—'}
                        </div>
                        {isOpen ? <ChevronDown size={14} color="#9a9895" /> : <ChevronRight size={14} color="#9a9895" />}
                      </div>
                      {isOpen && (
                        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', background: '#faf9f6', fontSize: 12 }}>
                          <div style={{ marginBottom: 6 }}>
                            <div style={fieldLabel}>Monto potencial</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--orange)' }}>{formatMoney(lead.monto_potencial, 'USD')}</div>
                          </div>
                          <div style={{ marginBottom: 6 }}>
                            <div style={fieldLabel}>Cuatrimestre</div>
                            <div style={fieldValue}>{lead.cuatrimestre ?? '—'}</div>
                          </div>
                          <div style={{ marginBottom: 6 }}>
                            <div style={fieldLabel}>Vendedor</div>
                            <div style={fieldValue}>{joinedNombre(lead.perfiles)}</div>
                          </div>
                          {lead.notas && (
                            <div style={{ marginBottom: 6 }}>
                              <div style={fieldLabel}>Notas</div>
                              <div style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{lead.notas}</div>
                            </div>
                          )}
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                            Creado: {formatDate(lead.created_at)}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
