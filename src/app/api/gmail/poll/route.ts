import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { fetchRecentMessages, refreshAccessToken } from '@/lib/gmail'
import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as { id: string }).id
  const supabase = createServerClient()

  // Get stored token
  const { data: tokenRow } = await supabase
    .from('google_tokens')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!tokenRow) return NextResponse.json({ connected: false, new: 0 })

  // Refresh if expired
  let accessToken = tokenRow.access_token
  if (new Date(tokenRow.expires_at) <= new Date()) {
    try {
      const refreshed = await refreshAccessToken(tokenRow.refresh_token)
      accessToken = refreshed.access_token
      await supabase.from('google_tokens').update({
        access_token: refreshed.access_token,
        expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId)
    } catch {
      return NextResponse.json({ connected: false, error: 'token_expired' })
    }
  }

  // Only look at emails from last 10 minutes (for polling)
  const since = new Date(Date.now() - 10 * 60 * 1000)
  const messages = await fetchRecentMessages(accessToken, 15, since)
  if (!messages.length) return NextResponse.json({ connected: true, new: 0 })

  // Get existing message IDs to skip already-processed ones
  const { data: existing } = await supabase
    .from('email_suggestions')
    .select('gmail_message_id')
    .in('gmail_message_id', messages.map(m => m.id))

  const existingIds = new Set((existing ?? []).map((e: { gmail_message_id: string }) => e.gmail_message_id))
  const newMessages = messages.filter(m => !existingIds.has(m.id))
  if (!newMessages.length) return NextResponse.json({ connected: true, new: 0 })

  // Load CRM context: clients + leads + orders for Claude to match against
  const [{ data: clientes }, { data: leads }, { data: ordenes }] = await Promise.all([
    supabase.from('clientes').select('id, nombre, empresa, email').limit(200),
    supabase.from('leads').select('id, descripcion, estado, cliente_id, clientes(nombre, empresa)').eq('estado', 'activo').limit(100),
    supabase.from('ordenes_venta').select('id, numero, estado, marca, cliente_id, clientes(nombre, empresa)').in('estado', ['en_negociacion', 'en_oic', 'aprobada']).limit(100),
  ])

  const crmContext = `
Clientes registrados:
${(clientes ?? []).map(c => `- ID:${c.id} | ${c.empresa || c.nombre} | email:${c.email ?? 'N/A'}`).join('\n')}

Leads activos:
${(leads ?? []).map(l => `- ID:${l.id} | ${(l.clientes as { nombre?: string; empresa?: string } | null)?.empresa ?? (l.clientes as { nombre?: string } | null)?.nombre} | ${l.descripcion}`).join('\n')}

Órdenes activas:
${(ordenes ?? []).map(o => `- ID:${o.id} | ORD-${o.numero} | ${(o.clientes as { nombre?: string; empresa?: string } | null)?.empresa ?? (o.clientes as { nombre?: string } | null)?.nombre} | estado:${o.estado}`).join('\n')}
`

  let newCount = 0
  for (const msg of newMessages) {
    try {
      const analysis = await analyzeEmail(msg, crmContext)
      if (!analysis) continue

      await supabase.from('email_suggestions').insert({
        user_id: userId,
        gmail_message_id: msg.id,
        gmail_thread_id: msg.threadId,
        from_email: msg.fromEmail,
        from_name: msg.from,
        subject: msg.subject,
        body_preview: msg.bodyText.slice(0, 400),
        received_at: msg.receivedAt,
        lead_id: analysis.lead_id ?? null,
        orden_id: analysis.orden_id ?? null,
        suggestion_type: analysis.type,
        suggestion_data: analysis.data,
        status: 'pending',
      })
      newCount++
    } catch {
      // Skip individual failures
    }
  }

  return NextResponse.json({ connected: true, new: newCount })
}

interface EmailAnalysis {
  type: 'update_lead' | 'new_lead' | 'arte_material' | 'follow_up' | 'info'
  lead_id: string | null
  orden_id: string | null
  data: Record<string, unknown>
}

async function analyzeEmail(
  msg: { from: string; fromEmail: string; subject: string; bodyText: string; receivedAt: string },
  crmContext: string
): Promise<EmailAnalysis | null> {
  const prompt = `Analizá este email en el contexto de un CRM de publicidad en buses y determiná si es relevante para algún cliente, lead u orden.

${crmContext}

Email recibido:
De: ${msg.from} <${msg.fromEmail}>
Asunto: ${msg.subject}
Fecha: ${msg.receivedAt}
Cuerpo: ${msg.bodyText}

Respondé en JSON con esta estructura exacta (sin texto adicional):
{
  "relevant": true/false,
  "type": "update_lead" | "new_lead" | "arte_material" | "follow_up" | "info",
  "lead_id": "uuid o null",
  "orden_id": "uuid o null",
  "summary": "resumen breve de la acción sugerida en español (máx 100 chars)",
  "suggested_action": "descripción de qué hacer (ej: actualizar fecha_alta_real a 2024-05-10)",
  "extracted_dates": ["YYYY-MM-DD", ...] o [],
  "extracted_amounts": [número, ...] o []
}

Si el email no es relevante para el CRM (spam, newsletters, emails personales sin relación comercial), devolvé {"relevant": false}.`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text.trim() : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  const parsed = JSON.parse(jsonMatch[0])
  if (!parsed.relevant) return null

  return {
    type: parsed.type ?? 'info',
    lead_id: parsed.lead_id ?? null,
    orden_id: parsed.orden_id ?? null,
    data: {
      summary: parsed.summary ?? '',
      suggested_action: parsed.suggested_action ?? '',
      extracted_dates: parsed.extracted_dates ?? [],
      extracted_amounts: parsed.extracted_amounts ?? [],
    },
  }
}
