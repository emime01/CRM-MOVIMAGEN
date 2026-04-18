import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const proximos = searchParams.get('cumpleanos_proximos')
  const cuentaId = searchParams.get('cuenta_id')
  const supabase = createServerClient()

  if (proximos) {
    const dias = parseInt(proximos) || 30
    const today = new Date()
    // Fetch all active contacts with birthday set, then filter in JS (simpler than SQL month rollover)
    const { data, error } = await supabase
      .from('contactos')
      .select('id, nombres, apellidos, mail1, telefono1, cumple_dia, cumple_mes, cuenta_id, tipo_cuenta')
      .eq('activo', true)
      .not('cumple_dia', 'is', null)
      .not('cumple_mes', 'is', null)
      .gt('cumple_dia', 0)
      .gt('cumple_mes', 0)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const year = today.getFullYear()
    const cutoff = new Date(today.getTime() + dias * 24 * 60 * 60 * 1000)

    const upcoming = (data ?? [])
      .map(c => {
        let bday = new Date(year, (c.cumple_mes ?? 1) - 1, c.cumple_dia ?? 1)
        if (bday < today) bday = new Date(year + 1, (c.cumple_mes ?? 1) - 1, c.cumple_dia ?? 1)
        return { ...c, nextBirthday: bday }
      })
      .filter(c => c.nextBirthday <= cutoff)
      .sort((a, b) => a.nextBirthday.getTime() - b.nextBirthday.getTime())
      .map(({ nextBirthday, ...c }) => ({ ...c, next_birthday: nextBirthday.toISOString().slice(0, 10) }))

    // Enrich with cuenta name
    const clienteIds = upcoming.filter(c => c.tipo_cuenta === 'cliente').map(c => c.cuenta_id).filter(Boolean)
    const agenciaIds = upcoming.filter(c => c.tipo_cuenta === 'agencia').map(c => c.cuenta_id).filter(Boolean)
    const [clientesRes, agenciasRes] = await Promise.all([
      clienteIds.length ? supabase.from('clientes').select('id, nombre').in('id', clienteIds) : { data: [] },
      agenciaIds.length ? supabase.from('agencias').select('id, nombre').in('id', agenciaIds) : { data: [] },
    ])
    const cuentaMap: Record<string, string> = {}
    ;(clientesRes.data ?? []).forEach((c: { id: string; nombre: string }) => { cuentaMap[c.id] = c.nombre })
    ;(agenciasRes.data ?? []).forEach((a: { id: string; nombre: string }) => { cuentaMap[a.id] = a.nombre })

    return NextResponse.json(upcoming.map(c => ({ ...c, cuenta_nombre: c.cuenta_id ? (cuentaMap[c.cuenta_id] ?? '') : '' })))
  }

  let query = supabase.from('contactos').select('*').eq('activo', true).order('nombres')
  if (cuentaId) query = query.eq('cuenta_id', cuentaId) as typeof query

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json()
  const supabase = createServerClient()

  // Bulk import
  if (body.items && Array.isArray(body.items)) {
    // Load existing clientes and agencias for matching
    const [{ data: clientes }, { data: agencias }] = await Promise.all([
      supabase.from('clientes').select('id, nombre'),
      supabase.from('agencias').select('id, nombre'),
    ])
    const clienteMap = new Map((clientes ?? []).map((c: { id: string; nombre: string }) => [c.nombre.toLowerCase().trim(), c.id]))
    const agenciaMap = new Map((agencias ?? []).map((a: { id: string; nombre: string }) => [a.nombre.toLowerCase().trim(), a.id]))

    const toInsert = []
    for (const item of body.items) {
      const empresa = (item.nombre_empresa ?? item.razon_social ?? '').toLowerCase().trim()
      let cuenta_id: string | null = null
      let tipo_cuenta = 'cliente'
      if (agenciaMap.has(empresa)) {
        cuenta_id = agenciaMap.get(empresa)!
        tipo_cuenta = 'agencia'
      } else if (clienteMap.has(empresa)) {
        cuenta_id = clienteMap.get(empresa)!
        tipo_cuenta = 'cliente'
      }
      toInsert.push({
        cuenta_id,
        tipo_cuenta,
        nombres: item.nombres || null,
        apellidos: item.apellidos || null,
        telefono1: item.telefono1 ? String(item.telefono1) : null,
        telefono2: item.telefono2 ? String(item.telefono2) : null,
        mail1: item.mail1 || null,
        mail2: item.mail2 || null,
        cumple_dia: item.cumple_dia ? parseInt(item.cumple_dia) || null : null,
        cumple_mes: item.cumple_mes ? parseInt(item.cumple_mes) || null : null,
      })
    }

    // Insert, ignore duplicates by mail1
    const results = []
    for (const c of toInsert) {
      if (c.mail1) {
        const { data: existing } = await supabase.from('contactos').select('id').eq('mail1', c.mail1).single()
        if (existing) {
          await supabase.from('contactos').update({ ...c, updated_at: new Date().toISOString() }).eq('id', existing.id)
          results.push({ mail: c.mail1, status: 'actualizado' })
          continue
        }
      }
      const { error } = await supabase.from('contactos').insert(c)
      results.push({ mail: c.mail1 ?? c.nombres, status: error ? `error: ${error.message}` : 'creado' })
    }
    return NextResponse.json({ results, total: results.length })
  }

  // Single insert
  const { data, error } = await supabase.from('contactos').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
