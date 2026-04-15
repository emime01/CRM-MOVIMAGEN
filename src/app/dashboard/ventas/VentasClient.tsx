'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, Download, Search } from 'lucide-react'
import * as XLSX from 'xlsx'

type EstadoOrden =
  | 'borrador'
  | 'pendiente_aprobacion'
  | 'aprobada'
  | 'rechazada'
  | 'en_oic'
  | 'facturada'
  | 'cobrada'

const ESTADO_BADGE: Record<EstadoOrden, { bg: string; color: string; label: string }> = {
  borrador:             { bg: 'var(--gray-100)', color: 'var(--gray-600)', label: 'Borrador' },
  pendiente_aprobacion: { bg: 'var(--amber-pale)', color: 'var(--amber)', label: 'Pend. aprobación' },
  aprobada:             { bg: 'var(--green-pale)', color: 'var(--green)', label: 'Aprobada' },
  rechazada:            { bg: 'var(--red-pale)', color: 'var(--red)', label: 'Rechazada' },
  en_oic:               { bg: 'var(--orange-pale)', color: 'var(--orange)', label: 'En OIC' },
  facturada:            { bg: 'var(--green-pale)', color: 'var(--green)', label: 'Facturada' },
  cobrada:              { bg: 'var(--green-pale)', color: 'var(--green)', label: 'Cobrada' },
}

const ESTADO_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'borrador', label: 'Borrador' },
  { value: 'pendiente_aprobacion', label: 'Pend. aprobación' },
  { value: 'aprobada', label: 'Aprobada' },
  { value: 'rechazada', label: 'Rechazada' },
  { value: 'en_oic', label: 'En OIC' },
  { value: 'facturada', label: 'Facturada' },
  { value: 'cobrada', label: 'Cobrada' },
]

const QUARTER_OPTIONS = [
  { value: '', label: 'Todos los cuatrimestres' },
  { value: 'Q1', label: 'Q1 (Ene–Abr)' },
  { value: 'Q2', label: 'Q2 (May–Ago)' },
  { value: 'Q3', label: 'Q3 (Sep–Dic)' },
]

function getQuarterOfDate(dateStr: string): string {
  const month = new Date(dateStr).getMonth() + 1
  if (month <= 4) return 'Q1'
  if (month <= 8) return 'Q2'
  return 'Q3'
}

function formatMoney(amount: number, currency: string = 'USD') {
  return new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Supabase returns joined rows as arrays when using foreign keys
type JoinedRow = { nombre: string } | { nombre: string }[] | null

interface OrdenRow {
  id: string
  numero: string | null
  monto_total: number | null
  moneda: string | null
  estado: string
  created_at: string
  clientes: JoinedRow
  agencias: JoinedRow
  perfiles: JoinedRow
}

function joinedNombre(val: JoinedRow): string {
  if (!val) return '—'
  if (Array.isArray(val)) return val[0]?.nombre ?? '—'
  return val.nombre ?? '—'
}

interface Props {
  ordenes: OrdenRow[]
  userRol: string
}

export default function VentasClient({ ordenes, userRol }: Props) {
  const [search, setSearch] = useState('')
  const [estado, setEstado] = useState('')
  const [quarter, setQuarter] = useState('')

  const filtered = useMemo(() => {
    return ordenes.filter(o => {
      if (estado && o.estado !== estado) return false
      if (quarter && getQuarterOfDate(o.created_at) !== quarter) return false
      if (search) {
        const q = search.toLowerCase()
        const matchesNumero = o.numero?.toLowerCase().includes(q)
        const matchesCliente = joinedNombre(o.clientes).toLowerCase().includes(q)
        const matchesAgencia = joinedNombre(o.agencias).toLowerCase().includes(q)
        if (!matchesNumero && !matchesCliente && !matchesAgencia) return false
      }
      return true
    })
  }, [ordenes, search, estado, quarter])

  function exportExcel() {
    const rows = filtered.map(o => ({
      'N° Orden': o.numero ?? '—',
      'Cliente': joinedNombre(o.clientes),
      'Agencia': joinedNombre(o.agencias),
      'Monto': o.monto_total ?? 0,
      'Moneda': o.moneda ?? 'USD',
      'Estado': ESTADO_BADGE[o.estado as EstadoOrden]?.label ?? o.estado,
      'Fecha': formatDate(o.created_at),
      'Vendedor': joinedNombre(o.perfiles),
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Ventas')
    XLSX.writeFile(wb, `ventas_${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          {filtered.length} {filtered.length === 1 ? 'orden' : 'órdenes'}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={exportExcel}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--bg-card)',
              color: 'var(--text-secondary)',
              fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'Montserrat, sans-serif',
            }}
          >
            <Download size={15} />
            Exportar Excel
          </button>
          <Link
            href="/dashboard/ventas/nueva"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 8,
              background: 'var(--orange)',
              color: '#fff',
              fontSize: 13, fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            <Plus size={15} />
            Nueva orden
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex', gap: 10, marginBottom: 16,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: 12,
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por N° orden, cliente o agencia..."
            style={{
              width: '100%', paddingLeft: 32, paddingRight: 12,
              height: 36, border: '1px solid var(--border)',
              borderRadius: 8, fontSize: 13,
              fontFamily: 'Montserrat, sans-serif',
              color: 'var(--text-primary)', outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Quarter filter */}
        <select
          value={quarter}
          onChange={e => setQuarter(e.target.value)}
          style={{
            height: 36, padding: '0 12px',
            border: '1px solid var(--border)', borderRadius: 8,
            fontSize: 13, fontFamily: 'Montserrat, sans-serif',
            color: 'var(--text-primary)', background: 'white',
            cursor: 'pointer', outline: 'none',
          }}
        >
          {QUARTER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>

        {/* Estado filter */}
        <select
          value={estado}
          onChange={e => setEstado(e.target.value)}
          style={{
            height: 36, padding: '0 12px',
            border: '1px solid var(--border)', borderRadius: 8,
            fontSize: 13, fontFamily: 'Montserrat, sans-serif',
            color: 'var(--text-primary)', background: 'white',
            cursor: 'pointer', outline: 'none',
          }}
        >
          {ESTADO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
            {ordenes.length === 0
              ? 'No hay órdenes registradas aún. Creá la primera orden.'
              : 'No se encontraron órdenes con esos filtros.'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--gray-100)' }}>
                {['N° Orden', 'Cliente', 'Agencia', 'Monto', 'Estado', 'Fecha alta', 'Vendedor'].map(h => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((order, i) => {
                const badge = ESTADO_BADGE[order.estado as EstadoOrden] ?? { bg: 'var(--gray-100)', color: 'var(--gray-600)', label: order.estado }
                return (
                  <tr
                    key={order.id}
                    style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--gray-100)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {order.numero ?? `#${String(order.id).slice(0, 6)}`}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                      {joinedNombre(order.clientes)}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-muted)' }}>
                      {joinedNombre(order.agencias)}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                      {order.monto_total != null ? formatMoney(order.monto_total, order.moneda ?? 'USD') : '—'}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: badge.bg, color: badge.color, whiteSpace: 'nowrap' }}>
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {formatDate(order.created_at)}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                      {joinedNombre(order.perfiles)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
