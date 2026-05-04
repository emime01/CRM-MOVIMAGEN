import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

const LEADS_ROLES = ['vendedor', 'gerente_comercial']

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!LEADS_ROLES.includes(session.user.rol)) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  let body: {
    clienteId?: string
    agenciaId?: string
    vendedorId?: string
    descripcion?: string
    montoPotencial?: number
    cuatrimestre?: string
    estado?: string
    notas?: string
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const supabase = createServerClient()
  const vendedorId = body.vendedorId || session.user.id

  const { data, error } = await supabase
    .from('leads')
    .insert({
      vendedor_id: vendedorId,
      cliente_id: body.clienteId || null,
      agencia_id: body.agenciaId || null,
      descripcion: body.descripcion || null,
      monto_potencial: body.montoPotencial ?? null,
      cuatrimestre: body.cuatrimestre || null,
      estado: body.estado || 'nuevo',
      notas: body.notas || null,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id }, { status: 201 })
}
