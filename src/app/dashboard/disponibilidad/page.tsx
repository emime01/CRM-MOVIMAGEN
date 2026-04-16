import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

function getWeeks(n = 10) {
  const weeks: { label: string; start: string; end: string }[] = []
  const now = new Date()
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1))
  monday.setHours(0, 0, 0, 0)
  for (let i = 0; i < n; i++) {
    const s = new Date(monday); s.setDate(monday.getDate() + i * 7)
    const e = new Date(s); e.setDate(s.getDate() + 6)
    weeks.push({ label: `${s.getDate()}/${s.getMonth() + 1}`, start: s.toISOString().split('T')[0], end: e.toISOString().split('T')[0] })
  }
  return weeks
}

export default async function DisponibilidadPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  const supabase = createServerClient()
  const weeks = getWeeks(10)
  const rangeStart = weeks[0].start, rangeEnd = weeks[weeks.length - 1].end

  const [{ data: soportes }, { data: ordenes }, { data: reservas }] = await Promise.all([
    supabase.from('soportes').select('id, nombre, seccion, ubicacion').eq('activo', true).order('seccion').limit(30),
    supabase.from('ordenes_venta').select('id, fecha_alta_prevista, fecha_baja_prevista, clientes(nombre, empresa), orden_items(soporte_id)')
      .in('estado', ['aprobada', 'en_oic', 'facturada', 'cobrada'])
      .not('fecha_alta_prevista', 'is', null).lte('fecha_alta_prevista', rangeEnd).gte('fecha_baja_prevista', rangeStart),
    supabase.from('reservas').select('id, soporte_id, fecha_desde, fecha_hasta, estado, clientes(nombre)')
      .in('estado', ['pendiente', 'aprobada', 'confirmada']).lte('fecha_desde', rangeEnd).gte('fecha_hasta', rangeStart),
  ])

  type Cell = { type: 'ocupado' | 'reservado' | 'libre'; cliente?: string }
  const map: Record<string, Record<string, Cell>> = {}
  soportes?.forEach((s: any) => { map[s.id] = {}; weeks.forEach(w => { map[s.id][w.start] = { type: 'libre' } }) })

  ordenes?.forEach((ord: any) => {
    const cli = Array.isArray(ord.clientes) ? ord.clientes[0] : ord.clientes
    ;(ord.orden_items ?? []).forEach((item: any) => {
      if (!item.soporte_id || !map[item.soporte_id]) return
      weeks.forEach(w => {
        if (ord.fecha_alta_prevista <= w.end && ord.fecha_baja_prevista >= w.start)
          map[item.soporte_id][w.start] = { type: 'ocupado', cliente: cli?.empresa ?? cli?.nombre ?? '' }
      })
    })
  })

  reservas?.forEach((r: any) => {
    if (!r.soporte_id || !map[r.soporte_id]) return
    const cli = Array.isArray(r.clientes) ? r.clientes[0] : r.clientes
    weeks.forEach(w => {
      if (r.fecha_desde <= w.end && r.fecha_hasta >= w.start && map[r.soporte_id][w.start]?.type !== 'ocupado')
        map[r.soporte_id][w.start] = { type: 'reservado', cliente: cli?.nombre ?? '' }
    })
  })

  const cellStyle = (t: string) => t === 'ocupado' ? { bg: 'rgba(235,105,28,0.18)', border: '#eb691c' } : t === 'reservado' ? { bg: 'rgba(245,197,24,0.22)', border: '#d97706' } : { bg: 'transparent', border: '#e5e3dc' }

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        {[['ocupado', 'Ocupado', 'rgba(235,105,28,0.18)', '#eb691c'], ['reservado', 'Reservado', 'rgba(245,197,24,0.22)', '#d97706'], ['libre', 'Libre', '#f0fdf4', '#15803d']].map(([t, l, bg, bd]) => (
          <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
            <div style={{ width: 16, height: 16, borderRadius: 3, background: bg, border: `1.5px solid ${bd}` }} />{l}
          </div>
        ))}
      </div>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
          <thead>
            <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', minWidth: 220, position: 'sticky', left: 0, background: 'var(--bg-app)' }}>Soporte</th>
              {weeks.map(w => <th key={w.start} style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)', fontSize: 11, minWidth: 52 }}>{w.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {soportes?.map((s: any) => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '8px 14px', position: 'sticky', left: 0, background: 'var(--bg-card)', borderRight: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 12 }}>{s.nombre}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{s.ubicacion}</div>
                </td>
                {weeks.map(w => {
                  const cell = map[s.id]?.[w.start] ?? { type: 'libre' }
                  const cs = cellStyle(cell.type)
                  return (
                    <td key={w.start} style={{ padding: 4, textAlign: 'center' }} title={cell.cliente || undefined}>
                      <div style={{ width: 36, height: 26, borderRadius: 4, background: cs.bg, border: `1.5px solid ${cs.border}`, margin: '0 auto' }} />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
