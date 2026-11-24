import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import { puede } from '@/lib/auth/roles'
import { todos } from '@/lib/supabase-todos'
import { hoyUY } from '@/lib/fechas'
import { ESTADOS_VENTA_VIVA } from '@/lib/ventas/asignar-buses'
import { resumenPorCliente, type Agrupar } from '@/lib/administracion/por-cliente'
import PorClienteClient from './PorClienteClient'

export const dynamic = 'force-dynamic'

const MES = /^\d{4}-(0[1-9]|1[0-2])$/
const ORDEN = 'cliente_id, agencia_id, moneda, clientes(id, nombre, empresa), agencias(id, nombre)'

/**
 * Administración · Facturación y ventas por cliente (o por agencia): lo
 * vendido, facturado y cobrado en el período, y lo pendiente, vencido y por
 * facturar a hoy. Sólo Administración y su asistente.
 */
export default async function PorClientePage({ searchParams }: { searchParams: { desde?: string; hasta?: string; por?: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!puede(session.user.rol, ['administracion', 'asistente_administracion'])) redirect('/dashboard')
  const supabase = createServerClient()

  const hoy = hoyUY()
  const anio = hoy.slice(0, 4)
  let desde = MES.test(searchParams.desde ?? '') ? searchParams.desde! : `${anio}-01`
  let hasta = MES.test(searchParams.hasta ?? '') ? searchParams.hasta! : hoy.slice(0, 7)
  if (desde > hasta) [desde, hasta] = [hasta, desde]
  const agrupar: Agrupar = searchParams.por === 'agencia' ? 'agencia' : 'cliente'
  const [hy, hm] = hasta.split('-').map(Number)
  const finHasta = new Date(Date.UTC(hy, hm, 0)).toISOString().slice(0, 10)

  const [ventasRes, facturasRes, pagosRes] = await Promise.all([
    todos((d, h) => supabase.from('ordenes_venta')
      .select(`id, monto_neto, monto_total, created_at, ${ORDEN}`)
      .in('estado', ESTADOS_VENTA_VIVA as unknown as string[])
      .gte('created_at', `${desde}-01`).lte('created_at', `${finHasta}T23:59:59`)
      .order('id').range(d, h)),
    // Las del período (facturado) y todas las abiertas (pendiente, vencido, a facturar).
    todos((d, h) => supabase.from('facturas')
      .select(`id, tipo, estado, fecha_emision, fecha_vencimiento, importe_total, moneda, ordenes_venta(${ORDEN})`)
      .or(`estado.in.(emitida,prevista),and(estado.eq.cobrada,fecha_emision.gte.${desde}-01,fecha_emision.lte.${finHasta})`)
      .order('id').range(d, h)),
    todos((d, h) => supabase.from('pagos')
      .select(`id, monto, fecha_pago, ordenes_venta(${ORDEN})`)
      .gte('fecha_pago', `${desde}-01`).lte('fecha_pago', finHasta)
      .order('id').range(d, h)),
  ])
  const error = ventasRes.error ?? facturasRes.error ?? pagosRes.error
  if (error) console.error('Por cliente:', error.message)

  const filas = resumenPorCliente({
    ventas: ventasRes.data as any[], facturas: facturasRes.data as any[], pagos: pagosRes.data as any[],
    desde, hasta, hoy, agrupar,
  })

  return <PorClienteClient filas={filas} desde={desde} hasta={hasta} agrupar={agrupar} hoy={hoy} error={error?.message ?? null} />
}
