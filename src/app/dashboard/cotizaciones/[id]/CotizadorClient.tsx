'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, Plus, Minus, Trash2, Download, Send, CheckCircle,
  ChevronRight, Save, ArrowLeft, Loader2, Info,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Soporte {
  id: string
  cotizador_id: number | null
  nombre: string
  categoria: string
  ubicacion: string | null
  precio_semanal: number | null
  produccion: number
  tiene_iva: boolean
  imp_municipal: boolean
  impactos: number
  activo: boolean
}

interface PlanItem {
  soporte: Soporte
  cantidad: number
}

interface PropuestaHeader {
  id: string
  numero: string
  nombre: string | null
  estado: string
  cliente_id: string | null
  lead_id: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  moneda: string
  iva_pct: number
  imp_municipal_pct: number
  notas: string | null
  clientes: { nombre: string; empresa: string | null } | null
}

interface SavedItem {
  id: string
  soporte_id: string | null
  nombre_soporte: string
  ubicacion: string | null
  cantidad: number
  semanas: number
  precio_unitario: number
  produccion: number
  tiene_iva: boolean
  tiene_imp_mun: boolean
  impactos: number
  es_digital: boolean
  subtotal: number | null
}

interface Cliente { id: string; nombre: string; empresa: string | null }

const DIGITAL_CATS = ['PANTALLAS GIGANTES', 'CIRCUITOS DE PANTALLAS SHOPPINGS']
const isDigital = (s: Soporte) => DIGITAL_CATS.includes(s.categoria)

function getSemanas(inicio: string | null, fin: string | null): number {
  if (!inicio || !fin) return 1
  const dias = Math.round((new Date(fin).getTime() - new Date(inicio).getTime()) / 86400000)
  return dias > 0 ? Math.max(1, Math.round(dias / 7)) : 1
}

function calcBase(s: Soporte, qty: number, semanas: number): number {
  const weeks = isDigital(s) ? semanas : 1
  return (s.precio_semanal ?? 0) * qty * weeks + s.produccion * qty
}

function fmtNum(n: number, moneda: string): string {
  const sym = moneda === 'USD' ? 'U$S' : '$'
  return `${sym} ${Math.round(n).toLocaleString('es-UY')}`
}

function fmtDate(d: string | null): string {
  if (!d) return ''
  return new Date(d + 'T12:00:00').toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CotizadorClient({
  propuestaId,
  rol,
  userId,
  initialLeadId = null,
  initialClienteId = null,
}: {
  propuestaId: string | null
  rol: string
  userId: string
  initialLeadId?: string | null
  initialClienteId?: string | null
}) {
  const router = useRouter()
  const isNew = propuestaId === null
  const canApprove = ['gerente_comercial', 'administracion', 'asistente_ventas'].includes(rol)

  // Header state
  const [propuesta, setPropuesta] = useState<PropuestaHeader | null>(null)
  const [nombre, setNombre] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [leadId, setLeadId] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [moneda, setMoneda] = useState('UYU')
  const [ivaPct, setIvaPct] = useState(22)
  const [munPct, setMunPct] = useState(8)
  const [notas, setNotas] = useState('')
  const [estado, setEstado] = useState('borrador')

  // Catalog state
  const [catalog, setCatalog] = useState<Soporte[]>([])
  const [plan, setPlan] = useState<PlanItem[]>([])
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [clientes, setClientes] = useState<Cliente[]>([])

  // UI state
  const [saving, setSaving] = useState(false)
  const [loadingInit, setLoadingInit] = useState(true)
  const [activeTab, setActiveTab] = useState<'plan' | 'kpi'>('plan')
  const [clienteQuery, setClienteQuery] = useState('')
  const [clienteSuggs, setClienteSuggs] = useState<Cliente[]>([])
  const [savedId, setSavedId] = useState<string | null>(propuestaId)

  // ── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      fetch('/api/soportes?all=true').then(r => r.json()),
      fetch('/api/clientes?limit=200').then(r => r.json()),
      propuestaId ? fetch(`/api/propuestas/${propuestaId}`).then(r => r.json()) : Promise.resolve(null),
    ]).then(([sData, cData, pData]) => {
      // Enrich soportes from catalog API
      const soportes: Soporte[] = (sData.soportes ?? []).filter((s: any) => s.cotizador_id != null || s.activo)
      setCatalog(soportes)
      setClientes(cData.clientes ?? [])

      if (pData?.propuesta) {
        const p: PropuestaHeader = pData.propuesta
        setPropuesta(p)
        setNombre(p.nombre ?? '')
        setClienteId(p.cliente_id ?? '')
        setLeadId(p.lead_id ?? '')
        setFechaInicio(p.fecha_inicio ?? '')
        setFechaFin(p.fecha_fin ?? '')
        setMoneda(p.moneda ?? 'UYU')
        setIvaPct(p.iva_pct ?? 22)
        setMunPct(p.imp_municipal_pct ?? 8)
        setNotas(p.notas ?? '')
        setEstado(p.estado ?? 'borrador')

        if (p.clientes) {
          const cli = p.clientes
          setClienteQuery(cli.empresa || cli.nombre || '')
        }

        // Rebuild plan from saved items
        const savedItems: SavedItem[] = pData.items ?? []
        const planItems: PlanItem[] = savedItems.map((it: SavedItem) => {
          const matched = soportes.find(s =>
            s.nombre === it.nombre_soporte && (s.ubicacion ?? '') === (it.ubicacion ?? '')
          )
          const fakeSoporte: Soporte = matched ?? {
            id: it.soporte_id ?? it.nombre_soporte,
            cotizador_id: null,
            nombre: it.nombre_soporte,
            categoria: it.es_digital ? 'PANTALLAS GIGANTES' : 'BANNERS EN SHOPPINGS',
            ubicacion: it.ubicacion ?? null,
            precio_semanal: it.precio_unitario,
            produccion: it.produccion,
            tiene_iva: it.tiene_iva,
            imp_municipal: it.tiene_imp_mun,
            impactos: it.impactos,
            activo: true,
          }
          return { soporte: fakeSoporte, cantidad: it.cantidad }
        })
        setPlan(planItems)
      } else if (isNew) {
        // Default dates: today + 4 weeks
        const today = new Date()
        const in4w = new Date(today.getTime() + 28 * 86400000)
        setFechaInicio(today.toISOString().slice(0, 10))
        setFechaFin(in4w.toISOString().slice(0, 10))
        // Pre-fill from query params (coming from lead card)
        if (initialLeadId) setLeadId(initialLeadId)
        if (initialClienteId) {
          setClienteId(initialClienteId)
          const cli = (cData.clientes ?? []).find((c: Cliente) => c.id === initialClienteId)
          if (cli) setClienteQuery(cli.empresa || cli.nombre || '')
        }
      }
      setLoadingInit(false)
    })
  }, [propuestaId])

  // ── Derived values ──────────────────────────────────────────────────────────

  const semanas = getSemanas(fechaInicio, fechaFin)

  const totals = plan.reduce(
    (acc, { soporte: s, cantidad }) => {
      const base = calcBase(s, cantidad, semanas)
      const iva = s.tiene_iva ? base * (ivaPct / 100) : 0
      const mun = s.imp_municipal ? base * (munPct / 100) : 0
      acc.neto += base
      acc.iva += iva
      acc.mun += mun
      acc.total += base + iva + mun
      acc.impactos += (s.impactos ?? 0) * cantidad * (isDigital(s) ? semanas : 1)
      return acc
    },
    { neto: 0, iva: 0, mun: 0, total: 0, impactos: 0 }
  )

  const cpm = totals.impactos > 0 ? (totals.neto / totals.impactos) * 1000 : null

  // ── Catalog filtering ───────────────────────────────────────────────────────

  const categories = Array.from(new Set(catalog.map(s => s.categoria))).sort()
  const filtered = catalog.filter(s => {
    const q = search.toLowerCase()
    const matchSearch = !q || s.nombre.toLowerCase().includes(q) || (s.ubicacion ?? '').toLowerCase().includes(q)
    const matchCat = !catFilter || s.categoria === catFilter
    return matchSearch && matchCat && s.activo !== false
  })

  // ── Plan actions ────────────────────────────────────────────────────────────

  function addToplan(s: Soporte) {
    setPlan(prev => {
      const idx = prev.findIndex(it => it.soporte.id === s.id)
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = { ...updated[idx], cantidad: updated[idx].cantidad + 1 }
        return updated
      }
      return [...prev, { soporte: s, cantidad: 1 }]
    })
  }

  function setQty(sId: string, qty: number) {
    if (qty <= 0) {
      setPlan(prev => prev.filter(it => it.soporte.id !== sId))
    } else {
      setPlan(prev => prev.map(it => it.soporte.id === sId ? { ...it, cantidad: qty } : it))
    }
  }

  // ── Client search ───────────────────────────────────────────────────────────

  function onClienteInput(val: string) {
    setClienteQuery(val)
    if (!val) { setClienteSuggs([]); return }
    const q = val.toLowerCase()
    setClienteSuggs(clientes.filter(c =>
      c.nombre.toLowerCase().includes(q) || (c.empresa ?? '').toLowerCase().includes(q)
    ).slice(0, 6))
  }

  // ── Save ────────────────────────────────────────────────────────────────────

  async function save(newEstado?: string): Promise<string | null> {
    setSaving(true)
    const items = plan.map(({ soporte: s, cantidad }) => {
      const base = calcBase(s, cantidad, semanas)
      const iva = s.tiene_iva ? base * (ivaPct / 100) : 0
      const mun = s.imp_municipal ? base * (munPct / 100) : 0
      return {
        soporte_id:     s.id,
        nombre_soporte: s.nombre,
        ubicacion:      s.ubicacion ?? null,
        cantidad,
        semanas:        isDigital(s) ? semanas : 1,
        precio_unitario: s.precio_semanal ?? 0,
        produccion:     s.produccion ?? 0,
        tiene_iva:      s.tiene_iva,
        tiene_imp_mun:  s.imp_municipal,
        impactos:       s.impactos ?? 0,
        es_digital:     isDigital(s),
        subtotal:       base + iva + mun,
      }
    })

    const payload = {
      nombre:            nombre || null,
      cliente_id:        clienteId || null,
      lead_id:           leadId || null,
      fecha_inicio:      fechaInicio || null,
      fecha_fin:         fechaFin || null,
      estado:            newEstado ?? estado,
      notas:             notas || null,
      moneda,
      iva_pct:           ivaPct,
      imp_municipal_pct: munPct,
      monto_neto:        totals.neto,
      monto_total:       totals.total,
      items,
    }

    let id = savedId
    if (!id) {
      const res = await fetch('/api/propuestas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      id = data.id
      setSavedId(id ?? null)
    } else {
      await fetch(`/api/propuestas/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    }

    if (newEstado) setEstado(newEstado)
    setSaving(false)
    return id ?? null
  }

  // ── Approve ─────────────────────────────────────────────────────────────────

  async function aprobar() {
    if (!confirm('¿Aprobar esta cotización y generar la OIC?')) return
    const id = await save()
    if (!id) return
    const res = await fetch(`/api/propuestas/${id}/aprobar`, { method: 'POST' })
    const data = await res.json()
    if (data.orden_id) {
      router.push(`/dashboard/ventas/${data.orden_id}`)
    }
  }

  // ── PDF export ───────────────────────────────────────────────────────────────

  function exportPDF() {
    const clienteNombre = clienteQuery || '—'
    const numero = propuesta?.numero ?? 'BORRADOR'

    const rows = plan.map(({ soporte: s, cantidad }) => {
      const weeks = isDigital(s) ? semanas : 1
      const base = (s.precio_semanal ?? 0) * cantidad * weeks + s.produccion * cantidad
      const iva = s.tiene_iva ? base * (ivaPct / 100) : 0
      const mun = s.imp_municipal ? base * (munPct / 100) : 0
      const total = base + iva + mun
      const sym = moneda === 'USD' ? 'U$S' : '$'
      return `
        <tr>
          <td>${s.nombre}</td>
          <td style="color:#6b7280;font-size:11px">${s.categoria}</td>
          <td style="color:#6b7280;font-size:11px">${s.ubicacion ?? ''}</td>
          <td style="text-align:center">${cantidad}</td>
          ${isDigital(s) ? `<td style="text-align:center">${weeks}</td>` : '<td style="text-align:center;color:#9ca3af">—</td>'}
          <td style="text-align:right">${sym} ${Math.round((s.precio_semanal ?? 0)).toLocaleString('es-UY')}</td>
          <td style="text-align:right">${s.produccion ? `${sym} ${Math.round(s.produccion * cantidad).toLocaleString('es-UY')}` : '—'}</td>
          <td style="text-align:right">${s.tiene_iva ? `${sym} ${Math.round(iva).toLocaleString('es-UY')}` : '—'}</td>
          <td style="text-align:right">${s.imp_municipal ? `${sym} ${Math.round(mun).toLocaleString('es-UY')}` : '—'}</td>
          <td style="text-align:right;font-weight:600">${sym} ${Math.round(total).toLocaleString('es-UY')}</td>
        </tr>`
    }).join('')

    const sym = moneda === 'USD' ? 'U$S' : '$'
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Cotización ${numero}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:0;padding:20px}
      h1{font-size:20px;margin:0 0 4px}
      .sub{color:#6b7280;font-size:12px;margin:0 0 20px}
      .kpi{display:flex;gap:12px;margin-bottom:20px}
      .kpi-box{flex:1;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px}
      .kpi-label{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px}
      .kpi-value{font-size:16px;font-weight:700;color:#111;margin-top:4px}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th{background:#f3f4f6;padding:6px 8px;text-align:left;border-bottom:1px solid #e5e7eb;font-size:10px;text-transform:uppercase;color:#6b7280}
      td{padding:6px 8px;border-bottom:1px solid #f3f4f6}
      .totals{background:#111827;color:#fff;padding:12px 20px;border-radius:8px;display:flex;gap:32px;margin-top:16px;justify-content:flex-end}
      .t-label{font-size:10px;opacity:.6;margin-bottom:2px}
      .t-value{font-size:14px;font-weight:700}
      .footer{margin-top:24px;font-size:10px;color:#9ca3af;text-align:center}
    </style></head><body>
    <h1>Cotización de Campaña — Movimagen</h1>
    <p class="sub">${numero} · ${clienteNombre} · ${fmtDate(fechaInicio)} – ${fmtDate(fechaFin)}</p>
    <div class="kpi">
      <div class="kpi-box"><div class="kpi-label">Inversión Neta</div><div class="kpi-value">${sym} ${Math.round(totals.neto).toLocaleString('es-UY')}</div></div>
      <div class="kpi-box"><div class="kpi-label">Total con Impuestos</div><div class="kpi-value">${sym} ${Math.round(totals.total).toLocaleString('es-UY')}</div></div>
      <div class="kpi-box"><div class="kpi-label">Impactos Estimados</div><div class="kpi-value">${totals.impactos.toLocaleString('es-UY')}</div></div>
      ${cpm != null ? `<div class="kpi-box"><div class="kpi-label">CPM</div><div class="kpi-value">${sym} ${cpm.toFixed(2)}</div></div>` : ''}
    </div>
    <table>
      <thead><tr>
        <th>Soporte</th><th>Categoría</th><th>Ubicación</th><th style="text-align:center">Cant.</th>
        <th style="text-align:center">Sem.</th><th style="text-align:right">Precio</th>
        <th style="text-align:right">Producción</th><th style="text-align:right">IVA</th>
        <th style="text-align:right">Imp. Mun.</th><th style="text-align:right">Total</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div><div class="t-label">Neto</div><div class="t-value">${sym} ${Math.round(totals.neto).toLocaleString('es-UY')}</div></div>
      <div><div class="t-label">IVA</div><div class="t-value">${sym} ${Math.round(totals.iva).toLocaleString('es-UY')}</div></div>
      <div><div class="t-label">Imp. Municipal</div><div class="t-value">${sym} ${Math.round(totals.mun).toLocaleString('es-UY')}</div></div>
      <div><div class="t-label">TOTAL</div><div class="t-value">${sym} ${Math.round(totals.total).toLocaleString('es-UY')}</div></div>
    </div>
    <p class="footer">Generado el ${new Date().toLocaleString('es-UY')} · Movimagen CRM</p>
    </body></html>`

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    win.print()
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loadingInit) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 10, color: '#6b7280' }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Cargando cotizador…
      </div>
    )
  }

  const inPlanArr = plan.map(it => it.soporte.id)
  const inPlan = { has: (id: string) => inPlanArr.includes(id) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* ── Top bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0, flexWrap: 'wrap' }}>
        <button onClick={() => router.push('/dashboard/cotizaciones')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
          <ArrowLeft size={15} /> Cotizaciones
        </button>
        <ChevronRight size={14} style={{ color: '#d1d5db' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
          {propuesta?.numero ?? 'Nueva Cotización'}
        </span>
        {/* Estado badge */}
        <span style={{
          padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
          background: estado === 'aceptada' ? '#f0fdf4' : estado === 'enviada' ? '#eff6ff' : estado === 'rechazada' ? '#fef2f2' : '#f1f5f9',
          color: estado === 'aceptada' ? '#16a34a' : estado === 'enviada' ? '#2563eb' : estado === 'rechazada' ? '#dc2626' : '#475569',
        }}>
          {estado === 'borrador' ? 'Borrador' : estado === 'enviada' ? 'Enviada' : estado === 'aceptada' ? 'Aceptada' : 'Rechazada'}
        </span>

        <div style={{ flex: 1 }} />

        {/* Action buttons */}
        <button
          onClick={exportPDF}
          disabled={plan.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontSize: 12, cursor: plan.length === 0 ? 'not-allowed' : 'pointer', opacity: plan.length === 0 ? 0.5 : 1 }}
        >
          <Download size={14} /> PDF
        </button>

        {estado === 'borrador' && (
          <button
            onClick={() => save('enviada')}
            disabled={saving || plan.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, border: '1px solid #2563eb', background: '#eff6ff', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            <Send size={14} /> Marcar enviada
          </button>
        )}

        {canApprove && (estado === 'enviada' || estado === 'borrador') && (
          <button
            onClick={aprobar}
            disabled={saving || plan.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
          >
            <CheckCircle size={14} /> Aprobar → OIC
          </button>
        )}

        <button
          onClick={() => save().then(id => { if (id && isNew) router.replace(`/dashboard/cotizaciones/${id}`) })}
          disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, border: 'none', background: '#111827', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
        >
          {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      {/* ── Header form ── */}
      <div style={{ display: 'flex', gap: 12, padding: '12px 20px', borderBottom: '1px solid #f3f4f6', background: '#fafafa', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 160 }}>
          <label style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 3 }}>Nombre campaña</label>
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Campaña Verano 2025" style={inputSt} />
        </div>
        <div style={{ flex: 2, minWidth: 160, position: 'relative' }}>
          <label style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 3 }}>Cliente</label>
          <input
            value={clienteQuery}
            onChange={e => onClienteInput(e.target.value)}
            placeholder="Buscar cliente…"
            style={inputSt}
          />
          {clienteSuggs.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, marginTop: 2 }}>
              {clienteSuggs.map(c => (
                <button key={c.id} onClick={() => { setClienteId(c.id); setClienteQuery(c.empresa || c.nombre); setClienteSuggs([]) }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #f3f4f6' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                >
                  {c.empresa || c.nombre}
                  {c.empresa && <span style={{ color: '#9ca3af', marginLeft: 6 }}>{c.nombre}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 110 }}>
          <label style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 3 }}>Inicio</label>
          <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} style={inputSt} />
        </div>
        <div style={{ flex: 1, minWidth: 110 }}>
          <label style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 3 }}>Fin</label>
          <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} style={inputSt} />
        </div>
        <div style={{ minWidth: 70 }}>
          <label style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 3 }}>Moneda</label>
          <select value={moneda} onChange={e => setMoneda(e.target.value)} style={inputSt}>
            <option value="UYU">UYU</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <div style={{ minWidth: 60 }}>
          <label style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 3 }}>IVA %</label>
          <input type="number" min={0} max={100} value={ivaPct} onChange={e => setIvaPct(Number(e.target.value))} style={{ ...inputSt, width: 56 }} />
        </div>
        <div style={{ minWidth: 60 }}>
          <label style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 3 }}>Mun. %</label>
          <input type="number" min={0} max={100} value={munPct} onChange={e => setMunPct(Number(e.target.value))} style={{ ...inputSt, width: 56 }} />
        </div>
        {fechaInicio && fechaFin && (
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
            <span style={{ fontSize: 11, color: '#6b7280', background: '#f1f5f9', padding: '4px 8px', borderRadius: 5 }}>
              {semanas} sem.
            </span>
          </div>
        )}
      </div>

      {/* ── Main 2-col layout ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left: Catalog */}
        <div style={{ width: 360, flexShrink: 0, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', background: '#fafafa' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid #f3f4f6' }}>
            <div style={{ position: 'relative', marginBottom: 8 }}>
              <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar soporte…"
                style={{ width: '100%', paddingLeft: 28, paddingRight: 10, height: 32, border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, background: '#fff', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button onClick={() => setCatFilter('')} style={{ ...catBtnSt, background: !catFilter ? '#111827' : '#fff', color: !catFilter ? '#fff' : '#374151', borderColor: !catFilter ? '#111827' : '#d1d5db' }}>Todas</button>
              {categories.map(c => (
                <button key={c} onClick={() => setCatFilter(c === catFilter ? '' : c)}
                  style={{ ...catBtnSt, background: catFilter === c ? '#111827' : '#fff', color: catFilter === c ? '#fff' : '#374151', borderColor: catFilter === c ? '#111827' : '#d1d5db', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={c}
                >
                  {c.split(' ').slice(0, 2).join(' ')}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 12 }}>Sin resultados</div>
            )}
            {filtered.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 7, marginBottom: 2, background: inPlan.has(s.id) ? '#eff6ff' : '#fff', border: `1px solid ${inPlan.has(s.id) ? '#bfdbfe' : '#f3f4f6'}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', lineHeight: 1.3 }}>{s.nombre}</div>
                  <div style={{ fontSize: 10, color: '#6b7280', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.ubicacion}</div>
                  <div style={{ fontSize: 10, color: '#374151', marginTop: 2 }}>
                    $ {Math.round(s.precio_semanal ?? 0).toLocaleString('es-UY')}
                    {isDigital(s) && <span style={{ color: '#9ca3af' }}>/sem</span>}
                    {s.produccion > 0 && <span style={{ color: '#9ca3af', marginLeft: 4 }}>+ prod. ${Math.round(s.produccion).toLocaleString('es-UY')}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                  {s.tiene_iva && <span style={{ fontSize: 9, padding: '1px 4px', background: '#fef9c3', color: '#a16207', borderRadius: 3, fontWeight: 600 }}>IVA</span>}
                  {s.imp_municipal && <span style={{ fontSize: 9, padding: '1px 4px', background: '#fce7f3', color: '#be185d', borderRadius: 3, fontWeight: 600 }}>MUN</span>}
                </div>
                <button
                  onClick={() => addToplan(s)}
                  style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: inPlan.has(s.id) ? '#2563eb' : '#111827', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  <Plus size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Plan + KPI */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0 }}>
            {(['plan', 'kpi'] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                style={{ padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, borderBottom: `2px solid ${activeTab === t ? '#111827' : 'transparent'}`, color: activeTab === t ? '#111827' : '#9ca3af' }}
              >
                {t === 'plan' ? `Plan (${plan.length})` : 'Análisis'}
              </button>
            ))}
          </div>

          {activeTab === 'plan' ? (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {plan.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#9ca3af' }}>
                  <Info size={32} style={{ margin: '0 auto 10px', display: 'block' }} />
                  <p style={{ fontSize: 13 }}>Agregá soportes desde el catálogo</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f9fafb' }}>
                      {['Soporte', 'Ubicación', 'Cant.', 'Sem.', 'Base', 'IVA', 'Mun.', 'Total', ''].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Cant.' || h === 'Sem.' ? 'center' : h === '' ? 'center' : 'right', fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {plan.map(({ soporte: s, cantidad }) => {
                      const weeks = isDigital(s) ? semanas : 1
                      const base = calcBase(s, cantidad, semanas)
                      const iva = s.tiene_iva ? base * (ivaPct / 100) : 0
                      const mun = s.imp_municipal ? base * (munPct / 100) : 0
                      const total = base + iva + mun
                      return (
                        <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '9px 10px', fontWeight: 600, color: '#111827' }}>{s.nombre}</td>
                          <td style={{ padding: '9px 10px', color: '#6b7280', fontSize: 11 }}>{s.ubicacion ?? '—'}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                              <button onClick={() => setQty(s.id, cantidad - 1)} style={qtyBtnSt}><Minus size={11} /></button>
                              <span style={{ minWidth: 18, textAlign: 'center', fontWeight: 600 }}>{cantidad}</span>
                              <button onClick={() => setQty(s.id, cantidad + 1)} style={qtyBtnSt}><Plus size={11} /></button>
                            </div>
                          </td>
                          <td style={{ padding: '9px 10px', textAlign: 'center', color: isDigital(s) ? '#111827' : '#d1d5db' }}>{isDigital(s) ? weeks : '—'}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'right' }}>{fmtNum(base, moneda)}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'right', color: s.tiene_iva ? '#111827' : '#d1d5db' }}>{s.tiene_iva ? fmtNum(iva, moneda) : '—'}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'right', color: s.imp_municipal ? '#111827' : '#d1d5db' }}>{s.imp_municipal ? fmtNum(mun, moneda) : '—'}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: '#111827' }}>{fmtNum(total, moneda)}</td>
                          <td style={{ padding: '9px 10px', textAlign: 'center' }}>
                            <button onClick={() => setQty(s.id, 0)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', padding: 3, borderRadius: 4 }}
                              onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                              onMouseLeave={e => (e.currentTarget.style.color = '#d1d5db')}
                            ><Trash2 size={13} /></button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            /* KPI tab */
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12, marginBottom: 24 }}>
                {[
                  { label: 'Inversión Neta', value: fmtNum(totals.neto, moneda), sub: 'Sin impuestos' },
                  { label: 'Total con Impuestos', value: fmtNum(totals.total, moneda), sub: `IVA ${fmtNum(totals.iva, moneda)} · Mun. ${fmtNum(totals.mun, moneda)}` },
                  { label: 'Impactos Estimados', value: totals.impactos.toLocaleString('es-UY'), sub: 'Suma de contactos' },
                  ...(cpm != null ? [{ label: 'CPM', value: fmtNum(cpm, moneda), sub: 'Costo por mil impactos' }] : []),
                  { label: 'Duración', value: `${semanas} semanas`, sub: `${fechaInicio ? fmtDate(fechaInicio) : '—'} → ${fechaFin ? fmtDate(fechaFin) : '—'}` },
                  { label: 'Soportes', value: String(plan.length), sub: `${plan.reduce((a, it) => a + it.cantidad, 0)} unidades` },
                ].map(({ label, value, sub }) => (
                  <div key={label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px' }}>
                    <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', margin: '6px 0 2px' }}>{value}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>{sub}</div>
                  </div>
                ))}
              </div>
              {/* Category breakdown */}
              {plan.length > 0 && (
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 10 }}>Por categoría</h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: '#f9fafb' }}>
                        {['Categoría', 'Soportes', 'Inversión Neta', '% del total'].map(h => (
                          <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Categoría' || h === 'Soportes' ? 'left' : 'right', fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(
                        plan.reduce((acc, { soporte: s, cantidad }) => {
                          const base = calcBase(s, cantidad, semanas)
                          acc[s.categoria] = (acc[s.categoria] ?? 0) + base
                          return acc
                        }, {} as Record<string, number>)
                      ).sort((a, b) => b[1] - a[1]).map(([cat, val]) => (
                        <tr key={cat} style={{ borderBottom: '1px solid #f3f4f6' }}>
                          <td style={{ padding: '8px 10px' }}>{cat}</td>
                          <td style={{ padding: '8px 10px', color: '#6b7280' }}>
                            {plan.filter(it => it.soporte.categoria === cat).reduce((a, it) => a + it.cantidad, 0)}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{fmtNum(val, moneda)}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: '#6b7280' }}>
                            {totals.neto > 0 ? `${((val / totals.neto) * 100).toFixed(1)}%` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Bottom totals bar */}
          {plan.length > 0 && (
            <div style={{ display: 'flex', gap: 24, padding: '12px 20px', borderTop: '1px solid #e5e7eb', background: '#111827', color: '#fff', flexShrink: 0, flexWrap: 'wrap' }}>
              {[
                { label: 'Neto', value: fmtNum(totals.neto, moneda) },
                { label: 'IVA', value: fmtNum(totals.iva, moneda) },
                { label: 'Imp. Municipal', value: fmtNum(totals.mun, moneda) },
                { label: 'TOTAL', value: fmtNum(totals.total, moneda), bold: true },
              ].map(({ label, value, bold }) => (
                <div key={label}>
                  <div style={{ fontSize: 9, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
                  <div style={{ fontSize: bold ? 16 : 13, fontWeight: bold ? 700 : 500, marginTop: 2 }}>{value}</div>
                </div>
              ))}
              <div style={{ marginLeft: 'auto' }}>
                <div style={{ fontSize: 9, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '.5px' }}>Impactos</div>
                <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>{totals.impactos.toLocaleString('es-UY')}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Micro styles ─────────────────────────────────────────────────────────────

const inputSt: React.CSSProperties = {
  width: '100%', height: 32, border: '1px solid #e5e7eb', borderRadius: 6,
  padding: '0 8px', fontSize: 12, background: '#fff', boxSizing: 'border-box',
}

const catBtnSt: React.CSSProperties = {
  padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 500,
  border: '1px solid', cursor: 'pointer',
}

const qtyBtnSt: React.CSSProperties = {
  width: 20, height: 20, border: '1px solid #e5e7eb', borderRadius: 4,
  background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
}
