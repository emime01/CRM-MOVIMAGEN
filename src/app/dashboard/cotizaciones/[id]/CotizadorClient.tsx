'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Search, Plus, Minus, Trash2, Download, Send, CheckCircle,
  ChevronRight, Save, ArrowLeft, Loader2, Info, BarChart3,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  Tooltip, LineChart, Line, Legend, CartesianGrid,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Soporte {
  id: string
  cotizador_id: number | null
  nombre: string
  categoria: string                                     // Digital | Shopping | Exterior | Bus | Otro
  seccion: string | null                                // full grouping label, e.g. "PANTALLAS GIGANTES"
  tipo_cotizador: string | null                         // led | circuito | estatico_bus | banner_shopping | estatico_shopping | medianera
  ubicacion: string | null
  precio_semanal: number | null
  tiene_iva: boolean                                    // iva_arrendamiento
  salidas_por_hora: number | null
  horas_encendido: number | null
  impactos_mensuales: number | null
  costo_produccion: number | null
  impuestos_municipales: number | null                  // flat $ per week per unit
  cantidad_default: number | null
  semanas_minimas: number | null
  temporada_alta: boolean
  temporada_baja: boolean
  comentario: string | null
  url_imagen: string | null
  activo: boolean
}

interface PlanItem {
  uid: number
  soporte: Soporte
  semanas: number
  salidasElegidas: number | null
  cantidadSoportes: number
}

interface PropuestaHeader {
  id: string
  numero: string
  nombre: string | null
  marca: string | null
  observaciones: string | null
  estado: string
  cliente_id: string | null
  lead_id: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  moneda: string
  notas: string | null
  clientes: { nombre: string; empresa: string | null } | null
}

interface SavedItem {
  id: string
  soporte_id: string | null
  nombre_soporte: string
  ubicacion: string | null
  categoria_soporte: string | null
  tipo_cotizador: string | null
  cantidad: number
  cantidad_soportes: number | null
  salidas_elegidas: number | null
  semanas: number
  precio_unitario: number
  subtotal: number | null
  impactos_calc: number | null
}

interface Cliente { id: string; nombre: string; empresa: string | null }

const IVA_RATE = 0.22
const HORAS_MES = 4.33  // weeks per month for impact pro-rating

const CAT_COLORS: Record<string, string> = {
  Digital:  '#FF5C1A',
  Shopping: '#7C3AED',
  Exterior: '#059669',
  Bus:      '#D97706',
  Otro:     '#64748b',
}

const isLed      = (s: Soporte) => s.tipo_cotizador === 'led'
const isCircuito = (s: Soporte) => s.tipo_cotizador === 'circuito'
const isDigital  = (s: Soporte) => isLed(s) || isCircuito(s)
const hasCantidad = (s: Soporte) => ['estatico_bus', 'banner_shopping', 'estatico_shopping', 'medianera'].includes(s.tipo_cotizador ?? '')
const displayCat = (s: Soporte) => s.seccion || s.categoria

function getSemanasFromDates(inicio: string | null, fin: string | null): number {
  if (!inicio || !fin) return 1
  const dias = Math.round((new Date(fin).getTime() - new Date(inicio).getTime()) / 86400000)
  return dias > 0 ? Math.max(1, Math.round(dias / 7)) : 1
}

interface Calc {
  arr: number      // arrendamiento (rental)
  ivaArr: number   // IVA on arrendamiento (only if tiene_iva)
  prod: number     // production cost
  ivaProd: number  // IVA on production (always 22%)
  mun: number      // municipal tax (per week × cant)
  imp: number      // total impactos
  tot: number      // total con impuestos
  mul: number      // salidas multiplier
  cpm: number      // cost per mille
  sem: number      // effective semanas (clamped to semanas_minimas)
}

function calcItem(item: PlanItem): Calc {
  const s = item.soporte
  const sem = Math.max(item.semanas, s.semanas_minimas || 1)
  const sal = item.salidasElegidas
  const cant = item.cantidadSoportes
  let mul = 1
  if (isCircuito(s) && sal) mul = sal / 10
  if (isLed(s)      && sal) mul = sal / 30
  const arr     = (s.precio_semanal ?? 0) * sem * mul * cant
  const ivaArr  = s.tiene_iva ? arr * IVA_RATE : 0
  const prod    = (s.costo_produccion ?? 0) * cant
  const ivaProd = prod * IVA_RATE
  const mun     = (s.impuestos_municipales ?? 0) * sem * cant
  const imp     = s.impactos_mensuales
    ? Math.round(s.impactos_mensuales * sem / HORAS_MES * cant * mul)
    : 0
  const tot = arr + ivaArr + prod + ivaProd + mun
  const cpm = imp > 0 ? (tot / imp) * 1000 : 0
  return { arr, ivaArr, prod, ivaProd, mun, imp, tot, mul, cpm, sem }
}

function fmt(n: number, moneda = 'UYU'): string {
  const sym = moneda === 'USD' ? 'U$S' : '$'
  return `${sym} ${Math.round(n).toLocaleString('es-UY')}`
}

function fmtK(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1000)      return Math.round(n / 1000) + 'K'
  return Math.round(n).toString()
}

function fmtM(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M'
  if (Math.abs(n) >= 1000)      return (n / 1000).toFixed(1) + 'K'
  return Math.round(n).toString()
}

function fmtDate(d: string | null): string {
  if (!d) return ''
  return new Date(d + 'T12:00:00').toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CotizadorClient({
  propuestaId,
  rol,
  userId: _userId,
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
  const [marca, setMarca] = useState('')
  const [observaciones, setObservaciones] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [leadId, setLeadId] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [moneda, setMoneda] = useState('UYU')
  const [estado, setEstado] = useState('borrador')

  // Catalog + plan
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
  const uidRef = useState({ n: 1 })[0]

  // ── Init ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    Promise.all([
      fetch('/api/soportes?all=true').then(r => r.json()),
      fetch('/api/clientes?limit=200').then(r => r.json()),
      propuestaId ? fetch(`/api/propuestas/${propuestaId}`).then(r => r.json()) : Promise.resolve(null),
    ]).then(([sData, cData, pData]) => {
      const soportes: Soporte[] = (sData.soportes ?? [])
        .filter((s: any) => s.cotizador_id != null)
        .map((s: any) => ({ ...s }))
      setCatalog(soportes)
      setClientes(cData.clientes ?? [])

      if (pData?.propuesta) {
        const p: PropuestaHeader = pData.propuesta
        setPropuesta(p)
        setNombre(p.nombre ?? '')
        setMarca(p.marca ?? '')
        setObservaciones(p.observaciones ?? p.notas ?? '')
        setClienteId(p.cliente_id ?? '')
        setLeadId(p.lead_id ?? '')
        setFechaInicio(p.fecha_inicio ?? '')
        setFechaFin(p.fecha_fin ?? '')
        setMoneda(p.moneda ?? 'UYU')
        setEstado(p.estado ?? 'borrador')
        if (p.clientes) setClienteQuery(p.clientes.empresa || p.clientes.nombre || '')

        // Rebuild plan from saved items
        const saved: SavedItem[] = pData.items ?? []
        const items: PlanItem[] = saved.map((it, i) => {
          const matched = soportes.find(s => s.id === it.soporte_id) ??
            soportes.find(s => s.nombre === it.nombre_soporte && (s.ubicacion ?? '') === (it.ubicacion ?? ''))
          const fallback: Soporte = matched ?? {
            id: it.soporte_id ?? `legacy-${i}`,
            cotizador_id: null,
            nombre: it.nombre_soporte,
            categoria: it.categoria_soporte ?? 'Otro',
            seccion: null,
            tipo_cotizador: it.tipo_cotizador ?? null,
            ubicacion: it.ubicacion,
            precio_semanal: it.precio_unitario,
            tiene_iva: false,
            salidas_por_hora: null,
            horas_encendido: null,
            impactos_mensuales: null,
            costo_produccion: null,
            impuestos_municipales: null,
            cantidad_default: 1,
            semanas_minimas: 1,
            temporada_alta: false,
            temporada_baja: false,
            comentario: null,
            url_imagen: null,
            activo: true,
          }
          return {
            uid: ++uidRef.n,
            soporte: fallback,
            semanas: it.semanas || 1,
            salidasElegidas: it.salidas_elegidas ?? (isLed(fallback) ? 30 : isCircuito(fallback) ? 10 : null),
            cantidadSoportes: it.cantidad_soportes ?? it.cantidad ?? 1,
          }
        })
        setPlan(items)
      } else if (isNew) {
        const today = new Date()
        const in4w  = new Date(today.getTime() + 28 * 86400000)
        setFechaInicio(today.toISOString().slice(0, 10))
        setFechaFin(in4w.toISOString().slice(0, 10))
        if (initialLeadId) setLeadId(initialLeadId)
        if (initialClienteId) {
          setClienteId(initialClienteId)
          const cli = (cData.clientes ?? []).find((c: Cliente) => c.id === initialClienteId)
          if (cli) setClienteQuery(cli.empresa || cli.nombre || '')
        }
      }
      setLoadingInit(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propuestaId])

  // ── Derived ────────────────────────────────────────────────────────────────

  const semanasGlobal = getSemanasFromDates(fechaInicio, fechaFin)

  const calcs = useMemo(() => plan.map(it => ({ item: it, c: calcItem(it) })), [plan])

  const totals = useMemo(() => {
    const acc = { arr: 0, iva: 0, prod: 0, mun: 0, imp: 0, tot: 0 }
    calcs.forEach(({ c }) => {
      acc.arr  += c.arr
      acc.iva  += c.ivaArr
      acc.prod += c.prod + c.ivaProd
      acc.mun  += c.mun
      acc.imp  += c.imp
      acc.tot  += c.tot
    })
    return acc
  }, [calcs])

  const cpmGlobal = totals.imp > 0 ? (totals.tot / totals.imp) * 1000 : null

  // ── Catalog filtering ──────────────────────────────────────────────────────

  const categories = useMemo(
    () => Array.from(new Set(catalog.map(s => displayCat(s)))).sort(),
    [catalog]
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return catalog.filter(s => {
      const matchSearch = !q ||
        s.nombre.toLowerCase().includes(q) ||
        (s.ubicacion ?? '').toLowerCase().includes(q)
      const matchCat = !catFilter || displayCat(s) === catFilter
      return matchSearch && matchCat && s.activo !== false
    })
  }, [catalog, search, catFilter])

  // ── Plan actions ───────────────────────────────────────────────────────────

  function addToPlan(s: Soporte) {
    setPlan(prev => {
      const idx = prev.findIndex(it => it.soporte.id === s.id)
      if (idx >= 0) {
        const updated = [...prev]
        updated[idx] = { ...updated[idx], cantidadSoportes: updated[idx].cantidadSoportes + 1 }
        return updated
      }
      return [...prev, {
        uid: ++uidRef.n,
        soporte: s,
        semanas: Math.max(semanasGlobal, s.semanas_minimas || 1),
        salidasElegidas: isLed(s) ? 30 : isCircuito(s) ? 10 : null,
        cantidadSoportes: s.cantidad_default || 1,
      }]
    })
  }

  function updItem(uid: number, field: 'semanas' | 'salidasElegidas' | 'cantidadSoportes', val: number) {
    setPlan(prev => prev.map(it => it.uid === uid ? { ...it, [field]: val } : it))
  }

  function removeItem(uid: number) {
    setPlan(prev => prev.filter(it => it.uid !== uid))
  }

  // ── Client search ──────────────────────────────────────────────────────────

  function onClienteInput(val: string) {
    setClienteQuery(val)
    if (!val) { setClienteSuggs([]); return }
    const q = val.toLowerCase()
    setClienteSuggs(clientes.filter(c =>
      c.nombre.toLowerCase().includes(q) || (c.empresa ?? '').toLowerCase().includes(q)
    ).slice(0, 6))
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function save(newEstado?: string): Promise<string | null> {
    setSaving(true)
    const items = calcs.map(({ item, c }) => ({
      soporte_id:        item.soporte.id.startsWith('legacy-') ? null : item.soporte.id,
      nombre_soporte:    item.soporte.nombre,
      ubicacion:         item.soporte.ubicacion ?? null,
      categoria_soporte: item.soporte.categoria,
      tipo_cotizador:    item.soporte.tipo_cotizador,
      cantidad:          item.cantidadSoportes,
      cantidad_soportes: item.cantidadSoportes,
      salidas_elegidas:  item.salidasElegidas,
      semanas:           c.sem,
      precio_unitario:   item.soporte.precio_semanal ?? 0,
      subtotal:          c.tot,
      impactos_calc:     c.imp,
    }))

    const payload = {
      nombre:         nombre || null,
      marca:          marca || null,
      observaciones:  observaciones || null,
      cliente_id:     clienteId || null,
      lead_id:        leadId || null,
      fecha_inicio:   fechaInicio || null,
      fecha_fin:      fechaFin || null,
      estado:         newEstado ?? estado,
      moneda,
      monto_neto:     totals.arr + totals.prod - (totals.prod * IVA_RATE / (1 + IVA_RATE)),  // rough net
      monto_total:    totals.tot,
      monto_impactos: totals.imp,
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

  async function aprobar() {
    if (!confirm('¿Aprobar esta cotización y generar la OIC?')) return
    const id = await save()
    if (!id) return
    const res = await fetch(`/api/propuestas/${id}/aprobar`, { method: 'POST' })
    const data = await res.json()
    if (data.orden_id) router.push(`/dashboard/ventas/${data.orden_id}`)
  }

  // ── PDF ────────────────────────────────────────────────────────────────────

  function exportPDF() {
    const numero = propuesta?.numero ?? 'BORRADOR'
    const sym = moneda === 'USD' ? 'U$S' : '$'
    const rows = calcs.map(({ item, c }) => `
      <tr>
        <td><strong>${item.soporte.nombre}</strong><br><span style="color:#6b7280;font-size:10px">${item.soporte.ubicacion ?? ''}</span></td>
        <td style="font-size:11px;color:#6b7280">${displayCat(item.soporte)}</td>
        <td style="text-align:center">${item.cantidadSoportes}</td>
        <td style="text-align:center">${c.sem}</td>
        ${item.salidasElegidas ? `<td style="text-align:center">${item.salidasElegidas}</td>` : '<td style="text-align:center;color:#9ca3af">—</td>'}
        <td style="text-align:right">${sym} ${Math.round(c.arr).toLocaleString('es-UY')}</td>
        <td style="text-align:right">${c.prod ? `${sym} ${Math.round(c.prod).toLocaleString('es-UY')}` : '—'}</td>
        <td style="text-align:right">${c.mun ? `${sym} ${Math.round(c.mun).toLocaleString('es-UY')}` : '—'}</td>
        <td style="text-align:right">${(c.ivaArr + c.ivaProd) ? `${sym} ${Math.round(c.ivaArr + c.ivaProd).toLocaleString('es-UY')}` : '—'}</td>
        <td style="text-align:right;font-weight:600">${sym} ${Math.round(c.tot).toLocaleString('es-UY')}</td>
        <td style="text-align:right;color:#6b7280;font-size:11px">${c.imp ? c.imp.toLocaleString('es-UY') : '—'}</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Cotización ${numero}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:0;padding:20px}
      h1{font-size:20px;margin:0 0 4px} .sub{color:#6b7280;font-size:12px;margin:0 0 20px}
      .kpi{display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap}
      .kpi-box{flex:1;min-width:140px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px}
      .kpi-label{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px}
      .kpi-value{font-size:16px;font-weight:700;color:#111;margin-top:4px}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th{background:#f3f4f6;padding:6px 8px;text-align:left;border-bottom:1px solid #e5e7eb;font-size:10px;text-transform:uppercase;color:#6b7280}
      td{padding:6px 8px;border-bottom:1px solid #f3f4f6;vertical-align:top}
      .totals{background:#111827;color:#fff;padding:12px 20px;border-radius:8px;display:flex;gap:24px;margin-top:16px;justify-content:flex-end;flex-wrap:wrap}
      .t-label{font-size:10px;opacity:.6;margin-bottom:2px}
      .t-value{font-size:14px;font-weight:700}
      .footer{margin-top:24px;font-size:10px;color:#9ca3af;text-align:center}
    </style></head><body>
    <h1>Cotización de Campaña — Movimagen</h1>
    <p class="sub">${numero} · ${clienteQuery || '—'}${marca ? ' · ' + marca : ''} · ${fmtDate(fechaInicio)} – ${fmtDate(fechaFin)}</p>
    <div class="kpi">
      <div class="kpi-box"><div class="kpi-label">Inversión Bruta</div><div class="kpi-value">${sym} ${Math.round(totals.arr + totals.prod).toLocaleString('es-UY')}</div></div>
      <div class="kpi-box"><div class="kpi-label">Total con Impuestos</div><div class="kpi-value">${sym} ${Math.round(totals.tot).toLocaleString('es-UY')}</div></div>
      <div class="kpi-box"><div class="kpi-label">Impactos Estimados</div><div class="kpi-value">${totals.imp.toLocaleString('es-UY')}</div></div>
      ${cpmGlobal != null ? `<div class="kpi-box"><div class="kpi-label">CPM</div><div class="kpi-value">${sym} ${cpmGlobal.toFixed(2)}</div></div>` : ''}
    </div>
    <table><thead><tr>
      <th>Soporte</th><th>Categoría</th><th style="text-align:center">Cant.</th>
      <th style="text-align:center">Sem.</th><th style="text-align:center">Salidas</th>
      <th style="text-align:right">Arrendamiento</th><th style="text-align:right">Producción</th>
      <th style="text-align:right">Imp. Mun.</th><th style="text-align:right">IVA</th>
      <th style="text-align:right">Total</th><th style="text-align:right">Impactos</th>
    </tr></thead><tbody>${rows}</tbody></table>
    <div class="totals">
      <div><div class="t-label">Arrendamiento</div><div class="t-value">${sym} ${Math.round(totals.arr).toLocaleString('es-UY')}</div></div>
      <div><div class="t-label">Producción</div><div class="t-value">${sym} ${Math.round(totals.prod).toLocaleString('es-UY')}</div></div>
      <div><div class="t-label">IVA</div><div class="t-value">${sym} ${Math.round(totals.iva + (totals.prod * IVA_RATE / (1 + IVA_RATE))).toLocaleString('es-UY')}</div></div>
      <div><div class="t-label">Imp. Municipal</div><div class="t-value">${sym} ${Math.round(totals.mun).toLocaleString('es-UY')}</div></div>
      <div><div class="t-label">TOTAL</div><div class="t-value">${sym} ${Math.round(totals.tot).toLocaleString('es-UY')}</div></div>
    </div>
    ${observaciones ? `<p style="margin-top:20px;font-size:11px;color:#374151"><strong>Observaciones:</strong> ${observaciones}</p>` : ''}
    <p class="footer">Generado el ${new Date().toLocaleString('es-UY')} · Movimagen CRM</p>
    </body></html>`

    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html); win.document.close(); win.focus()
    setTimeout(() => win.print(), 300)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loadingInit) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 10, color: '#6b7280' }}>
        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Cargando cotizador…
      </div>
    )
  }

  const inPlanIds = new Set(plan.map(it => it.soporte.id))

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
        <span style={{
          padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
          background: estado === 'aceptada' ? '#f0fdf4' : estado === 'enviada' ? '#eff6ff' : estado === 'rechazada' ? '#fef2f2' : '#f1f5f9',
          color: estado === 'aceptada' ? '#16a34a' : estado === 'enviada' ? '#2563eb' : estado === 'rechazada' ? '#dc2626' : '#475569',
        }}>
          {estado === 'borrador' ? 'Borrador' : estado === 'enviada' ? 'Enviada' : estado === 'aceptada' ? 'Aceptada' : 'Rechazada'}
        </span>

        <div style={{ flex: 1 }} />

        <button onClick={exportPDF} disabled={plan.length === 0}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, border: '1px solid #d1d5db', background: '#fff', color: '#374151', fontSize: 12, cursor: plan.length === 0 ? 'not-allowed' : 'pointer', opacity: plan.length === 0 ? 0.5 : 1 }}>
          <Download size={14} /> PDF
        </button>

        {estado === 'borrador' && (
          <button onClick={() => save('enviada')} disabled={saving || plan.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, border: '1px solid #2563eb', background: '#eff6ff', color: '#2563eb', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Send size={14} /> Marcar enviada
          </button>
        )}

        {canApprove && (estado === 'enviada' || estado === 'borrador') && (
          <button onClick={aprobar} disabled={saving || plan.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <CheckCircle size={14} /> Aprobar → OIC
          </button>
        )}

        <button onClick={() => save().then(id => { if (id && isNew) router.replace(`/dashboard/cotizaciones/${id}`) })} disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 7, border: 'none', background: '#111827', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          {saving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      {/* ── Header form ── */}
      <div style={{ display: 'flex', gap: 12, padding: '12px 20px', borderBottom: '1px solid #f3f4f6', background: '#fafafa', flexShrink: 0, flexWrap: 'wrap' }}>
        <div style={{ flex: 2, minWidth: 160 }}>
          <label style={lblSt}>Nombre campaña</label>
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Campaña Verano 2026" style={inputSt} />
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label style={lblSt}>Marca</label>
          <input value={marca} onChange={e => setMarca(e.target.value)} placeholder="Marca / producto" style={inputSt} />
        </div>
        <div style={{ flex: 2, minWidth: 160, position: 'relative' }}>
          <label style={lblSt}>Cliente</label>
          <input value={clienteQuery} onChange={e => onClienteInput(e.target.value)} placeholder="Buscar cliente…" style={inputSt} />
          {clienteSuggs.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 7, boxShadow: '0 4px 12px rgba(0,0,0,0.1)', zIndex: 50, marginTop: 2 }}>
              {clienteSuggs.map(c => (
                <button key={c.id} onClick={() => { setClienteId(c.id); setClienteQuery(c.empresa || c.nombre); setClienteSuggs([]) }}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #f3f4f6' }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                  {c.empresa || c.nombre}
                  {c.empresa && <span style={{ color: '#9ca3af', marginLeft: 6 }}>{c.nombre}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 110 }}>
          <label style={lblSt}>Inicio</label>
          <input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} style={inputSt} />
        </div>
        <div style={{ flex: 1, minWidth: 110 }}>
          <label style={lblSt}>Fin</label>
          <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} style={inputSt} />
        </div>
        <div style={{ minWidth: 70 }}>
          <label style={lblSt}>Moneda</label>
          <select value={moneda} onChange={e => setMoneda(e.target.value)} style={inputSt}>
            <option value="UYU">UYU</option>
            <option value="USD">USD</option>
          </select>
        </div>
        {fechaInicio && fechaFin && (
          <div style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 6 }}>
            <span style={{ fontSize: 11, color: '#6b7280', background: '#f1f5f9', padding: '4px 8px', borderRadius: 5 }}>
              {semanasGlobal} sem. base
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
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar soporte…"
                style={{ width: '100%', paddingLeft: 28, paddingRight: 10, height: 32, border: '1px solid #e5e7eb', borderRadius: 6, fontSize: 12, background: '#fff', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              <button onClick={() => setCatFilter('')} style={{ ...catBtnSt, background: !catFilter ? '#111827' : '#fff', color: !catFilter ? '#fff' : '#374151', borderColor: !catFilter ? '#111827' : '#d1d5db' }}>Todas</button>
              {categories.map(c => (
                <button key={c} onClick={() => setCatFilter(c === catFilter ? '' : c)}
                  style={{ ...catBtnSt, background: catFilter === c ? '#111827' : '#fff', color: catFilter === c ? '#fff' : '#374151', borderColor: catFilter === c ? '#111827' : '#d1d5db', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={c}>
                  {c.split(' ').slice(0, 2).join(' ')}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
            {filtered.length === 0 && (
              <div style={{ textAlign: 'center', padding: 20, color: '#9ca3af', fontSize: 12 }}>Sin resultados</div>
            )}
            {filtered.map(s => {
              const inP = inPlanIds.has(s.id)
              return (
                <div key={s.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '7px 8px', borderRadius: 7, marginBottom: 2, background: inP ? '#eff6ff' : '#fff', border: `1px solid ${inP ? '#bfdbfe' : '#f3f4f6'}` }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: CAT_COLORS[s.categoria] ?? '#94a3b8', marginTop: 6, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', lineHeight: 1.3 }}>{s.nombre}</div>
                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.ubicacion}</div>
                    <div style={{ fontSize: 10, color: '#374151', marginTop: 2 }}>
                      $ {Math.round(s.precio_semanal ?? 0).toLocaleString('es-UY')}<span style={{ color: '#9ca3af' }}>/sem</span>
                      {s.costo_produccion && s.costo_produccion > 0 && <span style={{ color: '#9ca3af', marginLeft: 4 }}>+ prod. ${Math.round(s.costo_produccion).toLocaleString('es-UY')}</span>}
                      {s.semanas_minimas && s.semanas_minimas > 1 && <span style={{ color: '#dc2626', marginLeft: 4 }}>· mín {s.semanas_minimas}sem</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 3, flexShrink: 0, flexDirection: 'column', alignItems: 'flex-end' }}>
                    {s.tiene_iva && <span style={{ fontSize: 9, padding: '1px 4px', background: '#fef9c3', color: '#a16207', borderRadius: 3, fontWeight: 600 }}>IVA</span>}
                    {s.temporada_alta && <span style={{ fontSize: 9, padding: '1px 4px', background: '#fee2e2', color: '#b91c1c', borderRadius: 3, fontWeight: 600 }}>T.A.</span>}
                    {s.temporada_baja && <span style={{ fontSize: 9, padding: '1px 4px', background: '#dbeafe', color: '#1e40af', borderRadius: 3, fontWeight: 600 }}>T.B.</span>}
                  </div>
                  <button onClick={() => addToPlan(s)}
                    style={{ width: 26, height: 26, borderRadius: 6, border: 'none', background: inP ? '#2563eb' : '#111827', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Plus size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: Plan + KPI */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0 }}>
            {(['plan', 'kpi'] as const).map(t => (
              <button key={t} onClick={() => setActiveTab(t)}
                style={{ padding: '10px 20px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, borderBottom: `2px solid ${activeTab === t ? '#111827' : 'transparent'}`, color: activeTab === t ? '#111827' : '#9ca3af', display: 'flex', alignItems: 'center', gap: 6 }}>
                {t === 'plan' ? `Plan (${plan.length})` : <><BarChart3 size={14} /> Análisis</>}
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
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {calcs.map(({ item, c }) => {
                    const s = item.soporte
                    const step = isLed(s) ? 30 : isCircuito(s) ? 10 : null
                    return (
                      <div key={item.uid} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 14, display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <div style={{ width: 4, height: 16, borderRadius: 2, background: CAT_COLORS[s.categoria] ?? '#94a3b8' }} />
                            <span style={{ fontSize: 9, fontWeight: 700, color: CAT_COLORS[s.categoria] ?? '#94a3b8', letterSpacing: '.04em', textTransform: 'uppercase' }}>{s.categoria}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>{s.nombre}</span>
                          </div>
                          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>{s.ubicacion}</div>

                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <label style={miniLblSt}>Semanas{s.semanas_minimas && s.semanas_minimas > 1 ? ` (mín ${s.semanas_minimas})` : ''}</label>
                              <input type="number" min={s.semanas_minimas ?? 1} value={item.semanas} style={miniInputSt}
                                onChange={e => updItem(item.uid, 'semanas', Math.max(s.semanas_minimas ?? 1, Number(e.target.value) || 1))} />
                            </div>
                            {step && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <label style={miniLblSt}>Salidas (cada {step})</label>
                                <input type="number" min={step} step={step} value={item.salidasElegidas ?? step} style={miniInputSt}
                                  onChange={e => updItem(item.uid, 'salidasElegidas', Math.max(step, Number(e.target.value) || step))} />
                              </div>
                            )}
                            {hasCantidad(s) && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                <label style={miniLblSt}>Cantidad</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <button onClick={() => updItem(item.uid, 'cantidadSoportes', Math.max(1, item.cantidadSoportes - 1))} style={qtyBtnSt}><Minus size={11} /></button>
                                  <input type="number" min={1} value={item.cantidadSoportes} style={{ ...miniInputSt, width: 56, textAlign: 'center' }}
                                    onChange={e => updItem(item.uid, 'cantidadSoportes', Math.max(1, Number(e.target.value) || 1))} />
                                  <button onClick={() => updItem(item.uid, 'cantidadSoportes', item.cantidadSoportes + 1)} style={qtyBtnSt}><Plus size={11} /></button>
                                </div>
                              </div>
                            )}
                          </div>

                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 10, fontSize: 11, color: '#6b7280' }}>
                            <span>Arrendam.: <strong style={{ color: '#111827' }}>{fmt(c.arr, moneda)}</strong></span>
                            {c.prod > 0 && <span>Producción: <strong style={{ color: '#111827' }}>{fmt(c.prod, moneda)}</strong></span>}
                            {c.mun > 0 && <span>Imp. Mun.: <strong style={{ color: '#111827' }}>{fmt(c.mun, moneda)}</strong></span>}
                            {(c.ivaArr + c.ivaProd) > 0 && <span>IVA: <strong style={{ color: '#111827' }}>{fmt(c.ivaArr + c.ivaProd, moneda)}</strong></span>}
                            {c.imp > 0 && <span>{c.imp.toLocaleString('es-UY')} impactos</span>}
                            {c.cpm > 0 && <span>CPM <strong style={{ color: '#111827' }}>${c.cpm.toFixed(2)}</strong></span>}
                          </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between' }}>
                          <button onClick={() => removeItem(item.uid)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', padding: 3, borderRadius: 4 }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                            onMouseLeave={e => (e.currentTarget.style.color = '#d1d5db')}>
                            <Trash2 size={14} />
                          </button>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px' }}>Total</div>
                            <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{fmt(c.tot, moneda)}</div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <KpiTab plan={plan} calcs={calcs} totals={totals} cpm={cpmGlobal} moneda={moneda} />
          )}

          {/* Bottom totals bar */}
          {plan.length > 0 && (
            <div style={{ display: 'flex', gap: 24, padding: '12px 20px', borderTop: '1px solid #e5e7eb', background: '#111827', color: '#fff', flexShrink: 0, flexWrap: 'wrap' }}>
              {[
                { label: 'Arrendam.', value: fmt(totals.arr, moneda) },
                { label: 'Producción', value: fmt(totals.prod, moneda) },
                { label: 'IVA', value: fmt(totals.iva + (totals.prod * IVA_RATE / (1 + IVA_RATE)), moneda) },
                { label: 'Imp. Mun.', value: fmt(totals.mun, moneda) },
                { label: 'TOTAL', value: fmt(totals.tot, moneda), bold: true },
              ].map(({ label, value, bold }) => (
                <div key={label}>
                  <div style={{ fontSize: 9, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
                  <div style={{ fontSize: bold ? 16 : 13, fontWeight: bold ? 700 : 500, marginTop: 2 }}>{value}</div>
                </div>
              ))}
              <div style={{ marginLeft: 'auto' }}>
                <div style={{ fontSize: 9, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '.5px' }}>Impactos</div>
                <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>{totals.imp.toLocaleString('es-UY')}</div>
              </div>
              {cpmGlobal != null && (
                <div>
                  <div style={{ fontSize: 9, opacity: 0.5, textTransform: 'uppercase', letterSpacing: '.5px' }}>CPM</div>
                  <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>{fmt(cpmGlobal, moneda)}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── KPI / charts tab ─────────────────────────────────────────────────────────

function KpiTab({
  plan, calcs, totals, cpm, moneda,
}: {
  plan: PlanItem[]
  calcs: { item: PlanItem; c: Calc }[]
  totals: { arr: number; iva: number; prod: number; mun: number; imp: number; tot: number }
  cpm: number | null
  moneda: string
}) {
  if (plan.length === 0) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', flexDirection: 'column', gap: 10, padding: 40 }}>
        <BarChart3 size={40} />
        <p style={{ fontSize: 13 }}>Agregá soportes para ver el análisis</p>
      </div>
    )
  }

  // Aggregate by categoria
  const byCat: Record<string, { arr: number; imp: number; soportes: number; cant: number }> = {}
  calcs.forEach(({ item, c }) => {
    const k = item.soporte.categoria
    if (!byCat[k]) byCat[k] = { arr: 0, imp: 0, soportes: 0, cant: 0 }
    byCat[k].arr      += c.arr
    byCat[k].imp      += c.imp
    byCat[k].soportes += 1
    byCat[k].cant     += item.cantidadSoportes
  })
  const cats = Object.keys(byCat)

  // Donut data
  const donutInversion = cats.map(c => ({ name: c, value: byCat[c].arr, color: CAT_COLORS[c] ?? '#94a3b8' }))
  const donutImpactos  = cats.filter(c => byCat[c].imp > 0).map(c => ({ name: c, value: byCat[c].imp, color: CAT_COLORS[c] ?? '#94a3b8' }))

  // Cumulative impacts by week
  const maxSem = Math.max(...calcs.map(({ c }) => c.sem), 4)
  const proyData: { semana: string; impactos: number }[] = []
  for (let w = 1; w <= maxSem; w++) {
    let acc = 0
    calcs.forEach(({ item, c }) => {
      if (!item.soporte.impactos_mensuales) return
      acc += Math.round(c.imp * Math.min(w, c.sem) / c.sem)
    })
    proyData.push({ semana: `S${w}`, impactos: acc })
  }

  // Eficiencia: bar chart inversión vs impactos por categoría
  const eficData = cats.map(c => ({
    cat: c,
    inversion: byCat[c].arr,
    impactos:  byCat[c].imp,
    color:     CAT_COLORS[c] ?? '#94a3b8',
  }))

  // Alcance por soporte (only those with impacts)
  const alcanceData = calcs
    .filter(({ item }) => item.soporte.impactos_mensuales)
    .map(({ item, c }) => ({
      nombre: truncate(`${item.soporte.nombre} · ${item.soporte.ubicacion ?? ''}`, 32),
      impactos: c.imp,
      color: CAT_COLORS[item.soporte.categoria] ?? '#94a3b8',
    }))
    .sort((a, b) => b.impactos - a.impactos)
    .slice(0, 12)

  // CPM por soporte
  const cpmData = calcs
    .filter(({ c }) => c.cpm > 0)
    .map(({ item, c }) => ({
      nombre: truncate(`${item.soporte.nombre} · ${item.soporte.ubicacion ?? ''}`, 32),
      cpm: parseFloat(c.cpm.toFixed(2)),
      color: CAT_COLORS[item.soporte.categoria] ?? '#94a3b8',
    }))
    .sort((a, b) => a.cpm - b.cpm)
    .slice(0, 12)

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 20, background: '#fafafa' }}>
      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Inversión Bruta', value: fmt(totals.arr + totals.prod, moneda), sub: 'Arrendam. + Producción' },
          { label: 'Total con Impuestos', value: fmt(totals.tot, moneda), sub: `IVA ${fmt(totals.iva + totals.prod * IVA_RATE / (1 + IVA_RATE), moneda)}` },
          { label: 'Impactos', value: fmtM(totals.imp), sub: 'Estimados' },
          ...(cpm != null ? [{ label: 'CPM', value: fmt(cpm, moneda), sub: 'Costo por mil' }] : []),
          { label: 'Soportes', value: String(plan.length), sub: `${plan.reduce((a, it) => a + it.cantidadSoportes, 0)} unidades` },
        ].map(({ label, value, sub }) => (
          <div key={label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px' }}>
            <div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px' }}>{label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: '6px 0 2px' }}>{value}</div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Donuts row */}
      <div style={{ display: 'grid', gridTemplateColumns: donutImpactos.length ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 12 }}>
        <ChartBox title="Inversión por categoría" sub={fmt(totals.arr, moneda) + ' total'}>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={donutInversion} dataKey="value" innerRadius={50} outerRadius={75} paddingAngle={2}>
                {donutInversion.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip formatter={(v: any) => fmt(v, moneda)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartBox>

        {donutImpactos.length > 0 && (
          <ChartBox title="Impactos por categoría" sub={fmtM(totals.imp) + ' totales'}>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={donutImpactos} dataKey="value" innerRadius={50} outerRadius={75} paddingAngle={2}>
                  {donutImpactos.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip formatter={(v: any) => fmtM(v) + ' imp.'} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </ChartBox>
        )}
      </div>

      {/* Cumulative impacts projection */}
      {donutImpactos.length > 0 && (
        <ChartBox title="Proyección acumulada de impactos" sub="Crecimiento durante la campaña">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={proyData}>
              <CartesianGrid stroke="#f3f4f6" />
              <XAxis dataKey="semana" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtK(v)} />
              <Tooltip formatter={(v: any) => fmtM(v)} />
              <Line type="monotone" dataKey="impactos" stroke="#FF5C1A" strokeWidth={2} fill="rgba(255,92,26,0.07)" dot={{ r: 3, fill: '#FF5C1A' }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartBox>
      )}

      {/* Eficiencia by category */}
      <ChartBox title="Eficiencia global" sub="Inversión vs. Impactos por categoría">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={eficData}>
            <CartesianGrid stroke="#f3f4f6" />
            <XAxis dataKey="cat" tick={{ fontSize: 10 }} />
            <YAxis yAxisId="left"  tick={{ fontSize: 10 }} tickFormatter={v => fmtK(v)} />
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => fmtK(v)} />
            <Tooltip formatter={(v: any) => fmtK(v)} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar yAxisId="left"  dataKey="inversion" name="Inversión" radius={[4, 4, 0, 0]}>
              {eficData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Bar>
            <Bar yAxisId="right" dataKey="impactos" name="Impactos" radius={[4, 4, 0, 0]} fillOpacity={0.4}>
              {eficData.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartBox>

      {/* Alcance por soporte */}
      {alcanceData.length > 0 && (
        <ChartBox title="Alcance por soporte" sub="Top impactos estimados">
          <ResponsiveContainer width="100%" height={Math.max(180, alcanceData.length * 32)}>
            <BarChart data={alcanceData} layout="vertical" margin={{ left: 90 }}>
              <CartesianGrid stroke="#f3f4f6" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => fmtK(v)} />
              <YAxis dataKey="nombre" type="category" tick={{ fontSize: 10 }} width={180} />
              <Tooltip formatter={(v: any) => fmtM(v) + ' imp.'} />
              <Bar dataKey="impactos" radius={[0, 4, 4, 0]}>
                {alcanceData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartBox>
      )}

      {/* CPM por soporte */}
      {cpmData.length > 0 && (
        <ChartBox title="CPM por soporte" sub="Costo por mil impactos · menor es mejor">
          <ResponsiveContainer width="100%" height={Math.max(180, cpmData.length * 32)}>
            <BarChart data={cpmData} layout="vertical" margin={{ left: 90 }}>
              <CartesianGrid stroke="#f3f4f6" />
              <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => '$' + v} />
              <YAxis dataKey="nombre" type="category" tick={{ fontSize: 10 }} width={180} />
              <Tooltip formatter={(v: any) => '$' + v} />
              <Bar dataKey="cpm" radius={[0, 4, 4, 0]}>
                {cpmData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartBox>
      )}

      {/* Category breakdown table */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginTop: 12 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: '#374151', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '.05em' }}>Detalle por categoría</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              {['Categoría', 'Soportes', 'Inversión', 'Impactos', '% del total'].map(h => (
                <th key={h} style={{ padding: '7px 10px', textAlign: h === 'Categoría' ? 'left' : 'right', fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cats.sort((a, b) => byCat[b].arr - byCat[a].arr).map(c => (
              <tr key={c} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '8px 10px' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: CAT_COLORS[c] ?? '#94a3b8', marginRight: 6 }} />
                  {c}
                </td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: '#6b7280' }}>{byCat[c].cant}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{fmt(byCat[c].arr, moneda)}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right' }}>{byCat[c].imp ? fmtM(byCat[c].imp) : '—'}</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', color: '#6b7280' }}>
                  {totals.arr > 0 ? `${((byCat[c].arr / totals.arr) * 100).toFixed(1)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ChartBox({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16, marginBottom: 12 }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.05em' }}>{title}</div>
        {sub && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
      </div>
      {children}
    </div>
  )
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}

// ─── Micro styles ─────────────────────────────────────────────────────────────

const inputSt: React.CSSProperties = {
  width: '100%', height: 32, border: '1px solid #e5e7eb', borderRadius: 6,
  padding: '0 8px', fontSize: 12, background: '#fff', boxSizing: 'border-box',
}
const lblSt: React.CSSProperties = {
  fontSize: 10, color: '#9ca3af', textTransform: 'uppercase',
  letterSpacing: '.5px', display: 'block', marginBottom: 3,
}
const miniLblSt: React.CSSProperties = {
  fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.5px',
}
const miniInputSt: React.CSSProperties = {
  width: 80, height: 28, border: '1px solid #e5e7eb', borderRadius: 5,
  padding: '0 6px', fontSize: 12, background: '#fff', boxSizing: 'border-box',
}
const catBtnSt: React.CSSProperties = {
  padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 500,
  border: '1px solid', cursor: 'pointer',
}
const qtyBtnSt: React.CSSProperties = {
  width: 22, height: 22, border: '1px solid #e5e7eb', borderRadius: 4,
  background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
}
