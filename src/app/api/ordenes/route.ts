import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { puede } from '@/lib/auth/roles'
import { crearVentaManual, validarVentaManual, type VentaManualPayload } from '@/lib/ventas/crear-venta-manual'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }
  // Antes sólo pedía sesión: arte u operaciones podían crear ventas.
  if (!puede(session.user.rol, ['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion'])) {
    return NextResponse.json({ error: 'Tu rol no puede crear ventas' }, { status: 403 })
  }

  let body: VentaManualPayload
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const invalida = validarVentaManual(body)
  if (invalida) return NextResponse.json({ error: invalida }, { status: 400 })

  const r = await crearVentaManual(createServerClient(), body, { id: session.user.id, rol: session.user.rol })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json({ id: r.id }, { status: 201 })
}

