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

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'consultar_disponibilidad',
    description: 'Consulta disponibilidad de soportes publicitarios en un rango de fechas. Usar cuando el usuario pregunta qué está libre, reservado u ocupado, o qué hay disponible para determinadas fechas.',
    input_schema: {
      type: 'object' as const,
      properties: {
        fecha_desde:  { type: 'string',  description: 'Fecha inicio YYYY-MM-DD' },
        fecha_hasta:  { type: 'string',  description: 'Fecha fin YYYY-MM-DD' },
        filtro:       { type: 'string',  description: 'Texto libre para filtrar por nombre/tipo/sección (ej: "LED", "bus", "lateral", "digital")' },
        solo_libres:  { type: 'boolean', description: 'Si true, retorna solo soportes libres' },
      },
      required: ['fecha_desde', 'fecha_hasta'],
    },
  },
  {
    name: 'consultar_ordenes',
    description: 'Consulta órdenes de venta. Usar para preguntas sobre ventas cerradas, en proceso, pendientes de aprobación, o historial de un cliente.',
    input_schema: {
      type: 'object' as const,
      properties: {
        estado:       { type: 'string', description: 'Estado a filtrar: borrador, enviada, aprobada, en_oic, facturada, cobrada, rechazada, cancelada. Omitir para todos.' },
        fecha_desde:  { type: 'string', description: 'Filtrar órdenes creadas desde esta fecha YYYY-MM-DD' },
        fecha_hasta:  { type: 'string', description: 'Filtrar órdenes creadas hasta esta fecha YYYY-MM-DD' },
        cliente:      { type: 'string', description: 'Texto para buscar por nombre de cliente o empresa' },
        limite:       { type: 'number', description: 'Máximo de resultados a retornar (default 20)' },
      },
      required: [],
    },
  },
  {
    name: 'consultar_leads',
    description: 'Consulta leads/oportunidades de venta. Útil para preguntas sobre seguimiento, leads sin gestionar, oportunidades pendientes o potencial comercial.',
    input_schema: {
      type: 'object' as const,
      properties: {
        estado:              { type: 'string', description: 'Estado del lead: nuevo, en_proceso, ganado, perdido. Omitir para todos activos.' },
        sin_gestion_dias:    { type: 'number', description: 'Mostrar leads cuya proxima_gestion es anterior a hace N días (sin seguimiento reciente).' },
        cliente:             { type: 'string', description: 'Filtrar por nombre de cliente o empresa' },
      },
      required: [],
    },
  },
  {
    name: 'buscar_cliente',
    description: 'Busca un cliente por nombre y retorna su información, historial de órdenes recientes y datos de contacto.',
    input_schema: {
      type: 'object' as const,
      properties: {
        nombre: { type: 'string', description: 'Nombre o empresa del cliente a buscar (búsqueda parcial)' },
      },
      required: ['nombre'],
    },
  },
  {
    name: 'resumen_ventas',
    description: 'Genera un resumen de ventas con totales, comparativas y ranking de vendedores para un período dado.',
    input_schema: {
      type: 'object' as const,
      properties: {
        fecha_desde:  { type: 'string', description: 'Inicio del período YYYY-MM-DD' },
        fecha_hasta:  { type: 'string', description: 'Fin del período YYYY-MM-DD' },
        agrupar_por:  { type: 'string', description: 'Agrupar resultados: "vendedor" o "mes". Omitir para total general.' },
      },
      required: ['fecha_desde', 'fecha_hasta'],
    },
  },
  {
    name: 'consultar_deudores',
    description: 'Lista órdenes facturadas que aún no fueron cobradas. Útil para administración y seguimiento de cobranza.',
    input_schema: {
      type: 'object' as const,
      properties: {
        dias_minimo: { type: 'number', description: 'Mostrar solo deudas de más de N días. Default 0 (todas).' },
      },
      required: [],
    },
  },
  {
    name: 'estado_registros',
    description: 'Muestra reservas activas (confirmadas/aprobadas) que todavía no tienen registros fotográficos o de video subidos. Útil para operaciones.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
]

// ─── Tool executors ───────────────────────────────────────────────────────────

async function runDisponibilidad(supabase: ReturnType<typeof createServerClient>, input: {
  fecha_desde: string; fecha_hasta: string; filtro?: string; solo_libres?: boolean
}): Promise<string> {
  const { fecha_desde, fecha_hasta, filtro, solo_libres } = input

  const [{ data: soportes }, { data: ordenes }, { data: reservas }] = await Promise.all([
    supabase.from('soportes').select('id, nombre, tipo, seccion, ubicacion').eq('activo', true).order('seccion').order('nombre'),
    supabase.from('ordenes_venta')
      .select('id, fecha_alta_prevista, fecha_baja_prevista, clientes(nombre, empresa), orden_items(soporte_id)')
      .in('estado', ['aprobada', 'en_oic', 'facturada', 'cobrada'])
      .lte('fecha_alta_prevista', fecha_hasta).gte('fecha_baja_prevista', fecha_desde),
    supabase.from('reservas')
      .select('id, soporte_id, fecha_desde, fecha_hasta, clientes(nombre, empresa)')
      .in('estado', ['pendiente', 'aprobada', 'confirmada'])
      .lte('fecha_desde', fecha_hasta).gte('fecha_hasta', fecha_desde),
  ])

  const ocupado = new Map<string, { cliente: string | null; desde: string; hasta: string }>()
  const reservado = new Map<string, { cliente: string | null; desde: string; hasta: string }>()

  ordenes?.forEach((o: any) => {
    const cli = Array.isArray(o.clientes) ? o.clientes[0] : o.clientes
    ;(o.orden_items ?? []).forEach((it: any) => {
      if (it.soporte_id && !ocupado.has(it.soporte_id))
        ocupado.set(it.soporte_id, { cliente: cli?.empresa ?? cli?.nombre ?? null, desde: o.fecha_alta_prevista, hasta: o.fecha_baja_prevista })
    })
  })
  reservas?.forEach((r: any) => {
    if (!r.soporte_id || ocupado.has(r.soporte_id) || reservado.has(r.soporte_id)) return
    const cli = Array.isArray(r.clientes) ? r.clientes[0] : r.clientes
    reservado.set(r.soporte_id, { cliente: cli?.empresa ?? cli?.nombre ?? null, desde: r.fecha_desde, hasta: r.fecha_hasta })
  })

  let rows = (soportes ?? []) as any[]
  if (filtro) {
    const q = filtro.toLowerCase()
    rows = rows.filter((s: any) => [s.nombre, s.tipo, s.seccion, s.ubicacion].some(v => v?.toLowerCase().includes(q)))
  }

  const libres: string[] = [], reservados: string[] = [], ocupados: string[] = []
  rows.forEach((s: any) => {
    const loc = [s.seccion, s.ubicacion].filter(Boolean).join(' - ')
    const lbl = `${s.nombre}${loc ? ` (${loc})` : ''}`
    if (ocupado.has(s.id)) {
      const o = ocupado.get(s.id)!
      ocupados.push(`${lbl} — ocupado por ${o.cliente ?? 'cliente'} del ${o.desde} al ${o.hasta}`)
    } else if (reservado.has(s.id)) {
      const r = reservado.get(s.id)!
      reservados.push(`${lbl} — reservado para ${r.cliente ?? 'cliente'} del ${r.desde} al ${r.hasta}`)
    } else {
      libres.push(lbl)
    }
  })

  if (solo_libres) {
    if (!libres.length) return `No hay soportes libres${filtro ? ` con "${filtro}"` : ''} del ${fecha_desde} al ${fecha_hasta}.`
    return `LIBRES (${libres.length}) del ${fecha_desde} al ${fecha_hasta}${filtro ? ` — filtro: "${filtro}"` : ''}:\n${libres.map(l => `- ${l}`).join('\n')}`
  }

  const out = [`Disponibilidad del ${fecha_desde} al ${fecha_hasta}${filtro ? ` (filtro: "${filtro}")` : ''}:`]
  if (libres.length)     out.push(`\nLIBRES (${libres.length}):\n${libres.map(l => `- ${l}`).join('\n')}`)
  if (reservados.length) out.push(`\nRESERVADOS (${reservados.length}):\n${reservados.map(l => `- ${l}`).join('\n')}`)
  if (ocupados.length)   out.push(`\nOCUPADOS (${ocupados.length}):\n${ocupados.map(l => `- ${l}`).join('\n')}`)
  if (!libres.length && !reservados.length && !ocupados.length) out.push('\nNo se encontraron soportes.')
  return out.join('')
}

async function runOrdenes(supabase: ReturnType<typeof createServerClient>, userId: string, rol: string, input: {
  estado?: string; fecha_desde?: string; fecha_hasta?: string; cliente?: string; limite?: number
}): Promise<string> {
  const { estado, fecha_desde, fecha_hasta, cliente, limite = 20 } = input
  const esVendedor = ['vendedor', 'asistente_ventas'].includes(rol)

  let q = supabase.from('ordenes_venta')
    .select('id, numero, estado, monto_total, moneda, fecha_alta_prevista, fecha_baja_prevista, created_at, clientes(nombre, empresa), perfiles!ordenes_venta_vendedor_id_fkey(nombre)')
    .order('created_at', { ascending: false })
    .limit(limite)

  if (esVendedor) q = q.eq('vendedor_id', userId) as typeof q
  if (estado) q = q.eq('estado', estado) as typeof q
  if (fecha_desde) q = q.gte('created_at', fecha_desde) as typeof q
  if (fecha_hasta) q = q.lte('created_at', fecha_hasta + 'T23:59:59') as typeof q

  const { data: ordenes } = await q

  let rows = (ordenes ?? []) as any[]
  if (cliente) {
    const q2 = cliente.toLowerCase()
    rows = rows.filter((o: any) => {
      const cli = Array.isArray(o.clientes) ? o.clientes[0] : o.clientes
      return (cli?.empresa ?? cli?.nombre ?? '').toLowerCase().includes(q2)
    })
  }

  if (!rows.length) return 'No se encontraron órdenes con esos filtros.'

  const fmt = (n: number, mon: string) => `${mon === 'USD' ? 'U$S' : '$'} ${n.toLocaleString('es-UY', { maximumFractionDigits: 0 })}`
  const estadoLabels: Record<string, string> = {
    borrador: 'Borrador', enviada: 'Enviada', aprobada: 'Aprobada',
    en_oic: 'En OIC', facturada: 'Facturada', cobrada: 'Cobrada',
    rechazada: 'Rechazada', cancelada: 'Cancelada',
  }

  const lines = rows.map((o: any) => {
    const cli = Array.isArray(o.clientes) ? o.clientes[0] : o.clientes
    const vend = Array.isArray(o.perfiles) ? o.perfiles[0] : o.perfiles
    const nombre = cli?.empresa ?? cli?.nombre ?? 'Sin cliente'
    const monto = fmt(Number(o.monto_total ?? 0), o.moneda ?? 'UYU')
    const est = estadoLabels[o.estado] ?? o.estado
    const fecha = o.fecha_alta_prevista ? `${o.fecha_alta_prevista} → ${o.fecha_baja_prevista}` : '—'
    const vendNombre = vend?.nombre ? ` | ${vend.nombre}` : ''
    return `- #${o.numero ?? o.id.slice(0, 6)} | ${nombre} | ${monto} | ${est} | ${fecha}${vendNombre}`
  })

  const total = rows.reduce((s: number, o: any) => s + Number(o.monto_total ?? 0), 0)
  return `Órdenes encontradas: ${rows.length}\n${lines.join('\n')}\n\nTotal: ${fmt(total, rows[0]?.moneda ?? 'UYU')}`
}

async function runLeads(supabase: ReturnType<typeof createServerClient>, userId: string, rol: string, input: {
  estado?: string; sin_gestion_dias?: number; cliente?: string
}): Promise<string> {
  const { estado, sin_gestion_dias, cliente } = input
  const esVendedor = ['vendedor', 'asistente_ventas'].includes(rol)

  let q = supabase.from('leads')
    .select('id, descripcion, monto_potencial, estado, proxima_gestion, nota_gestion, created_at, clientes(nombre, empresa), perfiles!leads_vendedor_id_fkey(nombre)')
    .order('created_at', { ascending: false })
    .limit(50)

  if (esVendedor) q = q.eq('vendedor_id', userId) as typeof q
  if (estado) q = q.eq('estado', estado) as typeof q
  else q = q.in('estado', ['nuevo', 'en_proceso']) as typeof q

  const { data: leads } = await q

  let rows = (leads ?? []) as any[]

  if (cliente) {
    const q2 = cliente.toLowerCase()
    rows = rows.filter((l: any) => {
      const cli = Array.isArray(l.clientes) ? l.clientes[0] : l.clientes
      return (cli?.empresa ?? cli?.nombre ?? '').toLowerCase().includes(q2)
    })
  }

  if (sin_gestion_dias !== undefined) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - sin_gestion_dias)
    rows = rows.filter((l: any) => !l.proxima_gestion || new Date(l.proxima_gestion) < cutoff)
  }

  if (!rows.length) return 'No se encontraron leads con esos filtros.'

  const fmt = (n: number) => n ? `U$S ${n.toLocaleString('es-UY', { maximumFractionDigits: 0 })}` : '—'
  const lines = rows.map((l: any) => {
    const cli = Array.isArray(l.clientes) ? l.clientes[0] : l.clientes
    const vend = Array.isArray(l.perfiles) ? l.perfiles[0] : l.perfiles
    const nombre = cli?.empresa ?? cli?.nombre ?? 'Sin cliente'
    const prox = l.proxima_gestion ? `próx. gestión: ${l.proxima_gestion}` : 'sin fecha de gestión'
    const nota = l.nota_gestion ? ` | nota: ${l.nota_gestion}` : ''
    const vendNombre = vend?.nombre ? ` | ${vend.nombre}` : ''
    return `- ${nombre} | ${l.estado} | ${fmt(l.monto_potencial)} | ${prox}${nota}${vendNombre}`
  })

  return `Leads encontrados: ${rows.length}\n${lines.join('\n')}`
}

async function runBuscarCliente(supabase: ReturnType<typeof createServerClient>, input: { nombre: string }): Promise<string> {
  const q = input.nombre.toLowerCase()

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nombre, empresa, email, telefono, notas, tipo_cliente, vendedor_id, perfiles!clientes_vendedor_id_fkey(nombre)')
    .eq('activo', true)
    .limit(5)

  const matches = (clientes ?? []).filter((c: any) =>
    (c.nombre ?? '').toLowerCase().includes(q) || (c.empresa ?? '').toLowerCase().includes(q)
  ) as any[]

  if (!matches.length) return `No se encontró ningún cliente que coincida con "${input.nombre}".`

  const results: string[] = []
  for (const c of matches.slice(0, 3)) {
    const vend = Array.isArray(c.perfiles) ? c.perfiles[0] : c.perfiles
    const { data: ordenes } = await supabase
      .from('ordenes_venta')
      .select('id, numero, estado, monto_total, moneda, created_at')
      .eq('cliente_id', c.id)
      .order('created_at', { ascending: false })
      .limit(5)

    const totalRevenue = (ordenes ?? [])
      .filter((o: any) => ['aprobada', 'en_oic', 'facturada', 'cobrada'].includes(o.estado))
      .reduce((s: number, o: any) => s + Number(o.monto_total ?? 0), 0)

    const ordenesStr = (ordenes ?? []).length > 0
      ? (ordenes as any[]).map((o: any) => `  · #${o.numero ?? o.id.slice(0,6)} | ${o.estado} | $${Number(o.monto_total ?? 0).toLocaleString('es-UY', { maximumFractionDigits: 0 })}`).join('\n')
      : '  Sin órdenes recientes'

    results.push(
      `**${c.empresa ?? c.nombre}**\n` +
      `Tipo: ${c.tipo_cliente ?? '—'} | Vendedor: ${vend?.nombre ?? '—'}\n` +
      `Email: ${c.email ?? '—'} | Tel: ${c.telefono ?? '—'}\n` +
      `Revenue total (activas): $${totalRevenue.toLocaleString('es-UY', { maximumFractionDigits: 0 })}\n` +
      `Últimas órdenes:\n${ordenesStr}`
    )
  }

  return results.join('\n\n---\n\n')
}

async function runResumenVentas(supabase: ReturnType<typeof createServerClient>, userId: string, rol: string, input: {
  fecha_desde: string; fecha_hasta: string; agrupar_por?: string
}): Promise<string> {
  const { fecha_desde, fecha_hasta, agrupar_por } = input
  const esVendedor = ['vendedor', 'asistente_ventas'].includes(rol)

  let q = supabase.from('ordenes_venta')
    .select('id, estado, monto_total, moneda, created_at, perfiles!ordenes_venta_vendedor_id_fkey(nombre)')
    .in('estado', ['aprobada', 'en_oic', 'facturada', 'cobrada'])
    .gte('created_at', fecha_desde)
    .lte('created_at', fecha_hasta + 'T23:59:59')

  if (esVendedor) q = q.eq('vendedor_id', userId) as typeof q

  const { data: ordenes } = await q
  const rows = (ordenes ?? []) as any[]

  if (!rows.length) return `Sin ventas registradas del ${fecha_desde} al ${fecha_hasta}.`

  const total = rows.reduce((s: number, o: any) => s + Number(o.monto_total ?? 0), 0)
  const fmt = (n: number) => `$${n.toLocaleString('es-UY', { maximumFractionDigits: 0 })}`

  if (agrupar_por === 'vendedor') {
    const byVend = new Map<string, number>()
    rows.forEach((o: any) => {
      const v = Array.isArray(o.perfiles) ? o.perfiles[0] : o.perfiles
      const name = v?.nombre ?? 'Sin vendedor'
      byVend.set(name, (byVend.get(name) ?? 0) + Number(o.monto_total ?? 0))
    })
    const ranking = Array.from(byVend.entries()).sort((a, b) => b[1] - a[1])
    return `Resumen del ${fecha_desde} al ${fecha_hasta} — ${rows.length} órdenes — Total: ${fmt(total)}\n\nPor vendedor:\n${ranking.map(([n, m], i) => `${i + 1}. ${n}: ${fmt(m)}`).join('\n')}`
  }

  if (agrupar_por === 'mes') {
    const byMes = new Map<string, number>()
    rows.forEach((o: any) => {
      const mes = o.created_at?.slice(0, 7) ?? '?'
      byMes.set(mes, (byMes.get(mes) ?? 0) + Number(o.monto_total ?? 0))
    })
    const sorted = Array.from(byMes.entries()).sort()
    return `Resumen del ${fecha_desde} al ${fecha_hasta} — ${rows.length} órdenes — Total: ${fmt(total)}\n\nPor mes:\n${sorted.map(([m, t]) => `- ${m}: ${fmt(t)}`).join('\n')}`
  }

  const byEstado = new Map<string, { count: number; total: number }>()
  rows.forEach((o: any) => {
    const cur = byEstado.get(o.estado) ?? { count: 0, total: 0 }
    byEstado.set(o.estado, { count: cur.count + 1, total: cur.total + Number(o.monto_total ?? 0) })
  })
  const estadoLines = Array.from(byEstado.entries()).map(([e, { count, total: t }]) => `- ${e}: ${count} órdenes | ${fmt(t)}`)

  return `Resumen del ${fecha_desde} al ${fecha_hasta}\nTotal: ${fmt(total)} | ${rows.length} órdenes\n\nPor estado:\n${estadoLines.join('\n')}`
}

async function runDeudores(supabase: ReturnType<typeof createServerClient>, input: { dias_minimo?: number }): Promise<string> {
  const diasMin = input.dias_minimo ?? 0
  const { data: facturadas } = await supabase
    .from('ordenes_venta')
    .select('id, numero, monto_total, moneda, created_at, clientes(nombre, empresa), perfiles!ordenes_venta_vendedor_id_fkey(nombre)')
    .eq('estado', 'facturada')
    .order('created_at', { ascending: true })

  const rows = ((facturadas ?? []) as any[]).map(o => ({
    ...o, dias: Math.floor((Date.now() - new Date(o.created_at).getTime()) / 86400000),
  })).filter(o => o.dias >= diasMin)

  if (!rows.length) return diasMin > 0
    ? `No hay deudas de más de ${diasMin} días.`
    : 'No hay órdenes facturadas pendientes de cobro.'

  const total = rows.reduce((s, o) => s + Number(o.monto_total ?? 0), 0)
  const fmt = (n: number) => `$${n.toLocaleString('es-UY', { maximumFractionDigits: 0 })}`
  const urgencia = (d: number) => d > 60 ? '🔴 Crítico' : d > 30 ? '🟡 Vencido' : '🟢 Vigente'

  const lines = rows.map(o => {
    const cli = Array.isArray(o.clientes) ? o.clientes[0] : o.clientes
    const vend = Array.isArray(o.perfiles) ? o.perfiles[0] : o.perfiles
    return `- ${cli?.empresa ?? cli?.nombre ?? '—'} | ${fmt(Number(o.monto_total ?? 0))} | ${o.dias} días | ${urgencia(o.dias)}${vend?.nombre ? ` | ${vend.nombre}` : ''}`
  })

  return `Deudores${diasMin > 0 ? ` (+${diasMin} días)` : ''}: ${rows.length} órdenes — Total: ${fmt(total)}\n${lines.join('\n')}`
}

async function runEstadoRegistros(supabase: ReturnType<typeof createServerClient>): Promise<string> {
  const { data: reservas } = await supabase
    .from('reservas')
    .select('id, fecha_desde, fecha_hasta, clientes(nombre, empresa), reserva_items(soporte_id, soportes(nombre))')
    .in('estado', ['confirmada', 'aprobada'])
    .gte('fecha_hasta', new Date().toISOString().slice(0, 10))
    .order('fecha_desde')
    .limit(40)

  if (!reservas?.length) return 'No hay reservas activas en el sistema.'

  const reservaIds = reservas.map((r: any) => r.id)
  const { data: registros } = await supabase
    .from('registros')
    .select('reserva_id')
    .in('reserva_id', reservaIds)

  const conRegistros = new Set((registros ?? []).map((r: any) => r.reserva_id))
  const sinRegistros = (reservas as any[]).filter(r => !conRegistros.has(r.id))

  if (!sinRegistros.length) return 'Todas las reservas activas tienen registros subidos.'

  const lines = sinRegistros.map(r => {
    const cli = Array.isArray(r.clientes) ? r.clientes[0] : r.clientes
    const items = (r.reserva_items ?? []) as any[]
    const soportes = items.map((it: any) => it.soportes?.nombre ?? it.soporte_id).filter(Boolean).join(', ')
    return `- ${cli?.empresa ?? cli?.nombre ?? '—'} | ${r.fecha_desde} al ${r.fecha_hasta} | Soportes: ${soportes || '—'}`
  })

  return `Reservas activas SIN registros subidos: ${sinRegistros.length}\n${lines.join('\n')}`
}

// ─── Tool dispatcher ─────────────────────────────────────────────────────────

async function executeTool(name: string, input: Record<string, any>, supabase: ReturnType<typeof createServerClient>, userId: string, rol: string): Promise<string> {
  switch (name) {
    case 'consultar_disponibilidad': return runDisponibilidad(supabase, input as any)
    case 'consultar_ordenes':        return runOrdenes(supabase, userId, rol, input as any)
    case 'consultar_leads':          return runLeads(supabase, userId, rol, input as any)
    case 'buscar_cliente':           return runBuscarCliente(supabase, input as any)
    case 'resumen_ventas':           return runResumenVentas(supabase, userId, rol, input as any)
    case 'consultar_deudores':       return runDeudores(supabase, input as any)
    case 'estado_registros':         return runEstadoRegistros(supabase)
    default: return `Herramienta desconocida: ${name}`
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messages, userName, userRol } = await req.json()
  if (!Array.isArray(messages) || messages.length === 0)
    return NextResponse.json({ error: 'messages requerido' }, { status: 400 })

  const supabase = createServerClient()
  const userId = session.user.id
  const rol    = session.user.rol
  const today  = new Date().toISOString().slice(0, 10)

  const system = `Sos Movi, asistente de IA del CRM de Movimagen, empresa de publicidad exterior (via publica) en Uruguay.
Hablás con ${userName || 'el equipo'} (${ROL_LABELS[rol] ?? rol}). Hoy es ${today}.

Tenes acceso a datos reales del CRM a través de herramientas. Úsalas siempre que la pregunta involucre datos reales (disponibilidad, ventas, clientes, leads, deudas, registros). No respondas de memoria para preguntas que requieran datos actuales.

Al responder usá formato markdown: **negrita** para destacar, listas con - para enumerar, ## para secciones si es una respuesta larga. Se claro, conciso y útil. Respondé en español rioplatense.`

  const claudeMessages: Anthropic.MessageParam[] = messages.map((m: { role: string; content: string }) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }))

  try {
    let response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages: claudeMessages,
    })

    // Agentic loop — allow up to 3 tool calls
    const allMessages = [...claudeMessages]
    let iterations = 0

    while (response.stop_reason === 'tool_use' && iterations < 3) {
      iterations++
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use') as Anthropic.ToolUseBlock[]

      allMessages.push({ role: 'assistant', content: response.content })

      const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async tb => ({
          type: 'tool_result' as const,
          tool_use_id: tb.id,
          content: await executeTool(tb.name, tb.input as Record<string, any>, supabase, userId, rol),
        }))
      )

      allMessages.push({ role: 'user', content: toolResults })

      response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system,
        tools: TOOLS,
        messages: allMessages,
      })
    }

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('\n')

    return NextResponse.json({ text })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
