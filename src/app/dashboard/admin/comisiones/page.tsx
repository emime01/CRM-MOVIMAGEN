import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const fmt = (n: number) => '$' + n.toLocaleString('es-UY', { maximumFractionDigits: 0 })
const fmtPct = (n: number) => n.toLocaleString('es-UY', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

export default async function ComisionesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (session.user.rol !== 'administracion') redirect('/dashboard')
  const supabase = createServerClient()

  const [{ data: comisiones }, { data: vendedores }] = await Promise.all([
    supabase.from('comisiones')
      .select('id, vendedor_id, orden_id, monto_comision, porcentaje, estado, created_at, ordenes_venta(numero, monto_total, clientes(nombre, empresa))')
      .order('created_at', { ascending: false }),
    supabase.from('perfiles').select('id, nombre, rol').in('rol', ['vendedor', 'asistente_ventas']).eq('activo', true),
  ])

  // Group by vendor
  const vendMap: Record<string, { nombre: string; pendiente: number; pagada: number; count: number }> = {}
  vendedores?.forEach(v => { vendMap[v.id] = { nombre: v.nombre, pendiente: 0, pagada: 0, count: 0 } })

  comisiones?.forEach(c => {
    if (!vendMap[c.vendedor_id]) return
    vendMap[c.vendedor_id].count++
    if (c.estado === 'pagada') vendMap[c.vendedor_id].pagada += Number(c.monto_comision ?? 0)
    else vendMap[c.vendedor_id].pendiente += Number(c.monto_comision ?? 0)
  })

  const vendStats = Object.entries(vendMap).map(([id, v]) => ({ id, ...v })).filter(v => v.count > 0)
  const totalPendiente = vendStats.reduce((s, v) => s + v.pendiente, 0)
  const totalPagada = vendStats.reduce((s, v) => s + v.pagada, 0)

  const ESTADO_BADGE: Record<string, { bg: string; color: string; label: string }> = {
    pendiente:  { bg: 'rgba(217,119,6,0.12)',  color: '#d97706', label: 'Pendiente' },
    pagada:     { bg: 'rgba(21,128,61,0.12)',   color: '#15803d', label: 'Pagada' },
    cancelada:  { bg: 'rgba(107,114,128,0.12)', color: '#6b7280', label: 'Cancelada' },
  }

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Comisiones pendientes', value: fmt(totalPendiente), color: '#d97706' },
          { label: 'Comisiones pagadas', value: fmt(totalPagada), color: '#15803d' },
          { label: 'Total registros', value: String(comisiones?.length ?? 0), color: 'var(--text-primary)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 20 }}>
        {/* By vendor */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Por vendedor</div>
          {vendStats.length === 0 ? (
            <p style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Sin registros.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
                  {['Vendedor', 'Pendiente', 'Pagada'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Vendedor' ? 'left' : 'right', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vendStats.map(v => (
                  <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{v.nombre}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: v.pendiente > 0 ? '#d97706' : 'var(--text-muted)' }}>{fmt(v.pendiente)}</td>
                    <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: v.pagada > 0 ? '#15803d' : 'var(--text-muted)' }}>{fmt(v.pagada)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Detail */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Detalle de comisiones</div>
          {(comisiones?.length ?? 0) === 0 ? (
            <p style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Sin registros.</p>
          ) : (
            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0 }}>
                  <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
                    {['Orden', 'Vendedor', '%', 'Monto', 'Estado'].map(h => (
                      <th key={h} style={{ padding: '9px 12px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comisiones?.map(c => {
                    const ord = Array.isArray(c.ordenes_venta) ? c.ordenes_venta[0] : c.ordenes_venta
                    const badge = ESTADO_BADGE[c.estado ?? 'pendiente'] ?? ESTADO_BADGE['pendiente']
                    const vend = vendedores?.find(v => v.id === c.vendedor_id)
                    return (
                      <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: 'var(--text-primary)', fontWeight: 600 }}>{(ord as any)?.numero ?? '—'}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)' }}>{vend?.nombre ?? '—'}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>{fmtPct(Number(c.porcentaje ?? 0))}</td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(Number(c.monto_comision ?? 0))}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ background: badge.bg, color: badge.color, padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{badge.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
