import type { SupabaseClient } from '@supabase/supabase-js'
import { enviarPush } from '@/lib/push/enviar'

export interface NuevaNotificacion {
  user_id: string
  tipo: string
  titulo: string
  mensaje?: string | null
  link?: string | null
  entity_id?: string | null
}

/**
 * Crea notificaciones del CRM (la campanita) y las manda también como aviso
 * push al celular de cada destinatario. Todos los avisos del CRM pasan por
 * acá, así ninguno queda sólo en la campanita.
 */
export async function insertarNotificaciones(
  supabase: SupabaseClient,
  filas: NuevaNotificacion | NuevaNotificacion[],
) {
  const lista = Array.isArray(filas) ? filas : [filas]
  if (!lista.length) return { error: null }
  const r = await supabase.from('notificaciones').insert(lista)
  if (!r.error) {
    // Un aviso por persona y texto (no se bloquea la respuesta si falla).
    await Promise.all(lista.map(n => enviarPush(supabase, [n.user_id], {
      titulo: n.titulo, mensaje: n.mensaje, link: n.link,
      tag: n.entity_id ? `${n.tipo}:${n.entity_id}` : n.tipo,
    }).catch(() => {})))
  }
  return r
}
