import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { recalcularObjetivos } from '@/lib/objetivos/recalcular'
import { pickAllowed } from '@/lib/api/safe-patch'

export const dynamic = 'force-dynamic'

// Campos que cualquier rol con permiso puede setear al crear un cliente.
const CREATE_FIELDS = [
  'nombre',
  'empresa',
  'email',
  'telefono',
  'rut',
  'notas',
  'tipo_cliente',
  'agencia_id',
  'logo_url',
] as const

const CREATE_ROLES = ['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion']

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const includeInactivo = searchParams.get('all') === 'true'
  const supabase = createServerClient()
  let query = supabase.from('clientes').select('id, nombre, empresa, email, telefono, rut, notas, activo, tipo_cliente, vendedor_id, agencia_id, logo_url, perfiles!clientes_vendedor_id_fkey(nombre)').order('nombre')
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

  // Bulk import (from Excel: AGENCIA, CONTACTO AGENCIA, CONTACTO CLIENTE, CLIENTE, EJEC VTAS, PORCENTAJE, C1, C2, C3)
  if (body.items && Array.isArray(body.items)) {
    const { data: perfiles } = await supabase.from('perfiles').select('id, nombre').in('rol', ['vendedor', 'asistente_ventas', 'gerente_comercial'])

    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
    const perfilList = (perfiles ?? []) as { id: string; nombre: string }[]

    /**
     * Resuelve el vendedor por nombre. Devuelve también por qué falló, para
     * poder avisarlo: antes, cuando no resolvía, el cliente se guardaba sin
     * dueño y la importación igual reportaba éxito — así quedaron cientos de
     * clientes sin vendedor y sus objetivos sin sumar para nadie.
     */
    const findVendedor = (ejecVtas: string): { id: string | null; motivo?: 'vacio' | 'sin_match' | 'ambiguo' } => {
      if (!ejecVtas?.trim()) return { id: null, motivo: 'vacio' }
      const v = norm(ejecVtas)

      const exacto = perfilList.find(p => norm(p.nombre) === v)
      if (exacto) return { id: exacto.id }

      // Parcial en los dos sentidos: "Fabián" contra "Fabian Cairele".
      const parciales = perfilList.filter(p => v.includes(norm(p.nombre)) || norm(p.nombre).includes(v))
      if (parciales.length === 1) return { id: parciales[0].id }
      // Con más de un candidato no se adivina: elegir el primero asignaba
      // clientes al vendedor equivocado en silencio.
      if (parciales.length > 1) return { id: null, motivo: 'ambiguo' }
      return { id: null, motivo: 'sin_match' }
    }

    const results = []
    /** Filas que quedaron sin dueño, para devolverlas y que se puedan arreglar. */
    const sinVendedor: { cliente: string; ejec_vtas: string; motivo: string }[] = []
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

      // Resolve vendedor (accent + partial-name tolerant)
      const resuelto = findVendedor(row.ejec_vtas ?? '')
      const vendedorId = resuelto.id
      if (!vendedorId) {
        sinVendedor.push({
          cliente: clienteNombre,
          ejec_vtas: (row.ejec_vtas ?? '').trim(),
          motivo: resuelto.motivo === 'vacio' ? 'sin ejecutivo en la planilla'
            : resuelto.motivo === 'ambiguo' ? 'coincide con más de un vendedor'
            : 'no coincide con ningún vendedor',
        })
      }

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

    // Recalcular los totales por vendedor a partir de los objetivos por cliente.
    const resumen = await recalcularObjetivos(supabase, year)

    return NextResponse.json({
      results,
      total: results.length,
      // Lo importante para quien importa: qué filas quedaron sin dueño. Sin
      // vendedor, el objetivo de ese cliente no suma para nadie.
      sin_vendedor: sinVendedor,
      sin_vendedor_total: sinVendedor.length,
      vendedores_con_objetivo: resumen.vendedores,
    })
  }

  // Single — allowlist para evitar mass-assignment
  if (!CREATE_ROLES.includes(session.user.rol)) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }
  const insertData: Record<string, unknown> = pickAllowed(body, CREATE_FIELDS)
  if (!insertData.nombre || String(insertData.nombre).trim() === '') {
    return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  }
  insertData.tipo_cliente = insertData.tipo_cliente ?? 'B'
  // El vendedor solo crea clientes propios; los roles administrativos pueden
  // asignar a cualquier vendedor (campo opcional del body).
  if (session.user.rol === 'vendedor') {
    insertData.vendedor_id = session.user.id
  } else if (body.vendedor_id !== undefined) {
    insertData.vendedor_id = body.vendedor_id || null
  }

  const { data, error } = await supabase.from('clientes').insert(insertData).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
