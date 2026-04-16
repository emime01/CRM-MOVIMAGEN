import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const LADO: Record<string, { text: string; bg: string; color: string }> = {
  ambos:     { text: 'Ambos lados', bg: '#f0fdf4', color: '#15803d' },
  izquierdo: { text: 'Solo izq.',   bg: '#fef9ec', color: '#b45309' },
  derecho:   { text: 'Solo der.',   bg: '#fef9ec', color: '#b45309' },
  ninguno:   { text: 'No disponible', bg: '#fef2f2', color: '#dc2626' },
}

export default async function BusesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  const supabase = createServerClient()

  const [{ data: buses }, { data: items }] = await Promise.all([
    supabase.from('buses').select('*').eq('activo', true).order('numero'),
    supabase.from('orden_items')
      .select('numero_bus, ordenes_venta(numero, marca, estado, fecha_baja_prevista, clientes(nombre, empresa))')
      .not('numero_bus', 'is', null),
  ])

  const campanaMap: Record<string, { empresa: string; marca: string; hasta: string | null }> = {}
  ;(items ?? []).forEach((item: any) => {
    if (!item.numero_bus) return
    const ord = Array.isArray(item.ordenes_venta) ? item.ordenes_venta[0] : item.ordenes_venta
    if (!ord || !['aprobada', 'en_oic', 'facturada'].includes(ord.estado)) return
    const cli = Array.isArray(ord.clientes) ? ord.clientes[0] : ord.clientes
    campanaMap[item.numero_bus] = { empresa: cli?.empresa ?? cli?.nombre ?? '—', marca: ord.marca ?? '—', hasta: ord.fecha_baja_prevista }
  })

  const total = buses?.length ?? 0
  const conCampana = Object.keys(campanaMap).length
  const mantenimiento = buses?.filter((b: any) => b.lado_disponible === 'ninguno').length ?? 0
  const disponibles = total - conCampana - mantenimiento

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total flota', value: total, color: 'var(--text-primary)' },
          { label: 'Disponibles', value: Math.max(disponibles, 0), color: '#15803d' },
          { label: 'Con campaña', value: conCampana, color: 'var(--orange)' },
          { label: 'Mantenimiento', value: mantenimiento, color: '#dc2626' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 16 }}>
        {buses?.map((bus: any) => {
          const lbl = LADO[bus.lado_disponible] ?? LADO.ninguno
          const campana = campanaMap[bus.numero]
          return (
            <div key={bus.id} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)' }}>#{bus.numero}</div>
                <span style={{ background: lbl.bg, color: lbl.color, padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{lbl.text}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{bus.modelo}</div>
              {campana ? (
                <div style={{ background: 'var(--orange-pale)', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--orange)', marginBottom: 3 }}>Campaña activa</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{campana.empresa}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{campana.marca}</div>
                  {campana.hasta && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Hasta {new Date(campana.hasta + 'T00:00:00').toLocaleDateString('es-UY')}</div>}
                </div>
              ) : (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin campaña activa</div>
              )}
              {bus.notas && <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>{bus.notas}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
