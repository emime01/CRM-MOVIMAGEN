import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createServerClient()
  const { searchParams } = new URL(req.url)
  const tipo = searchParams.get('tipo')
  const categoria = searchParams.get('categoria')

  const canSeeAll = ['asistente_ventas', 'administracion', 'gerente_comercial'].includes(session.user.rol)
  const all = searchParams.get('all')

  let query = supabase
    .from('soportes')
    .select('id, nombre, categoria, tipo, seccion, ubicacion, precio_base, precio_semanal, tiene_iva, activo')
    .order('categoria')
    .order('nombre')

  if (!all || !canSeeAll) query = query.eq('activo', true)
  if (tipo) query = query.eq('tipo', tipo)
  if (categoria) query = query.eq('categoria', categoria)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ soportes: data ?? [] })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const canEdit = ['asistente_ventas', 'administracion', 'gerente_comercial'].includes(session.user.rol)
  if (!canEdit) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  let body: {
    nombre: string
    categoria?: string
    tipo?: string
    seccion?: string
    ubicacion?: string
    precio_base?: number
    precio_semanal?: number
    tiene_iva?: boolean
    items?: {
      nombre: string
      categoria?: string
      tipo?: string
      seccion?: string
      ubicacion?: string
      precio_semanal?: number
      tiene_iva: boolean
    }[]
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const supabase = createServerClient()

  // Bulk import
  if (body.items?.length) {
    const rows = body.items.map(item => ({
      nombre: item.nombre,
      categoria: item.categoria || null,
      tipo: item.tipo || null,
      seccion: item.seccion || null,
      ubicacion: item.ubicacion || null,
      precio_semanal: item.precio_semanal ?? null,
      tiene_iva: item.tiene_iva,
      activo: true,
    }))
    const { error } = await supabase.from('soportes').insert(rows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, count: rows.length }, { status: 201 })
  }

  if (!body.nombre) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })

  const { data, error } = await supabase
    .from('soportes')
    .insert({
      nombre: body.nombre,
      categoria: body.categoria || null,
      tipo: body.tipo || null,
      seccion: body.seccion || null,
      ubicacion: body.ubicacion || null,
      precio_base: body.precio_base ?? null,
      precio_semanal: body.precio_semanal ?? null,
      tiene_iva: body.tiene_iva ?? false,
      activo: true,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id }, { status: 201 })
}
