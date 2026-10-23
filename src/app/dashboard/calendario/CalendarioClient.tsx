'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ArrowDownCircle, ArrowUpCircle, CalendarDays, CheckSquare, ChevronLeft, ChevronRight,
  DollarSign, Loader2, Phone, Plus, RefreshCw, Trash2, Users,
} from 'lucide-react'
import { formatMoney } from '@/lib/money'

export type Capa = 'google' | 'gestion' | 'campana' | 'tarea' | 'cobranza'

export interface EventoCRM {
  id: string
  capa: Exclude<Capa, 'google'>
  tipo: string
  fecha: string
  titulo: string
  sub: string | null
  href: string
  vendedor_id: string | null
  importe?: number
  moneda?: string
}

interface EventoGoogle {
  id: string
  summary: string
  description?: string
  start: string
  end: string
  colorId?: string
  crmLeadId?: string | null
  crmType?: string
  vendedor_id?: string
  vendedor?: string
}

/** Lo que se dibuja: un evento del CRM o uno de Google, ya en su día. */
type Item =
  | { origen: 'crm'; dia: string; hora: string; ev: EventoCRM }
  | { origen: 'google'; dia: string; hora: string; ev: EventoGoogle; propio: boolean }

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const CAPA: Record<Capa, { label: string; color: string; icon: React.ReactNode }> = {
  google:   { label: 'Reuniones y llamadas', color: '#2563eb', icon: <Users size={12} /> },
  gestion:  { label: 'Gestiones de leads',   color: '#7c3aed', icon: <Phone size={12} /> },
  campana:  { label: 'Campañas',             color: '#15803d', icon: <ArrowUpCircle size={12} /> },
  tarea:    { label: 'Tareas',               color: '#d97706', icon: <CheckSquare size={12} /> },
  cobranza: { label: 'Cobranzas',            color: '#c62828', icon: <DollarSign size={12} /> },
}

const TIPOS_EVENTO: Record<string, string> = {
  reunion: 'Reunión', llamada: 'Llamada', vencimiento: 'Vencimiento', recordatorio: 'Recordatorio', otro: 'Otro',
}

/** Un color por vendedor, para distinguirlos en la vista de equipo. */
const PALETA = ['#2563eb', '#0891b2', '#7c3aed', '#db2777', '#ea580c', '#65a30d', '#0d9488', '#9333ea']

const pad = (n: number) => String(n).padStart(2, '0')
const diaLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Día y hora de un evento de Google en la hora de quien mira. */
function ubicarGoogle(start: string): { dia: string; hora: string } {
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return { dia: start, hora: '' } // todo el día
  const d = new Date(start)
  if (isNaN(d.getTime())) return { dia: start.slice(0, 10), hora: '' }
  return { dia: diaLocal(d), hora: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}

const LS_CAPAS = 'calendario.capas'

export default function CalendarioClient({
  eventos, capas, encendidas, googleConectado, verEquipo, vendedores, leads, hoy,
}: {
  eventos: EventoCRM[]
  capas: Capa[]
  encendidas: Capa[]
  googleConectado: boolean
  verEquipo: boolean
  vendedores: { id: string; nombre: string }[]
  leads: { id: string; label: string }[]
  hoy: string
}) {
  const searchParams = useSearchParams()
  const leadPreseleccionado = searchParams.get('lead') ?? ''

  const [cursor, setCursor] = useState(() => ({ y: Number(hoy.slice(0, 4)), m: Number(hoy.slice(5, 7)) }))
  const [seleccionado, setSeleccionado] = useState<string>(hoy)
  const [activas, setActivas] = useState<Set<Capa>>(() => new Set(encendidas))
  const [vendedor, setVendedor] = useState('')
  const [equipo, setEquipo] = useState(verEquipo)

  const [propios, setPropios] = useState<EventoGoogle[]>([])
  const [delEquipo, setDelEquipo] = useState<EventoGoogle[]>([])
  const [sinConectar, setSinConectar] = useState<string[]>([])
  const [reconectar, setReconectar] = useState(false)
  const [cargando, setCargando] = useState(false)

  const [modal, setModal] = useState<{ tipo: 'nuevo'; dia: string } | { tipo: 'ver'; ev: EventoGoogle; propio: boolean } | null>(null)
  const [form, setForm] = useState({ summary: '', description: '', start: '', end: '', crmType: 'reunion', crmLeadId: '' })
  const [guardando, setGuardando] = useState(false)

  // Las capas elegidas se recuerdan en este navegador.
  useEffect(() => {
    try {
      const guardadas = JSON.parse(localStorage.getItem(LS_CAPAS) ?? 'null') as Capa[] | null
      if (Array.isArray(guardadas)) setActivas(new Set(guardadas.filter(c => capas.includes(c))))
    } catch { /* sin almacenamiento: quedan las de su rol */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function alternar(c: Capa) {
    setActivas(prev => {
      const s = new Set(prev)
      if (s.has(c)) s.delete(c); else s.add(c)
      try { localStorage.setItem(LS_CAPAS, JSON.stringify(Array.from(s))) } catch { /* no importa */ }
      return s
    })
  }

  const { y, m } = cursor
  const mesKey = `${y}-${pad(m)}`

  const cargarGoogle = useCallback(async () => {
    if (!capas.includes('google')) return
    const from = new Date(y, m - 1, 1)
    const to = new Date(y, m, 0, 23, 59, 59)
    const qs = `from=${from.toISOString()}&to=${to.toISOString()}`
    setCargando(true)
    try {
      const pedidos: Promise<void>[] = []
      if (googleConectado) {
        pedidos.push(fetch(`/api/calendar/events?${qs}`).then(async r => {
          if (r.status === 403) { setReconectar(true); return }
          if (r.ok) { setPropios(await r.json()); setReconectar(false) }
        }))
      }
      if (verEquipo && equipo) {
        pedidos.push(fetch(`/api/calendar/equipo?${qs}`).then(async r => {
          if (!r.ok) return
          const d = await r.json()
          setDelEquipo(d.eventos ?? [])
          setSinConectar([...(d.sin_conectar ?? []), ...(d.con_error ?? [])])
        }))
      } else {
        setDelEquipo([])
      }
      await Promise.all(pedidos)
    } finally { setCargando(false) }
  }, [capas, googleConectado, verEquipo, equipo, y, m])

  useEffect(() => { cargarGoogle() }, [cargarGoogle])

  // Viniendo de un lead ("Agendar"), se abre directo el evento nuevo.
  useEffect(() => {
    if (leadPreseleccionado && googleConectado) abrirNuevo(hoy, leadPreseleccionado)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const colorVendedor = useMemo(() => {
    const m = new Map<string, string>()
    vendedores.forEach((v, i) => m.set(v.id, PALETA[i % PALETA.length]))
    return m
  }, [vendedores])

  // Todo junto, filtrado por capas y vendedor, agrupado por día.
  const porDia = useMemo(() => {
    const items: Item[] = []
    for (const ev of eventos) {
      if (!activas.has(ev.capa)) continue
      if (vendedor && ev.vendedor_id && ev.vendedor_id !== vendedor) continue
      if (vendedor && !ev.vendedor_id && ev.capa !== 'tarea') continue
      items.push({ origen: 'crm', dia: ev.fecha, hora: '', ev })
    }
    if (activas.has('google')) {
      if (!vendedor) for (const ev of propios) items.push({ origen: 'google', ...ubicarGoogle(ev.start), ev, propio: true })
      for (const ev of delEquipo) {
        if (vendedor && ev.vendedor_id !== vendedor) continue
        items.push({ origen: 'google', ...ubicarGoogle(ev.start), ev, propio: false })
      }
    }
    const map = new Map<string, Item[]>()
    for (const it of items) {
      const l = map.get(it.dia) ?? []
      l.push(it)
      map.set(it.dia, l)
    }
    map.forEach(l => l.sort((a, b) => (a.hora || '99').localeCompare(b.hora || '99')))
    return map
  }, [eventos, activas, vendedor, propios, delEquipo])

  const conteo = useMemo(() => {
    const c: Record<Capa, number> = { google: 0, gestion: 0, campana: 0, tarea: 0, cobranza: 0 }
    porDia.forEach((items, dia) => {
      if (!dia.startsWith(mesKey)) return
      for (const it of items) c[it.origen === 'google' ? 'google' : it.ev.capa]++
    })
    return c
  }, [porDia, mesKey])

  const diasEnMes = new Date(y, m, 0).getDate()
  const primerDia = (new Date(y, m - 1, 1).getDay() + 6) % 7
  const celdas: (number | null)[] = [...Array(primerDia).fill(null), ...Array.from({ length: diasEnMes }, (_, i) => i + 1)]

  const mover = (d: number) => setCursor(c => {
    const t = new Date(c.y, c.m - 1 + d, 1)
    return { y: t.getFullYear(), m: t.getMonth() + 1 }
  })

  function abrirNuevo(dia: string, lead = '') {
    setForm({ summary: '', description: '', start: `${dia}T09:00`, end: `${dia}T10:00`, crmType: 'reunion', crmLeadId: lead })
    setModal({ tipo: 'nuevo', dia })
  }

  async function crear() {
    if (!form.summary.trim() || !form.start || !form.end) return
    setGuardando(true)
    try {
      const res = await fetch('/api/calendar/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, start: new Date(form.start).toISOString(), end: new Date(form.end).toISOString(), crmLeadId: form.crmLeadId || null }),
      })
      if (!res.ok) { alert('No se pudo crear el evento en Google Calendar'); return }
      const nuevo: EventoGoogle = await res.json()
      setPropios(prev => [...prev, nuevo])
      setModal(null)
    } finally { setGuardando(false) }
  }

  async function borrar(id: string) {
    if (!confirm('¿Eliminar este evento de Google Calendar?')) return
    setGuardando(true)
    try {
      await fetch(`/api/calendar/events/${id}`, { method: 'DELETE' })
      setPropios(prev => prev.filter(e => e.id !== id))
      setModal(null)
    } finally { setGuardando(false) }
  }

  const colorGoogle = (ev: EventoGoogle, propio: boolean) =>
    propio ? CAPA.google.color : (colorVendedor.get(ev.vendedor_id ?? '') ?? CAPA.google.color)

  const chip = (it: Item) => {
    if (it.origen === 'google') {
      const c = colorGoogle(it.ev, it.propio)
      const quien = it.propio ? '' : `${(it.ev.vendedor ?? '').split(' ')[0]} · `
      return { color: c, texto: `${it.hora ? it.hora + ' ' : ''}${quien}${it.ev.summary}` }
    }
    const c = it.ev.tipo === 'Baja' ? '#dc2626' : CAPA[it.ev.capa].color
    return { color: c, texto: `${it.ev.tipo}: ${it.ev.titulo}` }
  }

  const delDia = porDia.get(seleccionado) ?? []

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={() => mover(-1)} style={navBtn}><ChevronLeft size={16} /></button>
        <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', minWidth: 160, textAlign: 'center' }}>{MESES[m - 1]} {y}</span>
        <button onClick={() => mover(1)} style={navBtn}><ChevronRight size={16} /></button>
        <button onClick={() => { setCursor({ y: Number(hoy.slice(0, 4)), m: Number(hoy.slice(5, 7)) }); setSeleccionado(hoy) }} style={{ ...navBtn, width: 'auto', padding: '6px 12px', fontSize: 12, fontWeight: 600 }}>Hoy</button>
        <div style={{ flex: 1 }} />
        {verEquipo && (
          <select value={vendedor} onChange={e => setVendedor(e.target.value)} style={inp}>
            <option value="">Todo el equipo</option>
            {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
          </select>
        )}
        {capas.includes('google') && (
          <button onClick={cargarGoogle} title="Actualizar Google Calendar" style={navBtn}>
            {cargando ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
          </button>
        )}
        {capas.includes('google') && googleConectado && (
          <button onClick={() => abrirNuevo(seleccionado)} style={btnPrim}><Plus size={14} /> Nuevo evento</button>
        )}
      </div>

      {/* Capas */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {capas.map(c => {
          const on = activas.has(c)
          return (
            <button key={c} onClick={() => alternar(c)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 999,
              border: `1px solid ${on ? CAPA[c].color : 'var(--border)'}`, background: on ? CAPA[c].color + '14' : '#fff',
              color: on ? CAPA[c].color : 'var(--text-muted)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {CAPA[c].icon} {c === 'google' && verEquipo && equipo ? 'Reuniones del equipo' : CAPA[c].label}
              <span style={{ fontWeight: 600, opacity: 0.8 }}>{on ? conteo[c] : ''}</span>
            </button>
          )
        })}
        {verEquipo && activas.has('google') && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text-secondary)', marginLeft: 6 }}>
            <input type="checkbox" checked={equipo} onChange={e => setEquipo(e.target.checked)} style={{ accentColor: 'var(--orange)' }} />
            Incluir los calendarios del equipo
          </label>
        )}
      </div>

      {/* Avisos de Google */}
      {capas.includes('google') && activas.has('google') && (!googleConectado || reconectar) && (
        <div style={aviso}>
          {reconectar ? 'Tu conexión con Google necesita permiso de Calendar.' : 'Conectá tu Google para ver y crear tus reuniones acá.'}{' '}
          <a href={reconectar ? '/api/auth/google' : '/dashboard/perfil'} style={{ color: 'var(--orange)', fontWeight: 700 }}>
            {reconectar ? 'Reconectar' : 'Conectar Google'} →
          </a>
        </div>
      )}
      {verEquipo && equipo && activas.has('google') && sinConectar.length > 0 && (
        <div style={aviso}>
          Sin calendario conectado: <strong>{sinConectar.join(', ')}</strong>. Lo conectan una vez desde Mi Perfil.
        </div>
      )}

      <div className="cal-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 16, alignItems: 'start' }}>
        {/* Mes */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
            {DIAS.map(d => <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{d}</div>)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {celdas.map((d, i) => {
              if (d === null) return <div key={`v${i}`} style={{ minHeight: 96, borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', background: 'var(--bg-app)' }} />
              const dia = `${mesKey}-${pad(d)}`
              const items = porDia.get(dia) ?? []
              const esHoy = dia === hoy
              const sel = dia === seleccionado
              return (
                <div key={dia} onClick={() => setSeleccionado(dia)} style={{
                  minHeight: 96, padding: 5, cursor: 'pointer', overflow: 'hidden',
                  borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                  background: sel ? 'rgba(235,105,28,0.08)' : '#fff',
                }}>
                  <span style={{
                    fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: 20, height: 20, borderRadius: 6, marginBottom: 3,
                    color: esHoy ? '#fff' : 'var(--text-primary)', background: esHoy ? 'var(--orange)' : 'transparent',
                  }}>{d}</span>
                  {items.slice(0, 3).map((it, j) => {
                    const c = chip(it)
                    return (
                      <div key={j} title={c.texto} style={{
                        fontSize: 10, fontWeight: 600, color: '#fff', background: c.color, borderRadius: 4,
                        padding: '1px 5px', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{c.texto}</div>
                    )
                  })}
                  {items.length > 3 && <div style={{ fontSize: 10, color: 'var(--text-muted)', paddingLeft: 3 }}>+{items.length - 3} más</div>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Día */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, position: 'sticky', top: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {new Date(seleccionado + 'T12:00:00').toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long' })}
            </h3>
            {capas.includes('google') && googleConectado && (
              <button onClick={() => abrirNuevo(seleccionado)} title="Nuevo evento este día" style={{ ...navBtn, width: 28, height: 28 }}><Plus size={14} /></button>
            )}
          </div>
          {delDia.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Nada este día.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {delDia.map((it, j) => {
                if (it.origen === 'google') {
                  const c = colorGoogle(it.ev, it.propio)
                  return (
                    <button key={j} onClick={() => setModal({ tipo: 'ver', ev: it.ev, propio: it.propio })} style={{ ...tarjeta(c), textAlign: 'left', cursor: 'pointer', border: 'none', fontFamily: 'inherit', width: '100%' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: c }}>
                        {it.hora || 'Todo el día'} · {it.propio ? (TIPOS_EVENTO[it.ev.crmType ?? ''] ?? 'Google Calendar') : it.ev.vendedor}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{it.ev.summary}</div>
                    </button>
                  )
                }
                const ev = it.ev
                const c = ev.tipo === 'Baja' ? '#dc2626' : CAPA[ev.capa].color
                const icono = ev.tipo === 'Baja' ? <ArrowDownCircle size={12} /> : CAPA[ev.capa].icon
                return (
                  <Link key={j} href={ev.href} style={{ ...tarjeta(c), textDecoration: 'none', display: 'block' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: c, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {icono} {ev.tipo}{ev.importe != null ? ` · ${formatMoney(ev.importe, ev.moneda)}` : ''}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{ev.titulo}</div>
                    {ev.sub && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ev.sub}</div>}
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Nuevo evento */}
      {modal?.tipo === 'nuevo' && (
        <Modal onClose={() => setModal(null)}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarDays size={16} style={{ color: 'var(--orange)' }} /> Nuevo evento en tu Google Calendar
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Campo label="Título *">
              <input autoFocus value={form.summary} onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && crear()} placeholder="Reunión con cliente, llamada de seguimiento…" style={{ ...inp, width: '100%' }} />
            </Campo>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Campo label="Inicio *"><input type="datetime-local" value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} style={{ ...inp, width: '100%' }} /></Campo>
              <Campo label="Fin *"><input type="datetime-local" value={form.end} onChange={e => setForm(f => ({ ...f, end: e.target.value }))} style={{ ...inp, width: '100%' }} /></Campo>
            </div>
            <Campo label="Tipo">
              <select value={form.crmType} onChange={e => setForm(f => ({ ...f, crmType: e.target.value }))} style={{ ...inp, width: '100%' }}>
                {Object.entries(TIPOS_EVENTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            {leads.length > 0 && (
              <Campo label="Lead relacionado (opcional)">
                <select value={form.crmLeadId} onChange={e => setForm(f => ({ ...f, crmLeadId: e.target.value }))} style={{ ...inp, width: '100%' }}>
                  <option value="">— ninguno —</option>
                  {leads.map(l => <option key={l.id} value={l.id}>{l.label}</option>)}
                </select>
              </Campo>
            )}
            <Campo label="Notas (opcional)">
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} style={{ ...inp, width: '100%', resize: 'vertical' }} />
            </Campo>
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            <button onClick={() => setModal(null)} style={btnSec}>Cancelar</button>
            <button onClick={crear} disabled={guardando || !form.summary.trim()} style={{ ...btnPrim, opacity: guardando || !form.summary.trim() ? 0.6 : 1 }}>
              {guardando ? 'Guardando…' : <><Plus size={13} /> Crear</>}
            </button>
          </div>
        </Modal>
      )}

      {/* Ver evento de Google */}
      {modal?.tipo === 'ver' && (
        <Modal onClose={() => setModal(null)}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>{modal.ev.summary}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
            {modal.propio ? (TIPOS_EVENTO[modal.ev.crmType ?? ''] ?? 'Google Calendar') : `Calendario de ${modal.ev.vendedor}`}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div>{fmtRango(modal.ev.start, modal.ev.end)}</div>
            {modal.ev.description && <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{modal.ev.description}</div>}
            {modal.ev.crmLeadId && (
              <Link href={`/dashboard/leads/${modal.ev.crmLeadId}`} style={{ color: 'var(--orange)', fontWeight: 600, fontSize: 12, textDecoration: 'none' }}>Ver lead relacionado →</Link>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 18 }}>
            {modal.propio && (
              <button onClick={() => borrar(modal.ev.id)} disabled={guardando} style={{ ...btnSec, color: '#dc2626', borderColor: '#fecaca', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <Trash2 size={13} /> Eliminar
              </button>
            )}
            <button onClick={() => setModal(null)} style={btnPrim}>Cerrar</button>
          </div>
        </Modal>
      )}

      <style>{`
        .spin { animation: spin 1s linear infinite }
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @media (max-width: 900px) { .cal-grid { grid-template-columns: 1fr !important } }
      `}</style>
    </div>
  )
}

function fmtRango(start: string, end: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) return new Date(start + 'T12:00:00').toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · todo el día'
  const a = new Date(start), b = new Date(end)
  const dia = a.toLocaleDateString('es-UY', { weekday: 'long', day: 'numeric', month: 'long' })
  const h = (d: Date) => d.toLocaleTimeString('es-UY', { hour: '2-digit', minute: '2-digit' })
  return `${dia} · ${h(a)} a ${h(b)}`
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 500, padding: 22, maxHeight: '90vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

const tarjeta = (c: string): React.CSSProperties => ({ padding: '8px 10px', borderRadius: 8, background: c + '12', borderLeft: `3px solid ${c}` })
const navBtn: React.CSSProperties = {
  width: 32, height: 32, border: '1px solid var(--border)', borderRadius: 8, background: '#fff',
  cursor: 'pointer', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}
const inp: React.CSSProperties = { padding: '7px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'Montserrat, sans-serif', background: '#fff', boxSizing: 'border-box' }
const btnPrim: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--orange)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' }
const btnSec: React.CSSProperties = { padding: '8px 14px', background: '#fff', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' }
const aviso: React.CSSProperties = { fontSize: 12.5, color: 'var(--text-secondary)', background: 'rgba(235,105,28,0.07)', border: '1px solid rgba(235,105,28,0.25)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }
