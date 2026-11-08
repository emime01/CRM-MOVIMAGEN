import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'

/**
 * Avisos push al celular (app instalada o navegador con permiso). Necesita
 * las claves VAPID en Vercel: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y
 * VAPID_SUBJECT (mailto:...). Sin ellas, o sin la tabla push_suscripciones
 * (migración v48), no manda nada y el CRM sigue igual.
 */
export function pushConfigurado(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

let listo = false
function configurar() {
  if (listo) return
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:info@movimagen.com.uy',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  )
  listo = true
}

export interface AvisoPush {
  titulo: string
  mensaje?: string | null
  link?: string | null
  /** Agrupa avisos del mismo tema: uno nuevo reemplaza al anterior. */
  tag?: string | null
}

/** Manda el aviso a todos los dispositivos de esas personas. */
export async function enviarPush(supabase: SupabaseClient, perfilIds: string[], aviso: AvisoPush): Promise<void> {
  const ids = Array.from(new Set(perfilIds.filter(Boolean)))
  if (!ids.length || !pushConfigurado()) return
  const { data: subs, error } = await supabase
    .from('push_suscripciones').select('id, endpoint, p256dh, auth').in('perfil_id', ids)
  if (error || !subs?.length) return
  configurar()
  const payload = JSON.stringify({
    title: aviso.titulo,
    body: aviso.mensaje ?? '',
    url: aviso.link || '/dashboard',
    tag: aviso.tag ?? undefined,
  })
  const vencidas: string[] = []
  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 })
    } catch (e: any) {
      // 404/410: el celular dio de baja la suscripción (desinstaló, borró datos).
      if (e?.statusCode === 404 || e?.statusCode === 410) vencidas.push(s.id)
    }
  }))
  if (vencidas.length) await supabase.from('push_suscripciones').delete().in('id', vencidas)
}
