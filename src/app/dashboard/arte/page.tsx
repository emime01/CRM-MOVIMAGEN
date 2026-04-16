import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export default async function ArteDigitalPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  const supabase = createServerClient()
  const today = new Date().toISOString().split('T')[0]

  const [{ data: soportes }, { data: items }] = await Promise.all([
    supabase.from('soportes').select('id, nombre, seccion, ubicacion, salidas_por_hora, horas_encendido').eq('tipo', 'led').eq('activo', true).order('seccion'),
    supabase.from('orden_items').select('soporte_id, semanas, ordenes_venta(numero, marca, estado, fecha_alta_prevista, fecha_baja_prevista, clientes(nombre, empresa))').not('ordenes_venta', 'is', null),
  ])

  const campanasMap: Record<string, { empresa: string; marca: string; desde: string; hasta: string }> = {}
  ;(items ?? []).forEach((item: any) => {
    if (!item.soporte_id) return
    const ord = Array.isArray(item.ordenes_venta) ? item.ordenes_venta[0] : item.ordenes_venta
    if (!ord || !['aprobada', 'en_oic', 'facturada', 'cobrada'].includes(ord.estado)) return
    if (ord.fecha_baja_prevista && ord.fecha_baja_prevista < today) return
    if (campanasMap[item.soporte_id]) return // keep first
    const cli = Array.isArray(ord.clientes) ? ord.clientes[0] : ord.clientes
    campanasMap[item.soporte_id] = { empresa: cli?.empresa ?? cli?.nombre ?? '—', marca: ord.marca ?? '—', desde: ord.fecha_alta_prevista ?? '', hasta: ord.fecha_baja_prevista ?? '' }
  })

  const total = soportes?.length ?? 0
  const ocupadas = soportes?.filter((s: any) => campanasMap[s.id]).length ?? 0

  const fmt = (d: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit' }) : '—'

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total pantallas LED', value: total, color: 'var(--text-primary)' },
          { label: 'Con campaña activa', value: ocupadas, color: 'var(--orange)' },
          { label: 'Libres', value: total - ocupadas, color: '#15803d' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-app)' }}>
              {['Pantalla', 'Ubicación', 'Salidas/h', 'Estado', 'Campaña actual', 'Período'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {soportes?.map((s: any) => {
              const c = campanasMap[s.id]
              return (
                <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{s.nombre}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-secondary)', fontSize: 12 }}>{s.ubicacion}</td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-muted)', textAlign: 'center' }}>{s.salidas_por_hora ?? '—'}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ background: c ? 'var(--orange-pale)' : '#f0fdf4', color: c ? 'var(--orange)' : '#15803d', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                      {c ? 'Ocupada' : 'Libre'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-secondary)' }}>
                    {c ? <><strong>{c.empresa}</strong><br /><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.marca}</span></> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
                    {c ? `${fmt(c.desde)} → ${fmt(c.hasta)}` : '—'}
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
