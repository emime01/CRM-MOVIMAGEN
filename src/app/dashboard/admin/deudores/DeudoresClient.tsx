'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CalendarClock, DollarSign, Download, Phone, Plus, Search, X } from 'lucide-react'
import { formatMoney, formatTotales, type TotalPorMoneda } from '@/lib/money'
import { diasDeAtraso, tramoDe, TRAMO_LABEL, type Tramo } from '@/lib/ventas/cobranza'

export interface UltimaGestion {
  tipo: string
  nota: string | null
  created_at: string
  proxima_accion: string | null
}

export interface DeudorRow {
  /** Id de la factura. */
  id: string
  orden_id: string
  orden_numero: number | null
  agencia_id: string | null
  agencia: string | null
  cliente: string
  marca: string | null
  vendedor: string
  cuota: number
  cuotas_total: number
  mes_pauta: string
  tipo: 'factura' | 'nota_credito'
  numero: string | null
  fecha_emision: string | null
  importe: number
  moneda: string
  vencimiento: string | null
  promesa: string | null
  ultima_gestion: UltimaGestion | null
}

type Gestion = {
  id: string; tipo: string; nota: string | null; proxima_accion: string | null; created_at: string
  perfiles: { nombre: string | null } | { nombre: string | null }[] | null
}

const TIPO_LABEL: Record<string, string> = {
  llamada: 'Llamada', email: 'Mail', whatsapp: 'WhatsApp',
  visita: 'Visita', promesa_pago: 'Promesa de pago', otro: 'Otro',
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const SIN_AGENCIA = '__directo__'

const hoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** dd/mm/aaaa, como la planilla. Las fechas sin hora no pasan por Date. */
const fmtFecha = (s: string | null) => {
  if (!s) return '—'
  if (s.length <= 10) {
    const [y, m, d] = s.split('-')
    return `${Number(d)}/${Number(m)}/${y}`
  }
  return new Date(s).toLocaleDateString('es-UY', { day: 'numeric', month: 'numeric', year: 'numeric' })
}

/** La columna MES: el mes de la pauta y, si va en cuotas, cuál es. */
const mesDe = (r: DeudorRow) => {
  const mes = MESES[Number(r.mes_pauta.slice(5, 7)) - 1] ?? r.mes_pauta
  return r.cuotas_total > 1 ? `${mes} · ${r.cuota} de ${r.cuotas_total}` : mes
}

/** Colores de la columna VTO: rojo vencida, ámbar por vencer en la semana. */
function chip(atraso: number | null): { bg: string; fg: string; txt: string } {
  if (atraso == null) return { bg: 'rgba(110,106,98,0.12)', fg: '#6e6a62', txt: 'Sin vto.' }
  if (atraso > 0) return { bg: 'rgba(220,38,38,0.1)', fg: '#c62828', txt: `${atraso}` }
  if (atraso >= -7) return { bg: 'rgba(217,119,6,0.12)', fg: '#b26a00', txt: atraso === 0 ? 'Hoy' : `en ${-atraso}d` }
  return { bg: 'rgba(46,125,79,0.1)', fg: '#2e7d4f', txt: `en ${-atraso}d` }
}

type Modal =
  | { tipo: 'gestion'; r: DeudorRow }
  | { tipo: 'promesa'; r: DeudorRow }
  | { tipo: 'cobrar'; r: DeudorRow }

export default function DeudoresClient({ rows, puedeCobrar }: { rows: DeudorRow[]; puedeCobrar: boolean }) {
  const router = useRouter()

  const [buscar, setBuscar] = useState('')
  const [agencia, setAgencia] = useState('')
  const [vendedor, setVendedor] = useState('')
  const [tramo, setTramo] = useState<'' | Tramo | 'vencidas'>('')

  const [modal, setModal] = useState<Modal | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [historial, setHistorial] = useState<Gestion[] | null>(null)
  const [saving, setSaving] = useState(false)

  // El atraso se calcula acá, con la fecha del navegador (hora de Uruguay),
  // y no en el servidor, que corre en UTC.
  const conAtraso = useMemo(() => rows.map(r => ({ ...r, atraso: diasDeAtraso(r.vencimiento) })), [rows])

  const agencias = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of rows) if (r.agencia_id) m.set(r.agencia_id, r.agencia ?? '—')
    return Array.from(m, ([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [rows])
  const hayDirectas = rows.some(r => !r.agencia_id)
  const vendedores = useMemo(() => Array.from(new Set(rows.map(r => r.vendedor))).sort(), [rows])

  const visibles = useMemo(() => {
    const q = buscar.trim().toLowerCase()
    return conAtraso
      .filter(r => {
        if (agencia === SIN_AGENCIA ? r.agencia_id : agencia && r.agencia_id !== agencia) return false
        if (vendedor && r.vendedor !== vendedor) return false
        if (tramo === 'vencidas' && !((r.atraso ?? 0) > 0)) return false
        if (tramo && tramo !== 'vencidas' && tramoDe(r.atraso) !== tramo) return false
        if (q) {
          const texto = [r.cliente, r.agencia, r.marca, r.numero, r.orden_numero, r.vendedor].filter(Boolean).join(' ').toLowerCase()
          if (!texto.includes(q)) return false
        }
        return true
      })
      // Lo más atrasado arriba, como se trabaja la planilla.
      .sort((a, b) => (b.atraso ?? -9999) - (a.atraso ?? -9999))
  }, [conAtraso, buscar, agencia, vendedor, tramo])

  const totales = useMemo(() => {
    const deuda: TotalPorMoneda = {}
    const vencido: TotalPorMoneda = {}
    for (const r of visibles) {
      const m = r.moneda === 'USD' ? 'USD' : 'UYU'
      deuda[m] = (deuda[m] ?? 0) + r.importe
      if ((r.atraso ?? 0) > 0) vencido[m] = (vencido[m] ?? 0) + r.importe
    }
    return { deuda, vencido }
  }, [visibles])
  const promesasHoy = visibles.filter(r => r.promesa && r.promesa <= hoy()).length

  async function abrir(m: Modal) {
    setModal(m)
    setHistorial(null)
    if (m.tipo === 'gestion') {
      setForm({ tipo: 'email', nota: '', proxima: '' })
      const res = await fetch(`/api/cobranza?factura_id=${m.r.id}`)
      if (res.ok) setHistorial((await res.json()).gestiones ?? [])
    }
    if (m.tipo === 'promesa') setForm({ fecha: m.r.promesa ?? '', nota: '' })
    if (m.tipo === 'cobrar') setForm({ fecha: hoy(), metodo: '' })
  }

  async function guardar(quitarPromesa = false) {
    if (!modal) return
    setSaving(true)
    try {
      let res: Response
      if (modal.tipo === 'gestion') {
        res = await fetch('/api/cobranza', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            factura_id: modal.r.id, tipo: form.tipo,
            nota: form.nota.trim() || undefined, proxima_accion: form.proxima || undefined,
          }),
        })
      } else if (modal.tipo === 'promesa') {
        if (!quitarPromesa && !form.fecha) { alert('Indicá la fecha que prometió la agencia'); return }
        res = await fetch(`/api/facturas/${modal.r.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion: 'promesa', fecha_pago_prometida: quitarPromesa ? null : form.fecha, nota: form.nota }),
        })
      } else {
        res = await fetch(`/api/facturas/${modal.r.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion: 'cobrar', fecha: form.fecha, metodo: form.metodo }),
        })
      }
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error ?? 'No se pudo guardar'); return }
      setModal(null)
      router.refresh()
    } finally { setSaving(false) }
  }

  /** El detalle filtrado a Excel: lo que Belén le manda a la agencia. */
  async function exportar() {
    const xlsx = await import('xlsx')
    const datos = visibles.map(r => ({
      'Agencia': r.agencia ?? 'Directo',
      'Cliente': r.cliente,
      'Marca': r.marca ?? '',
      'Mes': mesDe(r),
      'Fecha': fmtFecha(r.fecha_emision),
      'Nº factura': r.numero ?? '',
      'Tipo': r.tipo === 'nota_credito' ? 'Nota de crédito' : 'Factura',
      'Moneda': r.moneda,
      'Importe': r.importe,
      'Vencimiento': fmtFecha(r.vencimiento),
      'Días de atraso': r.atraso != null && r.atraso > 0 ? r.atraso : 0,
      'Promesa de pago': r.promesa ? fmtFecha(r.promesa) : '',
      'Vendedor': r.vendedor,
    }))
    const ws = xlsx.utils.json_to_sheet(datos)
    ws['!cols'] = [22, 26, 18, 16, 12, 12, 14, 8, 14, 12, 10, 14, 18].map(wch => ({ wch }))
    const wb = xlsx.utils.book_new()
    xlsx.utils.book_append_sheet(wb, ws, 'Deudores')
    const nombreAgencia = agencia === SIN_AGENCIA ? 'directos' : agencias.find(a => a.id === agencia)?.nombre
    const archivo = `Deudores${nombreAgencia ? ` ${nombreAgencia}` : ''} ${hoy()}.xlsx`.replace(/[\\/:*?"<>|]/g, '')
    xlsx.writeFile(wb, archivo)
  }

  const filtrando = !!(buscar || agencia || vendedor || tramo)

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      {/* Totales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
        {[
          { label: 'Total adeudado', value: formatTotales(totales.deuda), color: 'var(--text-primary)' },
          { label: 'Vencido', value: formatTotales(totales.vencido), color: '#c62828' },
          { label: 'Facturas abiertas', value: String(visibles.length), color: 'var(--text-primary)' },
          { label: 'Promesas a revisar', value: String(promesasHoy), color: promesasHoy ? '#b26a00' : 'var(--text-primary)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 320 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Cliente, marca, Nº de factura…"
            style={{ ...inp, marginTop: 0, paddingLeft: 30 }} />
        </div>
        <select value={agencia} onChange={e => setAgencia(e.target.value)} style={{ ...inp, marginTop: 0, width: 'auto' }}>
          <option value="">Todas las agencias</option>
          {hayDirectas && <option value={SIN_AGENCIA}>Directo (sin agencia)</option>}
          {agencias.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        <select value={vendedor} onChange={e => setVendedor(e.target.value)} style={{ ...inp, marginTop: 0, width: 'auto' }}>
          <option value="">Todos los vendedores</option>
          {vendedores.map(v => <option key={v} value={v}>{v}</option>)}
        </select>
        <select value={tramo} onChange={e => setTramo(e.target.value as typeof tramo)} style={{ ...inp, marginTop: 0, width: 'auto' }}>
          <option value="">Todos los vencimientos</option>
          <option value="vencidas">Sólo vencidas</option>
          {(Object.keys(TRAMO_LABEL) as Tramo[]).map(t => <option key={t} value={t}>{TRAMO_LABEL[t]}</option>)}
        </select>
        {filtrando && (
          <button onClick={() => { setBuscar(''); setAgencia(''); setVendedor(''); setTramo('') }}
            style={{ ...btnSec, border: 'none', background: 'none' }}>Limpiar</button>
        )}
        <button onClick={exportar} disabled={visibles.length === 0} style={{ ...btnSec, marginLeft: 'auto' }}>
          <Download size={13} /> Exportar a Excel
        </button>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto' }}>
        {visibles.length === 0 ? (
          <p style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
            {rows.length === 0 ? 'No hay facturas emitidas sin cobrar.' : 'Ninguna factura coincide con el filtro.'}
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 1080 }}>
            <thead>
              <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
                {['Agencia', 'Cliente', 'Mes', 'Fecha', 'Nº factura', 'Importe', 'Vence', 'Atraso', 'Última gestión', ''].map((h, i) => (
                  <th key={h || i} style={{ padding: '10px 12px', textAlign: i === 5 ? 'right' : i === 7 ? 'center' : 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 10.5, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibles.map(r => {
                const c = chip(r.atraso)
                const nc = r.tipo === 'nota_credito'
                const g = r.ultima_gestion
                const promesaVencida = !!r.promesa && r.promesa <= hoy()
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={td}>{r.agencia ?? <span style={{ color: 'var(--text-muted)' }}>Directo</span>}</td>
                    <td style={td}>
                      <Link href={`/dashboard/ventas/${r.orden_id}`} style={{ color: 'var(--text-primary)', fontWeight: 700, textDecoration: 'none' }}>{r.cliente}</Link>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {[r.marca, r.orden_numero ? `OIC #${r.orden_numero}` : null, r.vendedor].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{mesDe(r)}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtFecha(r.fecha_emision)}</td>
                    <td style={{ ...td, fontFamily: 'monospace' }}>
                      {r.numero ?? '—'}
                      {nc && <div style={{ fontSize: 10, color: '#7c3aed', fontFamily: 'Montserrat, sans-serif', fontWeight: 700 }}>Nota de crédito</div>}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: nc ? '#7c3aed' : 'var(--text-primary)' }}>
                      {formatMoney(r.importe, r.moneda)}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtFecha(r.vencimiento)}</td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{ display: 'inline-block', minWidth: 38, background: c.bg, color: c.fg, padding: '2px 8px', borderRadius: 5, fontSize: 11.5, fontWeight: 700, fontFamily: 'monospace' }}>{c.txt}</span>
                    </td>
                    <td style={{ ...td, fontSize: 11.5, color: 'var(--text-muted)', maxWidth: 240 }}>
                      {r.promesa && (
                        <div style={{ color: promesaVencida ? '#c62828' : '#b26a00', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <CalendarClock size={12} /> Paga el {fmtFecha(r.promesa)}
                        </div>
                      )}
                      {g ? (
                        <div>
                          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{TIPO_LABEL[g.tipo] ?? g.tipo}</span>
                          {' '}{fmtFecha(g.created_at)}
                          {g.nota && <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={g.nota}>{g.nota}</div>}
                        </div>
                      ) : !r.promesa && '—'}
                    </td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <span style={{ display: 'inline-flex', gap: 4 }}>
                        <button onClick={() => abrir({ tipo: 'gestion', r })} style={btnSec} title="Registrar gestión"><Plus size={12} /> Gestión</button>
                        {puedeCobrar && !nc && (
                          <button onClick={() => abrir({ tipo: 'promesa', r })} style={btnSec} title="Promesa de pago"><CalendarClock size={12} /></button>
                        )}
                        {puedeCobrar && (
                          <button onClick={() => abrir({ tipo: 'cobrar', r })} style={{ ...btnSec, background: '#15803d', color: '#fff', border: 'none' }}>
                            <DollarSign size={12} /> {nc ? 'Aplicar' : 'Cobrar'}
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={() => setModal(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 460, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                {modal.tipo === 'gestion' && <><Phone size={16} style={{ color: 'var(--orange)' }} /> Gestión de cobranza</>}
                {modal.tipo === 'promesa' && <><CalendarClock size={16} style={{ color: 'var(--orange)' }} /> Promesa de pago</>}
                {modal.tipo === 'cobrar' && <><DollarSign size={16} style={{ color: '#15803d' }} /> {modal.r.tipo === 'nota_credito' ? 'Aplicar nota de crédito' : 'Registrar cobro'}</>}
              </h3>
              <button onClick={() => setModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9a9895', padding: 4 }}><X size={16} /></button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>
              {modal.r.agencia ? `${modal.r.agencia} · ` : ''}{modal.r.cliente} · Factura {modal.r.numero ?? '—'} · {formatMoney(modal.r.importe, modal.r.moneda)}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {modal.tipo === 'gestion' && (
                <>
                  <label style={lbl}>Tipo
                    <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} style={inp}>
                      {Object.entries(TIPO_LABEL).filter(([v]) => v !== 'promesa_pago').map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </label>
                  <label style={lbl}>Nota
                    <textarea value={form.nota} onChange={e => setForm(f => ({ ...f, nota: e.target.value }))} rows={3}
                      placeholder="Ej: Envié mail con el detalle a contaduría." style={{ ...inp, resize: 'vertical' }} />
                  </label>
                  <label style={lbl}>Volver a mirar el (opcional)
                    <input type="date" value={form.proxima} onChange={e => setForm(f => ({ ...f, proxima: e.target.value }))} style={inp} />
                  </label>
                  <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>
                    Si la agencia confirmó qué día paga, cargalo como promesa de pago: crea la tarea de seguimiento.
                  </p>
                </>
              )}

              {modal.tipo === 'promesa' && (
                <>
                  <label style={lbl}>Fecha en que la agencia dice que paga
                    <input type="date" value={form.fecha} min={hoy()} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} style={inp} />
                  </label>
                  <label style={lbl}>Nota (opcional)
                    <input value={form.nota} onChange={e => setForm(f => ({ ...f, nota: e.target.value }))} placeholder="Ej: Confirmó Laura por mail." style={inp} />
                  </label>
                  <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>
                    Se crea una tarea de Administración para ese día, en Tareas y en el Calendario. Cuando registres el cobro se cierra sola.
                  </p>
                </>
              )}

              {modal.tipo === 'cobrar' && (
                <>
                  <label style={lbl}>{modal.r.tipo === 'nota_credito' ? 'Fecha en que se aplicó' : 'Fecha en que entró el pago'}
                    <input type="date" value={form.fecha} max={hoy()} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} style={inp} />
                  </label>
                  <label style={lbl}>Medio (opcional)
                    <input value={form.metodo} onChange={e => setForm(f => ({ ...f, metodo: e.target.value }))} placeholder="Transferencia, cheque…" style={inp} />
                  </label>
                </>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              {modal.tipo === 'promesa' && modal.r.promesa && (
                <button onClick={() => guardar(true)} disabled={saving} style={{ ...btnSec, marginRight: 'auto', color: '#c62828' }}>Quitar promesa</button>
              )}
              <button onClick={() => setModal(null)} style={btnSec}>Cancelar</button>
              <button onClick={() => guardar()} disabled={saving}
                style={{ ...btnSec, border: 'none', background: modal.tipo === 'cobrar' ? '#15803d' : 'var(--orange)', color: '#fff', cursor: saving ? 'wait' : 'pointer' }}>
                {saving ? 'Guardando…' : modal.tipo === 'cobrar' ? 'Registrar cobro' : 'Guardar'}
              </button>
            </div>

            {modal.tipo === 'gestion' && (
              <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Historial de esta factura</div>
                {historial == null ? (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Cargando…</p>
                ) : historial.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Todavía no hay gestiones.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {historial.map(h => {
                      const quien = (Array.isArray(h.perfiles) ? h.perfiles[0] : h.perfiles)?.nombre
                      return (
                        <div key={h.id} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          <strong>{TIPO_LABEL[h.tipo] ?? h.tipo}</strong> · {fmtFecha(h.created_at)}{quien ? ` · ${quien}` : ''}
                          {h.proxima_accion && <span style={{ color: '#b26a00' }}> · {h.tipo === 'promesa_pago' ? 'paga el' : 'volver el'} {fmtFecha(h.proxima_accion)}</span>}
                          {h.nota && <div style={{ color: 'var(--text-muted)' }}>{h.nota}</div>}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const td: React.CSSProperties = { padding: '10px 12px', verticalAlign: 'top', color: 'var(--text-primary)' }
const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }
const inp: React.CSSProperties = {
  width: '100%', padding: '8px 10px', marginTop: 4, border: '1px solid var(--border)', borderRadius: 7,
  fontSize: 13, fontFamily: 'Montserrat, sans-serif', boxSizing: 'border-box', background: '#fff',
}
const btnSec: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7,
  border: '1px solid var(--border)', background: '#fff', color: 'var(--text-secondary)',
  fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'Montserrat, sans-serif',
}
