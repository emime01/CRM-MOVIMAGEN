import { createMcpHandler } from 'mcp-handler'
import { z } from 'zod'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmtMoney = (n: number | null | undefined) => '$' + Number(n ?? 0).toLocaleString('es-UY', { maximumFractionDigits: 0 })
const fmtDate = (d: string | null | undefined) => {
  if (!d) return '—'
  const [y, m, day] = String(d).slice(0, 10).split('-')
  return `${day}/${m}/${y}`
}
const first = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)
const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] })
const today = () => new Date().toISOString().split('T')[0]

// ─── MCP handler with read-only CRM tools ──────────────────────────────────────

const handler = createMcpHandler(
  (server) => {
    // 1. Disponibilidad
    server.tool(
      'consultar_disponibilidad',
      'Muestra el estado (libre / reservado / ocupado) de cada soporte publicitario en una fecha dada. Útil para "¿qué soportes están libres el X?".',
      {
        fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Fecha YYYY-MM-DD. Por defecto hoy.'),
        solo_libres: z.boolean().optional().describe('Si es true, devuelve solo los libres.'),
      },
      async ({ fecha, solo_libres }) => {
        const supabase = createServerClient()
        const f = fecha ?? today()
        const [{ data: soportes }, { data: ordenes }, { data: reservas }] = await Promise.all([
          supabase.from('soportes').select('id, nombre, categoria, tipo, seccion, ubicacion').eq('activo', true).order('categoria').order('nombre'),
          supabase.from('ordenes_venta').select('fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real, clientes(nombre, empresa), orden_items(soporte_id)').in('estado', ['aprobada', 'en_oic', 'facturada', 'cobrada']).not('fecha_alta_prevista', 'is', null),
          supabase.from('reservas').select('clientes(nombre, empresa), reserva_items(soporte_id)').in('estado', ['pendiente', 'aprobada', 'confirmada']).lte('fecha_desde', f).gte('fecha_hasta', f),
        ])
        const ocupado = new Map<string, string | null>()
        const reservado = new Map<string, string | null>()
        ;(ordenes ?? []).forEach((o: any) => {
          const alta = o.fecha_alta_real ?? o.fecha_alta_prevista
          const baja = o.fecha_baja_real ?? o.fecha_baja_prevista
          if (!alta || !baja || alta > f || baja < f) return
          const cli = first<any>(o.clientes)
          const nombre = cli?.empresa ?? cli?.nombre ?? null
          ;(o.orden_items ?? []).forEach((it: any) => { if (it.soporte_id && !ocupado.has(it.soporte_id)) ocupado.set(it.soporte_id, nombre) })
        })
        ;(reservas ?? []).forEach((r: any) => {
          const cli = first<any>(r.clientes)
          const nombre = cli?.empresa ?? cli?.nombre ?? null
          ;(r.reserva_items ?? []).forEach((it: any) => { if (it.soporte_id && !ocupado.has(it.soporte_id) && !reservado.has(it.soporte_id)) reservado.set(it.soporte_id, nombre) })
        })
        let rows = (soportes ?? []).map((s: any) => {
          const estado = ocupado.has(s.id) ? 'OCUPADO' : reservado.has(s.id) ? 'RESERVADO' : 'LIBRE'
          const cliente = ocupado.get(s.id) ?? reservado.get(s.id) ?? null
          return { nombre: s.nombre, categoria: s.categoria ?? '—', ubicacion: s.ubicacion ?? s.seccion ?? '', estado, cliente }
        })
        if (solo_libres) rows = rows.filter((r) => r.estado === 'LIBRE')
        const libres = rows.filter((r) => r.estado === 'LIBRE').length
        const body = rows.map((r) => `• ${r.nombre} [${r.categoria}]${r.ubicacion ? ' · ' + r.ubicacion : ''} → ${r.estado}${r.cliente ? ' (' + r.cliente + ')' : ''}`).join('\n')
        return text(`Disponibilidad al ${fmtDate(f)} — ${rows.length} soportes (${libres} libres)\n\n${body || 'Sin soportes.'}`)
      },
    )

    // 2. Buscar cliente
    server.tool(
      'buscar_cliente',
      'Busca clientes por nombre o empresa y devuelve contacto y vendedor asignado.',
      { query: z.string().describe('Texto a buscar.') },
      async ({ query }) => {
        const supabase = createServerClient()
        const { data } = await supabase
          .from('clientes')
          .select('nombre, empresa, email, telefono, rut, perfiles!clientes_vendedor_id_fkey(nombre), agencias(nombre)')
          .or(`nombre.ilike.%${query}%,empresa.ilike.%${query}%`)
          .eq('activo', true)
          .limit(20)
        if (!data?.length) return text(`No se encontraron clientes para "${query}".`)
        const body = data.map((c: any) => {
          const v = first<any>(c.perfiles); const ag = first<any>(c.agencias)
          return `• ${c.empresa || c.nombre}${c.empresa && c.nombre ? ' (' + c.nombre + ')' : ''}\n   Vendedor: ${v?.nombre ?? '—'} · Agencia: ${ag?.nombre ?? '—'}\n   ${c.email ?? 'sin email'} · ${c.telefono ?? 'sin tel'}`
        }).join('\n\n')
        return text(`${data.length} cliente(s):\n\n${body}`)
      },
    )

    // 3. Listar cotizaciones
    server.tool(
      'listar_cotizaciones',
      'Lista cotizaciones (propuestas) con estado, cliente, vendedor y montos.',
      {
        estado: z.enum(['borrador', 'enviada', 'aceptada', 'rechazada']).optional().describe('Filtra por estado.'),
        limite: z.number().int().min(1).max(50).optional().describe('Máximo de resultados (default 20).'),
      },
      async ({ estado, limite }) => {
        const supabase = createServerClient()
        let q = supabase.from('propuestas').select('numero, nombre, estado, moneda, monto_total, fecha_inicio, fecha_fin, clientes(nombre, empresa), perfiles(nombre)').order('created_at', { ascending: false }).limit(limite ?? 20)
        if (estado) q = q.eq('estado', estado)
        const { data } = await q
        if (!data?.length) return text('No hay cotizaciones que coincidan.')
        const body = data.map((p: any) => {
          const cli = first<any>(p.clientes); const v = first<any>(p.perfiles)
          return `• ${p.numero ?? '—'} · ${p.nombre ?? 'Sin nombre'} [${(p.estado ?? '').toUpperCase()}]\n   Cliente: ${cli?.empresa ?? cli?.nombre ?? '—'} · Vendedor: ${v?.nombre ?? '—'}\n   ${p.moneda ?? 'USD'} ${fmtMoney(p.monto_total)} · ${fmtDate(p.fecha_inicio)} → ${fmtDate(p.fecha_fin)}`
        }).join('\n\n')
        return text(`${data.length} cotización(es):\n\n${body}`)
      },
    )

    // 4. Consultar objetivos
    server.tool(
      'consultar_objetivos',
      'Muestra los objetivos por cliente y cuatrimestre (C1/C2/C3) con su ponderación, agrupados por vendedor, para un año.',
      {
        año: z.number().int().optional().describe('Año (default: actual).'),
        vendedor: z.string().optional().describe('Filtra por nombre del vendedor.'),
      },
      async ({ año, vendedor }) => {
        const supabase = createServerClient()
        const year = año ?? new Date().getFullYear()
        const { data } = await supabase.from('cliente_objetivos').select('ponderacion_pct, objetivo_c1, objetivo_c2, objetivo_c3, clientes(nombre), perfiles(nombre)').eq('year', year)
        if (!data?.length) return text(`No hay objetivos cargados para ${year}.`)
        const porVendedor = new Map<string, any[]>()
        for (const o of data as any[]) {
          const v = first<any>(o.perfiles)?.nombre ?? 'Sin vendedor'
          if (vendedor && !v.toLowerCase().includes(vendedor.toLowerCase())) continue
          if (!porVendedor.has(v)) porVendedor.set(v, [])
          const cli = first<any>(o.clientes)?.nombre ?? '—'
          const c1 = Number(o.objetivo_c1 ?? 0), c2 = Number(o.objetivo_c2 ?? 0), c3 = Number(o.objetivo_c3 ?? 0)
          const pond = o.ponderacion_pct ?? 100
          porVendedor.get(v)!.push({ cli, c1, c2, c3, pond, ponderado: (c1 + c2 + c3) * pond / 100 })
        }
        if (porVendedor.size === 0) return text(`No hay objetivos para ese filtro en ${year}.`)
        const blocks: string[] = []
        Array.from(porVendedor.entries()).forEach(([v, items]) => {
          const totalPond = items.reduce((s: number, i: any) => s + i.ponderado, 0)
          const lines = items.map((i: any) => `   • ${i.cli}: C1 ${fmtMoney(i.c1)} · C2 ${fmtMoney(i.c2)} · C3 ${fmtMoney(i.c3)} (pond ${i.pond}% → ${fmtMoney(i.ponderado)})`).join('\n')
          blocks.push(`${v} — total ponderado ${fmtMoney(totalPond)}\n${lines}`)
        })
        return text(`Objetivos ${year}:\n\n${blocks.join('\n\n')}`)
      },
    )

    // 5. Listar soportes
    server.tool(
      'listar_soportes',
      'Devuelve el catálogo de soportes con categoría, ubicación, precio semanal y capacidad.',
      { categoria: z.string().optional().describe('Filtra por categoría (Bus, Digital, Shopping, Exterior).') },
      async ({ categoria }) => {
        const supabase = createServerClient()
        let q = supabase.from('soportes').select('nombre, categoria, ubicacion, seccion, precio_semanal, tiene_iva, cap').eq('activo', true).order('categoria').order('nombre')
        if (categoria) q = q.ilike('categoria', `%${categoria}%`)
        const { data } = await q
        if (!data?.length) return text('No hay soportes en el catálogo.')
        const body = data.map((s: any) => `• ${s.nombre} [${s.categoria ?? '—'}]${s.ubicacion ? ' · ' + s.ubicacion : ''}\n   ${fmtMoney(s.precio_semanal)}/semana ${s.tiene_iva ? '(+IVA)' : '(exento)'} · capacidad ${s.cap ?? 1}`).join('\n')
        return text(`${data.length} soporte(s):\n\n${body}`)
      },
    )

    // 6. Listar reservas
    server.tool(
      'listar_reservas',
      'Lista reservas con cliente, período y estado. Por defecto las pendientes de aprobación.',
      { estado: z.enum(['pendiente', 'aprobada', 'rechazada', 'confirmada']).optional().describe('Filtra por estado (default pendiente).') },
      async ({ estado }) => {
        const supabase = createServerClient()
        const st = estado ?? 'pendiente'
        const { data } = await supabase.from('reservas').select('fecha_desde, fecha_hasta, estado, clientes(nombre, empresa), perfiles(nombre), reserva_items(soportes(nombre))').eq('estado', st).order('created_at', { ascending: false }).limit(30)
        if (!data?.length) return text(`No hay reservas en estado "${st}".`)
        const body = data.map((r: any) => {
          const cli = first<any>(r.clientes); const v = first<any>(r.perfiles)
          const soportes = (r.reserva_items ?? []).map((i: any) => first<any>(i.soportes)?.nombre).filter(Boolean).join(', ') || '—'
          return `• ${cli?.empresa ?? cli?.nombre ?? '—'} [${(r.estado ?? '').toUpperCase()}]\n   Soportes: ${soportes}\n   ${fmtDate(r.fecha_desde)} → ${fmtDate(r.fecha_hasta)} · Vendedor: ${v?.nombre ?? '—'}`
        }).join('\n\n')
        return text(`${data.length} reserva(s) en estado "${st}":\n\n${body}`)
      },
    )
  },
  { serverInfo: { name: 'crm-movimagen', version: '1.0.0' } },
  { basePath: '/api', disableSse: true, maxDuration: 60 },
)

// ─── Token gate ────────────────────────────────────────────────────────────────
// Simple shared-secret auth: the connector URL must include ?key=MCP_SECRET.
// Per-user OAuth identity is planned for a later phase.

async function gated(req: Request): Promise<Response> {
  const secret = process.env.MCP_SECRET
  if (secret) {
    const url = new URL(req.url)
    const key = url.searchParams.get('key') ?? req.headers.get('x-mcp-key')
    if (key !== secret) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401, headers: { 'content-type': 'application/json' } })
    }
  }
  return handler(req)
}

export { gated as GET, gated as POST, gated as DELETE }
