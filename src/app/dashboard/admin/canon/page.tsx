import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import CanonClient from './CanonClient'

export const dynamic = 'force-dynamic'

const fmt = (n: number) => '$' + n.toLocaleString('es-UY', { maximumFractionDigits: 0 })

export default async function CanonPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (session.user.rol !== 'administracion') redirect('/dashboard')
  const supabase = createServerClient()

  const [{ data: config }, { data: liquidaciones }] = await Promise.all([
    supabase.from('canon_config').select('*').order('nombre'),
    supabase.from('canon_liquidaciones').select('*').order('periodo', { ascending: false }).limit(24),
  ])

  const totalPagado = liquidaciones?.filter(l => l.estado === 'pagado').reduce((s, l) => s + Number(l.monto ?? 0), 0) ?? 0
  const totalPendiente = liquidaciones?.filter(l => l.estado !== 'pagado').reduce((s, l) => s + Number(l.monto ?? 0), 0) ?? 0

  const ESTADO: Record<string, { bg: string; color: string; label: string }> = {
    pagado:    { bg: 'rgba(21,128,61,0.12)',   color: '#15803d', label: 'Pagado' },
    pendiente: { bg: 'rgba(217,119,6,0.12)',   color: '#d97706', label: 'Pendiente' },
    vencido:   { bg: 'rgba(220,38,38,0.12)',   color: '#dc2626', label: 'Vencido' },
  }

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>

      {/* Contratos existentes */}
      {((config?.length ?? 0) > 0 || (liquidaciones?.length ?? 0) > 0) && (
        <>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
            Canon contractual
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
            {[
              { label: 'Pagado (período)', value: fmt(totalPagado), color: '#15803d' },
              { label: 'Pendiente de pago', value: fmt(totalPendiente), color: '#d97706' },
              { label: 'Contratos activos', value: String(config?.length ?? 0), color: 'var(--text-primary)' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>

          {(config?.length ?? 0) > 0 && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Contratos de canon</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
                    {['Nombre', 'Monto mensual', 'Periodicidad', 'Próximo vencimiento'].map(h => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {config?.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>{c.nombre}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 700 }}>{fmt(Number(c.monto_mensual ?? 0))}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{c.periodicidad ?? '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>{c.proximo_vencimiento ? new Date(c.proximo_vencimiento).toLocaleDateString('es-UY') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(liquidaciones?.length ?? 0) > 0 && (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 32 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Historial de liquidaciones</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
                    {['Período', 'Concepto', 'Monto', 'Fecha pago', 'Estado'].map((h, i) => (
                      <th key={h} style={{ padding: '10px 16px', textAlign: i >= 2 ? 'right' : 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {liquidaciones?.map(l => {
                    const badge = ESTADO[l.estado ?? 'pendiente'] ?? ESTADO['pendiente']
                    return (
                      <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600 }}>{l.periodo ?? '—'}</td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>{l.concepto ?? '—'}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }}>{fmt(Number(l.monto ?? 0))}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>{l.fecha_pago ? new Date(l.fecha_pago).toLocaleDateString('es-UY') : '—'}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <span style={{ background: badge.bg, color: badge.color, padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700 }}>{badge.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ borderTop: '2px solid var(--border)', paddingTop: 28, marginBottom: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 20 }}>
              Canon por shopping (automático)
            </div>
          </div>
        </>
      )}

      <CanonClient />
    </div>
  )
}
