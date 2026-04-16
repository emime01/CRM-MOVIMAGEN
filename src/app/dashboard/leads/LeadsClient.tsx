'use client'

import { useMemo, useState } from 'react'
import { Plus } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type JoinedRow<T> = T | T[] | null

export interface LeadRow {
  id: string
  descripcion: string | null
  monto_potencial: number | null
  cuatrimestre: string | null
  estado: string
  notas: string | null
  created_at: string
  clientes: JoinedRow<{ nombre: string | null; empresa: string | null }>
  agencias: JoinedRow<{ nombre: string }>
  perfiles: JoinedRow<{ nombre: string }>
}

type EstadoLead =
  | 'nuevo'
  | 'en_conversacion'
  | 'propuesta_enviada'
  | 'negociacion'
  | 'ganado'
  | 'perdido'

interface ColumnDef {
  estado: EstadoLead
  label: string
  headerBg: string
  headerColor: string
  dotColor: string
}

interface Props {
  leads: LeadRow[]
  isGerente: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COLUMNS: ColumnDef[] = [
  {
    estado: 'nuevo',
    label: 'Nuevo',
    headerBg: '#f4f3f0',
    headerColor: '#6e6a62',
    dotColor: '#9a9895',
  },
  {
    estado: 'en_conversacion',
    label: 'En conversación',
    headerBg: '#eff6ff',
    headerColor: '#1d4ed8',
    dotColor: '#3b82f6',
  },
  {
    estado: 'propuesta_enviada',
    label: 'Propuesta enviada',
    headerBg: '#fffbeb',
    headerColor: '#92400e',
    dotColor: '#f59e0b',
  },
  {
    estado: 'negociacion',
    label: 'Negociación',
    headerBg: '#fef3ec',
    headerColor: '#c45a10',
    dotColor: '#eb691c',
  },
  {
    estado: 'ganado',
    label: 'Ganado',
    headerBg: '#e6f7ef',
    headerColor: '#166534',
    dotColor: '#1a9a5e',
  },
  {
    estado: 'perdido',
    label: 'Perdido',
    headerBg: '#fef0f0',
    headerColor: '#991b1b',
    dotColor: '#d63b3b',
  },
]

const QUARTER_OPTIONS = [
  { value: '', label: 'Todos los cuatrimestres' },
  { value: 'Q1-2026', label: 'Q1-2026' },
  { value: 'Q2-2026', label: 'Q2-2026' },
  { value: 'Q3-2026', label: 'Q3-2026' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getJoined<T>(val: JoinedRow<T>): T | null {
  if (!val) return null
  if (Array.isArray(val)) return val[0] ?? null
  return val
}

function clientName(lead: LeadRow): string {
  const c = getJoined(lead.clientes)
  if (!c) return '—'
  return c.empresa || c.nombre || '—'
}

function vendorName(lead: LeadRow): string {
  const p = getJoined(lead.perfiles)
  return p?.nombre ?? '—'
}

function formatMonto(val: number | null): string {
  if (val == null) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val)
}

function truncate(str: string | null | undefined, max: number): string {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '…' : str
}

// ─── Lead Card ────────────────────────────────────────────────────────────────

function LeadCard({ lead, isGerente }: { lead: LeadRow; isGerente: boolean }) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#ffffff',
        border: '1px solid',
        borderColor: hovered ? '#c5c2bb' : '#e5e3dc',
        borderRadius: 10,
        padding: '12px 14px',
        cursor: 'pointer',
        transition: 'border-color 150ms ease, box-shadow 150ms ease',
        boxShadow: hovered ? '0 2px 8px rgba(0,0,0,0.07)' : '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      {/* Company name */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: '#1a1915',
          marginBottom: 4,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {clientName(lead)}
      </div>

      {/* Description */}
      {lead.descripcion && (
        <div
          style={{
            fontSize: 12,
            color: '#4a4845',
            lineHeight: 1.45,
            marginBottom: 8,
          }}
        >
          {truncate(lead.descripcion, 60)}
        </div>
      )}

      {/* Monto + quarter row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: '#eb691c',
          }}
        >
          {formatMonto(lead.monto_potencial)}
        </span>

        {lead.cuatrimestre && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: '#4a4845',
              background: '#f4f3f0',
              borderRadius: 4,
              padding: '2px 6px',
              letterSpacing: '0.3px',
            }}
          >
            {lead.cuatrimestre}
          </span>
        )}
      </div>

      {/* Gerente: show vendor name */}
      {isGerente && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: '#9a9895',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <svg width="10" height="10" viewBox="0 0 20 20" fill="none">
            <path d="M10 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-7 2-7 4v1h14v-1c0-2-3-4-7-4Z" fill="currentColor" />
          </svg>
          {vendorName(lead)}
        </div>
      )}
    </div>
  )
}

// ─── Kanban Column ────────────────────────────────────────────────────────────

function KanbanColumn({
  col,
  leads,
  isGerente,
}: {
  col: ColumnDef
  leads: LeadRow[]
  isGerente: boolean
}) {
  return (
    <div
      style={{
        minWidth: 260,
        width: 260,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
      }}
    >
      {/* Column header */}
      <div
        style={{
          background: col.headerBg,
          borderRadius: '10px 10px 0 0',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          border: '1px solid #e5e3dc',
          borderBottom: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: col.dotColor,
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: col.headerColor,
              letterSpacing: '0.1px',
            }}
          >
            {col.label}
          </span>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: col.headerColor,
            background: col.headerBg,
            border: `1px solid ${col.dotColor}33`,
            borderRadius: 10,
            padding: '1px 8px',
            minWidth: 22,
            textAlign: 'center',
          }}
        >
          {leads.length}
        </span>
      </div>

      {/* Cards list */}
      <div
        style={{
          background: '#f9f8f5',
          border: '1px solid #e5e3dc',
          borderTop: 'none',
          borderRadius: '0 0 10px 10px',
          padding: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minHeight: 120,
        }}
      >
        {leads.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              color: '#c5c2bb',
              fontSize: 12,
              padding: '20px 0',
            }}
          >
            Sin leads
          </div>
        ) : (
          leads.map(lead => (
            <LeadCard key={lead.id} lead={lead} isGerente={isGerente} />
          ))
        )}
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LeadsClient({ leads, isGerente }: Props) {
  const [cuatrimestre, setCuatrimestre] = useState('')

  const filtered = useMemo(() => {
    if (!cuatrimestre) return leads
    return leads.filter(l => l.cuatrimestre === cuatrimestre)
  }, [leads, cuatrimestre])

  const totalFiltered = filtered.length
  const noLeads = leads.length === 0
  const noMatch = !noLeads && totalFiltered === 0

  const byColumn = useMemo(() => {
    const map: Record<EstadoLead, LeadRow[]> = {
      nuevo: [],
      en_conversacion: [],
      propuesta_enviada: [],
      negociacion: [],
      ganado: [],
      perdido: [],
    }
    for (const lead of filtered) {
      const key = lead.estado as EstadoLead
      if (map[key]) {
        map[key].push(lead)
      }
    }
    return map
  }, [filtered])

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif', minHeight: '100%' }}>

      {/* Page header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: '#1a1915',
              margin: 0,
              letterSpacing: '-0.3px',
            }}
          >
            Leads
          </h1>
          <p style={{ color: '#9a9895', fontSize: 13, marginTop: 3 }}>
            {totalFiltered} lead{totalFiltered !== 1 ? 's' : ''} en el pipeline
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Quarter filter */}
          <select
            value={cuatrimestre}
            onChange={e => setCuatrimestre(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid #e5e3dc',
              borderRadius: 8,
              fontSize: 13,
              fontFamily: 'Montserrat, sans-serif',
              color: '#1a1915',
              background: '#ffffff',
              cursor: 'pointer',
              outline: 'none',
              appearance: 'none',
              paddingRight: 28,
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239a9895' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 8px center',
            }}
          >
            {QUARTER_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* New lead button */}
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              background: '#eb691c',
              color: '#ffffff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'Montserrat, sans-serif',
              cursor: 'pointer',
              transition: 'background 150ms ease',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#c45a10')}
            onMouseLeave={e => (e.currentTarget.style.background = '#eb691c')}
          >
            <Plus size={15} />
            Nuevo lead
          </button>
        </div>
      </div>

      {/* Empty state: no leads at all */}
      {noLeads && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px 24px',
            color: '#9a9895',
            textAlign: 'center',
          }}
        >
          <svg
            width="48"
            height="48"
            viewBox="0 0 48 48"
            fill="none"
            style={{ marginBottom: 16, opacity: 0.4 }}
          >
            <rect x="8" y="8" width="32" height="32" rx="8" stroke="#9a9895" strokeWidth="2" fill="none" />
            <path d="M16 24h16M16 30h10" stroke="#9a9895" strokeWidth="2" strokeLinecap="round" />
            <circle cx="32" cy="18" r="6" fill="#eb691c" opacity="0.6" />
            <path d="M30 18h4M32 16v4" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p style={{ fontSize: 15, fontWeight: 700, color: '#4a4845', marginBottom: 6 }}>
            No hay leads todavía
          </p>
          <p style={{ fontSize: 13, maxWidth: 280, lineHeight: 1.5 }}>
            Hacé clic en <strong>Nuevo lead</strong> para agregar el primer prospecto al pipeline.
          </p>
        </div>
      )}

      {/* Empty state: filter yields no results */}
      {noMatch && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '64px 24px',
            color: '#9a9895',
            textAlign: 'center',
          }}
        >
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            style={{ marginBottom: 12, opacity: 0.45 }}
          >
            <circle cx="11" cy="11" r="7" stroke="#9a9895" strokeWidth="1.5" />
            <path d="M16.5 16.5L21 21" stroke="#9a9895" strokeWidth="1.5" strokeLinecap="round" />
            <path d="M8 11h6M11 8v6" stroke="#9a9895" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p style={{ fontSize: 14, fontWeight: 700, color: '#4a4845', marginBottom: 4 }}>
            Sin resultados para {cuatrimestre}
          </p>
          <p style={{ fontSize: 13 }}>
            Seleccioná otro cuatrimestre o{' '}
            <span
              style={{ color: '#eb691c', cursor: 'pointer', fontWeight: 600 }}
              onClick={() => setCuatrimestre('')}
            >
              ver todos
            </span>
            .
          </p>
        </div>
      )}

      {/* Kanban board */}
      {!noLeads && !noMatch && (
        <div
          style={{
            overflowX: 'auto',
            overflowY: 'visible',
            paddingBottom: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 14,
              minWidth: 'max-content',
              alignItems: 'flex-start',
            }}
          >
            {COLUMNS.map(col => (
              <KanbanColumn
                key={col.estado}
                col={col}
                leads={byColumn[col.estado]}
                isGerente={isGerente}
              />
            ))}
          </div>
        </div>
      )}

      {/* Kanban with empty columns still shown when filter is active but some columns have data */}
      {noLeads === false && noMatch === false && totalFiltered === 0 && null}
    </div>
  )
}
