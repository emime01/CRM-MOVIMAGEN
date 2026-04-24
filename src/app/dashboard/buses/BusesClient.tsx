'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Upload, X, Edit2, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react'

interface Soporte {
  id: string
  nombre: string
  tipo: string | null
  lado_bus: string | null
  bus_id: string | null
}

interface Bus {
  id: string
  numero: string
  modelo: string | null
  categoria: string | null
  lado_disponible: string
  cliente_actual_id: string | null
  notas: string | null
  activo: boolean
  fecha_baja_campana?: string | null
  clientes?: { nombre: string; empresa: string | null } | null
  soportes: Soporte[]
}

interface Cliente {
  id: string
  nombre: string
  empresa: string | null
}

interface ReservaItem {
  id: string
  soporte_id: string
  bus_id: string | null
  soportes: { nombre: string; tipo: string | null; bus_id: string | null; lado_bus: string | null } | null
}

interface ReservaPendiente {
  id: string
  numero_reserva: string | null
  fecha_desde: string
  fecha_hasta: string
  estado: string
  clientes: { nombre: string; empresa: string | null } | null
  reserva_items: ReservaItem[]
}

interface Props {
  initialBuses: Bus[]
  initialSoportesSinAsignar: Soporte[]
  clientes: Cliente[]
  initialReservas: ReservaPendiente[]
  soporteClienteMap: Record<string, { nombre: string; empresa: string | null; fecha_desde: string; fecha_hasta: string }>
  userRol: string
}

function parseLados(val: string | null | undefined): string[] {
  if (!val || val === 'ninguno') return []
  if (val === 'ambos') return ['lateral_izquierdo', 'lateral_derecho']
  if (val === 'izquierdo') return ['lateral_izquierdo']
  if (val === 'derecho') return ['lateral_derecho']
  return val.split(',').filter(Boolean)
}

function fmtFecha(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

const CATEGORIAS: Record<string, string> = {
  lateral_full: 'Lateral Full',
  full_bus: 'Full Bus',
  urbano: 'Urbano',
}

const LADO: Record<string, { text: string; bg: string; color: string }> = {
  ambos:     { text: 'Ambos lados',   bg: '#f0fdf4', color: '#15803d' },
  izquierdo: { text: 'Solo izq.',     bg: '#fef9ec', color: '#b45309' },
  derecho:   { text: 'Solo der.',     bg: '#fef9ec', color: '#b45309' },
  ninguno:   { text: 'No disponible', bg: '#fef2f2', color: '#dc2626' },
}

const POSICIONES: { key: string; label: string }[] = [
  { key: 'lateral_izquierdo', label: 'Lateral Izquierdo' },
  { key: 'lateral_derecho',   label: 'Lateral Derecho' },
  { key: 'trasero',           label: 'Trasero' },
  { key: 'interior',          label: 'Interior' },
]

const inputStyle: React.CSSProperties = {
  width: '100%', height: 36, padding: '0 10px',
  border: '1px solid var(--border)', borderRadius: 8, fontSize: 13,
  fontFamily: 'Montserrat, sans-serif', outline: 'none', boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }

function Modal({ title, onClose, children, width = 560 }: { title: string; onClose: () => void; children: React.ReactNode; width?: number }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function BusesClient({ initialBuses, initialSoportesSinAsignar, clientes, initialReservas, soporteClienteMap, userRol }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'flota' | 'pendientes'>('flota')
  const [buses, setBuses] = useState(initialBuses)
  const [soportesSinAsignar, setSoportesSinAsignar] = useState(initialSoportesSinAsignar)
  const [reservas, setReservas] = useState(initialReservas)

  const canManage = ['operaciones', 'administracion'].includes(userRol)
  const clienteMap = useMemo(() => new Map(clientes.map(c => [c.id, c])), [clientes])
  const busByNumeroMap = useMemo(() => new Map(buses.map(b => [b.numero, b])), [buses])

  const stats = useMemo(() => {
    const total = buses.length
    const mantenimiento = buses.filter(b => parseLados(b.lado_disponible).length === 0).length
    // Un bus "con campaña" = tiene al menos un soporte con cliente activo
    const conCampana = buses.filter(b => b.soportes.some(s => soporteClienteMap[s.id])).length
    const disponibles = total - mantenimiento - conCampana
    return { total, mantenimiento, conCampana, disponibles: Math.max(disponibles, 0) }
  }, [buses, soporteClienteMap])

  // Modals
  const [busModal, setBusModal] = useState<{ open: boolean; data: Partial<Bus> & { soporteAssignments?: { soporteId: string; ladoBus: string }[] } | null }>({ open: false, data: null })
  const [importModal, setImportModal] = useState(false)
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; reserva: ReservaPendiente | null; conflicts: { itemId: string; busNumero: string }[]; overrides: Record<string, string> }>({ open: false, reserva: null, conflicts: [], overrides: {} })

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        {[
          { key: 'flota', label: 'Flota' },
          { key: 'pendientes', label: `Reservas pendientes${reservas.length > 0 ? ` (${reservas.length})` : ''}` },
        ].filter(t => t.key === 'flota' || canManage).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as 'flota' | 'pendientes')}
            style={{
              border: 'none',
              background: 'transparent',
              padding: '10px 16px',
              fontSize: 13,
              fontWeight: 600,
              color: tab === t.key ? 'var(--orange)' : 'var(--text-muted)',
              borderBottom: tab === t.key ? '2px solid var(--orange)' : '2px solid transparent',
              cursor: 'pointer',
              fontFamily: 'Montserrat, sans-serif',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'flota' && (
        <FlotaTab
          buses={buses}
          setBuses={setBuses}
          stats={stats}
          canManage={canManage}
          clienteMap={clienteMap}
          soporteClienteMap={soporteClienteMap}
          onEdit={(bus) => setBusModal({ open: true, data: bus })}
          onNew={() => setBusModal({ open: true, data: { lado_disponible: 'ambos' } })}
          onImport={() => setImportModal(true)}
        />
      )}

      {tab === 'pendientes' && canManage && (
        <PendientesTab
          reservas={reservas}
          setReservas={setReservas}
          busByNumeroMap={busByNumeroMap}
          buses={buses}
          onConfirm={(r) => setConfirmModal({ open: true, reserva: r, conflicts: [], overrides: {} })}
        />
      )}

      {busModal.open && busModal.data && (
        <BusModal
          data={busModal.data}
          clientes={clientes}
          soportesSinAsignar={soportesSinAsignar}
          busSoportes={busModal.data.id ? (buses.find(b => b.id === busModal.data!.id)?.soportes ?? []) : []}
          onClose={() => setBusModal({ open: false, data: null })}
          onSaved={(saved) => {
            if (busModal.data?.id) {
              setBuses(prev => prev.map(b => b.id === saved.id ? saved : b))
            } else {
              setBuses(prev => [...prev, saved])
            }
            setBusModal({ open: false, data: null })
            router.refresh()
          }}
          onDeleted={(id) => {
            setBuses(prev => prev.filter(b => b.id !== id))
            setBusModal({ open: false, data: null })
          }}
        />
      )}

      {importModal && (
        <ImportModal
          onClose={() => setImportModal(false)}
          onImported={() => { setImportModal(false); router.refresh() }}
        />
      )}

      {confirmModal.open && confirmModal.reserva && (
        <ConfirmReservaModal
          reserva={confirmModal.reserva}
          conflicts={confirmModal.conflicts}
          overrides={confirmModal.overrides}
          buses={buses}
          onClose={() => setConfirmModal({ open: false, reserva: null, conflicts: [], overrides: {} })}
          onConflicts={(conflicts, reserva) => setConfirmModal({ open: true, reserva, conflicts, overrides: {} })}
          onConfirmed={(id) => {
            setReservas(prev => prev.filter(r => r.id !== id))
            setConfirmModal({ open: false, reserva: null, conflicts: [], overrides: {} })
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components defined below (FlotaTab, PendientesTab, BusModal, ImportModal, ConfirmReservaModal)
// ─────────────────────────────────────────────────────────────────────────────

function FlotaTab({ buses, stats, canManage, soporteClienteMap, onEdit, onNew, onImport }: {
  buses: Bus[]
  setBuses: React.Dispatch<React.SetStateAction<Bus[]>>
  stats: { total: number; disponibles: number; conCampana: number; mantenimiento: number }
  canManage: boolean
  clienteMap: Map<string, Cliente>
  soporteClienteMap: Record<string, { nombre: string; empresa: string | null; fecha_desde: string; fecha_hasta: string }>
  onEdit: (bus: Bus) => void
  onNew: () => void
  onImport: () => void
}) {
  const [filterCliente, setFilterCliente] = useState('')
  const [filterSoporte, setFilterSoporte] = useState('')

  const busesFiltrados = useMemo(() => {
    let list = buses
    if (filterCliente) {
      const q = filterCliente.toLowerCase()
      list = list.filter(b => b.soportes.some(s => {
        const cli = soporteClienteMap[s.id]
        return cli && (cli.empresa ?? cli.nombre).toLowerCase().includes(q)
      }))
    }
    if (filterSoporte) {
      const q = filterSoporte.toLowerCase()
      list = list.filter(b => b.soportes.some(s => s.nombre.toLowerCase().includes(q)))
    }
    return list
  }, [buses, filterCliente, filterSoporte, soporteClienteMap])

  const statsList = [
    { label: 'Total flota',   value: stats.total,        color: 'var(--text-primary)' },
    { label: 'Disponibles',   value: stats.disponibles,  color: '#15803d' },
    { label: 'Con campaña',   value: stats.conCampana,   color: 'var(--orange)' },
    { label: 'Mantenimiento', value: stats.mantenimiento, color: '#dc2626' },
  ]

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <input
          placeholder="Filtrar por cliente..."
          value={filterCliente}
          onChange={e => setFilterCliente(e.target.value)}
          style={{ ...inputStyle, width: 200 }}
        />
        <input
          placeholder="Filtrar por soporte..."
          value={filterSoporte}
          onChange={e => setFilterSoporte(e.target.value)}
          style={{ ...inputStyle, width: 200 }}
        />
        <div style={{ flex: 1 }} />
        {canManage && (
          <>
            <button onClick={onImport} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: '1px solid var(--border)', background: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Montserrat, sans-serif' }}>
              <Upload size={14} /> Importar Excel
            </button>
            <button onClick={onNew} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: 'none', background: 'var(--orange)', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#fff', fontFamily: 'Montserrat, sans-serif' }}>
              <Plus size={14} /> Nuevo bus
            </button>
          </>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {statsList.map(s => (
          <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {busesFiltrados.map(bus => {
          const ladosDisp = parseLados(bus.lado_disponible)
          return (
            <div key={bus.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, position: 'relative' }}>
              {canManage && (
                <button onClick={() => onEdit(bus)} title="Editar" style={{ position: 'absolute', top: 10, right: 10, border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, color: 'var(--text-muted)' }}>
                  <Edit2 size={14} />
                </button>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, paddingRight: canManage ? 24 : 0 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>#{bus.numero}</div>
                {bus.categoria && <span style={{ background: '#eef2ff', color: '#4338ca', padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>{CATEGORIAS[bus.categoria] ?? bus.categoria}</span>}
              </div>
              {bus.modelo && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>{bus.modelo}</div>}

              {/* Per-side availability badges */}
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
                {POSICIONES.map(pos => {
                  const disp = ladosDisp.includes(pos.key)
                  return (
                    <span key={pos.key} style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: disp ? '#f0fdf4' : '#fef2f2', color: disp ? '#15803d' : '#dc2626' }}>
                      {pos.label.replace('Lateral ', 'Lat. ')}
                    </span>
                  )
                })}
              </div>

              {/* Soporte rows with client + dates */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                {POSICIONES.map(pos => {
                  const soportesEnPos = bus.soportes.filter(x => {
                    const lados = x.lado_bus?.split(',') ?? []
                    return lados.includes(pos.key) || x.lado_bus === pos.key
                  })
                  if (soportesEnPos.length === 0) return (
                    <div key={pos.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', color: '#9ca3af' }}>
                      <span>{pos.label}</span><span>—</span>
                    </div>
                  )
                  return soportesEnPos.map(s => {
                    const cli = soporteClienteMap[s.id]
                    return (
                      <div key={s.id + pos.key} style={{ padding: '4px 0', borderBottom: '1px dashed #eee' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                          <span style={{ color: 'var(--text-muted)' }}>{pos.label}</span>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{s.nombre}</span>
                        </div>
                        {cli && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, marginTop: 2 }}>
                            <span style={{ color: 'var(--orange)', fontWeight: 600 }}>{cli.empresa ?? cli.nombre}</span>
                            <span style={{ color: 'var(--text-muted)' }}>{fmtFecha(cli.fecha_desde)} → {fmtFecha(cli.fecha_hasta)}</span>
                          </div>
                        )}
                      </div>
                    )
                  })
                })}
              </div>
            </div>
          )
        })}
        {busesFiltrados.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 48, color: 'var(--text-muted)', fontSize: 13 }}>
            {buses.length === 0
              ? <>No hay buses cargados. {canManage && 'Usá "Nuevo bus" o "Importar Excel".'}</>
              : 'No hay buses que coincidan con los filtros.'}
          </div>
        )}
      </div>
    </>
  )
}

function PendientesTab({ reservas, buses, onConfirm }: {
  reservas: ReservaPendiente[]
  setReservas: React.Dispatch<React.SetStateAction<ReservaPendiente[]>>
  busByNumeroMap: Map<string, Bus>
  buses: Bus[]
  onConfirm: (r: ReservaPendiente) => void
}) {
  const busById = useMemo(() => new Map(buses.map(b => [b.id, b])), [buses])

  if (reservas.length === 0) {
    return (
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        <CheckCircle2 size={32} style={{ color: '#15803d', marginBottom: 8 }} />
        <div>No hay reservas pendientes de asignación.</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {reservas.map(r => {
        const cliente = r.clientes?.empresa ?? r.clientes?.nombre ?? '—'
        const busItems = r.reserva_items.filter(it => it.soportes?.tipo === 'bus' || it.soportes?.bus_id)
        return (
          <div key={r.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {r.numero_reserva ?? r.id.slice(0, 8)} · {cliente}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {new Date(r.fecha_desde + 'T00:00:00').toLocaleDateString('es-UY')} — {new Date(r.fecha_hasta + 'T00:00:00').toLocaleDateString('es-UY')}
                </div>
              </div>
              <button onClick={() => onConfirm(r)} style={{ padding: '8px 14px', border: 'none', background: 'var(--orange)', color: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'Montserrat, sans-serif' }}>
                Confirmar y asignar
              </button>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              {busItems.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin soportes tipo bus</div>
              ) : (
                busItems.map(it => {
                  const busAsignado = it.soportes?.bus_id ? busById.get(it.soportes.bus_id) : null
                  return (
                    <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {it.soportes ? it.soportes.nombre : '—'}
                        {it.soportes?.lado_bus && <span style={{ marginLeft: 6, color: 'var(--text-muted)', fontSize: 10 }}>({it.soportes.lado_bus})</span>}
                      </span>
                      {busAsignado ? (
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Bus #{busAsignado.numero}</span>
                      ) : (
                        <span style={{ color: '#b45309', fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <AlertTriangle size={12} /> Sin bus asignado
                        </span>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ConfirmReservaModal({ reserva, conflicts, overrides: initialOverrides, buses, onClose, onConflicts, onConfirmed }: {
  reserva: ReservaPendiente
  conflicts: { itemId: string; busNumero: string }[]
  overrides: Record<string, string>
  buses: Bus[]
  onClose: () => void
  onConflicts: (conflicts: { itemId: string; busNumero: string }[], reserva: ReservaPendiente) => void
  onConfirmed: (id: string) => void
}) {
  const [overrides, setOverrides] = useState<Record<string, string>>(initialOverrides)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function confirmar() {
    setSaving(true); setError('')
    try {
      const busOverrides = Object.entries(overrides)
        .filter(([, v]) => v)
        .map(([itemId, busId]) => ({ itemId, busId }))

      const res = await fetch(`/api/reservas/${reserva.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: 'confirmada', busOverrides }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al confirmar'); return }

      if (data.conflicts && data.conflicts.length > 0) {
        onConflicts(data.conflicts, reserva)
        return
      }
      onConfirmed(reserva.id)
    } finally { setSaving(false) }
  }

  const busItems = reserva.reserva_items.filter(it => it.soportes?.tipo === 'bus' || it.soportes?.bus_id)
  const conflictSet = new Set(conflicts.map(c => c.itemId))

  return (
    <Modal title={`Confirmar reserva ${reserva.numero_reserva ?? ''}`} onClose={onClose} width={600}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
        {reserva.clientes?.empresa ?? reserva.clientes?.nombre} ·{' '}
        {new Date(reserva.fecha_desde + 'T00:00:00').toLocaleDateString('es-UY')} — {new Date(reserva.fecha_hasta + 'T00:00:00').toLocaleDateString('es-UY')}
      </div>

      {conflicts.length > 0 && (
        <div style={{ background: '#fef9ec', border: '1px solid #f5cc7a', borderRadius: 8, padding: 12, marginBottom: 16, display: 'flex', gap: 10 }}>
          <AlertTriangle size={18} style={{ color: '#b45309', flexShrink: 0 }} />
          <div style={{ fontSize: 12, color: '#7c4a0a', lineHeight: 1.5 }}>
            Se detectaron conflictos de fecha en los buses asignados. Seleccioná un bus alternativo para cada ítem marcado.
          </div>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        {busItems.map(it => {
          const conflict = conflictSet.has(it.id)
          const sameCat = buses.filter(b => b.lado_disponible !== 'ninguno')
          return (
            <div key={it.id} style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: conflict ? 8 : 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {it.soportes?.nombre}
                  {conflict && <span style={{ marginLeft: 8, color: '#b45309', fontSize: 11, fontWeight: 600 }}>conflicto</span>}
                </div>
                {!conflict && it.soportes?.bus_id && (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Bus #{buses.find(b => b.id === it.soportes?.bus_id)?.numero ?? '—'}
                  </span>
                )}
              </div>
              {conflict && (
                <select
                  style={inputStyle}
                  value={overrides[it.id] ?? ''}
                  onChange={e => setOverrides({ ...overrides, [it.id]: e.target.value })}
                >
                  <option value="">— Elegir bus alternativo —</option>
                  {sameCat.map(b => (
                    <option key={b.id} value={b.id}>#{b.numero} · {b.modelo ?? '—'}{b.categoria ? ` (${CATEGORIAS[b.categoria] ?? b.categoria})` : ''}</option>
                  ))}
                </select>
              )}
            </div>
          )
        })}
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ padding: '8px 14px', border: '1px solid var(--border)', background: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif' }}>Cancelar</button>
        <button onClick={confirmar} disabled={saving} style={{ padding: '8px 14px', border: 'none', background: 'var(--orange)', color: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: saving ? 0.6 : 1, fontFamily: 'Montserrat, sans-serif' }}>
          {saving ? 'Confirmando...' : 'Confirmar reserva'}
        </button>
      </div>
    </Modal>
  )
}

function BusModal({ data, clientes, soportesSinAsignar, busSoportes, onClose, onSaved, onDeleted }: {
  data: Partial<Bus> & { soporteAssignments?: { soporteId: string; ladoBus: string }[] }
  clientes: Cliente[]
  soportesSinAsignar: Soporte[]
  busSoportes: Soporte[]
  onClose: () => void
  onSaved: (bus: Bus) => void
  onDeleted: (id: string) => void
}) {
  const [form, setForm] = useState({
    numero: data.numero ?? '',
    modelo: data.modelo ?? '',
    categoria: data.categoria ?? '',
    notas: data.notas ?? '',
    cliente_actual_id: data.cliente_actual_id ?? '',
  })
  const [ladosDisp, setLadosDisp] = useState<string[]>(parseLados(data.lado_disponible))

  // Initial per-position soporte assignments — a soporte can appear in multiple positions
  const initialPos: Record<string, string> = {}
  for (const pos of POSICIONES) {
    const s = busSoportes.find(x => {
      const lados = x.lado_bus?.split(',') ?? []
      return lados.includes(pos.key) || x.lado_bus === pos.key
    })
    initialPos[pos.key] = s?.id ?? ''
  }
  const [posAssign, setPosAssign] = useState<Record<string, string>>(initialPos)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // All soportes available: unassigned ones + any already on this bus (can be reused in other positions)
  const allOptions = useMemo(() => {
    const seen = new Set<string>()
    const result: Soporte[] = []
    for (const s of [...busSoportes, ...soportesSinAsignar]) {
      if (!seen.has(s.id)) { seen.add(s.id); result.push(s) }
    }
    return result.sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [busSoportes, soportesSinAsignar])

  async function save() {
    if (!form.numero.trim()) { setError('Número de bus requerido'); return }
    setSaving(true); setError('')
    try {
      // Group positions by soporteId so same soporte in multiple positions → comma-separated lado_bus
      const grouped: Record<string, string[]> = {}
      for (const [ladoBus, sId] of Object.entries(posAssign)) {
        if (!sId) continue
        if (!grouped[sId]) grouped[sId] = []
        grouped[sId].push(ladoBus)
      }
      const soporteAssignments = Object.entries(grouped).map(([soporteId, lados]) => ({
        soporteId,
        ladoBus: lados.join(','),
      }))

      const payload = {
        ...form,
        lado_disponible: ladosDisp.join(',') || 'ninguno',
        categoria: form.categoria || null,
        cliente_actual_id: form.cliente_actual_id || null,
        modelo: form.modelo || null,
        notas: form.notas || null,
        soporteAssignments,
      }

      let saved: Bus
      if (data.id) {
        const res = await fetch(`/api/buses/${data.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (!res.ok) { const e = await res.json().catch(() => ({})); setError(e.error ?? 'Error al guardar'); return }
        saved = { ...(data as Bus), ...payload, id: data.id } as Bus
      } else {
        const res = await fetch('/api/buses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        if (!res.ok) { const e = await res.json().catch(() => ({})); setError(e.error ?? 'Error al guardar'); return }
        saved = await res.json()
        saved.soportes = []
      }
      onSaved(saved)
    } finally { setSaving(false) }
  }

  async function remove() {
    if (!data.id) return
    if (!confirm(`¿Desactivar bus #${form.numero}?`)) return
    const res = await fetch(`/api/buses/${data.id}`, { method: 'DELETE' })
    if (!res.ok) { alert('Error al desactivar'); return }
    onDeleted(data.id)
  }

  return (
    <Modal title={data.id ? `Editar bus #${form.numero}` : 'Nuevo bus'} onClose={onClose} width={640}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Número *</label>
          <input style={inputStyle} value={form.numero} onChange={e => setForm({ ...form, numero: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>Modelo</label>
          <input style={inputStyle} value={form.modelo} onChange={e => setForm({ ...form, modelo: e.target.value })} />
        </div>
        <div>
          <label style={labelStyle}>Categoría</label>
          <select style={inputStyle} value={form.categoria} onChange={e => setForm({ ...form, categoria: e.target.value })}>
            <option value="">—</option>
            {Object.entries(CATEGORIAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Lados disponibles</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4 }}>
            {POSICIONES.map(pos => (
              <label key={pos.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', color: 'var(--text-primary)' }}>
                <input
                  type="checkbox"
                  checked={ladosDisp.includes(pos.key)}
                  onChange={e => setLadosDisp(prev => e.target.checked ? [...prev, pos.key] : prev.filter(k => k !== pos.key))}
                />
                {pos.label}
              </label>
            ))}
          </div>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Cliente actual</label>
          <select style={inputStyle} value={form.cliente_actual_id} onChange={e => setForm({ ...form, cliente_actual_id: e.target.value })}>
            <option value="">Sin cliente</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.empresa ?? c.nombre}</option>)}
          </select>
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={labelStyle}>Notas</label>
          <textarea style={{ ...inputStyle, height: 60, padding: 8, resize: 'vertical' }} value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} />
        </div>
      </div>

      <div style={{ background: '#fafafa', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Soportes del bus</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {POSICIONES.map(pos => (
            <div key={pos.key}>
              <label style={labelStyle}>{pos.label}</label>
              <select style={inputStyle} value={posAssign[pos.key] ?? ''} onChange={e => setPosAssign({ ...posAssign, [pos.key]: e.target.value })}>
                <option value="">— sin asignar —</option>
                {allOptions.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 8 }}>{error}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 12 }}>
        <div>
          {data.id && (
            <button onClick={remove} style={{ padding: '8px 14px', border: '1px solid #dc2626', background: '#fff', color: '#dc2626', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Trash2 size={14} /> Desactivar
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onClose} style={{ padding: '8px 14px', border: '1px solid var(--border)', background: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif' }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ padding: '8px 14px', border: 'none', background: 'var(--orange)', color: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, opacity: saving ? 0.6 : 1, fontFamily: 'Montserrat, sans-serif' }}>
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleImport() {
    if (!file) return
    setImporting(true); setResult(null)
    try {
      const xlsx = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = xlsx.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = xlsx.utils.sheet_to_json(ws, { defval: '' })

      const items = (rows as Record<string, unknown>[]).map(r => ({
        numero_bus: String(r['numero_bus'] ?? r['numero'] ?? r['Numero_Bus'] ?? r['NUMERO_BUS'] ?? ''),
        lateral_izquierdo: String(r['lateral_izquierdo'] ?? r['Lateral_Izquierdo'] ?? ''),
        lateral_derecho: String(r['lateral_derecho'] ?? r['Lateral_Derecho'] ?? ''),
        trasero: String(r['trasero'] ?? r['Trasero'] ?? ''),
        interior: String(r['interior'] ?? r['Interior'] ?? ''),
        categoria: String(r['categoria'] ?? r['Categoria'] ?? ''),
        modelo: String(r['modelo'] ?? r['Modelo'] ?? ''),
        lado_disponible: String(r['lado_disponible'] ?? r['Lado_Disponible'] ?? 'ambos'),
        cliente_actual: String(r['cliente_actual'] ?? r['Cliente_Actual'] ?? ''),
      }))

      const res = await fetch('/api/buses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) })
      const data = await res.json()
      if (!res.ok) { setResult(`Error: ${data.error ?? 'falló la importación'}`); return }

      const creados = (data.results ?? []).filter((r: { status: string }) => r.status === 'creado').length
      const actualizados = (data.results ?? []).filter((r: { status: string }) => r.status === 'actualizado').length
      const errores = (data.results ?? []).filter((r: { status: string }) => r.status === 'error').length
      setResult(`Creados: ${creados} · Actualizados: ${actualizados}${errores ? ` · Errores: ${errores}` : ''}`)
      setTimeout(onImported, 1200)
    } catch (e) {
      setResult(`Error al procesar archivo: ${(e as Error).message}`)
    } finally { setImporting(false) }
  }

  return (
    <Modal title="Importar flota desde Excel" onClose={onClose} width={560}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12, background: '#fafafa', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>Columnas esperadas:</div>
        <code style={{ fontSize: 11, display: 'block', whiteSpace: 'pre-wrap', color: 'var(--text-primary)' }}>
          numero_bus, modelo, categoria, lado_disponible,{'\n'}
          lateral_izquierdo, lateral_derecho, trasero, interior,{'\n'}
          cliente_actual
        </code>
        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
          Categorías válidas: <code>lateral_full</code>, <code>full_bus</code>, <code>urbano</code>. Lados: <code>ambos</code>, <code>izquierdo</code>, <code>derecho</code>, <code>ninguno</code>.
          Los nombres de soportes se buscan por coincidencia (case-insensitive); si no existen, se crean con tipo &quot;bus&quot;.
        </div>
      </div>

      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={e => setFile(e.target.files?.[0] ?? null)}
        style={{ marginBottom: 12, fontSize: 13 }}
      />

      {result && (
        <div style={{ padding: 10, background: result.startsWith('Error') ? '#fef2f2' : '#f0fdf4', color: result.startsWith('Error') ? '#dc2626' : '#15803d', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>
          {result}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ padding: '8px 14px', border: '1px solid var(--border)', background: '#fff', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif' }}>Cerrar</button>
        <button onClick={handleImport} disabled={!file || importing} style={{ padding: '8px 14px', border: 'none', background: 'var(--orange)', color: '#fff', borderRadius: 8, cursor: file && !importing ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600, opacity: file && !importing ? 1 : 0.5, fontFamily: 'Montserrat, sans-serif' }}>
          {importing ? 'Importando...' : 'Importar'}
        </button>
      </div>
    </Modal>
  )
}

