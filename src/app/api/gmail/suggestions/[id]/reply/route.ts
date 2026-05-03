import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// POST /api/gmail/suggestions/[id]/reply
// Genera un borrador de respuesta para el email asociado a la sugerencia.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as { id: string }).id
  const userName = session.user.name ?? 'Equipo Movimagen'

  const supabase = createServerClient()
  const { data: suggestion } = await supabase
    .from('email_suggestions')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', userId)
    .single()

  if (!suggestion) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const prompt = `Sos un vendedor de Movimagen, una empresa de publicidad exterior (carteleras, buses y soportes urbanos en Argentina). Recibiste este email y necesitás redactar una respuesta profesional, cordial y concreta en español rioplatense.

Email recibido:
De: ${suggestion.from_name || ''} <${suggestion.from_email || ''}>
Asunto: ${suggestion.subject || ''}
Cuerpo:
${suggestion.body_preview || ''}

Redactá la respuesta directa, sin saludos largos. Empezá con "Hola${suggestion.from_name ? ' ' + suggestion.from_name.split(' ')[0] : ''},". Cerrá con "Saludos,\n${userName}". Devolvé SOLO el texto de la respuesta, sin "Asunto:" ni meta-explicaciones.`

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  })

  const draft = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

  return NextResponse.json({
    draft,
    subject: suggestion.subject?.startsWith('Re:') ? suggestion.subject : `Re: ${suggestion.subject ?? ''}`,
    to: suggestion.from_email,
  })
}
