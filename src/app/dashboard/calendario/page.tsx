import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import CalendarioClient, { type EventoCRM, type Capa } from './CalendarioClient'
import { puede, es, areasDeTarea, haceAdministracion, esAdminSistema } from '@/lib/auth/roles'
import { ESTADOS_VENTA_VIVA } from '@/lib/ventas/asignar-buses'
import { hoyUY } from '@/lib/fechas'

export const dynamic = 'force-dynamic'

const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : v ?? null)
const nombreCliente = (c: any) => c?.empresa ?? c?.nombre ?? '—'
const ESTADOS_LEAD_ACTIVO = ['nuevo', 'en_conversacion', 'propuesta_enviada', 'negociacion', 'en_seguimiento']

/**
 * Calendario: la Agenda (Google Calendar de cada uno) y el calendario de
 * operaciones, juntos. Cada cosa es una capa que se prende y se apaga:
 *
 *   google    las reuniones y llamadas de Google Calendar. El gerente ve,
 *             además, las de todo el equipo comercial.
 *   gestion   las próximas gestiones de los leads.
 *   campana   altas y bajas de las campañas vendidas.
 *   tarea     tareas con fecha (operaciones, arte, seguimientos de pago).
 *   cobranza  vencimientos de facturas y promesas de pago.
 *
 * Cada rol ve las capas que le tocan y arranca con las que usa.
 */
export default async function CalendarioPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  const rol = session.user.rol
  const yo = session.user.id
  const supabase = createServerClient()

  const gerente = es(rol, 'gerente_comercial')
  const comercial = puede(rol, ['vendedor', 'asistente_ventas', 'gerente_comercial'])
  const administrativo = haceAdministracion(rol)
  const areas = areasDeTarea(rol)
  const veTodasLasTareas = esAdminSistema(rol) || gerente || es(rol, 'administracion')

  // Qué capas tiene cada uno y con cuáles arranca.
  const capas: Capa[] = []
  const encendidas: Capa[] = []
  const agregar = (c: Capa, on: boolean) => { capas.push(c); if (on) encendidas.push(c) }
  agregar('google', comercial)
  if (comercial) agregar('gestion', true)
  agregar('campana', !administrativo || gerente || esAdminSistema(rol))
  if (veTodasLasTareas || areas.length > 0) agregar('tarea', !comercial || gerente)
  if (administrativo || gerente) agregar('cobranza', administrativo && !gerente)

  // Ventana: seis meses para atrás y un año para adelante.
  const hoy = hoyUY()
  const [y, m] = hoy.split('-').map(Number)
  const desde = new Date(Date.UTC(y, m - 7, 1)).toISOString().slice(0, 10)
  const hasta = new Date(Date.UTC(y + 1, m, 0)).toISOString().slice(0, 10)

  const eventos: EventoCRM[] = []
  const tiene = (c: Capa) => capas.includes(c)

  const [ventasRes, tareasRes, leadsRes, facturasRes, equipoRes, tokenRes] = await Promise.all([
    tiene('campana')
      ? supabase.from('ordenes_venta')
          .select('id, numero, vendedor_id, vendedor_compartido_id, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real, marca, clientes(nombre, empresa)')
          .in('estado', ESTADOS_VENTA_VIVA as unknown as string[])
      : Promise.resolve({ data: [] as any[] }),
    tiene('tarea')
      ? (() => {
          let q = supabase.from('tasks')
            .select('id, tipo, descripcion, fecha_limite, asignado_a_rol, orden_id, ordenes_venta(numero, clientes(nombre, empresa)), soportes(nombre)')
            .in('estado', ['pendiente', 'en_progreso'])
            .gte('fecha_limite', desde).lte('fecha_limite', hasta)
          if (!veTodasLasTareas) q = q.in('asignado_a_rol', areas)
          return q
        })()
      : Promise.resolve({ data: [] as any[] }),
    tiene('gestion')
      ? (() => {
          let q = supabase.from('leads')
            .select('id, descripcion, proxima_gestion, nota_gestion, vendedor_id, clientes(nombre, empresa)')
            .not('proxima_gestion', 'is', null)
            .in('estado', ESTADOS_LEAD_ACTIVO)
            .gte('proxima_gestion', desde).lte('proxima_gestion', hasta)
          // El gerente ve las del equipo; cada uno, las suyas.
          if (!gerente && !esAdminSistema(rol)) q = q.eq('vendedor_id', yo)
          return q
        })()
      : Promise.resolve({ data: [] as any[] }),
    tiene('cobranza')
      ? supabase.from('facturas')
          .select('id, orden_id, numero, cuota, cuotas_total, importe_total, moneda, fecha_vencimiento, fecha_pago_prometida, ordenes_venta(numero, vendedor_id, clientes(nombre, empresa), agencias(nombre))')
          .eq('estado', 'emitida')
      : Promise.resolve({ data: [] as any[] }),
    supabase.from('perfiles').select('id, nombre, rol').eq('activo', true).order('nombre'),
    supabase.from('google_tokens').select('user_id').eq('user_id', yo).maybeSingle(),
  ])

  const nombres = new Map(((equipoRes.data ?? []) as { id: string; nombre: string }[]).map(p => [p.id, p.nombre]))

  // Campañas: el vendedor ve las suyas (también las compartidas).
  for (const o of (ventasRes.data ?? []) as any[]) {
    const mia = o.vendedor_id === yo || o.vendedor_compartido_id === yo
    if (es(rol, 'vendedor') && !gerente && !esAdminSistema(rol) && !mia) continue
    const cliente = nombreCliente(first(o.clientes))
    const sub = [o.numero ? `OIC #${o.numero}` : null, o.marca, nombres.get(o.vendedor_id)].filter(Boolean).join(' · ')
    const alta = o.fecha_alta_real ?? o.fecha_alta_prevista
    const baja = o.fecha_baja_real ?? o.fecha_baja_prevista
    const base = { capa: 'campana' as const, titulo: cliente, sub, href: `/dashboard/ventas/${o.id}`, vendedor_id: o.vendedor_id }
    if (alta && alta >= desde && alta <= hasta) eventos.push({ ...base, id: `alta-${o.id}`, tipo: 'Alta', fecha: alta.slice(0, 10) })
    if (baja && baja >= desde && baja <= hasta) eventos.push({ ...base, id: `baja-${o.id}`, tipo: 'Baja', fecha: baja.slice(0, 10) })
  }

  for (const t of (tareasRes.data ?? []) as any[]) {
    const ord = first<any>(t.ordenes_venta)
    eventos.push({
      id: `tarea-${t.id}`, capa: 'tarea', tipo: 'Tarea', fecha: t.fecha_limite,
      titulo: t.descripcion ?? 'Tarea',
      sub: [nombreCliente(first(ord?.clientes)), first<any>(t.soportes)?.nombre].filter(x => x && x !== '—').join(' · ') || null,
      href: t.orden_id ? `/dashboard/ventas/${t.orden_id}` : '/dashboard/tasks',
      vendedor_id: null,
    })
  }

  for (const l of (leadsRes.data ?? []) as any[]) {
    eventos.push({
      id: `gestion-${l.id}`, capa: 'gestion', tipo: 'Gestión', fecha: l.proxima_gestion,
      titulo: nombreCliente(first(l.clientes)) !== '—' ? nombreCliente(first(l.clientes)) : (l.descripcion ?? 'Lead'),
      sub: [l.nota_gestion, gerente ? nombres.get(l.vendedor_id) : null].filter(Boolean).join(' · ') || null,
      href: `/dashboard/leads/${l.id}`,
      vendedor_id: l.vendedor_id,
    })
  }

  for (const f of (facturasRes.data ?? []) as any[]) {
    const o = first<any>(f.ordenes_venta)
    const cliente = nombreCliente(first(o?.clientes))
    const sub = [first<any>(o?.agencias)?.nombre, f.numero ? `Factura ${f.numero}` : null,
      f.cuotas_total > 1 ? `cuota ${f.cuota} de ${f.cuotas_total}` : null].filter(Boolean).join(' · ')
    const base = { capa: 'cobranza' as const, titulo: cliente, sub, href: `/dashboard/ventas/${f.orden_id}`, vendedor_id: o?.vendedor_id ?? null,
      importe: Number(f.importe_total ?? 0), moneda: f.moneda ?? 'UYU' }
    if (f.fecha_vencimiento && f.fecha_vencimiento >= desde && f.fecha_vencimiento <= hasta) {
      eventos.push({ ...base, id: `vto-${f.id}`, tipo: 'Vence', fecha: f.fecha_vencimiento })
    }
    if (f.fecha_pago_prometida && f.fecha_pago_prometida >= desde && f.fecha_pago_prometida <= hasta) {
      eventos.push({ ...base, id: `promesa-${f.id}`, tipo: 'Promete pagar', fecha: f.fecha_pago_prometida })
    }
  }

  const vendedores = ((equipoRes.data ?? []) as { id: string; nombre: string; rol: string }[])
    .filter(p => ['vendedor', 'asistente_ventas', 'asistente_ventas_ops'].includes(p.rol))
    .map(p => ({ id: p.id, nombre: p.nombre }))

  // Leads propios, para asociar un evento nuevo.
  let leads: { id: string; label: string }[] = []
  if (tiene('google')) {
    const { data } = await supabase.from('leads')
      .select('id, descripcion, clientes(nombre, empresa)')
      .eq('vendedor_id', yo)
      .in('estado', ESTADOS_LEAD_ACTIVO)
      .order('created_at', { ascending: false })
      .limit(80)
    leads = (data ?? []).map((l: any) => {
      const c = first<any>(l.clientes)
      return { id: l.id, label: c?.empresa || c?.nombre || l.descripcion || 'Lead sin nombre' }
    })
  }

  return (
    <CalendarioClient
      eventos={eventos}
      capas={capas}
      encendidas={encendidas}
      googleConectado={!!tokenRes.data}
      verEquipo={gerente}
      vendedores={gerente ? vendedores : []}
      leads={leads}
      hoy={hoy}
    />
  )
}
