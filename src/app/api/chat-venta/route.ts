import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const FILL_TOOL: Anthropic.Tool = {
  name: 'fill_sale_fields',
  description: 'Completa los campos de la orden de venta con la información detectada en el mensaje del usuario.',
  input_schema: {
    type: 'object' as const,
    properties: {
      clienteId: {
        type: 'string',
        description: 'ID del cliente (de la lista provista). Usar el ID exacto.',
      },
      agenciaId: {
        type: 'string',
        description: 'ID de la agencia (de la lista provista), si se menciona alguna.',
      },
      contacto: {
        type: 'string',
        description: 'Nombre del contacto.',
      },
      marca: {
        type: 'string',
        description: 'Nombre de la marca o campaña.',
      },
      moneda: {
        type: 'string',
        enum: ['USD', 'UYU'],
        description: 'Moneda de la orden. USD por defecto si no se especifica.',
      },
      fechaAltaPrevista: {
        type: 'string',
        description: 'Fecha de inicio en formato YYYY-MM-DD.',
      },
      fechaBajaPrevista: {
        type: 'string',
        description: 'Fecha de fin en formato YYYY-MM-DD.',
      },
      items: {
        type: 'array',
        description: 'Líneas de productos de la orden.',
        items: {
          type: 'object',
          properties: {
            soporteId: {
              type: 'string',
              description: 'ID del soporte (de la lista provista). Usar el ID exacto.',
            },
            cantidad: {
              type: 'number',
              description: 'Cantidad de unidades.',
            },
            semanas: {
              type: 'number',
              description: 'Cantidad de semanas de arrendamiento.',
            },
            precioUnitario: {
              type: 'number',
              description: 'Precio unitario semanal.',
            },
            descuentoPct: {
              type: 'number',
              description: 'Porcentaje de descuento (0-100).',
            },
            nota: {
              type: 'string',
              description: 'Nota o comentario para esta línea.',
            },
          },
          required: ['soporteId'],
        },
      },
    },
  },
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messages, clientes, agencias, soportes } = await req.json()

  const systemPrompt = `Sos un asistente de CRM para una empresa de publicidad exterior (vía pública).
Tu tarea es ayudar al usuario a completar una orden de venta interpretando su descripción en lenguaje natural.

Cuando el usuario describa una venta, usá la herramienta fill_sale_fields para completar los campos detectados.
Respondé siempre en español. Sé conciso y confirmá qué campos completaste.

CLIENTES DISPONIBLES:
${(clientes ?? []).map((c: { id: string; nombre: string; empresa?: string }) => `- ID: ${c.id} | Nombre: ${c.nombre}${c.empresa ? ` (${c.empresa})` : ''}`).join('\n')}

AGENCIAS DISPONIBLES:
${(agencias ?? []).map((a: { id: string; nombre: string }) => `- ID: ${a.id} | Nombre: ${a.nombre}`).join('\n')}

SOPORTES DISPONIBLES:
${(soportes ?? []).map((s: { id: string; nombre: string; categoria?: string; precio_semanal?: number; precio_base?: number }) => `- ID: ${s.id} | Nombre: ${s.nombre}${s.categoria ? ` [${s.categoria}]` : ''}${s.precio_semanal ? ` | Precio/sem: ${s.precio_semanal}` : s.precio_base ? ` | Precio base: ${s.precio_base}` : ''}`).join('\n')}

Instrucciones para interpretar fechas:
- Si el usuario dice "del 1 al 30 de mayo", usá fechaAltaPrevista: "2026-05-01" y fechaBajaPrevista: "2026-05-30".
- Si menciona semanas (ej: "4 semanas desde el 1 de junio"), calculá la fecha de baja.
- La fecha actual es ${new Date().toISOString().slice(0, 10)}.`

  try {
    const response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 2048,
      system: systemPrompt,
      tools: [FILL_TOOL],
      messages,
    })

    const textBlocks = response.content.filter(b => b.type === 'text').map(b => (b as Anthropic.TextBlock).text)
    const toolUseBlocks = response.content.filter(b => b.type === 'tool_use')

    const toolInputs = toolUseBlocks.map(b => (b as Anthropic.ToolUseBlock).input)

    return NextResponse.json({
      text: textBlocks.join('\n'),
      fields: toolInputs.length > 0 ? toolInputs[0] : null,
      stop_reason: response.stop_reason,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error calling AI'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
