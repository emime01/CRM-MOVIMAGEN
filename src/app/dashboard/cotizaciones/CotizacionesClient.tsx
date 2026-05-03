'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, FileText, Clock, CheckCircle, XCircle, Send, Trash2, ChevronRight } from 'lucide-react'

interface Propuesta {
  id: string
  numero: string
  nombre: string | null
  estado: 'borrador' | 'enviada' | 'aceptada' | 'rechazada'
  moneda: string
  monto_neto: number | null
  monto_total: number | null
  fecha_inicio: string | null
  fecha_fin: string | null
  created_at: string
  vendedor_id: string
  clientes: { nombre: string; empresa: string | null } | null
  leads: { descripcion: string | null } | null
  perfiles: { nombre: string } | null
}

const ESTADO_STYLES: Record<string, { bg: string; color: string; label: string; icon: React.ReactNode }> = {
  borrador:  { bg: '#f1f5f9', color: '#475569', label: 'Borrador',  icon: <Clock size={12} /> },
  enviada:   { bg: '#eff6ff', color: '#2563eb', label: 'Enviada',   icon: <Send size={12} /> },
  aceptada:  { bg: '#f0fdf4', color: '#16a34a', label: 'Aceptada',  icon: <CheckCircle size={12} /> },
  rechazada: { bg: '#fef2f2', color: '#dc2626', label: 'Rechazada', icon: <XCircle size={12} /> },
}

export default function CotizacionesClient({ rol, userId }: { rol: string; userId: string }) {
  const router = useRouter()
  const [propuestas, setPropuestas] = useState<Propuesta[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('')

  useEffect(() => {
    fetchPropuestas()
  }, [filtroEstado])

  async function fetchPropuestas() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filtroEstado) params.set('estado', filtroEstado)
    const res = await fetch(`/api/propuestas?${params}`)
    const data = await res.json()
    setPropuestas(data.propuestas ?? [])
    setLoading(false)
  }

  async function deletePropuesta(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('¿Eliminar esta cotización?')) return
    await fetch(`/api/propuestas/${id}`, { method: 'DELETE' })
    setPropuestas(ps => ps.filter(p => p.id !== id))
  }

  const fmt = (n: number | null, moneda: string) => {
    if (n == null) return '—'
    const sym = moneda === 'USD' ? 'U$S' : '$'
    return `${sym} ${Number(n).toLocaleString('es-UY', { maximumFractionDigits: 0 })}`
  }

  const isManager = ['gerente_comercial', 'administracion', 'asistente_ventas'].includes(rol)

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>Cotizaciones</h1>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
            Propuestas comerciales y presupuestos de campaña
          </p>
        </div>
        <button
          onClick={() => router.push('/dashboard/cotizaciones/nueva')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#111827', color: '#fff', border: 'none',
            borderRadius: 8, padding: '9px 16px', fontSize: 13,
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={15} /> Nueva Cotización
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['', 'borrador', 'enviada', 'aceptada', 'rechazada'].map(e => (
          <button
            key={e}
            onClick={() => setFiltroEstado(e)}
            style={{
              padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500,
              border: '1px solid', cursor: 'pointer',
              background: filtroEstado === e ? '#111827' : '#fff',
              color: filtroEstado === e ? '#fff' : '#374151',
              borderColor: filtroEstado === e ? '#111827' : '#d1d5db',
            }}
          >
            {e === '' ? 'Todas' : ESTADO_STYLES[e]?.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af', fontSize: 14 }}>Cargando…</div>
      ) : propuestas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <FileText size={40} style={{ color: '#d1d5db', margin: '0 auto 12px' }} />
          <p style={{ color: '#6b7280', fontSize: 14 }}>No hay cotizaciones aún</p>
          <button
            onClick={() => router.push('/dashboard/cotizaciones/nueva')}
            style={{ marginTop: 12, padding: '8px 16px', background: '#111827', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13 }}
          >
            Crear la primera
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {propuestas.map(p => {
            const est = ESTADO_STYLES[p.estado] ?? ESTADO_STYLES.borrador
            const cli = p.clientes
            const clienteNombre = cli?.empresa || cli?.nombre || '—'
            return (
              <div
                key={p.id}
                onClick={() => router.push(`/dashboard/cotizaciones/${p.id}`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  background: '#fff', border: '1px solid #e5e7eb',
                  borderRadius: 10, padding: '14px 18px',
                  cursor: 'pointer', transition: 'box-shadow 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', fontFamily: 'monospace' }}>{p.numero}</span>
                    <span
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                        background: est.bg, color: est.color,
                      }}
                    >
                      {est.icon} {est.label}
                    </span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginTop: 4 }}>
                    {p.nombre || clienteNombre}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    {clienteNombre}
                    {p.fecha_inicio && p.fecha_fin && (
                      <span style={{ marginLeft: 8 }}>
                        {new Date(p.fecha_inicio + 'T12:00:00').toLocaleDateString('es-UY', { day: '2-digit', month: 'short' })}
                        {' – '}
                        {new Date(p.fecha_fin + 'T12:00:00').toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                    {isManager && p.perfiles && (
                      <span style={{ marginLeft: 8, color: '#9ca3af' }}>· {p.perfiles.nombre}</span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  {p.monto_total != null && (
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>
                      {fmt(p.monto_total, p.moneda)}
                    </div>
                  )}
                  {p.monto_neto != null && p.monto_neto !== p.monto_total && (
                    <div style={{ fontSize: 11, color: '#9ca3af' }}>neto {fmt(p.monto_neto, p.moneda)}</div>
                  )}
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                    {new Date(p.created_at).toLocaleDateString('es-UY', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {(p.vendedor_id === userId || isManager) && (
                    <button
                      onClick={e => deletePropuesta(p.id, e)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d1d5db', padding: 4, borderRadius: 4 }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#d1d5db')}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  <ChevronRight size={16} style={{ color: '#d1d5db' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
