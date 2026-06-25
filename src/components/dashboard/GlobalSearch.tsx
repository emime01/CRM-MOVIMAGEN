'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Building2, Target, FileText, ShoppingBag } from 'lucide-react'

interface Resultados {
  clientes:    { id: string; nombre: string; empresa: string | null }[]
  leads:       { id: string; descripcion: string | null; estado: string; clientes: any }[]
  cotizaciones:{ id: string; numero: string | null; nombre: string | null; estado: string; clientes: any }[]
  ordenes:     { id: string; numero: number; estado: string; clientes: any }[]
}

function first<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? v[0] ?? null : v
}
function clienteLabel(v: any): string {
  const c = first<any>(v)
  return c?.empresa ?? c?.nombre ?? '—'
}

export default function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Resultados | null>(null)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Atajo ⌘K / Ctrl+K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      } else if (e.key === 'Escape' && open) {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Focus al abrir
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30) }, [open])

  // Búsqueda con debounce
  useEffect(() => {
    if (!open) return
    if (q.trim().length < 2) { setResults(null); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setLoading(true)
      fetch(`/api/search?q=${encodeURIComponent(q.trim())}`)
        .then(r => r.json())
        .then(d => setResults(d))
        .finally(() => setLoading(false))
    }, 250)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [q, open])

  function navegar(url: string) {
    setOpen(false)
    setQ('')
    setResults(null)
    router.push(url)
  }

  const total = results
    ? results.clientes.length + results.leads.length + results.cotizaciones.length + results.ordenes.length
    : 0

  return (
    <>
      {/* Botón en el topbar */}
      <button
        onClick={() => setOpen(true)}
        title="Buscar (Ctrl/Cmd + K)"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)',
          background: 'var(--bg-card)', color: 'var(--text-muted)', cursor: 'pointer',
          fontSize: 12, fontFamily: 'Montserrat, sans-serif', minWidth: 220,
        }}
      >
        <Search size={14} />
        <span style={{ flex: 1, textAlign: 'left' }}>Buscar…</span>
        <kbd style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'var(--bg-app)', border: '1px solid var(--border)', fontFamily: 'monospace' }}>⌘K</kbd>
      </button>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '10vh' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid #e5e3dc' }}>
              <Search size={16} color="#9a9895" />
              <input
                ref={inputRef}
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Cliente, lead, cotización (COT-1234) o OIC #..."
                style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, fontFamily: 'Montserrat, sans-serif', background: 'transparent' }}
              />
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9a9895', padding: 4 }}><X size={16} /></button>
            </div>

            <div style={{ overflowY: 'auto', maxHeight: 'calc(80vh - 56px)' }}>
              {q.trim().length < 2 ? (
                <div style={{ padding: 24, fontSize: 13, color: '#9a9895', textAlign: 'center' }}>
                  Escribí al menos 2 caracteres. Probá un cliente, un número COT-XXXX o el número de una OIC.
                </div>
              ) : loading && !results ? (
                <div style={{ padding: 24, fontSize: 13, color: '#9a9895', textAlign: 'center' }}>Buscando…</div>
              ) : total === 0 ? (
                <div style={{ padding: 24, fontSize: 13, color: '#9a9895', textAlign: 'center' }}>
                  Sin resultados para "{q}".
                </div>
              ) : (
                <div style={{ padding: '8px 0' }}>
                  {results!.clientes.length > 0 && (
                    <Seccion titulo="Clientes" icon={<Building2 size={12} />}>
                      {results!.clientes.map(c => (
                        <Item key={c.id} onClick={() => navegar(`/dashboard/cuentas/${c.id}`)}
                          titulo={c.empresa || c.nombre}
                          subtitulo={c.empresa ? c.nombre : ''} />
                      ))}
                    </Seccion>
                  )}
                  {results!.leads.length > 0 && (
                    <Seccion titulo="Leads" icon={<Target size={12} />}>
                      {results!.leads.map(l => (
                        <Item key={l.id} onClick={() => navegar(`/dashboard/leads/${l.id}`)}
                          titulo={l.descripcion ?? 'Sin descripción'}
                          subtitulo={`${clienteLabel(l.clientes)} · ${l.estado}`} />
                      ))}
                    </Seccion>
                  )}
                  {results!.cotizaciones.length > 0 && (
                    <Seccion titulo="Cotizaciones" icon={<FileText size={12} />}>
                      {results!.cotizaciones.map(p => (
                        <Item key={p.id} onClick={() => navegar(`/dashboard/cotizaciones/${p.id}`)}
                          titulo={`${p.numero ?? '—'} · ${p.nombre ?? 'Sin nombre'}`}
                          subtitulo={`${clienteLabel(p.clientes)} · ${p.estado}`} />
                      ))}
                    </Seccion>
                  )}
                  {results!.ordenes.length > 0 && (
                    <Seccion titulo="Órdenes de venta" icon={<ShoppingBag size={12} />}>
                      {results!.ordenes.map(o => (
                        <Item key={o.id} onClick={() => navegar(`/dashboard/ventas/${o.id}`)}
                          titulo={`OIC #${o.numero}`}
                          subtitulo={`${clienteLabel(o.clientes)} · ${o.estado}`} />
                      ))}
                    </Seccion>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Seccion({ titulo, icon, children }: { titulo: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 18px', fontSize: 10, fontWeight: 700, color: '#9a9895', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {icon} {titulo}
      </div>
      {children}
    </div>
  )
}

function Item({ titulo, subtitulo, onClick }: { titulo: string; subtitulo?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        width: '100%', padding: '8px 18px', border: 'none', background: 'transparent',
        cursor: 'pointer', textAlign: 'left', gap: 2,
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#f9f8f5')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ fontSize: 13, color: '#1a1915', fontWeight: 600 }}>{titulo}</span>
      {subtitulo && <span style={{ fontSize: 11, color: '#9a9895' }}>{subtitulo}</span>}
    </button>
  )
}
