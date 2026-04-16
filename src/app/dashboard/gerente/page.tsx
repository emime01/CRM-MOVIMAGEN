import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

function getCurrentQuarter() {
  const m = new Date().getMonth() + 1; const y = new Date().getFullYear()
  if (m <= 4) return { label: `Q1-${y}`, start: `${y}-01-01`, end: `${y}-04-30` }
  if (m <= 8) return { label: `Q2-${y}`, start: `${y}-05-01`, end: `${y}-08-31` }
  return { label: `Q3-${y}`, start: `${y}-09-01`, end: `${y}-12-31` }
}

const fmt = (n: number) => '$' + n.toLocaleString('es-UY', { maximumFractionDigits: 0 })

export default async function GerentePage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!['gerente_comercial', 'administracion'].includes(session.user.rol)) redirect('/dashboard')
  const supabase = createServerClient()
  const q = getCurrentQuarter()

  const [{ data: vendedores }, { data: ordenes }, { data: leads }, { data: objetivos }] = await Promise.all([
    supabase.from('perfiles').select('id, nombre, rol').in('rol', ['vendedor', 'asistente_ventas']).eq('activo', true),
    supabase.from('ordenes_venta').select('vendedor_id, monto_total, estado, created_at')
      .in('estado', ['aprobada', 'en_oic', 'facturada', 'cobrada'])
      .gte('created_at', q.start).lte('created_at', q.end),
    supabase.from('leads').select('vendedor_id, estado, monto_potencial'),
    supabase.from('objetivos').select('vendedor_id, objetivo_monto').eq('cuatrimestre', q.label),
  ])

  const ROL_LABELS: Record<string, string> = { vendedor: 'Vendedor', asistente_ventas: 'Asistente de Ventas' }

  const stats = vendedores?.map(v => {
    const myOrds = ordenes?.filter(o => o.vendedor_id === v.id) ?? []
    const facturado = myOrds.reduce((s, o) => s + Number(o.monto_total ?? 0), 0)
    const myLeads = leads?.filter(l => l.vendedor_id === v.id) ?? []
    const leadsActivos = myLeads.filter(l => !['ganado', 'perdido'].includes(l.estado ?? '')).length
    const pipeline = myLeads.filter(l => !['ganado', 'perdido'].includes(l.estado ?? '')).reduce((s, l) => s + Number(l.monto_potencial ?? 0), 0)
    const obj = objetivos?.find(o => o.vendedor_id === v.id)
    const objetivo = Number(obj?.objetivo_monto ?? 0)
    const avance = objetivo > 0 ? Math.min(Math.round((facturado / objetivo) * 100), 100) : 0
    return { ...v, facturado, objetivo, avance, leadsActivos, pipeline }
  }) ?? []

  const totalFact = stats.reduce((s, v) => s + v.facturado, 0)
  const totalObj = stats.reduce((s, v) => s + v.objetivo, 0)
  const teamAvance = totalObj > 0 ? Math.min(Math.round((totalFact / totalObj) * 100), 100) : 0

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      {/* Team summary */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px', marginBottom: 24, display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Equipo facturado {q.label}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(totalFact)}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Objetivo equipo</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{totalObj > 0 ? fmt(totalObj) : '—'}</div>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>Avance del equipo — {teamAvance}%</div>
          <div style={{ height: 10, background: 'var(--bg-app)', borderRadius: 5, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${teamAvance}%`, background: 'var(--orange)', borderRadius: 5 }} />
          </div>
        </div>
      </div>

      {/* Vendor cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
        {stats.map(v => (
          <div key={v.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{v.nombre}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{ROL_LABELS[v.rol] ?? v.rol}</div>
              </div>
              <div style={{ background: 'var(--orange-pale)', color: 'var(--orange)', padding: '4px 10px', borderRadius: 6, fontSize: 13, fontWeight: 700 }}>{v.avance}%</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                <span>Facturado: <strong style={{ color: 'var(--text-primary)' }}>{fmt(v.facturado)}</strong></span>
                <span>Objetivo: <strong style={{ color: 'var(--text-primary)' }}>{v.objetivo > 0 ? fmt(v.objetivo) : '—'}</strong></span>
              </div>
              <div style={{ height: 8, background: 'var(--bg-app)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${v.avance}%`, background: v.avance >= 100 ? '#15803d' : 'var(--orange)', borderRadius: 4 }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Leads activos', value: v.leadsActivos },
                { label: 'Pipeline', value: fmt(v.pipeline) },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--bg-app)', borderRadius: 6, padding: '8px 12px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 3 }}>{s.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
