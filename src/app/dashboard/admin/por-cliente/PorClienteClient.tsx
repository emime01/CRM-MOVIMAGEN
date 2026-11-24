'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Download, Search } from 'lucide-react'
import { formatMoney, type TotalPorMoneda } from '@/lib/money'
import { CAMPOS, totalColumna, type Agrupar, type Campo, type FilaPC } from '@/lib/administracion/por-cliente'

const TITULOS: Record<Campo, { label: string; ayuda: string }> = {
  vendido:   { label: 'Vendido s/IVA', ayuda: 'Ventas aprobadas cargadas en el período, sin IVA' },
  facturado: { label: 'Facturado',     ayuda: 'Facturas emitidas en el período, con IVA, menos notas de crédito' },
  cobrado:   { label: 'Cobrado',       ayuda: 'Pagos con fecha en el período (lo que entró; el descuento de agencia ya está restado)' },
  pendiente: { label: 'Pendiente hoy', ayuda: 'Facturas emitidas sin cobrar, de cualquier fecha' },
  vencido:   { label: 'Vencido hoy',   ayuda: 'De lo pendiente, lo que ya venció' },
  aFacturar: { label: 'A facturar',    ayuda: 'Cuotas previstas que todavía no se facturaron' },
}
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`

/** Una celda con pesos y, debajo, dólares si hay. */
function Monto({ t, fuerte, rojo }: { t: TotalPorMoneda; fuerte?: boolean; rojo?: boolean }) {
  const partes = (['UYU', 'USD'] as const).filter(m => (t[m] ?? 0) !== 0)
  if (!partes.length) return <span style={{ color: 'var(--text-muted)' }}>—</span>
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', fontWeight: fuerte ? 700 : 500, color: rojo ? '#b91c1c' : undefined }}>
      {partes.map(m => <span key={m} style={{ whiteSpace: 'nowrap' }}>{formatMoney(t[m]!, m)}</span>)}
    </span>
  )
}

export default function PorClienteClient({ filas, desde, hasta, agrupar, hoy, error }: {
  filas: FilaPC[]; desde: string; hasta: string; agrupar: Agrupar; hoy: string; error: string | null
}) {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [orden, setOrden] = useState<Campo>('facturado')

  const ir = (cambios: Record<string, string>) => {
    const p = new URLSearchParams({ desde, hasta, por: agrupar, ...cambios })
    router.push(`/dashboard/admin/por-cliente?${p.toString()}`)
  }
  const anio = hoy.slice(0, 4), mes = hoy.slice(0, 7)
  const hace12 = (() => { const [y, m] = mes.split('-').map(Number); const d = new Date(Date.UTC(y, m - 12, 1)); return d.toISOString().slice(0, 7) })()
  const atajos = [
    { label: 'Este mes', desde: mes, hasta: mes },
    { label: `Año ${anio}`, desde: `${anio}-01`, hasta: mes },
    { label: `Año ${Number(anio) - 1}`, desde: `${Number(anio) - 1}-01`, hasta: `${Number(anio) - 1}-12` },
    { label: 'Últimos 12 meses', desde: hace12, hasta: mes },
  ]

  // Ordena por los pesos de la columna elegida y después por los dólares.
  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase()
    return filas
      .filter(f => !t || f.nombre.toLowerCase().includes(t))
      .sort((a, b) => (b[orden].UYU ?? 0) - (a[orden].UYU ?? 0) || (b[orden].USD ?? 0) - (a[orden].USD ?? 0) || a.nombre.localeCompare(b.nombre))
  }, [filas, q, orden])

  async function exportar() {
    const xlsx = await import('xlsx')
    const datos = visibles.map(f => {
      const fila: Record<string, string | number> = { [agrupar === 'agencia' ? 'Agencia' : 'Cliente']: f.nombre, Ventas: f.ventas }
      for (const c of CAMPOS) {
        fila[`${TITULOS[c].label} $`] = f[c].UYU ?? 0
        fila[`${TITULOS[c].label} US$`] = f[c].USD ?? 0
      }
      return fila
    })
    const ws = xlsx.utils.json_to_sheet(datos)
    const wb = xlsx.utils.book_new()
    xlsx.utils.book_append_sheet(wb, ws, agrupar === 'agencia' ? 'Por agencia' : 'Por cliente')
    xlsx.writeFile(wb, `Facturacion por ${agrupar} ${desde} a ${hasta}.xlsx`)
  }

  const btn = (activo: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'Montserrat, sans-serif',
    border: '1px solid var(--border)', background: activo ? 'var(--orange)' : 'var(--bg-card)', color: activo ? '#fff' : 'var(--text-secondary)',
  })
  const th: React.CSSProperties = { padding: '10px 12px', fontSize: 10.5, textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer' }
  const td: React.CSSProperties = { padding: '10px 12px', fontSize: 13, textAlign: 'right', borderTop: '1px solid var(--border)', verticalAlign: 'top' }

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          <button style={btn(agrupar === 'cliente')} onClick={() => ir({ por: 'cliente' })}>Por cliente</button>
          <button style={btn(agrupar === 'agencia')} onClick={() => ir({ por: 'agencia' })}>Por agencia</button>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {atajos.map(a => <button key={a.label} style={btn(a.desde === desde && a.hasta === hasta)} onClick={() => ir({ desde: a.desde, hasta: a.hasta })}>{a.label}</button>)}
        </div>
        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          Desde <input type="month" value={desde} onChange={e => e.target.value && ir({ desde: e.target.value })} style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 7, fontFamily: 'inherit' }} />
          hasta <input type="month" value={hasta} onChange={e => e.target.value && ir({ hasta: e.target.value })} style={{ padding: '5px 8px', border: '1px solid var(--border)', borderRadius: 7, fontFamily: 'inherit' }} />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
        {CAMPOS.map(c => (
          <div key={c} title={TITULOS[c].ayuda} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 6 }}>{TITULOS[c].label}</div>
            <div style={{ fontSize: 17 }}><Monto t={totalColumna(visibles, c)} fuerte rojo={c === 'vencido'} /></div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 9, color: 'var(--text-muted)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder={agrupar === 'agencia' ? 'Buscar agencia…' : 'Buscar cliente…'}
            style={{ width: '100%', padding: '7px 10px 7px 30px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }} />
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {visibles.length} {agrupar === 'agencia' ? 'agencias' : 'clientes'} · período {nombreMes(desde)}{desde !== hasta ? ` a ${nombreMes(hasta)}` : ''}
        </span>
        <button onClick={exportar} disabled={!visibles.length} style={{ ...btn(false), marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Download size={13} /> Exportar a Excel
        </button>
      </div>

      {error && <div style={{ padding: 12, marginBottom: 10, borderRadius: 8, background: '#fef2f2', color: '#b91c1c', fontSize: 13 }}>No se pudieron leer todos los datos: {error}</div>}

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left', cursor: 'default' }}>{agrupar === 'agencia' ? 'Agencia' : 'Cliente'}</th>
              {CAMPOS.map(c => (
                <th key={c} style={{ ...th, color: orden === c ? 'var(--orange)' : th.color }} title={`${TITULOS[c].ayuda}. Clic para ordenar.`} onClick={() => setOrden(c)}>
                  {TITULOS[c].label}{orden === c ? ' ↓' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 ? (
              <tr><td colSpan={7} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)' }}>Sin movimiento en el período.</td></tr>
            ) : visibles.map(f => (
              <tr key={f.clave}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>
                  {f.clienteId ? <Link href={`/dashboard/cuentas/${f.clienteId}`} style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>{f.nombre}</Link> : f.nombre}
                  {f.ventas > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>{f.ventas} venta{f.ventas > 1 ? 's' : ''} en el período</div>}
                </td>
                {CAMPOS.map(c => <td key={c} style={td}><Monto t={f[c]} rojo={c === 'vencido'} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
        Vendido, facturado y cobrado son del período elegido; pendiente, vencido y a facturar son a hoy. Pesos y dólares van por separado.
        Lo cobrado puede ser de facturas de otros períodos.
      </p>
    </div>
  )
}
