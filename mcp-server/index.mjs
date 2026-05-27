#!/usr/bin/env node
// MCP server de solo lectura para CRM Movimagen — Fase 1 (perfil asistente).
// Expone consultas sobre Supabase como herramientas MCP. NO escribe datos.
//
// Uso: node mcp-server/index.mjs
// Requiere variables de entorno:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
// (ver mcp-server/README.md para configurarlo en Claude Desktop)

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtMoney = (n) => '$' + Number(n ?? 0).toLocaleString('es-UY', { maximumFractionDigits: 0 })
const fmtDate = (d) => {
  if (!d) return '—'
  const [y, m, day] = String(d).slice(0, 10).split('-')
  return `${day}/${m}/${y}`
}
const first = (v) => (Array.isArray(v) ? v[0] ?? null : v ?? null)
const text = (s) => ({ content: [{ type: 'text', text: s }] })
const today = () => new Date().toISOString().split('T')[0]

// ─── Server ──────────────────────────────────────────────────────────────────

const server = new McpServer({ name: 'crm-movimagen', version: '1.0.0' })

// 1. Disponibilidad de soportes en una fecha
server.registerTool(
  'consultar_disponibilidad',
  {
    title: 'Consultar disponibilidad',
    description: 'Muestra el estado (libre / reservado / ocupado) de cada soporte publicitario en una fecha dada. Útil para responder "¿qué soportes están libres el X?".',
    inputSchema: {
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Fecha en formato YYYY-MM-DD. Por defecto hoy.'),
      solo_libres: z.boolean().optional().describe('Si es true, devuelve únicamente los soportes libres.'),
    },
  },
  async ({ fecha, solo_libres }) => {
    const f = fecha ?? today()

    const [{ data: soportes }, { data: ordenes }, { data: reservas }] = await Promise.all([
      supabase.from('soportes').select('id, nombre, categoria, tipo, seccion, ubicacion').eq('activo', true).order('categoria').order('nombre'),
      supabase.from('ordenes_venta').select('fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real, clientes(nombre, empresa), orden_items(soporte_id)').in('estado', ['aprobada', 'en_oic', 'facturada', 'cobrada']).not('fecha_alta_prevista', 'is', null),
      supabase.from('reservas').select('soporte_id, clientes(nombre, empresa), reserva_items(soporte_id)').in('estado', ['pendiente', 'aprobada', 'confirmada']).lte('fecha_desde', f).gte('fecha_hasta', f),
    ])

    const ocupado = new Map()
    const reservado = new Map()
    ;(ordenes ?? []).forEach((o) => {
      const alta = o.fecha_alta_real ?? o.fecha_alta_prevista
      const baja = o.fecha_baja_real ?? o.fecha_baja_prevista
      if (!alta || !baja || alta > f || baja < f) return
      const cli = first(o.clientes)
      const nombre = cli?.empresa ?? cli?.nombre ?? null
      ;(o.orden_items ?? []).forEach((it) => { if (it.soporte_id && !ocupado.has(it.soporte_id)) ocupado.set(it.soporte_id, nombre) })
    })
    ;(reservas ?? []).forEach((r) => {
      const cli = first(r.clientes)
      const nombre = cli?.empresa ?? cli?.nombre ?? null
      ;(r.reserva_items ?? []).forEach((it) => { if (it.soporte_id && !ocupado.has(it.soporte_id) && !reservado.has(it.soporte_id)) reservado.set(it.soporte_id, nombre) })
    })

    let rows = (soportes ?? []).map((s) => {
      const estado = ocupado.has(s.id) ? 'OCUPADO' : reservado.has(s.id) ? 'RESERVADO' : 'LIBRE'
      const cliente = ocupado.get(s.id) ?? reservado.get(s.id) ?? null
      return { nombre: s.nombre, categoria: s.categoria ?? '—', ubicacion: s.ubicacion ?? s.seccion ?? '', estado, cliente }
    })
    if (solo_libres) rows = rows.filter((r) => r.estado === 'LIBRE')

    const libres = rows.filter((r) => r.estado === 'LIBRE').length
    const header = `Disponibilidad al ${fmtDate(f)} — ${rows.length} soportes (${libres} libres)\n\n`
    const body = rows.map((r) => `• ${r.nombre} [${r.categoria}] ${r.ubicacion ? '· ' + r.ubicacion : ''} → ${r.estado}${r.cliente ? ' (' + r.cliente + ')' : ''}`).join('\n')
    return text(header + (body || 'Sin soportes.'))
  },
)

// 2. Buscar cliente
server.registerTool(
  'buscar_cliente',
  {
    title: 'Buscar cliente',
    description: 'Busca clientes por nombre o empresa y devuelve sus datos de contacto y vendedor asignado.',
    inputSchema: {
      query: z.string().describe('Texto a buscar en nombre o empresa del cliente.'),
    },
  },
  async ({ query }) => {
    const { data } = await supabase
      .from('clientes')
      .select('nombre, empresa, email, telefono, rut, activo, perfiles!clientes_vendedor_id_fkey(nombre), agencias(nombre)')
      .or(`nombre.ilike.%${query}%,empresa.ilike.%${query}%`)
      .eq('activo', true)
      .limit(20)

    if (!data?.length) return text(`No se encontraron clientes para "${query}".`)
    const body = data.map((c) => {
      const v = first(c.perfiles)
      const ag = first(c.agencias)
      return `• ${c.empresa || c.nombre}${c.empresa && c.nombre ? ' (' + c.nombre + ')' : ''}\n   Vendedor: ${v?.nombre ?? '—'} · Agencia: ${ag?.nombre ?? '—'}\n   ${c.email ?? 'sin email'} · ${c.telefono ?? 'sin tel'}`
    }).join('\n\n')
    return text(`${data.length} cliente(s):\n\n${body}`)
  },
)

// 3. Listar cotizaciones
server.registerTool(
  'listar_cotizaciones',
  {
    title: 'Listar cotizaciones',
    description: 'Lista las cotizaciones (propuestas) con su estado, cliente, vendedor y montos. Se puede filtrar por estado.',
    inputSchema: {
      estado: z.enum(['borrador', 'enviada', 'aceptada', 'rechazada']).optional().describe('Filtra por estado de la cotización.'),
      limite: z.number().int().min(1).max(50).optional().describe('Cantidad máxima de resultados (default 20).'),
    },
  },
  async ({ estado, limite }) => {
    let q = supabase
      .from('propuestas')
      .select('numero, nombre, estado, moneda, monto_total, fecha_inicio, fecha_fin, clientes(nombre, empresa), perfiles(nombre)')
      .order('created_at', { ascending: false })
      .limit(limite ?? 20)
    if (estado) q = q.eq('estado', estado)
    const { data } = await q

    if (!data?.length) return text('No hay cotizaciones que coincidan.')
    const body = data.map((p) => {
      const cli = first(p.clientes)
      const v = first(p.perfiles)
      return `• ${p.numero ?? '—'} · ${p.nombre ?? 'Sin nombre'} [${(p.estado ?? '').toUpperCase()}]\n   Cliente: ${cli?.empresa ?? cli?.nombre ?? '—'} · Vendedor: ${v?.nombre ?? '—'}\n   ${p.moneda ?? 'USD'} ${fmtMoney(p.monto_total)} · ${fmtDate(p.fecha_inicio)} → ${fmtDate(p.fecha_fin)}`
    }).join('\n\n')
    return text(`${data.length} cotización(es):\n\n${body}`)
  },
)

// 4. Consultar objetivos por vendedor
server.registerTool(
  'consultar_objetivos',
  {
    title: 'Consultar objetivos',
    description: 'Muestra los objetivos por cliente y cuatrimestre (C1/C2/C3) con su ponderación, agrupados por vendedor, para un año.',
    inputSchema: {
      año: z.number().int().optional().describe('Año a consultar (default: año actual).'),
      vendedor: z.string().optional().describe('Filtra por nombre del vendedor.'),
    },
  },
  async ({ año, vendedor }) => {
    const year = año ?? new Date().getFullYear()
    const { data } = await supabase
      .from('cliente_objetivos')
      .select('ponderacion_pct, objetivo_c1, objetivo_c2, objetivo_c3, clientes(nombre), perfiles(nombre)')
      .eq('year', year)

    if (!data?.length) return text(`No hay objetivos cargados para ${year}.`)

    const porVendedor = new Map()
    for (const o of data) {
      const v = first(o.perfiles)?.nombre ?? 'Sin vendedor'
      if (vendedor && !v.toLowerCase().includes(vendedor.toLowerCase())) continue
      if (!porVendedor.has(v)) porVendedor.set(v, [])
      const cli = first(o.clientes)?.nombre ?? '—'
      const c1 = Number(o.objetivo_c1 ?? 0), c2 = Number(o.objetivo_c2 ?? 0), c3 = Number(o.objetivo_c3 ?? 0)
      const pond = o.ponderacion_pct ?? 100
      porVendedor.get(v).push({ cli, c1, c2, c3, pond, total: c1 + c2 + c3, ponderado: (c1 + c2 + c3) * pond / 100 })
    }

    if (porVendedor.size === 0) return text(`No hay objetivos para ese filtro en ${year}.`)
    const blocks = []
    for (const [v, items] of porVendedor) {
      const totalPond = items.reduce((s, i) => s + i.ponderado, 0)
      const lines = items.map((i) => `   • ${i.cli}: C1 ${fmtMoney(i.c1)} · C2 ${fmtMoney(i.c2)} · C3 ${fmtMoney(i.c3)} (pond ${i.pond}% → ${fmtMoney(i.ponderado)})`).join('\n')
      blocks.push(`${v} — total ponderado ${fmtMoney(totalPond)}\n${lines}`)
    }
    return text(`Objetivos ${year}:\n\n${blocks.join('\n\n')}`)
  },
)

// 5. Listar soportes (catálogo)
server.registerTool(
  'listar_soportes',
  {
    title: 'Listar soportes',
    description: 'Devuelve el catálogo de soportes publicitarios con su categoría, ubicación, precio semanal y capacidad.',
    inputSchema: {
      categoria: z.string().optional().describe('Filtra por categoría (Bus, Digital, Shopping, Exterior, etc.).'),
    },
  },
  async ({ categoria }) => {
    let q = supabase.from('soportes').select('nombre, categoria, tipo, seccion, ubicacion, precio_semanal, tiene_iva, cap').eq('activo', true).order('categoria').order('nombre')
    if (categoria) q = q.ilike('categoria', `%${categoria}%`)
    const { data } = await q
    if (!data?.length) return text('No hay soportes en el catálogo.')
    const body = data.map((s) => `• ${s.nombre} [${s.categoria ?? '—'}] ${s.ubicacion ? '· ' + s.ubicacion : ''}\n   ${fmtMoney(s.precio_semanal)}/semana ${s.tiene_iva ? '(+IVA)' : '(exento)'} · capacidad ${s.cap ?? 1}`).join('\n')
    return text(`${data.length} soporte(s):\n\n${body}`)
  },
)

// 6. Listar reservas
server.registerTool(
  'listar_reservas',
  {
    title: 'Listar reservas',
    description: 'Lista reservas de soportes con su cliente, período y estado. Por defecto muestra las pendientes de aprobación.',
    inputSchema: {
      estado: z.enum(['pendiente', 'aprobada', 'rechazada', 'confirmada']).optional().describe('Filtra por estado (default: pendiente).'),
    },
  },
  async ({ estado }) => {
    const st = estado ?? 'pendiente'
    const { data } = await supabase
      .from('reservas')
      .select('fecha_desde, fecha_hasta, estado, notas, clientes(nombre, empresa), perfiles(nombre), reserva_items(soportes(nombre))')
      .eq('estado', st)
      .order('created_at', { ascending: false })
      .limit(30)

    if (!data?.length) return text(`No hay reservas en estado "${st}".`)
    const body = data.map((r) => {
      const cli = first(r.clientes)
      const v = first(r.perfiles)
      const soportes = (r.reserva_items ?? []).map((i) => first(i.soportes)?.nombre).filter(Boolean).join(', ') || '—'
      return `• ${cli?.empresa ?? cli?.nombre ?? '—'} [${(r.estado ?? '').toUpperCase()}]\n   Soportes: ${soportes}\n   ${fmtDate(r.fecha_desde)} → ${fmtDate(r.fecha_hasta)} · Vendedor: ${v?.nombre ?? '—'}`
    }).join('\n\n')
    return text(`${data.length} reserva(s) en estado "${st}":\n\n${body}`)
  },
)

// ─── Start ───────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport()
await server.connect(transport)
console.error('CRM Movimagen MCP server (read-only) corriendo en stdio')
