import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import { puede } from '@/lib/auth/roles'
import { hoyUY } from '@/lib/fechas'
import { formatMoney, sumarPorMoneda, formatTotales } from '@/lib/money'
import { aPagar, cargarCanonDelMes } from '@/lib/canon/calcular'
import { AREA_TAREA_VENTAS, TIPO_TAREA_RENOVACION } from '@/lib/ventas/renovaciones'

export const dynamic = 'force-dynamic'

/**
 * Gerencia: lo que el gerente tiene que mirar, en una pantalla. Todo de sólo
 * lectura; cada tarjeta lleva a la pantalla donde se trabaja.
 */

const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : v ?? null)

function cuatrimestreActual() {
  const m = new Date().getMonth() + 1; const y = new Date().getFullYear()
  if (m <= 4) return { start: `${y}-01-01`, end: `${y}-04-30` }
  if (m <= 8) return { start: `${y}-05-01`, end: `${y}-08-31` }
  return { start: `${y}-09-01`, end: `${y}-12-31` }
}

const ddmm = (f: string) => { const [, m, d] = f.slice(0, 10).split('-'); return `${d}/${m}` }

function Tarjeta({ titulo, href, enlace, children, resumen }: {
  titulo: string; href?: string; enlace?: string; children?: React.ReactNode; resumen: React.ReactNode
}) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{titulo}</span>
        {href && <Link href={href} style={{ fontSize: 12, fontWeight: 600, color: 'var(--orange)', textDecoration: 'none', whiteSpace: 'nowrap' }}>{enlace ?? 'Ver'} →</Link>}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{resumen}</div>
      {children && <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>{children}</div>}
    </div>
  )
}

const Fila = ({ izq, der }: { izq: React.ReactNode; der?: React.ReactNode }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{izq}</span>
    {der != null && <span style={{ fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>{der}</span>}
  </div>
)

const Vacio = ({ t }: { t: string }) => <span style={{ color: 'var(--text-muted)' }}>{t}</span>

export default async function GerenciaResumenPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!puede(session.user.rol, ['gerente_comercial', 'administracion'])) redirect('/dashboard')
  const supabase = createServerClient()
  const hoy = hoyUY()
  const mes = hoy.slice(0, 7)
  const q = cuatrimestreActual()

  const [pendRes, gestRes, cierreRes, renoRes, deudaRes, canonRes, liqRes] = await Promise.all([
    supabase.from('ordenes_venta')
      .select('id, numero, monto_total, moneda, clientes(nombre, empresa), perfiles!vendedor_id(nombre)')
      .eq('estado', 'pendiente_aprobacion').order('created_at', { ascending: true }).limit(200),
    supabase.from('leads')
      .select('id, proxima_gestion, perfiles!leads_vendedor_id_fkey(nombre)')
      .not('estado', 'in', '(ganado,perdido)').not('proxima_gestion', 'is', null).lte('proxima_gestion', hoy).limit(1000),
    supabase.from('propuestas')
      .select('estado, perfiles(nombre)').in('estado', ['enviada', 'aceptada', 'rechazada'])
      .gte('created_at', `${q.start}T00:00:00`).lte('created_at', `${q.end}T23:59:59`).limit(5000),
    supabase.from('tasks')
      .select('id, descripcion, fecha_limite, perfiles!tasks_asignado_a_fkey(nombre)')
      .eq('tipo', TIPO_TAREA_RENOVACION).eq('asignado_a_rol', AREA_TAREA_VENTAS).neq('estado', 'completada')
      .order('fecha_limite', { ascending: true, nullsFirst: false }).limit(200),
    supabase.from('facturas')
      .select('importe_total, moneda, fecha_vencimiento').eq('estado', 'emitida').lt('fecha_vencimiento', hoy).limit(2000),
    cargarCanonDelMes(supabase, mes).catch((e: any) => ({ resumen: [], error: String(e?.message ?? e) })),
    supabase.from('canon_mensual').select('shopping_id, canon_variable, canon_minimo, a_pagar, estado').eq('mes', `${mes}-01`),
  ])

  // Ventas pendientes de aprobación
  const pendientes = (pendRes.data ?? []) as any[]
  const pendTotal = sumarPorMoneda(pendientes)

  // Próximas gestiones vencidas, por vendedor
  const gestiones = (gestRes.data ?? []) as any[]
  const gestPorVend = new Map<string, number>()
  for (const g of gestiones) {
    const n = first<any>(g.perfiles)?.nombre ?? 'Sin vendedor'
    gestPorVend.set(n, (gestPorVend.get(n) ?? 0) + 1)
  }

  // Cierre de propuestas por vendedor (cuatrimestre en curso)
  const cierre = new Map<string, { enviadas: number; aceptadas: number }>()
  for (const c of (cierreRes.data ?? []) as any[]) {
    const n = first<any>(c.perfiles)?.nombre ?? 'Sin vendedor'
    const f = cierre.get(n) ?? { enviadas: 0, aceptadas: 0 }
    f.enviadas++
    if (c.estado === 'aceptada') f.aceptadas++
    cierre.set(n, f)
  }
  const cierreOrden = Array.from(cierre.entries()).sort((a, b) => b[1].enviadas - a[1].enviadas)
  const totEnv = cierreOrden.reduce((s, [, f]) => s + f.enviadas, 0)
  const totAce = cierreOrden.reduce((s, [, f]) => s + f.aceptadas, 0)

  // Renovaciones
  const renos = (renoRes.data ?? []) as any[]
  const renoVencidas = renos.filter(r => r.fecha_limite && String(r.fecha_limite).slice(0, 10) < hoy).length

  // Deudores vencidos
  const deudas = (deudaRes.data ?? []) as any[]
  const deudaTotal = sumarPorMoneda(deudas.map(d => ({ monto_total: d.importe_total, moneda: d.moneda })))

  // Canon del mes: lo cerrado o pagado queda fijo; el resto se calcula (igual que Administración).
  let canonTotal: number | null = null
  const canonError = (canonRes as any).error as string | undefined
  if (!canonError && !liqRes.error) {
    const guardadas = (liqRes.data ?? []) as any[]
    canonTotal = ((canonRes as any).resumen as any[]).reduce((s: number, r: any) => {
      const g = guardadas.find(x => x.shopping_id === r.shopping.id)
      if (g && g.estado !== 'abierto') return s + Number(g.a_pagar)
      return s + aPagar(r.variable, r.shopping.canon_minimo, 0, 0)
    }, 0)
  }
  const sinPagar = ((liqRes.data ?? []) as any[]).filter(g => g.estado !== 'pagado').length

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
      <Tarjeta titulo="Ventas por aprobar" href="/dashboard/ventas" enlace="Ir a Ventas"
        resumen={pendientes.length === 0 ? '0' : `${pendientes.length} · ${formatTotales(pendTotal)}`}>
        {pendientes.length === 0 ? <Vacio t="Nada pendiente de aprobación." /> : pendientes.slice(0, 5).map(o => (
          <Fila key={o.id}
            izq={<Link href={`/dashboard/ventas/${o.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
              #{o.numero} · {first<any>(o.clientes)?.empresa ?? first<any>(o.clientes)?.nombre ?? '—'} ({first<any>(o.perfiles)?.nombre ?? '—'})</Link>}
            der={formatMoney(Number(o.monto_total ?? 0), o.moneda ?? 'UYU')} />
        ))}
      </Tarjeta>

      <Tarjeta titulo="Próximas gestiones vencidas" href="/dashboard/leads" enlace="Ir a Leads"
        resumen={gestiones.length}>
        {gestPorVend.size === 0 ? <Vacio t="Ningún lead con la gestión vencida." /> :
          Array.from(gestPorVend.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, c]) => <Fila key={n} izq={n} der={c} />)}
      </Tarjeta>

      <Tarjeta titulo="Cierre de propuestas (cuatrimestre)" href="/dashboard/reportes" enlace="Ir a Reportes"
        resumen={totEnv > 0 ? `${Math.round((totAce / totEnv) * 100)}% · ${totAce}/${totEnv}` : '—'}>
        {cierreOrden.length === 0 ? <Vacio t="Sin propuestas enviadas en el período." /> : cierreOrden.slice(0, 6).map(([n, f]) => (
          <Fila key={n} izq={n} der={`${f.aceptadas}/${f.enviadas} · ${f.enviadas > 0 ? Math.round((f.aceptadas / f.enviadas) * 100) : 0}%`} />
        ))}
      </Tarjeta>

      <Tarjeta titulo="Renovaciones próximas" href="/dashboard/tasks" enlace="Ir a Tareas"
        resumen={renos.length === 0 ? '0' : `${renos.length}${renoVencidas ? ` · ${renoVencidas} vencidas` : ''}`}>
        {renos.length === 0 ? <Vacio t="Sin renovaciones por ofrecer." /> : renos.slice(0, 5).map(r => (
          <Fila key={r.id}
            izq={`${first<any>(r.perfiles)?.nombre ?? '—'} · ${String(r.descripcion ?? '').replace(/^Ofrecer renovación — /, '')}`}
            der={r.fecha_limite ? ddmm(r.fecha_limite) : undefined} />
        ))}
      </Tarjeta>

      <Tarjeta titulo="Deudores vencidos" href="/dashboard/admin/deudores" enlace="Ir a Deudores"
        resumen={deudas.length === 0 ? '0' : formatTotales(deudaTotal)}>
        {deudas.length === 0 ? <Vacio t="Sin facturas vencidas." /> : <Fila izq="Facturas vencidas sin cobrar" der={deudas.length} />}
      </Tarjeta>

      <Tarjeta titulo={`Canon a pagar · ${mes}`}
        resumen={canonTotal == null ? '—' : formatMoney(canonTotal, 'UYU')}>
        {canonTotal == null
          ? <Vacio t="No se pudo calcular el canon del mes." />
          : <Fila izq="Liquidaciones sin pagar" der={sinPagar} />}
        <Vacio t="Sólo lectura: lo liquida y paga Administración." />
      </Tarjeta>
    </div>
  )
}
