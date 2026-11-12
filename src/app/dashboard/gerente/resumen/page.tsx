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
import { ESTADOS_BLOQUEO_VIVO, ESTADOS_VENTA_VIVA } from '@/lib/ventas/asignar-buses'
import { intervalosBloqueos, intervalosVentas, ocupacionPorSoporte, sumarDias } from '@/lib/disponibilidad/ocupacion'
import { ocupacionPorFormato, soportesConLugar } from '@/lib/gerencia/ocupacion'
import { cuatrimestreDe, sumarMeses, ultimoDiaDelMes } from '@/lib/gerencia/periodo'
import { construirEmbudo } from '@/lib/gerencia/embudo'
import { facturadoVsCobrado } from '@/lib/gerencia/facturado-cobrado'
import { descuentoPorFormato } from '@/lib/gerencia/descuento'

export const dynamic = 'force-dynamic'

/**
 * Gerencia: lo que el gerente tiene que mirar, en una pantalla. Todo de sólo
 * lectura; cada tarjeta lleva a la pantalla donde se trabaja.
 */

const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : v ?? null)

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

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const nombreMes = (m: string) => { const n = MESES[Number(m.slice(5, 7)) - 1] ?? m; return n.charAt(0).toUpperCase() + n.slice(1) }

/** Sección ancha (ocupa todo el ancho de la grilla). */
function Seccion({ titulo, href, enlace, children }: { titulo: string; href?: string; enlace?: string; children: React.ReactNode }) {
  return (
    <div style={{ gridColumn: '1 / -1', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{titulo}</span>
        {href && <Link href={href} style={{ fontSize: 12, fontWeight: 600, color: 'var(--orange)', textDecoration: 'none', whiteSpace: 'nowrap' }}>{enlace ?? 'Ver'} →</Link>}
      </div>
      {children}
    </div>
  )
}

/** Barra de ocupación: vendido (naranja) y, a continuación, reservado (ámbar). */
function BarraOcupacion({ vendido, reservado }: { vendido: number; reservado: number }) {
  const v = Math.min(100, vendido)
  const r = Math.min(100 - v, reservado)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <div style={{ display: 'flex', height: 8, borderRadius: 4, background: 'var(--gray-100)', overflow: 'hidden' }}>
        <div style={{ width: `${v}%`, background: 'var(--orange)' }} />
        <div style={{ width: `${r}%`, background: 'var(--amber)' }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
        <b style={{ color: 'var(--text-primary)' }}>{vendido}%</b> vendido{reservado > 0 ? ` · ${reservado}% reservado` : ''}
      </span>
    </div>
  )
}

const th: React.CSSProperties = { padding: '6px 10px', textAlign: 'right', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '8px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
const pctTxt = (n: number | null) => (n == null ? '—' : `${n}%`)

const Vacio = ({ t }: { t: string }) => <span style={{ color: 'var(--text-muted)' }}>{t}</span>

export default async function GerenciaResumenPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!puede(session.user.rol, ['gerente_comercial', 'administracion'])) redirect('/dashboard')
  const supabase = createServerClient()
  const hoy = hoyUY()
  const mes = hoy.slice(0, 7)
  const q = cuatrimestreDe(hoy)

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

  // ── Secciones de gestión: ocupación, embudo, facturado/cobrado, descuentos ──
  const meses = [mes, sumarMeses(mes, 1), sumarMeses(mes, 2)]
  const [soportesRes, ventasVivasRes, bloqueosRes, perfilesRes, leadsQRes, propQRes, ventasQRes, factMesRes, pagosMesRes] = await Promise.all([
    supabase.from('soportes').select('id, categoria, cap, tipo_cotizador, precio_semanal').eq('activo', true).limit(5000),
    supabase.from('ordenes_venta')
      .select('fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real, orden_items(soporte_id, cantidad, salidas, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real)')
      .in('estado', ESTADOS_VENTA_VIVA as unknown as string[]).limit(5000),
    supabase.from('reservas')
      .select('fecha_desde, fecha_hasta, reserva_items(soporte_id, cantidad, fecha_alta_real, fecha_baja_real)')
      .in('estado', ESTADOS_BLOQUEO_VIVO as unknown as string[]).is('orden_id', null).limit(5000),
    supabase.from('perfiles').select('id, nombre, rol').in('rol', ['vendedor', 'asistente_ventas', 'gerente_comercial']).eq('activo', true),
    supabase.from('leads').select('vendedor_id')
      .gte('created_at', `${q.start}T00:00:00`).lte('created_at', `${q.end}T23:59:59`).limit(10000),
    supabase.from('propuestas').select('vendedor_id')
      .in('estado', ['enviada', 'aceptada', 'rechazada'])
      .gte('created_at', `${q.start}T00:00:00`).lte('created_at', `${q.end}T23:59:59`).limit(10000),
    supabase.from('ordenes_venta')
      .select('vendedor_id, monto_neto, monto_total, moneda, orden_items(soporte_id, cantidad, semanas, precio_unitario, descuento_pct)')
      .in('estado', ESTADOS_VENTA_VIVA as unknown as string[])
      .gte('created_at', `${q.start}T00:00:00`).lte('created_at', `${q.end}T23:59:59`).limit(10000),
    supabase.from('facturas')
      .select('tipo, estado, fecha_emision, importe_total, moneda, cotizacion')
      .in('estado', ['emitida', 'cobrada']).gte('fecha_emision', `${mes}-01`).lte('fecha_emision', ultimoDiaDelMes(mes)).limit(10000),
    supabase.from('pagos')
      .select('monto, fecha_pago, ordenes_venta(moneda)')
      .gte('fecha_pago', `${mes}-01`).lte('fecha_pago', ultimoDiaDelMes(mes)).limit(10000),
  ])

  // Ocupación por formato (la misma regla que la página de disponibilidad)
  const errOcup = soportesRes.error ?? ventasVivasRes.error ?? bloqueosRes.error
  const soportes = (soportesRes.data ?? []) as any[]
  const ocupMeses: { mes: string; formatos: ReturnType<typeof ocupacionPorFormato> }[] = []
  let libres30 = 0
  if (!errOcup) {
    const caps = new Map<string, number>(soportes.map(x => [x.id, x.cap ?? 1]))
    const tipoDe = new Map<string, string | null>(soportes.map(x => [x.id, x.tipo_cotizador ?? null]))
    const ventasIv = intervalosVentas(ventasVivasRes.data as any[], tipoDe)
    const bloqueosIv = intervalosBloqueos(bloqueosRes.data as any[], tipoDe)
    for (const m of meses) {
      ocupMeses.push({ mes: m, formatos: ocupacionPorFormato(soportes, ocupacionPorSoporte(caps, ventasIv, bloqueosIv, `${m}-01`, ultimoDiaDelMes(m))) })
    }
    libres30 = soportesConLugar(ocupacionPorSoporte(caps, ventasIv, bloqueosIv, hoy, sumarDias(hoy, 29)))
  }
  const formatosOcup = Array.from(new Set(ocupMeses.flatMap(m => m.formatos.map(f => f.formato))))

  // Embudo del cuatrimestre
  const embudo = construirEmbudo({
    perfiles: (perfilesRes.data ?? []) as any[],
    leads: (leadsQRes.data ?? []) as any[],
    propuestas: (propQRes.data ?? []) as any[],
    ventas: (ventasQRes.data ?? []) as any[],
  })
  const errEmbudo = perfilesRes.error ?? leadsQRes.error ?? propQRes.error ?? ventasQRes.error

  // Facturado vs cobrado del mes
  const factCob = facturadoVsCobrado(
    (factMesRes.data ?? []) as any[],
    ((pagosMesRes.data ?? []) as any[]).map(p => ({ monto: p.monto, fecha_pago: p.fecha_pago, moneda: first<any>(p.ordenes_venta)?.moneda })),
    mes,
  )
  const errFactCob = factMesRes.error ?? pagosMesRes.error

  // Precio real vs lista del cuatrimestre
  const itemsVendidos = ((ventasQRes.data ?? []) as any[]).flatMap(o => o.orden_items ?? [])
  const descuentos = descuentoPorFormato(itemsVendidos, soportes)

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

      <Seccion titulo="Ocupación por formato" href="/dashboard/disponibilidad" enlace="Ir a Disponibilidad">
        {errOcup ? <Vacio t="No se pudo calcular la ocupación." /> : (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{libres30}</span>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                de {soportes.length} soportes con espacio libre para vender en los próximos 30 días ·{' '}
                <Link href="/dashboard/disponibilidad" style={{ color: 'var(--orange)', fontWeight: 600, textDecoration: 'none' }}>Libre para vender</Link>
              </span>
            </div>
            {formatosOcup.length === 0 ? <Vacio t="No hay soportes activos cargados." /> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px 16px', alignItems: 'end' }}>
                <span />
                {ocupMeses.map(m => <span key={m.mes} style={{ ...th, textAlign: 'left' }}>{nombreMes(m.mes)}</span>)}
                {formatosOcup.map(fmt => (
                  <div key={fmt} style={{ display: 'contents' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {fmt}
                      <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: 11 }}> · {ocupMeses[0].formatos.find(f => f.formato === fmt)?.soportes ?? 0} sop.</span>
                    </span>
                    {ocupMeses.map(m => {
                      const f = m.formatos.find(x => x.formato === fmt)
                      return f ? <BarraOcupacion key={m.mes} vendido={f.pctVendido} reservado={f.pctReservado} /> : <Vacio key={m.mes} t="—" />
                    })}
                  </div>
                ))}
              </div>
            )}
            <Vacio t="Espacios-día vendidos (ventas vivas) y reservados (bloqueos vivos) sobre la capacidad del mes; misma regla que Disponibilidad." />
          </>
        )}
      </Seccion>

      <Seccion titulo={`Embudo comercial · ${q.label}`} href="/dashboard/reportes" enlace="Ir a Reportes">
        {errEmbudo ? <Vacio t="No se pudo calcular el embudo." /> : embudo.filas.length === 0 ? <Vacio t="Sin vendedores con actividad en el período." /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ ...th, textAlign: 'left' }}>Vendedor</th>
                  <th style={th}>Leads</th><th style={th}>Propuestas</th><th style={th}>% L→P</th>
                  <th style={th}>Ventas</th><th style={th}>% P→V</th><th style={th}>% Total</th>
                  <th style={th}>Vendido s/IVA</th>
                </tr>
              </thead>
              <tbody>
                {[...embudo.filas, embudo.total].map((f, i, arr) => {
                  const esTotal = i === arr.length - 1
                  return (
                    <tr key={f.id} style={{ borderBottom: '1px solid var(--border)', fontWeight: esTotal ? 700 : 400, color: 'var(--text-primary)' }}>
                      <td style={{ ...td, textAlign: 'left' }}>{f.nombre}</td>
                      <td style={td}>{f.leads}</td><td style={td}>{f.propuestas}</td><td style={td}>{pctTxt(f.convLeadPropuesta)}</td>
                      <td style={td}>{f.ventas}</td><td style={td}>{pctTxt(f.convPropuestaVenta)}</td><td style={td}>{pctTxt(f.convTotal)}</td>
                      <td style={td}>{f.ventas === 0 ? '—' : formatTotales(f.monto)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <Vacio t="Leads creados, propuestas enviadas/aceptadas/rechazadas y ventas vivas del cuatrimestre, por vendedor." />
      </Seccion>

      <Seccion titulo={`Facturado vs cobrado · ${nombreMes(mes)}`} href="/dashboard/admin/facturacion" enlace="Ir a Facturación">
        {errFactCob ? <Vacio t="No se pudo calcular lo facturado y cobrado." /> : factCob.length === 0 ? <Vacio t="Sin facturas ni cobros en el mes." /> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ ...th, textAlign: 'left' }}>Moneda</th><th style={th}>Facturado</th><th style={th}>Cobrado</th>
                  <th style={th}>Diferencia</th><th style={th}>% cobrado</th>
                </tr>
              </thead>
              <tbody>
                {factCob.map(f => (
                  <tr key={f.moneda} style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                    <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>
                      {f.moneda}
                      {f.moneda === 'USD' && (f.facturadoEnPesos ?? 0) !== 0 && (
                        <span style={{ fontWeight: 500, color: 'var(--text-muted)', fontSize: 11 }}>
                          {' '}· facturado ≈ {formatMoney(f.facturadoEnPesos!, 'UYU')} a la cotización de cada factura{f.sinCotizacion ? ` (${f.sinCotizacion} sin cotización)` : ''}
                        </span>
                      )}
                    </td>
                    <td style={td}>{formatMoney(f.facturado, f.moneda)}</td>
                    <td style={td}>{formatMoney(f.cobrado, f.moneda)}</td>
                    <td style={{ ...td, fontWeight: 700 }}>{formatMoney(f.diferencia, f.moneda)}</td>
                    <td style={td}>{pctTxt(f.pctCobrado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Vacio t="Facturado: facturas emitidas en el mes menos notas de crédito, con IVA. Cobrado: pagos con fecha del mes (lo que entró de verdad; el descuento de agencia ya está restado). Pueden ser cobros de facturas de otros meses." />
      </Seccion>

      <Seccion titulo={`Precio real vs lista · ${q.label}`}>
        {descuentos.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>—</span>
            <Vacio t="Sin ventas con precio y lista para comparar en el período." />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
            {descuentos.map(d => (
              <div key={d.formato} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{d.formato}</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
                  {d.descuentoPct == null ? '—' : `${d.descuentoPct.toLocaleString('es-UY')}%`}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Descuento promedio · {d.items} {d.items === 1 ? 'línea' : 'líneas'}</span>
              </div>
            ))}
          </div>
        )}
        <Vacio t="Precio de venta con su descuento contra el precio semanal de lista del soporte, ponderado por importe. Negativo: se vendió sobre lista." />
      </Seccion>
    </div>
  )
}
