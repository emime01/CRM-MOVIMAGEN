'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Ventanas del CRM en lugar de alert / confirm / prompt del navegador: se ven
 * como el resto de la app y no se bloquean en el celular.
 *
 *   avisar('Venta cerrada')                     → Promise<void>
 *   if (!(await confirmar('¿Borrar?'))) return  → Promise<boolean>
 *   const v = await pedir('Monto', '0')         → Promise<string | null>
 *
 * <Dialogos /> va una sola vez en el layout del dashboard.
 */
type Pedido =
  | { tipo: 'avisar'; mensaje: string; resolver: (v: void) => void }
  | { tipo: 'confirmar'; mensaje: string; resolver: (v: boolean) => void }
  | { tipo: 'pedir'; mensaje: string; valor: string; resolver: (v: string | null) => void }

let encolar: ((p: Pedido) => void) | null = null
const pendientes: Pedido[] = []
const mandar = (p: Pedido) => (encolar ? encolar(p) : pendientes.push(p))

export const avisar = (mensaje: string) => new Promise<void>(resolver => mandar({ tipo: 'avisar', mensaje: String(mensaje), resolver }))
export const confirmar = (mensaje: string) => new Promise<boolean>(resolver => mandar({ tipo: 'confirmar', mensaje: String(mensaje), resolver }))
export const pedir = (mensaje: string, valor = '') => new Promise<string | null>(resolver => mandar({ tipo: 'pedir', mensaje: String(mensaje), valor: valor ?? '', resolver }))

export default function Dialogos() {
  const [cola, setCola] = useState<Pedido[]>([])
  const [texto, setTexto] = useState('')
  const entrada = useRef<HTMLInputElement>(null)
  const aceptar = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    encolar = p => setCola(c => [...c, p])
    if (pendientes.length) setCola(c => [...c, ...pendientes.splice(0)])
    return () => { encolar = null }
  }, [])

  const actual = cola[0]
  useEffect(() => {
    if (!actual) return
    if (actual.tipo === 'pedir') { setTexto(actual.valor); setTimeout(() => entrada.current?.select(), 0) }
    else setTimeout(() => aceptar.current?.focus(), 0)
  }, [actual])

  if (!actual) return null
  const cerrar = (ok: boolean) => {
    if (actual.tipo === 'avisar') actual.resolver()
    else if (actual.tipo === 'confirmar') actual.resolver(ok)
    else actual.resolver(ok ? texto : null)
    setCola(c => c.slice(1))
  }

  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) cerrar(false) }}
      onKeyDown={e => { if (e.key === 'Escape') cerrar(false) }}
      style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: 'Montserrat, sans-serif' }}>
        <div style={{ padding: '20px 20px 8px', fontSize: 14, color: '#1a1915', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{actual.mensaje}</div>
        {actual.tipo === 'pedir' && (
          <div style={{ padding: '4px 20px 0' }}>
            <input ref={entrada} value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') cerrar(true) }}
              style={{ width: '100%', height: 38, padding: '0 10px', border: '1px solid #e5e3dc', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 20px' }}>
          {actual.tipo !== 'avisar' && (
            <button onClick={() => cerrar(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e5e3dc', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>Cancelar</button>
          )}
          <button ref={aceptar} onClick={() => cerrar(true)} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#ec691a', color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            {actual.tipo === 'avisar' ? 'Entendido' : 'Aceptar'}
          </button>
        </div>
      </div>
    </div>
  )
}
