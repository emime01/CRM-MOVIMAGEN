import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { ROL_ADMIN_SISTEMA } from '@/lib/auth/roles'
import { sesionAdminUsuarios, ROLES_ASIGNABLES, MIN_PASSWORD, emailValido } from '@/lib/usuarios-admin'

export const dynamic = 'force-dynamic'

/** PATCH /api/admin/usuarios/[id] { nombre?, email?, rol?, activo?, password? } */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const yo = await sesionAdminUsuarios()
  if (!yo) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  let body: { nombre?: unknown; email?: unknown; rol?: unknown; activo?: unknown; password?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: actual } = await supabase
    .from('perfiles').select('id, user_id, nombre, rol, activo').eq('id', params.id).maybeSingle()
  if (!actual) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })

  const esYo = actual.id === yo.id
  // Tocar a un administrador del sistema es sólo de otro administrador.
  if (actual.rol === ROL_ADMIN_SISTEMA && !yo.esAdminSistema) {
    return NextResponse.json({ error: 'Sólo un administrador del sistema puede modificar a otro' }, { status: 403 })
  }

  const cambiosPerfil: Record<string, unknown> = {}
  if (body.nombre !== undefined) {
    const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
    if (!nombre) return NextResponse.json({ error: 'Falta el nombre' }, { status: 400 })
    cambiosPerfil.nombre = nombre
  }
  if (body.rol !== undefined) {
    if (typeof body.rol !== 'string' || !ROLES_ASIGNABLES.includes(body.rol)) {
      return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
    }
    if (body.rol !== actual.rol) {
      if (body.rol === ROL_ADMIN_SISTEMA && !yo.esAdminSistema) {
        return NextResponse.json({ error: 'Sólo un administrador del sistema puede asignar ese rol' }, { status: 403 })
      }
      if (esYo && actual.rol === ROL_ADMIN_SISTEMA) {
        return NextResponse.json({ error: 'No podés quitarte tu propio rol de administrador' }, { status: 400 })
      }
      cambiosPerfil.rol = body.rol
    }
  }
  if (body.activo !== undefined) {
    if (typeof body.activo !== 'boolean') return NextResponse.json({ error: 'Valor de activo inválido' }, { status: 400 })
    if (esYo && body.activo === false) {
      return NextResponse.json({ error: 'No podés desactivarte a vos mismo' }, { status: 400 })
    }
    cambiosPerfil.activo = body.activo
  }

  const authUpdate: { email?: string; password?: string; email_confirm?: boolean } = {}
  if (body.email !== undefined) {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!emailValido(email)) return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
    authUpdate.email = email
    authUpdate.email_confirm = true
  }
  if (body.password !== undefined) {
    if (typeof body.password !== 'string' || body.password.length < MIN_PASSWORD) {
      return NextResponse.json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres` }, { status: 400 })
    }
    authUpdate.password = body.password
  }

  if (Object.keys(authUpdate).length) {
    if (!actual.user_id) return NextResponse.json({ error: 'El perfil no tiene usuario de acceso asociado' }, { status: 400 })
    const { error } = await supabase.auth.admin.updateUserById(actual.user_id as string, authUpdate)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }
  if (Object.keys(cambiosPerfil).length) {
    const { error } = await supabase.from('perfiles').update(cambiosPerfil).eq('id', actual.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
