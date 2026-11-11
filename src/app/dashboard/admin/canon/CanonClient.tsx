'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Download, Edit2, Plus, Trash2 } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { avisar, confirmar as preguntar, pedir } from '@/components/ui/dialogos'

const IVA = 0.22
const fmtPct = (n: number) => `${Number(n).toLocaleString('es-UY', { maximumFractionDigits: 2 })}%`
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`
const mesHoy = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const moverMes = (mes: string, delta: number) => {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const hoy = () => new Date().toLocaleDateString('en-CA')

interface Shopping { id: string; nombre: string; porcentaje_canon: number; canon_minimo: number | null; activo: boolean }
interface Soporte { id: string; nombre: string; categoria: string; ubicacion: string | null }
interface Asignacion { soporte_id: string; shopping_id: string; peso: number }

interface Linea {
  factura_id: string; orden_id: string; orden_numero: number | null; numero: string | null; tipo: string
  cuota: number; cuotas_total: number; cliente: string; agencia: string | null; marca: string | null
  soportes: string[]; moneda: string; arrendamiento: number; pct_agencia: number; neto_agencia: number
  pct_canon: number; canon: number; reparto: number | null
  usd?: number | null; cotizacion?: number | null; cotizacion_provisoria?: boolean
  plan?: { cuota: number; cuotas: number; primer_mes: string } | null
  /** Viene de otro mes ('AAAA-MM'): se pasó a pagar acá. */
  diferida_de?: string
}
interface FilaMes {
  shopping: { id: string; nombre: string; porcentaje_canon: number; canon_minimo: number }
  lineas: Linea[]
  /** Líneas de este mes que se pasaron a otro. */
  diferidas?: (Linea & { mes_destino: string })[]
  variable: number; variable_usd: number; minimo: number; arrastre: number; diferido: number; a_pagar: number
  estado: 'abierto' | 'cerrado' | 'pagado'; fecha_pago: string | null; notas: string | null; recalculado: number | null
}

const ESTADO: Record<string, { bg: string; fg: string; label: string }> = {
  abierto: { bg: 'rgba(217,119,6,0.12)', fg: '#b26a00', label: 'Abierto' },
  cerrado: { bg: 'rgba(37,99,235,0.1)', fg: '#2563eb', label: 'Cerrado' },
  pagado:  { bg: 'rgba(21,128,61,0.12)', fg: '#15803d', label: 'Pagado' },
}

export default function CanonClient({ paga = true, configura = true }: {
  /** Registrar el pago del canon: Administración. La asistente prepara. */
  paga?: boolean
  /** Cambiar % de canon, mínimos y soportes de cada shopping. */
  configura?: boolean
} = {}) {
  const [tab, setTab] = useState<'mes' | 'shoppings'>('mes')

  // ── Liquidación del mes ──
  const [mes, setMes] = useState(mesHoy())
  const [filas, setFilas] = useState<FilaMes[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [errorMes, setErrorMes] = useState('')
  const [abierto, setAbierto] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  // El mes que se está mirando, para descartar respuestas viejas: al pasar
  // rápido de un mes a otro, la respuesta lenta del anterior pisaba la
  // pantalla y los botones cerraban o pagaban un mes con números ajenos.
  const mesVigente = useRef(mes)
  mesVigente.current = mes

  const cargarMes = useCallback(async () => {
    const pedido = mes
    setCargando(true); setErrorMes('')
    try {
      const res = await fetch(`/api/admin/canon-mensual?mes=${pedido}`)
      const d = await res.json()
      if (pedido !== mesVigente.current) return
      if (!res.ok) { setErrorMes(d.error ?? 'No se pudo calcular'); setFilas([]); return }
      setFilas(d.shoppings ?? [])
    } finally { if (pedido === mesVigente.current) setCargando(false) }
  }, [mes])

  useEffect(() => { if (tab === 'mes') cargarMes() }, [tab, cargarMes])

  async function accion(shoppingId: string, body: Record<string, unknown>, confirmar?: string) {
    if (confirmar && !await preguntar(confirmar)) return
    setOcupado(true)
    try {
      const res = await fetch('/api/admin/canon-mensual', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shopping_id: shoppingId, mes, ...body }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { avisar(d.error ?? 'No se pudo guardar'); return }
      await cargarMes()
    } finally { setOcupado(false) }
  }

  /** El informe de un shopping, para mandarle (logo, fecha, fórmulas, en pesos). */
  async function informe(f: FilaMes) {
    const { informeShoppingExcel } = await import('@/lib/canon/excel')
    await informeShoppingExcel({ shopping: f.shopping, lineas: f.lineas, minimo: f.minimo }, mes)
  }

  async function resumenExcel() {
    if (!filas) return
    const { resumenMesExcel } = await import('@/lib/canon/excel')
    await resumenMesExcel(filas.map(f => ({
      shopping: f.shopping.nombre, pct: f.shopping.porcentaje_canon, variable: f.variable, minimo: f.minimo,
      arrastre: f.arrastre, diferido: f.diferido, estado: ESTADO[f.estado].label, fecha_pago: f.fecha_pago,
    })), mes)
  }

  async function pasarLinea(f: FilaMes, l: Linea) {
    const destino = moverMes(mes, 1)
    if (!await preguntar(`¿Pasar la factura de ${l.cliente} (canon ${formatMoney(l.canon, 'UYU')}) a ${nombreMes(destino)}? Sale del informe de ${nombreMes(mes)} y entra en el de ${nombreMes(destino)}.`)) return
    await accion(f.shopping.id, { accion: 'diferir_linea', linea_id: l.factura_id, mes_destino: destino, mes_pauta: l.diferida_de })
  }

  async function devolverLinea(f: FilaMes, l: Linea, origen: string) {
    if (!await preguntar(`¿Devolver la factura de ${l.cliente} a ${nombreMes(origen)}?`)) return
    await accion(f.shopping.id, { accion: 'devolver_linea', linea_id: l.factura_id, mes: origen })
  }

  /** En cuántas cuotas se le paga al shopping el canon de una venta, y desde qué mes. */
  async function planCanon(l: Linea) {
    const actual = l.plan
    const n = await pedir(`OIC #${l.orden_numero ?? '—'} · ${l.cliente}\n\n¿En cuántas cuotas se paga el canon de esta venta? (vacío o 0: cuota por cuota, según la facturación)`, actual ? String(actual.cuotas) : '')
    if (n === null) return
    const cuotas = Number(n.trim() || 0)
    setOcupado(true)
    try {
      if (!cuotas) {
        const r = await fetch('/api/admin/canon-planes', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orden_id: l.orden_id }) })
        if (!r.ok) { const d = await r.json().catch(() => ({})); avisar(d.error ?? 'No se pudo guardar'); return }
      } else {
        if (!Number.isInteger(cuotas) || cuotas < 1 || cuotas > 36) { avisar('Poné un número de cuotas entre 1 y 36'); return }
        const primer = await pedir('Mes de la primera cuota (AAAA-MM)', actual ? actual.primer_mes.slice(0, 7) : mes)
        if (!primer) return
        const r = await fetch('/api/admin/canon-planes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orden_id: l.orden_id, cuotas, primer_mes: primer.trim() }) })
        if (!r.ok) { const d = await r.json().catch(() => ({})); avisar(d.error ?? 'No se pudo guardar'); return }
      }
      await cargarMes()
    } finally { setOcupado(false) }
  }

  // ── Configuración ──
  const [shoppings, setShoppings] = useState<Shopping[]>([])
  const [soportes, setSoportes] = useState<Soporte[]>([])
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([])
  const [loadingShoppings, setLoadingShoppings] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editShopping, setEditShopping] = useState<Shopping | null>(null)
  const [formNombre, setFormNombre] = useState('')
  const [formPct, setFormPct] = useState('')
  const [formMinimo, setFormMinimo] = useState('')
  const [formError, setFormError] = useState('')
  const [formSaving, setFormSaving] = useState(false)
  const [assigningShopping, setAssigningShopping] = useState<Shopping | null>(null)
  const [searchSoporte, setSearchSoporte] = useState('')

  useEffect(() => {
    if (tab !== 'shoppings') return
    fetch('/api/admin/canon-shoppings').then(r => r.json()).then(d => { setShoppings(Array.isArray(d) ? d : []); setLoadingShoppings(false) }).catch(() => setLoadingShoppings(false))
    fetch('/api/soportes?all=true').then(r => r.json()).then(d => setSoportes(Array.isArray(d?.soportes) ? d.soportes : [])).catch(() => {})
    fetch('/api/admin/canon-soportes').then(r => r.json()).then(d => setAsignaciones(d?.asignaciones ?? [])).catch(() => {})
  }, [tab])

  async function saveShopping() {
    if (!formNombre.trim()) { setFormError('El nombre es obligatorio'); return }
    setFormSaving(true); setFormError('')
    const datos = { nombre: formNombre.trim(), porcentaje_canon: parseFloat(formPct) || 0, canon_minimo: parseFloat(formMinimo) || 0 }
    try {
      if (editShopping) {
        const res = await fetch(`/api/admin/canon-shoppings/${editShopping.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos),
        })
        if (!res.ok) { setFormError('Error al guardar'); return }
        setShoppings(prev => prev.map(s => s.id === editShopping.id ? { ...s, ...datos } : s))
      } else {
        const res = await fetch('/api/admin/canon-shoppings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos),
        })
        if (!res.ok) { setFormError('Error al guardar'); return }
        const created = await res.json()
        setShoppings(prev => [...prev, created])
      }
      setShowForm(false); setEditShopping(null)
    } finally { setFormSaving(false) }
  }

  async function deleteShopping(id: string, nombre: string) {
    if (!await preguntar(`¿Eliminar shopping "${nombre}"? Los soportes asignados quedarán sin shopping. Si ya tiene canon liquidado, se desactiva y su historia se conserva.`)) return
    const res = await fetch(`/api/admin/canon-shoppings/${id}`, { method: 'DELETE' })
    if (!res.ok) { avisar('Error al eliminar'); return }
    setShoppings(prev => prev.filter(s => s.id !== id))
    setAsignaciones(prev => prev.filter(a => a.shopping_id !== id))
  }

  async function toggleSoporte(soporteId: string, shoppingId: string, asignado: boolean) {
    const res = await fetch('/api/admin/canon-soportes', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ soporte_id: soporteId, shopping_id: shoppingId, asignado }),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); avisar(d.error ?? 'No se pudo guardar'); return }
    setAsignaciones(prev => asignado
      ? [...prev, { soporte_id: soporteId, shopping_id: shoppingId, peso: 1 }]
      : prev.filter(a => !(a.soporte_id === soporteId && a.shopping_id === shoppingId)))
  }

  const tabBtn = (t: typeof tab): React.CSSProperties => ({
    padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: tab === t ? 700 : 500, fontFamily: 'Montserrat, sans-serif',
    background: tab === t ? 'var(--orange)' : 'transparent',
    color: tab === t ? '#fff' : 'var(--text-secondary)',
  })

  const filteredSoportes = soportes.filter(s =>
    !searchSoporte || s.nombre.toLowerCase().includes(searchSoporte.toLowerCase()) || (s.ubicacion ?? '').toLowerCase().includes(searchSoporte.toLowerCase())
  )
  const nombreShopping = (id: string) => shoppings.find(x => x.id === id)?.nombre ?? '?'

  const totalAPagar = (filas ?? []).reduce((s, f) => s + f.a_pagar, 0)

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, width: 'fit-content', marginBottom: 24 }}>
        <button style={tabBtn('mes')} onClick={() => setTab('mes')}>Liquidación mensual</button>
        <button style={tabBtn('shoppings')} onClick={() => setTab('shoppings')}>Configurar shoppings</button>
      </div>

      {/* ── LIQUIDACIÓN MENSUAL ── */}
      {tab === 'mes' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            <button onClick={() => setMes(moverMes(mes, -1))} style={btnIcon} title="Mes anterior"><ChevronLeft size={15} /></button>
            <input type="month" value={mes} onChange={e => e.target.value && setMes(e.target.value)} style={{ ...inputStyle, width: 160 }} />
            <button onClick={() => setMes(moverMes(mes, 1))} style={btnIcon} title="Mes siguiente"><ChevronRight size={15} /></button>
            <button onClick={resumenExcel} disabled={!filas?.length} style={{ ...btn, marginLeft: 'auto' }}><Download size={13} /> Resumen del mes</button>
          </div>

          {filas && filas.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 18 }}>
              {[
                { label: `A pagar en ${nombreMes(mes)}`, value: formatMoney(totalAPagar, 'UYU'), color: 'var(--orange)' },
                { label: 'Con IVA', value: formatMoney(totalAPagar * (1 + IVA), 'UYU'), color: 'var(--text-primary)' },
                { label: 'Shoppings pagados', value: `${filas.filter(f => f.estado === 'pagado').length} de ${filas.length}`, color: '#15803d' },
              ].map(k => (
                <div key={k.label} style={card}>
                  <div style={cardLabel}>{k.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
          )}

          {cargando && !filas ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Calculando…</p>
          ) : errorMes ? (
            <p style={{ color: '#c62828', fontSize: 13 }}>{errorMes}</p>
          ) : !filas?.length ? (
            <div style={{ ...card, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No hay shoppings activos. Configuralos en la otra pestaña.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: cargando ? 0.6 : 1 }}>
              {filas.map(f => {
                const e = ESTADO[f.estado]
                const ver = abierto === f.shopping.id
                const manda = f.minimo > f.variable ? 'mínimo' : 'variable'
                const desfasado = f.recalculado != null && Math.abs(f.recalculado - f.variable) >= 1
                return (
                  <div key={f.shopping.id} style={{ ...card, padding: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', flexWrap: 'wrap' }}>
                      <button onClick={() => setAbierto(ver ? null : f.shopping.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit' }}>
                        {ver ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                        <span style={{ fontWeight: 800, fontSize: 14.5, color: 'var(--text-primary)' }}>{f.shopping.nombre}</span>
                      </button>
                      <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{fmtPct(f.shopping.porcentaje_canon)} · {f.lineas.length} línea{f.lineas.length === 1 ? '' : 's'}</span>
                      <span style={{ background: e.bg, color: e.fg, borderRadius: 5, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                        {e.label}{f.fecha_pago ? ` ${f.fecha_pago.split('-').reverse().join('/')}` : ''}
                      </span>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 18, alignItems: 'baseline', flexWrap: 'wrap' }}>
                        <Dato label="Variable" valor={formatMoney(f.variable, 'UYU')} fuerte={manda === 'variable'} />
                        <Dato label="Mínimo" valor={f.minimo ? formatMoney(f.minimo, 'UYU') : '—'} fuerte={manda === 'mínimo'} />
                        {f.arrastre !== 0 && <Dato label="Del mes anterior (incl.)" valor={formatMoney(f.arrastre, 'UYU')} />}
                        {f.diferido !== 0 && <Dato label="Pasa al siguiente (no incl.)" valor={formatMoney(f.diferido, 'UYU')} />}
                        <Dato label="A pagar" valor={formatMoney(f.a_pagar, 'UYU')} grande />
                        <Dato label="Con IVA" valor={formatMoney(f.a_pagar * (1 + IVA), 'UYU')} />
                      </div>
                    </div>

                    {desfasado && (
                      <div style={{ padding: '0 18px 10px', fontSize: 11.5, color: '#b26a00' }}>
                        El mes está {f.estado}, pero con las cuotas de hoy el variable daría {formatMoney(f.recalculado!, 'UYU')}. Reabrilo si hay que corregirlo.
                      </div>
                    )}

                    {ver && (
                      <div style={{ borderTop: '1px solid var(--border)' }}>
                        {f.lineas.length === 0 && !f.diferidas?.length ? (
                          <p style={{ padding: 16, margin: 0, fontSize: 12.5, color: 'var(--text-muted)' }}>
                            No hay pauta en este shopping en {nombreMes(mes)}.{f.minimo ? ' Se paga el mínimo.' : ''}
                          </p>
                        ) : (
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 860 }}>
                              <thead><tr style={{ background: 'var(--bg-app)' }}>
                                {['Cliente', 'Soportes', 'Factura', 'Arrend. s/IVA', '% Ag.', 'Neto de Ag.', 'Canon', 'Cuotas de canon'].map((h, i) => (
                                  <th key={h} style={{ ...th, textAlign: i >= 3 && i <= 6 ? 'right' : 'left' }}>{h}</th>
                                ))}
                              </tr></thead>
                              <tbody>
                                {f.lineas.map((l, i) => (
                                  <tr key={l.factura_id + i} style={{ borderTop: '1px solid var(--border)', color: l.tipo === 'nota_credito' ? '#7c3aed' : undefined }}>
                                    <td style={td}>
                                      <Link href={`/dashboard/ventas/${l.orden_id}`} style={{ color: 'inherit', fontWeight: 600, textDecoration: 'none' }}>{l.cliente}</Link>
                                      {l.diferida_de && (
                                        <div style={{ marginTop: 2 }}>
                                          <span style={{ background: 'rgba(37,99,235,0.1)', color: '#2563eb', borderRadius: 5, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>Viene de {nombreMes(l.diferida_de)}</span>
                                          {f.estado === 'abierto' && <button disabled={ocupado} onClick={() => devolverLinea(f, l, l.diferida_de!)} style={{ ...btn, padding: '1px 7px', marginLeft: 6, fontSize: 10.5 }}>Devolver</button>}
                                        </div>
                                      )}
                                      <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{[l.agencia ?? 'Directo', l.marca, !l.plan && l.cuotas_total > 1 ? `cuota ${l.cuota} de ${l.cuotas_total}` : null].filter(Boolean).join(' · ')}</div>
                                    </td>
                                    <td style={{ ...td, fontSize: 11.5 }}>{l.soportes.join(', ') || '—'}{l.reparto && <span style={{ color: 'var(--text-muted)' }}> · circuito, 1/{l.reparto}</span>}</td>
                                    <td style={{ ...td, fontFamily: 'monospace' }}>{l.numero ?? <span style={{ color: 'var(--text-muted)', fontFamily: 'Montserrat' }}>sin emitir</span>}{l.tipo === 'nota_credito' && <div style={{ fontSize: 10, fontFamily: 'Montserrat', fontWeight: 700 }}>Nota de crédito</div>}</td>
                                    <td style={num}>
                                      {formatMoney(l.arrendamiento, 'UYU')}
                                      {l.usd != null && (
                                        <div style={{ fontSize: 10, color: l.cotizacion_provisoria ? '#b26a00' : 'var(--text-muted)' }}>
                                          {formatMoney(l.usd, 'USD')} × {l.cotizacion}{l.cotizacion_provisoria ? ' (BCU de hoy, provisoria)' : ''}
                                        </div>
                                      )}
                                    </td>
                                    <td style={num}>{l.pct_agencia ? fmtPct(l.pct_agencia) : '—'}</td>
                                    <td style={num}>{formatMoney(l.neto_agencia, 'UYU')}</td>
                                    <td style={{ ...num, fontWeight: 700 }}>{formatMoney(l.canon, 'UYU')}</td>
                                    <td style={td}>
                                      {l.plan
                                        ? <span style={{ fontSize: 11.5 }}>Cuota {l.plan.cuota} de {l.plan.cuotas}</span>
                                        : <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Según facturación</span>}
                                      {f.estado === 'abierto' && l.tipo !== 'nota_credito' && (
                                        <button disabled={ocupado} onClick={() => planCanon(l)} style={{ ...btn, padding: '3px 8px', marginLeft: 6, fontSize: 11 }}>Cambiar</button>
                                      )}
                                      {f.estado === 'abierto' && l.tipo !== 'nota_credito' && (
                                        <div style={{ marginTop: 4 }}>
                                          <button disabled={ocupado} onClick={() => pasarLinea(f, l)} style={{ ...btn, padding: '3px 8px', fontSize: 11 }}>Pasar al mes siguiente</button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {!!f.diferidas?.length && (
                          <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
                            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>Pasadas al mes siguiente</div>
                            {f.diferidas.map(l => (
                              <div key={l.factura_id} style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, padding: '3px 0', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 600 }}>{l.cliente}</span>
                                <span style={{ fontFamily: 'monospace' }}>{l.numero ?? 'sin emitir'}</span>
                                <span style={{ fontWeight: 700 }}>{formatMoney(l.canon, 'UYU')}</span>
                                <span style={{ color: 'var(--text-muted)' }}>→ {nombreMes(l.mes_destino)}</span>
                                {f.estado === 'abierto' && <button disabled={ocupado} onClick={() => devolverLinea(f, l, mes)} style={{ ...btn, padding: '2px 8px', fontSize: 11 }}>Devolver</button>}
                              </div>
                            ))}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--border)', background: 'var(--bg-app)', flexWrap: 'wrap', alignItems: 'center' }}>
                          <button onClick={() => informe(f)} style={btn}><Download size={13} /> Informe del shopping</button>
                          {f.estado === 'abierto' && (
                            <button disabled={ocupado} style={btn} onClick={() => accion(f.shopping.id, { accion: 'cerrar' }, `¿Cerrar el canon de ${f.shopping.nombre} de ${nombreMes(mes)}? Los números quedan fijos.`)}>Cerrar mes</button>
                          )}
                          {f.estado === 'cerrado' && (
                            <button disabled={ocupado} style={btn} onClick={() => accion(f.shopping.id, { accion: 'reabrir' })}>Reabrir</button>
                          )}
                          {!paga ? null : f.estado !== 'pagado' ? (
                            <button disabled={ocupado} style={{ ...btn, background: '#15803d', color: '#fff', border: 'none' }} onClick={async () => {
                              const fecha = await pedir('Fecha de pago (AAAA-MM-DD)', hoy())
                              if (fecha) accion(f.shopping.id, { accion: 'pagar', fecha_pago: fecha })
                            }}>Marcar pagado</button>
                          ) : (
                            <button disabled={ocupado} style={btn} onClick={() => accion(f.shopping.id, { accion: 'desmarcar_pago' }, '¿Desmarcar el pago?')}>Desmarcar pago</button>
                          )}
                          {f.notas && <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Nota: {f.notas}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 12 }}>
            Todo en pesos: lo facturado en dólares se pasa con la cotización de la factura (si todavía no se facturó, con la del BCU de hoy). Se liquida en el mes en que sale la pauta: cada cuota en su mes, salvo que la venta tenga sus propias cuotas de canon ("Cambiar" en cada línea). Por línea: arrendamiento sin IVA de los soportes del shopping × (1 − % de la agencia) × % de canon. La producción no entra; las notas de crédito restan; un circuito se reparte entre sus shoppings. Se paga el mayor entre el variable y el mínimo, Cada línea se puede pasar al mes siguiente: sale del informe de este mes y aparece, como una línea más, en el del mes en que se paga.
          </p>
        </>
      )}

      {/* ── CONFIGURAR SHOPPINGS ── */}
      {tab === 'shoppings' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              Cada shopping con su % de canon, su canon mínimo mensual y sus soportes. Un circuito se asigna a todos los shoppings que recorre y su canon se reparte en partes iguales.
            </p>
            {configura && <button
              onClick={() => { setShowForm(true); setEditShopping(null); setFormNombre(''); setFormPct(''); setFormMinimo(''); setFormError('') }}
              style={{ ...btn, background: 'var(--orange)', color: '#fff', border: 'none' }}
            >
              <Plus size={14} /> Nuevo shopping
            </button>}
          </div>

          {showForm && (
            <div style={{ ...card, marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 2, minWidth: 200 }}>
                  <label style={lbl}>Nombre del shopping</label>
                  <input value={formNombre} onChange={e => setFormNombre(e.target.value)} placeholder="Ej: Tres Cruces" style={inputStyle} />
                </div>
                <div style={{ flex: 1, minWidth: 110 }}>
                  <label style={lbl}>% Canon</label>
                  <input type="number" value={formPct} onChange={e => setFormPct(e.target.value)} placeholder="0.00" min={0} max={100} step={0.01} style={inputStyle} />
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label style={lbl}>Canon mínimo mensual ($, sin IVA)</label>
                  <input type="number" value={formMinimo} onChange={e => setFormMinimo(e.target.value)} placeholder="0" min={0} step={100} style={inputStyle} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={saveShopping} disabled={formSaving} style={{ ...btn, background: 'var(--orange)', color: '#fff', border: 'none' }}>
                    {formSaving ? 'Guardando...' : editShopping ? 'Actualizar' : 'Crear'}
                  </button>
                  <button onClick={() => { setShowForm(false); setEditShopping(null) }} style={btn}>Cancelar</button>
                </div>
              </div>
              {formError && <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626' }}>{formError}</div>}
            </div>
          )}

          {loadingShoppings ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Cargando...</p>
          ) : shoppings.length === 0 ? (
            <div style={{ ...card, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No hay shoppings configurados. Creá el primero.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {shoppings.map(sh => {
                const mios = new Set(asignaciones.filter(a => a.shopping_id === sh.id).map(a => a.soporte_id))
                const misSoportes = soportes.filter(s => mios.has(s.id))
                const isAssigning = assigningShopping?.id === sh.id
                return (
                  <div key={sh.id} style={{ ...card, padding: 0, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', gap: 10, flexWrap: 'wrap' }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{sh.nombre}</span>
                        <span style={{ marginLeft: 10, background: 'var(--orange-pale)', color: 'var(--orange)', fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>
                          {fmtPct(sh.porcentaje_canon)} canon
                        </span>
                        <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                          mínimo {sh.canon_minimo ? formatMoney(Number(sh.canon_minimo), 'UYU') : '—'} · {misSoportes.length} soporte{misSoportes.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      {configura && <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setAssigningShopping(isAssigning ? null : sh)}
                          style={{ ...btn, background: isAssigning ? 'var(--orange)' : '#fff', color: isAssigning ? '#fff' : 'var(--text-secondary)' }}>
                          {isAssigning ? 'Cerrar' : 'Asignar soportes'}
                        </button>
                        <button onClick={() => { setEditShopping(sh); setFormNombre(sh.nombre); setFormPct(String(sh.porcentaje_canon)); setFormMinimo(String(sh.canon_minimo ?? '')); setShowForm(true) }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 6, color: 'var(--text-muted)' }}><Edit2 size={14} /></button>
                        <button onClick={() => deleteShopping(sh.id, sh.nombre)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 6, color: '#c82f2f' }}><Trash2 size={14} /></button>
                      </div>}
                    </div>

                    {misSoportes.length > 0 && !isAssigning && (
                      <div style={{ padding: '0 18px 14px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {misSoportes.map(s => {
                          const otros = asignaciones.filter(a => a.soporte_id === s.id).length
                          return (
                            <span key={s.id} style={{ fontSize: 11, background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', color: 'var(--text-secondary)' }}>
                              {s.nombre}{otros > 1 ? ` · circuito (1/${otros})` : ''}
                            </span>
                          )
                        })}
                      </div>
                    )}

                    {isAssigning && (
                      <div style={{ borderTop: '1px solid var(--border)', padding: 16, background: 'var(--bg-app)' }}>
                        <input value={searchSoporte} onChange={e => setSearchSoporte(e.target.value)}
                          placeholder="Buscar soporte por nombre o ubicación..." style={{ ...inputStyle, maxWidth: 400, marginBottom: 10 }} />
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                          {filteredSoportes.map(s => {
                            const isAssigned = mios.has(s.id)
                            const otros = asignaciones.filter(a => a.soporte_id === s.id && a.shopping_id !== sh.id).map(a => nombreShopping(a.shopping_id))
                            return (
                              <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: isAssigned ? 'var(--orange-pale)' : '#fff', border: `1px solid ${isAssigned ? 'var(--orange)' : 'var(--border)'}`, borderRadius: 7, cursor: 'pointer' }}>
                                <input type="checkbox" checked={isAssigned} onChange={() => toggleSoporte(s.id, sh.id, !isAssigned)} style={{ accentColor: 'var(--orange)' }} />
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.nombre}</div>
                                  {s.ubicacion && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.ubicacion}</div>}
                                  {otros.length > 0 && <div style={{ fontSize: 10, color: '#b26a00' }}>También en: {otros.join(', ')}</div>}
                                </div>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Dato({ label, valor, fuerte, grande }: { label: string; valor: string; fuerte?: boolean; grande?: boolean }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{label}</div>
      <div style={{ fontSize: grande ? 15 : 13, fontWeight: grande || fuerte ? 800 : 600, color: grande ? 'var(--orange)' : 'var(--text-primary)', whiteSpace: 'nowrap' }}>{valor}</div>
    </div>
  )
}

const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }
const cardLabel: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 13, fontFamily: 'Montserrat, sans-serif', outline: 'none', boxSizing: 'border-box', background: '#fff',
}
const btn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', border: '1px solid var(--border)', borderRadius: 7,
  background: '#fff', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Montserrat, sans-serif', whiteSpace: 'nowrap',
}
const btnIcon: React.CSSProperties = { ...btn, padding: '7px 8px' }
const th: React.CSSProperties = { padding: '8px 12px', fontWeight: 700, color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '8px 12px', verticalAlign: 'top' }
const num: React.CSSProperties = { ...td, textAlign: 'right', whiteSpace: 'nowrap' }
