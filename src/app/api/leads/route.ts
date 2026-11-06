import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { puede } from '@/lib/auth/roles'

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
    campana?: string
    montoPotencial?: number
    cuatrimestre?: string
    estado?: string
    notas?: string
    proximaGestion?: string | null
    notaGestion?: string | null
  }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const supabase = createServerClient()
  // El vendedor solo puede crear leads a su nombre. Gerencia/administración
  // pueden asignar el lead a otro vendedor vía body.vendedorId.
  const puedeAsignar = puede(session.user.rol, ['gerente_comercial', 'administracion', 'asistente_ventas'])
  const vendedorId = puedeAsignar ? (body.vendedorId || session.user.id) : session.user.id

  const { data, error } = await supabase
    .from('leads')
    .insert({
      vendedor_id: vendedorId,
      cliente_id: body.clienteId || null,
      agencia_id: body.agenciaId || null,
      descripcion: body.descripcion || null,
      campana: body.campana || null,
      monto_potencial: body.montoPotencial ?? null,
      cuatrimestre: body.cuatrimestre || null,
      estado: body.estado || 'nuevo',
      // La nota de gestión cargada al crear también queda en el historial.
      notas: [body.notas, body.notaGestion ? `[${new Date().toLocaleDateString('es-UY', { timeZone: 'America/Montevideo', day: '2-digit', month: '2-digit', year: 'numeric' })}] ${body.notaGestion}` : null].filter(Boolean).join('\n') || null,
      // La fecha de la próxima gestión se carga al crear el lead; antes se
      // perdía y había que editarlo para que apareciera en el semáforo.
      proxima_gestion: body.proximaGestion || null,
      nota_gestion: body.notaGestion || null,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id }, { status: 201 })
}
