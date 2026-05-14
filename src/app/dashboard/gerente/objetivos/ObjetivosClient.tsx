'use client'

import { useState, useRef } from 'react'
import { ChevronDown, ChevronRight, Upload, Download, X } from 'lucide-react'

const y = new Date().getFullYear()
const CUATRIMESTRES = [`Q1-${y}`, `Q2-${y}`, `Q3-${y}`]
const fmt = (n: number) => '$' + n.toLocaleString('es-UY', { maximumFractionDigits: 0 })

const ROL_LABELS: Record<string, string> = {
  vendedor: 'Vendedor',
  asistente_ventas: 'Asistente',
  gerente_comercial: 'Gerente',
}

interface Vendedor { id: string; nombre: string; rol: string }

interface ClienteObjetivo {
  vendedor_id: string
  cliente_id: string
  ponderacion_pct: number | null
  objetivo_c1: number | null
  objetivo_c2: number | null
  objetivo_c3: number | null
  clientes: { nombre: string } | { nombre: string }[] | null
}

interface Props {
  vendedores: Vendedor[]
  objMap: Record<string, number>
  clienteObjetivos: ClienteObjetivo[]
}

function clienteNombre(co: ClienteObjetivo): string {
  const c = co.clientes
  if (!c) return 'Cliente sin nombre'
  return Array.isArray(c) ? (c[0]?.nombre ?? '—') : c.nombre
}

// ─── Import Modal ──────────────────────────────────────────────────────────

interface ImportRow {
  agencia?: string
  contacto_agencia?: string
  contacto_cliente?: string
  cliente: string
  ejec_vtas?: string
  ponderacion_pct: number
  c1: number
  c2: number
  c3: number
}

async function downloadTemplate() {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([
    ['AGENCIA', 'CONTACTO AGENCIA', 'CONTACTO CLIENTE', 'CLIENTE', 'EJEC VTAS', 'PORCENTAJE PONDERACIÓN PARA OBJETIVO TOTAL', 'C1', 'C2', 'C3'],
    ['Mediacom', 'Claudia Fernandez', '', 'P&G - Ejercicio Fiscal 30/6', 'Fabián', '33%', 300000, '', ''],
    ['Treintagramedios', 'Virginia Padrón', 'Lenna', 'SBI Seguros', 'Fabián', '100%', '', '', 5250000],
    ['', '', 'Paulina', 'Districo', 'Natalia', '100%', '', '', 1800000],
  ])
  ws['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 20 }, { wch: 30 }, { wch: 15 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Objetivos')
  XLSX.writeFile(wb, 'plantilla_objetivos.xlsx')
}

function parseNumber(v: unknown): number {
  if (v == null || v === '') return 0
  const s = String(v).replace(/[^0-9.,-]/g, '').replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

function parsePercent(v: unknown): number {
  if (v == null || v === '') return 100
  const s = String(v).replace('%', '').trim()
  const n = parseFloat(s)
  if (isNaN(n)) return 100
  // Excel may give 0.33 for "33%" — normalize
  return n <= 1 ? Math.round(n * 100) : Math.round(n)
}

function ImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<ImportRow[] | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null); setSuccess(null); setRows(null)

    try {
      const XLSX = await import('xlsx')
      const ab = await file.arrayBuffer()
      const wb = XLSX.read(ab, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

      const parsed: ImportRow[] = []
      for (const row of data) {
        const cliente = String(row['CLIENTE'] ?? row['Cliente'] ?? row['cliente'] ?? '').trim()
        if (!cliente) continue
        parsed.push({
          agencia: String(row['AGENCIA'] ?? row['Agencia'] ?? row['agencia'] ?? '').trim() || undefined,
          contacto_agencia: String(row['CONTACTO AGENCIA'] ?? row['Contacto Agencia'] ?? row['contacto_agencia'] ?? '').trim() || undefined,
          contacto_cliente: String(row['CONTACTO CLIENTE'] ?? row['Contacto Cliente'] ?? row['contacto_cliente'] ?? '').trim() || undefined,
          cliente,
          ejec_vtas: String(row['EJEC VTAS'] ?? row['Ejec Vtas'] ?? row['ejec_vtas'] ?? '').trim() || undefined,
          ponderacion_pct: parsePercent(row['PORCENTAJE PONDERACIÓN PARA OBJETIVO TOTAL'] ?? row['PORCENTAJE'] ?? row['Ponderacion'] ?? row['ponderacion_pct']),
          c1: parseNumber(row['C1'] ?? row['c1']),
          c2: parseNumber(row['C2'] ?? row['c2']),
          c3: parseNumber(row['C3'] ?? row['c3']),
        })
      }

      if (parsed.length === 0) {
        setError('No se encontraron filas con cliente. Verificá que la columna CLIENTE tenga datos.')
        return
      }
      setRows(parsed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar el archivo')
    }
  }

  async function handleImport() {
    if (!rows?.length) return
    setImporting(true); setError(null)

    const res = await fetch('/api/clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: rows }),
    })
    setImporting(false)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? 'Error al importar')
      return
    }
    setSuccess(`${rows.length} fila(s) importadas correctamente`)
    setTimeout(() => onImported(), 1500)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 14, width: '100%', maxWidth: 700, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 14px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>Importar objetivos desde Excel</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ padding: '20px 20px 24px' }}>
          <div style={{ padding: '12px 14px', background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 16, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <strong>Columnas:</strong>{' '}
            {['AGENCIA', 'CONTACTO AGENCIA', 'CONTACTO CLIENTE', 'CLIENTE', 'EJEC VTAS', 'PORCENTAJE PONDERACIÓN', 'C1', 'C2', 'C3'].map(c => (
              <code key={c} style={{ background: 'var(--border)', padding: '1px 5px', borderRadius: 4, marginRight: 4, fontSize: 11 }}>{c}</code>
            ))}<br />
            La única columna obligatoria es <code style={{ background: 'var(--border)', padding: '1px 5px', borderRadius: 4 }}>CLIENTE</code>. Si la agencia o el cliente ya existen se actualizan; si no, se crean. El vendedor se matchea por nombre (insensible a acentos).
          </div>

          <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
            <button onClick={downloadTemplate} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px',
              border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-card)',
              cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', color: 'var(--text-secondary)',
            }}>
              <Download size={15} /> Descargar plantilla
            </button>
            <input type="file" accept=".xlsx,.xls,.csv" ref={fileRef} onChange={handleFile} style={{ display: 'none' }} />
            <button onClick={() => fileRef.current?.click()} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '9px 16px',
              border: '1.5px dashed var(--border)', borderRadius: 8, background: 'var(--bg-app)',
              cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', color: 'var(--text-secondary)',
            }}>
              <Upload size={15} /> Seleccionar archivo
            </button>
          </div>

          {error && (
            <div style={{ marginBottom: 14, padding: '8px 12px', background: '#fef0f0', border: '1px solid #fca5a5', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>{error}</div>
          )}
          {success && (
            <div style={{ marginBottom: 14, padding: '8px 12px', background: 'rgba(21,128,61,0.08)', border: '1px solid #86efac', borderRadius: 8, fontSize: 12, color: '#15803d', fontWeight: 600 }}>{success}</div>
          )}

          {rows && rows.length > 0 && !success && (
            <>
              <div style={{ marginBottom: 10, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>Vista previa — {rows.length} fila(s)</div>
              <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 20, maxHeight: 320, overflowY: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0 }}>
                      {['Agencia', 'Cliente', 'Vendedor', 'Pond.', 'C1', 'C2', 'C3'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 25).map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{r.agencia ?? '—'}</td>
                        <td style={{ padding: '6px 10px', fontWeight: 600, color: 'var(--text-primary)' }}>{r.cliente}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{r.ejec_vtas ?? '—'}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{r.ponderacion_pct}%</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{r.c1 > 0 ? r.c1.toLocaleString('es-UY') : '—'}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{r.c2 > 0 ? r.c2.toLocaleString('es-UY') : '—'}</td>
                        <td style={{ padding: '6px 10px', color: 'var(--text-secondary)' }}>{r.c3 > 0 ? r.c3.toLocaleString('es-UY') : '—'}</td>
                      </tr>
                    ))}
                    {rows.length > 25 && (
                      <tr><td colSpan={7} style={{ padding: '8px 10px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 11 }}>… y {rows.length - 25} más</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button type="button" onClick={onClose} style={{ padding: '9px 18px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-card)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', color: 'var(--text-secondary)' }}>Cancelar</button>
                <button onClick={handleImport} disabled={importing} style={{ padding: '9px 20px', border: 'none', borderRadius: 8, background: importing ? '#c45a10' : 'var(--orange)', cursor: importing ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', color: '#fff', opacity: importing ? 0.7 : 1 }}>
                  {importing ? 'Importando…' : `Importar ${rows.length} fila(s)`}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ObjetivosClient({ vendedores, objMap: initialObjMap, clienteObjetivos }: Props) {
  const [objMap, setObjMap] = useState<Record<string, number>>(initialObjMap)
  const [editValues, setEditValues] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const [key, val] of Object.entries(initialObjMap)) {
      if (val > 0) map[key] = String(val)
    }
    return map
  })
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [success, setSuccess] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [importOpen, setImportOpen] = useState(false)

  function getEdit(vendedorId: string, cuatrimestre: string): string {
    const key = `${vendedorId}-${cuatrimestre}`
    if (key in editValues) return editValues[key]
    return objMap[key] > 0 ? String(objMap[key]) : ''
  }

  function setEdit(vendedorId: string, cuatrimestre: string, val: string) {
    setEditValues(prev => ({ ...prev, [`${vendedorId}-${cuatrimestre}`]: val }))
  }

  async function saveRow(v: Vendedor) {
    setSaving(prev => ({ ...prev, [v.id]: true }))
    setSuccess(prev => ({ ...prev, [v.id]: false }))
    setErrors(prev => ({ ...prev, [v.id]: '' }))
    try {
      for (const cuatrimestre of CUATRIMESTRES) {
        const key = `${v.id}-${cuatrimestre}`
        const editVal = editValues[key]
        const monto = editVal !== undefined && editVal !== '' ? Number(editVal) : (objMap[key] ?? 0)
        const res = await fetch('/api/objetivos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vendedorId: v.id, cuatrimestre, monto }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? 'Error al guardar')
        }
        setObjMap(prev => ({ ...prev, [key]: monto }))
      }
      setSuccess(prev => ({ ...prev, [v.id]: true }))
      setTimeout(() => setSuccess(prev => ({ ...prev, [v.id]: false })), 2500)
    } catch (err) {
      setErrors(prev => ({ ...prev, [v.id]: err instanceof Error ? err.message : 'Error' }))
    } finally {
      setSaving(prev => ({ ...prev, [v.id]: false }))
    }
  }

  const COL_KEYS = ['Q1', 'Q2', 'Q3']

  return (
    <div>
      {importOpen && (
        <ImportModal
          onClose={() => setImportOpen(false)}
          onImported={() => { setImportOpen(false); window.location.reload() }}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Objetivos {y}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {clienteObjetivos.length} cliente(s) con objetivos cargados
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={downloadTemplate} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
            border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-card)',
            cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'Montserrat, sans-serif', color: 'var(--text-secondary)',
          }}>
            <Download size={14} /> Plantilla
          </button>
          <button onClick={() => setImportOpen(true)} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px',
            background: 'var(--orange)', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600,
            fontFamily: 'Montserrat, sans-serif', cursor: 'pointer',
          }}>
            <Upload size={14} /> Importar Excel
          </button>
        </div>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>Vendedor</th>
              {CUATRIMESTRES.map(q => (
                <th key={q} style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>{q}</th>
              ))}
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>Total anual</th>
              <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {vendedores.map(v => {
              const totals = CUATRIMESTRES.map(q => {
                const key = `${v.id}-${q}`
                const edited = editValues[key]
                return edited !== undefined && edited !== '' ? Number(edited) : (objMap[key] ?? 0)
              })
              const anual = totals.reduce((s, t) => s + t, 0)
              const isSaving = saving[v.id]
              const isSuccess = success[v.id]
              const error = errors[v.id]
              const isExpanded = expanded[v.id]
              const misClientes = clienteObjetivos.filter(co => co.vendedor_id === v.id)

              return (
                <>
                  <tr key={v.id} style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--border)' }}>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {misClientes.length > 0 && (
                          <button
                            onClick={() => setExpanded(prev => ({ ...prev, [v.id]: !prev[v.id] }))}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                          >
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </button>
                        )}
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{v.nombre}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{ROL_LABELS[v.rol] ?? v.rol}</div>
                          {error && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{error}</div>}
                        </div>
                      </div>
                    </td>
                    {CUATRIMESTRES.map(q => (
                      <td key={q} style={{ padding: '10px 16px', textAlign: 'right' }}>
                        <input
                          type="number"
                          value={getEdit(v.id, q)}
                          onChange={e => setEdit(v.id, q, e.target.value)}
                          placeholder="0"
                          min={0}
                          style={{
                            width: 120, padding: '6px 10px',
                            border: '1px solid var(--border)', borderRadius: 6,
                            fontSize: 13, fontFamily: 'Montserrat, sans-serif',
                            textAlign: 'right', outline: 'none',
                            background: 'var(--bg-app)', color: 'var(--text-primary)',
                            boxSizing: 'border-box',
                          }}
                        />
                      </td>
                    ))}
                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                      <span style={{ fontWeight: 700, color: anual > 0 ? 'var(--orange)' : 'var(--text-muted)' }}>
                        {anual > 0 ? fmt(anual) : '—'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <button
                        onClick={() => saveRow(v)}
                        disabled={isSaving}
                        style={{
                          padding: '7px 16px', border: 'none', borderRadius: 7,
                          background: isSuccess ? '#15803d' : isSaving ? '#c45a10' : 'var(--orange)',
                          color: '#fff', fontSize: 12, fontWeight: 600,
                          fontFamily: 'Montserrat, sans-serif',
                          cursor: isSaving ? 'wait' : 'pointer',
                          opacity: isSaving ? 0.7 : 1,
                          transition: 'background 200ms', minWidth: 90,
                        }}
                      >
                        {isSuccess ? '✓ Guardado' : isSaving ? 'Guardando...' : 'Guardar'}
                      </button>
                    </td>
                  </tr>

                  {/* Clientes breakdown */}
                  {isExpanded && misClientes.length > 0 && (
                    <tr key={`${v.id}-clientes`} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-app)' }}>
                      <td colSpan={6} style={{ padding: '0 16px 12px 48px' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, paddingTop: 10 }}>
                          Potenciales por cliente
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr>
                              <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Cliente</th>
                              <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Pond.</th>
                              {COL_KEYS.map(c => (
                                <th key={c} style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>C{c.replace('Q', '')}</th>
                              ))}
                              <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--text-muted)', fontWeight: 600 }}>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {misClientes.map(co => {
                              const c1 = Number(co.objetivo_c1 ?? 0)
                              const c2 = Number(co.objetivo_c2 ?? 0)
                              const c3 = Number(co.objetivo_c3 ?? 0)
                              const total = c1 + c2 + c3
                              return (
                                <tr key={co.cliente_id}>
                                  <td style={{ padding: '4px 8px', fontWeight: 600, color: 'var(--text-primary)' }}>{clienteNombre(co)}</td>
                                  <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-muted)' }}>{co.ponderacion_pct ?? 100}%</td>
                                  <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>{c1 > 0 ? fmt(c1) : '—'}</td>
                                  <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>{c2 > 0 ? fmt(c2) : '—'}</td>
                                  <td style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--text-secondary)' }}>{c3 > 0 ? fmt(c3) : '—'}</td>
                                  <td style={{ padding: '4px 8px', textAlign: 'right', fontWeight: 700, color: 'var(--orange)' }}>{total > 0 ? fmt(total) : '—'}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
