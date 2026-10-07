import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { puede, es } from '@/lib/auth/roles'

// GET /api/propuestas?lead_id=&estado=
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const leadId = searchParams.get('lead_id')
  const estado = searchParams.get('estado')

  const isManager = puede(session.user.rol, ['gerente_comercial', 'administracion', 'asistente_ventas'])

  let query = supabase
    .from('propuestas')
  // El embed de leads va desambiguado por la columna (leads!lead_id): hay dos
  // relaciones entre propuestas y leads (propuestas.lead_id y
  // leads.propuesta_ganadora_id) y sin esa pista PostgREST corta con
  // "more than one relationship was found" y se cae toda la sección.
    .select(`
      id, numero, nombre, estado, moneda, monto_neto, monto_total,
      fecha_inicio, fecha_fin, created_at, updated_at,
      lead_id, cliente_id,
      vendedor_id,
      clientes(id, nombre, empresa),
      leads!lead_id(id, descripcion),
      perfiles(id, nombre)
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (!isManager) query = query.eq('vendedor_id', session.user.id)
  if (leadId) query = query.eq('lead_id', leadId)
  if (estado) query = query.eq('estado', estado)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ propuestas: data ?? [] })
}

// POST /api/propuestas
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puede(session.user.rol, ['vendedor', 'asistente_ventas']))
    return NextResponse.json({ error: 'Sin permisos para crear cotizaciones' }, { status: 403 })

  const body = await req.json()
  const supabase = createServerClient()

  // Toda cotización nace de un lead. Antes era opcional y se podía cotizar
  // "suelto", lo que dejaba la sección de leads a medio usar y sin rastro de
  // dónde salió cada venta. El cliente y la agencia se toman del lead, no de
  // lo que mande el cliente web, para que no puedan quedar desalineados.
  const leadId: string | null = body.lead_id ?? null
  if (!leadId) {
    return NextResponse.json(
      { error: 'Las cotizaciones se crean desde un lead. Abrí el lead y usá "Cotizar".' },
      { status: 400 },
    )
  }

  const { data: lead } = await supabase
    .from('leads')
    .select('id, cliente_id, agencia_id, vendedor_id, campana, agencias(porcentaje_comision, porcentaje_comision_produccion)')
    .eq('id', leadId)
    .maybeSingle()

  if (!lead) return NextResponse.json({ error: 'El lead no existe' }, { status: 404 })
  const agenciaDelLead = (Array.isArray(lead.agencias) ? lead.agencias[0] : lead.agencias) as
    { porcentaje_comision: number | null; porcentaje_comision_produccion: number | null } | null
  if (session.user.rol === 'vendedor' && lead.vendedor_id !== session.user.id) {
    return NextResponse.json({ error: 'Ese lead no es tuyo' }, { status: 403 })
  }

  // Auto-generate numero
  const { data: seqRow } = await supabase.rpc('nextval', { seq: 'propuestas_numero_seq' }).single()
  const numero = `COT-${String((seqRow as any) ?? Math.floor(Math.random() * 9000) + 1000).padStart(4, '0')}`

  const { data, error } = await supabase
    .from('propuestas')
    .insert({
      lead_id:        leadId,
      cliente_id:     lead.cliente_id,
      agencia_id:     lead.agencia_id ?? null,
      // La campaña se declara en el lead y viaja sola hasta el comprobante.
      campana:        lead.campana ?? null,
      vendedor_id:    session.user.id,
      numero,
      nombre:         body.nombre ?? null,
      marca:          body.marca ?? null,
      observaciones:  body.observaciones ?? null,
      estado:         'borrador',
      notas:          body.notas ?? null,
      fecha_inicio:   body.fecha_inicio ?? null,
      fecha_fin:      body.fecha_fin ?? null,
      moneda:         body.moneda ?? 'UYU',
      monto_neto:     body.monto_neto ?? null,
      monto_arrendamiento: body.monto_arrendamiento ?? null,
      // Lo pactado en esta venta; si el vendedor todavía no lo cargó, se
      // precarga con lo recomendado de la agencia.
      comision_agencia_pct:      lead.agencia_id ? (body.comision_agencia_pct ?? agenciaDelLead?.porcentaje_comision ?? null) : null,
      comision_agencia_prod_pct: lead.agencia_id ? (body.comision_agencia_prod_pct ?? agenciaDelLead?.porcentaje_comision_produccion ?? null) : null,
      monto_produccion:    body.monto_produccion ?? null,
      monto_total:    body.monto_total ?? null,
      monto_impactos: body.monto_impactos ?? null,
    })
    .select('id, numero')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (body.items?.length) {
    const rows = body.items.map((it: any) => ({
      propuesta_id:      data.id,
      soporte_id:        it.soporte_id ?? null,
      nombre_soporte:    it.nombre_soporte,
      ubicacion:         it.ubicacion ?? null,
      categoria_soporte: it.categoria_soporte ?? null,
      tipo_cotizador:    it.tipo_cotizador ?? null,
      cantidad:          it.cantidad ?? 1,
      cantidad_soportes: it.cantidad_soportes ?? it.cantidad ?? 1,
      salidas_elegidas:  it.salidas_elegidas ?? null,
      semanas:           it.semanas ?? 1,
      precio_unitario:   it.precio_unitario,
      subtotal:          it.subtotal ?? null,
      impactos_calc:     it.impactos_calc ?? null,
    }))
    await supabase.from('propuesta_items').insert(rows)
  }

  return NextResponse.json({ id: data.id, numero: data.numero }, { status: 201 })
}
