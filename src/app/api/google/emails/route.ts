import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAuthenticatedClient } from '@/lib/google/auth'
import { createServerClient } from '@/lib/supabase-server'
import { google } from 'googleapis'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

interface GmailHeader { name: string; value: string }

function getHeader(headers: GmailHeader[], name: string) {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function parseFrom(from: string) {
  const match = from.match(/^(.*?)\s*<(.+?)>$/)
  if (match) return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2] }
  return { name: '', email: from.trim() }
}

async function generateSuggestion(subject: string, snippet: string, fromName: string, fromEmail: string): Promise<string> {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 150,
    messages: [
      {
        role: 'user',
        content: `Sos asistente de un CRM de publicidad exterior (venta de espacios publicitarios en carteleras, buses y soportes urbanos en Argentina). Analizá este email y respondé SOLO con una sugerencia de acción concreta en español (máximo 2 oraciones). Si el email no es relevante para ventas o clientes, respondé exactamente: "Sin acción requerida."

De: ${fromName} <${fromEmail}>
Asunto: ${subject}
Resumen: ${snippet}`,
      },
    ],
  })
  return (msg.content[0] as { text: string }).text.trim()
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const perfilId = (session.user as { id: string }).id
  const authClient = await getAuthenticatedClient(perfilId)
  if (!authClient) return NextResponse.json({ error: 'Gmail no conectado' }, { status: 404 })

  const supabase = createServerClient()
  const gmail = google.gmail({ version: 'v1', auth: authClient })

  // Fetch last 20 messages from inbox
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    maxResults: 20,
    labelIds: ['INBOX'],
  })

  const messages = listRes.data.messages ?? []
  const results = []

  for (const msg of messages) {
    if (!msg.id) continue

    // Check if we already have a suggestion for this email
    const { data: existing } = await supabase
      .from('email_suggestions')
      .select('*')
      .eq('perfil_id', perfilId)
      .eq('gmail_message_id', msg.id)
      .maybeSingle()

    if (existing) {
      results.push(existing)
      continue
    }

    // Fetch email details
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Date'],
    })

    const headers = (detail.data.payload?.headers ?? []) as GmailHeader[]
    const subject = getHeader(headers, 'Subject')
    const rawFrom = getHeader(headers, 'From')
    const snippet = detail.data.snippet ?? ''
    const { name: fromName, email: fromEmail } = parseFrom(rawFrom)

    // Generate AI suggestion
    const suggestion = await generateSuggestion(subject, snippet, fromName, fromEmail)

    // Skip non-actionable emails
    if (suggestion === 'Sin acción requerida.') continue

    const { data: saved } = await supabase
      .from('email_suggestions')
      .insert({
        perfil_id: perfilId,
        gmail_message_id: msg.id,
        from_email: fromEmail,
        from_name: fromName,
        subject,
        snippet,
        suggestion,
      })
      .select()
      .single()

    if (saved) results.push(saved)
  }

  return NextResponse.json(results)
}
