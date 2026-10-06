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

/** La venta a la que está imputado el gasto, si tiene. */
function ventaDe(g: any): { numero: number | null; perfiles: any } | null {
  return (Array.isArray(g.ordenes_venta) ? g.ordenes_venta[0] : g.ordenes_venta) ?? null
}

/** El vendedor de esa venta. gastos_tarjeta no guarda vendedor propio. */
function vendedorDe(g: any): string | null {
  const v = ventaDe(g)
  const p = Array.isArray(v?.perfiles) ? v!.perfiles[0] : v?.perfiles
  return p?.nombre ?? null
}

export default async function GastosPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (session.user.rol !== 'administracion') redirect('/dashboard')
  const supabase = createServerClient()

  // Los totales y los desgloses salían de los últimos 50 gastos nada más, pero
  // el cartel decía "Total gastos registrados": con 120 gastos mostraba poco
  // más de la mitad y nadie se enteraba. Se traen todos para contar, y la
  // tabla de abajo sigue mostrando los últimos 50.
  const { data: gastos, error: gastosErr } = await supabase
    .from('gastos_tarjeta')
    .select('id, monto, categoria, descripcion, fecha, orden_id, ordenes_venta(numero, perfiles!vendedor_id(nombre))')
    .order('fecha', { ascending: false })

  if (gastosErr) throw new Error(`No se pudieron cargar los gastos: ${gastosErr.message}`)

  const ultimos = (gastos ?? []).slice(0, 50)
  const totalMes = gastos?.reduce((s, g) => s + Number(g.monto ?? 0), 0) ?? 0

  // Aggregate by category
  const catMap: Record<string, number> = {}
  gastos?.forEach(g => {
    const cat = g.categoria ?? 'otros'
    catMap[cat] = (catMap[cat] ?? 0) + Number(g.monto ?? 0)
  })
  const catStats = Object.entries(catMap).sort((a, b) => b[1] - a[1])
  const maxCat = Math.max(...catStats.map(([, v]) => v), 1)

  // Aggregate by vendor — el gasto no guarda vendedor, así que sale de la
  // venta a la que está imputado. Los que no tienen venta van aparte.
  const vendMap: Record<string, { nombre: string; total: number }> = {}
  gastos?.forEach(g => {
    const nombre = vendedorDe(g) ?? 'Sin venta asociada'
    if (!vendMap[nombre]) vendMap[nombre] = { nombre, total: 0 }
    vendMap[nombre].total += Number(g.monto ?? 0)
  })
  const vendStats = Object.values(vendMap).sort((a, b) => b.total - a.total)

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total gastos registrados', value: fmt(totalMes), color: 'var(--text-primary)' },
          { label: 'Transacciones', value: String(gastos?.length ?? 0), color: 'var(--text-primary)' },
          { label: 'Sin venta asociada', value: String(gastos?.filter(g => !g.orden_id).length ?? 0), color: '#d97706' },
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
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          Últimos gastos{(gastos?.length ?? 0) > ultimos.length ? ` — ${ultimos.length} de ${gastos!.length}` : ''}
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
              {['Fecha', 'Vendedor', 'Categoría', 'Descripción', 'Venta', 'Monto'].map((h, i) => (
                <th key={h} style={{ padding: '9px 14px', textAlign: i >= 5 ? 'right' : 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ultimos.map(g => {
              return (
                <tr key={g.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{g.fecha ? new Date(g.fecha).toLocaleDateString('es-UY') : '—'}</td>
                  <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{vendedorDe(g) ?? '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', textTransform: 'capitalize' }}>{g.categoria ?? '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.descripcion ?? '—'}</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{ventaDe(g)?.numero ? `#${ventaDe(g)!.numero}` : '—'}</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(Number(g.monto ?? 0))}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
