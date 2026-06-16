import { createMcpHandler, withMcpAuth } from 'mcp-handler'
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

// ─── Identidad por usuario ────────────────────────────────────────────────────
// El conector se autentica con ?key=<token>. Si el token coincide con
// MCP_SECRET opera en modo compartido (equivalente a asistente). Si es un
// mcp_token personal (generado en Mi Perfil), las tools se scopean al rol.

interface Identity {
  perfilId: string | null
  rol: string
  nombre: string
}

function ident(extra: any): Identity {
  const e = extra?.authInfo?.extra ?? {}
  return {
    perfilId: (e.perfilId as string | null) ?? null,
    rol: (e.rol as string) ?? 'asistente_ventas',
    nombre: (e.nombre as string) ?? 'Token compartido',
  }
}

const esVendedor = (id: Identity) => id.rol === 'vendedor'
const puedeGestionarReservas = (id: Identity) =>
  ['asistente_ventas', 'gerente_comercial', 'administracion', 'operaciones'].includes(id.rol)
const puedeEditarCatalogo = (id: Identity) =>
  ['asistente_ventas', 'administracion'].includes(id.rol)

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
      async ({ estado, limite }, extra) => {
        const me = ident(extra)
        const supabase = createServerClient()
        let q = supabase.from('propuestas').select('numero, nombre, estado, moneda, monto_total, fecha_inicio, fecha_fin, clientes(nombre, empresa), perfiles(nombre)').order('created_at', { ascending: false }).limit(limite ?? 20)
        if (estado) q = q.eq('estado', estado)
        if (esVendedor(me) && me.perfilId) q = q.eq('vendedor_id', me.perfilId)
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
      async ({ año, vendedor }, extra) => {
        const me = ident(extra)
        const supabase = createServerClient()
        const year = año ?? new Date().getFullYear()
        let q = supabase.from('cliente_objetivos').select('ponderacion_pct, objetivo_c1, objetivo_c2, objetivo_c3, clientes(nombre), perfiles(nombre)').eq('year', year)
        if (esVendedor(me) && me.perfilId) q = q.eq('vendedor_id', me.perfilId)
        const { data } = await q
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
      async ({ estado }, extra) => {
        const me = ident(extra)
        const supabase = createServerClient()
        const st = estado ?? 'pendiente'
        let q = supabase.from('reservas').select('fecha_desde, fecha_hasta, estado, clientes(nombre, empresa), perfiles(nombre), reserva_items(soportes(nombre))').eq('estado', st).order('created_at', { ascending: false }).limit(30)
        if (esVendedor(me) && me.perfilId) q = q.eq('vendedor_id', me.perfilId)
        const { data } = await q
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
      async (args, extra) => {
        const me = ident(extra)
        if (['arte', 'operaciones'].includes(me.rol)) return text('Tu rol no permite crear clientes.')
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
        // Un vendedor siempre se asigna a sí mismo
        const vendedor = esVendedor(me) && me.perfilId
          ? { id: me.perfilId, nombre: me.nombre }
          : await findVendedor(args.vendedor_nombre)
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
      async (args, extra) => {
        const me = ident(extra)
        if (['arte', 'operaciones'].includes(me.rol)) return text('Tu rol no permite cargar objetivos.')
        const supabase = createServerClient()
        const year = args.año ?? new Date().getFullYear()
        const { data: cliente } = await supabase.from('clientes').select('id, nombre, vendedor_id').ilike('nombre', `%${args.cliente_nombre}%`).limit(2)
        if (!cliente?.length) return text(`No encontré ningún cliente con "${args.cliente_nombre}". Probá crear_cliente primero.`)
        if (cliente.length > 1) return text(`Hay ${cliente.length} clientes que matchean "${args.cliente_nombre}": ${cliente.map((c: any) => c.nombre).join(', ')}. Especificá más el nombre.`)
        const c = cliente[0] as { id: string; nombre: string; vendedor_id: string | null }
        if (esVendedor(me) && c.vendedor_id && c.vendedor_id !== me.perfilId) {
          return text(`${c.nombre} está asignado a otro vendedor; solo podés cargar objetivos de tus clientes.`)
        }
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
      (args, extra) => {
        const me = ident(extra)
        if (!puedeGestionarReservas(me)) return Promise.resolve(text('Tu rol no permite aprobar reservas.'))
        return cambiarEstadoReserva('aprobada', args)
      },
    )

    server.tool(
      'rechazar_reserva',
      'Rechaza una reserva pendiente. Mismos parámetros que aprobar_reserva.',
      {
        reserva_id: z.string().uuid().optional(),
        cliente_nombre: z.string().optional(),
      },
      (args, extra) => {
        const me = ident(extra)
        if (!puedeGestionarReservas(me)) return Promise.resolve(text('Tu rol no permite rechazar reservas.'))
        return cambiarEstadoReserva('rechazada', args)
      },
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
      async ({ rol, estado, limite }, extra) => {
        const me = ident(extra)
        const supabase = createServerClient()
        let q = supabase.from('tasks').select('id, tipo, asignado_a_rol, estado, descripcion, fecha_limite, ordenes_venta(numero, clientes(nombre, empresa))').order('fecha_limite', { ascending: true, nullsFirst: false }).limit(limite ?? 20)
        q = q.eq('estado', estado ?? 'pendiente')
        // arte y operaciones solo ven las de su rol, ignore el filtro pedido
        const rolEfectivo = ['arte', 'operaciones'].includes(me.rol) ? me.rol : rol
        if (rolEfectivo) q = q.eq('asignado_a_rol', rolEfectivo)
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
      async ({ task_id }, extra) => {
        const me = ident(extra)
        if (me.rol === 'vendedor') return text('Tu rol no permite completar tareas de producción.')
        const supabase = createServerClient()
        const { data: task } = await supabase.from('tasks').select('asignado_a_rol').eq('id', task_id).maybeSingle()
        if (!task) return text('No existe esa tarea.')
        if (['arte', 'operaciones'].includes(me.rol) && task.asignado_a_rol !== me.rol) {
          return text('Esa tarea pertenece a otra área.')
        }
        const updates: Record<string, unknown> = { estado: 'completada', completed_at: new Date().toISOString() }
        if (me.perfilId) updates.asignado_a = me.perfilId
        const { error } = await supabase.from('tasks').update(updates).eq('id', task_id)
        if (error) return text(`Error: ${error.message}`)
        return text(`✓ Tarea ${task_id} marcada como completada.`)
      },
    )

    // ─── COTIZADOR (los precios SIEMPRE los calcula el servidor) ───────────
    const itemSchema = z.object({
      soporte_nombre: z.string().describe('Nombre del soporte tal como figura en el catálogo (acepta parcial).'),
      semanas: z.number().int().min(1).describe('Semanas de pauta.'),
      cantidad: z.number().int().min(1).optional().describe('Cantidad de unidades (default 1).'),
      salidas: z.number().int().min(1).optional().describe('Salidas por hora — solo LED (default 30) y circuitos (default 10).'),
    })

    type ItemInput = z.infer<typeof itemSchema>

    const armarPlan = async (itemsInput: ItemInput[]) => {
      const supabase = createServerClient()
      const { calcularItem, salidasDefault } = await import('@/lib/cotizador/calcular')
      const plan: { soporte: any; semanas: number; cantidad: number; salidas: number | null; calc: ReturnType<typeof calcularItem> }[] = []
      const errores: string[] = []

      for (const it of itemsInput) {
        const { data: matches } = await supabase
          .from('soportes')
          .select('id, nombre, ubicacion, categoria, tipo_cotizador, precio_semanal, tiene_iva, costo_produccion, impuestos_municipales, impactos_mensuales, semanas_minimas')
          .ilike('nombre', `%${it.soporte_nombre}%`)
          .eq('activo', true)
          .limit(5)
        if (!matches?.length) { errores.push(`No encontré el soporte "${it.soporte_nombre}".`); continue }
        const exacto = matches.find((m: any) => m.nombre.toLowerCase() === it.soporte_nombre.toLowerCase())
        if (!exacto && matches.length > 1) {
          errores.push(`"${it.soporte_nombre}" matchea varios soportes: ${matches.map((m: any) => m.nombre).join(', ')}. Especificá el nombre.`)
          continue
        }
        const s = (exacto ?? matches[0]) as any
        const salidas = it.salidas ?? salidasDefault(s)
        const cantidad = it.cantidad ?? 1
        const calc = calcularItem({ soporte: s, semanas: it.semanas, cantidad, salidas })
        plan.push({ soporte: s, semanas: it.semanas, cantidad, salidas, calc })
      }
      return { plan, errores }
    }

    const formatPlan = (plan: Awaited<ReturnType<typeof armarPlan>>['plan'], moneda: string) => {
      const sym = moneda === 'USD' ? 'U$S' : '$'
      const f = (n: number) => sym + Math.round(n).toLocaleString('es-UY')
      const lines = plan.map(({ soporte, cantidad, salidas, calc }) =>
        `• ${soporte.nombre}${soporte.ubicacion ? ' · ' + soporte.ubicacion : ''}\n` +
        `   ${cantidad} unidad(es) × ${calc.sem} semana(s)${salidas ? ` · ${salidas} salidas/h` : ''}\n` +
        `   Arrendamiento ${f(calc.arr)}${calc.ivaArr ? ` + IVA ${f(calc.ivaArr)}` : ' (exento)'}` +
        `${calc.prod ? ` · Producción ${f(calc.prod)} + IVA ${f(calc.ivaProd)}` : ''}` +
        `${calc.mun ? ` · Municipales ${f(calc.mun)}` : ''}\n` +
        `   Subtotal ${f(calc.tot)}${calc.imp ? ` · ${calc.imp.toLocaleString('es-UY')} impactos · CPM ${f(calc.cpm)}` : ''}`,
      )
      const tot = plan.reduce((s, p) => s + p.calc.tot, 0)
      const imp = plan.reduce((s, p) => s + p.calc.imp, 0)
      return `${lines.join('\n\n')}\n\nTOTAL: ${f(tot)}${imp ? ` · ${imp.toLocaleString('es-UY')} impactos` : ''}`
    }

    // 13. Simular cotización (no guarda nada)
    server.tool(
      'simular_cotizacion',
      'Calcula el precio de una pauta con las fórmulas oficiales del planificador (arrendamiento, IVA, producción, municipales, impactos, CPM) SIN guardar nada. Usala para mostrar números antes de crear la cotización.',
      {
        items: z.array(itemSchema).min(1),
        moneda: z.enum(['UYU', 'USD']).optional().describe('Default UYU.'),
      },
      async ({ items, moneda }) => {
        const { plan, errores } = await armarPlan(items)
        if (errores.length) return text(`No pude armar la simulación:\n${errores.map(e => '• ' + e).join('\n')}`)
        return text(`Simulación (no guardada):\n\n${formatPlan(plan, moneda ?? 'UYU')}\n\nPara guardarla usá crear_cotizacion con los mismos items.`)
      },
    )

    // 14. Crear cotización (borrador — los precios los calcula el servidor)
    server.tool(
      'crear_cotizacion',
      'Crea una cotización en estado BORRADOR con precios calculados por el servidor (el modelo no puede alterar precios). El vendedor la revisa y envía desde la web. Si el cliente no tiene lead, se crea uno automáticamente. Confirmá los items con el usuario antes de ejecutar (ideal: simular_cotizacion primero).',
      {
        cliente_nombre: z.string().describe('Cliente existente (exacto o parcial). Si no existe, crearlo antes con crear_cliente.'),
        items: z.array(itemSchema).min(1),
        fecha_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Inicio de pauta YYYY-MM-DD.'),
        fecha_fin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Fin de pauta YYYY-MM-DD.'),
        nombre: z.string().optional().describe('Nombre / título de la campaña.'),
        marca: z.string().optional(),
        moneda: z.enum(['UYU', 'USD']).optional().describe('Default UYU.'),
        vendedor_nombre: z.string().optional().describe('Solo necesario con el token compartido; con token personal se usa tu identidad.'),
      },
      async (args, extra) => {
        const me = ident(extra)
        if (!['vendedor', 'asistente_ventas'].includes(me.rol)) {
          return text('Solo vendedores y asistente de ventas pueden crear cotizaciones (igual que en la web).')
        }
        const supabase = createServerClient()

        // Vendedor responsable
        let vendedorId = me.perfilId
        if (!vendedorId) {
          const v = await findVendedor(args.vendedor_nombre)
          if (!v) return text('Con el token compartido tenés que indicar vendedor_nombre para asignar la cotización.')
          vendedorId = v.id
        }

        // Cliente (con desambiguación)
        const { data: clientes } = await supabase.from('clientes').select('id, nombre').ilike('nombre', `%${args.cliente_nombre}%`).eq('activo', true).limit(2)
        if (!clientes?.length) return text(`No encontré el cliente "${args.cliente_nombre}". Crealo primero con crear_cliente.`)
        if (clientes.length > 1) return text(`Hay varios clientes que matchean "${args.cliente_nombre}": ${clientes.map((c: any) => c.nombre).join(', ')}. Especificá más.`)
        const cliente = clientes[0] as { id: string; nombre: string }

        // Plan con precios server-side
        const { plan, errores } = await armarPlan(args.items)
        if (errores.length) return text(`No pude armar la cotización:\n${errores.map(e => '• ' + e).join('\n')}`)

        const { IVA_RATE } = await import('@/lib/cotizador/calcular')
        const tot = plan.reduce((s, p) => s + p.calc.tot, 0)
        const imp = plan.reduce((s, p) => s + p.calc.imp, 0)
        const arr = plan.reduce((s, p) => s + p.calc.arr, 0)
        const prod = plan.reduce((s, p) => s + p.calc.prod, 0)

        // Numeración + lead automático (mismo flujo que la web)
        const { data: seqRow } = await supabase.rpc('nextval', { seq: 'propuestas_numero_seq' }).single()
        const numero = `COT-${String((seqRow as any) ?? Math.floor(Math.random() * 9000) + 1000).padStart(4, '0')}`

        const { data: newLead } = await supabase
          .from('leads')
          .insert({ cliente_id: cliente.id, vendedor_id: vendedorId, descripcion: `Cotización ${numero}`, estado: 'en_seguimiento' })
          .select('id')
          .single()

        const { data: propuesta, error } = await supabase
          .from('propuestas')
          .insert({
            lead_id:        newLead?.id ?? null,
            cliente_id:     cliente.id,
            vendedor_id:    vendedorId,
            numero,
            nombre:         args.nombre ?? null,
            marca:          args.marca ?? null,
            estado:         'borrador',
            fecha_inicio:   args.fecha_inicio ?? null,
            fecha_fin:      args.fecha_fin ?? null,
            moneda:         args.moneda ?? 'UYU',
            monto_neto:     arr + prod - (prod * IVA_RATE / (1 + IVA_RATE)),
            monto_total:    tot,
            monto_impactos: imp,
          })
          .select('id, numero')
          .single()
        if (error || !propuesta) return text(`Error al crear la cotización: ${error?.message ?? 'desconocido'}`)

        const rows = plan.map(({ soporte, cantidad, salidas, semanas, calc }) => ({
          propuesta_id:      propuesta.id,
          soporte_id:        soporte.id,
          nombre_soporte:    soporte.nombre,
          ubicacion:         soporte.ubicacion,
          categoria_soporte: soporte.categoria,
          tipo_cotizador:    soporte.tipo_cotizador,
          cantidad,
          cantidad_soportes: cantidad,
          salidas_elegidas:  salidas,
          semanas,
          precio_unitario:   soporte.precio_semanal ?? 0,
          subtotal:          calc.tot,
          impactos_calc:     calc.imp,
        }))
        const { error: itemsErr } = await supabase.from('propuesta_items').insert(rows)
        if (itemsErr) return text(`Cotización ${numero} creada pero falló la carga de items: ${itemsErr.message}. Revisala en la web.`)

        return text(
          `✓ Cotización ${numero} creada en BORRADOR para ${cliente.nombre}\n\n` +
          formatPlan(plan, args.moneda ?? 'UYU') +
          `\n\nRevisala, ajustala y envíala desde la web:\nhttps://crm-movimagen.vercel.app/dashboard/cotizaciones/${propuesta.id}`,
        )
      },
    )

    // 15. Marcar cotización aceptada (cliente dijo que sí → reserva soportes)
    server.tool(
      'marcar_cotizacion_aceptada',
      'Marca una cotización como ACEPTADA por el cliente y bloquea los soportes con una reserva pendiente. Es el paso clave del pipeline: usala apenas el cliente confirme. La orden de venta se crea después desde la web.',
      {
        numero: z.string().optional().describe('Número de cotización, ej COT-0007.'),
        cliente_nombre: z.string().optional().describe('Alternativa: cliente con una sola cotización enviada/borrador.'),
      },
      async (args, extra) => {
        const me = ident(extra)
        if (!['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion'].includes(me.rol)) {
          return text('Tu rol no permite marcar cotizaciones como aceptadas.')
        }
        const supabase = createServerClient()
        let q = supabase.from('propuestas').select('id, numero, estado, clientes(nombre, empresa)').in('estado', ['borrador', 'enviada']).limit(5)
        if (args.numero) q = q.ilike('numero', args.numero.trim())
        else if (args.cliente_nombre) q = q.ilike('clientes.nombre', `%${args.cliente_nombre}%`)
        else return text('Indicá numero (COT-XXXX) o cliente_nombre.')
        if (esVendedor(me) && me.perfilId) q = q.eq('vendedor_id', me.perfilId)
        const { data: matches } = await q
        const validas = (matches ?? []).filter((p: any) => !args.cliente_nombre || first<any>(p.clientes))
        if (!validas.length) return text('No encontré una cotización abierta que coincida (y que sea tuya, si sos vendedor).')
        if (validas.length > 1) {
          return text(`Hay ${validas.length} cotizaciones abiertas que matchean:\n${validas.map((p: any) => `   ${p.numero} · ${first<any>(p.clientes)?.nombre ?? '—'} [${p.estado}]`).join('\n')}\nEspecificá el número.`)
        }
        const { aceptarCotizacion } = await import('@/lib/cotizaciones/aceptar')
        const r = await aceptarCotizacion(supabase, (validas[0] as any).id)
        if (!r.ok) return text(`No se pudo: ${r.error}`)
        return text(`✓ ${r.numero ?? 'Cotización'} marcada como ACEPTADA. ${r.itemsReservados} soporte(s) bloqueados con reserva pendiente.\nPróximo paso: crear la orden de venta desde la web (botón "Crear orden de venta" en la cotización).`)
      },
    )

    // 16. Listar órdenes de venta
    server.tool(
      'listar_ordenes',
      'Lista órdenes de venta (OIC) con estado, cliente, vendedor y monto. Útil para ver qué hay pendiente de aprobación.',
      {
        estado: z.enum(['borrador', 'pendiente_aprobacion', 'aprobada', 'rechazada', 'en_oic', 'facturada', 'cobrada']).optional(),
        limite: z.number().int().min(1).max(50).optional(),
      },
      async ({ estado, limite }, extra) => {
        const me = ident(extra)
        const supabase = createServerClient()
        let q = supabase.from('ordenes_venta').select('numero, estado, moneda, monto_total, fecha_alta_prevista, fecha_baja_prevista, clientes(nombre, empresa), perfiles!ordenes_venta_vendedor_id_fkey(nombre)').order('created_at', { ascending: false }).limit(limite ?? 20)
        if (estado) q = q.eq('estado', estado)
        if (esVendedor(me) && me.perfilId) q = q.eq('vendedor_id', me.perfilId)
        const { data } = await q
        if (!data?.length) return text('No hay órdenes que coincidan.')
        const body = data.map((o: any) => {
          const cli = first<any>(o.clientes); const v = first<any>(o.perfiles)
          return `• OIC #${o.numero} [${(o.estado ?? '').toUpperCase()}]\n   ${cli?.empresa ?? cli?.nombre ?? '—'} · Vendedor: ${v?.nombre ?? '—'}\n   ${o.moneda ?? 'UYU'} ${fmtMoney(o.monto_total)} · ${fmtDate(o.fecha_alta_prevista)} → ${fmtDate(o.fecha_baja_prevista)}`
        }).join('\n\n')
        return text(`${data.length} orden(es):\n\n${body}`)
      },
    )

    // 17 + 18. Aprobar / rechazar OIC (exclusivo del gerente comercial)
    const cambiarEstadoOrden = async (me: Identity, numero: number, nuevoEstado: 'aprobada' | 'rechazada', motivo?: string) => {
      if (me.rol !== 'gerente_comercial') return text('Solo el gerente comercial puede aprobar o rechazar órdenes.')
      const supabase = createServerClient()
      const { data: orden } = await supabase.from('ordenes_venta').select('id, estado, clientes(nombre, empresa)').eq('numero', numero).maybeSingle()
      if (!orden) return text(`No existe la OIC #${numero}.`)
      if (orden.estado !== 'pendiente_aprobacion') return text(`La OIC #${numero} está en estado "${orden.estado}", no en pendiente_aprobacion.`)

      const { error } = await supabase.from('ordenes_venta').update({ estado: nuevoEstado }).eq('id', orden.id)
      if (error) return text(`Error: ${error.message}`)
      await supabase.from('orden_historial').insert({
        orden_id: orden.id,
        perfil_id: me.perfilId,
        estado_nuevo: nuevoEstado,
        comentario: motivo ?? `${nuevoEstado === 'aprobada' ? 'Aprobada' : 'Rechazada'} vía Claude`,
      })

      let extraMsg = ''
      if (nuevoEstado === 'aprobada') {
        const { generarTasksDeOrden } = await import('@/lib/tasks/generar-desde-orden')
        const r = await generarTasksDeOrden(supabase, orden.id)
        extraMsg = r.created ? `\n${r.created} tarea(s) generadas para arte/operaciones (ya notificados).` : ''
      }
      const cli = first<any>(orden.clientes)
      return text(`✓ OIC #${numero} (${cli?.empresa ?? cli?.nombre ?? '—'}) ${nuevoEstado === 'aprobada' ? 'APROBADA' : 'RECHAZADA'}.${extraMsg}`)
    }

    server.tool(
      'aprobar_oic',
      'Aprueba una orden de venta pendiente. Solo el gerente comercial. Al aprobar se generan las tareas automáticas de arte y operaciones.',
      { numero: z.number().int().describe('Número de la OIC.') },
      ({ numero }, extra) => cambiarEstadoOrden(ident(extra), numero, 'aprobada'),
    )

    server.tool(
      'rechazar_oic',
      'Rechaza una orden de venta pendiente. Solo el gerente comercial.',
      {
        numero: z.number().int(),
        motivo: z.string().optional().describe('Motivo del rechazo (queda en el historial).'),
      },
      ({ numero, motivo }, extra) => cambiarEstadoOrden(ident(extra), numero, 'rechazada', motivo),
    )

    // 19. Cargar fecha real de campaña (operaciones)
    server.tool(
      'cargar_fecha_real',
      'Registra cuándo arrancó o terminó REALMENTE la pauta de un soporte dentro de una OIC. Mantiene la disponibilidad actualizada cuando hay atrasos de impresión/instalación. Solo operaciones y administración.',
      {
        oic_numero: z.number().int().describe('Número de la OIC.'),
        soporte_nombre: z.string().describe('Soporte del ítem a actualizar (acepta parcial).'),
        fecha_alta_real: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Cuándo arrancó de verdad.'),
        fecha_baja_real: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Cuándo terminó de verdad.'),
      },
      async (args, extra) => {
        const me = ident(extra)
        if (!['operaciones', 'administracion'].includes(me.rol)) return text('Solo operaciones y administración pueden cargar fechas reales.')
        if (!args.fecha_alta_real && !args.fecha_baja_real) return text('Indicá fecha_alta_real y/o fecha_baja_real.')
        const supabase = createServerClient()
        const { data: orden } = await supabase.from('ordenes_venta').select('id').eq('numero', args.oic_numero).maybeSingle()
        if (!orden) return text(`No existe la OIC #${args.oic_numero}.`)
        const { data: items } = await supabase.from('orden_items').select('id, soportes(nombre)').eq('orden_id', orden.id)
        const matches = (items ?? []).filter((it: any) => first<any>(it.soportes)?.nombre?.toLowerCase().includes(args.soporte_nombre.toLowerCase()))
        if (!matches.length) return text(`La OIC #${args.oic_numero} no tiene ningún ítem con soporte "${args.soporte_nombre}".`)
        if (matches.length > 1) return text(`Hay varios ítems que matchean: ${matches.map((m: any) => first<any>(m.soportes)?.nombre).join(', ')}. Especificá el nombre completo.`)
        const updates: Record<string, string> = {}
        if (args.fecha_alta_real) updates.fecha_alta_real = args.fecha_alta_real
        if (args.fecha_baja_real) updates.fecha_baja_real = args.fecha_baja_real
        if (updates.fecha_alta_real && updates.fecha_baja_real && updates.fecha_alta_real > updates.fecha_baja_real) {
          return text('La fecha de baja no puede ser anterior a la de alta.')
        }
        const { error } = await supabase.from('orden_items').update(updates).eq('id', (matches[0] as any).id)
        if (error) return text(`Error: ${error.message}`)
        const partes = []
        if (args.fecha_alta_real) partes.push(`alta real ${fmtDate(args.fecha_alta_real)}`)
        if (args.fecha_baja_real) partes.push(`baja real ${fmtDate(args.fecha_baja_real)}`)
        return text(`✓ ${first<any>((matches[0] as any).soportes)?.nombre} (OIC #${args.oic_numero}): ${partes.join(' · ')}. Disponibilidad actualizada.`)
      },
    )

    // 20. Crear lead
    server.tool(
      'crear_lead',
      'Crea un lead (oportunidad comercial) para un cliente existente. Solo vendedores y gerente.',
      {
        cliente_nombre: z.string().describe('Cliente existente (si no existe, usar crear_cliente primero).'),
        descripcion: z.string().describe('De qué se trata la oportunidad.'),
        monto_potencial: z.number().optional(),
        cuatrimestre: z.string().optional().describe('Ej: Q2-2026.'),
        proxima_gestion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Fecha del próximo contacto.'),
      },
      async (args, extra) => {
        const me = ident(extra)
        if (!['vendedor', 'gerente_comercial'].includes(me.rol)) return text('Solo vendedores y gerente pueden crear leads (igual que en la web).')
        const supabase = createServerClient()
        const { data: clientes } = await supabase.from('clientes').select('id, nombre, vendedor_id').ilike('nombre', `%${args.cliente_nombre}%`).eq('activo', true).limit(2)
        if (!clientes?.length) return text(`No encontré el cliente "${args.cliente_nombre}".`)
        if (clientes.length > 1) return text(`Varios clientes matchean: ${clientes.map((c: any) => c.nombre).join(', ')}. Especificá más.`)
        const cliente = clientes[0] as any
        const vendedorId = me.perfilId ?? cliente.vendedor_id
        const { data, error } = await supabase.from('leads').insert({
          cliente_id:      cliente.id,
          vendedor_id:     vendedorId,
          descripcion:     args.descripcion,
          monto_potencial: args.monto_potencial ?? null,
          cuatrimestre:    args.cuatrimestre ?? null,
          proxima_gestion: args.proxima_gestion ?? null,
          estado:          'nuevo',
        }).select('id').single()
        if (error) return text(`Error: ${error.message}`)
        return text(`✓ Lead creado para ${cliente.nombre}: "${args.descripcion}"${args.monto_potencial ? ` · potencial ${fmtMoney(args.monto_potencial)}` : ''}${args.proxima_gestion ? ` · próxima gestión ${fmtDate(args.proxima_gestion)}` : ''}\nID: ${data?.id}`)
      },
    )

    // 21. Agregar gestión a un lead
    server.tool(
      'agregar_gestion_lead',
      'Registra una gestión sobre un lead existente: qué pasó y cuándo es el próximo contacto. Opcionalmente cambia el estado del lead.',
      {
        cliente_nombre: z.string().describe('Cliente del lead.'),
        nota: z.string().describe('Qué pasó en la gestión (reunión, llamada, respuesta del cliente…).'),
        proxima_gestion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Fecha del próximo contacto.'),
        estado: z.enum(['nuevo', 'en_conversacion', 'propuesta_enviada', 'negociacion', 'ganado', 'perdido']).optional(),
      },
      async (args, extra) => {
        const me = ident(extra)
        if (!['vendedor', 'gerente_comercial'].includes(me.rol)) return text('Solo vendedores y gerente gestionan leads.')
        const supabase = createServerClient()
        let q = supabase.from('leads').select('id, descripcion, notas, estado, clientes(nombre)').not('estado', 'in', '(ganado,perdido)').ilike('clientes.nombre', `%${args.cliente_nombre}%`).limit(5)
        if (esVendedor(me) && me.perfilId) q = q.eq('vendedor_id', me.perfilId)
        const { data } = await q
        const matches = (data ?? []).filter((l: any) => first<any>(l.clientes))
        if (!matches.length) return text(`No encontré leads activos para "${args.cliente_nombre}"${esVendedor(me) ? ' asignados a vos' : ''}.`)
        if (matches.length > 1) {
          return text(`Hay ${matches.length} leads activos para ese cliente:\n${matches.map((l: any) => `   • "${l.descripcion ?? 'sin descripción'}" [${l.estado}]`).join('\n')}\nAclarame a cuál te referís por su descripción.`)
        }
        const lead = matches[0] as any
        const stamp = new Date().toISOString().slice(0, 10)
        const notas = `${lead.notas ? lead.notas + '\n' : ''}[${stamp}] ${args.nota}`
        const updates: Record<string, unknown> = { notas, updated_at: new Date().toISOString() }
        if (args.proxima_gestion) updates.proxima_gestion = args.proxima_gestion
        if (args.estado) updates.estado = args.estado
        const { error } = await supabase.from('leads').update(updates).eq('id', lead.id)
        if (error) return text(`Error: ${error.message}`)
        return text(`✓ Gestión registrada en el lead de ${first<any>(lead.clientes)?.nombre}${args.estado ? ` · estado → ${args.estado}` : ''}${args.proxima_gestion ? ` · próxima gestión ${fmtDate(args.proxima_gestion)}` : ''}`)
      },
    )

    // 22 + 23. Cambios de material durante la campaña
    const puedeCambiarMaterial = (id: Identity) => ['operaciones', 'administracion', 'asistente_ventas'].includes(id.rol)

    server.tool(
      'registrar_cambio_material_digital',
      'Registra que el cliente envió un material nuevo para un soporte digital (LED, banner shopping, circuito). NO genera OIC: reemplaza el material in-place. Crea automáticamente las tareas de arte (validar) y operaciones (regrabar comprobante). Solo operaciones, asistente y administración.',
      {
        oic_numero: z.number().int(),
        soporte_nombre: z.string().describe('Soporte del ítem que cambia (acepta parcial).'),
        fecha_desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Desde cuándo corre el material nuevo.'),
        url_material: z.string().optional().describe('Link al archivo (Drive, Dropbox, etc.).'),
        descripcion: z.string().optional().describe('Notas: resolución, duración, contexto.'),
      },
      async (args, extra) => {
        const me = ident(extra)
        if (!puedeCambiarMaterial(me)) return text('Tu rol no permite cargar cambios de material.')
        const supabase = createServerClient()
        const { data: orden } = await supabase.from('ordenes_venta').select('id').eq('numero', args.oic_numero).maybeSingle()
        if (!orden) return text(`No existe la OIC #${args.oic_numero}.`)
        const { data: items } = await supabase.from('orden_items').select('id, soportes(nombre, tipo_cotizador)').eq('orden_id', orden.id)
        const matches = (items ?? []).filter((it: any) => first<any>(it.soportes)?.nombre?.toLowerCase().includes(args.soporte_nombre.toLowerCase()))
        if (!matches.length) return text(`La OIC #${args.oic_numero} no tiene ningún ítem con soporte "${args.soporte_nombre}".`)
        if (matches.length > 1) return text(`Varios ítems matchean: ${matches.map((m: any) => first<any>(m.soportes)?.nombre).join(', ')}. Especificá el nombre.`)
        const item = matches[0] as any
        const { registrarCambioDigital } = await import('@/lib/cambios-material/lib')
        const r = await registrarCambioDigital(supabase, {
          ordenItemId:   item.id,
          fechaDesde:    args.fecha_desde,
          urlMaterial:   args.url_material,
          descripcion:   args.descripcion,
          perfilId:      me.perfilId,
        })
        if (!r.ok) return text(`No se pudo: ${r.error}`)
        return text(`✓ Cambio de material registrado en OIC #${args.oic_numero} (${first<any>(item.soportes)?.nombre}). Vigente desde ${fmtDate(args.fecha_desde)}.\n${r.tasksCreadas ?? 0} tarea(s) generadas para arte y operaciones.`)
      },
    )

    server.tool(
      'crear_reimpresion',
      'Crea una OIC HIJA de reimpresión sobre una OIC existente — para cuando el cliente cambia el material de un soporte IMPRESO (bus, estático shopping, medianera). La nueva OIC arranca en borrador, copia los ítems impresos pero sin arrendamiento (solo cobra el costo de producción/instalación). Hay que aprobarla después igual que cualquier OIC.',
      {
        oic_numero: z.number().int().describe('OIC original a reimprimir.'),
        soporte_nombre: z.string().optional().describe('Opcional: limita la reimpresión a un soporte específico (si la OIC tiene varios impresos).'),
      },
      async (args, extra) => {
        const me = ident(extra)
        if (!puedeCambiarMaterial(me)) return text('Tu rol no permite generar reimpresiones.')
        const supabase = createServerClient()
        const { data: madre } = await supabase.from('ordenes_venta').select('id, orden_items(soporte_id, soportes(nombre, tipo_cotizador))').eq('numero', args.oic_numero).maybeSingle()
        if (!madre) return text(`No existe la OIC #${args.oic_numero}.`)

        let soporteIds: string[] | undefined
        if (args.soporte_nombre) {
          const matches = (madre.orden_items ?? []).filter((it: any) => first<any>(it.soportes)?.nombre?.toLowerCase().includes(args.soporte_nombre!.toLowerCase()))
          if (!matches.length) return text(`No encontré "${args.soporte_nombre}" en la OIC #${args.oic_numero}.`)
          soporteIds = matches.map((m: any) => m.soporte_id).filter(Boolean)
        }

        const { crearOicCambioImpreso } = await import('@/lib/cambios-material/lib')
        const r = await crearOicCambioImpreso(supabase, {
          oicOrigenId:        (madre as any).id,
          soporteIds,
          creadoPorPerfilId:  me.perfilId,
        })
        if (!r.ok) return text(`No se pudo: ${r.error}`)
        return text(`✓ OIC #${r.numero} creada como reimpresión de OIC #${args.oic_numero}, con ${r.itemsCopiados} ítem(s) en BORRADOR.\nRevisala y mandala a aprobar:\nhttps://crm-movimagen.vercel.app/dashboard/ventas/${r.ordenId}`)
      },
    )

    // 24. Crear soporte
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
      async (args, extra) => {
        const me = ident(extra)
        if (!puedeEditarCatalogo(me)) return text('Solo asistente de ventas y administración pueden modificar el catálogo de soportes.')
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

// ─── Autenticación ─────────────────────────────────────────────────────────────
// Dos modos de token en ?key= (o header x-mcp-key / bearer):
//   - MCP_SECRET   → modo compartido (acceso equivalente a asistente_ventas)
//   - mcp_token    → identidad personal generada en Mi Perfil; scopea por rol

async function verifyToken(req: Request, bearerToken?: string) {
  const url = new URL(req.url)
  const key = bearerToken ?? url.searchParams.get('key') ?? req.headers.get('x-mcp-key') ?? ''
  if (!key) return undefined

  if (process.env.MCP_SECRET && key === process.env.MCP_SECRET) {
    return {
      token: key,
      clientId: 'shared',
      scopes: ['shared'],
      extra: { perfilId: null, rol: 'asistente_ventas', nombre: 'Token compartido' },
    }
  }

  const supabase = createServerClient()
  const { data } = await supabase.from('perfiles').select('id, rol, nombre').eq('mcp_token', key).maybeSingle()
  if (!data) return undefined
  return {
    token: key,
    clientId: data.id,
    scopes: [data.rol],
    extra: { perfilId: data.id, rol: data.rol, nombre: data.nombre },
  }
}

const authed = withMcpAuth(handler, verifyToken, { required: true })

export { authed as GET, authed as POST, authed as DELETE }
