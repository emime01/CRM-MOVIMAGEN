import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

function getQuarters() {
  const y = new Date().getFullYear()
  return [
    { label: `Q1-${y}`, start: `${y}-01-01`, end: `${y}-04-30` },
    { label: `Q2-${y}`, start: `${y}-05-01`, end: `${y}-08-31` },
    { label: `Q3-${y}`, start: `${y}-09-01`, end: `${y}-12-31` },
  ]
}

const fmt = (n: number) => '$' + n.toLocaleString('es-UY', { maximumFractionDigits: 0 })
const pct = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0

export default async function CeoDashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!['gerente_comercial', 'administracion'].includes(session.user.rol)) redirect('/dashboard')
  const supabase = createServerClient()
  const quarters = getQuarters()
  const yearStart = `${new Date().getFullYear()}-01-01`
  const yearEnd = `${new Date().getFullYear()}-12-31`

  const [{ data: ordenes }, { data: leads }, { data: objetivos }, { data: vendedores }] = await Promise.all([
    supabase.from('ordenes_venta').select('monto_total, estado, created_at, vendedor_id').gte('created_at', yearStart).lte('created_at', yearEnd),
    supabase.from('leads').select('estado, monto_potencial, vendedor_id'),
    supabase.from('objetivos').select('objetivo_monto, cuatrimestre, vendedor_id').in('cuatrimestre', quarters.map(q => q.label)),
    supabase.from('perfiles').select('id, nombre, rol').in('rol', ['vendedor', 'asistente_ventas']).eq('activo', true),
  ])

  const activeStates = ['aprobada', 'en_oic', 'facturada', 'cobrada']

  // YTD metrics
  const facturadoYTD = ordenes?.filter(o => activeStates.includes(o.estado ?? '')).reduce((s, o) => s + Number(o.monto_total ?? 0), 0) ?? 0
  const cobradoYTD = ordenes?.filter(o => o.estado === 'cobrada').reduce((s, o) => s + Number(o.monto_total ?? 0), 0) ?? 0
  const pipeline = leads?.filter(l => !['ganado', 'perdido'].includes(l.estado ?? '')).reduce((s, l) => s + Number(l.monto_potencial ?? 0), 0) ?? 0
  const leadsTotal = leads?.length ?? 0
  const leadsGanados = leads?.filter(l => l.estado === 'ganado').length ?? 0
  const convRate = pct(leadsGanados, leadsTotal)

  // Orders by state
  const stateGroups: Record<string, { count: number; total: number }> = {}
  ordenes?.forEach(o => {
    const s = o.estado ?? 'sin_estado'
    if (!stateGroups[s]) stateGroups[s] = { count: 0, total: 0 }
    stateGroups[s].count++
    stateGroups[s].total += Number(o.monto_total ?? 0)
  })

  // Revenue vs objective per quarter
  const qStats = quarters.map(q => {
    const rev = ordenes?.filter(o => activeStates.includes(o.estado ?? '') && o.created_at && o.created_at >= q.start && o.created_at <= q.end).reduce((s, o) => s + Number(o.monto_total ?? 0), 0) ?? 0
    const obj = objetivos?.filter(o => o.cuatrimestre === q.label).reduce((s, o) => s + Number(o.objetivo_monto ?? 0), 0) ?? 0
    return { ...q, rev, obj, avance: pct(rev, obj) }
  })

  const maxQRev = Math.max(...qStats.map(q => Math.max(q.rev, q.obj)), 1)

  // Vendor performance
  const vendorStats = vendedores?.map(v => {
    const myOrds = ordenes?.filter(o => o.vendedor_id === v.id && activeStates.includes(o.estado ?? '')) ?? []
    const facturado = myOrds.reduce((s, o) => s + Number(o.monto_total ?? 0), 0)
    const obj = objetivos?.filter(o => o.vendedor_id === v.id).reduce((s, o) => s + Number(o.objetivo_monto ?? 0), 0) ?? 0
    return { ...v, facturado, obj, avance: pct(facturado, obj) }
  }).sort((a, b) => b.facturado - a.facturado) ?? []

  const STATE_LABELS: Record<string, string> = {
    cobrada: 'Cobrada', facturada: 'Facturada', aprobada: 'Aprobada',
    en_oic: 'En OIC', pendiente_aprobacion: 'Pend. Aprobación',
    borrador: 'Borrador', rechazada: 'Rechazada',
  }
  const STATE_COLORS: Record<string, string> = {
    cobrada: '#15803d', facturada: '#0284c7', aprobada: '#16a34a',
    en_oic: 'var(--orange)', pendiente_aprobacion: '#d97706',
    borrador: '#6b7280', rechazada: '#dc2626',
  }

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: `Facturado ${new Date().getFullYear()}`, value: fmt(facturadoYTD), sub: 'Año en curso' },
          { label: 'Cobrado YTD', value: fmt(cobradoYTD), sub: 'Efectivamente cobrado' },
          { label: 'Pipeline activo', value: fmt(pipeline), sub: 'Leads en curso' },
          { label: 'Tasa de cierre', value: `${convRate}%`, sub: `${leadsGanados} de ${leadsTotal} leads` },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Revenue vs objective per quarter */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Facturado vs Objetivo por cuatrimestre</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {qStats.map(q => (
              <div key={q.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{q.label}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{fmt(q.rev)} / {q.obj > 0 ? fmt(q.obj) : 'Sin obj.'} — <strong style={{ color: 'var(--orange)' }}>{q.avance}%</strong></span>
                </div>
                <div style={{ height: 8, background: 'var(--bg-app)', borderRadius: 4, overflow: 'hidden', marginBottom: 2 }}>
                  <div style={{ height: '100%', width: `${Math.round((q.rev / maxQRev) * 100)}%`, background: 'var(--orange)', borderRadius: 4 }} />
                </div>
                {q.obj > 0 && (
                  <div style={{ height: 4, background: 'var(--bg-app)', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.round((q.obj / maxQRev) * 100)}%`, background: '#0284c7', borderRadius: 2, opacity: 0.5 }} />
                  </div>
                )}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 6, background: 'var(--orange)', borderRadius: 2, display: 'inline-block' }} /> Facturado</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 4, background: '#0284c7', opacity: 0.5, borderRadius: 2, display: 'inline-block' }} /> Objetivo</span>
            </div>
          </div>
        </div>

        {/* Orders by state */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Órdenes por estado (año en curso)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(stateGroups).sort((a, b) => b[1].total - a[1].total).map(([state, data]) => (
              <div key={state} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATE_COLORS[state] ?? '#6b7280', display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{STATE_LABELS[state] ?? state}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({data.count})</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(data.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Vendor performance */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Performance del equipo (año en curso)</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
              {['Vendedor', 'Facturado', 'Objetivo total', 'Avance'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Vendedor' ? 'left' : 'right', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vendorStats.map(v => (
              <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>{v.nombre}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(v.facturado)}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-muted)' }}>{v.obj > 0 ? fmt(v.obj) : '—'}</td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                    <div style={{ width: 80, height: 6, background: 'var(--bg-app)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(v.avance, 100)}%`, background: v.avance >= 100 ? '#15803d' : 'var(--orange)', borderRadius: 3 }} />
                    </div>
                    <span style={{ fontWeight: 700, color: v.avance >= 100 ? '#15803d' : 'var(--orange)', minWidth: 36, textAlign: 'right' }}>{v.avance}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
