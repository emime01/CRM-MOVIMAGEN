import type { SupabaseClient } from '@supabase/supabase-js'
import { atiendeTareasDe } from '@/lib/auth/roles'
import { insertarNotificaciones } from '@/lib/notificaciones'

/** Una fecha "AAAA-MM-DD" corrida n días (negativo = antes). */
function correr(fecha: string | null, dias: number): string | null {
  if (!fecha) return null
  const d = new Date(fecha + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

// Cuánto antes del alta tiene que estar cada cosa: el arte aprobado antes de
// imprimir, lo impreso antes de instalar. Antes todo vencía el día del alta.
const DIAS_ARTE_ANTES = 10
const DIAS_IMPRESO_ANTES = 3
const DIAS_BUSES_ANTES = 7
// El comprobante se arma con las fotos de la instalación.
const DIAS_COMPROBANTE_DESPUES = 7

/**
 * Genera las tareas automáticas para arte y operaciones cuando una OIC se aprueba.
 *
 * Reglas:
 *   - Item con tipo_cotizador en (estatico_bus, estatico_shopping, medianera,
 *     rutero, banner_shopping) — los banners de shopping son lonas impresas
 *       → arte_muestra_color (arte final + muestra por WeTransfer, alta − 10 días)
 *         + ops_producir_impresos (alta − 3 días)
 *   - Item con tipo_cotizador en (led, circuito)
 *       → arte_chequear_material_digital (cargar en el panel)   (alta − 3 días)
 *   - Uno por OIC → ops_crear_comprobante                 (alta + 7 días)
 *   - Si la OIC tiene al menos un soporte tipo bus       → ops_asignar_buses  (alta − 7 días)
 *
 * Es idempotente: si ya hay tasks para esta orden, no genera nada.
 */
export async function generarTasksDeOrden(supabase: SupabaseClient, ordenId: string) {
  // Las tareas del vendedor (renovación) no cuentan: no son de producción.
  const { data: existing } = await supabase.from('tasks').select('id').eq('orden_id', ordenId).neq('asignado_a_rol', 'ventas').limit(1)
  if (existing && existing.length > 0) return { created: 0, skipped: true }

  const [{ data: orden }, { data: items }] = await Promise.all([
    supabase
      .from('ordenes_venta')
      .select('numero, fecha_alta_prevista, fecha_baja_prevista, clientes(nombre, empresa)')
      .eq('id', ordenId)
      .single(),
    supabase
      .from('orden_items')
      .select('id, soporte_id, cantidad, requiere_produccion, fecha_alta_prevista, fecha_baja_prevista, soportes(nombre, tipo_cotizador, tipo)')
      .eq('orden_id', ordenId),
  ])

  if (!orden) return { created: 0, error: 'Orden no encontrada' }

  const cli: any = Array.isArray(orden.clientes) ? orden.clientes[0] : orden.clientes
  const clienteNombre = cli?.empresa ?? cli?.nombre ?? 'cliente'
  const ordenNumero = orden.numero ?? '—'

  type TaskRow = {
    tipo: string
    asignado_a_rol: 'arte' | 'operaciones'
    orden_id: string
    orden_item_id?: string | null
    soporte_id?: string | null
    descripcion: string
    fecha_limite: string | null
  }
  const toCreate: TaskRow[] = []
  let hasBus = false

  for (const it of (items ?? []) as any[]) {
    const s = Array.isArray(it.soportes) ? it.soportes[0] : it.soportes
    const tipoCot: string | null = s?.tipo_cotizador ?? null
    const tipo: string | null = s?.tipo ?? null
    const soporteName = s?.nombre ?? '—'

    const fechaAlta = it.fecha_alta_prevista ?? orden.fecha_alta_prevista ?? null
    const fechaBaja = it.fecha_baja_prevista ?? orden.fecha_baja_prevista ?? null

    const cant = Math.max(1, Number(it.cantidad) || 1)
    const base = `OIC #${ordenNumero} · ${clienteNombre} · ${soporteName}${cant > 1 ? ` ×${cant}` : ''}`
    void fechaBaja

    // Impresos, salvo una renovación sin producción (el material ya está
    // instalado): ahí no hay arte nuevo ni nada que imprimir.
    const impreso = tipoCot === 'estatico_bus' || tipoCot === 'estatico_shopping' || tipoCot === 'medianera' || tipoCot === 'rutero' || tipoCot === 'banner_shopping'
    if (impreso && it.requiere_produccion !== false) {
      toCreate.push({ tipo: 'arte_muestra_color',        asignado_a_rol: 'arte',        orden_id: ordenId, orden_item_id: it.id, soporte_id: it.soporte_id, descripcion: `Arte final y muestra por WeTransfer — ${base}`, fecha_limite: correr(fechaAlta, -DIAS_ARTE_ANTES) })
      toCreate.push({ tipo: 'ops_producir_impresos',     asignado_a_rol: 'operaciones', orden_id: ordenId, orden_item_id: it.id, soporte_id: it.soporte_id, descripcion: `Producir impreso — ${base}`, fecha_limite: correr(fechaAlta, -DIAS_IMPRESO_ANTES) })
    } else if (!impreso && (tipoCot === 'led' || tipoCot === 'circuito')) {
      toCreate.push({ tipo: 'arte_chequear_material_digital', asignado_a_rol: 'arte',  orden_id: ordenId, orden_item_id: it.id, soporte_id: it.soporte_id, descripcion: `Cargar en el panel — ${base}`, fecha_limite: correr(fechaAlta, -DIAS_IMPRESO_ANTES) })
    }

    if (tipoCot === 'estatico_bus' || tipo?.toLowerCase().includes('bus')) hasBus = true
  }

  if (hasBus) {
    toCreate.push({
      tipo: 'ops_asignar_buses',
      asignado_a_rol: 'operaciones',
      orden_id: ordenId,
      descripcion: `Asignar buses — OIC #${ordenNumero} · ${clienteNombre}`,
      fecha_limite: correr(orden.fecha_alta_prevista ?? null, -DIAS_BUSES_ANTES),
    })
  }

  // Un comprobante por venta (el PDF es uno), una semana después del alta:
  // antes había uno por soporte y vencía al final de la campaña.
  if ((items ?? []).some((it: any) => it.soporte_id)) {
    toCreate.push({
      tipo: 'ops_crear_comprobante',
      asignado_a_rol: 'operaciones',
      orden_id: ordenId,
      descripcion: `Crear comprobante — OIC #${ordenNumero} · ${clienteNombre}`,
      fecha_limite: correr(orden.fecha_alta_prevista ?? null, DIAS_COMPROBANTE_DESPUES),
    })
  }

  if (toCreate.length === 0) return { created: 0 }

  const { error } = await supabase.from('tasks').insert(toCreate)
  if (error) return { created: 0, error: error.message }

  // Notificar a cada persona de los roles involucrados
  const porRol = new Map<string, number>()
  toCreate.forEach(t => porRol.set(t.asignado_a_rol, (porRol.get(t.asignado_a_rol) ?? 0) + 1))

  // A cada persona que atiende esas áreas, también con rol mixto (Magaly es
  // asistente de ventas y operaciones): antes sólo le llegaba al rol exacto.
  const { data: perfiles } = await supabase.from('perfiles').select('id, rol').eq('activo', true)
  const notifs = (perfiles ?? []).flatMap((p: { id: string; rol: string }) => {
    const cuantas = Array.from(porRol.entries())
      .filter(([area]) => atiendeTareasDe(p.rol, area))
      .reduce((t, [, n]) => t + n, 0)
    if (!cuantas) return []
    return [{
      user_id:   p.id,
      tipo:      'tasks_nuevas',
      titulo:    'Nuevas tareas de producción',
      mensaje:   `OIC #${ordenNumero} · ${clienteNombre} — ${cuantas} tarea(s) para tu área`,
      link:      `/dashboard/ventas/${ordenId}`,
      entity_id: ordenId,
    }]
  })
  if (notifs.length) await insertarNotificaciones(supabase, notifs)

  return { created: toCreate.length }
}
