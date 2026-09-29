'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { ClipboardList, Palette, Printer, Truck, Camera, Sparkles, ChevronLeft, ChevronRight, GripVertical } from 'lucide-react'

interface Task {
  id: string
  tipo: string
  asignado_a_rol: 'arte' | 'operaciones'
  estado: Estado
  descripcion: string | null
  fecha_limite: string | null
  created_at: string
  completed_at: string | null
  ordenes_venta: { id: string; numero: number; clientes: any } | { id: string; numero: number; clientes: any }[] | null
  soportes: { nombre: string } | { nombre: string }[] | null
  perfiles?: { nombre: string | null } | { nombre: string | null }[] | null
}

type Estado = 'pendiente' | 'en_progreso' | 'completada'

const COLUMNAS: { estado: Estado; titulo: string; color: string }[] = [
  { estado: 'pendiente',   titulo: 'Por hacer',   color: '#d97706' },
  { estado: 'en_progreso', titulo: 'En progreso', color: '#2563eb' },
  { estado: 'completada',  titulo: 'Listo',       color: '#15803d' },
]

const TIPO_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  arte_muestra_color:             { label: 'Muestra color',     icon: <Palette size={12} />,  color: '#a855f7' },
  arte_chequear_material_digital: { label: 'Chequear material', icon: <Sparkles size={12} />, color: '#3b82f6' },
  ops_asignar_buses:              { label: 'Asignar buses',     icon: <Truck size={12} />,    color: '#0891b2' },
  ops_producir_impresos:          { label: 'Producir impresos', icon: <Printer size={12} />,  color: '#d97706' },
  ops_crear_comprobante:          { label: 'Crear comprobante', icon: <Camera size={12} />,   color: '#16a34a' },
}

/** Cuántas completadas se muestran antes de cortar: la columna crece para siempre. */
const MAX_LISTO = 25

function first<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${day}/${m}/${y}`
}

/**
 * Días de calendario hasta la fecha límite: 0 es hoy, negativo ya pasó.
 *
 * Se compara medianoche contra medianoche a propósito. Restar timestamps sueltos
 * daba un día de más (una tarea que vencía hoy aparecía como "1d"), porque
 * mezclaba la hora actual con el fin del día y además `new Date('YYYY-MM-DD')`
 * se interpreta en UTC, no en la hora de Uruguay.
 */
function diasHasta(d: string | null): number | null {
  if (!d) return null
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  if (!y || !m || !day) return null
  const objetivo = new Date(y, m - 1, day)
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return Math.round((objetivo.getTime() - hoy.getTime()) / 86400000)
}

/** Iniciales para la ficha de quien tomó la tarea. */
function iniciales(nombre: string | null | undefined): string {
  if (!nombre) return '?'
  return nombre.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('') || '?'
}

export default function TasksClient({ userRol }: { userRol: string; userId: string }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [rolFilter, setRolFilter] = useState<'arte' | 'operaciones' | 'todas'>(
    userRol === 'arte' ? 'arte' : userRol === 'operaciones' ? 'operaciones' : 'todas',
  )
  const [arrastrando, setArrastrando] = useState<string | null>(null)
  const [columnaActiva, setColumnaActiva] = useState<Estado | null>(null)
  const [moviendo, setMoviendo] = useState<string | null>(null)

  const canSwitchRol = ['administracion', 'gerente_comercial'].includes(userRol)
  const canAct = ['arte', 'operaciones', 'administracion'].includes(userRol)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    // Sin filtro de estado: el tablero necesita las tres columnas de una.
    const params = new URLSearchParams({ limite: '300' })
    if (canSwitchRol && rolFilter !== 'todas') params.set('rol', rolFilter)
    const res = await fetch(`/api/tasks?${params.toString()}`)
    if (res.ok) {
      const data = await res.json()
      setTasks(data.tasks ?? [])
    }
    setLoading(false)
  }, [rolFilter, canSwitchRol])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  const porColumna = useMemo(() => {
    const mapa: Record<Estado, Task[]> = { pendiente: [], en_progreso: [], completada: [] }
    for (const t of tasks) (mapa[t.estado] ??= []).push(t)
    // Las completadas, lo último primero: interesa lo recién terminado.
    mapa.completada.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))
    return mapa
  }, [tasks])

  async function mover(task: Task, destino: Estado) {
    if (!canAct || task.estado === destino || moviendo) return

    // Optimista: la tarjeta salta de columna al instante y se revierte si falla.
    const previo = task.estado
    setMoviendo(task.id)
    setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, estado: destino } : t)))

    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: destino }),
    })
    setMoviendo(null)

    if (!res.ok) {
      setTasks(prev => prev.map(t => (t.id === task.id ? { ...t, estado: previo } : t)))
      const d = await res.json().catch(() => ({}))
      alert(d.error ?? 'No se pudo mover la tarea')
      return
    }
    // Refrescar para traer completed_at y quién la tomó.
    fetchTasks()
  }

  function moverRelativo(task: Task, dir: -1 | 1) {
    const i = COLUMNAS.findIndex(c => c.estado === task.estado)
    const destino = COLUMNAS[i + dir]
    if (destino) mover(task, destino.estado)
  }

  const total = tasks.length
  const pendientes = porColumna.pendiente.length
  const enProgreso = porColumna.en_progreso.length

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Tareas</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {pendientes} por hacer · {enProgreso} en progreso · {porColumna.completada.length} listas
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

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9a9895', fontSize: 13 }}>Cargando…</div>
      ) : total === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9a9895' }}>
          <ClipboardList size={36} style={{ display: 'block', margin: '0 auto 12px', opacity: 0.3 }} />
          <p style={{ fontSize: 14, fontWeight: 700, color: '#4a4845', margin: '0 0 6px' }}>No hay tareas para mostrar</p>
          <p style={{ fontSize: 13, margin: 0 }}>Las tareas aparecen automáticamente al aprobar órdenes de venta.</p>
        </div>
      ) : (
        /* Tablero: en pantallas chicas las columnas se deslizan de costado */
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', overflowX: 'auto', paddingBottom: 8 }}>
          {COLUMNAS.map(col => {
            const items = porColumna[col.estado]
            const visibles = col.estado === 'completada' ? items.slice(0, MAX_LISTO) : items
            const activa = columnaActiva === col.estado
            return (
              <div
                key={col.estado}
                onDragOver={e => { if (canAct && arrastrando) { e.preventDefault(); setColumnaActiva(col.estado) } }}
                onDragLeave={() => setColumnaActiva(prev => (prev === col.estado ? null : prev))}
                onDrop={e => {
                  e.preventDefault()
                  setColumnaActiva(null)
                  const t = tasks.find(x => x.id === arrastrando)
                  if (t) mover(t, col.estado)
                  setArrastrando(null)
                }}
                style={{
                  flex: '1 1 300px', minWidth: 288, maxWidth: 420,
                  background: activa ? 'rgba(235,105,28,0.06)' : '#f4f3f0',
                  border: `1px solid ${activa ? 'var(--orange, #eb691c)' : 'transparent'}`,
                  borderRadius: 12, padding: 10, transition: 'background .12s, border-color .12s',
                }}
              >
                {/* Cabecera de columna */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px 10px' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 3, background: col.color }} />
                  <span style={{ fontSize: 13, fontWeight: 750, color: '#1a1915' }}>{col.titulo}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#6e6a62', background: '#e8e6e0', borderRadius: 9, padding: '1px 7px' }}>
                    {items.length}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60 }}>
                  {visibles.length === 0 && (
                    <div style={{ fontSize: 12, color: '#9a9895', textAlign: 'center', padding: '18px 8px' }}>
                      {activa ? 'Soltá acá' : 'Sin tareas'}
                    </div>
                  )}

                  {visibles.map(t => {
                    const meta = TIPO_META[t.tipo] ?? { label: t.tipo, icon: <ClipboardList size={12} />, color: '#6e6a62' }
                    const ord = first<any>(t.ordenes_venta)
                    const cli = first<any>(ord?.clientes)
                    const sop = first<any>(t.soportes)
                    const quien = first<any>(t.perfiles)?.nombre as string | undefined
                    const dv = diasHasta(t.fecha_limite)
                    const listo = t.estado === 'completada'
                    const vencLabel = listo
                      ? (t.completed_at ? `Lista ${fmtDate(t.completed_at)}` : 'Lista')
                      : dv == null ? 'Sin fecha'
                      : dv < 0 ? `Atrasada ${Math.abs(dv)}d`
                      : dv === 0 ? 'Vence hoy'
                      : `en ${dv}d`
                    const vencColor = listo ? '#15803d'
                      : dv == null ? '#9a9895'
                      : dv <= 0 ? '#dc2626' : dv <= 3 ? '#d97706' : '#6e6a62'
                    const idx = COLUMNAS.findIndex(c => c.estado === t.estado)

                    return (
                      <div
                        key={t.id}
                        draggable={canAct}
                        onDragStart={e => { setArrastrando(t.id); e.dataTransfer.effectAllowed = 'move' }}
                        onDragEnd={() => { setArrastrando(null); setColumnaActiva(null) }}
                        style={{
                          background: '#fff', borderRadius: 9, padding: '10px 11px',
                          borderLeft: `3px solid ${meta.color}`,
                          boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                          opacity: arrastrando === t.id ? 0.45 : moviendo === t.id ? 0.6 : 1,
                          cursor: canAct ? 'grab' : 'default',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 5, background: meta.color + '1f', color: meta.color, fontSize: 10, fontWeight: 700 }}>
                            {meta.icon} {meta.label}
                          </span>
                          {canAct && <GripVertical size={12} style={{ marginLeft: 'auto', color: '#c9c6c0', flexShrink: 0 }} />}
                        </div>

                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1915', marginBottom: 2 }}>
                          {cli?.empresa ?? cli?.nombre ?? '—'}
                        </div>
                        <div style={{ fontSize: 11.5, color: '#6e6a62' }}>
                          OIC #{ord?.numero ?? '—'}{sop?.nombre ? ` · ${sop.nombre}` : ''}
                        </div>
                        {t.descripcion && (
                          <div style={{ fontSize: 11, color: '#8a8780', marginTop: 3 }}>{t.descripcion}</div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                          <span style={{ fontSize: 10.5, fontWeight: 700, color: vencColor }}>{vencLabel}</span>
                          {quien && (
                            <span title={quien} style={{
                              width: 19, height: 19, borderRadius: '50%', background: '#e8e6e0', color: '#4a4845',
                              fontSize: 9, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            }}>{iniciales(quien)}</span>
                          )}
                          {/* Botones de mover: el arrastre nativo no funciona en celular */}
                          {canAct && (
                            <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 2 }}>
                              <button
                                onClick={() => moverRelativo(t, -1)}
                                disabled={idx === 0 || moviendo === t.id}
                                title="Mover a la izquierda"
                                style={btnMover(idx === 0)}
                              ><ChevronLeft size={13} /></button>
                              <button
                                onClick={() => moverRelativo(t, 1)}
                                disabled={idx === COLUMNAS.length - 1 || moviendo === t.id}
                                title="Mover a la derecha"
                                style={btnMover(idx === COLUMNAS.length - 1)}
                              ><ChevronRight size={13} /></button>
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}

                  {col.estado === 'completada' && items.length > MAX_LISTO && (
                    <div style={{ fontSize: 11, color: '#9a9895', textAlign: 'center', padding: '6px 0' }}>
                      + {items.length - MAX_LISTO} más
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {canAct && total > 0 && (
        <p style={{ fontSize: 11.5, color: '#9a9895', marginTop: 12 }}>
          Arrastrá las tarjetas entre columnas, o usá las flechas.
        </p>
      )}
    </div>
  )
}

function btnMover(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 22, height: 22, padding: 0,
    border: '1px solid #e5e3dc', borderRadius: 6, background: '#fff',
    color: disabled ? '#d4d1cb' : '#6e6a62',
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}
