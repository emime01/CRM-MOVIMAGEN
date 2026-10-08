import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerClient } from '@/lib/supabase-server'
import { ESTADOS_VENTA_VIVA } from '@/lib/ventas/asignar-buses'
import { es } from '@/lib/auth/roles'
import { formatMoney, formatTotales, type TotalPorMoneda } from '@/lib/money'
import { mesUY } from '@/lib/fechas'

export const dynamic = 'force-dynamic'

const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : v ?? null)
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const fmtMes = (d: string) => `${MESES[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`
const fmtFecha = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—')

type Fila = {
  id: string; orden_id: string; cuota: number; cuotas_total: number; mes_pauta: string
  numero: string | null; fecha_emision: string | null; importe_total: number; moneda: string
  orden_numero: number | null; cliente: string; agencia: string | null; vendedor: string
}

/**
 * Facturación: las cuotas que hay que facturar.
 *
 * Antes era una lista de ventas "sin fecha de factura": con cuotas, una venta
 * en doce salía de la lista al emitir la primera y las otras once no
 * aparecían en ningún lado. Ahora cada fila es una cuota prevista de una
 * venta aprobada, con su mes; las de este mes o anteriores van primero.
 */
export default async function FacturacionPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!es(session.user.rol, 'administracion')) redirect('/dashboard')
  const supabase = createServerClient()

  const CAMPOS = `id, orden_id, cuota, cuotas_total, mes_pauta, numero, fecha_emision, importe_total, moneda,
    ordenes_venta!inner(numero, estado, clientes(nombre, empresa), agencias(nombre), perfiles!vendedor_id(nombre))`
  const [{ data: previstas, error: pErr }, { data: recientes }] = await Promise.all([
    supabase.from('facturas')
      .select(CAMPOS)
      .eq('tipo', 'factura')
      .eq('estado', 'prevista')
      .in('ordenes_venta.estado', ESTADOS_VENTA_VIVA as unknown as string[])
      .order('mes_pauta', { ascending: true })
      .limit(500),
    supabase.from('facturas')
      .select(CAMPOS)
      .eq('tipo', 'factura')
      .in('estado', ['emitida', 'cobrada'])
      .order('fecha_emision', { ascending: false })
      .limit(15),
  ])
  if (pErr) console.error('Facturación: no se pudieron leer las cuotas:', pErr.message)

  const aFila = (f: any): Fila => {
    const o = first<any>(f.ordenes_venta)
    const cli = first<any>(o?.clientes)
    return {
      id: f.id, orden_id: f.orden_id, cuota: f.cuota, cuotas_total: f.cuotas_total, mes_pauta: f.mes_pauta,
      numero: f.numero, fecha_emision: f.fecha_emision, importe_total: Number(f.importe_total ?? 0), moneda: f.moneda ?? 'UYU',
      orden_numero: o?.numero ?? null, cliente: cli?.empresa ?? cli?.nombre ?? '—',
      agencia: first<any>(o?.agencias)?.nombre ?? null, vendedor: first<any>(o?.perfiles)?.nombre ?? '—',
    }
  }
  const pendientes = (previstas ?? []).map(aFila)
  const mesActual = `${mesUY()}-01`
  const deEsteMes = pendientes.filter(f => f.mes_pauta <= mesActual)
  const proximas = pendientes.filter(f => f.mes_pauta > mesActual)

  const total = (fs: Fila[]): TotalPorMoneda => {
    const t: TotalPorMoneda = {}
    for (const f of fs) { const m = f.moneda === 'USD' ? 'USD' : 'UYU'; t[m] = (t[m] ?? 0) + f.importe_total }
    return t
  }

  const Tabla = ({ filas, emitidas = false }: { filas: Fila[]; emitidas?: boolean }) => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
        <thead>
          <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
            {['Venta', 'Cliente', 'Cuota', 'Mes', emitidas ? 'Factura' : 'Vendedor', 'Importe'].map((h, i) => (
              <th key={h} style={{ padding: '10px 16px', textAlign: i === 5 ? 'right' : 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map(f => {
            const atrasada = !emitidas && f.mes_pauta < mesActual
            return (
              <tr key={f.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '11px 16px', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>
                  <Link href={`/dashboard/ventas/${f.orden_id}`} style={{ color: 'var(--orange)', textDecoration: 'none' }}>OIC #{f.orden_numero ?? '—'}</Link>
                </td>
                <td style={{ padding: '11px 16px' }}>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{f.cliente}</div>
                  {f.agencia && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{f.agencia}</div>}
                </td>
                <td style={{ padding: '11px 16px', color: 'var(--text-secondary)' }}>{f.cuotas_total > 1 ? `${f.cuota} de ${f.cuotas_total}` : 'Única'}</td>
                <td style={{ padding: '11px 16px', color: atrasada ? '#c62828' : 'var(--text-secondary)', fontWeight: atrasada ? 700 : 500 }}>
                  {fmtMes(f.mes_pauta)}{atrasada ? ' · atrasada' : ''}
                </td>
                <td style={{ padding: '11px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
                  {emitidas ? <><span style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{f.numero ?? '—'}</span> · {fmtFecha(f.fecha_emision)}</> : f.vendedor}
                </td>
                <td style={{ padding: '11px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{formatMoney(f.importe_total, f.moneda)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  const Caja = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{titulo}</div>
      {children}
    </div>
  )

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 20px', marginBottom: 24, display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Para facturar este mes</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--orange)' }}>{deEsteMes.length} cuota{deEsteMes.length === 1 ? '' : 's'}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Importe</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{formatTotales(total(deEsteMes))}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 2 }}>Próximos meses</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>{formatTotales(total(proximas))}</div>
        </div>
      </div>

      <Caja titulo={`Para facturar — cuotas de ${fmtMes(mesActual)} o anteriores`}>
        {deEsteMes.length === 0
          ? <p style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>No hay cuotas pendientes de facturar.</p>
          : <Tabla filas={deEsteMes} />}
      </Caja>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '-14px 0 24px' }}>Cada cuota se factura desde la venta, en la sección Facturación.</p>

      {proximas.length > 0 && (
        <Caja titulo="Próximos meses">
          <Tabla filas={proximas} />
        </Caja>
      )}

      <Caja titulo="Facturadas recientemente">
        {(recientes?.length ?? 0) === 0
          ? <p style={{ padding: 20, color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Sin registros.</p>
          : <Tabla filas={(recientes ?? []).map(aFila)} emitidas />}
      </Caja>
    </div>
  )
}
