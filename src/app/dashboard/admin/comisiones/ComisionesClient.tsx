'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Download, Users } from 'lucide-react'
import { formatMoney, formatTotales, type TotalPorMoneda } from '@/lib/money'

export interface ComisionRow {
  id: string
  tipo: 'venta' | 'bono'
  vendedor_id: string
  vendedor: string
  compartida_con: string | null
  orden_id: string | null
  orden_numero: number | null
  agencia: string | null
  cliente: string | null
  marca: string | null
  cuatrimestre: string | null
  mes_pauta: string | null
  cuota: number | null
  cuotas_total: number | null
  fecha_cobro: string | null
  numero: string | null
  importe: number | null
  arrendamiento: number | null
  produccion: number | null
  base: number
  porcentaje: number
  comision: number
  moneda: string
  estado: string
}

export interface AgenciaRow {
  factura_id: string
  agencia_id: string
  agencia: string
  cliente: string
  orden_numero: number | null
  numero: string | null
  fecha_cobro: string | null
  moneda: string
  arrendamiento: number
  produccion: number
  pct_arrendamiento: number
  pct_produccion: number
  comision: number
}

export interface BonoRow {
  vendedor_id: string
  vendedor: string
  objetivo: number
  vendido: number
  bono: number | null
  moneda: string
  liquidado: string | null
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

const ESTADO: Record<string, { bg: string; fg: string; label: string }> = {
  pendiente: { bg: 'rgba(217,119,6,0.12)',  fg: '#b26a00', label: 'Pendiente' },
  liquidada: { bg: 'rgba(37,99,235,0.1)',   fg: '#2563eb', label: 'Liquidada' },
  pagada:    { bg: 'rgba(21,128,61,0.12)',  fg: '#15803d', label: 'Pagada' },
  cancelada: { bg: 'rgba(107,114,128,0.12)', fg: '#6b7280', label: 'Cancelada' },
}

const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`
const fmtFecha = (s: string | null) => {
  if (!s) return '—'
  const [y, m, d] = s.slice(0, 10).split('-')
  return `${Number(d)}/${Number(m)}/${y}`
}
const mesPauta = (r: ComisionRow) => {
  if (r.tipo === 'bono') return `Bono ${r.cuatrimestre ?? ''}`
  if (!r.mes_pauta) return '—'
  const mes = MESES[Number(r.mes_pauta.slice(5, 7)) - 1]
  return r.cuotas_total && r.cuotas_total > 1 ? `${mes} · ${r.cuota} de ${r.cuotas_total}` : mes
}
const moverMes = (mes: string, delta: number) => {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const sumar = (rows: { moneda: string }[], campo: (r: any) => number): TotalPorMoneda => {
  const out: TotalPorMoneda = {}
  for (const r of rows) {
    const m = r.moneda === 'USD' ? 'USD' : 'UYU'
    out[m] = (out[m] ?? 0) + campo(r)
  }
  return out
}

type Tab = 'liquidacion' | 'agencias' | 'bonos'

export default function ComisionesClient({
  mes, cuatrimestre, cuatrimestres, comisiones, agencias, bonos, administra,
}: {
  mes: string
  cuatrimestre: string
  cuatrimestres: string[]
  comisiones: ComisionRow[]
  agencias: AgenciaRow[]
  bonos: BonoRow[]
  administra: boolean
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('liquidacion')
  const [vendedor, setVendedor] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [editBono, setEditBono] = useState<{ vendedor_id: string; monto: string } | null>(null)

  const ir = (params: { mes?: string; q?: string }) => {
    const sp = new URLSearchParams({ mes: params.mes ?? mes, q: params.q ?? cuatrimestre })
    router.push(`/dashboard/admin/comisiones?${sp.toString()}`)
  }

  const vigentes = comisiones.filter(c => c.estado !== 'cancelada')
  const visibles = vendedor ? comisiones.filter(c => c.vendedor_id === vendedor) : comisiones

  // Resumen por vendedor, como el pie de la planilla.
  const porVendedor = useMemo(() => {
    const m = new Map<string, { id: string; nombre: string; filas: ComisionRow[] }>()
    for (const c of vigentes) {
      const v = m.get(c.vendedor_id) ?? { id: c.vendedor_id, nombre: c.vendedor, filas: [] }
      v.filas.push(c)
      m.set(c.vendedor_id, v)
    }
    return Array.from(m.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [vigentes])

  const porAgencia = useMemo(() => {
    const m = new Map<string, { nombre: string; filas: AgenciaRow[] }>()
    for (const a of agencias) {
      const g = m.get(a.agencia_id) ?? { nombre: a.agencia, filas: [] }
      g.filas.push(a)
      m.set(a.agencia_id, g)
    }
    return Array.from(m.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [agencias])

  async function llamar(url: string, init: RequestInit, confirmar?: string) {
    if (confirmar && !confirm(confirmar)) return
    setOcupado(true)
    try {
      const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { alert(d.error ?? 'No se pudo guardar'); return }
      router.refresh()
    } finally { setOcupado(false) }
  }

  const liquidar = (accion: 'liquidar' | 'pagar', vendedorId?: string, nombre?: string) => llamar(
    '/api/comisiones/liquidar',
    { method: 'POST', body: JSON.stringify({ mes, accion, vendedor_id: vendedorId }) },
    accion === 'liquidar'
      ? `¿Liquidar las comisiones pendientes de ${nombreMes(mes)}${nombre ? ` de ${nombre}` : ''}?`
      : `¿Marcar como pagadas las comisiones liquidadas de ${nombreMes(mes)}${nombre ? ` de ${nombre}` : ''}?`,
  )

  const cambiarEstado = (id: string, estado: string) =>
    llamar(`/api/comisiones/${id}`, { method: 'PATCH', body: JSON.stringify({ estado }) })

  async function exportar() {
    const xlsx = await import('xlsx')
    const datos = visibles.map(c => ({
      'Agencia': c.agencia ?? (c.tipo === 'bono' ? '' : 'Directo'),
      'Cliente': c.cliente ?? '',
      'Mes': mesPauta(c),
      'Fecha cobro': fmtFecha(c.fecha_cobro),
      'Nº factura': c.numero ?? '',
      'Moneda': c.moneda,
      'Importe': c.importe ?? '',
      'Venta sin IVA': c.arrendamiento ?? '',
      'Producción': c.produccion ?? '',
      'Vendedor': c.vendedor + (c.compartida_con ? ` (con ${c.compartida_con})` : ''),
      'Base': c.base,
      '%': c.tipo === 'bono' ? '' : c.porcentaje,
      'Comisión': c.comision,
      'Estado': ESTADO[c.estado]?.label ?? c.estado,
    }))
    const ws = xlsx.utils.json_to_sheet(datos)
    ws['!cols'] = [20, 24, 16, 12, 12, 8, 12, 14, 12, 26, 12, 6, 12, 11].map(wch => ({ wch }))
    const wb = xlsx.utils.book_new()
    xlsx.utils.book_append_sheet(wb, ws, 'Comisiones')
    const quien = vendedor ? ` ${porVendedor.find(v => v.id === vendedor)?.nombre ?? ''}` : ''
    xlsx.writeFile(wb, `Comisiones ${nombreMes(mes)}${quien}.xlsx`.replace(/[\\/:*?"<>|]/g, ''))
  }

  const tabBtn = (t: Tab, label: string) => (
    <button key={t} onClick={() => setTab(t)} style={{
      padding: '7px 14px', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
      fontFamily: 'Montserrat, sans-serif',
      background: tab === t ? '#fff' : 'transparent', color: tab === t ? '#1a1915' : '#6e6a62',
      boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
    }}>{label}</button>
  )

  const selectorMes = (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button onClick={() => ir({ mes: moverMes(mes, -1) })} style={btnIcon} title="Mes anterior"><ChevronLeft size={15} /></button>
      <input type="month" value={mes} onChange={e => e.target.value && ir({ mes: e.target.value })}
        style={{ ...inp, width: 150 }} />
      <button onClick={() => ir({ mes: moverMes(mes, 1) })} style={btnIcon} title="Mes siguiente"><ChevronRight size={15} /></button>
    </div>
  )

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'inline-flex', gap: 4, background: '#f4f3f0', borderRadius: 9, padding: 3 }}>
          {tabBtn('liquidacion', 'Liquidación del mes')}
          {tabBtn('agencias', 'Por agencia')}
          {tabBtn('bonos', 'Bonos por objetivo')}
        </div>
        {tab === 'bonos' ? (
          <select value={cuatrimestre} onChange={e => ir({ q: e.target.value })} style={{ ...inp, width: 'auto' }}>
            {cuatrimestres.map(q => <option key={q} value={q}>{q.replace('-', ' · ')}</option>)}
          </select>
        ) : selectorMes}
      </div>

      {tab === 'liquidacion' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 18 }}>
            {[
              { label: `Comisiones de ${nombreMes(mes)}`, value: formatTotales(sumar(vigentes, r => r.comision)), color: 'var(--text-primary)' },
              { label: 'Pendientes de liquidar', value: formatTotales(sumar(vigentes.filter(c => c.estado === 'pendiente'), r => r.comision)), color: '#b26a00' },
              { label: 'Liquidadas sin pagar', value: formatTotales(sumar(vigentes.filter(c => c.estado === 'liquidada'), r => r.comision)), color: '#2563eb' },
              { label: 'Pagadas', value: formatTotales(sumar(vigentes.filter(c => c.estado === 'pagada'), r => r.comision)), color: '#15803d' },
            ].map(s => (
              <div key={s.label} style={card}>
                <div style={cardLabel}>{s.label}</div>
                <div style={{ fontSize: 19, fontWeight: 800, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* Por vendedor */}
          <div style={{ ...card, padding: 0, marginBottom: 18, overflowX: 'auto' }}>
            <div style={cardHead}>
              Por vendedor
              {administra && vigentes.some(c => c.estado === 'pendiente') && (
                <button onClick={() => liquidar('liquidar')} disabled={ocupado} style={{ ...btn, marginLeft: 'auto', background: '#2563eb', color: '#fff', border: 'none' }}>
                  Liquidar todo el mes
                </button>
              )}
            </div>
            {porVendedor.length === 0 ? (
              <p style={empty}>No hay comisiones con cobros en {nombreMes(mes)}.</p>
            ) : (
              <table style={tabla}>
                <thead><tr style={thRow}>{['Vendedor', 'Facturas', 'Base', 'Comisión', 'Estado', ''].map((h, i) => <th key={h || i} style={{ ...th, textAlign: i >= 1 && i <= 3 ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {porVendedor.map(v => {
                    const pend = v.filas.filter(f => f.estado === 'pendiente').length
                    const liq = v.filas.filter(f => f.estado === 'liquidada').length
                    return (
                      <tr key={v.id} style={tr}>
                        <td style={{ ...td, fontWeight: 700 }}>
                          <button onClick={() => setVendedor(vendedor === v.id ? '' : v.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit', fontSize: 'inherit', color: vendedor === v.id ? 'var(--orange)' : 'var(--text-primary)' }}>
                            {v.nombre}
                          </button>
                        </td>
                        <td style={{ ...td, textAlign: 'right' }}>{v.filas.length}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{formatTotales(sumar(v.filas, r => r.base))}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{formatTotales(sumar(v.filas, r => r.comision))}</td>
                        <td style={{ ...td, fontSize: 11.5, color: 'var(--text-muted)' }}>
                          {pend ? `${pend} pendiente${pend > 1 ? 's' : ''}` : liq ? `${liq} sin pagar` : 'Pagado'}
                        </td>
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {administra && pend > 0 && <button onClick={() => liquidar('liquidar', v.id, v.nombre)} disabled={ocupado} style={btn}>Liquidar</button>}
                          {administra && pend === 0 && liq > 0 && <button onClick={() => liquidar('pagar', v.id, v.nombre)} disabled={ocupado} style={{ ...btn, background: '#15803d', color: '#fff', border: 'none' }}>Marcar pagado</button>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Detalle: las columnas de la planilla */}
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <div style={cardHead}>
              Detalle {vendedor && <span style={{ color: 'var(--orange)' }}>· {porVendedor.find(v => v.id === vendedor)?.nombre}</span>}
              {vendedor && <button onClick={() => setVendedor('')} style={{ ...btn, border: 'none', background: 'none' }}>Ver todos</button>}
              <button onClick={exportar} disabled={visibles.length === 0} style={{ ...btn, marginLeft: 'auto' }}><Download size={13} /> Exportar a Excel</button>
            </div>
            {visibles.length === 0 ? (
              <p style={empty}>Sin comisiones.</p>
            ) : (
              <table style={{ ...tabla, minWidth: 1100 }}>
                <thead><tr style={thRow}>
                  {['Agencia', 'Cliente', 'Mes', 'Cobro', 'Nº factura', 'Importe', 'Venta s/IVA', 'Producción', 'Vendedor', 'Comisión', 'Estado'].map((h, i) => (
                    <th key={h} style={{ ...th, textAlign: i >= 5 && i <= 7 || i === 9 ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {visibles.map(c => {
                    const e = ESTADO[c.estado] ?? ESTADO.pendiente
                    return (
                      <tr key={c.id} style={{ ...tr, opacity: c.estado === 'cancelada' ? 0.5 : 1 }}>
                        <td style={td}>{c.agencia ?? (c.tipo === 'bono' ? '—' : <span style={{ color: 'var(--text-muted)' }}>Directo</span>)}</td>
                        <td style={td}>
                          {c.orden_id
                            ? <Link href={`/dashboard/ventas/${c.orden_id}`} style={{ color: 'var(--text-primary)', fontWeight: 600, textDecoration: 'none' }}>{c.cliente ?? '—'}</Link>
                            : <span style={{ fontWeight: 600 }}>{c.tipo === 'bono' ? 'Bono por objetivo' : '—'}</span>}
                          {c.marca && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.marca}</div>}
                        </td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{mesPauta(c)}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtFecha(c.fecha_cobro)}</td>
                        <td style={{ ...td, fontFamily: 'monospace' }}>{c.numero ?? '—'}</td>
                        <td style={num}>{c.importe != null ? formatMoney(c.importe, c.moneda) : '—'}</td>
                        <td style={num}>{c.arrendamiento != null ? formatMoney(c.arrendamiento, c.moneda) : '—'}</td>
                        <td style={num}>{c.produccion ? formatMoney(c.produccion, c.moneda) : '—'}</td>
                        <td style={td}>
                          {c.vendedor}
                          {c.compartida_con && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                              <Users size={11} /> mitad, con {c.compartida_con}
                            </div>
                          )}
                        </td>
                        <td style={{ ...num, fontWeight: 800 }}>
                          {formatMoney(c.comision, c.moneda)}
                          {c.tipo === 'venta' && <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontWeight: 500 }}>{c.porcentaje.toLocaleString('es-UY')}% de {formatMoney(c.base, c.moneda)}</div>}
                        </td>
                        <td style={td}>
                          {administra ? (
                            <select value={c.estado} disabled={ocupado} onChange={ev => cambiarEstado(c.id, ev.target.value)}
                              style={{ background: e.bg, color: e.fg, border: 'none', borderRadius: 5, padding: '3px 6px', fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer' }}>
                              {Object.entries(ESTADO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          ) : (
                            <span style={{ background: e.bg, color: e.fg, borderRadius: 5, padding: '3px 8px', fontSize: 11, fontWeight: 700 }}>{e.label}</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
          <p style={nota}>
            La comisión se genera al registrar el cobro de cada factura: 6,75% del arrendamiento sin IVA, en el mes del cobro. La producción no comisiona. Una venta compartida se reparte mitad y mitad.
          </p>
        </>
      )}

      {tab === 'agencias' && (
        <>
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <div style={cardHead}>Comisión de agencias · facturas cobradas en {nombreMes(mes)}</div>
            {porAgencia.length === 0 ? (
              <p style={empty}>No hubo cobros de ventas con agencia en {nombreMes(mes)}.</p>
            ) : (
              <table style={{ ...tabla, minWidth: 860 }}>
                <thead><tr style={thRow}>
                  {['Agencia / cliente', 'Nº factura', 'Cobro', 'Arrend. s/IVA', '% arr.', 'Producción', '% prod.', 'Comisión'].map((h, i) => (
                    <th key={h} style={{ ...th, textAlign: i >= 3 ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {porAgencia.map(g => (
                    <AgenciaGrupo key={g.nombre} nombre={g.nombre} filas={g.filas} />
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <p style={nota}>
            Sólo para consulta: es lo que le corresponde a cada agencia según el porcentaje pactado en cada venta (sobre el arrendamiento y, si se pactó, sobre la producción).
          </p>
        </>
      )}

      {tab === 'bonos' && (
        <>
          <div style={{ ...card, padding: 0, overflowX: 'auto' }}>
            <div style={cardHead}>Bonos por objetivo · {cuatrimestre.replace('-', ' · ')}</div>
            {bonos.length === 0 ? (
              <p style={empty}>No hay vendedores.</p>
            ) : (
              <table style={{ ...tabla, minWidth: 760 }}>
                <thead><tr style={thRow}>
                  {['Vendedor', 'Objetivo', 'Vendido', 'Avance', 'Bono', ''].map((h, i) => (
                    <th key={h || i} style={{ ...th, textAlign: i >= 1 && i <= 4 ? 'right' : 'left' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {bonos.map(b => {
                    const avance = b.objetivo > 0 ? b.vendido / b.objetivo * 100 : 0
                    const llego = b.objetivo > 0 && b.vendido >= b.objetivo
                    const editando = editBono?.vendedor_id === b.vendedor_id
                    return (
                      <tr key={b.vendedor_id} style={tr}>
                        <td style={{ ...td, fontWeight: 700 }}>{b.vendedor}</td>
                        <td style={num}>{b.objetivo ? formatMoney(b.objetivo, 'UYU') : '—'}</td>
                        <td style={num}>{formatMoney(b.vendido, 'UYU')}</td>
                        <td style={{ ...num, fontWeight: 700, color: llego ? '#15803d' : 'var(--text-secondary)' }}>
                          {b.objetivo ? `${Math.round(avance)}%` : '—'}
                        </td>
                        <td style={num}>
                          {editando ? (
                            <input type="number" min={0} step="100" autoFocus value={editBono.monto}
                              onChange={e => setEditBono({ vendedor_id: b.vendedor_id, monto: e.target.value })}
                              style={{ ...inp, width: 110, textAlign: 'right' }} />
                          ) : b.bono != null ? formatMoney(b.bono, b.moneda) : <span style={{ color: 'var(--text-muted)' }}>Sin bono</span>}
                        </td>
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {editando ? (
                            <>
                              <button disabled={ocupado} onClick={async () => {
                                await llamar('/api/comisiones/bonos', { method: 'PUT', body: JSON.stringify({ vendedor_id: b.vendedor_id, cuatrimestre, monto: editBono.monto || null }) })
                                setEditBono(null)
                              }} style={{ ...btn, background: 'var(--orange)', color: '#fff', border: 'none' }}>Guardar</button>
                              <button onClick={() => setEditBono(null)} style={{ ...btn, border: 'none', background: 'none' }}>Cancelar</button>
                            </>
                          ) : b.liquidado ? (
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: ESTADO[b.liquidado]?.fg }}>Bono {ESTADO[b.liquidado]?.label.toLowerCase()}</span>
                          ) : (
                            <>
                              <button onClick={() => setEditBono({ vendedor_id: b.vendedor_id, monto: b.bono != null ? String(b.bono) : '' })} style={btn}>
                                {b.bono != null ? 'Cambiar bono' : 'Asignar bono'}
                              </button>
                              {administra && b.bono != null && llego && (
                                <button disabled={ocupado} onClick={() => llamar('/api/comisiones/bonos', { method: 'POST', body: JSON.stringify({ vendedor_id: b.vendedor_id, cuatrimestre }) },
                                  `¿Liquidar el bono de ${b.vendedor}? Entra en las comisiones de este mes.`)}
                                  style={{ ...btn, marginLeft: 4, background: '#15803d', color: '#fff', border: 'none' }}>Liquidar bono</button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
          <p style={nota}>
            El bono es opcional: se le asigna a quien lo tenga. Se puede liquidar cuando lo vendido en el cuatrimestre llega al objetivo, y entra en las comisiones del mes en que se liquida. Lo vendido se mide como en el Dashboard (ventas aprobadas, en pesos); una venta compartida suma la mitad para cada uno.
          </p>
        </>
      )}
    </div>
  )
}

function AgenciaGrupo({ nombre, filas }: { nombre: string; filas: AgenciaRow[] }) {
  const total = sumar(filas, r => r.comision)
  return (
    <>
      <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
        <td colSpan={7} style={{ ...td, fontWeight: 800 }}>{nombre}</td>
        <td style={{ ...num, fontWeight: 800 }}>{formatTotales(total)}</td>
      </tr>
      {filas.map(f => (
        <tr key={f.factura_id} style={tr}>
          <td style={{ ...td, paddingLeft: 24 }}>{f.cliente}{f.orden_numero ? <span style={{ color: 'var(--text-muted)', fontSize: 11 }}> · OIC #{f.orden_numero}</span> : null}</td>
          <td style={{ ...td, fontFamily: 'monospace' }}>{f.numero ?? '—'}</td>
          <td style={td}>{fmtFecha(f.fecha_cobro)}</td>
          <td style={num}>{formatMoney(f.arrendamiento, f.moneda)}</td>
          <td style={num}>{f.pct_arrendamiento ? `${f.pct_arrendamiento}%` : '—'}</td>
          <td style={num}>{f.produccion ? formatMoney(f.produccion, f.moneda) : '—'}</td>
          <td style={num}>{f.pct_produccion ? `${f.pct_produccion}%` : '—'}</td>
          <td style={{ ...num, fontWeight: 700 }}>{formatMoney(f.comision, f.moneda)}</td>
        </tr>
      ))}
    </>
  )
}

const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }
const cardLabel: React.CSSProperties = { fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }
const cardHead: React.CSSProperties = { padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
const empty: React.CSSProperties = { padding: 20, color: 'var(--text-muted)', fontSize: 13, margin: 0 }
const nota: React.CSSProperties = { fontSize: 11.5, color: 'var(--text-muted)', marginTop: 10 }
const tabla: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }
const thRow: React.CSSProperties = { background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }
const th: React.CSSProperties = { padding: '9px 12px', fontWeight: 700, color: 'var(--text-muted)', fontSize: 10.5, textTransform: 'uppercase', whiteSpace: 'nowrap' }
const tr: React.CSSProperties = { borderBottom: '1px solid var(--border)' }
const td: React.CSSProperties = { padding: '9px 12px', verticalAlign: 'top', color: 'var(--text-primary)' }
const num: React.CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap' }
const inp: React.CSSProperties = { padding: '6px 9px', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, fontFamily: 'Montserrat, sans-serif', boxSizing: 'border-box', background: '#fff' }
const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 7,
  border: '1px solid var(--border)', background: '#fff', color: 'var(--text-secondary)',
  fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'Montserrat, sans-serif',
}
const btnIcon: React.CSSProperties = { ...btn, padding: '6px 7px' }
