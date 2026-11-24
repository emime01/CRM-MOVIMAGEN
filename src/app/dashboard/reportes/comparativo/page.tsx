import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import { ESTADOS_VENTA_VIVA } from '@/lib/ventas/asignar-buses'
import { puede } from '@/lib/auth/roles'
import { netoSinIva } from '@/lib/money'
import { todos } from '@/lib/supabase-todos'
import { cuatrimestreDe, rangoCuatrimestre } from '@/lib/comisiones/bonos'
import { HISTORICO_HASTA, NOMBRE_TRIMESTRE, nombreBaseCliente, trimestreDe } from '@/lib/ventas/historicas'

export const dynamic = 'force-dynamic'

const fmt = (n: number) => '$ ' + Math.round(n).toLocaleString('es-UY')
const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : v ?? null)
const variacion = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : a > 0 ? null : 0)

/**
 * Reportes comparativos: lo vendido (sin IVA, en pesos) contra el mismo
 * período del año anterior, por vendedor, cliente y tipo de soporte, y la
 * ocupación de cada soporte en el año. El vendedor ve lo suyo; gerencia y
 * administración, todo.
 */
export default async function ComparativoPage({ searchParams }: { searchParams: { anio?: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!puede(session.user.rol, ['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion'])) redirect('/dashboard')
  const todosLosDatos = puede(session.user.rol, ['gerente_comercial', 'administracion', 'asistente_ventas'])
  const supabase = createServerClient()

  const hoy = new Date()
  const anio = Number(searchParams.anio) || hoy.getFullYear()
  const anterior = anio - 1
  const qActual = cuatrimestreDe(hoy).replace(/-\d{4}$/, '')    // Q1 / Q2 / Q3
  const hastaMMDD = anio === hoy.getFullYear() ? hoy.toISOString().slice(5, 10) : '12-31'
  // Hasta 2025 las ventas salen de la planilla histórica (por trimestre, sin
  // fecha exacta); desde 2026, de las órdenes del CRM.
  const conHistorico = anterior <= HISTORICO_HASTA
  const tActual = trimestreDe(`${anio}-${hastaMMDD}`)

  const [{ data: ventas }, { data: historicas }] = await Promise.all([
    todos((d, h) => {
      let q = supabase.from('ordenes_venta')
        .select('id, vendedor_id, monto_neto, monto_total, moneda, created_at, clientes(nombre, empresa), perfiles!vendedor_id(nombre), orden_items(soporte_id, cantidad, semanas, precio_unitario, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real, soportes(nombre, ubicacion, categoria, cap, tipo_cotizador))')
        .in('estado', ESTADOS_VENTA_VIVA as unknown as string[])
        .gte('created_at', `${Math.max(anterior, HISTORICO_HASTA + 1)}-01-01`).lte('created_at', `${anio}-12-31T23:59:59`)
        .order('created_at')
      if (!todosLosDatos) q = q.eq('vendedor_id', session.user.id)
      return q.range(d, h)
    }),
    conHistorico
      ? todos((d, h) => {
          let q = supabase.from('ventas_historicas')
            .select('id, anio, trimestre, vendedor_nombre, cliente_texto, monto, moneda, perfiles!ventas_historicas_vendedor_id_fkey(nombre), clientes(nombre, empresa)')
            .gte('anio', anterior).lte('anio', Math.min(anio, HISTORICO_HASTA)).order('id')
          if (!todosLosDatos) q = q.eq('vendedor_id', session.user.id)
          return q.range(d, h)
        })
      : Promise.resolve({ data: [] as any[], error: null }),
  ])

  // Un registro por venta, venga del CRM o de la planilla.
  type Reg = { anio: number; fecha: string | null; trimestre: number; monto: number; vendedor: string; cliente: string; venta: any | null }
  const regs: Reg[] = [
    ...(ventas as any[]).filter(v => (v.moneda ?? 'UYU') === 'UYU').map(v => {
      const f = String(v.created_at).slice(0, 10); const c = first<any>(v.clientes)
      return { anio: Number(f.slice(0, 4)), fecha: f, trimestre: trimestreDe(f), monto: netoSinIva(v),
               vendedor: first<any>(v.perfiles)?.nombre ?? '—', cliente: c?.empresa ?? c?.nombre ?? '—', venta: v }
    }),
    ...(historicas as any[]).filter(h => (h.moneda ?? 'UYU') === 'UYU').map(h => {
      const c = first<any>(h.clientes)
      return { anio: Number(h.anio), fecha: null, trimestre: Number(h.trimestre), monto: Number(h.monto) || 0,
               vendedor: first<any>(h.perfiles)?.nombre ?? h.vendedor_nombre ?? '—',
               cliente: c?.empresa ?? c?.nombre ?? nombreBaseCliente(String(h.cliente_texto ?? '—')), venta: null }
    }),
  ]

  // Cuánto de cada venta entra "hasta la fecha". Las del CRM, entera o nada
  // según su fecha. Las de la planilla no tienen fecha: los trimestres ya
  // cerrados entran enteros y el trimestre en curso, en proporción a los días
  // transcurridos (estimado).
  const peso = (r: Reg, mmdd: string) => {
    if (mmdd >= '12-31') return 1
    if (r.fecha) return r.fecha.slice(5) <= mmdd ? 1 : 0
    const t = trimestreDe(`${r.anio}-${mmdd}`)
    if (r.trimestre !== t) return r.trimestre < t ? 1 : 0
    const ini = Date.UTC(r.anio, (t - 1) * 3, 1), fin = Date.UTC(r.anio, t * 3, 1)
    const corte = Date.UTC(r.anio, Number(mmdd.slice(0, 2)) - 1, Number(mmdd.slice(3, 5))) + 86400000
    return Math.min(1, Math.max(0, (corte - ini) / (fin - ini)))
  }
  const estimado = conHistorico && hastaMMDD < '12-31'
  const delAnio = (a: number, hastaFecha = true) => regs.filter(r => r.anio === a)
    .map(r => ({ r, p: hastaFecha ? peso(r, hastaMMDD) : 1 })).filter(x => x.p > 0)
  const sum = (xs: { r: Reg; p: number }[]) => xs.reduce((s, x) => s + x.r.monto * x.p, 0)

  // Año a la fecha y período en curso contra el mismo tramo del año anterior.
  // Contra la planilla el período es el trimestre (así se medía); si no, el cuatrimestre.
  const ytd = sum(delAnio(anio)), ytdAnt = sum(delAnio(anterior))
  let q: number, qAnt: number, qLabel: string
  if (conHistorico) {
    q = sum(delAnio(anio).filter(x => x.r.trimestre === tActual)); qAnt = sum(delAnio(anterior).filter(x => x.r.trimestre === tActual))
    qLabel = `Trimestre ${NOMBRE_TRIMESTRE[tActual]}`
  } else {
    const rq = rangoCuatrimestre(`${qActual}-${anio}`)!, rqAnt = rangoCuatrimestre(`${qActual}-${anterior}`)!
    const enRango = (a: number, r: { start: string; end: string }) => delAnio(a).filter(x => x.r.fecha! >= r.start && x.r.fecha! <= r.end)
    q = sum(enRango(anio, rq)); qAnt = sum(enRango(anterior, rqAnt)); qLabel = qActual
  }

  const agrupar = (clave: (r: Reg) => string) => {
    const m = new Map<string, { actual: number; anterior: number }>()
    for (const { r, p } of delAnio(anio)) { const k = clave(r); const e = m.get(k) ?? { actual: 0, anterior: 0 }; e.actual += r.monto * p; m.set(k, e) }
    for (const { r, p } of delAnio(anterior)) { const k = clave(r); const e = m.get(k) ?? { actual: 0, anterior: 0 }; e.anterior += r.monto * p; m.set(k, e) }
    return Array.from(m.entries()).map(([k, e]) => ({ k, ...e })).sort((a, b) => b.actual - a.actual || b.anterior - a.anterior)
  }
  const porVendedor = agrupar(r => r.vendedor)
  const porCliente = agrupar(r => r.cliente).slice(0, 20)
  // Trimestres completos de los dos años (el en curso, hasta hoy).
  const porTrimestre = [1, 2, 3, 4].map(t => ({
    k: `Q${t} · ${NOMBRE_TRIMESTRE[t]}${anio === hoy.getFullYear() && t === tActual ? ' (en curso)' : ''}`,
    actual: sum(delAnio(anio, false).filter(x => x.r.trimestre === t)),
    anterior: sum(delAnio(anterior, false).filter(x => x.r.trimestre === t)),
  }))

  // Por tipo de soporte: el neto de cada venta se reparte entre sus líneas
  // según lo que vale cada una (precio × cantidad × semanas). Si una venta no
  // tiene precios por línea, se reparte por cantidad × semanas. Las de la
  // planilla no tienen soportes: van en su propia fila.
  const porTipo = (() => {
    const m = new Map<string, { actual: number; anterior: number }>()
    const unidades = (i: any) => (Number(i.cantidad) || 1) * (Number(i.semanas) || 1)
    for (const [a, campo] of [[anio, 'actual'], [anterior, 'anterior']] as const) {
      for (const { r, p } of delAnio(a)) {
        if (!r.venta) {
          const k = 'Sin detalle (planilla histórica)'
          const e = m.get(k) ?? { actual: 0, anterior: 0 }; e[campo] += r.monto * p; m.set(k, e)
          continue
        }
        const its = (r.venta.orden_items ?? []) as any[]
        const conPrecio = its.some(i => Number(i.precio_unitario) > 0)
        const pesoLinea = (i: any) => conPrecio ? unidades(i) * (Number(i.precio_unitario) || 0) : unidades(i)
        const pesoTot = its.reduce((s, i) => s + pesoLinea(i), 0) || 1
        for (const i of its) {
          const cat = first<any>(i.soportes)?.categoria ?? 'Otro'
          const e = m.get(cat) ?? { actual: 0, anterior: 0 }
          e[campo] += r.monto * p * pesoLinea(i) / pesoTot
          m.set(cat, e)
        }
      }
    }
    return Array.from(m.entries()).map(([k, e]) => ({ k, ...e })).sort((a, b) => b.actual - a.actual)
  })()

  // Ocupación en el año: semanas vendidas × unidades, sobre 52 semanas × capacidad.
  const ocupacion = (() => {
    const m = new Map<string, { nombre: string; ubicacion: string; semanas: number; cap: number }>()
    const inicioAnio = `${anio}-01-01`, finAnio = `${anio}-12-31`
    for (const v of (ventas as any[]).filter(v => String(v.created_at).startsWith(String(anio)))) {
      for (const i of v.orden_items ?? []) {
        const s = first<any>(i.soportes); if (!s || !i.soporte_id) continue
        const desde = (i.fecha_alta_real ?? i.fecha_alta_prevista)?.slice(0, 10), hasta = (i.fecha_baja_real ?? i.fecha_baja_prevista)?.slice(0, 10)
        let sem = 0
        if (desde && hasta) {
          const a = desde < inicioAnio ? inicioAnio : desde, b = hasta > finAnio ? finAnio : hasta
          if (a <= b) sem = (Date.parse(b) - Date.parse(a)) / (7 * 86400000) + 1 / 7
        }
        if (sem <= 0) continue
        const e = m.get(i.soporte_id) ?? { nombre: s.nombre, ubicacion: s.ubicacion ?? '', semanas: 0, cap: Number(s.cap) || 1 }
        e.semanas += sem * (Number(i.cantidad) || 1)
        m.set(i.soporte_id, e)
      }
    }
    return Array.from(m.values()).map(e => ({ ...e, pct: Math.min(100, Math.round((e.semanas / (52 * e.cap)) * 100)) }))
      .sort((a, b) => b.pct - a.pct).slice(0, 40)
  })()

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20 }
  const th: React.CSSProperties = { padding: '8px 10px', fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted)', textAlign: 'right', fontWeight: 700 }
  const td: React.CSSProperties = { padding: '8px 10px', fontSize: 13, textAlign: 'right', borderTop: '1px solid var(--border)' }
  const Var = ({ a, b }: { a: number; b: number }) => {
    const v = variacion(a, b)
    if (v === null) return <span style={{ color: '#15803d', fontWeight: 700 }}>nuevo</span>
    return <span style={{ color: v > 0 ? '#15803d' : v < 0 ? '#b91c1c' : 'var(--text-muted)', fontWeight: 700 }}>{v > 0 ? '+' : ''}{v}%</span>
  }
  const Tabla = ({ titulo, filas }: { titulo: string; filas: { k: string; actual: number; anterior: number }[] }) => (
    <div style={card}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{titulo}</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr><th style={{ ...th, textAlign: 'left' }}></th><th style={th}>{anio}</th><th style={th}>{anterior}</th><th style={th}>Var.</th></tr></thead>
          <tbody>
            {filas.length === 0 ? <tr><td colSpan={4} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)' }}>Sin ventas</td></tr> : filas.map(f => (
              <tr key={f.k}>
                <td style={{ ...td, textAlign: 'left', fontWeight: 600 }}>{f.k}</td>
                <td style={td}>{fmt(f.actual)}</td>
                <td style={{ ...td, color: 'var(--text-muted)' }}>{fmt(f.anterior)}</td>
                <td style={td}><Var a={f.actual} b={f.anterior} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 18 }}>
        <Link href="/dashboard/reportes" style={{ color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none' }}>← Reportes</Link>
        <div style={{ display: 'flex', gap: 6 }}>
          {[hoy.getFullYear(), hoy.getFullYear() - 1].map(a => (
            <Link key={a} href={`/dashboard/reportes/comparativo?anio=${a}`} style={{ padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none', background: a === anio ? 'var(--orange)' : 'var(--bg-card)', color: a === anio ? '#fff' : 'var(--text-secondary)', border: '1px solid var(--border)' }}>{a} vs {a - 1}</Link>
          ))}
        </div>
      </div>
      <div className="grid-kpi" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 20 }}>
        {[
          { label: `Vendido ${anio} a la fecha`, valor: fmt(ytd), a: ytd, b: ytdAnt },
          { label: `Mismo tramo de ${anterior}${estimado ? ' (estimado)' : ''}`, valor: fmt(ytdAnt), a: null, b: null },
          { label: `${qLabel} ${anio}${hastaMMDD < '12-31' ? ' a la fecha' : ''}`, valor: fmt(q), a: q, b: qAnt },
          { label: `${qLabel} ${anterior}${hastaMMDD < '12-31' ? `, mismo tramo${estimado ? ' (estimado)' : ''}` : ''}`, valor: fmt(qAnt), a: null, b: null },
        ].map(k => (
          <div key={k.label} style={card}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{k.valor}</div>
            {k.a != null && <div style={{ fontSize: 12, marginTop: 4 }}><Var a={k.a} b={k.b!} /> contra {anterior}</div>}
          </div>
        ))}
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '-8px 0 16px' }}>
        Montos sin IVA, en pesos, de las ventas aprobadas, por fecha de la venta y hasta el mismo día del año.
        {conHistorico && <> Hasta {HISTORICO_HASTA} las ventas salen de la planilla histórica, que las tiene por trimestre y sin fecha exacta{estimado ? ': del trimestre en curso se toma la parte proporcional a los días transcurridos, por eso el tramo del año anterior es estimado' : ''}.</>}
      </p>
      {conHistorico && <div style={{ marginBottom: 20 }}><Tabla titulo="Por trimestre (completo)" filas={porTrimestre} /></div>}
      <div className="grid-resp" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {todosLosDatos && <Tabla titulo="Por vendedor" filas={porVendedor} />}
        <Tabla titulo="Por tipo de soporte" filas={porTipo} />
      </div>
      <div className="grid-resp" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Tabla titulo="Por cliente (top 20)" filas={porCliente} />
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Ocupación de soportes en {anio}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10 }}>Semanas vendidas × unidades, sobre 52 semanas × capacidad.</div>
          {ocupacion.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Sin ventas en el año.</div> : ocupacion.map(o => (
            <div key={o.nombre + o.ubicacion} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ fontWeight: 600 }}>{o.nombre} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{o.ubicacion}</span></span>
                <span style={{ fontWeight: 700 }}>{o.pct}%</span>
              </div>
              <div style={{ height: 6, background: 'var(--bg-app)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${o.pct}%`, background: 'var(--orange)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
