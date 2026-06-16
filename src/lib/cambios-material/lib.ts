import type { SupabaseClient } from '@supabase/supabase-js'

const ES_DIGITAL = new Set(['led', 'banner_shopping', 'circuito'])
const ES_IMPRESO = new Set(['estatico_bus', 'estatico_shopping', 'medianera'])

/**
 * Cambio de material DIGITAL: registra el archivo nuevo, genera tasks
 * para arte (validar el material) y operaciones (re-comprobar la pauta).
 */
export async function registrarCambioDigital(
  supabase: SupabaseClient,
  args: {
    ordenItemId: string
    fechaDesde: string
    urlMaterial?: string | null
    nombreArchivo?: string | null
    descripcion?: string | null
    perfilId: string | null
  },
): Promise<{ ok: boolean; error?: string; cambioId?: string; tasksCreadas?: number }> {
  const { data: item } = await supabase
    .from('orden_items')
    .select('id, orden_id, soporte_id, soportes(nombre, tipo_cotizador), ordenes_venta(numero, clientes(nombre, empresa))')
    .eq('id', args.ordenItemId)
    .maybeSingle()
  if (!item) return { ok: false, error: 'Ítem no encontrado' }

  const sop: any = Array.isArray(item.soportes) ? item.soportes[0] : item.soportes
  if (!sop?.tipo_cotizador || !ES_DIGITAL.has(sop.tipo_cotizador)) {
    return { ok: false, error: 'Este soporte no es digital — usá cambio impreso (genera OIC nueva).' }
  }

  const { data: cambio, error } = await supabase
    .from('cambios_material')
    .insert({
      orden_item_id:  args.ordenItemId,
      fecha_desde:    args.fechaDesde,
      url_material:   args.urlMaterial ?? null,
      nombre_archivo: args.nombreArchivo ?? null,
      descripcion:    args.descripcion ?? null,
      created_by:     args.perfilId,
    })
    .select('id')
    .single()
  if (error || !cambio) return { ok: false, error: error?.message ?? 'No se pudo registrar' }

  // Generar las dos tasks asociadas al cambio
  const ord: any = Array.isArray(item.ordenes_venta) ? item.ordenes_venta[0] : item.ordenes_venta
  const cli: any = Array.isArray(ord?.clientes) ? ord.clientes[0] : ord?.clientes
  const desc = `OIC #${ord?.numero ?? '—'} · ${cli?.empresa ?? cli?.nombre ?? '—'} · ${sop.nombre} · cambio del ${args.fechaDesde}`
  const { error: tErr } = await supabase.from('tasks').insert([
    { tipo: 'arte_chequear_material_digital', asignado_a_rol: 'arte',        orden_id: item.orden_id, orden_item_id: item.id, soporte_id: item.soporte_id, descripcion: `Validar nuevo material — ${desc}`, fecha_limite: args.fechaDesde },
    { tipo: 'ops_crear_comprobante',          asignado_a_rol: 'operaciones', orden_id: item.orden_id, orden_item_id: item.id, soporte_id: item.soporte_id, descripcion: `Re-grabar comprobante con material nuevo — ${desc}`, fecha_limite: args.fechaDesde },
  ])
  if (tErr) return { ok: true, cambioId: cambio.id, tasksCreadas: 0, error: 'Cambio registrado pero falló la generación de tasks: ' + tErr.message }

  return { ok: true, cambioId: cambio.id, tasksCreadas: 2 }
}

/**
 * Cambio de material IMPRESO: crea OIC hija "cambio_material" en estado
 * borrador, con los mismos ítems que la madre pero arrendamiento en 0
 * (solo se cobra la producción). El vendedor la revisa y manda a aprobar.
 */
export async function crearOicCambioImpreso(
  supabase: SupabaseClient,
  args: {
    oicOrigenId: string
    soporteIds?: string[]            // si está vacío incluye todos los ítems impresos
    creadoPorPerfilId: string | null
  },
): Promise<{ ok: boolean; error?: string; ordenId?: string; numero?: number; itemsCopiados?: number }> {
  const { data: madre } = await supabase
    .from('ordenes_venta')
    .select('*, orden_items(*, soportes(nombre, tipo_cotizador)), clientes(nombre, empresa)')
    .eq('id', args.oicOrigenId)
    .single()
  if (!madre) return { ok: false, error: 'OIC origen no encontrada' }

  const itemsImpresos = ((madre.orden_items ?? []) as any[]).filter((it) => {
    const s: any = Array.isArray(it.soportes) ? it.soportes[0] : it.soportes
    if (!s?.tipo_cotizador || !ES_IMPRESO.has(s.tipo_cotizador)) return false
    if (args.soporteIds && args.soporteIds.length > 0) return args.soporteIds.includes(it.soporte_id)
    return true
  })
  if (itemsImpresos.length === 0) {
    return { ok: false, error: 'La OIC no tiene ítems impresos para reimprimir' }
  }

  // Siguiente número de orden
  const { data: seq } = await supabase.from('ordenes_venta').select('numero').order('numero', { ascending: false }).limit(1).maybeSingle()
  const numero = ((seq?.numero ?? 0) as number) + 1

  const cli: any = Array.isArray(madre.clientes) ? madre.clientes[0] : madre.clientes
  const notaMadre = `Reimpresión sobre OIC #${madre.numero ?? '—'} · ${cli?.empresa ?? cli?.nombre ?? ''}`.trim()

  const { data: hija, error } = await supabase
    .from('ordenes_venta')
    .insert({
      tipo:                'cambio_material',
      oic_origen_id:       args.oicOrigenId,
      lead_id:             madre.lead_id,
      cliente_id:          madre.cliente_id,
      vendedor_id:         args.creadoPorPerfilId ?? madre.vendedor_id,
      propuesta_id:        null,
      numero,
      estado:              'borrador',
      moneda:              madre.moneda ?? 'UYU',
      fecha_alta_prevista: madre.fecha_alta_prevista,
      fecha_baja_prevista: madre.fecha_baja_prevista,
      notas:               notaMadre,
    })
    .select('id, numero')
    .single()
  if (error || !hija) return { ok: false, error: error?.message ?? 'No se pudo crear la OIC hija' }

  // Copiar ítems: cantidad/semanas iguales, arrendamiento en 0 (solo cobra producción).
  // requiere_produccion = true (la idea es reimprimir).
  const rows = itemsImpresos.map((it: any) => ({
    orden_id:             hija.id,
    soporte_id:           it.soporte_id,
    cantidad:             it.cantidad,
    semanas:              it.semanas,
    salidas:              it.salidas ?? null,
    precio_unitario:      0,  // sin arrendamiento adicional
    descuento_pct:        0,
    nota:                 'Reimpresión',
    fecha_alta_prevista:  it.fecha_alta_prevista ?? madre.fecha_alta_prevista,
    fecha_baja_prevista:  it.fecha_baja_prevista ?? madre.fecha_baja_prevista,
    requiere_grabado:     false,
    requiere_produccion:  true,
  }))
  const { error: itErr } = await supabase.from('orden_items').insert(rows)
  if (itErr) {
    await supabase.from('ordenes_venta').delete().eq('id', hija.id)
    return { ok: false, error: 'No se pudieron copiar los ítems: ' + itErr.message }
  }

  await supabase.from('orden_historial').insert({
    orden_id:     hija.id,
    perfil_id:    args.creadoPorPerfilId,
    estado_nuevo: 'borrador',
    comentario:   `OIC de reimpresión generada desde #${madre.numero ?? '—'}`,
  })

  return { ok: true, ordenId: hija.id, numero: hija.numero, itemsCopiados: rows.length }
}
