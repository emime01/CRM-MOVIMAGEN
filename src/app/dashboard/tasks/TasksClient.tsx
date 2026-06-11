'use client'

import { useState, useEffect, useCallback } from 'react'
import { ClipboardList, CheckCircle, Clock, Play, Palette, Printer, Truck, Camera, Sparkles } from 'lucide-react'

interface Task {
  id: string
  tipo: string
  asignado_a_rol: 'arte' | 'operaciones'
  estado: 'pendiente' | 'en_progreso' | 'completada'
  descripcion: string | null
  fecha_limite: string | null
  created_at: string
  completed_at: string | null
  ordenes_venta: { id: string; numero: number; clientes: { nombre: string; empresa: string | null } | { nombre: string; empresa: string | null }[] | null } | { id: string; numero: number; clientes: any }[] | null
  soportes: { nombre: string } | { nombre: string }[] | null
}

const TIPO_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  arte_muestra_color:                { label: 'Muestra color',         icon: <Palette size={14} />, color: '#a855f7' },
  arte_chequear_material_digital:    { label: 'Chequear material',     icon: <Sparkles size={14} />, color: '#3b82f6' },
  ops_asignar_buses:                 { label: 'Asignar buses',         icon: <Truck size={14} />, color: '#0891b2' },
  ops_producir_impresos:             { label: 'Producir impresos',     icon: <Printer size={14} />, color: '#d97706' },
  ops_crear_comprobante:             { label: 'Crear comprobante',     icon: <Camera size={14} />, color: '#16a34a' },
}

const ESTADO_META: Record<string, { label: string; color: string; bg: string }> = {
  pendiente:   { label: 'PENDIENTE',   color: '#b45309', bg: 'rgba(217,119,6,0.12)' },
  en_progreso: { label: 'EN PROGRESO', color: '#2563eb', bg: 'rgba(37,99,235,0.1)' },
  completada:  { label: 'COMPLETADA',  color: '#15803d', bg: 'rgba(21,128,61,0.1)' },
}

function first<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${day}/${m}/${y}`
}

function diasHasta(d: string | null): number | null {
  if (!d) return null
  const end = new Date(d); end.setHours(23, 59, 59, 999)
  return Math.ceil((end.getTime() - Date.now()) / 86400000)
}

export default function TasksClient({ userRol }: { userRol: string; userId: string }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [estado, setEstado] = useState<'pendiente' | 'en_progreso' | 'completada' | 'todas'>('pendiente')
  const [rolFilter, setRolFilter] = useState<'arte' | 'operaciones' | 'todas'>(
    userRol === 'arte' ? 'arte' : userRol === 'operaciones' ? 'operaciones' : 'todas',
  )
  const [actionId, setActionId] = useState<string | null>(null)

  const canSwitchRol = ['administracion', 'gerente_comercial'].includes(userRol)
  const canAct = ['arte', 'operaciones', 'administracion'].includes(userRol)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (estado !== 'todas') params.set('estado', estado)
    if (canSwitchRol && rolFilter !== 'todas') params.set('rol', rolFilter)
    const res = await fetch(`/api/tasks?${params.toString()}`)
    if (res.ok) {
      const data = await res.json()
      setTasks(data.tasks ?? [])
    }
    setLoading(false)
  }, [estado, rolFilter, canSwitchRol])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  async function cambiarEstado(taskId: string, nuevo: 'en_progreso' | 'completada' | 'pendiente') {
    setActionId(taskId)
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: nuevo }),
    })
    setActionId(null)
    if (!res.ok) { alert('Error al actualizar'); return }
    await fetchTasks()
  }

  const counts = {
    pendientes: tasks.filter(t => t.estado === 'pendiente').length,
    enProgreso: tasks.filter(t => t.estado === 'en_progreso').length,
    completadas: tasks.filter(t => t.estado === 'completada').length,
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '7px 14px', border: 'none', borderRadius: 7, cursor: 'pointer',
    fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif',
    background: active ? 'var(--orange)' : 'transparent',
    color: active ? '#fff' : '#6e6a62',
    whiteSpace: 'nowrap',
  })

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Tareas</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {counts.pendientes} pendiente{counts.pendientes !== 1 ? 's' : ''} · {counts.enProgreso} en progreso · {counts.completadas} completada{counts.completadas !== 1 ? 's' : ''}
          </p>
        </div>
        {canSwitchRol && (
          <div style={{ display: 'flex', gap: 4, background: '#f4f3f0', borderRadius: 8, padding: 3 }}>
            {(['todas', 'arte', 'operaciones'] as const).map(r => (
              <button key={r} onClick={() => setRolFilter(r)} style={{
                padding: '6px 12px', border: 'none', borderRadius: 6, cursor: 'pointer',
                fontSize: 12, fontWeight: 600, fontFamily: 'Montserrat, sans-serif',
                background: rolFilter === r ? '#fff' : 'transparent',
                color: rolFilter === r ? '#1a1915' : '#6e6a62',
                boxShadow: rolFilter === r ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>{r === 'todas' ? 'Todas' : r === 'arte' ? 'Arte' : 'Operaciones'}</button>
            ))}
          </div>
        )}
      </div>

      {/* Tabs por estado */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f4f3f0', borderRadius: 10, padding: 4, width: 'fit-content', flexWrap: 'wrap' }}>
        {(['pendiente', 'en_progreso', 'completada', 'todas'] as const).map(e => (
          <button key={e} style={tabStyle(estado === e)} onClick={() => setEstado(e)}>
            {e === 'pendiente' ? 'Pendientes' : e === 'en_progreso' ? 'En progreso' : e === 'completada' ? 'Completadas' : 'Todas'}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9a9895', fontSize: 13 }}>Cargando…</div>
      ) : tasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9a9895' }}>
          <ClipboardList size={36} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.3 }} />
          <p style={{ fontSize: 14, fontWeight: 700, color: '#4a4845', margin: '0 0 6px' }}>No hay tareas para mostrar</p>
          <p style={{ fontSize: 13, margin: 0 }}>Las tareas aparecen automáticamente al aprobar órdenes de venta.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tasks.map(t => {
            const meta = TIPO_META[t.tipo] ?? { label: t.tipo, icon: <ClipboardList size={14} />, color: '#6e6a62' }
            const estadoMeta = ESTADO_META[t.estado]
            const ord = first<any>(t.ordenes_venta)
            const cli = first<any>(ord?.clientes)
            const sop = first<any>(t.soportes)
            const dv = diasHasta(t.fecha_limite)
            const vencimiento = dv == null ? null : dv < 0 ? `Vencida hace ${Math.abs(dv)}d` : dv === 0 ? 'Vence hoy' : `Vence en ${dv}d`
            const vencColor = dv == null ? '#9a9895' : dv < 0 ? '#dc2626' : dv <= 3 ? '#dc2626' : dv <= 7 ? '#d97706' : '#15803d'

            return (
              <div key={t.id} style={{
                background: '#fff', border: '1px solid #e5e3dc', borderLeft: `4px solid ${meta.color}`, borderRadius: 10,
                padding: '14px 16px', display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap',
              }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 5, background: meta.color + '20', color: meta.color, fontSize: 11, fontWeight: 700 }}>
                      {meta.icon} {meta.label}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, background: estadoMeta.bg, color: estadoMeta.color }}>{estadoMeta.label}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5, background: '#f4f3f0', color: '#6e6a62' }}>{t.asignado_a_rol.toUpperCase()}</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1915', marginBottom: 3 }}>
                    {cli?.empresa ?? cli?.nombre ?? '—'}
                  </div>
                  <div style={{ fontSize: 12, color: '#4a4845', marginBottom: 4 }}>
                    OIC #{ord?.numero ?? '—'}{sop?.nombre ? ' · ' + sop.nombre : ''}
                  </div>
                  {t.descripcion && (
                    <div style={{ fontSize: 11, color: '#6e6a62', marginBottom: 4 }}>{t.descripcion}</div>
                  )}
                  <div style={{ fontSize: 11, color: vencColor, fontWeight: 600 }}>
                    {t.fecha_limite ? `${fmtDate(t.fecha_limite)} · ${vencimiento}` : 'Sin deadline'}
                    {t.completed_at && ` · Completada ${fmtDate(t.completed_at)}`}
                  </div>
                </div>

                {canAct && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                    {t.estado === 'pendiente' && (
                      <button onClick={() => cambiarEstado(t.id, 'en_progreso')} disabled={actionId === t.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: '1px solid #2563eb', borderRadius: 7, background: 'rgba(37,99,235,0.06)', color: '#2563eb', fontSize: 12, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', cursor: 'pointer' }}>
                        <Play size={12} /> Tomar
                      </button>
                    )}
                    {t.estado !== 'completada' && (
                      <button onClick={() => cambiarEstado(t.id, 'completada')} disabled={actionId === t.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: 'none', borderRadius: 7, background: '#15803d', color: '#fff', fontSize: 12, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', cursor: 'pointer' }}>
                        <CheckCircle size={12} /> Completar
                      </button>
                    )}
                    {t.estado === 'completada' && (
                      <button onClick={() => cambiarEstado(t.id, 'pendiente')} disabled={actionId === t.id}
                        style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: '1px solid #e5e3dc', borderRadius: 7, background: '#fff', color: '#6e6a62', fontSize: 12, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', cursor: 'pointer' }}>
                        <Clock size={12} /> Reabrir
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
