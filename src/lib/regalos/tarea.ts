import type { SupabaseClient } from '@supabase/supabase-js'
import { ROL_MIXTO } from '@/lib/auth/roles'
import { insertarNotificaciones } from '@/lib/notificaciones'

/**
 * Regalos de cumpleaños: cuando un vendedor pide "Enviar regalo", a la
 * asistente (Magaly, rol mixto ventas + operaciones) le llega una tarea
 * "Entregar regalo" en el tablero de operaciones, con aviso y push.
 */

export const TIPO_TAREA_REGALO = 'ops_entregar_regalo'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Próximo cumpleaños (AAAA-MM-DD) desde hoy, para la fecha límite. */
function proximoCumple(dia: number, mes: number): string {
  const hoy = new Date()
  const y = hoy.getFullYear()
  const este = new Date(Date.UTC(y, mes - 1, dia))
  const hoyUTC = new Date(Date.UTC(y, hoy.getMonth(), hoy.getDate()))
  const fecha = este < hoyUTC ? new Date(Date.UTC(y + 1, mes - 1, dia)) : este
  return fecha.toISOString().slice(0, 10)
}

export async function crearTareaRegalo(
  supabase: SupabaseClient,
  regaloId: string,
  contactoId: string,
  solicitante: { id: string; nombre?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  // A quién: la asistente con el rol mixto (Magaly); si no hay, las asistentes de ventas.
  const { data: perfiles } = await supabase.from('perfiles').select('id, rol, nombre').eq('activo', true)
  const mixtas = (perfiles ?? []).filter((p: any) => p.rol === ROL_MIXTO)
  const destino = mixtas.length ? mixtas : (perfiles ?? []).filter((p: any) => p.rol === 'asistente_ventas')
  if (!destino.length) return { ok: false, error: 'No hay asistente para asignarle el regalo' }

  const { data: c } = await supabase.from('contactos')
    .select('nombres, apellidos, cumple_dia, cumple_mes, cuenta_id, tipo_cuenta').eq('id', contactoId).maybeSingle()
  const nombre = c ? [c.nombres, c.apellidos].filter(Boolean).join(' ') || 'contacto' : 'contacto'
  let cuenta: string | null = null
  if (c?.cuenta_id) {
    const tabla = c.tipo_cuenta === 'agencia' ? 'agencias' : 'clientes'
    const { data: cu } = await supabase.from(tabla).select('nombre').eq('id', c.cuenta_id).maybeSingle()
    cuenta = (cu as any)?.nombre ?? null
  }
  const cumple = c?.cumple_dia && c?.cumple_mes ? `${c.cumple_dia} de ${MESES[c.cumple_mes - 1]}` : null
  const quien = solicitante.nombre || 'un vendedor'
  const descripcion = `Entregar regalo de cumpleaños a ${nombre}${cuenta ? ` (${cuenta})` : ''}${cumple ? ` — cumple el ${cumple}` : ''}. Lo pidió ${quien}.`

  const { error } = await supabase.from('tasks').insert({
    tipo: TIPO_TAREA_REGALO,
    asignado_a_rol: 'operaciones',
    asignado_a: destino[0].id,
    estado: 'pendiente',
    descripcion,
    fecha_limite: c?.cumple_dia && c?.cumple_mes ? proximoCumple(c.cumple_dia, c.cumple_mes) : null,
    regalo_id: regaloId,
  })
  // Sin la migración v52 la tarea no se puede crear: el regalo igual queda pedido.
  if (error) return { ok: false, error: error.message }

  await insertarNotificaciones(supabase, destino.map((p: any) => ({
    user_id: p.id,
    tipo: 'regalo_pedido',
    titulo: '🎁 Regalo para entregar',
    mensaje: `${nombre}${cuenta ? ` (${cuenta})` : ''}${cumple ? ` cumple el ${cumple}` : ''}. Lo pidió ${quien}.`,
    link: '/dashboard/tasks',
    entity_id: regaloId,
  })))
  return { ok: true }
}

/** El regalo se entregó (o no): su tarea queda lista. */
export async function cerrarTareaRegalo(supabase: SupabaseClient, regaloId: string) {
  try {
    await supabase.from('tasks')
      .update({ estado: 'completada', completed_at: new Date().toISOString() })
      .eq('regalo_id', regaloId).eq('tipo', TIPO_TAREA_REGALO).neq('estado', 'completada')
  } catch { /* sin la v52 no hay tarea */ }
}
