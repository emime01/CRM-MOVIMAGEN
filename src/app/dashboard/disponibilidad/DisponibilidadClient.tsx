'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Plus, Check, XCircle, ChevronLeft, ChevronRight, Grid3X3, List, BarChart2 } from 'lucide-react'
import type { SoporteOcupacion, DiaStats } from '@/app/api/disponibilidad/route'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Cliente { id: string; nombre: string; empresa: string | null }
interface Props { userRol: string; userId: string; clientes: Cliente[] }

interface ReservaRow {
  id: string
  fecha_desde: string
  fecha_hasta: string
  estado: string
  notas: string | null
  created_at: string
  clientes: { nombre: string; empresa: string | null } | { nombre: string; empresa: string | null }[] | null
  vendedor: { nombre: string } | { nombre: string }[] | null
  reserva_items: { id: string; cantidad: number; soportes: { nombre: string } | null }[]
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const CAT_ICONS: Record<string, string> = {
  buses: '🚌', bus: '🚌',
  led: '📺', leds: '📺',
  shopping: '🏪', shoppings: '🏪', 'circ. shoppings': '🏪',
  freeshop: '🛍️', freeshops: '🛍️', aeropuerto: '🛍️',
  medianera: '🧱', 'via publica': '🧱', 'vía pública': '🧱', walls: '🧱', wall: '🧱',
  mall: '🏬', malls: '🏬',
}

const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function getCatIcon(s: SoporteOcupacion): string {
  const key = (s.categoria ?? s.tipo ?? '').toLowerCase()
  return CAT_ICONS[key] ?? CAT_ICONS[(s.tipo_cotizador ?? '').split('_')[0]] ?? '📦'
}

function formatDate(d: string | null) {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

function getJoined<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function daysUntil(hasta: string): number {
  const end = new Date(hasta)
  end.setHours(23, 59, 59, 999)
  return Math.ceil((end.getTime() - Date.now()) / 86400000)
}

// ─── Occupancy bar ─────────────────────────────────────────────────────────────

function OccupancyBar({ pct }: { pct: number }) {
  const color = pct >= 100 ? '#dc2626' : pct > 60 ? '#f59e0b' : '#16a34a'
  return (
    <div style={{ width: '100%', height: 5, background: '#f0ede6', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 3 }} />
    </div>
  )
}

// ─── Soporte Card ──────────────────────────────────────────────────────────────

function SoporteCard({ s, onReservar }: { s: SoporteOcupacion; onReservar: () => void }) {
  const icon = getCatIcon(s)
  const colors = {
    ocupado:  { border: '#fecaca', top: '#dc2626', badge: { bg: 'rgba(220,38,38,0.1)',  color: '#dc2626', label: 'OCUPADO'  } },
    parcial:  { border: '#fde68a', top: '#d97706', badge: { bg: 'rgba(217,119,6,0.12)', color: '#b45309', label: 'PARCIAL'  } },
    libre:    { border: '#bbf7d0', top: '#16a34a', badge: { bg: 'rgba(21,128,61,0.1)',  color: '#15803d', label: 'LIBRE'    } },
  }[s.estado]

  return (
    <div style={{
      background: s.estado === 'ocupado' ? 'rgba(254,202,202,0.06)' : '#fff',
      borderRadius: 12, border: `1px solid ${colors.border}`, overflow: 'hidden',
      display: 'flex', flexDirection: 'column', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
      opacity: s.estado === 'ocupado' ? 0.85 : 1,
    }}>
      <div style={{ height: 3, background: colors.top }} />
      <div style={{ padding: '14px 14px 10px', flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, flexShrink: 0, background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
            {icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {s.categoria && (
              <div style={{ fontSize: 10, fontWeight: 700, color: '#9a9895', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 1 }}>
                {s.categoria}
              </div>
            )}
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1915', lineHeight: 1.3 }}>{s.nombre}</div>
            {(s.seccion || s.ubicacion) && (
              <div style={{ fontSize: 11, color: '#9a9895', marginTop: 1 }}>{[s.seccion, s.ubicacion].filter(Boolean).join(' · ')}</div>
            )}
          </div>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.4px', padding: '3px 7px', borderRadius: 5, background: colors.badge.bg, color: colors.badge.color, flexShrink: 0, whiteSpace: 'nowrap' }}>
            {colors.badge.label}
          </span>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: '#6e6a62' }}>{s.reservado}/{s.cap} <span style={{ color: '#9a9895' }}>ocupados</span></span>
            <span style={{ fontSize: 11, fontWeight: 700, color: colors.top }}>{s.pct}%</span>
          </div>
          <OccupancyBar pct={s.pct} />
        </div>

        {s.clientes.length > 0 && (
          <div style={{ fontSize: 11, color: '#4a4845', padding: '4px 8px', background: 'rgba(0,0,0,0.03)', borderRadius: 6, lineHeight: 1.4 }}>
            {s.clientes.slice(0, 2).join(', ')}{s.clientes.length > 2 ? ` +${s.clientes.length - 2}` : ''}
          </div>
        )}
      </div>

      {s.estado !== 'ocupado' && (
        <div style={{ padding: '0 14px 12px' }}>
          <button onClick={onReservar} style={{ width: '100%', padding: '6px 0', border: '1px solid #eb691c', borderRadius: 7, background: 'rgba(235,105,28,0.06)', color: '#eb691c', fontSize: 12, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', cursor: 'pointer' }}>
            Reservar
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Soporte List Row ───────────────────────────────────────────────────────────

function SoporteListRow({ s, onReservar }: { s: SoporteOcupacion; onReservar: () => void }) {
  const icon = getCatIcon(s)
  const badgeCfg = {
    ocupado:  { bg: 'rgba(220,38,38,0.1)',  color: '#dc2626', label: 'OCUPADO'  },
    parcial:  { bg: 'rgba(217,119,6,0.12)', color: '#b45309', label: 'PARCIAL'  },
    libre:    { bg: 'rgba(21,128,61,0.1)',  color: '#15803d', label: 'LIBRE'    },
  }[s.estado]

  return (
    <tr style={{ borderBottom: '1px solid #f0ede6', background: s.estado === 'ocupado' ? 'rgba(254,202,202,0.04)' : '#fff' }}>
      <td style={{ padding: '10px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 16 }}>{icon}</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1915' }}>{s.nombre}</div>
            {(s.seccion || s.ubicacion) && <div style={{ fontSize: 11, color: '#9a9895' }}>{[s.seccion, s.ubicacion].filter(Boolean).join(' · ')}</div>}
          </div>
        </div>
      </td>
      <td style={{ padding: '10px 14px', fontSize: 12, color: '#4a4845' }}>{s.categoria ?? '—'}</td>
      <td style={{ padding: '10px 14px', fontSize: 12, color: '#4a4845', textAlign: 'center' }}>{s.cap}</td>
      <td style={{ padding: '10px 14px', fontSize: 12, color: '#4a4845', textAlign: 'center' }}>{s.reservado}</td>
      <td style={{ padding: '10px 14px', fontSize: 12, color: '#15803d', fontWeight: 600, textAlign: 'center' }}>{s.disponible}</td>
      <td style={{ padding: '10px 14px', minWidth: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1 }}><OccupancyBar pct={s.pct} /></div>
          <span style={{ fontSize: 11, fontWeight: 700, color: s.pct >= 100 ? '#dc2626' : s.pct > 60 ? '#d97706' : '#15803d', whiteSpace: 'nowrap' }}>{s.pct}%</span>
        </div>
      </td>
      <td style={{ padding: '10px 14px' }}>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 7px', borderRadius: 4, background: badgeCfg.bg, color: badgeCfg.color }}>{badgeCfg.label}</span>
      </td>
      <td style={{ padding: '10px 14px', fontSize: 11, color: '#6e6a62', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {s.clientes.join(', ') || '—'}
      </td>
      <td style={{ padding: '10px 14px' }}>
        {s.estado !== 'ocupado' && (
          <button onClick={onReservar} style={{ padding: '5px 12px', border: '1px solid #eb691c', borderRadius: 6, background: 'transparent', color: '#eb691c', fontSize: 11, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Reservar
          </button>
        )}
      </td>
    </tr>
  )
}

// ─── Calendar Strip ─────────────────────────────────────────────────────────────

function CalendarStrip({
  mesYear, selectedFecha, diasStats, onSelectDay, onPrevMes, onNextMes, loading,
}: {
  mesYear: string; selectedFecha: string; diasStats: DiaStats[]
  onSelectDay: (d: string) => void; onPrevMes: () => void; onNextMes: () => void; loading: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const today = new Date().toISOString().split('T')[0]
  const [y, m] = mesYear.split('-').map(Number)
  const daysInMonth = new Date(y, m, 0).getDate()
  const statsMap = new Map(diasStats.map(d => [d.fecha, d]))
  const mesLabel = `${MESES[m - 1]} ${y}`

  useEffect(() => {
    if (!scrollRef.current) return
    const chip = scrollRef.current.querySelector('[data-selected="true"]') as HTMLElement
    chip?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [selectedFecha, mesYear])

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <button onClick={onPrevMes} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, color: '#6e6a62', display: 'flex' }}>
          <ChevronLeft size={16} />
        </button>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1915', minWidth: 140, textAlign: 'center' }}>{mesLabel}</span>
        <button onClick={onNextMes} style={{ border: 'none', background: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, color: '#6e6a62', display: 'flex' }}>
          <ChevronRight size={16} />
        </button>
        {loading && <span style={{ fontSize: 11, color: '#9a9895' }}>…</span>}
      </div>

      <div ref={scrollRef} style={{ display: 'flex', gap: 5, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = i + 1
          const dateStr = `${mesYear}-${String(d).padStart(2, '0')}`
          const dow = new Date(y, m - 1, d).getDay()
          const isSelected = dateStr === selectedFecha
          const isToday = dateStr === today
          const stats = statsMap.get(dateStr)

          return (
            <button
              key={d}
              data-selected={isSelected}
              onClick={() => onSelectDay(dateStr)}
              style={{
                flex: '0 0 auto', width: 44, padding: '7px 0', borderRadius: 8, cursor: 'pointer',
                border: isSelected ? 'none' : isToday ? '1.5px solid #eb691c' : '1.5px solid #e5e3dc',
                background: isSelected ? '#eb691c' : isToday ? 'rgba(235,105,28,0.06)' : '#fff',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
              }}
            >
              <span style={{ fontSize: 9, color: isSelected ? 'rgba(255,255,255,0.8)' : isToday ? '#eb691c' : '#9a9895', fontWeight: 600 }}>
                {DIAS[dow]}
              </span>
              <span style={{ fontSize: 14, fontWeight: 800, color: isSelected ? '#fff' : isToday ? '#eb691c' : '#1a1915', lineHeight: 1 }}>
                {d}
              </span>
              {stats && (
                <span style={{ fontSize: 9, fontWeight: 600, color: isSelected ? 'rgba(255,255,255,0.85)' : '#15803d' }}>
                  {stats.libres}lib
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Dashboard / Estadísticas tab ──────────────────────────────────────────────

function EstadisticasTab({ soportes }: { soportes: SoporteOcupacion[] }) {
  const total = soportes.length
  const ocupados = soportes.filter(s => s.estado === 'ocupado').length
  const parciales = soportes.filter(s => s.estado === 'parcial').length
  const libres = soportes.filter(s => s.estado === 'libre').length
  const avgPct = total > 0 ? Math.round(soportes.reduce((sum, s) => sum + s.pct, 0) / total) : 0

  const catMap = new Map<string, { sum: number; count: number }>()
  soportes.forEach(s => {
    const cat = s.categoria ?? s.tipo ?? 'Otro'
    const e = catMap.get(cat) ?? { sum: 0, count: 0 }
    catMap.set(cat, { sum: e.sum + s.pct, count: e.count + 1 })
  })
  const cats = Array.from(catMap.entries())
    .map(([name, { sum, count }]) => ({ name, avgPct: Math.round(sum / count), count }))
    .sort((a, b) => b.avgPct - a.avgPct)

  const clientCount = new Map<string, number>()
  soportes.forEach(s => s.clientes.forEach(c => clientCount.set(c, (clientCount.get(c) ?? 0) + 1)))
  const topClients = Array.from(clientCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)

  const metricColor = (pct: number) => pct >= 80 ? '#dc2626' : pct > 60 ? '#d97706' : '#15803d'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
        {[
          { label: 'Ocupación global', value: `${avgPct}%`, color: metricColor(avgPct) },
          { label: 'Total soportes',   value: total,            color: '#eb691c' },
          { label: 'Ocupados',         value: ocupados + parciales, color: '#dc2626' },
          { label: 'Libres',           value: libres,           color: '#15803d' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#fff', border: '1px solid #e5e3dc', borderRadius: 12, padding: '14px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#9a9895', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 5 }}>{label}</div>
            <div style={{ fontSize: 26, fontWeight: 900, color, letterSpacing: '-0.5px' }}>{value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: cats.length > 0 && topClients.length > 0 ? '1fr 1fr' : '1fr', gap: 16 }}>
        {cats.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid #e5e3dc', borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1915', marginBottom: 14 }}>Por categoría</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cats.map(({ name, avgPct: pct, count }) => (
                <div key={name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: '#4a4845', fontWeight: 600 }}>
                      {CAT_ICONS[(name ?? '').toLowerCase()] ?? '📦'} {name} <span style={{ color: '#9a9895', fontWeight: 400 }}>({count})</span>
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: metricColor(pct) }}>{pct}%</span>
                  </div>
                  <OccupancyBar pct={pct} />
                </div>
              ))}
            </div>
          </div>
        )}

        {topClients.length > 0 && (
          <div style={{ background: '#fff', border: '1px solid #e5e3dc', borderRadius: 12, padding: '16px 18px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1915', marginBottom: 14 }}>Top clientes hoy</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {topClients.map(([name, count]) => (
                <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', background: '#f9f8f5', borderRadius: 7 }}>
                  <span style={{ fontSize: 12, color: '#1a1915', fontWeight: 600 }}>{name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', background: 'rgba(235,105,28,0.1)', color: '#eb691c', borderRadius: 4 }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {total === 0 && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#9a9895', fontSize: 13 }}>
            Sin datos para mostrar. Cargá soportes primero.
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Reservas Tab ──────────────────────────────────────────────────────────────

function ReservasTab({ userRol }: { userRol: string }) {
  const [reservas, setReservas] = useState<ReservaRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const isAdmin = ['administracion', 'operaciones', 'asistente_ventas', 'gerente_comercial'].includes(userRol)

  useEffect(() => {
    fetch('/api/reservas')
      .then(r => r.json())
      .then(d => setReservas(d.reservas ?? []))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#9a9895', fontSize: 13 }}>Cargando reservas…</div>
  if (!reservas?.length) return (
    <div style={{ padding: 60, textAlign: 'center', color: '#9a9895' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#4a4845', marginBottom: 6 }}>Sin reservas</div>
      <div style={{ fontSize: 13 }}>Las reservas que crees aparecerán aquí.</div>
    </div>
  )

  // Group by month
  const grouped = new Map<string, ReservaRow[]>()
  reservas.forEach(r => {
    const key = r.fecha_desde.slice(0, 7)
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(r)
  })

  const months = Array.from(grouped.entries()).sort((a, b) => b[0].localeCompare(a[0]))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {months.map(([monthKey, rows]) => {
        const [y, m] = monthKey.split('-')
        const label = `${MESES[parseInt(m) - 1]} ${y}`
        return (
          <div key={monthKey}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#9a9895', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 8 }}>
              {label} <span style={{ fontWeight: 400 }}>({rows.length})</span>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e3dc', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f9f8f5', borderBottom: '1px solid #e5e3dc' }}>
                    {['Cliente', 'Soportes', 'Período', 'Estado'].concat(isAdmin ? ['Vendedor'] : []).map(h => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#9a9895', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    const cli = getJoined(r.clientes)
                    const vendedor = getJoined(r.vendedor)
                    const clienteNombre = cli?.empresa ?? cli?.nombre ?? '—'
                    const soportes = (r.reserva_items ?? []).map(i => i.soportes?.nombre ?? '').filter(Boolean).join(', ') || '—'
                    const dv = daysUntil(r.fecha_hasta)

                    const estadoCfg = r.estado === 'confirmada'
                      ? { bg: 'rgba(21,128,61,0.1)', color: '#15803d', label: 'Confirmada' }
                      : r.estado === 'aprobada'
                      ? { bg: 'rgba(37,99,235,0.1)', color: '#2563eb', label: 'Aprobada' }
                      : dv < 0
                      ? { bg: 'rgba(107,114,128,0.1)', color: '#6b7280', label: 'Vencida' }
                      : dv <= 7
                      ? { bg: 'rgba(220,38,38,0.1)', color: '#dc2626', label: `${dv}d` }
                      : dv <= 30
                      ? { bg: 'rgba(217,119,6,0.12)', color: '#b45309', label: `${dv}d` }
                      : { bg: 'rgba(21,128,61,0.1)', color: '#15803d', label: 'Activa' }

                    return (
                      <tr key={r.id} style={{ borderBottom: '1px solid #f0ede6' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1a1915' }}>{clienteNombre}</td>
                        <td style={{ padding: '10px 14px', color: '#4a4845', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{soportes}</td>
                        <td style={{ padding: '10px 14px', color: '#6e6a62', whiteSpace: 'nowrap' }}>{formatDate(r.fecha_desde)} — {formatDate(r.fecha_hasta)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: estadoCfg.bg, color: estadoCfg.color }}>{estadoCfg.label}</span>
                        </td>
                        {isAdmin && <td style={{ padding: '10px 14px', color: '#9a9895' }}>{vendedor?.nombre ?? '—'}</td>}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Aprobaciones Tab ──────────────────────────────────────────────────────────

function AprobacionesTab() {
  const [reservas, setReservas] = useState<ReservaRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)

  const fetchReservas = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/reservas?pendientes=true')
    if (r.ok) {
      const d = await r.json()
      setReservas(d.reservas ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchReservas() }, [fetchReservas])

  async function handleAction(id: string, estado: 'aprobada' | 'rechazada') {
    setActionId(id)
    await fetch(`/api/reservas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado }),
    })
    setActionId(null)
    fetchReservas()
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#9a9895', fontSize: 13 }}>Cargando…</div>

  const pendientes = (reservas ?? []).filter(r => r.estado === 'pendiente')
  const aprobadas = (reservas ?? []).filter(r => r.estado === 'aprobada')

  if (!pendientes.length && !aprobadas.length) return (
    <div style={{ padding: 60, textAlign: 'center', color: '#9a9895' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: '#4a4845', marginBottom: 6 }}>Sin pendientes</div>
      <div style={{ fontSize: 13 }}>No hay reservas esperando aprobación.</div>
    </div>
  )

  function ReservaCard({ r, showActions }: { r: ReservaRow; showActions: boolean }) {
    const cli = getJoined(r.clientes)
    const vendedor = getJoined(r.vendedor)
    const clienteNombre = cli?.empresa ?? cli?.nombre ?? '—'
    const soportes = (r.reserva_items ?? []).map(i => i.soportes?.nombre ?? '').filter(Boolean).join(', ') || '—'

    return (
      <div style={{ background: '#fff', border: `1px solid ${showActions ? '#fde68a' : '#bbf7d0'}`, borderLeft: `4px solid ${showActions ? '#d97706' : '#16a34a'}`, borderRadius: 10, padding: '14px 16px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1a1915', marginBottom: 4 }}>{clienteNombre}</div>
          <div style={{ fontSize: 12, color: '#4a4845', marginBottom: 2 }}><strong>Soportes:</strong> {soportes}</div>
          <div style={{ fontSize: 12, color: '#6e6a62', marginBottom: 2 }}>{formatDate(r.fecha_desde)} — {formatDate(r.fecha_hasta)}</div>
          {vendedor && <div style={{ fontSize: 11, color: '#9a9895' }}>Vendedor: {vendedor.nombre}</div>}
          {r.notas && <div style={{ fontSize: 11, color: '#9a9895', fontStyle: 'italic', marginTop: 4 }}>{r.notas}</div>}
        </div>
        {showActions && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            <button onClick={() => handleAction(r.id, 'aprobada')} disabled={actionId === r.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: 'none', borderRadius: 7, background: '#15803d', color: '#fff', fontSize: 12, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', cursor: actionId === r.id ? 'wait' : 'pointer', opacity: actionId === r.id ? 0.7 : 1 }}>
              <Check size={12} /> Aprobar
            </button>
            <button onClick={() => handleAction(r.id, 'rechazada')} disabled={actionId === r.id} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', border: '1px solid #fca5a5', borderRadius: 7, background: '#fff', color: '#dc2626', fontSize: 12, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', cursor: actionId === r.id ? 'wait' : 'pointer', opacity: actionId === r.id ? 0.7 : 1 }}>
              <XCircle size={12} /> Rechazar
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {pendientes.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#b45309', marginBottom: 10 }}>
            Pendientes de aprobación ({pendientes.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pendientes.map(r => <ReservaCard key={r.id} r={r} showActions />)}
          </div>
        </div>
      )}
      {aprobadas.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#15803d', marginBottom: 10 }}>
            Reservas aprobadas ({aprobadas.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {aprobadas.map(r => <ReservaCard key={r.id} r={r} showActions={false} />)}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Reserva Modal ─────────────────────────────────────────────────────────────

function ReservaModal({
  soportes, clientes, preselectedId, onClose, onSaved,
}: {
  soportes: SoporteOcupacion[]; clientes: Cliente[]
  preselectedId: string | null; onClose: () => void; onSaved: () => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const [selectedIds, setSelectedIds] = useState<Set<string>>(preselectedId ? new Set([preselectedId]) : new Set())
  const [clienteId, setClienteId] = useState('')
  const [desde, setDesde] = useState(today)
  const [hasta, setHasta] = useState(today)
  const [notas, setNotas] = useState('')
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = soportes.filter(s =>
    !search || s.nombre.toLowerCase().includes(search.toLowerCase()) || (s.seccion ?? '').toLowerCase().includes(search.toLowerCase())
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedIds.size || !clienteId) { setError('Seleccioná al menos un soporte y un cliente'); return }
    if (hasta < desde) { setError('La fecha de fin debe ser mayor o igual a la de inicio'); return }
    setSaving(true); setError(null)
    const res = await fetch('/api/reservas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soporteIds: Array.from(selectedIds), clienteId, fechaDesde: desde, fechaHasta: hasta, notas: notas || undefined }),
    })
    setSaving(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Error al crear reserva'); return
    }
    onSaved()
  }

  const inp: React.CSSProperties = { width: '100%', padding: '9px 12px', border: '1px solid #e5e3dc', borderRadius: 8, fontSize: 13, fontFamily: 'Montserrat, sans-serif', color: '#1a1915', background: '#fff', outline: 'none', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, color: '#4a4845', marginBottom: 5 }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid #e5e3dc' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1a1915' }}>Nueva reserva</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9a9895' }}><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} style={{ padding: '20px 20px 24px' }}>
          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Soportes <span style={{ color: '#9a9895', fontWeight: 400 }}>({selectedIds.size} seleccionados)</span></label>
            <input type="text" placeholder="Buscar soporte…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp, marginBottom: 8 }} />
            <div style={{ border: '1px solid #e5e3dc', borderRadius: 8, maxHeight: 200, overflowY: 'auto' }}>
              {filtered.map(s => (
                <div key={s.id} onClick={() => {
                  setSelectedIds(prev => { const n = new Set(prev); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n })
                }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f4f3f0', background: selectedIds.has(s.id) ? 'rgba(235,105,28,0.06)' : '#fff' }}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: selectedIds.has(s.id) ? '2px solid #eb691c' : '1.5px solid #c5c2bb', background: selectedIds.has(s.id) ? '#eb691c' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {selectedIds.has(s.id) && <Check size={11} color="#fff" strokeWidth={3} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1915' }}>{s.nombre}</div>
                    {(s.seccion || s.categoria) && <div style={{ fontSize: 11, color: '#9a9895' }}>{[s.categoria, s.seccion].filter(Boolean).join(' · ')}</div>}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: s.estado === 'libre' ? 'rgba(21,128,61,0.1)' : 'rgba(220,38,38,0.1)', color: s.estado === 'libre' ? '#15803d' : '#dc2626' }}>
                      {s.disponible}/{s.cap}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Cliente</label>
            <select value={clienteId} onChange={e => setClienteId(e.target.value)} style={inp}>
              <option value="">— Seleccionar cliente —</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.empresa ? `${c.empresa} (${c.nombre})` : c.nombre}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1 }}><label style={lbl}>Desde</label><input type="date" value={desde} onChange={e => setDesde(e.target.value)} style={inp} /></div>
            <div style={{ flex: 1 }}><label style={lbl}>Hasta</label><input type="date" value={hasta} min={desde} onChange={e => setHasta(e.target.value)} style={inp} /></div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={lbl}>Notas</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones…" rows={2} style={{ ...inp, resize: 'vertical', lineHeight: 1.5 }} />
          </div>

          {error && <div style={{ marginBottom: 14, padding: '8px 12px', background: '#fef0f0', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #e5e3dc', borderRadius: 8, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', color: '#4a4845' }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{ padding: '9px 20px', border: 'none', borderRadius: 8, background: saving ? '#c45a10' : '#eb691c', cursor: saving ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', color: '#fff', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Guardando…' : 'Crear reserva'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Component ─────────────────────────────────────────────────────────────

type Tab = 'disponibilidad' | 'estadisticas' | 'reservas' | 'aprobaciones'

export default function DisponibilidadClient({ userRol, clientes }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const todayMes = today.slice(0, 7)

  const [tab, setTab] = useState<Tab>('disponibilidad')
  const [fecha, setFecha] = useState(today)
  const [mesYear, setMesYear] = useState(todayMes)
  const [soportes, setSoportes] = useState<SoporteOcupacion[]>([])
  const [diasStats, setDiasStats] = useState<DiaStats[]>([])
  const [loadingDay, setLoadingDay] = useState(true)
  const [loadingMes, setLoadingMes] = useState(true)
  const [viewMode, setViewMode] = useState<'tarjetas' | 'lista'>('tarjetas')
  const [filtroNombre, setFiltroNombre] = useState('')
  const [filtroCat, setFiltroCat] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [preselectedId, setPreselectedId] = useState<string | null>(null)

  const isAdmin = ['administracion', 'operaciones', 'asistente_ventas', 'gerente_comercial'].includes(userRol)

  const fetchDay = useCallback(async (d: string) => {
    setLoadingDay(true)
    try {
      const r = await fetch(`/api/disponibilidad?fecha=${d}`)
      if (r.ok) { const data = await r.json(); setSoportes(data.soportes ?? []) }
    } finally { setLoadingDay(false) }
  }, [])

  const fetchMes = useCallback(async (m: string) => {
    setLoadingMes(true)
    try {
      const r = await fetch(`/api/disponibilidad?mes=${m}`)
      if (r.ok) { const data = await r.json(); setDiasStats(data.dias ?? []) }
    } finally { setLoadingMes(false) }
  }, [])

  useEffect(() => { fetchDay(today) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { fetchMes(todayMes) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelectDay(d: string) {
    setFecha(d)
    fetchDay(d)
    const m = d.slice(0, 7)
    if (m !== mesYear) { setMesYear(m); fetchMes(m) }
  }

  function handlePrevMes() {
    const [y, m] = mesYear.split('-').map(Number)
    const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
    setMesYear(prev)
    fetchMes(prev)
  }

  function handleNextMes() {
    const [y, m] = mesYear.split('-').map(Number)
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
    setMesYear(next)
    fetchMes(next)
  }

  function openReservar(id: string | null = null) {
    setPreselectedId(id); setModalOpen(true)
  }

  function handleReservaSaved() {
    setModalOpen(false)
    fetchDay(fecha)
    fetchMes(mesYear)
  }

  const categorias = Array.from(new Set(soportes.map(s => s.categoria).filter(Boolean))) as string[]

  const visible = soportes.filter(s => {
    if (filtroNombre && !s.nombre.toLowerCase().includes(filtroNombre.toLowerCase())) return false
    if (filtroCat && s.categoria !== filtroCat) return false
    if (filtroEstado && s.estado !== filtroEstado) return false
    return true
  })

  const libresCount    = soportes.filter(s => s.estado === 'libre').length
  const parcialesCount = soportes.filter(s => s.estado === 'parcial').length
  const ocupadosCount  = soportes.filter(s => s.estado === 'ocupado').length

  const tabStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '7px 14px', border: 'none', borderRadius: 7, cursor: 'pointer',
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
          preselectedId={preselectedId}
          onClose={() => setModalOpen(false)}
          onSaved={handleReservaSaved}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1a1915', margin: 0 }}>Disponibilidad</h1>
          <p style={{ color: '#9a9895', fontSize: 13, marginTop: 3 }}>{soportes.length} soportes · {formatDate(fecha)}</p>
        </div>
        <button onClick={() => openReservar(null)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#eb691c', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', cursor: 'pointer' }}>
          <Plus size={15} /> Nueva reserva
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: '#f4f3f0', borderRadius: 10, padding: 4, width: 'fit-content', flexWrap: 'wrap' }}>
        <button style={tabStyle(tab === 'disponibilidad')} onClick={() => setTab('disponibilidad')}>
          Disponibilidad
        </button>
        <button style={tabStyle(tab === 'estadisticas')} onClick={() => setTab('estadisticas')}>
          <BarChart2 size={13} /> Estadísticas
        </button>
        <button style={tabStyle(tab === 'reservas')} onClick={() => setTab('reservas')}>
          Reservas
        </button>
        {isAdmin && (
          <button style={tabStyle(tab === 'aprobaciones')} onClick={() => setTab('aprobaciones')}>
            Aprobaciones
          </button>
        )}
      </div>

      {/* ── Disponibilidad tab ── */}
      {tab === 'disponibilidad' && (
        <>
          <CalendarStrip
            mesYear={mesYear}
            selectedFecha={fecha}
            diasStats={diasStats}
            onSelectDay={handleSelectDay}
            onPrevMes={handlePrevMes}
            onNextMes={handleNextMes}
            loading={loadingMes}
          />

          {/* Stats + view toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              {[
                { label: 'Libres',    count: libresCount,    color: '#15803d', bg: 'rgba(21,128,61,0.08)' },
                { label: 'Parciales', count: parcialesCount, color: '#b45309', bg: 'rgba(217,119,6,0.08)' },
                { label: 'Ocupados',  count: ocupadosCount,  color: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
              ].map(({ label, count, color, bg }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 8, background: bg }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color }}>{count}</span>
                  <span style={{ fontSize: 11, color, fontWeight: 600 }}>{label}</span>
                </div>
              ))}
              {loadingDay && <span style={{ fontSize: 11, color: '#9a9895' }}>Actualizando…</span>}
            </div>
            <div style={{ display: 'flex', gap: 4, background: '#f4f3f0', borderRadius: 8, padding: 3 }}>
              <button onClick={() => setViewMode('tarjetas')} style={{ border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', background: viewMode === 'tarjetas' ? '#fff' : 'transparent', color: viewMode === 'tarjetas' ? '#eb691c' : '#9a9895', display: 'flex', boxShadow: viewMode === 'tarjetas' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                <Grid3X3 size={15} />
              </button>
              <button onClick={() => setViewMode('lista')} style={{ border: 'none', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', background: viewMode === 'lista' ? '#fff' : 'transparent', color: viewMode === 'lista' ? '#eb691c' : '#9a9895', display: 'flex', boxShadow: viewMode === 'lista' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}>
                <List size={15} />
              </button>
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
            <input type="text" placeholder="Buscar soporte…" value={filtroNombre} onChange={e => setFiltroNombre(e.target.value)} style={{ padding: '7px 12px', border: '1px solid #e5e3dc', borderRadius: 8, fontSize: 13, fontFamily: 'Montserrat, sans-serif', color: '#1a1915', background: '#fff', outline: 'none', minWidth: 200 }} />
            {categorias.length > 0 && (
              <select value={filtroCat} onChange={e => setFiltroCat(e.target.value)} style={{ padding: '7px 12px', border: '1px solid #e5e3dc', borderRadius: 8, fontSize: 13, fontFamily: 'Montserrat, sans-serif', color: '#1a1915', background: '#fff', outline: 'none', cursor: 'pointer' }}>
                <option value="">Todas las categorías</option>
                {categorias.map(c => <option key={c} value={c}>{CAT_ICONS[c.toLowerCase()] ?? '📦'} {c}</option>)}
              </select>
            )}
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ padding: '7px 12px', border: '1px solid #e5e3dc', borderRadius: 8, fontSize: 13, fontFamily: 'Montserrat, sans-serif', color: '#1a1915', background: '#fff', outline: 'none', cursor: 'pointer' }}>
              <option value="">Todos los estados</option>
              <option value="libre">Libre</option>
              <option value="parcial">Parcial</option>
              <option value="ocupado">Ocupado</option>
            </select>
          </div>

          {/* Grid or List */}
          {visible.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 24px', color: '#9a9895' }}>
              <p style={{ fontSize: 14, fontWeight: 700, color: '#4a4845', margin: 0 }}>
                {soportes.length === 0 ? 'Sin soportes en el catálogo' : 'Sin resultados para ese filtro'}
              </p>
            </div>
          ) : viewMode === 'tarjetas' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
              {visible.map(s => <SoporteCard key={s.id} s={s} onReservar={() => openReservar(s.id)} />)}
            </div>
          ) : (
            <div style={{ background: '#fff', border: '1px solid #e5e3dc', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9f8f5', borderBottom: '1px solid #e5e3dc' }}>
                    {['Soporte', 'Categoría', 'Cap', 'Res.', 'Disp.', 'Ocupación', 'Estado', 'Clientes', ''].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#9a9895', textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.map(s => <SoporteListRow key={s.id} s={s} onReservar={() => openReservar(s.id)} />)}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'estadisticas' && <EstadisticasTab soportes={soportes} />}
      {tab === 'reservas' && <ReservasTab userRol={userRol} />}
      {tab === 'aprobaciones' && isAdmin && <AprobacionesTab />}
    </div>
  )
}
