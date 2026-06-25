import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Genera las tareas automáticas para arte y operaciones cuando una OIC se aprueba.
 *
 * Reglas:
 *   - Item con tipo_cotizador en (estatico_bus, estatico_shopping, medianera)
 *       → arte_muestra_color  + ops_producir_impresos    (deadline: fecha_alta)
 *   - Item con tipo_cotizador en (led, banner_shopping, circuito)
 *       → arte_chequear_material_digital                  (deadline: fecha_alta)
 *   - Siempre por ítem → ops_crear_comprobante           (deadline: fecha_baja)
 *   - Si la OIC tiene al menos un soporte tipo bus       → ops_asignar_buses  (uno por OIC)
 *
 * Es idempotente: si ya hay tasks para esta orden, no genera nada.
 */
export async function generarTasksDeOrden(supabase: SupabaseClient, ordenId: string) {
  const { data: existing } = await supabase.from('tasks').select('id').eq('orden_id', ordenId).limit(1)
  if (existing && existing.length > 0) return { created: 0, skipped: true }

  const [{ data: orden }, { data: items }] = await Promise.all([
    supabase
      .from('ordenes_venta')
      .select('numero, tipo, fecha_alta_prevista, fecha_baja_prevista, clientes(nombre, empresa)')
      .eq('id', ordenId)
      .single(),
    supabase
      .from('orden_items')
      .select('id, soporte_id, fecha_alta_prevista, fecha_baja_prevista, soportes(nombre, tipo_cotizador, tipo)')
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

    const base = `OIC #${ordenNumero} · ${clienteNombre} · ${soporteName}`

    if (tipoCot === 'estatico_bus' || tipoCot === 'estatico_shopping' || tipoCot === 'medianera') {
      toCreate.push({ tipo: 'arte_muestra_color',        asignado_a_rol: 'arte',        orden_id: ordenId, orden_item_id: it.id, soporte_id: it.soporte_id, descripcion: `Muestra color — ${base}`, fecha_limite: fechaAlta })
      toCreate.push({ tipo: 'ops_producir_impresos',     asignado_a_rol: 'operaciones', orden_id: ordenId, orden_item_id: it.id, soporte_id: it.soporte_id, descripcion: `Producir impreso — ${base}`, fecha_limite: fechaAlta })
    } else if (tipoCot === 'led' || tipoCot === 'banner_shopping' || tipoCot === 'circuito') {
      toCreate.push({ tipo: 'arte_chequear_material_digital', asignado_a_rol: 'arte',  orden_id: ordenId, orden_item_id: it.id, soporte_id: it.soporte_id, descripcion: `Chequear materiales digitales — ${base}`, fecha_limite: fechaAlta })
    }

    if (it.soporte_id) {
      toCreate.push({ tipo: 'ops_crear_comprobante', asignado_a_rol: 'operaciones', orden_id: ordenId, orden_item_id: it.id, soporte_id: it.soporte_id, descripcion: `Crear comprobante — ${base}`, fecha_limite: fechaBaja })
    }

    if (tipoCot === 'estatico_bus' || tipo?.toLowerCase().includes('bus')) hasBus = true
  }

  // En reimpresiones los buses ya estaban asignados en la madre — no se reasignan
  if (hasBus && (orden as any).tipo !== 'cambio_material') {
    toCreate.push({
      tipo: 'ops_asignar_buses',
      asignado_a_rol: 'operaciones',
      orden_id: ordenId,
      descripcion: `Asignar buses — OIC #${ordenNumero} · ${clienteNombre}`,
      fecha_limite: orden.fecha_alta_prevista ?? null,
    })
  }

  if (toCreate.length === 0) return { created: 0 }

  const { error } = await supabase.from('tasks').insert(toCreate)
  if (error) return { created: 0, error: error.message }

  // Notificar a cada persona de los roles involucrados
  const porRol = new Map<string, number>()
  toCreate.forEach(t => porRol.set(t.asignado_a_rol, (porRol.get(t.asignado_a_rol) ?? 0) + 1))

  const roles = Array.from(porRol.keys())
  const { data: destinatarios } = await supabase
    .from('perfiles')
    .select('id, rol')
    .in('rol', roles)

  if (destinatarios?.length) {
    const notifs = destinatarios.map((p: { id: string; rol: string }) => ({
      user_id:   p.id,
      tipo:      'tasks_nuevas',
      titulo:    'Nuevas tareas de producción',
      mensaje:   `OIC #${ordenNumero} · ${clienteNombre} — ${porRol.get(p.rol)} tarea(s) para tu área`,
      link:      '/dashboard/tasks',
      entity_id: ordenId,
    }))
    await supabase.from('notificaciones').insert(notifs)
  }

  return { created: toCreate.length }
}
