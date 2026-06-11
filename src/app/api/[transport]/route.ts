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
          supabase.from('ordenes_venta').select('fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real, clientes(nombre, empresa), orden_items(soporte_id, fecha_alta_prevista, fecha_alta_real, fecha_baja_prevista, fecha_baja_real)').in('estado', ['aprobada', 'en_oic', 'facturada', 'cobrada']),
          supabase.from('reservas').select('clientes(nombre, empresa), reserva_items(soporte_id)').in('estado', ['pendiente', 'aprobada', 'confirmada']).lte('fecha_desde', f).gte('fecha_hasta', f),
        ])
        const ocupado = new Map<string, string | null>()
        const reservado = new Map<string, string | null>()
        ;(ordenes ?? []).forEach((o: any) => {
          const cli = first<any>(o.clientes)
          const nombre = cli?.empresa ?? cli?.nombre ?? null
          ;(o.orden_items ?? []).forEach((it: any) => {
            const alta = it.fecha_alta_real ?? it.fecha_alta_prevista ?? o.fecha_alta_real ?? o.fecha_alta_prevista
            const baja = it.fecha_baja_real ?? it.fecha_baja_prevista ?? o.fecha_baja_real ?? o.fecha_baja_prevista
            if (!alta || !baja || alta > f || baja < f) return
            if (it.soporte_id && !ocupado.has(it.soporte_id)) ocupado.set(it.soporte_id, nombre)
          })
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
    // ─── ESCRITURA (Fase 2) ───────────────────────────────────────────────
    // Resolver de vendedores tolerante a acentos / nombres parciales.
    const findVendedor = async (nombre: string | undefined): Promise<{ id: string; nombre: string } | null> => {
      if (!nombre) return null
      const supabase = createServerClient()
      const { data } = await supabase.from('perfiles').select('id, nombre').in('rol', ['vendedor', 'asistente_ventas', 'gerente_comercial'])
      const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
      const v = norm(nombre)
      const list = (data ?? []) as { id: string; nombre: string }[]
      return list.find((p) => norm(p.nombre) === v)
        ?? list.find((p) => v.includes(norm(p.nombre)) || norm(p.nombre).includes(v))
        ?? null
    }

    // 7. Crear cliente
    server.tool(
      'crear_cliente',
      'Crea un cliente en el CRM. Confirmá con el usuario antes de ejecutar si los datos no son evidentes. Si la agencia no existe la crea automáticamente.',
      {
        nombre: z.string().describe('Nombre del cliente o razón social.'),
        empresa: z.string().optional().describe('Nombre comercial / empresa (si difiere del nombre).'),
        email: z.string().optional(),
        telefono: z.string().optional(),
        agencia_nombre: z.string().optional().describe('Nombre de la agencia (se crea si no existe).'),
        vendedor_nombre: z.string().optional().describe('Nombre del vendedor a asignar (matchea por nombre parcial).'),
        tipo_cliente: z.enum(['A', 'B', 'C']).optional().describe('Categoría comercial.'),
      },
      async (args) => {
        const supabase = createServerClient()
        let agenciaId: string | null = null
        if (args.agencia_nombre) {
          const { data: ex } = await supabase.from('agencias').select('id').ilike('nombre', args.agencia_nombre).maybeSingle()
          if (ex) agenciaId = ex.id
          else {
            const { data: nu } = await supabase.from('agencias').insert({ nombre: args.agencia_nombre }).select('id').single()
            agenciaId = nu?.id ?? null
          }
        }
        const vendedor = await findVendedor(args.vendedor_nombre)
        const { data: existing } = await supabase.from('clientes').select('id').ilike('nombre', args.nombre).maybeSingle()
        if (existing) return text(`El cliente "${args.nombre}" ya existe (id ${existing.id}). No se creó uno nuevo.`)
        const { data, error } = await supabase.from('clientes').insert({
          nombre: args.nombre,
          empresa: args.empresa ?? null,
          email: args.email ?? null,
          telefono: args.telefono ?? null,
          tipo_cliente: args.tipo_cliente ?? null,
          agencia_id: agenciaId,
          vendedor_id: vendedor?.id ?? null,
          activo: true,
        }).select('id').single()
        if (error) return text(`Error al crear cliente: ${error.message}`)
        return text(`✓ Cliente creado: ${args.nombre}${args.empresa ? ' (' + args.empresa + ')' : ''}\nVendedor: ${vendedor?.nombre ?? 'sin asignar'}${agenciaId ? ' · Agencia: ' + (args.agencia_nombre ?? '') : ''}\nID: ${data?.id}`)
      },
    )

    // 8. Cargar / actualizar objetivo de un cliente
    server.tool(
      'cargar_objetivo',
      'Carga o actualiza el objetivo cuatrimestral (C1/C2/C3) y la ponderación de un cliente. Si el cliente no existe, devuelve error sin crearlo.',
      {
        cliente_nombre: z.string().describe('Nombre del cliente exacto o parcial.'),
        año: z.number().int().optional().describe('Año del objetivo (default actual).'),
        c1: z.number().optional().describe('Monto proyectado del cuatrimestre 1.'),
        c2: z.number().optional().describe('Monto proyectado del cuatrimestre 2.'),
        c3: z.number().optional().describe('Monto proyectado del cuatrimestre 3.'),
        ponderacion: z.number().min(0).max(100).optional().describe('Probabilidad / peso del objetivo (0-100, default 100).'),
      },
      async (args) => {
        const supabase = createServerClient()
        const year = args.año ?? new Date().getFullYear()
        const { data: cliente } = await supabase.from('clientes').select('id, nombre, vendedor_id').ilike('nombre', `%${args.cliente_nombre}%`).limit(2)
        if (!cliente?.length) return text(`No encontré ningún cliente con "${args.cliente_nombre}". Probá crear_cliente primero.`)
        if (cliente.length > 1) return text(`Hay ${cliente.length} clientes que matchean "${args.cliente_nombre}": ${cliente.map((c: any) => c.nombre).join(', ')}. Especificá más el nombre.`)
        const c = cliente[0] as { id: string; nombre: string; vendedor_id: string | null }
        const { data: prev } = await supabase.from('cliente_objetivos').select('*').eq('cliente_id', c.id).eq('year', year).maybeSingle()
        const payload = {
          cliente_id: c.id,
          vendedor_id: c.vendedor_id,
          year,
          objetivo_c1: args.c1 ?? prev?.objetivo_c1 ?? 0,
          objetivo_c2: args.c2 ?? prev?.objetivo_c2 ?? 0,
          objetivo_c3: args.c3 ?? prev?.objetivo_c3 ?? 0,
          ponderacion_pct: args.ponderacion ?? prev?.ponderacion_pct ?? 100,
          updated_at: new Date().toISOString(),
        }
        const { error } = await supabase.from('cliente_objetivos').upsert(payload, { onConflict: 'cliente_id,year' })
        if (error) return text(`Error: ${error.message}`)
        const total = Number(payload.objetivo_c1) + Number(payload.objetivo_c2) + Number(payload.objetivo_c3)
        const ponderado = total * Number(payload.ponderacion_pct) / 100
        return text(`✓ Objetivo ${year} guardado para ${c.nombre}\nC1 ${fmtMoney(payload.objetivo_c1)} · C2 ${fmtMoney(payload.objetivo_c2)} · C3 ${fmtMoney(payload.objetivo_c3)}\nPonderación ${payload.ponderacion_pct}% → total ponderado ${fmtMoney(ponderado)}`)
      },
    )

    // 9 + 10. Aprobar / rechazar reserva
    const cambiarEstadoReserva = async (estado: 'aprobada' | 'rechazada', args: { reserva_id?: string; cliente_nombre?: string }) => {
      const supabase = createServerClient()
      let reservaId: string | null = args.reserva_id ?? null
      let info: any = null
      if (!reservaId && args.cliente_nombre) {
        const { data } = await supabase
          .from('reservas')
          .select('id, fecha_desde, fecha_hasta, clientes(nombre, empresa), reserva_items(soportes(nombre))')
          .eq('estado', 'pendiente')
          .ilike('clientes.nombre', `%${args.cliente_nombre}%`)
          .limit(5)
        const matches = (data ?? []).filter((r: any) => first<any>(r.clientes))
        if (!matches.length) return text(`No hay reservas pendientes para "${args.cliente_nombre}".`)
        if (matches.length > 1) {
          const lines = matches.map((r: any) => {
            const cli = first<any>(r.clientes); const sop = (r.reserva_items ?? []).map((i: any) => first<any>(i.soportes)?.nombre).filter(Boolean).join(', ')
            return `   id ${r.id} → ${cli?.empresa ?? cli?.nombre} · ${sop} · ${fmtDate(r.fecha_desde)}-${fmtDate(r.fecha_hasta)}`
          }).join('\n')
          return text(`Hay ${matches.length} reservas pendientes que matchean. Pasá el reserva_id:\n${lines}`)
        }
        info = matches[0]
        reservaId = info.id
      }
      if (!reservaId) return text('Falta reserva_id o cliente_nombre.')
      const { error } = await supabase.from('reservas').update({ estado, updated_at: new Date().toISOString() }).eq('id', reservaId)
      if (error) return text(`Error: ${error.message}`)
      const cli = first<any>(info?.clientes)
      return text(`✓ Reserva ${estado === 'aprobada' ? 'aprobada' : 'rechazada'}${cli ? ' — ' + (cli.empresa ?? cli.nombre) : ''} (id ${reservaId}).`)
    }

    server.tool(
      'aprobar_reserva',
      'Aprueba una reserva pendiente. Especificá reserva_id o cliente_nombre (si solo hay una pendiente para ese cliente).',
      {
        reserva_id: z.string().uuid().optional().describe('UUID de la reserva.'),
        cliente_nombre: z.string().optional().describe('Nombre del cliente (parcial). Solo si hay una sola reserva pendiente.'),
      },
      (args) => cambiarEstadoReserva('aprobada', args),
    )

    server.tool(
      'rechazar_reserva',
      'Rechaza una reserva pendiente. Mismos parámetros que aprobar_reserva.',
      {
        reserva_id: z.string().uuid().optional(),
        cliente_nombre: z.string().optional(),
      },
      (args) => cambiarEstadoReserva('rechazada', args),
    )

    // 11. Listar tareas (arte / operaciones)
    server.tool(
      'listar_tareas',
      'Lista las tareas pendientes generadas al aprobar OIC (muestra color, producir impresos, asignar buses, etc.). Útil para arte y operaciones.',
      {
        rol: z.enum(['arte', 'operaciones']).optional().describe('Filtra por rol asignado.'),
        estado: z.enum(['pendiente', 'en_progreso', 'completada']).optional().describe('Default pendiente.'),
        limite: z.number().int().min(1).max(50).optional(),
      },
      async ({ rol, estado, limite }) => {
        const supabase = createServerClient()
        let q = supabase.from('tasks').select('id, tipo, asignado_a_rol, estado, descripcion, fecha_limite, ordenes_venta(numero, clientes(nombre, empresa))').order('fecha_limite', { ascending: true, nullsFirst: false }).limit(limite ?? 20)
        q = q.eq('estado', estado ?? 'pendiente')
        if (rol) q = q.eq('asignado_a_rol', rol)
        const { data, error } = await q
        if (error) return text(`Error: ${error.message}`)
        if (!data?.length) return text('Sin tareas en ese filtro.')
        const body = data.map((t: any) => {
          const ord = first<any>(t.ordenes_venta)
          const cli = first<any>(ord?.clientes)
          return `• [${t.asignado_a_rol}] ${t.tipo} — ${t.descripcion ?? ''}\n   OIC #${ord?.numero ?? '—'} · ${cli?.empresa ?? cli?.nombre ?? '—'} · vence ${fmtDate(t.fecha_limite)}\n   id ${t.id}`
        }).join('\n\n')
        return text(`${data.length} tarea(s):\n\n${body}`)
      },
    )

    // 12. Completar tarea
    server.tool(
      'completar_tarea',
      'Marca una tarea como completada. Necesita el task_id (obtenido de listar_tareas).',
      { task_id: z.string().uuid() },
      async ({ task_id }) => {
        const supabase = createServerClient()
        const { error } = await supabase.from('tasks').update({ estado: 'completada', completed_at: new Date().toISOString() }).eq('id', task_id)
        if (error) return text(`Error: ${error.message}`)
        return text(`✓ Tarea ${task_id} marcada como completada.`)
      },
    )

    // 13. Crear soporte
    server.tool(
      'crear_soporte',
      'Agrega un soporte al catálogo. Confirmá con el usuario antes de ejecutar.',
      {
        nombre: z.string().describe('Nombre del soporte.'),
        categoria: z.enum(['Bus', 'Digital', 'Shopping', 'Exterior', 'Otro']).optional(),
        tipo: z.string().optional().describe('Tipo (led, circuito, estatico_bus, etc.).'),
        seccion: z.string().optional(),
        ubicacion: z.string().optional(),
        precio_semanal: z.number().optional(),
        tiene_iva: z.boolean().optional(),
        cap: z.number().int().min(1).optional().describe('Capacidad (default 1).'),
      },
      async (args) => {
        const supabase = createServerClient()
        const { data: existing } = await supabase.from('soportes').select('id').ilike('nombre', args.nombre).maybeSingle()
        if (existing) return text(`Ya existe un soporte con nombre "${args.nombre}". No se creó duplicado.`)
        const { data, error } = await supabase.from('soportes').insert({
          nombre: args.nombre,
          categoria: args.categoria ?? null,
          tipo: args.tipo ?? null,
          seccion: args.seccion ?? null,
          ubicacion: args.ubicacion ?? null,
          precio_semanal: args.precio_semanal ?? null,
          tiene_iva: args.tiene_iva ?? false,
          cap: args.cap ?? 1,
          activo: true,
        }).select('id').single()
        if (error) return text(`Error al crear soporte: ${error.message}`)
        return text(`✓ Soporte creado: ${args.nombre}${args.categoria ? ' [' + args.categoria + ']' : ''}\nPrecio semanal: ${args.precio_semanal != null ? fmtMoney(args.precio_semanal) : 'sin definir'} · Capacidad: ${args.cap ?? 1}\nID: ${data?.id}`)
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
