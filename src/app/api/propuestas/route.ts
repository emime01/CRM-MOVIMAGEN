import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

// GET /api/propuestas?lead_id=&estado=
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const leadId = searchParams.get('lead_id')
  const estado = searchParams.get('estado')

  const isManager = ['gerente_comercial', 'administracion', 'asistente_ventas'].includes(session.user.rol)

  let query = supabase
    .from('propuestas')
    .select(`
      id, numero, nombre, estado, moneda, monto_neto, monto_total,
      fecha_inicio, fecha_fin, created_at, updated_at,
      lead_id, cliente_id,
      vendedor_id,
      clientes(id, nombre, empresa),
      leads(id, descripcion),
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

  const body = await req.json()
  const supabase = createServerClient()

  // Auto-generate numero
  const { data: seqRow } = await supabase.rpc('nextval', { seq: 'propuestas_numero_seq' }).single()
  const numero = `COT-${String((seqRow as any) ?? Math.floor(Math.random() * 9000) + 1000).padStart(4, '0')}`

  const { data, error } = await supabase
    .from('propuestas')
    .insert({
      lead_id:        body.lead_id ?? null,
      cliente_id:     body.cliente_id ?? null,
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
