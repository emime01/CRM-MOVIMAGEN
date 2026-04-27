import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const ROL_LABELS: Record<string, string> = {
  vendedor: 'Vendedor',
  asistente_ventas: 'Asistente de Ventas',
  gerente_comercial: 'Gerente Comercial',
  operaciones: 'Operaciones',
  arte: 'Arte',
  administracion: 'Administracion',
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messages, userName, userRol } = await req.json()
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'messages requerido' }, { status: 400 })
  }

  const systemPrompt = `Sos Movi, el asistente de IA del CRM de Movimagen, empresa de publicidad exterior (via publica) en Uruguay.

Estas hablando con ${userName || 'el equipo'} (${ROL_LABELS[userRol] ?? userRol}).

Tu rol:
- Ayudar con el uso del CRM: ventas, ordenes, clientes, leads, disponibilidad, registros, buses, comprobantes
- Responder preguntas sobre publicidad OOH, estrategias de venta y gestion de campanas
- Dar recomendaciones practicas y concretas adaptadas al rol del usuario
- Si el usuario es vendedor, priorizar tips de cierre y seguimiento
- Si es operaciones, priorizar registros, buses y comprobantes
- Si es gerente, priorizar metricas y equipo

Respondé siempre en espanol rioplatense. Se conciso — maximo 3-4 parrafos. Si no tenes datos especificos de la empresa (numeros reales, clientes especificos), decilo y da una guia general.`

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    })

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('\n')

    return NextResponse.json({ text })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
