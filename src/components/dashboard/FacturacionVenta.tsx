'use client'

import { useCallback, useEffect, useState } from 'react'
import { Receipt, DollarSign, Printer, X, FileMinus, RefreshCw, Pencil } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import type { Factura } from '@/lib/ventas/facturas'
import { hoyUY } from '@/lib/fechas'

/**
 * Facturación de una venta, cuota por cuota.
 *
 * Reemplaza los botones "Marcar facturada" y "Registrar cobro" de la venta
 * entera: con cuotas, cada factura tiene su número, su vencimiento y su cobro,
 * como en la planilla de deudores de Administración ("1 DE 2", "5 DE 12").
 */

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre']
const hoy = () => hoyUY()

function fmtFecha(d: string | null) {
  if (!d) return '—'
  const [y, m, day] = d.slice(0, 10).split('-')
  return `${day}/${m}/${y}`
}
function fmtMes(d: string) {
  const [y, m] = d.slice(0, 10).split('-').map(Number)
  return `${MESES[m - 1]} ${y}`
}
function diasDeAtraso(vto: string | null): number {
  if (!vto) return 0
  const a = new Date(vto + 'T00:00:00').getTime()
  const b = new Date(hoy() + 'T00:00:00').getTime()
  return Math.floor((b - a) / 86400000)
}

const ESTADO: Record<Factura['estado'], { label: string; bg: string; color: string }> = {
  prevista: { label: 'Prevista', bg: '#f1f0ec', color: '#6e6a62' },
  emitida:  { label: 'Emitida',  bg: '#eff6ff', color: '#1d4ed8' },
  cobrada:  { label: 'Cobrada',  bg: '#ecfdf3', color: '#15803d' },
  anulada:  { label: 'Anulada',  bg: '#fafafa', color: '#9a9895' },
}

type Modal =
  | { tipo: 'emitir'; f: Factura }
  | { tipo: 'cobrar'; f: Factura }
  | { tipo: 'editar'; f: Factura }
  | { tipo: 'anular'; f: Factura }
  | { tipo: 'nota_credito' }
  | null

const inputSt: React.CSSProperties = {
  width: '100%', padding: 9, marginTop: 4, border: '1px solid var(--border)', borderRadius: 7,
  fontSize: 13, fontFamily: 'Montserrat, sans-serif', boxSizing: 'border-box',
}
const lblSt: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }
const btn = (bg: string, color = '#fff'): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7,
  border: bg === '#fff' ? '1px solid var(--border)' : 'none', background: bg, color,
  fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Montserrat, sans-serif', whiteSpace: 'nowrap',
})

export default function FacturacionVenta({
  ordenId, moneda, montoTotal, aprobada, onImprimir,
}: {
  ordenId: string
  moneda: string
  montoTotal: number | null
  /** Antes de la aprobación del gerente no se factura. */
  aprobada: boolean
  onImprimir: (f: Factura) => void
}) {
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [condicion, setCondicion] = useState<number>(60)
  const [puedePlanificar, setPuedePlanificar] = useState(false)
  const [puedeAdministrar, setPuedeAdministrar] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [modal, setModal] = useState<Modal>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [cuotasPlan, setCuotasPlan] = useState('1')
  const [condicionEdit, setCondicionEdit] = useState('60')

  const cargar = useCallback(async () => {
    setError(null)
    const res = await fetch(`/api/ordenes/${ordenId}/facturas`)
    const data = await res.json().catch(() => null)
    if (!res.ok) { setError(data?.error ?? 'No se pudieron cargar las facturas'); setCargando(false); return }
    setFacturas(data.facturas ?? [])
    setCondicion(data.condicion_pago_dias ?? 60)
    setCondicionEdit(String(data.condicion_pago_dias ?? 60))
    setPuedePlanificar(!!data.puede_planificar)
    setPuedeAdministrar(!!data.puede_administrar)
    const total = (data.facturas ?? []).find((f: Factura) => f.tipo === 'factura')?.cuotas_total ?? 1
    setCuotasPlan(String(total))
    setCargando(false)
  }, [ordenId])

  useEffect(() => { cargar() }, [cargar])

  /** Llama a la API, muestra el error si lo hay y recarga. */
  async function enviar(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<boolean> {
    if (ocupado) return false
    setOcupado(true)
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json().catch(() => null)
      if (!res.ok) { alert(data?.error ?? 'No se pudo completar la operación'); return false }
      await cargar()
      return true
    } finally {
      setOcupado(false)
    }
  }

  function abrir(m: Modal) {
    setModal(m)
    if (!m) return
    if (m.tipo === 'emitir') setForm({ numero: '', fecha: hoy(), total: String(m.f.importe_total) })
    if (m.tipo === 'cobrar') setForm({ fecha: hoy(), metodo: '' })
    if (m.tipo === 'anular') setForm({ motivo: '' })
    if (m.tipo === 'editar') setForm({
      mes: m.f.mes_pauta.slice(0, 7),
      arr: String(m.f.importe_arrendamiento),
      prod: String(m.f.importe_produccion),
      total: String(m.f.importe_total),
      vto: m.f.fecha_vencimiento ?? '',
    })
    if (m.tipo === 'nota_credito') setForm({ numero: '', fecha: hoy(), total: '', arr: '', prod: '0', notas: '' })
  }

  async function confirmar() {
    if (!modal) return
    let ok = false
    if (modal.tipo === 'emitir') {
      if (!form.numero.trim()) { alert('Indicá el número de factura'); return }
      ok = await enviar(`/api/facturas/${modal.f.id}`, 'PATCH', {
        accion: 'emitir', numero: form.numero.trim(), fecha_emision: form.fecha,
        ...(Number(form.total) !== Number(modal.f.importe_total) ? { importe_total: Number(form.total) } : {}),
      })
    } else if (modal.tipo === 'cobrar') {
      ok = await enviar(`/api/facturas/${modal.f.id}`, 'PATCH', { accion: 'cobrar', fecha: form.fecha, metodo: form.metodo })
    } else if (modal.tipo === 'anular') {
      ok = await enviar(`/api/facturas/${modal.f.id}`, 'PATCH', { accion: 'anular', motivo: form.motivo })
    } else if (modal.tipo === 'editar') {
      const body: Record<string, unknown> = { accion: 'editar' }
      if (modal.f.estado === 'prevista') {
        body.mes_pauta = `${form.mes}-01`
        body.importe_arrendamiento = Number(form.arr)
        body.importe_produccion = Number(form.prod)
        body.importe_total = Number(form.total)
      } else {
        body.mes_pauta = `${form.mes}-01`
        if (form.vto) body.fecha_vencimiento = form.vto
      }
      ok = await enviar(`/api/facturas/${modal.f.id}`, 'PATCH', body)
    } else if (modal.tipo === 'nota_credito') {
      if (!form.numero.trim() || !Number(form.total)) { alert('Indicá el número y el importe'); return }
      ok = await enviar(`/api/ordenes/${ordenId}/facturas`, 'POST', {
        accion: 'nota_credito', numero: form.numero.trim(), fecha_emision: form.fecha,
        importe_total: Number(form.total),
        // Sin dato, el arrendamiento sale del total sin IVA menos la
        // producción: tomar el total entero le restaba de más al canon.
        importe_arrendamiento: form.arr !== '' ? Number(form.arr) : Math.round((Number(form.total) / 1.22 - Number(form.prod || 0)) * 100) / 100,
        importe_produccion: Number(form.prod || 0), notas: form.notas,
      })
    }
    if (ok) setModal(null)
  }

  async function replanificar() {
    const n = Number(cuotasPlan)
    if (!Number.isInteger(n) || n < 1 || n > 60) { alert('Las cuotas tienen que estar entre 1 y 60'); return }
    if (!confirm(`¿Rearmar el plan en ${n} cuota${n === 1 ? '' : 's'} mensual${n === 1 ? '' : 'es'} iguales? Se reemplazan las cuotas previstas.`)) return
    await enviar(`/api/ordenes/${ordenId}/facturas`, 'POST', { accion: 'replanificar', cuotas: n })
  }

  async function guardarCondicion() {
    await enviar(`/api/ordenes/${ordenId}/facturas`, 'POST', { accion: 'condicion', dias: Number(condicionEdit) })
  }

  const vivas = facturas.filter(f => f.estado !== 'anulada')
  const sumaCuotas = vivas.reduce((s, f) => s + Number(f.importe_total), 0)
  const diferencia = montoTotal != null ? Math.round((Number(montoTotal) - sumaCuotas) * 100) / 100 : 0
  const hayEmitidas = facturas.some(f => f.tipo === 'factura' && (f.estado === 'emitida' || f.estado === 'cobrada'))

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Receipt size={16} />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Facturación</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· vence a {condicion} días</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {(puedePlanificar || puedeAdministrar) && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <label htmlFor="fv-condicion">Vence a</label>
              <input id="fv-condicion" type="number" min={0} max={365} value={condicionEdit}
                onChange={e => setCondicionEdit(e.target.value)}
                style={{ ...inputSt, width: 64, marginTop: 0, padding: '5px 7px' }} />
              <span>días</span>
              {Number(condicionEdit) !== condicion && (
                <button onClick={guardarCondicion} disabled={ocupado} style={btn('#fff', 'var(--text-secondary)')}>Guardar</button>
              )}
            </span>
          )}
          {puedePlanificar && !hayEmitidas && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <label htmlFor="fv-cuotas">Cuotas</label>
              <input id="fv-cuotas" type="number" min={1} max={60} value={cuotasPlan}
                onChange={e => setCuotasPlan(e.target.value)}
                style={{ ...inputSt, width: 56, marginTop: 0, padding: '5px 7px' }} />
              <button onClick={replanificar} disabled={ocupado} style={btn('#fff', 'var(--text-secondary)')}>
                <RefreshCw size={12} /> Rearmar
              </button>
            </span>
          )}
          {puedeAdministrar && aprobada && (
            <button onClick={() => abrir({ tipo: 'nota_credito' })} disabled={ocupado} style={btn('#fff', 'var(--text-secondary)')}>
              <FileMinus size={12} /> Nota de crédito
            </button>
          )}
        </div>
      </div>

      {cargando ? (
        <p style={{ padding: 18, fontSize: 13, color: 'var(--text-muted)' }}>Cargando facturas…</p>
      ) : error ? (
        <p style={{ padding: 18, fontSize: 13, color: '#c82f2f' }}>{error}</p>
      ) : facturas.length === 0 ? (
        <p style={{ padding: 18, fontSize: 13, color: 'var(--text-muted)' }}>
          Esta venta todavía no tiene plan de facturación.{puedePlanificar ? ' Indicá las cuotas y apretá Rearmar.' : ''}
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
            <thead>
              <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
                {['Cuota', 'Mes', 'Arrend.', 'Prod.', 'Total', 'Estado', 'Nº factura', 'Emisión', 'Vence', 'Cobro', ''].map(h => (
                  <th key={h} style={{ padding: '9px 12px', textAlign: ['Arrend.', 'Prod.', 'Total'].includes(h) ? 'right' : 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {facturas.map(f => {
                const est = ESTADO[f.estado]
                const atraso = f.estado === 'emitida' ? diasDeAtraso(f.fecha_vencimiento) : 0
                const nc = f.tipo === 'nota_credito'
                return (
                  <tr key={f.id} style={{ borderBottom: '1px solid var(--border)', opacity: f.estado === 'anulada' ? 0.55 : 1 }}>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {nc ? 'Nota de crédito' : `${f.cuota} de ${f.cuotas_total}`}
                    </td>
                    <td style={{ padding: '10px 12px', textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{fmtMes(f.mes_pauta)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(Number(f.importe_arrendamiento), f.moneda || moneda)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-muted)' }}>{Number(f.importe_produccion) ? formatMoney(Number(f.importe_produccion), f.moneda || moneda) : '—'}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{formatMoney(Number(f.importe_total), f.moneda || moneda)}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: est.bg, color: est.color }}>{est.label}</span>
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{f.numero ?? '—'}</td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{fmtFecha(f.fecha_emision)}</td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                      {fmtFecha(f.fecha_vencimiento)}
                      {atraso > 0 && (
                        <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: atraso > 30 ? '#fde8e8' : '#fdf2dc', color: atraso > 30 ? '#c62828' : '#b26a00' }}>
                          {atraso} d
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{fmtFecha(f.fecha_cobro)}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                        {f.estado === 'prevista' && (puedePlanificar || puedeAdministrar) && (
                          <button onClick={() => abrir({ tipo: 'editar', f })} disabled={ocupado} style={btn('#fff', 'var(--text-secondary)')} title="Ajustar mes e importes"><Pencil size={12} /></button>
                        )}
                        {f.estado === 'prevista' && puedeAdministrar && aprobada && (
                          <button onClick={() => abrir({ tipo: 'emitir', f })} disabled={ocupado} style={btn('#2563eb')}><Receipt size={12} /> Facturar</button>
                        )}
                        {f.estado === 'emitida' && puedeAdministrar && (
                          <>
                            <button onClick={() => abrir({ tipo: 'cobrar', f })} disabled={ocupado} style={btn('#15803d')}><DollarSign size={12} /> Cobrar</button>
                            <button onClick={() => abrir({ tipo: 'editar', f })} disabled={ocupado} style={btn('#fff', 'var(--text-secondary)')} title="Corregir vencimiento o mes"><Pencil size={12} /></button>
                            <button onClick={() => abrir({ tipo: 'anular', f })} disabled={ocupado} style={btn('#fff', '#c82f2f')} title="Anular"><X size={12} /></button>
                          </>
                        )}
                        {(f.estado === 'emitida' || f.estado === 'cobrada') && !nc && (
                          <button onClick={() => onImprimir(f)} style={btn('#fff', 'var(--text-secondary)')} title="Descargar factura"><Printer size={12} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {!cargando && !error && facturas.length > 0 && Math.abs(diferencia) >= 1 && (
        <p style={{ padding: '10px 18px', margin: 0, fontSize: 12, color: '#b26a00', background: '#fdf2dc' }}>
          Las cuotas suman {formatMoney(sumaCuotas, moneda)} y la venta es de {formatMoney(Number(montoTotal), moneda)}:
          {' '}{diferencia > 0 ? `faltan ${formatMoney(diferencia, moneda)} por planificar` : `sobran ${formatMoney(-diferencia, moneda)}`}.
        </p>
      )}
      {!cargando && !aprobada && facturas.length > 0 && (
        <p style={{ padding: '10px 18px', margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
          Se puede facturar cuando el gerente aprueba la venta.
        </p>
      )}

      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setModal(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 420, maxWidth: 'calc(100vw - 32px)' }} onClick={e => e.stopPropagation()}>
            {modal.tipo === 'emitir' && (
              <>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>Facturar cuota {modal.f.cuota} de {modal.f.cuotas_total}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>Vence a {condicion} días de la fecha de factura. Queda pendiente de cobro.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <label style={lblSt}>Nº de factura<input id="fv-numero" value={form.numero ?? ''} onChange={e => setForm({ ...form, numero: e.target.value })} placeholder="Ej. 10272" style={inputSt} autoFocus /></label>
                  <label style={lblSt}>Fecha de factura<input id="fv-fecha" type="date" value={form.fecha ?? ''} onChange={e => setForm({ ...form, fecha: e.target.value })} style={inputSt} /></label>
                  <label style={lblSt}>Importe total<input id="fv-total" type="number" step="0.01" value={form.total ?? ''} onChange={e => setForm({ ...form, total: e.target.value })} style={inputSt} /></label>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Si se factura una parte, ajustá el importe y el resto queda para otra cuota.</span>
                </div>
              </>
            )}
            {modal.tipo === 'cobrar' && (
              <>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>Registrar cobro · factura {modal.f.numero}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>Se genera la comisión del vendedor sobre el arrendamiento de esta factura.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <label style={lblSt}>Fecha de cobro<input id="fv-cobro" type="date" value={form.fecha ?? ''} onChange={e => setForm({ ...form, fecha: e.target.value })} style={inputSt} /></label>
                  <label style={lblSt}>Método (opcional)<input id="fv-metodo" value={form.metodo ?? ''} onChange={e => setForm({ ...form, metodo: e.target.value })} placeholder="Transferencia, cheque…" style={inputSt} /></label>
                </div>
              </>
            )}
            {modal.tipo === 'anular' && (
              <>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>Anular factura {modal.f.numero}</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>Deja de contar como deuda. Si ya se cobró, no se anula: se corrige con una nota de crédito.</p>
                <label style={lblSt}>Motivo<input id="fv-motivo" value={form.motivo ?? ''} onChange={e => setForm({ ...form, motivo: e.target.value })} style={inputSt} /></label>
              </>
            )}
            {modal.tipo === 'editar' && (
              <>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 14px' }}>
                  {modal.f.estado === 'prevista' ? `Ajustar cuota ${modal.f.cuota}` : `Corregir factura ${modal.f.numero}`}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <label style={lblSt}>Mes de la pauta<input id="fv-mes" type="month" value={form.mes ?? ''} onChange={e => setForm({ ...form, mes: e.target.value })} style={inputSt} /></label>
                  {modal.f.estado === 'prevista' ? (
                    <>
                      <label style={lblSt}>Arrendamiento sin IVA<input id="fv-arr" type="number" step="0.01" value={form.arr ?? ''} onChange={e => setForm({ ...form, arr: e.target.value })} style={inputSt} /></label>
                      <label style={lblSt}>Producción sin IVA<input id="fv-prod" type="number" step="0.01" value={form.prod ?? ''} onChange={e => setForm({ ...form, prod: e.target.value })} style={inputSt} /></label>
                      <label style={lblSt}>Total a facturar<input id="fv-tot" type="number" step="0.01" value={form.total ?? ''} onChange={e => setForm({ ...form, total: e.target.value })} style={inputSt} /></label>
                    </>
                  ) : (
                    <label style={lblSt}>Vencimiento<input id="fv-vto" type="date" value={form.vto ?? ''} onChange={e => setForm({ ...form, vto: e.target.value })} style={inputSt} /></label>
                  )}
                </div>
              </>
            )}
            {modal.tipo === 'nota_credito' && (
              <>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>Nota de crédito</h3>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>Se registra en negativo y descuenta de lo facturado.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <label style={lblSt}>Nº<input id="nc-numero" value={form.numero ?? ''} onChange={e => setForm({ ...form, numero: e.target.value })} style={inputSt} /></label>
                  <label style={lblSt}>Fecha<input id="nc-fecha" type="date" value={form.fecha ?? ''} onChange={e => setForm({ ...form, fecha: e.target.value })} style={inputSt} /></label>
                  <label style={lblSt}>Importe total<input id="nc-total" type="number" step="0.01" value={form.total ?? ''} onChange={e => setForm({ ...form, total: e.target.value })} style={inputSt} /></label>
                  <label style={lblSt}>De eso, arrendamiento sin IVA<input id="nc-arr" type="number" step="0.01" value={form.arr ?? ''} onChange={e => setForm({ ...form, arr: e.target.value })} placeholder="Si no se indica: total sin IVA menos producción" style={inputSt} /></label>
                  <label style={lblSt}>Motivo<input id="nc-notas" value={form.notas ?? ''} onChange={e => setForm({ ...form, notas: e.target.value })} style={inputSt} /></label>
                </div>
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button onClick={() => setModal(null)} style={btn('#fff', 'var(--text-secondary)')}>Cancelar</button>
              <button onClick={confirmar} disabled={ocupado}
                style={btn(modal.tipo === 'anular' ? '#c82f2f' : modal.tipo === 'cobrar' ? '#15803d' : '#2563eb')}>
                {ocupado ? 'Guardando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
