import nodemailer from 'nodemailer'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Mails del CRM (recordatorios de cobranza, resumen diario).
 *
 * Por SMTP: con Google Workspace, una cuenta del dominio (por ejemplo
 * notificaciones@movimagen.com.uy) y una contraseña de aplicación. Se
 * configura con estas variables en Vercel:
 *
 *   SMTP_HOST=smtp.gmail.com  SMTP_PORT=465
 *   SMTP_USER=notificaciones@movimagen.com.uy  SMTP_PASS=<contraseña de app>
 *   MAIL_FROM="Movimagen CRM <notificaciones@movimagen.com.uy>"
 *
 * Sin configurar, no se manda nada (las notificaciones del CRM igual salen).
 */
export function mailConfigurado(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

let transporte: nodemailer.Transporter | null = null
function smtp(): nodemailer.Transporter {
  if (!transporte) {
    const port = Number(process.env.SMTP_PORT ?? 465)
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  }
  return transporte
}

export async function enviarMail(para: string, asunto: string, html: string): Promise<boolean> {
  if (!mailConfigurado() || !para) return false
  try {
    await smtp().sendMail({ from: process.env.MAIL_FROM ?? process.env.SMTP_USER, to: para, subject: asunto, html })
    return true
  } catch (e) {
    console.error('No se pudo mandar el mail a', para, e)
    return false
  }
}

/** Mail de cada perfil (el de su cuenta de acceso). */
export async function mailsDePerfiles(supabase: SupabaseClient): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const { data: perfiles } = await supabase.from('perfiles').select('id, user_id').eq('activo', true)
  const porUser = new Map((perfiles ?? []).map((p: any) => [p.user_id, p.id]))
  for (let page = 1; page < 20; page++) {
    const { data } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    const users = data?.users ?? []
    for (const u of users) {
      const pid = porUser.get(u.id)
      // Los usuarios de prueba no reciben mails.
      if (pid && u.email && !u.email.endsWith('@prueba.movimagen.uy')) out.set(pid as string, u.email)
    }
    if (users.length < 200) break
  }
  return out
}

/** Plantilla simple con el naranja de la marca. */
export function plantillaMail(titulo: string, cuerpo: string, linkCrm?: string): string {
  return `<div style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;color:#1a1915">
  <div style="background:#ec691a;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0;font-size:18px;font-weight:700">${titulo}</div>
  <div style="border:1px solid #e5e3dc;border-top:none;padding:18px 20px;border-radius:0 0 10px 10px;font-size:14px;line-height:1.5">
    ${cuerpo}
    ${linkCrm ? `<p style="margin-top:18px"><a href="${linkCrm}" style="background:#ec691a;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none;font-weight:600">Abrir en el CRM</a></p>` : ''}
  </div>
  <p style="font-size:11px;color:#9a9895;text-align:center">Movimagen CRM · mensaje automático</p>
</div>`
}
