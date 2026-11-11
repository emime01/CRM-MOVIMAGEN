'use client'

import { useEffect, useState } from 'react'
import { formatMoney } from '@/lib/money'

interface Desglose {
  hay: boolean
  estado?: string
  moneda?: string
  total_factura?: number
  comision?: number
  iva?: number
  descuento?: number
  neto?: number
}

/**
 * En el cobro de una factura de agencia, cuando se tilda "la agencia se
 * descontó su comisión": cuánto se descuenta (comisión + IVA) y cuánto entra.
 */
export default function DescuentoAgencia({ facturaId }: { facturaId: string }) {
  const [d, setD] = useState<Desglose | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let vivo = true
    fetch(`/api/facturas/${facturaId}/comision-agencia`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(j => { if (vivo) setD(j) })
      .catch(() => { if (vivo) setError(true) })
    return () => { vivo = false }
  }, [facturaId])

  const caja: React.CSSProperties = { background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 8, padding: '10px 12px', fontSize: 13 }
  if (error) return <div style={{ ...caja, color: '#b45309' }}>No se pudo calcular la comisión de la agencia.</div>
  if (!d) return <div style={{ ...caja, color: 'var(--text-muted)' }}>Calculando la comisión de la agencia…</div>
  if (!d.hay) return <div style={{ ...caja, color: '#b45309' }}>Esta factura no tiene comisión de agencia pactada.</div>

  const m = (n?: number) => formatMoney(Number(n ?? 0), d.moneda ?? 'UYU')
  const fila = (k: string, v: string, fuerte = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontWeight: fuerte ? 700 : 400 }}>
      <span>{k}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </div>
  )
  return (
    <div style={{ ...caja, display: 'flex', flexDirection: 'column', gap: 3 }}>
      {fila('Total de la factura', m(d.total_factura))}
      {fila('Comisión de la agencia', `− ${m(d.comision)}`)}
      {fila('IVA de la comisión (22%)', `− ${m(d.iva)}`)}
      <div style={{ borderTop: '1px solid #fed7aa', margin: '4px 0' }} />
      {fila('Cobrado (lo que pagó la agencia)', m(d.neto), true)}
      {d.estado === 'pagada' && <div style={{ color: '#b91c1c', marginTop: 4 }}>Ojo: esta comisión ya figura pagada a la agencia.</div>}
    </div>
  )
}
