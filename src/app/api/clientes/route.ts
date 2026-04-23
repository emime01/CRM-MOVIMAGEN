import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const includeInactivo = searchParams.get('all') === 'true'
  const supabase = createServerClient()
  let query = supabase.from('clientes').select('id, nombre, empresa, email, telefono, rut, notas, activo, tipo_cliente, vendedor_id, agencia_id, perfiles!clientes_vendedor_id_fkey(nombre)').order('nombre')
  if (!includeInactivo) query = query.eq('activo', true) as typeof query
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const body = await req.json()
  const supabase = createServerClient()

  // Bulk import (from Excel image 1: AGENCIA, CONTACTO AGENCIA, CONTACTO CLIENTE, CLIENTE, EJEC VTAS, PORCENTAJE, C1, C2, C3)
  if (body.items && Array.isArray(body.items)) {
    const { data: perfiles } = await supabase.from('perfiles').select('id, nombre').in('rol', ['vendedor', 'asistente_ventas', 'gerente_comercial'])
    const perfilMap = new Map((perfiles ?? []).map((p: { id: string; nombre: string }) => [p.nombre.toLowerCase().trim(), p.id]))

    const results = []
    const year = new Date().getFullYear()

    for (const row of body.items) {
      const agenciaNombre = (row.agencia ?? '').trim()
      const clienteNombre = (row.cliente ?? '').trim()
      if (!clienteNombre) continue

      // Upsert agencia
      let agenciaId: string | null = null
      if (agenciaNombre) {
        const { data: existingAg } = await supabase.from('agencias').select('id').ilike('nombre', agenciaNombre).maybeSingle()
        if (existingAg) {
          agenciaId = existingAg.id
        } else {
          const { data: newAg } = await supabase.from('agencias').insert({ nombre: agenciaNombre }).select('id').single()
          agenciaId = newAg?.id ?? null
        }
      }

      // Resolve vendedor
      const ejecVtas = (row.ejec_vtas ?? '').toLowerCase().trim()
      const vendedorId = perfilMap.get(ejecVtas) ?? null

      // Upsert cliente
      let clienteId: string | null = null
      const { data: existingCl } = await supabase.from('clientes').select('id').ilike('nombre', clienteNombre).maybeSingle()
      if (existingCl) {
        clienteId = existingCl.id
        await supabase.from('clientes').update({ vendedor_id: vendedorId ?? undefined, agencia_id: agenciaId ?? undefined, updated_at: new Date().toISOString() }).eq('id', clienteId)
      } else {
        const { data: newCl } = await supabase.from('clientes').insert({ nombre: clienteNombre, vendedor_id: vendedorId, agencia_id: agenciaId }).select('id').single()
        clienteId = newCl?.id ?? null
      }

      // Create contacto agencia
      if (agenciaId && row.contacto_agencia) {
        const { data: exCon } = await supabase.from('contactos').select('id').eq('cuenta_id', agenciaId).eq('nombres', row.contacto_agencia).maybeSingle()
        if (!exCon) {
          await supabase.from('contactos').insert({ cuenta_id: agenciaId, tipo_cuenta: 'agencia', nombres: row.contacto_agencia })
        }
      }

      // Create contacto cliente
      if (clienteId && row.contacto_cliente) {
        const { data: exCon } = await supabase.from('contactos').select('id').eq('cuenta_id', clienteId).eq('nombres', row.contacto_cliente).maybeSingle()
        if (!exCon) {
          await supabase.from('contactos').insert({ cuenta_id: clienteId, tipo_cuenta: 'cliente', nombres: row.contacto_cliente })
        }
      }

      // Upsert cliente_objetivos
      if (clienteId) {
        const ponderacion = parseFloat(String(row.ponderacion_pct ?? '100').replace('%', '')) || 100
        const c1 = parseFloat(String(row.c1 ?? '0').replace(/[^0-9.]/g, '')) || 0
        const c2 = parseFloat(String(row.c2 ?? '0').replace(/[^0-9.]/g, '')) || 0
        const c3 = parseFloat(String(row.c3 ?? '0').replace(/[^0-9.]/g, '')) || 0

        await supabase.from('cliente_objetivos').upsert({
          cliente_id: clienteId,
          vendedor_id: vendedorId,
          year,
          ponderacion_pct: ponderacion,
          objetivo_c1: c1,
          objetivo_c2: c2,
          objetivo_c3: c3,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'cliente_id,year' })
      }

      results.push({ cliente: clienteNombre, status: existingCl ? 'actualizado' : 'creado' })
    }

    // Aggregate cliente_objetivos → objetivos (sum per vendedor per cuatrimestre)
    const { data: coData } = await supabase
      .from('cliente_objetivos')
      .select('vendedor_id, objetivo_c1, objetivo_c2, objetivo_c3')
      .eq('year', year)
      .not('vendedor_id', 'is', null)

    const vendedorTotals: Record<string, Record<string, number>> = {}
    for (const co of coData ?? []) {
      if (!co.vendedor_id) continue
      if (!vendedorTotals[co.vendedor_id]) vendedorTotals[co.vendedor_id] = {}
      const vt = vendedorTotals[co.vendedor_id]
      vt[`Q1-${year}`] = (vt[`Q1-${year}`] ?? 0) + Number(co.objetivo_c1 ?? 0)
      vt[`Q2-${year}`] = (vt[`Q2-${year}`] ?? 0) + Number(co.objetivo_c2 ?? 0)
      vt[`Q3-${year}`] = (vt[`Q3-${year}`] ?? 0) + Number(co.objetivo_c3 ?? 0)
    }
    for (const [vendedorId, quarters] of Object.entries(vendedorTotals)) {
      for (const [cuatrimestre, monto] of Object.entries(quarters)) {
        await supabase.from('objetivos').delete().eq('vendedor_id', vendedorId).eq('cuatrimestre', cuatrimestre)
        if (monto > 0) {
          await supabase.from('objetivos').insert({ vendedor_id: vendedorId, cuatrimestre, objetivo_monto: monto })
        }
      }
    }

    return NextResponse.json({ results, total: results.length })
  }

  // Single
  const { data, error } = await supabase.from('clientes').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
