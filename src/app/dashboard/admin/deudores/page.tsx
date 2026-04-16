import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const fmt = (n: number) => '$' + n.toLocaleString('es-UY', { maximumFractionDigits: 0 })

function diasDesde(dateStr: string | null): number {
  if (!dateStr) return 0
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24))
}

export default async function DeudoresPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (session.user.rol !== 'administracion') redirect('/dashboard')
  const supabase = createServerClient()

  const { data: facturadas } = await supabase
    .from('ordenes_venta')
    .select('id, numero, monto_total, moneda, estado, created_at, fecha_alta_prevista, clientes(nombre, empresa), perfiles(nombre)')
    .eq('estado', 'facturada')
    .order('created_at', { ascending: true })

  const rows = (facturadas ?? []).map(o => ({
    ...o,
    dias: diasDesde(o.created_at),
  }))

  const totalDeuda = rows.reduce((s, o) => s + Number(o.monto_total ?? 0), 0)
  const vencidas = rows.filter(r => r.dias > 30)
  const totalVencido = vencidas.reduce((s, o) => s + Number(o.monto_total ?? 0), 0)

  const urgencyColor = (dias: number) =>
    dias > 60 ? '#dc2626' : dias > 30 ? '#d97706' : '#0284c7'

  const urgencyLabel = (dias: number) =>
    dias > 60 ? 'Crítico' : dias > 30 ? 'Vencido' : 'Vigente'

  const urgencyBg = (dias: number) =>
    dias > 60 ? 'rgba(220,38,38,0.1)' : dias > 30 ? 'rgba(217,119,6,0.1)' : 'rgba(2,132,199,0.1)'

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total en deuda', value: fmt(totalDeuda), color: 'var(--text-primary)' },
          { label: 'Monto vencido (+30 días)', value: fmt(totalVencido), color: '#d97706' },
          { label: 'Órdenes pendientes', value: String(rows.length), color: 'var(--text-primary)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Debtors table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          Órdenes facturadas sin cobrar
        </div>
        {rows.length === 0 ? (
          <p style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Sin deudores registrados.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
                {['N° Orden', 'Cliente', 'Monto', 'Vendedor', 'Días facturado', 'Estado'].map((h, i) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: i >= 2 ? 'right' : 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', ...(i === 5 ? { textAlign: 'center' } : {}) }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(o => {
                const cli = Array.isArray(o.clientes) ? o.clientes[0] : o.clientes
                const vend = Array.isArray(o.perfiles) ? o.perfiles[0] : o.perfiles
                return (
                  <tr key={o.id} style={{ borderBottom: '1px solid var(--border)', background: o.dias > 60 ? 'rgba(220,38,38,0.03)' : 'transparent' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 12 }}>{o.numero ?? '—'}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{(cli as any)?.empresa ?? (cli as any)?.nombre ?? '—'}</div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(Number(o.monto_total ?? 0))}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>{(vend as any)?.nombre ?? '—'}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: urgencyColor(o.dias) }}>{o.dias} días</td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{ background: urgencyBg(o.dias), color: urgencyColor(o.dias), padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700 }}>{urgencyLabel(o.dias)}</span>
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
