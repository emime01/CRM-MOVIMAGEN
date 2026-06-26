'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, CalendarDays, ArrowUpCircle, ArrowDownCircle, CheckSquare } from 'lucide-react'

type Kind = 'alta' | 'baja' | 'tarea'

interface Evento {
  id: string
  kind: Kind
  fecha: string
  titulo: string
  sub: string | null
  orden_id: string | null
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const KIND_STYLE: Record<Kind, { color: string; bg: string; label: string; icon: React.ReactNode }> = {
  alta:  { color: '#15803d', bg: 'rgba(21,128,61,0.10)',  label: 'Alta',   icon: <ArrowUpCircle size={13} /> },
  baja:  { color: '#dc2626', bg: 'rgba(220,38,38,0.10)',  label: 'Baja',   icon: <ArrowDownCircle size={13} /> },
  tarea: { color: '#d97706', bg: 'rgba(217,119,6,0.10)',  label: 'Tarea',  icon: <CheckSquare size={13} /> },
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function CalendarioClient({ eventos }: { eventos: Evento[] }) {
  const hoy = todayStr()
  const [cursor, setCursor] = useState(() => {
    const [y, m] = hoy.split('-').map(Number)
    return { y, m } // m: 1-12
  })
  const [selected, setSelected] = useState<string | null>(hoy)

  // Eventos agrupados por fecha
  const porFecha = useMemo(() => {
    const map = new Map<string, Evento[]>()
    for (const e of eventos) {
      if (!e.fecha) continue
      const arr = map.get(e.fecha) ?? []
      arr.push(e)
      map.set(e.fecha, arr)
    }
    return map
  }, [eventos])

  const { y, m } = cursor
  const mesYear = `${y}-${String(m).padStart(2, '0')}`
  const daysInMonth = new Date(y, m, 0).getDate()
  // getDay(): 0=Dom..6=Sáb. Queremos Lun=0..Dom=6
  const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7

  const prevMes = () => setCursor(c => (c.m === 1 ? { y: c.y - 1, m: 12 } : { y: c.y, m: c.m - 1 }))
  const nextMes = () => setCursor(c => (c.m === 12 ? { y: c.y + 1, m: 1 } : { y: c.y, m: c.m + 1 }))
  const irHoy = () => { const [yy, mm] = hoy.split('-').map(Number); setCursor({ y: yy, m: mm }); setSelected(hoy) }

  // Resumen del mes
  const resumenMes = useMemo(() => {
    let altas = 0, bajas = 0, tareas = 0
    for (const e of eventos) {
      if (!e.fecha.startsWith(mesYear)) continue
      if (e.kind === 'alta') altas++
      else if (e.kind === 'baja') bajas++
      else tareas++
    }
    return { altas, bajas, tareas }
  }, [eventos, mesYear])

  const selectedEventos = selected ? (porFecha.get(selected) ?? []) : []

  const cells: Array<number | null> = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <CalendarDays size={20} style={{ color: 'var(--orange)' }} />
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Calendario de operaciones</h1>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 20px' }}>
        Altas y bajas de campaña y tareas operativas por fecha.
      </p>

      {/* Controles de mes */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <button onClick={prevMes} style={navBtn}><ChevronLeft size={16} /></button>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', minWidth: 150, textAlign: 'center' }}>{MESES[m - 1]} {y}</span>
        <button onClick={nextMes} style={navBtn}><ChevronRight size={16} /></button>
        <button onClick={irHoy} style={{ ...navBtn, width: 'auto', padding: '6px 12px', fontSize: 12, fontWeight: 600 }}>Hoy</button>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 14, fontSize: 12 }}>
          <span style={{ color: '#15803d', fontWeight: 600 }}>● {resumenMes.altas} altas</span>
          <span style={{ color: '#dc2626', fontWeight: 600 }}>● {resumenMes.bajas} bajas</span>
          <span style={{ color: '#d97706', fontWeight: 600 }}>● {resumenMes.tareas} tareas</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
        {/* Grid */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
            {DIAS.map(d => (
              <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{d}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {cells.map((d, i) => {
              if (d === null) return <div key={`e-${i}`} style={{ minHeight: 84, borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--bg-app)' }} />
              const dateStr = `${mesYear}-${String(d).padStart(2, '0')}`
              const evs = porFecha.get(dateStr) ?? []
              const isToday = dateStr === hoy
              const isSelected = dateStr === selected
              const counts = { alta: 0, baja: 0, tarea: 0 } as Record<Kind, number>
              evs.forEach(e => { counts[e.kind]++ })
              return (
                <button
                  key={d}
                  onClick={() => setSelected(dateStr)}
                  style={{
                    minHeight: 84, textAlign: 'left', padding: 6, cursor: 'pointer',
                    borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                    background: isSelected ? 'rgba(235,105,28,0.08)' : '#fff',
                    fontFamily: 'Montserrat, sans-serif',
                    display: 'flex', flexDirection: 'column', gap: 3,
                  }}
                >
                  <span style={{
                    fontSize: 12, fontWeight: 700, alignSelf: 'flex-start',
                    color: isToday ? '#fff' : 'var(--text-primary)',
                    background: isToday ? 'var(--orange)' : 'transparent',
                    borderRadius: 6, minWidth: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>{d}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {(['alta', 'baja', 'tarea'] as Kind[]).map(k => counts[k] > 0 && (
                      <span key={k} style={{ fontSize: 10, fontWeight: 600, color: KIND_STYLE[k].color, background: KIND_STYLE[k].bg, borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap' }}>
                        {counts[k]} {KIND_STYLE[k].label.toLowerCase()}{counts[k] > 1 ? 's' : ''}
                      </span>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Panel del día */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, position: 'sticky', top: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>
            {selected ? new Date(selected + 'T12:00:00').toLocaleDateString('es-UY', { weekday: 'long', day: '2-digit', month: 'long' }) : 'Seleccioná un día'}
          </h3>
          {selectedEventos.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Sin movimientos este día.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {selectedEventos
                .sort((a, b) => a.kind.localeCompare(b.kind))
                .map(e => {
                  const st = KIND_STYLE[e.kind]
                  const inner = (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 8, background: st.bg }}>
                      <span style={{ color: st.color, marginTop: 1 }}>{st.icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: st.color }}>{st.label}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.titulo}</div>
                        {e.sub && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{e.sub}</div>}
                      </div>
                    </div>
                  )
                  return e.orden_id
                    ? <Link key={e.id} href={`/dashboard/ventas/${e.orden_id}`} style={{ textDecoration: 'none' }}>{inner}</Link>
                    : <div key={e.id}>{inner}</div>
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 8, background: '#fff',
  cursor: 'pointer', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}
