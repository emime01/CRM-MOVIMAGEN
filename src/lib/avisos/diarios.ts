import type { SupabaseClient } from '@supabase/supabase-js'
import { hoyUY } from '@/lib/fechas'
import { enviarMail, mailConfigurado, mailsDePerfiles, plantillaMail } from '@/lib/mail'
import { mailSugerido, diasDeAtraso } from '@/lib/cobranza/mail-sugerido'
import { ESTADOS_VENTA_VIVA } from '@/lib/ventas/asignar-buses'
import { ventasConBuses } from '@/lib/buses/por-asignar'
import { rolesDe } from '@/lib/auth/roles'

const BASE = process.env.NEXTAUTH_URL ?? 'https://crm-movimagen.vercel.app'
const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : v ?? null)
const fecha = (d: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—')
const plata = (n: number, m = 'UYU') => `${m === 'USD' ? 'U$S' : '$'} ${Math.round(n).toLocaleString('es-UY')}`
const sumarDias = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Días de atraso en los que se vuelve a avisar de una factura vencida. */
const AVISOS_ATRASO = [1, 7, 15, 30, 45, 60, 90]

type Notificar = (userId: string, tipo: string, titulo: string, mensaje: string, link: string, entityId: string) => Promise<void>

/**
 * Recordatorios de cobranza. Para la asistente administrativa (Belén): una
 * notificación en el CRM por factura y un mail con el resumen y, para cada
 * factura, el mail sugerido para mandarle al cliente. Sólo a ella.
 *
 *   · vence en 3 días y vence hoy
 *   · vencida: al día siguiente y después a los 7, 15, 30, 45, 60 y 90 días
 */
export async function avisosCobranza(supabase: SupabaseClient, notificar: Notificar) {
  const hoy = hoyUY()
  const { data: facturas } = await supabase
    .from('facturas')
    .select('id, orden_id, numero, cuota, cuotas_total, importe_total, moneda, fecha_vencimiento, ordenes_venta(numero, campana, marca, facturar_a, clientes(nombre, empresa, email), agencias(nombre, email))')
    .eq('estado', 'emitida').eq('tipo', 'factura').not('fecha_vencimiento', 'is', null)

  const avisos: { f: any; motivo: string; atraso: number }[] = []
  for (const f of (facturas ?? []) as any[]) {
    const atraso = diasDeAtraso(f.fecha_vencimiento, hoy)
    if (f.fecha_vencimiento === sumarDias(hoy, 3)) avisos.push({ f, motivo: 'vence en 3 días', atraso })
    else if (atraso === 0) avisos.push({ f, motivo: 'vence hoy', atraso })
    else if (AVISOS_ATRASO.includes(atraso)) avisos.push({ f, motivo: `vencida hace ${atraso} día${atraso > 1 ? 's' : ''}`, atraso })
  }
  if (!avisos.length) return { avisos: 0, mails: 0 }

  const { data: asistentes } = await supabase.from('perfiles').select('id, rol').eq('activo', true)
  const belen = (asistentes ?? []).filter((p: any) => p.rol === 'asistente_administracion').map((p: any) => p.id as string)

  const bloques: string[] = []
  for (const { f, motivo } of avisos) {
    const o = first<any>(f.ordenes_venta), cli = first<any>(o?.clientes), ag = first<any>(o?.agencias)
    const cliente = cli?.empresa ?? cli?.nombre ?? 'cliente'
    const titulo = `Factura ${f.numero ?? ''} ${motivo}`.replace('  ', ' ')
    const mensaje = `${cliente} · OIC #${o?.numero ?? '—'} · ${plata(Number(f.importe_total), f.moneda)} · vence ${fecha(f.fecha_vencimiento)}`
    for (const id of belen) await notificar(id, 'cobranza_recordatorio', titulo, mensaje, '/dashboard/admin/deudores', f.id)

    const para = (o?.facturar_a === 'agencia' ? ag?.email : cli?.email) ?? cli?.email ?? ag?.email ?? ''
    const sug = mailSugerido({ cliente, agencia: ag?.nombre, numero: f.numero, importe: Number(f.importe_total), moneda: f.moneda,
      vencimiento: f.fecha_vencimiento, cuota: f.cuota, cuotasTotal: f.cuotas_total, campana: o?.campana ?? o?.marca }, hoy)
    const mailto = `mailto:${encodeURIComponent(para)}?subject=${encodeURIComponent(sug.asunto)}&body=${encodeURIComponent(sug.cuerpo)}`
    bloques.push(`<div style="border:1px solid #e5e3dc;border-radius:8px;padding:12px;margin:12px 0">
      <div style="font-weight:700">${esc(titulo)}</div>
      <div style="color:#6e6a62;font-size:13px">${esc(mensaje)}${ag?.nombre ? ' · ' + esc(ag.nombre) : ''}</div>
      <div style="margin-top:8px;font-size:12px;color:#6e6a62">Mail sugerido${para ? ` para <b>${esc(para)}</b>` : ' (la cuenta no tiene mail cargado)'}:</div>
      <div style="white-space:pre-wrap;background:#faf7f3;border-radius:6px;padding:10px;font-size:13px;margin-top:4px"><b>${esc(sug.asunto)}</b>\n\n${esc(sug.cuerpo)}</div>
      <a href="${mailto}" style="display:inline-block;margin-top:8px;color:#ec691a;font-weight:600">Abrir en el correo →</a>
    </div>`)
  }

  let mails = 0
  if (mailConfigurado() && belen.length) {
    const correos = await mailsDePerfiles(supabase)
    const html = plantillaMail(`Cobranza · ${avisos.length} factura${avisos.length > 1 ? 's' : ''} para gestionar`,
      `<p>Estas facturas vencen pronto o están vencidas. Cada una trae un mail sugerido para el cliente.</p>${bloques.join('')}`,
      `${BASE}/dashboard/admin/deudores`)
    for (const id of belen) if (correos.get(id) && await enviarMail(correos.get(id)!, `Cobranza: ${avisos.length} factura(s) para gestionar hoy`, html)) mails++
  }
  return { avisos: avisos.length, mails }
}

/**
 * Resumen diario por mail, según el perfil de cada uno. Si no hay nada para
 * contarle a alguien, no se le manda nada.
 */
export async function resumenesDiarios(supabase: SupabaseClient) {
  if (!mailConfigurado()) return { enviados: 0, motivo: 'mail sin configurar' }
  const hoy = hoyUY(), en7 = sumarDias(hoy, 7)
  const correos = await mailsDePerfiles(supabase)
  const { data: perfiles } = await supabase.from('perfiles').select('id, nombre, rol').eq('activo', true)

  const [{ data: leads }, { data: pendientes }, { data: tareas }, { data: campanas }, { data: aFacturar }] = await Promise.all([
    supabase.from('leads').select('id, vendedor_id, proxima_gestion, nota_gestion, descripcion, clientes(nombre, empresa)')
      .in('estado', ['nuevo', 'en_conversacion', 'propuesta_enviada', 'negociacion']).lte('proxima_gestion', hoy),
    supabase.from('ordenes_venta').select('id, numero, monto_total, moneda, clientes(nombre, empresa), perfiles!vendedor_id(nombre)').eq('estado', 'pendiente_aprobacion'),
    supabase.from('tasks').select('id, descripcion, asignado_a_rol, fecha_limite').in('estado', ['pendiente', 'en_progreso']).lte('fecha_limite', en7),
    supabase.from('ordenes_venta').select('id, numero, vendedor_id, fecha_alta_prevista, fecha_alta_real, clientes(nombre, empresa)')
      .in('estado', ESTADOS_VENTA_VIVA as unknown as string[]).gte('fecha_alta_prevista', hoy).lte('fecha_alta_prevista', en7),
    supabase.from('facturas').select('id').eq('estado', 'prevista').eq('tipo', 'factura').lte('mes_pauta', hoy.slice(0, 8) + '01'),
  ])
  const buses = (await ventasConBuses(supabase)).ventas.filter(v => v.faltan > 0)

  const li = (t: string) => `<li style="margin:3px 0">${t}</li>`
  const seccion = (titulo: string, items: string[]) => items.length ? `<h3 style="font-size:15px;margin:16px 0 6px">${titulo}</h3><ul style="padding-left:18px;margin:0">${items.join('')}</ul>` : ''
  const nombreCli = (c: any) => { const x = first<any>(c); return x?.empresa ?? x?.nombre ?? '—' }

  let enviados = 0
  for (const p of (perfiles ?? []) as any[]) {
    const para = correos.get(p.id)
    if (!para) continue
    const roles = rolesDe(p.rol)
    const partes: string[] = []
    if (roles.includes('vendedor') || roles.includes('gerente_comercial')) {
      const mios = (leads ?? []).filter((l: any) => roles.includes('gerente_comercial') || l.vendedor_id === p.id)
      partes.push(seccion(roles.includes('gerente_comercial') ? 'Gestiones de hoy y atrasadas (equipo)' : 'Tus gestiones de hoy y atrasadas',
        mios.slice(0, 25).map((l: any) => li(`${esc(nombreCli(l.clientes) !== '—' ? nombreCli(l.clientes) : (l.descripcion ?? 'Lead'))} · ${l.proxima_gestion < hoy ? `<b style="color:#b91c1c">atrasada (${fecha(l.proxima_gestion)})</b>` : 'hoy'}${l.nota_gestion ? ' · ' + esc(l.nota_gestion) : ''}`))))
      const camps = (campanas ?? []).filter((c: any) => roles.includes('gerente_comercial') || c.vendedor_id === p.id)
      partes.push(seccion('Campañas que arrancan esta semana', camps.map((c: any) => li(`OIC #${c.numero} · ${esc(nombreCli(c.clientes))} · ${fecha(c.fecha_alta_real ?? c.fecha_alta_prevista)}`))))
    }
    if (roles.includes('gerente_comercial')) {
      partes.push(seccion('Ventas esperando tu aprobación', (pendientes ?? []).map((o: any) => li(`OIC #${o.numero} · ${esc(nombreCli(o.clientes))} · ${plata(Number(o.monto_total ?? 0), o.moneda)} · ${esc(first<any>(o.perfiles)?.nombre ?? '')}`))))
    }
    for (const area of ['operaciones', 'arte'] as const) {
      if (!roles.includes(area)) continue
      const ts = (tareas ?? []).filter((t: any) => t.asignado_a_rol === area)
      partes.push(seccion(`Tareas de ${area} que vencen esta semana`, ts.slice(0, 30).map((t: any) => li(`${esc(t.descripcion ?? 'Tarea')} · ${t.fecha_limite < hoy ? `<b style="color:#b91c1c">vencida (${fecha(t.fecha_limite)})</b>` : fecha(t.fecha_limite)}`))))
      if (area === 'operaciones') partes.push(seccion('Buses sin asignar', buses.map(v => li(`OIC #${v.numero} · ${esc(v.cliente)} · faltan ${v.faltan}`))))
    }
    if (roles.includes('administracion') || roles.includes('asistente_administracion')) {
      if ((aFacturar ?? []).length) partes.push(seccion('Facturación', [li(`${aFacturar!.length} cuota(s) para facturar este mes o antes`)]))
    }
    const cuerpo = partes.filter(Boolean).join('')
    if (!cuerpo) continue
    const html = plantillaMail(`Buen día, ${esc(p.nombre)}`, `<p>Esto es lo que tenés para hoy en el CRM:</p>${cuerpo}`, BASE + '/dashboard')
    if (await enviarMail(para, `Tu día en el CRM · ${fecha(hoy)}`, html)) enviados++
  }
  return { enviados }
}
