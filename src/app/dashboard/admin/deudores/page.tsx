import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import DeudoresClient, { type DeudorRow, type UltimaGestion } from './DeudoresClient'
import { puede } from '@/lib/auth/roles'
import { puedeAdministrarFacturas } from '@/lib/ventas/facturas'

export const dynamic = 'force-dynamic'

const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : v ?? null)

/**
 * Cobranzas: la planilla de deudores, hecha de facturas.
 *
 * Una fila por factura emitida y no cobrada —una cuota, o una nota de crédito
 * en negativo—, con su vencimiento. Antes era una fila por venta con los días
 * contados desde la factura: una venta en doce cuotas aparecía entera como
 * deuda desde la primera, y nada sabía cuándo vencía.
 */
export default async function DeudoresPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!puede(session.user.rol, ['administracion', 'gerente_comercial'])) redirect('/dashboard')
  const supabase = createServerClient()

  const { data: facturas, error } = await supabase
    .from('facturas')
    .select(`
      id, orden_id, cuota, cuotas_total, mes_pauta, tipo, numero, fecha_emision,
      importe_total, moneda, fecha_vencimiento, fecha_pago_prometida,
      ordenes_venta(numero, marca, campana,
        clientes(nombre, empresa), agencias(id, nombre), perfiles!vendedor_id(nombre))
    `)
    .eq('estado', 'emitida')
    .order('fecha_vencimiento', { ascending: true, nullsFirst: false })
    .limit(1000)
  if (error) console.error('Cobranzas: no se pudieron leer las facturas:', error.message)

  const lista = facturas ?? []
  const ids = new Set(lista.map(f => f.id))
  const ordenIds = Array.from(new Set(lista.map(f => f.orden_id)))

  // Última gestión de cada factura. Las gestiones de antes de las facturas
  // eran de la venta entera: se muestran en sus facturas si no tienen una
  // propia.
  const porFactura = new Map<string, UltimaGestion>()
  const porOrden = new Map<string, UltimaGestion>()
  if (ordenIds.length > 0) {
    const { data: gestiones } = await supabase
      .from('gestiones_cobranza')
      .select('orden_id, factura_id, tipo, nota, created_at, proxima_accion')
      .in('orden_id', ordenIds)
      .order('created_at', { ascending: false })
    for (const g of gestiones ?? []) {
      const ug: UltimaGestion = { tipo: g.tipo, nota: g.nota, created_at: g.created_at, proxima_accion: g.proxima_accion }
      if (g.factura_id) {
        if (ids.has(g.factura_id) && !porFactura.has(g.factura_id)) porFactura.set(g.factura_id, ug)
      } else if (!porOrden.has(g.orden_id)) {
        porOrden.set(g.orden_id, ug)
      }
    }
  }

  const rows: DeudorRow[] = lista.map(f => {
    const o = first<any>(f.ordenes_venta)
    const cli = first<any>(o?.clientes)
    const ag = first<any>(o?.agencias)
    const vend = first<any>(o?.perfiles)
    return {
      id: f.id,
      orden_id: f.orden_id,
      orden_numero: (o?.numero as number | null) ?? null,
      agencia_id: ag?.id ?? null,
      agencia: ag?.nombre ?? null,
      cliente: cli?.empresa ?? cli?.nombre ?? '—',
      marca: o?.marca ?? o?.campana ?? null,
      vendedor: vend?.nombre ?? '—',
      cuota: f.cuota,
      cuotas_total: f.cuotas_total,
      mes_pauta: f.mes_pauta,
      tipo: f.tipo,
      numero: f.numero,
      fecha_emision: f.fecha_emision,
      importe: Number(f.importe_total ?? 0),
      moneda: f.moneda ?? 'UYU',
      vencimiento: f.fecha_vencimiento,
      promesa: f.fecha_pago_prometida,
      ultima_gestion: porFactura.get(f.id) ?? porOrden.get(f.orden_id) ?? null,
    }
  })

  return <DeudoresClient rows={rows} puedeCobrar={puedeAdministrarFacturas(session.user.rol)} />
}
