import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createServerClient()

  const [{ data: buses }, { data: soportes }] = await Promise.all([
    supabase
      .from('buses')
      .select('*, clientes!buses_cliente_actual_id_fkey(nombre, empresa)')
      .eq('activo', true)
      .order('numero'),
    supabase
      .from('soportes')
      .select('id, nombre, tipo, lado_bus, bus_id')
      .not('bus_id', 'is', null)
      .eq('activo', true),
  ])

  const soportesByBus: Record<string, typeof soportes> = {}
  for (const s of soportes ?? []) {
    if (!s.bus_id) continue
    if (!soportesByBus[s.bus_id]) soportesByBus[s.bus_id] = []
    soportesByBus[s.bus_id]!.push(s)
  }

  const result = (buses ?? []).map(b => ({
    ...b,
    soportes: soportesByBus[b.id] ?? [],
  }))

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const canManage = ['operaciones', 'administracion'].includes(session.user.rol)
  if (!canManage) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await req.json()
  const supabase = createServerClient()

  // ── Bulk import from Excel ────────────────────────────────────────────────
  if (body.items && Array.isArray(body.items)) {
    const { data: allClientes } = await supabase.from('clientes').select('id, nombre').eq('activo', true)
    const clienteMap = new Map((allClientes ?? []).map((c: { id: string; nombre: string }) => [c.nombre.toLowerCase().trim(), c.id]))

    const results = []

    for (const row of body.items as Record<string, string>[]) {
      const numero = (row.numero_bus ?? row.numero ?? '').trim()
      if (!numero) continue

      const categoria = (row.categoria ?? '').toLowerCase().trim() as 'lateral_full' | 'full_bus' | 'urbano' | ''
      const modelo = (row.modelo ?? '').trim() || null
      const ladoDisp = (row.lado_disponible ?? 'ambos').toLowerCase().trim()
      const clienteNombre = (row.cliente_actual ?? '').toLowerCase().trim()
      const clienteId = clienteNombre ? (clienteMap.get(clienteNombre) ?? null) : null

      // Upsert bus by numero
      const { data: existing } = await supabase.from('buses').select('id').eq('numero', numero).maybeSingle()
      let busId: string

      if (existing) {
        busId = existing.id
        await supabase.from('buses').update({
          modelo,
          categoria: categoria || null,
          lado_disponible: ladoDisp || 'ambos',
          cliente_actual_id: clienteId,
          updated_at: new Date().toISOString(),
        }).eq('id', busId)
      } else {
        const { data: newBus, error } = await supabase.from('buses').insert({
          numero,
          modelo,
          categoria: categoria || null,
          lado_disponible: ladoDisp || 'ambos',
          cliente_actual_id: clienteId,
        }).select('id').single()
        if (error || !newBus) { results.push({ numero, status: 'error', detail: error?.message }); continue }
        busId = newBus.id
      }

      // Assign soportes to bus for each position
      const POSICIONES: Record<string, string> = {
        lateral_izquierdo: row.lateral_izquierdo ?? '',
        lateral_derecho: row.lateral_derecho ?? '',
        trasero: row.trasero ?? '',
        interior: row.interior ?? '',
      }

      for (const [lado, nombre] of Object.entries(POSICIONES)) {
        const n = nombre.trim()
        if (!n) continue

        // Find or create soporte with this name and link to bus
        const { data: exSoporte } = await supabase.from('soportes').select('id').ilike('nombre', n).maybeSingle()
        if (exSoporte) {
          await supabase.from('soportes').update({ bus_id: busId, lado_bus: lado }).eq('id', exSoporte.id)
        } else {
          await supabase.from('soportes').insert({ nombre: n, tipo: 'bus', bus_id: busId, lado_bus: lado, activo: true })
        }
      }

      results.push({ numero, status: existing ? 'actualizado' : 'creado' })
    }

    return NextResponse.json({ results, total: results.length })
  }

  // ── Single bus creation ───────────────────────────────────────────────────
  const { numero, modelo, categoria, lado_disponible, notas, cliente_actual_id, soporteIds } = body

  if (!numero) return NextResponse.json({ error: 'Número de bus requerido' }, { status: 400 })

  const { data: bus, error } = await supabase
    .from('buses')
    .insert({ numero, modelo, categoria, lado_disponible: lado_disponible ?? 'ambos', notas, cliente_actual_id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Link soportes
  if (soporteIds?.length) {
    await supabase.from('soportes').update({ bus_id: bus.id }).in('id', soporteIds)
  }

  return NextResponse.json(bus, { status: 201 })
}
