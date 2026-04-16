import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const fmt = (n: number) => '$' + n.toLocaleString('es-UY', { maximumFractionDigits: 0 })

const BADGE: Record<string, { bg: string; color: string; label: string }> = {
  aprobada:              { bg: 'rgba(21,128,61,0.12)',  color: '#15803d', label: 'Aprobada' },
  en_oic:                { bg: 'rgba(235,105,28,0.12)', color: '#eb691c', label: 'En OIC' },
  facturada:             { bg: 'rgba(2,132,199,0.12)',  color: '#0284c7', label: 'Facturada' },
  cobrada:               { bg: 'rgba(21,128,61,0.12)',  color: '#15803d', label: 'Cobrada' },
  pendiente_aprobacion:  { bg: 'rgba(217,119,6,0.12)',  color: '#d97706', label: 'Pend. Aprobación' },
}

export default async function FacturacionPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (session.user.rol !== 'administracion') redirect('/dashboard')
  const supabase = createServerClient()

  const [{ data: pendientes }, { data: recientes }] = await Promise.all([
    supabase.from('ordenes_venta')
      .select('id, numero, monto_total, moneda, estado, created_at, clientes(nombre, empresa), perfiles(nombre)')
      .in('estado', ['aprobada', 'en_oic'])
      .order('created_at', { ascending: false }),
    supabase.from('ordenes_venta')
      .select('id, numero, monto_total, moneda, estado, created_at, clientes(nombre, empresa), perfiles(nombre)')
      .in('estado', ['facturada', 'cobrada'])
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const totalPendiente = pendientes?.reduce((s, o) => s + Number(o.monto_total ?? 0), 0) ?? 0

  const Row = ({ o }: { o: any }) => {
    const cli = Array.isArray(o.clientes) ? o.clientes[0] : o.clientes
    const vend = Array.isArray(o.perfiles) ? o.perfiles[0] : o.perfiles
    const badge = BADGE[o.estado] ?? { bg: '#f3f4f6', color: '#6b7280', label: o.estado }
    return (
      <tr style={{ borderBottom: '1px solid var(--border)' }}>
        <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: 12 }}>{o.numero ?? '—'}</td>
        <td style={{ padding: '12px 16px' }}>
          <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>{cli?.empresa ?? cli?.nombre ?? '—'}</div>
          {cli?.empresa && cli?.nombre && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{cli.nombre}</div>}
        </td>
        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(Number(o.monto_total ?? 0))}</td>
        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
          <span style={{ background: badge.bg, color: badge.color, padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700 }}>{badge.label}</span>
        </td>
        <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>{vend?.nombre ?? '—'}</td>
        <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>{o.created_at ? new Date(o.created_at).toLocaleDateString('es-UY') : '—'}</td>
      </tr>
    )
  }

  const TableHead = () => (
    <thead>
      <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
        {['N° Orden', 'Cliente', 'Monto', 'Estado', 'Vendedor', 'Fecha'].map((h, i) => (
          <th key={h} style={{ padding: '10px 16px', textAlign: i >= 2 ? 'right' : 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', ...(i === 3 ? { textAlign: 'center' } : {}) }}>{h}</th>
        ))}
      </tr>
    </thead>
  )

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      {/* Summary bar */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 20px', marginBottom: 24, display: 'flex', gap: 32, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Pendientes de facturar</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--orange)' }}>{pendientes?.length ?? 0} órdenes</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Monto total pendiente</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{fmt(totalPendiente)}</div>
        </div>
      </div>

      {/* Pending to invoice */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          Para facturar — Aprobadas / En OIC
        </div>
        {pendientes?.length === 0 ? (
          <p style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>No hay órdenes pendientes de facturar.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <TableHead />
            <tbody>
              {pendientes?.map(o => <Row key={o.id} o={o} />)}
            </tbody>
          </table>
        )}
      </div>

      {/* Recently invoiced */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
          Facturadas recientemente
        </div>
        {recientes?.length === 0 ? (
          <p style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13 }}>Sin registros.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <TableHead />
            <tbody>
              {recientes?.map(o => <Row key={o.id} o={o} />)}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
