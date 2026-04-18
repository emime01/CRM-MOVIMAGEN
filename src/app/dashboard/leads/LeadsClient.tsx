'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, X, Pencil, ShoppingCart, Gift, Check, XCircle } from 'lucide-react'

const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']

interface BirthdayContacto {
  id: string
  nombres: string | null
  apellidos: string | null
  cumple_dia: number
  cumple_mes: number
  cuentaNombre: string | null
  daysUntil: number
}

interface Regalo {
  id: string
  estado: string
  contacto_id: string
  contactos?: { nombres: string | null; apellidos: string | null; cumple_dia: number | null; cumple_mes: number | null; cuenta_id: string | null; tipo_cuenta: string | null } | null
  'perfiles!solicitado_por'?: { nombre: string } | null
}

function BirthdayPanel({ userRol }: { userRol: string }) {
  const [contactos, setContactos] = useState<BirthdayContacto[]>([])
  const [regalos, setRegalos] = useState<Regalo[]>([])
  const [regalosMap, setRegalosMap] = useState<Record<string, Regalo>>({})
  const [loadingGift, setLoadingGift] = useState<Record<string, boolean>>({})
  const isAsistente = userRol === 'asistente_ventas'

  useEffect(() => {
    fetch('/api/contactos?cumpleanos_proximos=30')
      .then(r => r.json())
      .then(data => setContactos(Array.isArray(data) ? data : []))
      .catch(() => {})

    fetch('/api/regalos')
      .then(r => r.json())
      .then(data => {
        const list: Regalo[] = Array.isArray(data) ? data : []
        setRegalos(list)
        const map: Record<string, Regalo> = {}
        list.forEach(r => { map[r.contacto_id] = r })
        setRegalosMap(map)
      })
      .catch(() => {})
  }, [])

  async function handleEnviarRegalo(contactoId: string) {
    setLoadingGift(prev => ({ ...prev, [contactoId]: true }))
    try {
      const res = await fetch('/api/regalos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactoId }),
      })
      if (res.ok) {
        const data = await res.json()
        setRegalosMap(prev => ({ ...prev, [contactoId]: data }))
      }
    } finally {
      setLoadingGift(prev => ({ ...prev, [contactoId]: false }))
    }
  }

  async function handleUpdateRegalo(regalId: string, contactoId: string, estado: string) {
    const res = await fetch(`/api/regalos/${regalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    })
    if (res.ok) {
      setRegalos(prev => prev.map(r => r.id === regalId ? { ...r, estado } : r))
      setRegalosMap(prev => {
        const updated = { ...prev }
        if (updated[contactoId]) updated[contactoId] = { ...updated[contactoId], estado }
        return updated
      })
    }
  }

  const pendingRegalos = regalos.filter(r => r.estado === 'pendiente')

  if (contactos.length === 0 && !isAsistente) return null

  const estadoBadge = (estado: string) => {
    const styles: Record<string, React.CSSProperties> = {
      pendiente: { background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' },
      entregado: { background: '#e6f7ef', color: '#166534', border: '1px solid #86efac' },
      no_entregado: { background: '#fef0f0', color: '#991b1b', border: '1px solid #fca5a5' },
    }
    const labels: Record<string, string> = { pendiente: 'Pendiente', entregado: 'Entregado', no_entregado: 'No enviado' }
    return (
      <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 10, ...styles[estado] }}>
        {labels[estado] ?? estado}
      </span>
    )
  }

  return (
    <>
      {/* Birthday strip */}
      {contactos.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
            Próximos cumpleaños
          </div>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8 }}>
            {contactos.map(c => {
              const regalo = regalosMap[c.id]
              const initials = [(c.nombres ?? '').trim()[0], (c.apellidos ?? '').trim()[0]].filter(Boolean).join('').toUpperCase() || '?'
              const dateStr = `${c.cumple_dia} de ${MESES_ES[c.cumple_mes - 1] ?? ''}`
              const isToday = c.daysUntil === 0
              const isSoon = c.daysUntil <= 7

              return (
                <div key={c.id} style={{
                  minWidth: 200,
                  background: 'var(--bg-card)',
                  border: `1px solid ${isToday ? '#eb691c' : 'var(--border)'}`,
                  borderRadius: 10,
                  padding: '12px 14px',
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: isToday ? '#eb691c' : isSoon ? '#fde68a' : 'var(--bg-app)',
                      color: isToday ? '#fff' : isSoon ? '#92400e' : 'var(--text-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 700, flexShrink: 0,
                    }}>
                      {initials}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {[c.nombres, c.apellidos].filter(Boolean).join(' ') || '—'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.cuentaNombre ?? '—'}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: isToday ? '#eb691c' : 'var(--text-secondary)', fontWeight: isToday ? 700 : 500 }}>
                    🎂 {dateStr}{isToday ? ' — ¡Hoy!' : isSoon ? ` — en ${c.daysUntil} día${c.daysUntil !== 1 ? 's' : ''}` : ` — en ${c.daysUntil} días`}
                  </div>
                  {regalo ? (
                    estadoBadge(regalo.estado)
                  ) : (
                    <button
                      onClick={() => handleEnviarRegalo(c.id)}
                      disabled={loadingGift[c.id]}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '5px 10px', border: 'none',
                        borderRadius: 6, background: '#eb691c', color: '#fff',
                        fontSize: 11, fontWeight: 600, cursor: loadingGift[c.id] ? 'wait' : 'pointer',
                        fontFamily: 'Montserrat, sans-serif', opacity: loadingGift[c.id] ? 0.6 : 1,
                        width: 'fit-content',
                      }}
                    >
                      <Gift size={11} />
                      {loadingGift[c.id] ? 'Enviando...' : 'Enviar regalo'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Regalos pendientes — asistente only */}
      {isAsistente && pendingRegalos.length > 0 && (
        <div style={{
          background: '#fffbeb',
          border: '1px solid #fde68a',
          borderRadius: 10,
          padding: '14px 16px',
          marginBottom: 20,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Gift size={13} />
            Regalos pendientes — {pendingRegalos.length}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingRegalos.map(r => {
              const c = r.contactos
              const nombre = c ? [c.nombres, c.apellidos].filter(Boolean).join(' ') : 'Contacto'
              const vendedor = (r as any)['perfiles!solicitado_por']?.nombre ?? '—'
              const fechaCumple = c?.cumple_dia && c?.cumple_mes
                ? `${c.cumple_dia} de ${MESES_ES[c.cumple_mes - 1] ?? ''}`
                : null

              return (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: '#fff', borderRadius: 8, padding: '10px 14px',
                  border: '1px solid #fde68a', flexWrap: 'wrap', gap: 10,
                }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1915' }}>{nombre}</div>
                    <div style={{ fontSize: 11, color: '#6b6862', marginTop: 2 }}>
                      Solicitado por {vendedor}{fechaCumple ? ` · Cumple ${fechaCumple}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => handleUpdateRegalo(r.id, r.contacto_id, 'entregado')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '6px 12px', border: 'none', borderRadius: 6,
                        background: '#15803d', color: '#fff', fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'Montserrat, sans-serif',
                      }}
                    >
                      <Check size={12} /> Entregado
                    </button>
                    <button
                      onClick={() => handleUpdateRegalo(r.id, r.contacto_id, 'no_entregado')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '6px 12px', border: '1px solid #fca5a5', borderRadius: 6,
                        background: '#fff', color: '#dc2626', fontSize: 12, fontWeight: 600,
                        cursor: 'pointer', fontFamily: 'Montserrat, sans-serif',
                      }}
                    >
                      <XCircle size={12} /> No enviado
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

// ─── Types ────────────────────────────────────────────────────────────────────

type JoinedRow<T> = T | T[] | null

export interface LeadRow {
  id: string
  cliente_id: string | null
  vendedor_id: string | null
  descripcion: string | null
  monto_potencial: number | null
  cuatrimestre: string | null
  estado: string
  notas: string | null
  created_at: string
  clientes: JoinedRow<{ nombre: string | null; empresa: string | null }>
  agencias: JoinedRow<{ nombre: string }>
  perfiles: JoinedRow<{ nombre: string }>
}

type EstadoLead =
  | 'nuevo'
  | 'en_conversacion'
  | 'propuesta_enviada'
  | 'negociacion'
  | 'ganado'
  | 'perdido'

interface ColumnDef {
  estado: EstadoLead
  label: string
  headerBg: string
  headerColor: string
  dotColor: string
}

interface Props {
  leads: LeadRow[]
  isGerente: boolean
  userId: string
  userRol: string
  clientes: { id: string; nombre: string; empresa: string | null }[]
  vendedores: { id: string; nombre: string }[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLUMNS: ColumnDef[] = [
  { estado: 'nuevo', label: 'Nuevo', headerBg: '#f4f3f0', headerColor: '#6e6a62', dotColor: '#9a9895' },
  { estado: 'en_conversacion', label: 'En conversación', headerBg: '#eff6ff', headerColor: '#1d4ed8', dotColor: '#3b82f6' },
  { estado: 'propuesta_enviada', label: 'Propuesta enviada', headerBg: '#fffbeb', headerColor: '#92400e', dotColor: '#f59e0b' },
  { estado: 'negociacion', label: 'Negociación', headerBg: '#fef3ec', headerColor: '#c45a10', dotColor: '#eb691c' },
  { estado: 'ganado', label: 'Ganado', headerBg: '#e6f7ef', headerColor: '#166534', dotColor: '#1a9a5e' },
  { estado: 'perdido', label: 'Perdido', headerBg: '#fef0f0', headerColor: '#991b1b', dotColor: '#d63b3b' },
]

const _y = new Date().getFullYear()
const QUARTER_OPTIONS = [
  { value: '', label: 'Todos los cuatrimestres' },
  { value: `Q1-${_y}`, label: `Q1-${_y}` },
  { value: `Q2-${_y}`, label: `Q2-${_y}` },
  { value: `Q3-${_y}`, label: `Q3-${_y}` },
]

const ESTADO_OPTIONS: { value: EstadoLead; label: string }[] = [
  { value: 'nuevo', label: 'Nuevo' },
  { value: 'en_conversacion', label: 'En conversación' },
  { value: 'propuesta_enviada', label: 'Propuesta enviada' },
  { value: 'negociacion', label: 'Negociación' },
  { value: 'ganado', label: 'Ganado' },
  { value: 'perdido', label: 'Perdido' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getJoined<T>(val: JoinedRow<T>): T | null {
  if (!val) return null
  if (Array.isArray(val)) return val[0] ?? null
  return val
}

function clientName(lead: LeadRow): string {
  const c = getJoined(lead.clientes)
  if (!c) return '—'
  return c.empresa || c.nombre || '—'
}

function vendorName(lead: LeadRow): string {
  const p = getJoined(lead.perfiles)
  return p?.nombre ?? '—'
}

function formatMonto(val: number | null): string {
  if (val == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val)
}

function truncate(str: string | null | undefined, max: number): string {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '…' : str
}

// ─── Modal Form ───────────────────────────────────────────────────────────────

interface ModalState {
  open: boolean
  lead: LeadRow | null
}

interface LeadFormValues {
  clienteId: string
  descripcion: string
  montoPotencial: string
  cuatrimestre: string
  estado: EstadoLead
  notas: string
  motivoPerdida: string
  vendedorId: string
}

function emptyForm(userId: string): LeadFormValues {
  return {
    clienteId: '',
    descripcion: '',
    montoPotencial: '',
    cuatrimestre: `Q1-${new Date().getFullYear()}`,
    estado: 'nuevo',
    notas: '',
    motivoPerdida: '',
    vendedorId: userId,
  }
}

function leadToForm(lead: LeadRow, userId: string): LeadFormValues {
  return {
    clienteId: lead.cliente_id ?? '',
    descripcion: lead.descripcion ?? '',
    montoPotencial: lead.monto_potencial != null ? String(lead.monto_potencial) : '',
    cuatrimestre: lead.cuatrimestre ?? `Q1-${new Date().getFullYear()}`,
    estado: (lead.estado as EstadoLead) ?? 'nuevo',
    notas: lead.notas ?? '',
    motivoPerdida: '',
    vendedorId: userId,
  }
}

function LeadModal({
  modal,
  onClose,
  onSaved,
  isGerente,
  userId,
  clientes,
  vendedores,
}: {
  modal: ModalState
  onClose: () => void
  onSaved: () => void
  isGerente: boolean
  userId: string
  clientes: Props['clientes']
  vendedores: Props['vendedores']
}) {
  const isEdit = modal.lead != null
  const [form, setForm] = useState<LeadFormValues>(() =>
    isEdit ? leadToForm(modal.lead!, userId) : emptyForm(userId)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof LeadFormValues>(key: K, val: LeadFormValues[K]) {
    setForm(prev => ({ ...prev, [key]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const body: Record<string, unknown> = {
      clienteId: form.clienteId || undefined,
      descripcion: form.descripcion || undefined,
      montoPotencial: form.montoPotencial !== '' ? Number(form.montoPotencial) : null,
      cuatrimestre: form.cuatrimestre || undefined,
      estado: form.estado,
      notas: form.notas || undefined,
      motivoPerdida: form.estado === 'perdido' ? form.motivoPerdida || undefined : undefined,
    }

    if (isGerente && form.vendedorId) {
      body.vendedorId = form.vendedorId
    }

    let res: Response
    if (isEdit) {
      res = await fetch(`/api/leads/${modal.lead!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } else {
      res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    }

    setSaving(false)

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Error al guardar')
      return
    }

    onSaved()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    border: '1px solid #e5e3dc',
    borderRadius: 8,
    fontSize: 13,
    fontFamily: 'Montserrat, sans-serif',
    color: '#1a1915',
    background: '#fff',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: '#4a4845',
    marginBottom: 5,
  }

  const fieldStyle: React.CSSProperties = { marginBottom: 16 }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: '#fff', borderRadius: 14,
          width: '100%', maxWidth: 500,
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 14px',
          borderBottom: '1px solid #e5e3dc',
        }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1a1915' }}>
            {isEdit ? 'Editar lead' : 'Nuevo lead'}
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9a9895' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '20px 20px 24px' }}>
          {/* Cliente */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Cliente</label>
            <select
              value={form.clienteId}
              onChange={e => set('clienteId', e.target.value)}
              style={inputStyle}
            >
              <option value="">— Sin cliente —</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.empresa ? `${c.empresa} (${c.nombre})` : c.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Descripción */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Descripción</label>
            <input
              type="text"
              value={form.descripcion}
              onChange={e => set('descripcion', e.target.value)}
              placeholder="Descripción del lead..."
              style={inputStyle}
            />
          </div>

          {/* Monto + Cuatrimestre row */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Monto potencial (USD)</label>
              <input
                type="number"
                value={form.montoPotencial}
                onChange={e => set('montoPotencial', e.target.value)}
                placeholder="0"
                min={0}
                style={inputStyle}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Cuatrimestre</label>
              <select
                value={form.cuatrimestre}
                onChange={e => set('cuatrimestre', e.target.value)}
                style={inputStyle}
              >
                {QUARTER_OPTIONS.filter(o => o.value).map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Estado */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Etapa</label>
            <select
              value={form.estado}
              onChange={e => set('estado', e.target.value as EstadoLead)}
              style={inputStyle}
            >
              {ESTADO_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Motivo pérdida — solo si perdido */}
          {form.estado === 'perdido' && (
            <div style={fieldStyle}>
              <label style={labelStyle}>Motivo de pérdida</label>
              <input
                type="text"
                value={form.motivoPerdida}
                onChange={e => set('motivoPerdida', e.target.value)}
                placeholder="¿Por qué se perdió este lead?"
                style={inputStyle}
              />
            </div>
          )}

          {/* Vendedor — solo gerente */}
          {isGerente && (
            <div style={fieldStyle}>
              <label style={labelStyle}>Vendedor asignado</label>
              <select
                value={form.vendedorId}
                onChange={e => set('vendedorId', e.target.value)}
                style={inputStyle}
              >
                <option value="">— Sin asignar —</option>
                {vendedores.map(v => (
                  <option key={v.id} value={v.id}>{v.nombre}</option>
                ))}
              </select>
            </div>
          )}

          {/* Notas */}
          <div style={fieldStyle}>
            <label style={labelStyle}>Notas</label>
            <textarea
              value={form.notas}
              onChange={e => set('notas', e.target.value)}
              placeholder="Observaciones adicionales..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

          {error && (
            <div style={{
              marginBottom: 14, padding: '8px 12px',
              background: '#fef0f0', border: '1px solid #fca5a5',
              borderRadius: 8, fontSize: 12, color: '#dc2626',
            }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '9px 18px', border: '1px solid #e5e3dc',
                borderRadius: 8, background: '#fff', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif',
                color: '#4a4845',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                padding: '9px 20px', border: 'none',
                borderRadius: 8, background: saving ? '#c45a10' : '#eb691c',
                cursor: saving ? 'wait' : 'pointer',
                fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif',
                color: '#fff', opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Lead Card ────────────────────────────────────────────────────────────────

function LeadCard({
  lead,
  isGerente,
  onClick,
}: {
  lead: LeadRow
  isGerente: boolean
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#ffffff',
        border: '1px solid',
        borderColor: hovered ? '#c5c2bb' : '#e5e3dc',
        borderRadius: 10,
        padding: '12px 14px',
        cursor: 'pointer',
        transition: 'border-color 150ms ease, box-shadow 150ms ease',
        boxShadow: hovered ? '0 2px 8px rgba(0,0,0,0.07)' : '0 1px 3px rgba(0,0,0,0.04)',
        position: 'relative',
      }}
    >
      {/* Edit badge on hover */}
      {hovered && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          background: '#eb691c', borderRadius: 5,
          width: 22, height: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Pencil size={11} color="#fff" />
        </div>
      )}

      {/* Company name */}
      <div style={{
        fontSize: 13, fontWeight: 700, color: '#1a1915',
        marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        paddingRight: hovered ? 28 : 0,
      }}>
        {clientName(lead)}
      </div>

      {/* Description */}
      {lead.descripcion && (
        <div style={{ fontSize: 12, color: '#4a4845', lineHeight: 1.45, marginBottom: 8 }}>
          {truncate(lead.descripcion, 60)}
        </div>
      )}

      {/* Monto + quarter row */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 6, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#eb691c' }}>
          {formatMonto(lead.monto_potencial)}
        </span>
        {lead.cuatrimestre && (
          <span style={{
            fontSize: 10, fontWeight: 600, color: '#4a4845',
            background: '#f4f3f0', borderRadius: 4, padding: '2px 6px', letterSpacing: '0.3px',
          }}>
            {lead.cuatrimestre}
          </span>
        )}
      </div>

      {/* Gerente: vendor name */}
      {isGerente && (
        <div style={{
          marginTop: 8, fontSize: 11, color: '#9a9895',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <svg width="10" height="10" viewBox="0 0 20 20" fill="none">
            <path d="M10 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-7 2-7 4v1h14v-1c0-2-3-4-7-4Z" fill="currentColor" />
          </svg>
          {vendorName(lead)}
        </div>
      )}

      {/* Crear venta button */}
      {(lead.estado === 'ganado' || lead.estado === 'negociacion' || lead.estado === 'propuesta_enviada') && (
        <Link
          href={`/dashboard/ventas/nueva?lead=${lead.id}`}
          onClick={e => e.stopPropagation()}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            marginTop: 10, padding: '6px 10px',
            background: '#eb691c', color: '#fff',
            borderRadius: 6, fontSize: 11, fontWeight: 600,
            textDecoration: 'none', transition: 'background 150ms',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#c45a10')}
          onMouseLeave={e => (e.currentTarget.style.background = '#eb691c')}
        >
          <ShoppingCart size={11} />
          Crear venta
        </Link>
      )}
    </div>
  )
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

function KanbanColumn({
  col,
  leads,
  isGerente,
  onCardClick,
}: {
  col: ColumnDef
  leads: LeadRow[]
  isGerente: boolean
  onCardClick: (lead: LeadRow) => void
}) {
  return (
    <div style={{ minWidth: 260, width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* Column header */}
      <div style={{
        background: col.headerBg, borderRadius: '10px 10px 0 0',
        padding: '10px 14px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', border: '1px solid #e5e3dc', borderBottom: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: col.dotColor, display: 'inline-block', flexShrink: 0,
          }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: col.headerColor, letterSpacing: '0.1px' }}>
            {col.label}
          </span>
        </div>
        <span style={{
          fontSize: 11, fontWeight: 700, color: col.headerColor,
          background: col.headerBg, border: `1px solid ${col.dotColor}33`,
          borderRadius: 10, padding: '1px 8px', minWidth: 22, textAlign: 'center',
        }}>
          {leads.length}
        </span>
      </div>

      {/* Cards list */}
      <div style={{
        background: '#f9f8f5', border: '1px solid #e5e3dc',
        borderTop: 'none', borderRadius: '0 0 10px 10px',
        padding: 10, display: 'flex', flexDirection: 'column',
        gap: 8, minHeight: 120,
      }}>
        {leads.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#c5c2bb', fontSize: 12, padding: '20px 0' }}>
            Sin leads
          </div>
        ) : (
          leads.map(lead => (
            <LeadCard
              key={lead.id}
              lead={lead}
              isGerente={isGerente}
              onClick={() => onCardClick(lead)}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LeadsClient({ leads, isGerente, userId, userRol, clientes, vendedores }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [cuatrimestre, setCuatrimestre] = useState('')
  const [vendedorFilter, setVendedorFilter] = useState('')
  const [modal, setModal] = useState<ModalState>({ open: false, lead: null })

  function openCreate() {
    setModal({ open: true, lead: null })
  }

  function openEdit(lead: LeadRow) {
    setModal({ open: true, lead })
  }

  function closeModal() {
    setModal({ open: false, lead: null })
  }

  function handleSaved() {
    closeModal()
    startTransition(() => { router.refresh() })
  }

  const filtered = useMemo(() => {
    let result = leads
    if (cuatrimestre) result = result.filter(l => l.cuatrimestre === cuatrimestre)
    if (vendedorFilter) result = result.filter(l => l.vendedor_id === vendedorFilter)
    return result
  }, [leads, cuatrimestre, vendedorFilter])

  const totalFiltered = filtered.length
  const noLeads = leads.length === 0
  const noMatch = !noLeads && totalFiltered === 0

  const byColumn = useMemo(() => {
    const map: Record<EstadoLead, LeadRow[]> = {
      nuevo: [], en_conversacion: [], propuesta_enviada: [],
      negociacion: [], ganado: [], perdido: [],
    }
    for (const lead of filtered) {
      const key = lead.estado as EstadoLead
      if (map[key]) map[key].push(lead)
    }
    return map
  }, [filtered])

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif', minHeight: '100%' }}>

      <BirthdayPanel userRol={userRol} />

      {/* Modal */}
      {modal.open && (
        <LeadModal
          modal={modal}
          onClose={closeModal}
          onSaved={handleSaved}
          isGerente={isGerente}
          userId={userId}
          clientes={clientes}
          vendedores={vendedores}
        />
      )}

      {/* Page header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 20, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1a1915', margin: 0, letterSpacing: '-0.3px' }}>
            Leads
          </h1>
          <p style={{ color: '#9a9895', fontSize: 13, marginTop: 3 }}>
            {totalFiltered} lead{totalFiltered !== 1 ? 's' : ''} en el pipeline
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Quarter filter */}
          <select
            value={cuatrimestre}
            onChange={e => setCuatrimestre(e.target.value)}
            style={{
              padding: '8px 12px', border: '1px solid #e5e3dc', borderRadius: 8,
              fontSize: 13, fontFamily: 'Montserrat, sans-serif', color: '#1a1915',
              background: '#ffffff', cursor: 'pointer', outline: 'none',
              appearance: 'none', paddingRight: 28,
              backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239a9895' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
            }}
          >
            {QUARTER_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Vendedor filter (gerente only) */}
          {isGerente && (
            <select
              value={vendedorFilter}
              onChange={e => setVendedorFilter(e.target.value)}
              style={{
                padding: '8px 12px', border: '1px solid #e5e3dc', borderRadius: 8,
                fontSize: 13, fontFamily: 'Montserrat, sans-serif', color: '#1a1915',
                background: '#ffffff', cursor: 'pointer', outline: 'none',
                appearance: 'none', paddingRight: 28,
                backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239a9895' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center',
              }}
            >
              <option value="">Todos los vendedores</option>
              {vendedores.map(v => (
                <option key={v.id} value={v.id}>{v.nombre}</option>
              ))}
            </select>
          )}

          {/* New lead button */}
          <button
            onClick={openCreate}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', background: '#eb691c', color: '#ffffff',
              border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
              fontFamily: 'Montserrat, sans-serif', cursor: 'pointer',
              transition: 'background 150ms ease', whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#c45a10')}
            onMouseLeave={e => (e.currentTarget.style.background = '#eb691c')}
          >
            <Plus size={15} />
            Nuevo lead
          </button>
        </div>
      </div>

      {/* Empty state: no leads at all */}
      {noLeads && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '80px 24px', color: '#9a9895', textAlign: 'center',
        }}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" style={{ marginBottom: 16, opacity: 0.4 }}>
            <rect x="8" y="8" width="32" height="32" rx="8" stroke="#9a9895" strokeWidth="2" fill="none" />
            <path d="M16 24h16M16 30h10" stroke="#9a9895" strokeWidth="2" strokeLinecap="round" />
            <circle cx="32" cy="18" r="6" fill="#eb691c" opacity="0.6" />
            <path d="M30 18h4M32 16v4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#4a4845', marginBottom: 6 }}>
            No hay leads todavía
          </p>
          <p style={{ fontSize: 13, maxWidth: 280, lineHeight: 1.5 }}>
            Hacé clic en <strong>Nuevo lead</strong> para agregar el primer prospecto al pipeline.
          </p>
        </div>
      )}

      {/* Empty state: filter yields no results */}
      {noMatch && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', padding: '64px 24px', color: '#9a9895', textAlign: 'center',
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" style={{ marginBottom: 12, opacity: 0.45 }}>
            <circle cx="11" cy="11" r="7" stroke="#9a9895" strokeWidth="1.5" />
            <path d="M16.5 16.5L21 21" stroke="#9a9895" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#4a4845', marginBottom: 4 }}>
            Sin resultados para {cuatrimestre}
          </p>
          <p style={{ fontSize: 13 }}>
            Seleccioná otro cuatrimestre o{' '}
            <span
              style={{ color: '#eb691c', cursor: 'pointer', fontWeight: 600 }}
              onClick={() => setCuatrimestre('')}
            >
              ver todos
            </span>.
          </p>
        </div>
      )}

      {/* Kanban board */}
      {!noLeads && !noMatch && (
        <div style={{ overflowX: 'auto', overflowY: 'visible', paddingBottom: 24 }}>
          <div style={{ display: 'flex', gap: 14, minWidth: 'max-content', alignItems: 'flex-start' }}>
            {COLUMNS.map(col => (
              <KanbanColumn
                key={col.estado}
                col={col}
                leads={byColumn[col.estado]}
                isGerente={isGerente}
                onCardClick={openEdit}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
