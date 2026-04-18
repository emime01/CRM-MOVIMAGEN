'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X, Plus, Check, XCircle, Clock } from 'lucide-react'
import type { SoporteConEstado } from '@/app/api/disponibilidad/route'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReservaRow {
  id: string
  lead_id: string | null
  fecha_desde: string
  fecha_hasta: string
  estado: string
  notas: string | null
  created_at: string
  clientes: { nombre: string; empresa: string | null } | { nombre: string; empresa: string | null }[] | null
  vendedor: { nombre: string } | { nombre: string }[] | null
  leads: { descripcion: string } | { descripcion: string }[] | null
  reserva_items: {
    id: string
    cantidad: number
    soportes: { id: string; nombre: string; tipo: string; seccion: string } | null
  }[]
}

interface Props {
  initialSoportes: SoporteConEstado[]
  initialFecha: string
  clientes: { id: string; nombre: string; empresa: string | null }[]
  userRol: string
  userId: string
}

interface PeriodRow {
  soporte: SoporteConEstado
  estadoPeriodo: 'libre' | 'parcial' | 'ocupado' | 'reservado'
  detalle: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIPO_ICONS: Record<string, string> = {
  bus: '🚌',
  buses: '🚌',
  led: '💡',
  leds: '💡',
  estatico: '📋',
  estaticos: '📋',
  digital: '🖥️',
  digitales: '🖥️',
  pantalla: '🖥️',
  pantallas: '🖥️',
  via_publica: '🏙️',
  vía_pública: '🏙️',
}

function getTipoIcon(tipo: string | null | undefined): string {
  if (!tipo) return '📦'
  return TIPO_ICONS[tipo.toLowerCase().replace(/\s+/g, '_')] ?? '📦'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function estadoBadge(estado: SoporteConEstado['estado']) {
  const cfg = {
    libre:     { bg: 'rgba(21,128,61,0.1)',   color: '#15803d', label: 'LIBRE' },
    reservado: { bg: 'rgba(217,119,6,0.12)',  color: '#b45309', label: 'RESERVADO' },
    ocupado:   { bg: 'rgba(235,105,28,0.14)', color: '#c45a10', label: 'OCUPADO' },
  }[estado]
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.5px',
      padding: '3px 8px', borderRadius: 5,
      background: cfg.bg, color: cfg.color,
    }}>
      {cfg.label}
    </span>
  )
}

function reservaEstadoBadge(estado: string) {
  const cfgMap: Record<string, { bg: string; color: string; label: string }> = {
    pendiente:  { bg: 'rgba(217,119,6,0.12)',  color: '#b45309', label: 'PENDIENTE' },
    aprobada:   { bg: 'rgba(21,128,61,0.1)',   color: '#15803d', label: 'APROBADA' },
    rechazada:  { bg: 'rgba(220,38,38,0.1)',   color: '#dc2626', label: 'RECHAZADA' },
    confirmada: { bg: 'rgba(37,99,235,0.1)',   color: '#2563eb', label: 'CONFIRMADA' },
    vencida:    { bg: 'rgba(107,114,128,0.1)', color: '#6b7280', label: 'VENCIDA' },
  }
  const cfg = cfgMap[estado] ?? { bg: 'rgba(107,114,128,0.1)', color: '#6b7280', label: estado.toUpperCase() }
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.5px',
      padding: '3px 8px', borderRadius: 5,
      background: cfg.bg, color: cfg.color,
    }}>
      {cfg.label}
    </span>
  )
}

function formatDate(d: string | null) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function getJoined<T>(val: T | T[] | null | undefined): T | null {
  if (!val) return null
  if (Array.isArray(val)) return val[0] ?? null
  return val
}

// ─── Reserva Modal (multi-soporte) ───────────────────────────────────────────

function ReservaModal({
  soportes,
  clientes,
  preselectedSoporteId,
  onClose,
  onSaved,
}: {
  soportes: SoporteConEstado[]
  clientes: Props['clientes']
  preselectedSoporteId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    preselectedSoporteId ? new Set([preselectedSoporteId]) : new Set()
  )
  const [clienteId, setClienteId] = useState('')
  const [fechaDesde, setFechaDesde] = useState(today)
  const [fechaHasta, setFechaHasta] = useState(today)
  const [notas, setNotas] = useState('')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleSoporte(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filteredSoportes = soportes.filter(s =>
    !search ||
    s.nombre.toLowerCase().includes(search.toLowerCase()) ||
    (s.seccion ?? '').toLowerCase().includes(search.toLowerCase())
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (selectedIds.size === 0 || !clienteId) {
      setError('Seleccioná al menos un soporte y un cliente')
      return
    }
    if (fechaHasta < fechaDesde) {
      setError('La fecha de fin debe ser mayor o igual a la de inicio')
      return
    }
    setSaving(true); setError(null)
    const res = await fetch('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        soporteIds: Array.from(selectedIds),
        clienteId,
        fechaDesde,
        fechaHasta,
        notas: notas || undefined,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Error al crear reserva')
      return
    }
    onSaved()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', border: '1px solid #e5e3dc',
    borderRadius: 8, fontSize: 13, fontFamily: 'Montserrat, sans-serif',
    color: '#1a1915', background: '#fff', outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#4a4845', marginBottom: 5 }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid #e5e3dc' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1a1915' }}>Nueva reserva</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#9a9895' }}><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 20px 24px' }}>
          {/* Soportes selection */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>
              Soportes{' '}
              <span style={{ color: '#9a9895', fontWeight: 400 }}>({selectedIds.size} seleccionados)</span>
            </label>
            <input
              type="text"
              placeholder="Buscar soporte..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ ...inputStyle, marginBottom: 8 }}
            />
            <div style={{ border: '1px solid #e5e3dc', borderRadius: 8, maxHeight: 200, overflowY: 'auto' }}>
              {filteredSoportes.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: '#9a9895', fontSize: 13 }}>Sin resultados</div>
              ) : (
                filteredSoportes.map(s => (
                  <div
                    key={s.id}
                    onClick={() => toggleSoporte(s.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f4f3f0',
                      background: selectedIds.has(s.id) ? 'rgba(235,105,28,0.06)' : '#fff',
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                      border: selectedIds.has(s.id) ? '2px solid #eb691c' : '1.5px solid #c5c2bb',
                      background: selectedIds.has(s.id) ? '#eb691c' : '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selectedIds.has(s.id) && <Check size={11} color="#fff" strokeWidth={3} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1915' }}>{s.nombre}</div>
                      {(s.seccion || s.tipo || s.ubicacion) && (
                        <div style={{ fontSize: 11, color: '#9a9895' }}>
                          {[s.tipo, s.seccion, s.ubicacion].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                    {estadoBadge(s.estado)}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Cliente */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Cliente</label>
            <select value={clienteId} onChange={e => setClienteId(e.target.value)} style={inputStyle}>
              <option value="">— Seleccionar cliente —</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>
                  {c.empresa ? `${c.empresa} (${c.nombre})` : c.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Dates */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Desde</label>
              <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Hasta</label>
              <input type="date" value={fechaHasta} min={fechaDesde} onChange={e => setFechaHasta(e.target.value)} style={inputStyle} />
            </div>
          </div>

          {/* Notas */}
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Notas</label>
            <textarea
              value={notas}
              onChange={e => setNotas(e.target.value)}
              placeholder="Observaciones..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

          {error && (
            <div style={{ marginBottom: 14, padding: '8px 12px', background: '#fef0f0', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #e5e3dc', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', color: '#4a4845' }}>
              Cancelar
            </button>
            <button type="submit" disabled={saving} style={{ padding: '9px 20px', border: 'none', borderRadius: 8, background: saving ? '#c45a10' : '#eb691c', cursor: saving ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', color: '#fff', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Guardando...' : 'Crear reserva'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Soporte Card ─────────────────────────────────────────────────────────────

function SoporteCard({
  soporte,
  onReservar,
}: {
  soporte: SoporteConEstado
  onReservar: (id: string) => void
}) {
  const icon = getTipoIcon(soporte.tipo)
  const statusColors = {
    libre:     { border: '#d1fae5', top: '#15803d', bg: '#fff' },
    reservado: { border: '#fde68a', top: '#b45309', bg: '#fffdf5' },
    ocupado:   { border: '#fed7aa', top: '#c45a10', bg: '#fff9f5' },
  }[soporte.estado]

  return (
    <div style={{
      background: statusColors.bg, borderRadius: 12, border: `1px solid ${statusColors.border}`,
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <div style={{ height: 3, background: statusColors.top }} />
      <div style={{ padding: '14px 14px 12px', flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10, flexShrink: 0,
            background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: 20,
          }}>
            {icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {soporte.tipo && (
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9a9895', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 2 }}>
                {soporte.tipo}
              </div>
            )}
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1915', lineHeight: 1.3 }}>{soporte.nombre}</div>
            {(soporte.seccion || soporte.ubicacion) && (
              <div style={{ fontSize: 11, color: '#9a9895', marginTop: 2 }}>
                {[soporte.seccion, soporte.ubicacion].filter(Boolean).join(' · ')}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
          {estadoBadge(soporte.estado)}
          {soporte.fechaDesde && soporte.fechaHasta && (
            <span style={{ fontSize: 11, color: '#9a9895' }}>
              {formatDate(soporte.fechaDesde)} — {formatDate(soporte.fechaHasta)}
            </span>
          )}
        </div>

        {soporte.cliente && (
          <div style={{ fontSize: 12, color: '#4a4845', fontWeight: 500, padding: '4px 8px', background: 'rgba(0,0,0,0.03)', borderRadius: 6 }}>
            {soporte.cliente}
          </div>
        )}
      </div>

      {soporte.estado === 'libre' && (
        <div style={{ padding: '0 14px 12px' }}>
          <button
            onClick={() => onReservar(soporte.id)}
            style={{
              width: '100%', padding: '7px 0', border: '1px solid #eb691c',
              borderRadius: 7, background: 'rgba(235,105,28,0.06)', color: '#eb691c',
              fontSize: 12, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', cursor: 'pointer',
            }}
          >
            Reservar
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Mis Reservas Tab ─────────────────────────────────────────────────────────

function MisReservasTab({ userRol }: { userRol: string }) {
  const [reservas, setReservas] = useState<ReservaRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)

  const isAsistente = ['asistente_ventas', 'gerente_comercial', 'administracion'].includes(userRol)

  async function fetchReservas() {
    setLoading(true)
    try {
      const url = isAsistente ? '/api/reservas?pendientes=true' : '/api/reservas'
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setReservas(data.reservas ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchReservas() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAction(id: string, estado: 'aprobada' | 'rechazada') {
    setActionId(id)
    try {
      await fetch(`/api/reservas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado }),
      })
      await fetchReservas()
    } finally {
      setActionId(null)
    }
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#9a9895', fontSize: 13 }}>
        Cargando reservas...
      </div>
    )
  }

  if (!reservas?.length) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#9a9895' }}>
        <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>
          <Clock size={36} style={{ display: 'block', margin: '0 auto' }} />
        </div>
        <p style={{ fontSize: 14, fontWeight: 700, color: '#4a4845', margin: '0 0 6px' }}>
          {isAsistente ? 'No hay reservas pendientes' : 'No tenés reservas'}
        </p>
        <p style={{ fontSize: 13, margin: 0 }}>
          {isAsistente
            ? 'Las reservas enviadas por vendedores aparecerán aquí.'
            : 'Creá una reserva desde la sección Disponibilidad.'}
        </p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {isAsistente && (
        <div style={{
          padding: '10px 14px',
          background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)',
          borderRadius: 8, fontSize: 12, color: '#b45309', fontWeight: 600,
        }}>
          {reservas.length} reserva{reservas.length !== 1 ? 's' : ''} pendiente{reservas.length !== 1 ? 's' : ''} de aprobación
        </div>
      )}

      {reservas.map(r => {
        const cliente = getJoined(r.clientes)
        const vendedor = getJoined(r.vendedor)
        const lead = getJoined(r.leads)
        const clienteNombre = cliente?.empresa ?? cliente?.nombre ?? '—'
        const soporteNames = (r.reserva_items ?? [])
          .map(item => item.soportes?.nombre ?? '')
          .filter(Boolean)
          .join(', ') || '—'

        return (
          <div key={r.id} style={{
            background: '#fff', border: '1px solid #e5e3dc', borderRadius: 12,
            overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          }}>
            <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#1a1915' }}>{clienteNombre}</span>
                  {reservaEstadoBadge(r.estado)}
                </div>
                <div style={{ fontSize: 12, color: '#4a4845', marginBottom: 4 }}>
                  <strong>Soportes:</strong> {soporteNames}
                </div>
                <div style={{ fontSize: 12, color: '#6e6a62' }}>
                  {formatDate(r.fecha_desde)} — {formatDate(r.fecha_hasta)}
                </div>
                {lead?.descripcion && (
                  <div style={{ fontSize: 11, color: '#9a9895', marginTop: 4 }}>
                    Lead: {lead.descripcion}
                  </div>
                )}
                {isAsistente && vendedor && (
                  <div style={{ fontSize: 11, color: '#9a9895', marginTop: 2 }}>
                    Vendedor: {vendedor.nombre}
                  </div>
                )}
                {r.notas && (
                  <div style={{ fontSize: 11, color: '#9a9895', marginTop: 4, fontStyle: 'italic' }}>
                    {r.notas}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                {isAsistente && r.estado === 'pendiente' && (
                  <>
                    <button
                      onClick={() => handleAction(r.id, 'aprobada')}
                      disabled={actionId === r.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '6px 12px', border: 'none', borderRadius: 7,
                        background: '#15803d', color: '#fff', fontSize: 12, fontWeight: 600,
                        fontFamily: 'Montserrat, sans-serif', cursor: actionId === r.id ? 'wait' : 'pointer',
                        opacity: actionId === r.id ? 0.7 : 1,
                      }}
                    >
                      <Check size={13} /> Aprobar
                    </button>
                    <button
                      onClick={() => handleAction(r.id, 'rechazada')}
                      disabled={actionId === r.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '6px 12px', border: '1px solid #fca5a5', borderRadius: 7,
                        background: '#fff', color: '#dc2626', fontSize: 12, fontWeight: 600,
                        fontFamily: 'Montserrat, sans-serif', cursor: actionId === r.id ? 'wait' : 'pointer',
                        opacity: actionId === r.id ? 0.7 : 1,
                      }}
                    >
                      <XCircle size={13} /> Rechazar
                    </button>
                  </>
                )}
                {!isAsistente && r.estado === 'aprobada' && (
                  <a
                    href="/dashboard/ventas/nueva"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '6px 12px', border: 'none', borderRadius: 7,
                      background: '#eb691c', color: '#fff', fontSize: 12, fontWeight: 600,
                      fontFamily: 'Montserrat, sans-serif', cursor: 'pointer', textDecoration: 'none',
                    }}
                  >
                    <Plus size={13} /> Crear venta
                  </a>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DisponibilidadClient({ initialSoportes, initialFecha, clientes, userRol }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [tab, setTab] = useState<'dia' | 'reservas' | 'periodo'>('dia')
  const [fecha, setFecha] = useState(initialFecha)
  const [soportes, setSoportes] = useState<SoporteConEstado[]>(initialSoportes)
  const [loading, setLoading] = useState(false)
  const [filtroNombre, setFiltroNombre] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')

  const [periodoDesde, setPeriodoDesde] = useState(initialFecha)
  const [periodoHasta, setPeriodoHasta] = useState(initialFecha)
  const [periodoRows, setPeriodoRows] = useState<PeriodRow[] | null>(null)
  const [loadingPeriodo, setLoadingPeriodo] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [preselectedSoporteId, setPreselectedSoporteId] = useState<string | null>(null)

  async function fetchFecha(d: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/disponibilidad?fecha=${d}`)
      if (res.ok) {
        const data = await res.json()
        setSoportes(data.soportes)
      }
    } finally {
      setLoading(false)
    }
  }

  function handleFechaChange(d: string) {
    setFecha(d)
    fetchFecha(d)
  }

  async function handleConsultarPeriodo() {
    if (!periodoDesde || !periodoHasta || periodoHasta < periodoDesde) return
    setLoadingPeriodo(true)
    try {
      const sampleDates = [periodoDesde]
      if (periodoDesde !== periodoHasta) {
        const mid = new Date((new Date(periodoDesde).getTime() + new Date(periodoHasta).getTime()) / 2)
        sampleDates.push(mid.toISOString().split('T')[0])
        sampleDates.push(periodoHasta)
      }
      const uniqueDates = sampleDates.filter((d, i, arr) => arr.indexOf(d) === i)

      const responses = await Promise.all(uniqueDates.map(d => fetch(`/api/disponibilidad?fecha=${d}`)))
      const datasets: SoporteConEstado[][] = await Promise.all(
        responses.map(r => r.json().then((d: { soportes?: SoporteConEstado[] }) => d.soportes ?? []))
      )

      const maps = datasets.map(ds => new Map<string, SoporteConEstado>(ds.map(s => [s.id, s])))

      const rows: PeriodRow[] = initialSoportes.map(s => {
        const states = maps.map(m => m.get(s.id)?.estado ?? 'libre')
        const hasOcupado = states.includes('ocupado')
        const hasReservado = states.includes('reservado')
        const allLibre = states.every(e => e === 'libre')
        const allSame = states.every(e => e === states[0])

        let estadoPeriodo: PeriodRow['estadoPeriodo']
        let detalle: string

        if (allLibre) {
          estadoPeriodo = 'libre'; detalle = 'Libre en todo el período'
        } else if (allSame && hasOcupado) {
          const c = maps[0].get(s.id)?.cliente ?? '—'
          estadoPeriodo = 'ocupado'; detalle = `Ocupado · ${c}`
        } else if (allSame && hasReservado) {
          const c = maps[0].get(s.id)?.cliente ?? '—'
          estadoPeriodo = 'reservado'; detalle = `Reservado · ${c}`
        } else {
          estadoPeriodo = 'parcial'
          const c = maps.find(m => m.get(s.id)?.cliente)?.get(s.id)?.cliente
          detalle = `Ocupación parcial${c ? ` · ${c}` : ''}`
        }

        return { soporte: s, estadoPeriodo, detalle }
      })

      setPeriodoRows(rows)
    } finally {
      setLoadingPeriodo(false)
    }
  }

  function openReservar(soporteId: string | null = null) {
    setPreselectedSoporteId(soporteId)
    setModalOpen(true)
  }

  function handleReservaSaved() {
    setModalOpen(false)
    fetchFecha(fecha)
    startTransition(() => { router.refresh() })
  }

  const tipos = Array.from(new Set(soportes.map(s => s.tipo).filter(Boolean))) as string[]

  const visibleSoportes = soportes.filter(s => {
    if (filtroNombre && !s.nombre.toLowerCase().includes(filtroNombre.toLowerCase())) return false
    if (filtroTipo && s.tipo !== filtroTipo) return false
    if (filtroEstado && s.estado !== filtroEstado) return false
    return true
  })

  const libres    = soportes.filter(s => s.estado === 'libre').length
  const ocupados  = soportes.filter(s => s.estado === 'ocupado').length
  const reservados = soportes.filter(s => s.estado === 'reservado').length

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 18px', border: 'none', borderRadius: 7, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif',
    background: active ? '#eb691c' : 'transparent',
    color: active ? '#fff' : '#6e6a62',
    whiteSpace: 'nowrap',
  })

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif', minHeight: '100%' }}>

      {modalOpen && (
        <ReservaModal
          soportes={soportes}
          clientes={clientes}
          preselectedSoporteId={preselectedSoporteId}
          onClose={() => setModalOpen(false)}
          onSaved={handleReservaSaved}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1a1915', margin: 0, letterSpacing: '-0.3px' }}>
            Disponibilidad
          </h1>
          <p style={{ color: '#9a9895', fontSize: 13, marginTop: 3 }}>
            {soportes.length} soportes totales
          </p>
        </div>
        <button
          onClick={() => openReservar(null)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', background: '#eb691c', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
            fontFamily: 'Montserrat, sans-serif', cursor: 'pointer',
          }}
        >
          <Plus size={15} />
          Nueva reserva
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f4f3f0', borderRadius: 10, padding: 4, width: 'fit-content', flexWrap: 'wrap' }}>
        <button style={tabStyle(tab === 'dia')} onClick={() => { setTab('dia'); setPeriodoRows(null) }}>
          Por día
        </button>
        <button style={tabStyle(tab === 'reservas')} onClick={() => setTab('reservas')}>
          {['asistente_ventas', 'gerente_comercial', 'administracion'].includes(userRol) ? 'Reservas pendientes' : 'Mis reservas'}
        </button>
        <button style={tabStyle(tab === 'periodo')} onClick={() => { setTab('periodo'); setPeriodoRows(null) }}>
          Consultar período
        </button>
      </div>

      {/* ── Por día tab ── */}
      {tab === 'dia' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
            <input
              type="date"
              value={fecha}
              onChange={e => handleFechaChange(e.target.value)}
              style={{ padding: '8px 12px', border: '1px solid #e5e3dc', borderRadius: 8, fontSize: 13, fontFamily: 'Montserrat, sans-serif', color: '#1a1915', background: '#fff', outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {[
                { label: 'Disponibles', count: libres,    color: '#15803d', bg: 'rgba(21,128,61,0.08)' },
                { label: 'Ocupados',    count: ocupados,  color: '#c45a10', bg: 'rgba(235,105,28,0.08)' },
                { label: 'Reservados',  count: reservados, color: '#b45309', bg: 'rgba(217,119,6,0.08)' },
              ].map(({ label, count, color, bg }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 8, background: bg }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color }}>{count}</span>
                  <span style={{ fontSize: 12, color, fontWeight: 600 }}>{label}</span>
                </div>
              ))}
            </div>
            {loading && <span style={{ fontSize: 12, color: '#9a9895' }}>Actualizando...</span>}
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Buscar soporte..."
              value={filtroNombre}
              onChange={e => setFiltroNombre(e.target.value)}
              style={{ padding: '7px 12px', border: '1px solid #e5e3dc', borderRadius: 8, fontSize: 13, fontFamily: 'Montserrat, sans-serif', color: '#1a1915', background: '#fff', outline: 'none', minWidth: 200 }}
            />
            {tipos.length > 0 && (
              <select
                value={filtroTipo}
                onChange={e => setFiltroTipo(e.target.value)}
                style={{ padding: '7px 12px', border: '1px solid #e5e3dc', borderRadius: 8, fontSize: 13, fontFamily: 'Montserrat, sans-serif', color: '#1a1915', background: '#fff', outline: 'none', cursor: 'pointer' }}
              >
                <option value="">Todos los tipos</option>
                {tipos.map(t => (
                  <option key={t} value={t}>{getTipoIcon(t)} {t.charAt(0).toUpperCase() + t.slice(1)}</option>
                ))}
              </select>
            )}
            <select
              value={filtroEstado}
              onChange={e => setFiltroEstado(e.target.value)}
              style={{ padding: '7px 12px', border: '1px solid #e5e3dc', borderRadius: 8, fontSize: 13, fontFamily: 'Montserrat, sans-serif', color: '#1a1915', background: '#fff', outline: 'none', cursor: 'pointer' }}
            >
              <option value="">Todos los estados</option>
              <option value="libre">Libre</option>
              <option value="reservado">Reservado</option>
              <option value="ocupado">Ocupado</option>
            </select>
          </div>

          {visibleSoportes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 24px', color: '#9a9895' }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#4a4845', margin: 0 }}>Sin soportes para mostrar</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
              {visibleSoportes.map(s => (
                <SoporteCard key={s.id} soporte={s} onReservar={openReservar} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Mis reservas tab ── */}
      {tab === 'reservas' && <MisReservasTab userRol={userRol} />}

      {/* ── Consultar período tab ── */}
      {tab === 'periodo' && (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4a4845', marginBottom: 5 }}>Desde</label>
              <input type="date" value={periodoDesde} onChange={e => setPeriodoDesde(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e5e3dc', borderRadius: 8, fontSize: 13, fontFamily: 'Montserrat, sans-serif', color: '#1a1915', background: '#fff', outline: 'none' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#4a4845', marginBottom: 5 }}>Hasta</label>
              <input type="date" value={periodoHasta} min={periodoDesde} onChange={e => setPeriodoHasta(e.target.value)} style={{ padding: '8px 12px', border: '1px solid #e5e3dc', borderRadius: 8, fontSize: 13, fontFamily: 'Montserrat, sans-serif', color: '#1a1915', background: '#fff', outline: 'none' }} />
            </div>
            <button
              onClick={handleConsultarPeriodo}
              disabled={loadingPeriodo}
              style={{ padding: '9px 20px', border: 'none', borderRadius: 8, background: '#eb691c', color: '#fff', fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', cursor: loadingPeriodo ? 'wait' : 'pointer', opacity: loadingPeriodo ? 0.7 : 1 }}
            >
              {loadingPeriodo ? 'Consultando...' : 'Consultar'}
            </button>
          </div>

          {periodoRows && (
            <div style={{ background: '#fff', border: '1px solid #e5e3dc', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9f8f5', borderBottom: '1px solid #e5e3dc' }}>
                    {['Soporte', 'Tipo', 'Sección', 'Estado en el período', 'Detalle'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#9a9895', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periodoRows.map(row => {
                    const badgeCfg = {
                      libre:     { bg: 'rgba(21,128,61,0.1)',   color: '#15803d', label: 'Libre' },
                      reservado: { bg: 'rgba(217,119,6,0.12)',  color: '#b45309', label: 'Reservado' },
                      ocupado:   { bg: 'rgba(235,105,28,0.14)', color: '#c45a10', label: 'Ocupado' },
                      parcial:   { bg: 'rgba(99,102,241,0.1)',  color: '#4f46e5', label: 'Parcial' },
                    }[row.estadoPeriodo]
                    return (
                      <tr key={row.soporte.id} style={{ borderBottom: '1px solid #f0ede6' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1a1915' }}>{row.soporte.nombre}</td>
                        <td style={{ padding: '10px 14px', color: '#4a4845' }}>{row.soporte.tipo ?? '—'}</td>
                        <td style={{ padding: '10px 14px', color: '#4a4845' }}>{row.soporte.seccion ?? '—'}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 5, background: badgeCfg.bg, color: badgeCfg.color }}>
                            {badgeCfg.label}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px', color: '#6e6a62', fontSize: 12 }}>{row.detalle}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
