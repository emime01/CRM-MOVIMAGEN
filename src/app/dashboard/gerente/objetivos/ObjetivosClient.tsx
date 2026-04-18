'use client'

import { useState } from 'react'

const y = new Date().getFullYear()
const CUATRIMESTRES = [`Q1-${y}`, `Q2-${y}`, `Q3-${y}`]
const fmt = (n: number) => '$' + n.toLocaleString('es-UY', { maximumFractionDigits: 0 })

const ROL_LABELS: Record<string, string> = {
  vendedor: 'Vendedor',
  asistente_ventas: 'Asistente',
  gerente_comercial: 'Gerente',
}

interface Vendedor {
  id: string
  nombre: string
  rol: string
}

interface Props {
  vendedores: Vendedor[]
  objMap: Record<string, number>
}

export default function ObjetivosClient({ vendedores, objMap: initialObjMap }: Props) {
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

  return (
    <div>
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

              return (
                <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{v.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{ROL_LABELS[v.rol] ?? v.rol}</div>
                    {error && (
                      <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>{error}</div>
                    )}
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
                          width: 120,
                          padding: '6px 10px',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          fontSize: 13,
                          fontFamily: 'Montserrat, sans-serif',
                          textAlign: 'right',
                          outline: 'none',
                          background: 'var(--bg-app)',
                          color: 'var(--text-primary)',
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
                        padding: '7px 16px',
                        border: 'none',
                        borderRadius: 7,
                        background: isSuccess ? '#15803d' : isSaving ? '#c45a10' : 'var(--orange)',
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 600,
                        fontFamily: 'Montserrat, sans-serif',
                        cursor: isSaving ? 'wait' : 'pointer',
                        opacity: isSaving ? 0.7 : 1,
                        transition: 'background 200ms',
                        minWidth: 90,
                      }}
                    >
                      {isSuccess ? '✓ Guardado' : isSaving ? 'Guardando...' : 'Guardar'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
