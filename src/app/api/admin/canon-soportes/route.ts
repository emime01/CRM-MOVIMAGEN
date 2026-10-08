import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { es } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

/** GET /api/admin/canon-soportes — en qué shopping(s) está cada soporte. */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!es(session.user.rol, 'administracion')) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const supabase = createServerClient()
  const { data, error } = await supabase.from('canon_soporte_shoppings').select('soporte_id, shopping_id, peso')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ asignaciones: data ?? [] })
}

/**
 * PUT /api/admin/canon-soportes  { soporte_id, shopping_id, asignado: boolean, peso? }
 *
 * Un soporte puede estar en varios shoppings: es un circuito, y su canon se
 * reparte entre ellos.
 */
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!es(session.user.rol, 'administracion')) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  let body: { soporte_id?: string; shopping_id?: string; asignado?: boolean; peso?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }
  if (!body.soporte_id || !body.shopping_id) return NextResponse.json({ error: 'Faltan soporte o shopping' }, { status: 400 })

  const supabase = createServerClient()
  if (body.asignado === false) {
    const { error } = await supabase.from('canon_soporte_shoppings').delete()
      .eq('soporte_id', body.soporte_id).eq('shopping_id', body.shopping_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const peso = body.peso == null ? 1 : Number(body.peso)
    if (!Number.isFinite(peso) || peso <= 0) return NextResponse.json({ error: 'Peso inválido' }, { status: 400 })
    const { error } = await supabase.from('canon_soporte_shoppings')
      .upsert({ soporte_id: body.soporte_id, shopping_id: body.shopping_id, peso }, { onConflict: 'soporte_id,shopping_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // soportes.canon_shopping_id queda como el primero, por compatibilidad con
  // lo que todavía lo lea.
  const { data: quedan } = await supabase.from('canon_soporte_shoppings').select('shopping_id').eq('soporte_id', body.soporte_id).limit(1)
  await supabase.from('soportes').update({ canon_shopping_id: quedan?.[0]?.shopping_id ?? null }).eq('id', body.soporte_id)

  return NextResponse.json({ ok: true })
}
