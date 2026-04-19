'use client'

import { useEffect, useState } from 'react'
import { Plus, X, Edit2, Trash2, Download } from 'lucide-react'

const fmt = (n: number) => '$' + n.toLocaleString('es-UY', { maximumFractionDigits: 0 })
const fmtPct = (n: number) => `${Number(n).toFixed(2)}%`

const y = new Date().getFullYear()
const QUARTER_OPTIONS = [
  { value: `Q1-${y}`, label: `Q1-${y}` },
  { value: `Q2-${y}`, label: `Q2-${y}` },
  { value: `Q3-${y}`, label: `Q3-${y}` },
  { value: `Q1-${y - 1}`, label: `Q1-${y - 1}` },
  { value: `Q2-${y - 1}`, label: `Q2-${y - 1}` },
  { value: `Q3-${y - 1}`, label: `Q3-${y - 1}` },
]

interface Shopping { id: string; nombre: string; porcentaje_canon: number; activo: boolean }
interface Soporte { id: string; nombre: string; categoria: string; ubicacion: string | null; canon_shopping_id: string | null }
interface ReportRow { id: string; nombre: string; porcentaje_canon: number; soportes: string[]; revenue: number; canon: number }

export default function CanonClient() {
  const [tab, setTab] = useState<'shoppings' | 'calculo'>('shoppings')
  const [shoppings, setShoppings] = useState<Shopping[]>([])
  const [soportes, setSoportes] = useState<Soporte[]>([])
  const [loadingShoppings, setLoadingShoppings] = useState(true)

  // Form state
  const [showForm, setShowForm] = useState(false)
  const [editShopping, setEditShopping] = useState<Shopping | null>(null)
  const [formNombre, setFormNombre] = useState('')
  const [formPct, setFormPct] = useState('')
  const [formError, setFormError] = useState('')
  const [formSaving, setFormSaving] = useState(false)

  // Soporte assignment
  const [assigningShopping, setAssigningShopping] = useState<Shopping | null>(null)
  const [searchSoporte, setSearchSoporte] = useState('')

  // Calculo
  const [cuatrimestre, setCuatrimestre] = useState(QUARTER_OPTIONS[0].value)
  const [report, setReport] = useState<ReportRow[] | null>(null)
  const [reportRange, setReportRange] = useState<{ start: string; end: string } | null>(null)
  const [loadingReport, setLoadingReport] = useState(false)

  useEffect(() => {
    fetch('/api/admin/canon-shoppings').then(r => r.json()).then(d => { setShoppings(d); setLoadingShoppings(false) }).catch(() => setLoadingShoppings(false))
    fetch('/api/soportes?all=true').then(r => r.json()).then(d => setSoportes(Array.isArray(d?.soportes) ? d.soportes : [])).catch(() => {})
  }, [])

  async function saveShopping() {
    if (!formNombre.trim()) { setFormError('El nombre es obligatorio'); return }
    setFormSaving(true); setFormError('')
    try {
      if (editShopping) {
        const res = await fetch(`/api/admin/canon-shoppings/${editShopping.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: formNombre.trim(), porcentaje_canon: parseFloat(formPct) || 0 }),
        })
        if (!res.ok) { setFormError('Error al guardar'); return }
        setShoppings(prev => prev.map(s => s.id === editShopping.id ? { ...s, nombre: formNombre.trim(), porcentaje_canon: parseFloat(formPct) || 0 } : s))
      } else {
        const res = await fetch('/api/admin/canon-shoppings', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: formNombre.trim(), porcentaje_canon: parseFloat(formPct) || 0 }),
        })
        if (!res.ok) { setFormError('Error al guardar'); return }
        const created = await res.json()
        setShoppings(prev => [...prev, created])
      }
      setShowForm(false); setEditShopping(null); setFormNombre(''); setFormPct('')
    } finally { setFormSaving(false) }
  }

  async function deleteShopping(id: string, nombre: string) {
    if (!confirm(`¿Eliminar shopping "${nombre}"? Los soportes asignados quedarán sin shopping.`)) return
    const res = await fetch(`/api/admin/canon-shoppings/${id}`, { method: 'DELETE' })
    if (!res.ok) { alert('Error al eliminar'); return }
    setShoppings(prev => prev.filter(s => s.id !== id))
    setSoportes(prev => prev.map(s => s.canon_shopping_id === id ? { ...s, canon_shopping_id: null } : s))
  }

  async function toggleSoporte(soporte: Soporte, shoppingId: string) {
    const newVal = soporte.canon_shopping_id === shoppingId ? null : shoppingId
    const res = await fetch(`/api/soportes/${soporte.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ canon_shopping_id: newVal }),
    })
    if (!res.ok) return
    setSoportes(prev => prev.map(s => s.id === soporte.id ? { ...s, canon_shopping_id: newVal } : s))
  }

  async function calcular() {
    setLoadingReport(true); setReport(null)
    try {
      const res = await fetch(`/api/admin/canon-report?cuatrimestre=${cuatrimestre}`)
      const data = await res.json()
      setReport(data.shoppings ?? [])
      setReportRange(data.range ?? null)
    } finally { setLoadingReport(false) }
  }

  function downloadCSV() {
    if (!report) return
    const rows = [
      ['Shopping', 'Canon %', 'Soportes', 'Revenue bruto', 'Canon calculado'],
      ...report.map(r => [r.nombre, fmtPct(r.porcentaje_canon), r.soportes.join(' | '), String(r.revenue), String(r.canon)]),
      ['', '', 'TOTAL', String(report.reduce((s, r) => s + r.revenue, 0)), String(report.reduce((s, r) => s + r.canon, 0))],
    ]
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `canon-${cuatrimestre}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const tabBtn = (t: typeof tab): React.CSSProperties => ({
    padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: tab === t ? 700 : 500, fontFamily: 'Montserrat, sans-serif',
    background: tab === t ? 'var(--orange)' : 'transparent',
    color: tab === t ? '#fff' : 'var(--text-secondary)',
  })

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8,
    fontSize: 13, fontFamily: 'Montserrat, sans-serif', outline: 'none', boxSizing: 'border-box',
  }

  const filteredSoportes = soportes.filter(s =>
    !searchSoporte || s.nombre.toLowerCase().includes(searchSoporte.toLowerCase()) || (s.ubicacion ?? '').toLowerCase().includes(searchSoporte.toLowerCase())
  )

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, width: 'fit-content', marginBottom: 24 }}>
        <button style={tabBtn('shoppings')} onClick={() => setTab('shoppings')}>Configurar shoppings</button>
        <button style={tabBtn('calculo')} onClick={() => setTab('calculo')}>Calcular canon</button>
      </div>

      {/* ── SHOPPINGS TAB ── */}
      {tab === 'shoppings' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
              Definí cada shopping con su porcentaje de canon y asignale los soportes correspondientes.
            </p>
            <button
              onClick={() => { setShowForm(true); setEditShopping(null); setFormNombre(''); setFormPct(''); setFormError('') }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--orange)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' }}
            >
              <Plus size={14} /> Nuevo shopping
            </button>
          </div>

          {/* Form */}
          {showForm && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 2, minWidth: 200 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Nombre del shopping</label>
                  <input value={formNombre} onChange={e => setFormNombre(e.target.value)} placeholder="Ej: Tres Cruces" style={inputStyle} />
                </div>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>% Canon</label>
                  <input type="number" value={formPct} onChange={e => setFormPct(e.target.value)} placeholder="0.00" min={0} max={100} step={0.01} style={inputStyle} />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={saveShopping} disabled={formSaving} style={{ padding: '8px 16px', background: 'var(--orange)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' }}>
                    {formSaving ? 'Guardando...' : editShopping ? 'Actualizar' : 'Crear'}
                  </button>
                  <button onClick={() => { setShowForm(false); setEditShopping(null) }} style={{ padding: '8px 14px', border: '1px solid var(--border)', background: '#fff', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
                    Cancelar
                  </button>
                </div>
              </div>
              {formError && <div style={{ marginTop: 8, fontSize: 12, color: '#dc2626' }}>{formError}</div>}
            </div>
          )}

          {/* Shopping cards */}
          {loadingShoppings ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Cargando...</p>
          ) : shoppings.length === 0 ? (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No hay shoppings configurados. Creá el primero.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {shoppings.map(sh => {
                const misSoportes = soportes.filter(s => s.canon_shopping_id === sh.id)
                const isAssigning = assigningShopping?.id === sh.id

                return (
                  <div key={sh.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                    {/* Shopping header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px' }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--text-primary)' }}>{sh.nombre}</span>
                        <span style={{ marginLeft: 10, background: 'var(--orange-pale)', color: 'var(--orange)', fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>
                          {fmtPct(sh.porcentaje_canon)} canon
                        </span>
                        <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                          {misSoportes.length} soporte{misSoportes.length !== 1 ? 's' : ''} asignado{misSoportes.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => setAssigningShopping(isAssigning ? null : sh)}
                          style={{ padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 7, background: isAssigning ? 'var(--orange)' : '#fff', color: isAssigning ? '#fff' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Montserrat, sans-serif' }}
                        >
                          {isAssigning ? 'Cerrar' : 'Asignar soportes'}
                        </button>
                        <button onClick={() => { setEditShopping(sh); setFormNombre(sh.nombre); setFormPct(String(sh.porcentaje_canon)); setShowForm(true) }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 6, color: 'var(--text-muted)' }}><Edit2 size={14} /></button>
                        <button onClick={() => deleteShopping(sh.id, sh.nombre)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 6, color: '#c82f2f' }}><Trash2 size={14} /></button>
                      </div>
                    </div>

                    {/* Soportes asignados (chips) */}
                    {misSoportes.length > 0 && !isAssigning && (
                      <div style={{ padding: '0 18px 14px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {misSoportes.map(s => (
                          <span key={s.id} style={{ fontSize: 11, background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', color: 'var(--text-secondary)' }}>
                            {s.nombre}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Soporte assignment panel */}
                    {isAssigning && (
                      <div style={{ borderTop: '1px solid var(--border)', padding: 16, background: 'var(--bg-app)' }}>
                        <div style={{ marginBottom: 10 }}>
                          <input
                            value={searchSoporte}
                            onChange={e => setSearchSoporte(e.target.value)}
                            placeholder="Buscar soporte por nombre o ubicación..."
                            style={{ ...inputStyle, maxWidth: 400 }}
                          />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
                          {filteredSoportes.map(s => {
                            const isAssigned = s.canon_shopping_id === sh.id
                            const assignedElsewhere = s.canon_shopping_id && s.canon_shopping_id !== sh.id
                            const otherName = assignedElsewhere ? (shoppings.find(x => x.id === s.canon_shopping_id)?.nombre ?? '?') : null
                            return (
                              <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: isAssigned ? 'var(--orange-pale)' : '#fff', border: `1px solid ${isAssigned ? 'var(--orange)' : 'var(--border)'}`, borderRadius: 7, cursor: assignedElsewhere ? 'not-allowed' : 'pointer', opacity: assignedElsewhere ? 0.5 : 1 }}>
                                <input
                                  type="checkbox"
                                  checked={isAssigned}
                                  disabled={!!assignedElsewhere}
                                  onChange={() => toggleSoporte(s, sh.id)}
                                  style={{ accentColor: 'var(--orange)' }}
                                />
                                <div style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.nombre}</div>
                                  {s.ubicacion && <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.ubicacion}</div>}
                                  {otherName && <div style={{ fontSize: 10, color: '#d97706' }}>Asignado a: {otherName}</div>}
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

      {/* ── CALCULO TAB ── */}
      {tab === 'calculo' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Cuatrimestre</label>
              <select value={cuatrimestre} onChange={e => setCuatrimestre(e.target.value)} style={{ padding: '8px 28px 8px 10px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'Montserrat, sans-serif', outline: 'none', appearance: 'none', background: '#fff', backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239a9895' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")", backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}>
                {QUARTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div style={{ alignSelf: 'flex-end' }}>
              <button onClick={calcular} disabled={loadingReport} style={{ padding: '9px 20px', background: 'var(--orange)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: loadingReport ? 'wait' : 'pointer', fontFamily: 'Montserrat, sans-serif', opacity: loadingReport ? 0.7 : 1 }}>
                {loadingReport ? 'Calculando...' : 'Calcular'}
              </button>
            </div>
            {report && (
              <div style={{ alignSelf: 'flex-end' }}>
                <button onClick={downloadCSV} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', border: '1px solid var(--border)', background: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Montserrat, sans-serif', color: 'var(--text-secondary)' }}>
                  <Download size={14} /> Descargar CSV
                </button>
              </div>
            )}
          </div>

          {reportRange && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              Período: <strong>{reportRange.start}</strong> → <strong>{reportRange.end}</strong>
            </p>
          )}

          {report && (
            <>
              {/* KPI totales */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
                {[
                  { label: 'Revenue total', value: fmt(report.reduce((s, r) => s + r.revenue, 0)) },
                  { label: 'Canon total', value: fmt(report.reduce((s, r) => s + r.canon, 0)), color: 'var(--orange)' },
                  { label: 'Shoppings calculados', value: String(report.length) },
                ].map(k => (
                  <div key={k.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{k.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: k.color ?? 'var(--text-primary)' }}>{k.value}</div>
                  </div>
                ))}
              </div>

              {/* Tabla por shopping */}
              <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
                      {['Shopping', '% Canon', 'Soportes asignados', 'Revenue bruto', 'Canon calculado'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.map(r => (
                      <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '13px 16px', fontWeight: 700, color: 'var(--text-primary)' }}>{r.nombre}</td>
                        <td style={{ padding: '13px 16px', color: 'var(--text-secondary)' }}>{fmtPct(r.porcentaje_canon)}</td>
                        <td style={{ padding: '13px 16px', fontSize: 12, color: 'var(--text-muted)', maxWidth: 260 }}>
                          {r.soportes.length > 0 ? r.soportes.join(', ') : <em>Sin soportes asignados</em>}
                        </td>
                        <td style={{ padding: '13px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(r.revenue)}</td>
                        <td style={{ padding: '13px 16px', fontWeight: 800, color: 'var(--orange)' }}>{fmt(r.canon)}</td>
                      </tr>
                    ))}
                    {/* Total row */}
                    <tr style={{ background: 'var(--bg-app)', borderTop: '2px solid var(--border)' }}>
                      <td colSpan={3} style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-primary)', fontSize: 12, textTransform: 'uppercase' }}>Total</td>
                      <td style={{ padding: '12px 16px', fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(report.reduce((s, r) => s + r.revenue, 0))}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 800, color: 'var(--orange)' }}>{fmt(report.reduce((s, r) => s + r.canon, 0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!report && !loadingReport && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              Seleccioná un cuatrimestre y hacé clic en <strong>Calcular</strong> para ver el canon por shopping.
            </div>
          )}
        </>
      )}
    </div>
  )
}
