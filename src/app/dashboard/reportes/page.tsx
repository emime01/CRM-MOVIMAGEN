import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

function getCurrentQuarter() {
  const now = new Date(); const m = now.getMonth() + 1; const y = now.getFullYear()
  if (m <= 4) return { label: `Q1-${y}`, start: `${y}-01-01`, end: `${y}-04-30` }
  if (m <= 8) return { label: `Q2-${y}`, start: `${y}-05-01`, end: `${y}-08-31` }
  return { label: `Q3-${y}`, start: `${y}-09-01`, end: `${y}-12-31` }
}

const fmt = (n: number) => n.toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

export default async function ReportesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  const supabase = createServerClient()
  const q = getCurrentQuarter()
  const isGerente = ['gerente_comercial', 'administracion'].includes(session.user.rol)

  let ordQuery = supabase.from('ordenes_venta').select('monto_total, estado, created_at, clientes(nombre, empresa)')
    .in('estado', ['aprobada', 'en_oic', 'facturada', 'cobrada'])
  if (!isGerente) ordQuery = ordQuery.eq('vendedor_id', session.user.id)

  let leadsQuery = supabase.from('leads').select('estado, monto_potencial')
  if (!isGerente) leadsQuery = leadsQuery.eq('vendedor_id', session.user.id)

  const [{ data: ordenes }, { data: leads }, { data: objetivo }] = await Promise.all([
    ordQuery,
    leadsQuery,
    supabase.from('objetivos').select('objetivo_monto').eq('vendedor_id', session.user.id).eq('cuatrimestre', q.label).maybeSingle(),
  ])

  // Monthly revenue — dynamic based on current quarter
  const MONTH_NAMES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
  const QUARTER_MONTHS: Record<string, number[]> = { Q1: [1, 2, 3, 4], Q2: [5, 6, 7, 8], Q3: [9, 10, 11, 12] }
  const [qCode, qYear] = q.label.split('-')
  const months = (QUARTER_MONTHS[qCode] ?? [1, 2, 3, 4]).map(m => ({
    label: MONTH_NAMES[m],
    key: `${qYear}-${String(m).padStart(2, '0')}`,
  }))
  const monthlyRev = months.map(m => ({
    ...m,
    total: ordenes?.filter(o => o.created_at?.startsWith(m.key) && ['facturada', 'cobrada'].includes(o.estado ?? '')).reduce((s, o) => s + Number(o.monto_total ?? 0), 0) ?? 0,
  }))
  const maxMonthly = Math.max(...monthlyRev.map(m => m.total), 1)

  // Q metrics
  const facturadoQ = ordenes?.filter(o => o.created_at && o.created_at >= q.start && o.created_at <= q.end).reduce((s, o) => s + Number(o.monto_total ?? 0), 0) ?? 0
  const objetivoQ = Number(objetivo?.objetivo_monto ?? 0)
  const avancePct = objetivoQ > 0 ? Math.min(Math.round((facturadoQ / objetivoQ) * 100), 100) : 0
  const pipeline = leads?.filter(l => !['ganado', 'perdido'].includes(l.estado ?? '')).reduce((s, l) => s + Number(l.monto_potencial ?? 0), 0) ?? 0

  // Leads by stage
  const ETAPAS = [
    { key: 'nuevo', label: 'Nuevo', color: '#6b7280' },
    { key: 'en_conversacion', label: 'En conversación', color: '#3b82f6' },
    { key: 'propuesta_enviada', label: 'Propuesta enviada', color: '#f59e0b' },
    { key: 'negociacion', label: 'Negociación', color: '#eb691c' },
    { key: 'ganado', label: 'Ganado', color: '#15803d' },
    { key: 'perdido', label: 'Perdido', color: '#dc2626' },
  ]
  const leadsCount = ETAPAS.map(e => ({ ...e, count: leads?.filter(l => l.estado === e.key).length ?? 0 }))
  const maxLeads = Math.max(...leadsCount.map(e => e.count), 1)

  // Top clients
  const clientMap: Record<string, { nombre: string; total: number; count: number }> = {}
  ordenes?.forEach(o => {
    const cli = Array.isArray(o.clientes) ? o.clientes[0] : o.clientes
    const nombre = (cli as any)?.empresa ?? (cli as any)?.nombre ?? 'Sin cliente'
    if (!clientMap[nombre]) clientMap[nombre] = { nombre, total: 0, count: 0 }
    clientMap[nombre].total += Number(o.monto_total ?? 0)
    clientMap[nombre].count++
  })
  const topClientes = Object.values(clientMap).sort((a, b) => b.total - a.total).slice(0, 5)
  const maxClient = Math.max(...topClientes.map(c => c.total), 1)

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: `Facturado ${q.label}`, value: `$${fmt(facturadoQ)}`, sub: 'USD' },
          { label: 'Objetivo Q', value: objetivoQ > 0 ? `$${fmt(objetivoQ)}` : 'Sin objetivo', sub: objetivoQ > 0 ? 'USD' : '' },
          { label: 'Avance', value: `${avancePct}%`, sub: 'del objetivo', bar: avancePct },
          { label: 'Pipeline activo', value: `$${fmt(pipeline)}`, sub: 'leads en curso' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', marginBottom: 4 }}>{s.value}</div>
            {s.bar !== undefined && (
              <div style={{ height: 6, background: 'var(--bg-app)', borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
                <div style={{ height: '100%', width: `${s.bar}%`, background: 'var(--orange)', borderRadius: 3, transition: 'width 0.3s' }} />
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Monthly bar chart */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Facturado por mes — {q.label}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {monthlyRev.map(m => (
              <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 60, fontSize: 12, color: 'var(--text-muted)', flexShrink: 0 }}>{m.label}</div>
                <div style={{ flex: 1, height: 24, background: 'var(--bg-app)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round((m.total / maxMonthly) * 100)}%`, background: 'var(--orange)', borderRadius: 4, minWidth: m.total > 0 ? 4 : 0 }} />
                </div>
                <div style={{ width: 80, fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'right' }}>{m.total > 0 ? `$${fmt(m.total)}` : '—'}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Leads by stage */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Leads por etapa</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {leadsCount.map(e => (
              <div key={e.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 110, fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>{e.label}</div>
                <div style={{ flex: 1, height: 20, background: 'var(--bg-app)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round((e.count / maxLeads) * 100)}%`, background: e.color, borderRadius: 4, minWidth: e.count > 0 ? 4 : 0, opacity: 0.85 }} />
                </div>
                <div style={{ width: 24, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right' }}>{e.count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top clients */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Top clientes</div>
        {topClientes.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Sin datos disponibles.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {topClientes.map((c, i) => (
              <div key={c.nombre} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--orange-pale)', color: 'var(--orange)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                <div style={{ width: 160, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>{c.nombre}</div>
                <div style={{ flex: 1, height: 20, background: 'var(--bg-app)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${Math.round((c.total / maxClient) * 100)}%`, background: 'var(--orange)', borderRadius: 4, opacity: 0.7 }} />
                </div>
                <div style={{ width: 90, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right' }}>${fmt(c.total)}</div>
                <div style={{ width: 60, fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>{c.count} órdenes</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
