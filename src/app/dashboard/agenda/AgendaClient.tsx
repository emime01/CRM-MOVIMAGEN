'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus, Trash2, X, Calendar, Loader2, RefreshCw } from 'lucide-react'

interface Lead { id: string; label: string }
interface CalEvent {
  id: string
  summary: string
  description?: string
  start: string
  end: string
  colorId?: string
  crmLeadId?: string | null
  crmType?: string
}

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const TYPE_COLORS: Record<string, string> = {
  reunion: '#4285f4',
  llamada: '#33b679',
  vencimiento: '#dc2626',
  recordatorio: '#f6c026',
  otro: '#9b59b6',
}
const TYPE_LABELS: Record<string, string> = {
  reunion: 'Reunión',
  llamada: 'Llamada',
  vencimiento: 'Vencimiento',
  recordatorio: 'Recordatorio',
  otro: 'Otro',
}

function eventColor(ev: CalEvent): string {
  if (ev.crmType && TYPE_COLORS[ev.crmType]) return TYPE_COLORS[ev.crmType]
  const googleColors: Record<string, string> = {
    '1': '#4285f4', '2': '#33b679', '3': '#dbadff', '4': '#ff887c',
    '5': '#fbd75b', '6': '#ffb878', '7': '#46d6db', '8': '#e1e1e1',
    '9': '#5484ed', '10': '#51b749', '11': '#dc2626',
  }
  return ev.colorId ? (googleColors[ev.colorId] ?? '#eb691c') : '#eb691c'
}

function fmtTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

function toLocalDatetime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function defaultStart(day: Date): string {
  const d = new Date(day)
  d.setHours(9, 0, 0, 0)
  return toLocalDatetime(d.toISOString())
}
function defaultEnd(day: Date): string {
  const d = new Date(day)
  d.setHours(10, 0, 0, 0)
  return toLocalDatetime(d.toISOString())
}

interface Props {
  googleConnected: boolean
  leads: Lead[]
}

export default function AgendaClient({ googleConnected, leads }: Props) {
  const today = new Date()
  const searchParams = useSearchParams()
  const preselectedLead = searchParams.get('lead') ?? ''
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [events, setEvents] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [needsReauth, setNeedsReauth] = useState(false)

  // Modal state
  const [modal, setModal] = useState<'create' | 'detail' | null>(null)
  const [selectedDay, setSelectedDay] = useState<Date | null>(null)
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Create form
  const [form, setForm] = useState({ summary: '', description: '', start: '', end: '', crmType: 'reunion', crmLeadId: '' })

  const fetchEvents = useCallback(async () => {
    if (!googleConnected) return
    setLoading(true)
    const from = new Date(year, month, 1)
    const to = new Date(year, month + 1, 0, 23, 59, 59)
    try {
      const res = await fetch(`/api/calendar/events?from=${from.toISOString()}&to=${to.toISOString()}`)
      if (res.status === 403) { setNeedsReauth(true); return }
      if (res.status === 404) return
      if (res.ok) { setEvents(await res.json()); setNeedsReauth(false) }
    } finally {
      setLoading(false)
    }
  }, [year, month, googleConnected])

  useEffect(() => { fetchEvents() }, [fetchEvents])

  // Auto-open create modal when coming from a lead page
  useEffect(() => {
    if (preselectedLead) {
      setSelectedDay(today)
      setForm({ summary: '', description: '', start: defaultStart(today), end: defaultEnd(today), crmType: 'reunion', crmLeadId: preselectedLead })
      setModal('create')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function prevMonth() { if (month === 0) { setYear(y => y - 1); setMonth(11) } else setMonth(m => m - 1) }
  function nextMonth() { if (month === 11) { setYear(y => y + 1); setMonth(0) } else setMonth(m => m + 1) }

  // Build calendar grid
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // Monday-first: getDay() returns 0=Sun, adjust to Monday-first
  const startOffset = (firstDay.getDay() + 6) % 7

  const cells: (Date | null)[] = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d))

  function eventsForDay(d: Date): CalEvent[] {
    const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    return events.filter(e => e.start.startsWith(dateStr)).sort((a, b) => a.start.localeCompare(b.start))
  }

  function openCreate(day: Date) {
    setSelectedDay(day)
    setForm({ summary: '', description: '', start: defaultStart(day), end: defaultEnd(day), crmType: 'reunion', crmLeadId: preselectedLead })
    setModal('create')
  }

  async function handleCreate() {
    if (!form.summary.trim() || !form.start || !form.end) return
    setSaving(true)
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          start: new Date(form.start).toISOString(),
          end: new Date(form.end).toISOString(),
          crmLeadId: form.crmLeadId || null,
        }),
      })
      if (res.ok) {
        const newEv: CalEvent = await res.json()
        setEvents(prev => [...prev, newEv])
        setModal(null)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este evento de Google Calendar?')) return
    setDeleting(true)
    try {
      await fetch(`/api/calendar/events/${id}`, { method: 'DELETE' })
      setEvents(prev => prev.filter(e => e.id !== id))
      setModal(null)
    } finally {
      setDeleting(false)
    }
  }

  const isToday = (d: Date) =>
    d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()

  if (!googleConnected) {
    return (
      <div style={{ maxWidth: 500, margin: '60px auto', textAlign: 'center', padding: 24 }}>
        <Calendar size={40} color="var(--orange)" style={{ margin: '0 auto 16px' }} />
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>Conectá Google para usar la Agenda</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
          La agenda sincroniza con Google Calendar. Necesitás conectar tu cuenta primero.
        </p>
        <a href="/dashboard/perfil" style={{ display: 'inline-block', padding: '10px 24px', background: 'var(--orange)', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          Conectar Google →
        </a>
      </div>
    )
  }

  if (needsReauth) {
    return (
      <div style={{ maxWidth: 500, margin: '60px auto', textAlign: 'center', padding: 24 }}>
        <Calendar size={40} color="var(--orange)" style={{ margin: '0 auto 16px' }} />
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>Permisos de Calendar requeridos</h3>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20, lineHeight: 1.6 }}>
          Para usar la agenda necesitás reconectar tu cuenta Google con permisos de Calendar. Solo tarda un segundo.
        </p>
        <a href="/api/auth/google" style={{ display: 'inline-block', padding: '10px 24px', background: 'var(--orange)', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
          Reconectar Google →
        </a>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={prevMonth} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronLeft size={16} color="var(--text-secondary)" />
        </button>
        <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', minWidth: 180, textAlign: 'center' }}>
          {MONTHS[month]} {year}
        </h2>
        <button onClick={nextMonth} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <ChevronRight size={16} color="var(--text-secondary)" />
        </button>
        <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()) }} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'Montserrat, sans-serif' }}>
          Hoy
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {loading && <Loader2 size={14} color="var(--text-muted)" style={{ animation: 'spin 1s linear infinite' }} />}
          <button onClick={fetchEvents} title="Actualizar" style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <RefreshCw size={14} color="var(--text-secondary)" />
          </button>
          <button
            onClick={() => { setSelectedDay(today); setForm({ summary: '', description: '', start: defaultStart(today), end: defaultEnd(today), crmType: 'reunion', crmLeadId: '' }); setModal('create') }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--orange)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' }}
          >
            <Plus size={14} /> Nuevo evento
          </button>
        </div>
      </div>

      {/* Color legend */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {Object.entries(TYPE_LABELS).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-muted)' }}>
            <div style={{ width: 10, height: 10, borderRadius: 3, background: TYPE_COLORS[k] }} />
            {v}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
          {DAYS.map(d => (
            <div key={d} style={{ padding: '10px 8px', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.5px' }}>
              {d}
            </div>
          ))}
        </div>

        {/* Cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {cells.map((day, i) => {
            const dayEvents = day ? eventsForDay(day) : []
            const shown = dayEvents.slice(0, 3)
            const extra = dayEvents.length - shown.length
            return (
              <div
                key={i}
                onClick={() => day && openCreate(day)}
                style={{
                  minHeight: 100,
                  borderRight: (i + 1) % 7 !== 0 ? '1px solid var(--border)' : 'none',
                  borderBottom: i < cells.length - 7 ? '1px solid var(--border)' : 'none',
                  padding: 6,
                  cursor: day ? 'pointer' : 'default',
                  background: day && isToday(day) ? '#fff7ed' : 'transparent',
                  transition: 'background 100ms',
                }}
                onMouseEnter={e => { if (day) (e.currentTarget as HTMLElement).style.background = day && isToday(day) ? '#fff0dc' : 'var(--bg-app)' }}
                onMouseLeave={e => { if (day) (e.currentTarget as HTMLElement).style.background = day && isToday(day) ? '#fff7ed' : 'transparent' }}
              >
                {day && (
                  <>
                    <div style={{
                      fontSize: 12,
                      fontWeight: isToday(day) ? 700 : 500,
                      color: isToday(day) ? '#fff' : 'var(--text-secondary)',
                      background: isToday(day) ? 'var(--orange)' : 'transparent',
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 4,
                    }}>
                      {day.getDate()}
                    </div>
                    {shown.map(ev => (
                      <div
                        key={ev.id}
                        onClick={e => { e.stopPropagation(); setSelectedEvent(ev); setModal('detail') }}
                        title={ev.summary}
                        style={{
                          background: eventColor(ev),
                          color: '#fff',
                          borderRadius: 4,
                          padding: '2px 5px',
                          fontSize: 10,
                          fontWeight: 600,
                          marginBottom: 2,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          cursor: 'pointer',
                        }}
                      >
                        {fmtTime(ev.start) && <span style={{ opacity: 0.85 }}>{fmtTime(ev.start)} </span>}
                        {ev.summary}
                      </div>
                    ))}
                    {extra > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', paddingLeft: 4 }}>+{extra} más</div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Create event modal */}
      {modal === 'create' && (
        <ModalOverlay onClose={() => setModal(null)}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>
            Nuevo evento · {selectedDay?.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Título *">
              <input
                autoFocus
                value={form.summary}
                onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                placeholder="Reunión con cliente, llamada de seguimiento..."
                style={inputStyle}
              />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Inicio *">
                <input type="datetime-local" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} style={inputStyle} />
              </Field>
              <Field label="Fin *">
                <input type="datetime-local" value={form.end} onChange={e => setForm(f => ({ ...f, end: e.target.value }))} style={inputStyle} />
              </Field>
            </div>
            <Field label="Tipo">
              <select value={form.crmType} onChange={e => setForm(f => ({ ...f, crmType: e.target.value }))} style={inputStyle}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            {leads.length > 0 && (
              <Field label="Lead relacionado (opcional)">
                <select value={form.crmLeadId} onChange={e => setForm(f => ({ ...f, crmLeadId: e.target.value }))} style={inputStyle}>
                  <option value="">— ninguno —</option>
                  {leads.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </Field>
            )}
            <Field label="Notas (opcional)">
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Contexto, agenda, links..." style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button onClick={() => setModal(null)} style={secondaryBtn}>Cancelar</button>
            <button
              onClick={handleCreate}
              disabled={saving || !form.summary.trim()}
              style={{ ...primaryBtn, opacity: saving || !form.summary.trim() ? 0.6 : 1, cursor: saving || !form.summary.trim() ? 'not-allowed' : 'pointer' }}
            >
              {saving ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Guardando...</> : <><Plus size={13} /> Crear en Calendar</>}
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* Event detail modal */}
      {modal === 'detail' && selectedEvent && (
        <ModalOverlay onClose={() => setModal(null)}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: eventColor(selectedEvent), marginTop: 3, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>{selectedEvent.summary}</div>
              {selectedEvent.crmType && (
                <div style={{ fontSize: 12, color: eventColor(selectedEvent), fontWeight: 600, marginTop: 3 }}>
                  {TYPE_LABELS[selectedEvent.crmType] ?? selectedEvent.crmType}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
            <div>
              <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Inicio</span>
              <div>{new Date(selectedEvent.start).toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            <div>
              <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Fin</span>
              <div>{new Date(selectedEvent.end).toLocaleString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            {selectedEvent.description && (
              <div>
                <span style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notas</span>
                <div style={{ marginTop: 2, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{selectedEvent.description}</div>
              </div>
            )}
            {selectedEvent.crmLeadId && (
              <a href="/dashboard/leads" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--orange)', fontWeight: 600, textDecoration: 'none' }}>
                Ver lead relacionado →
              </a>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
            <button
              onClick={() => handleDelete(selectedEvent.id)}
              disabled={deleting}
              style={{ ...secondaryBtn, color: '#dc2626', borderColor: '#fecaca', display: 'flex', alignItems: 'center', gap: 5 }}
            >
              {deleting ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Trash2 size={13} />}
              Eliminar
            </button>
            <button onClick={() => setModal(null)} style={primaryBtn}>Cerrar</button>
          </div>
        </ModalOverlay>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 520, padding: 24, boxShadow: '0 12px 48px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}
      >
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 13,
  fontFamily: 'Montserrat, sans-serif',
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
  background: '#fff',
}

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '9px 18px',
  background: 'var(--orange)', color: '#fff',
  border: 'none', borderRadius: 8,
  fontSize: 13, fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'Montserrat, sans-serif',
}

const secondaryBtn: React.CSSProperties = {
  padding: '9px 16px',
  background: 'transparent', color: 'var(--text-secondary)',
  border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 13, fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'Montserrat, sans-serif',
}
