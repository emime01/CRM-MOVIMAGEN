import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import ClienteHistorialClient from './ClienteHistorialClient'
import { puede } from '@/lib/auth/roles'
import { emparejarCliente } from '@/lib/ventas/historicas'

export const dynamic = 'force-dynamic'

export default async function ClienteHistorialPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!puede(session.user.rol, ['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion', 'asistente_administracion'])) {
    redirect('/dashboard')
  }

  const supabase = createServerClient()
  const id = params.id

  const [clienteRes, leadsRes, ordenesRes, objetivoRes, historicasRes, sinCuentaRes] = await Promise.all([
    supabase.from('clientes').select('id, nombre, empresa, email, telefono, rut, tipo_cliente, vendedor_id, logo_url, perfiles!clientes_vendedor_id_fkey(nombre)').eq('id', id).single(),
    supabase.from('leads').select('id, estado, descripcion, monto_potencial, cuatrimestre, notas, created_at, perfiles!leads_vendedor_id_fkey(nombre)').eq('cliente_id', id).order('created_at', { ascending: false }),
    supabase.from('ordenes_venta').select('id, numero, estado, monto_total, monto_neto, created_at, perfiles!ordenes_venta_vendedor_id_fkey(nombre)').eq('cliente_id', id).order('created_at', { ascending: false }),
    supabase.from('cliente_objetivos').select('objetivo_c1, objetivo_c2, objetivo_c3, ponderacion_pct, year').eq('cliente_id', id).order('year', { ascending: false }).limit(1).maybeSingle(),
    // Ventas de 2024–2025 de la planilla anterior al CRM (si la tabla todavía
    // no existe, la consulta falla y simplemente no se muestra la pestaña).
    supabase.from('ventas_historicas').select('id, anio, trimestre, cliente_texto, vendedor_nombre, monto, perfiles!ventas_historicas_vendedor_id_fkey(nombre)')
      .eq('cliente_id', id).order('anio', { ascending: false }).order('trimestre', { ascending: false }).limit(500),
    // Las que no quedaron en una sola cuenta porque la empresa tiene varias
    // (Unilever programática / tradicional): se muestran en todas sus cuentas.
    supabase.from('ventas_historicas').select('id, anio, trimestre, cliente_texto, vendedor_nombre, monto, perfiles!ventas_historicas_vendedor_id_fkey(nombre)')
      .is('cliente_id', null).limit(2000),
  ])

  if (!clienteRes.data) redirect('/dashboard/cuentas')

  return (
    <ClienteHistorialClient
      cliente={clienteRes.data as any}
      leads={(leadsRes.data ?? []) as any}
      // El cuatrimestre sale de la fecha de la venta (Q1 ene–abr, Q2 may–ago,
      // Q3 sep–dic). La consulta pedía una columna que no existe y fallaba
      // callada: la cuenta mostraba "Ventas (0)".
      ordenes={(ordenesRes.data ?? []).map((o: any) => ({
        ...o,
        cuatrimestre_asociado: o.created_at
          ? `Q${Math.floor((Number(o.created_at.slice(5, 7)) - 1) / 4) + 1}-${o.created_at.slice(0, 4)}`
          : null,
      })) as any}
      objetivo={objetivoRes.data ?? null}
      historicas={[
        ...((historicasRes.data ?? []) as any[]),
        ...((sinCuentaRes.data ?? []) as any[])
          .filter(h => emparejarCliente(h.cliente_texto, [clienteRes.data as any]) !== null)
          .map(h => ({ ...h, compartida: true })),
      ].sort((a, b) => b.anio - a.anio || b.trimestre - a.trimestre) as any}
    />
  )
}
