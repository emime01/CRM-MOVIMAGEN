import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { TrendingUp, DollarSign, Target, Award, CheckCircle, XCircle } from 'lucide-react'

type EstadoOrden =
  | 'borrador'
  | 'pendiente_aprobacion'
  | 'aprobada'
  | 'rechazada'
  | 'en_oic'
  | 'facturada'
  | 'cobrada'

const ESTADO_BADGE: Record<EstadoOrden, { bg: string; color: string; label: string }> = {
  borrador:             { bg: 'var(--gray-100)', color: 'var(--gray-600)', label: 'Borrador' },
  pendiente_aprobacion: { bg: 'var(--amber-pale)', color: 'var(--amber)', label: 'Pend. aprobación' },
  aprobada:             { bg: 'var(--green-pale)', color: 'var(--green)', label: 'Aprobada' },
  rechazada:            { bg: 'var(--red-pale)', color: 'var(--red)', label: 'Rechazada' },
  en_oic:               { bg: 'var(--orange-pale)', color: 'var(--orange)', label: 'En OIC' },
  facturada:            { bg: 'var(--green-pale)', color: 'var(--green)', label: 'Facturada' },
  cobrada:              { bg: 'var(--green-pale)', color: 'var(--green)', label: 'Cobrada' },
}

const ETAPA_LABEL: Record<string, string> = {
  nuevo: 'Nuevo',
  en_conversacion: 'En conversación',
  propuesta_enviada: 'Propuesta enviada',
  negociacion: 'Negociación',
  ganado: 'Ganado',
  perdido: 'Perdido',
}

function getCurrentQuarter(): { label: string; start: string; end: string } {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  if (month <= 4) return { label: 'Q1', start: `${year}-01-01`, end: `${year}-04-30` }
  if (month <= 8) return { label: 'Q2', start: `${year}-05-01`, end: `${year}-08-31` }
  return { label: 'Q3', start: `${year}-09-01`, end: `${year}-12-31` }
}

function formatMoney(amount: number, currency: string = 'USD') {
  return new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const supabase = createServerClient()
  const vendedorId = session.user.id
  const rol = session.user.rol
  const quarter = getCurrentQuarter()

  // Parallel queries
  const [ordersRes, leadsRes, objetivoRes, facturadoRes] = await Promise.all([
    supabase
      .from('ordenes_venta')
      .select('id, numero, monto_total, moneda, estado, created_at, clientes(nombre)')
      .eq('vendedor_id', vendedorId)
      .order('created_at', { ascending: false })
      .limit(5),

    supabase
      .from('leads')
      .select('id, cliente_nombre, etapa, monto_potencial')
      .eq('vendedor_id', vendedorId)
      .not('etapa', 'in', '(ganado,perdido)')
      .order('created_at', { ascending: false })
      .limit(5),

    supabase
      .from('objetivos')
      .select('monto_objetivo')
      .eq('vendedor_id', vendedorId)
      .eq('cuatrimestre', quarter.label)
      .maybeSingle(),

    supabase
      .from('ordenes_venta')
      .select('monto_total, moneda')
      .eq('vendedor_id', vendedorId)
      .in('estado', ['aprobada', 'en_oic', 'facturada', 'cobrada'])
      .gte('created_at', quarter.start)
      .lte('created_at', `${quarter.end}T23:59:59`),
  ])

  const recentOrders = ordersRes.data ?? []
  const activeLeads = leadsRes.data ?? []
  const objetivo = objetivoRes.data?.monto_objetivo ?? 0
  const facturadoItems = facturadoRes.data ?? []
  const facturado = facturadoItems.reduce((sum, o) => sum + (o.monto_total ?? 0), 0)
  const avance = objetivo > 0 ? Math.min((facturado / objetivo) * 100, 100) : 0

  // Manager-specific queries
  let teamData: { id: string; nombre: string; facturado: number; objetivo: number }[] = []
  let pendingApprovals: any[] = []

  if (rol === 'gerente_comercial') {
    const [teamRes, pendingRes] = await Promise.all([
      supabase
        .from('perfiles')
        .select('id, nombre')
        .in('rol', ['vendedor', 'asistente_ventas']),

      supabase
        .from('ordenes_venta')
        .select('id, numero, monto_total, moneda, created_at, clientes(nombre), perfiles!vendedor_id(nombre)')
        .eq('estado', 'pendiente_aprobacion')
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    const team = teamRes.data ?? []
    pendingApprovals = pendingRes.data ?? []

    if (team.length > 0) {
      const teamIds = team.map(t => t.id)
      const [teamOrdersRes, teamObjetivosRes] = await Promise.all([
        supabase
          .from('ordenes_venta')
          .select('vendedor_id, monto_total')
          .in('vendedor_id', teamIds)
          .in('estado', ['aprobada', 'en_oic', 'facturada', 'cobrada'])
          .gte('created_at', quarter.start)
          .lte('created_at', `${quarter.end}T23:59:59`),

        supabase
          .from('objetivos')
          .select('vendedor_id, monto_objetivo')
          .in('vendedor_id', teamIds)
          .eq('cuatrimestre', quarter.label),
      ])

      const teamOrders = teamOrdersRes.data ?? []
      const teamObjetivos = teamObjetivosRes.data ?? []

      teamData = team.map(member => {
        const memberFact = teamOrders
          .filter(o => o.vendedor_id === member.id)
          .reduce((s, o) => s + (o.monto_total ?? 0), 0)
        const memberObj = teamObjetivos.find(o => o.vendedor_id === member.id)?.monto_objetivo ?? 0
        return { id: member.id, nombre: member.nombre, facturado: memberFact, objetivo: memberObj }
      })
    }
  }

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>

      {/* Quarter badge */}
      <div style={{ marginBottom: 20 }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          padding: '4px 12px',
          background: 'var(--orange-pale)',
          color: 'var(--orange)',
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 600,
        }}>
          {quarter.label} · {new Date().getFullYear()}
        </span>
      </div>

      {/* Metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--orange-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <DollarSign size={18} color="var(--orange)" />
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Facturado {quarter.label}</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
            {formatMoney(facturado)}
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Target size={18} color="var(--gray-600)" />
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Objetivo {quarter.label}</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
            {objetivo > 0 ? formatMoney(objetivo) : <span style={{ color: 'var(--text-muted)', fontSize: 14 }}>Sin objetivo</span>}
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--green-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TrendingUp size={18} color="var(--green)" />
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Avance</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
            {avance.toFixed(1)}%
          </div>
          <div style={{ height: 6, background: 'var(--gray-100)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${avance}%`,
              background: avance >= 100 ? 'var(--green)' : avance >= 60 ? 'var(--orange)' : 'var(--red)',
              borderRadius: 3,
            }} />
          </div>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--amber-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Award size={18} color="var(--amber)" />
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Leads activos</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>
            {activeLeads.length}
          </div>
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>

        {/* Recent orders */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Últimas ventas</span>
            <a href="/dashboard/ventas" style={{ fontSize: 12, color: 'var(--orange)', textDecoration: 'none', fontWeight: 500 }}>
              Ver todas →
            </a>
          </div>
          {recentOrders.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No hay ventas registradas aún.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--gray-100)' }}>
                  {['N° Orden', 'Cliente', 'Monto', 'Estado', 'Fecha'].map(h => (
                    <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order: any, i: number) => {
                  const badge = ESTADO_BADGE[order.estado as EstadoOrden] ?? { bg: 'var(--gray-100)', color: 'var(--gray-600)', label: order.estado }
                  return (
                    <tr key={order.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {order.numero ?? `#${String(order.id).slice(0, 6)}`}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>
                        {(order.clientes as any)?.nombre ?? '—'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {order.monto_total != null ? formatMoney(order.monto_total, order.moneda ?? 'USD') : '—'}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                        {formatDate(order.created_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Active leads */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Leads activos</span>
            <a href="/dashboard/leads" style={{ fontSize: 12, color: 'var(--orange)', textDecoration: 'none', fontWeight: 500 }}>
              Ver todos →
            </a>
          </div>
          {activeLeads.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No hay leads activos.
            </div>
          ) : (
            <div>
              {activeLeads.map((lead: any, i: number) => (
                <div key={lead.id} style={{
                  padding: '12px 20px',
                  borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                    {lead.cliente_nombre}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {ETAPA_LABEL[lead.etapa] ?? lead.etapa}
                    </span>
                    {lead.monto_potencial != null && (
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--green)' }}>
                        {formatMoney(lead.monto_potencial)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Manager sections */}
      {rol === 'gerente_comercial' && (
        <div style={{ marginTop: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Team performance */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                Performance del equipo · {quarter.label}
              </span>
            </div>
            {teamData.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Sin datos.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--gray-100)' }}>
                    {['Vendedor', 'Facturado', 'Objetivo', '% Avance'].map(h => (
                      <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teamData.map((member, i) => {
                    const pct = member.objetivo > 0 ? Math.min((member.facturado / member.objetivo) * 100, 100) : 0
                    return (
                      <tr key={member.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                        <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{member.nombre}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{formatMoney(member.facturado)}</td>
                        <td style={{ padding: '10px 16px', fontSize: 13, color: 'var(--text-secondary)' }}>{member.objetivo > 0 ? formatMoney(member.objetivo) : '—'}</td>
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ flex: 1, height: 6, background: 'var(--gray-100)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? 'var(--green)' : pct >= 60 ? 'var(--orange)' : 'var(--red)', borderRadius: 3 }} />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', minWidth: 36 }}>{pct.toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pending approvals */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                Pendientes de aprobación
              </span>
              {pendingApprovals.length > 0 && (
                <span style={{ padding: '2px 8px', background: 'var(--amber-pale)', color: 'var(--amber)', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                  {pendingApprovals.length}
                </span>
              )}
            </div>
            {pendingApprovals.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No hay órdenes pendientes.
              </div>
            ) : (
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {pendingApprovals.map((order: any, i: number) => (
                  <div key={order.id} style={{
                    padding: '12px 20px',
                    borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>
                        {order.numero ?? `#${String(order.id).slice(0, 6)}`} · {(order.clientes as any)?.nombre ?? '—'}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {(order.perfiles as any)?.nombre ?? '—'} · {order.monto_total != null ? formatMoney(order.monto_total, order.moneda ?? 'USD') : '—'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid var(--green)', background: 'var(--green-pale)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Aprobar"
                      >
                        <CheckCircle size={14} color="var(--green)" />
                      </button>
                      <button
                        style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid var(--red)', background: 'var(--red-pale)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Rechazar"
                      >
                        <XCircle size={14} color="var(--red)" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
