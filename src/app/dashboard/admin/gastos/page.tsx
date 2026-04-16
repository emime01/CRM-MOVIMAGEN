import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const fmt = (n: number) => '$' + n.toLocaleString('es-UY', { maximumFractionDigits: 0 })

const CATEGORIAS: Record<string, { color: string }> = {
  combustible:    { color: '#f59e0b' },
  viáticos:       { color: '#3b82f6' },
  entretenimiento:{ color: '#8b5cf6' },
  materiales:     { color: '#10b981' },
  otros:          { color: '#6b7280' },
}

export default async function GastosPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (session.user.rol !== 'administracion') redirect('/dashboard')
  const supabase = createServerClient()

  const { data: gastos } = await supabase
    .from('gastos_tarjeta')
    .select('id, vendedor_id, monto, categoria, descripcion, fecha, estado, perfiles(nombre)')
    .order('fecha', { ascending: false })
    .limit(50)

  const totalMes = gastos?.reduce((s, g) => s + Number(g.monto ?? 0), 0) ?? 0

  // Aggregate by category
  const catMap: Record<string, number> = {}
  gastos?.forEach(g => {
    const cat = g.categoria ?? 'otros'
    catMap[cat] = (catMap[cat] ?? 0) + Number(g.monto ?? 0)
  })
  const catStats = Object.entries(catMap).sort((a, b) => b[1] - a[1])
  const maxCat = Math.max(...catStats.map(([, v]) => v), 1)

  // Aggregate by vendor
  const vendMap: Record<string, { nombre: string; total: number }> = {}
  gastos?.forEach(g => {
    const p = Array.isArray(g.perfiles) ? g.perfiles[0] : g.perfiles
    const nombre = (p as any)?.nombre ?? 'Desconocido'
    if (!vendMap[g.vendedor_id]) vendMap[g.vendedor_id] = { nombre, total: 0 }
    vendMap[g.vendedor_id].total += Number(g.monto ?? 0)
  })
  const vendStats = Object.values(vendMap).sort((a, b) => b.total - a.total)

  const ESTADO_BADGE: Record<string, { bg: string; color: string; label: string }> = {
    aprobado:  { bg: 'rgba(21,128,61,0.12)',  color: '#15803d', label: 'Aprobado' },
    pendiente: { bg: 'rgba(217,119,6,0.12)',  color: '#d97706', label: 'Pendiente' },
    rechazado: { bg: 'rgba(220,38,38,0.12)',  color: '#dc2626', label: 'Rechazado' },
  }

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total gastos registrados', value: fmt(totalMes), color: 'var(--text-primary)' },
          { label: 'Transacciones', value: String(gastos?.length ?? 0), color: 'var(--text-primary)' },
          { label: 'Pendientes aprobación', value: String(gastos?.filter(g => g.estado === 'pendiente').length ?? 0), color: '#d97706' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* By category */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Por categoría</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {catStats.map(([cat, total]) => {
              const color = CATEGORIAS[cat]?.color ?? '#6b7280'
              return (
                <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 90, fontSize: 12, color: 'var(--text-secondary)', textTransform: 'capitalize', flexShrink: 0 }}>{cat}</div>
                  <div style={{ flex: 1, height: 20, background: 'var(--bg-app)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${Math.round((total / maxCat) * 100)}%`, background: color, borderRadius: 4, opacity: 0.85 }} />
                  </div>
                  <div style={{ width: 80, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right' }}>{fmt(total)}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* By vendor */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 }}>Por vendedor</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {vendStats.map((v, i) => (
              <div key={v.nombre} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 10, borderBottom: i < vendStats.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{v.nombre}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(v.total)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Transaction list */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Últimos gastos</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
              {['Fecha', 'Vendedor', 'Categoría', 'Descripción', 'Monto', 'Estado'].map((h, i) => (
                <th key={h} style={{ padding: '9px 14px', textAlign: i >= 4 ? 'right' : 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', ...(i === 5 ? { textAlign: 'center' } : {}) }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gastos?.map(g => {
              const p = Array.isArray(g.perfiles) ? g.perfiles[0] : g.perfiles
              const badge = ESTADO_BADGE[g.estado ?? 'pendiente'] ?? ESTADO_BADGE['pendiente']
              return (
                <tr key={g.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{g.fecha ? new Date(g.fecha).toLocaleDateString('es-UY') : '—'}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{(p as any)?.nombre ?? '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{g.categoria ?? '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.descripcion ?? '—'}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(Number(g.monto ?? 0))}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <span style={{ background: badge.bg, color: badge.color, padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{badge.label}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
