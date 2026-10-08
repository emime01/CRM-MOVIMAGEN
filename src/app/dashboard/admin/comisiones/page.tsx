import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import { es, puede } from '@/lib/auth/roles'
import { cuatrimestreDe, cuatrimestresCercanos, rangoCuatrimestre, vendidoEnCuatrimestre } from '@/lib/comisiones/bonos'
import ComisionesClient, { type ComisionRow, type AgenciaRow, type BonoRow } from './ComisionesClient'
import { mesUY } from '@/lib/fechas'

export const dynamic = 'force-dynamic'

const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : v ?? null)


function finDeMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${mes}-${String(ultimo).padStart(2, '0')}`
}

/**
 * Comisiones: la planilla "COMISIONES vtas" del mes.
 *
 * La comisión se genera al cobrar cada factura y cae en el mes del cobro:
 * 6,75% del arrendamiento sin IVA, mitad y mitad si la venta es compartida.
 * Acá se ve el mes, se liquida y se marca pagada; se ve cuánto le corresponde
 * a cada agencia; y se manejan los bonos por objetivo.
 */
export default async function ComisionesPage({ searchParams }: { searchParams: { mes?: string; q?: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!puede(session.user.rol, ['administracion', 'gerente_comercial'])) redirect('/dashboard')
  const supabase = createServerClient()

  const mes = searchParams.mes && /^\d{4}-\d{2}$/.test(searchParams.mes) ? searchParams.mes : mesUY()
  const cuatri = searchParams.q && rangoCuatrimestre(searchParams.q) ? searchParams.q : cuatrimestreDe()

  const [comRes, cobradasRes, perfilesRes, objetivosRes, bonosRes, bonosLiqRes, vendido] = await Promise.all([
    supabase
      .from('comisiones')
      .select(`
        id, tipo, vendedor_id, compartida_con, orden_id, factura_id, cuatrimestre,
        monto_base, porcentaje, monto_comision, moneda, estado,
        facturas(numero, cuota, cuotas_total, mes_pauta, fecha_cobro, importe_total, importe_arrendamiento, importe_produccion),
        ordenes_venta(numero, marca, clientes(nombre, empresa), agencias(nombre))
      `)
      .eq('mes_liquidacion', `${mes}-01`)
      .order('created_at', { ascending: true }),
    // Lo de las agencias sale de las facturas cobradas en el mes.
    supabase
      .from('facturas')
      .select(`
        id, numero, importe_arrendamiento, importe_produccion, moneda, fecha_cobro,
        ordenes_venta(numero, comision_agencia_pct, comision_agencia_prod_pct, clientes(nombre, empresa), agencias(id, nombre))
      `)
      .eq('tipo', 'factura')
      .eq('estado', 'cobrada')
      .gte('fecha_cobro', `${mes}-01`)
      .lte('fecha_cobro', finDeMes(mes)),
    supabase.from('perfiles').select('id, nombre, rol, activo'),
    supabase.from('objetivos').select('vendedor_id, objetivo_monto').eq('cuatrimestre', cuatri),
    supabase.from('bonos_objetivo').select('vendedor_id, monto, moneda').eq('cuatrimestre', cuatri),
    supabase.from('comisiones').select('vendedor_id, estado, monto_comision').eq('tipo', 'bono').eq('cuatrimestre', cuatri).neq('estado', 'cancelada'),
    vendidoEnCuatrimestre(supabase, cuatri),
  ])
  if (comRes.error) console.error('Comisiones: no se pudieron leer:', comRes.error.message)
  if (cobradasRes.error) console.error('Comisiones: no se pudieron leer las facturas cobradas:', cobradasRes.error.message)

  const nombres = new Map((perfilesRes.data ?? []).map(p => [p.id as string, p.nombre as string]))

  const comisiones: ComisionRow[] = (comRes.data ?? []).map(c => {
    const f = first<any>(c.facturas)
    const o = first<any>(c.ordenes_venta)
    const cli = first<any>(o?.clientes)
    const ag = first<any>(o?.agencias)
    return {
      id: c.id,
      tipo: c.tipo,
      vendedor_id: c.vendedor_id,
      vendedor: nombres.get(c.vendedor_id) ?? '—',
      compartida_con: c.compartida_con ? (nombres.get(c.compartida_con) ?? '—') : null,
      orden_id: c.orden_id,
      orden_numero: o?.numero ?? null,
      agencia: ag?.nombre ?? null,
      cliente: cli?.empresa ?? cli?.nombre ?? null,
      marca: o?.marca ?? null,
      cuatrimestre: c.cuatrimestre,
      mes_pauta: f?.mes_pauta ?? null,
      cuota: f?.cuota ?? null,
      cuotas_total: f?.cuotas_total ?? null,
      fecha_cobro: f?.fecha_cobro ?? null,
      numero: f?.numero ?? null,
      importe: f ? Number(f.importe_total ?? 0) : null,
      arrendamiento: f ? Number(f.importe_arrendamiento ?? 0) : null,
      produccion: f ? Number(f.importe_produccion ?? 0) : null,
      base: Number(c.monto_base ?? 0),
      porcentaje: Number(c.porcentaje ?? 0),
      comision: Number(c.monto_comision ?? 0),
      moneda: c.moneda ?? 'UYU',
      estado: c.estado ?? 'pendiente',
    }
  })

  // Por agencia: lo que le toca a cada una según lo pactado en cada venta.
  const agencias: AgenciaRow[] = []
  for (const f of cobradasRes.data ?? []) {
    const o = first<any>(f.ordenes_venta)
    const ag = first<any>(o?.agencias)
    if (!ag) continue
    const cli = first<any>(o?.clientes)
    const arr = Number(f.importe_arrendamiento ?? 0)
    const prod = Number(f.importe_produccion ?? 0)
    const pctArr = Number(o?.comision_agencia_pct ?? 0)
    const pctProd = Number(o?.comision_agencia_prod_pct ?? 0)
    agencias.push({
      factura_id: f.id,
      agencia_id: ag.id,
      agencia: ag.nombre,
      cliente: cli?.empresa ?? cli?.nombre ?? '—',
      orden_numero: o?.numero ?? null,
      numero: f.numero,
      fecha_cobro: f.fecha_cobro,
      moneda: f.moneda ?? 'UYU',
      arrendamiento: arr,
      produccion: prod,
      pct_arrendamiento: pctArr,
      pct_produccion: pctProd,
      comision: Math.round((arr * pctArr + prod * pctProd)) / 100,
    })
  }

  // Bonos: todo vendedor con objetivo o con bono en el cuatrimestre.
  const objetivos = new Map((objetivosRes.data ?? []).map(o => [o.vendedor_id as string, Number(o.objetivo_monto ?? 0)]))
  const bonos = new Map((bonosRes.data ?? []).map(b => [b.vendedor_id as string, { monto: Number(b.monto), moneda: b.moneda ?? 'UYU' }]))
  const liquidados = new Map((bonosLiqRes.data ?? []).map(b => [b.vendedor_id as string, b.estado as string]))
  const vendedoresActivos = (perfilesRes.data ?? []).filter(p => p.activo !== false && ['vendedor', 'asistente_ventas'].includes(p.rol))
  const ids = new Set<string>([...vendedoresActivos.map(p => p.id as string), ...Array.from(objetivos.keys()), ...Array.from(bonos.keys())])
  const bonosRows: BonoRow[] = Array.from(ids).map(id => ({
    vendedor_id: id,
    vendedor: nombres.get(id) ?? '—',
    objetivo: objetivos.get(id) ?? 0,
    vendido: Math.round((vendido.get(id) ?? 0) * 100) / 100,
    bono: bonos.get(id)?.monto ?? null,
    moneda: bonos.get(id)?.moneda ?? 'UYU',
    liquidado: liquidados.get(id) ?? null,
  })).sort((a, b) => a.vendedor.localeCompare(b.vendedor))

  return (
    <ComisionesClient
      mes={mes}
      cuatrimestre={cuatri}
      cuatrimestres={cuatrimestresCercanos()}
      comisiones={comisiones}
      agencias={agencias}
      bonos={bonosRows}
      administra={es(session.user.rol, 'administracion')}
    />
  )
}
