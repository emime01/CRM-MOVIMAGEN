'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'

export interface OpcionBuscador {
  id: string
  label: string
  /** Texto extra que también se busca (ej.: razón social). */
  extra?: string | null
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * Un select con buscador: se escribe y filtra. Para listas largas (500+
 * clientes, 100+ agencias) donde un <select> común obliga a scrollear.
 */
export default function BuscadorSelect({
  opciones, value, onChange, placeholder = 'Buscar…', vacio = '— Ninguno —', style,
}: {
  opciones: OpcionBuscador[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  /** Texto de la opción "sin selección". */
  vacio?: string
  style?: React.CSSProperties
}) {
  const [abierto, setAbierto] = useState(false)
  const [q, setQ] = useState('')
  const caja = useRef<HTMLDivElement>(null)
  const elegido = opciones.find(o => o.id === value) ?? null

  useEffect(() => {
    const fuera = (e: MouseEvent) => { if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [])

  const filtradas = useMemo(() => {
    const t = norm(q.trim())
    const base = t ? opciones.filter(o => norm(`${o.label} ${o.extra ?? ''}`).includes(t)) : opciones
    return base.slice(0, 60)
  }, [opciones, q])

  const elegir = (id: string) => { onChange(id); setAbierto(false); setQ('') }

  return (
    <div ref={caja} style={{ position: 'relative' }}>
      <div
        onClick={() => setAbierto(true)}
        style={{ ...style, display: 'flex', alignItems: 'center', gap: 6, cursor: 'text', paddingRight: 8 }}
      >
        <input
          value={abierto ? q : (elegido?.label ?? '')}
          onChange={e => { setQ(e.target.value); setAbierto(true) }}
          onFocus={() => setAbierto(true)}
          onKeyDown={e => {
            if (e.key === 'Escape') setAbierto(false)
            if (e.key === 'Enter') { e.preventDefault(); if (filtradas[0]) elegir(filtradas[0].id) }
          }}
          placeholder={elegido ? elegido.label : placeholder}
          style={{ border: 'none', outline: 'none', background: 'transparent', flex: 1, minWidth: 0, font: 'inherit', color: 'inherit', padding: 0 }}
        />
        {value
          ? <button type="button" onClick={e => { e.stopPropagation(); elegir('') }} title="Quitar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9a9895', padding: 0, display: 'flex' }}><X size={14} /></button>
          : <ChevronDown size={14} color="#9a9895" />}
      </div>
      {abierto && (
        <div style={{
          position: 'absolute', zIndex: 60, top: '100%', left: 0, right: 0, marginTop: 4,
          background: '#fff', border: '1px solid #e5e3dc', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          maxHeight: 240, overflowY: 'auto',
        }}>
          <div onMouseDown={e => { e.preventDefault(); elegir('') }}
            style={{ padding: '8px 12px', fontSize: 13, color: '#9a9895', cursor: 'pointer' }}>{vacio}</div>
          {filtradas.map(o => (
            <div key={o.id} onMouseDown={e => { e.preventDefault(); elegir(o.id) }}
              style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', background: o.id === value ? '#fdf0e7' : undefined, color: '#1a1915' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#f7f6f3')}
              onMouseLeave={e => (e.currentTarget.style.background = o.id === value ? '#fdf0e7' : '')}>
              {o.label}{o.extra ? <span style={{ color: '#9a9895' }}> · {o.extra}</span> : null}
            </div>
          ))}
          {filtradas.length === 0 && <div style={{ padding: '8px 12px', fontSize: 13, color: '#9a9895' }}>Sin resultados</div>}
        </div>
      )}
    </div>
  )
}
