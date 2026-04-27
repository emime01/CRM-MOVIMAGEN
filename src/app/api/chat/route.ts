import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const ROL_LABELS: Record<string, string> = {
  vendedor: 'Vendedor',
  asistente_ventas: 'Asistente de Ventas',
  gerente_comercial: 'Gerente Comercial',
  operaciones: 'Operaciones',
  arte: 'Arte',
  administracion: 'Administracion',
}

// ─── Tools ────────────────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'consultar_disponibilidad',
    description: 'Consulta disponibilidad de soportes publicitarios en un rango de fechas. Usar cuando el usuario pregunta qué está libre, reservado u ocupado, o qué hay disponible para determinadas fechas o tipos de soporte.',
    input_schema: {
      type: 'object' as const,
      properties: {
        fecha_desde: { type: 'string', description: 'Fecha inicio en formato YYYY-MM-DD' },
        fecha_hasta: { type: 'string', description: 'Fecha fin en formato YYYY-MM-DD' },
        filtro:      { type: 'string', description: 'Texto libre para filtrar por nombre/tipo/sección del soporte (ej: "LED", "bus", "lateral", "digital")' },
        solo_libres: { type: 'boolean', description: 'Si true, retorna solo los soportes libres en ese rango' },
      },
      required: ['fecha_desde', 'fecha_hasta'],
    },
  },
]

// ─── Tool executor ────────────────────────────────────────────────────────────

async function ejecutarDisponibilidad(input: {
  fecha_desde: string
  fecha_hasta: string
  filtro?: string
  solo_libres?: boolean
}): Promise<string> {
  const supabase = createServerClient()
  const { fecha_desde, fecha_hasta, filtro, solo_libres } = input

  const [{ data: soportes }, { data: ordenes }, { data: reservas }] = await Promise.all([
    supabase
      .from('soportes')
      .select('id, nombre, tipo, seccion, ubicacion')
      .eq('activo', true)
      .order('seccion').order('nombre'),
    supabase
      .from('ordenes_venta')
      .select('id, fecha_alta_prevista, fecha_baja_prevista, clientes(nombre, empresa), orden_items(soporte_id)')
      .in('estado', ['aprobada', 'en_oic', 'facturada', 'cobrada'])
      .lte('fecha_alta_prevista', fecha_hasta)
      .gte('fecha_baja_prevista', fecha_desde),
    supabase
      .from('reservas')
      .select('id, soporte_id, fecha_desde, fecha_hasta, estado, clientes(nombre, empresa)')
      .in('estado', ['pendiente', 'aprobada', 'confirmada'])
      .lte('fecha_desde', fecha_hasta)
      .gte('fecha_hasta', fecha_desde),
  ])

  const ocupadoMap = new Map<string, { cliente: string | null; desde: string; hasta: string }>()
  const reservadoMap = new Map<string, { cliente: string | null; desde: string; hasta: string }>()

  ordenes?.forEach((ord: any) => {
    const cli = Array.isArray(ord.clientes) ? ord.clientes[0] : ord.clientes
    const nombre = cli?.empresa ?? cli?.nombre ?? null
    ;(ord.orden_items ?? []).forEach((item: any) => {
      if (item.soporte_id && !ocupadoMap.has(item.soporte_id))
        ocupadoMap.set(item.soporte_id, { cliente: nombre, desde: ord.fecha_alta_prevista, hasta: ord.fecha_baja_prevista })
    })
  })

  reservas?.forEach((r: any) => {
    if (!r.soporte_id || ocupadoMap.has(r.soporte_id) || reservadoMap.has(r.soporte_id)) return
    const cli = Array.isArray(r.clientes) ? r.clientes[0] : r.clientes
    reservadoMap.set(r.soporte_id, { cliente: cli?.empresa ?? cli?.nombre ?? null, desde: r.fecha_desde, hasta: r.fecha_hasta })
  })

  type Row = { id: string; nombre: string; tipo: string | null; seccion: string | null; ubicacion: string | null }
  let rows: Row[] = (soportes ?? []) as Row[]

  if (filtro) {
    const q = filtro.toLowerCase()
    rows = rows.filter(s =>
      s.nombre.toLowerCase().includes(q) ||
      (s.tipo ?? '').toLowerCase().includes(q) ||
      (s.seccion ?? '').toLowerCase().includes(q) ||
      (s.ubicacion ?? '').toLowerCase().includes(q)
    )
  }

  const libres: string[]     = []
  const reservados: string[] = []
  const ocupados: string[]   = []

  rows.forEach(s => {
    const loc = [s.seccion, s.ubicacion].filter(Boolean).join(' - ')
    const label = `${s.nombre}${loc ? ` (${loc})` : ''}`
    if (ocupadoMap.has(s.id)) {
      const o = ocupadoMap.get(s.id)!
      ocupados.push(`${label} — ocupado por ${o.cliente ?? 'cliente'} del ${o.desde} al ${o.hasta}`)
    } else if (reservadoMap.has(s.id)) {
      const r = reservadoMap.get(s.id)!
      reservados.push(`${label} — reservado para ${r.cliente ?? 'cliente'} del ${r.desde} al ${r.hasta}`)
    } else {
      libres.push(label)
    }
  })

  if (solo_libres) {
    if (libres.length === 0) return `No hay soportes libres${filtro ? ` que coincidan con "${filtro}"` : ''} del ${fecha_desde} al ${fecha_hasta}.`
    return `Soportes LIBRES del ${fecha_desde} al ${fecha_hasta}${filtro ? ` (filtro: "${filtro}")` : ''} — ${libres.length} disponibles:\n${libres.map(l => `- ${l}`).join('\n')}`
  }

  const sections: string[] = [`Disponibilidad del ${fecha_desde} al ${fecha_hasta}${filtro ? ` (filtro: "${filtro}")` : ''}:`]
  if (libres.length > 0)     sections.push(`\nLIBRES (${libres.length}):\n${libres.map(l => `- ${l}`).join('\n')}`)
  if (reservados.length > 0) sections.push(`\nRESERVADOS (${reservados.length}):\n${reservados.map(l => `- ${l}`).join('\n')}`)
  if (ocupados.length > 0)   sections.push(`\nOCUPADOS (${ocupados.length}):\n${ocupados.map(l => `- ${l}`).join('\n')}`)
  if (libres.length + reservados.length + ocupados.length === 0)
    sections.push('\nNo se encontraron soportes con ese filtro.')

  return sections.join('')
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messages, userName, userRol } = await req.json()
  if (!Array.isArray(messages) || messages.length === 0)
    return NextResponse.json({ error: 'messages requerido' }, { status: 400 })

  const today = new Date().toISOString().slice(0, 10)

  const systemPrompt = `Sos Movi, asistente de IA del CRM de Movimagen, empresa de publicidad exterior (via publica) en Uruguay.
Estas hablando con ${userName || 'el equipo'} (${ROL_LABELS[userRol] ?? userRol}).
Hoy es ${today}.

Tenes acceso a datos reales del sistema. Cuando el usuario pregunte por disponibilidad, fechas libres u ocupadas — SIEMPRE usa la herramienta consultar_disponibilidad antes de responder. No respondas de memoria para preguntas de disponibilidad.

Respondé en espanol rioplatense. Se conciso y util. Si el usuario da fechas en formato dd/mm, convertelas a YYYY-MM-DD antes de llamar la herramienta.`

  try {
    const claudeMessages: Anthropic.MessageParam[] = messages.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    // First call — Claude may decide to use a tool
    const first = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      tools: TOOLS,
      messages: claudeMessages,
    })

    // If Claude used a tool, execute it and do a second call
    if (first.stop_reason === 'tool_use') {
      const toolUseBlock = first.content.find(b => b.type === 'tool_use') as Anthropic.ToolUseBlock
      let toolResult = ''

      if (toolUseBlock.name === 'consultar_disponibilidad') {
        toolResult = await ejecutarDisponibilidad(toolUseBlock.input as Parameters<typeof ejecutarDisponibilidad>[0])
      }

      const second = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        tools: TOOLS,
        messages: [
          ...claudeMessages,
          { role: 'assistant', content: first.content },
          {
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: toolUseBlock.id,
              content: toolResult,
            }],
          },
        ],
      })

      const text = second.content
        .filter(b => b.type === 'text')
        .map(b => (b as Anthropic.TextBlock).text)
        .join('\n')

      return NextResponse.json({ text })
    }

    // No tool call — return directly
    const text = first.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('\n')

    return NextResponse.json({ text })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
