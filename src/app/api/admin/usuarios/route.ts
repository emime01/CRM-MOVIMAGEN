import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { ROL_ADMIN_SISTEMA } from '@/lib/auth/roles'
import { sesionAdminUsuarios, ROLES_ASIGNABLES, MIN_PASSWORD, emailValido } from '@/lib/usuarios-admin'

export const dynamic = 'force-dynamic'

/** GET /api/admin/usuarios — todos los perfiles con su email (de auth.users). */
export async function GET() {
  const yo = await sesionAdminUsuarios()
  if (!yo) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const supabase = createServerClient()
  const { data: perfiles, error } = await supabase
    .from('perfiles').select('id, user_id, nombre, rol, activo').order('nombre')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // El email vive en auth.users. Se pagina por si hay más de una página.
  const emails = new Map<string, string | null>()
  for (let page = 1; page <= 20; page++) {
    const { data, error: e } = await supabase.auth.admin.listUsers({ page, perPage: 1000 })
    if (e) return NextResponse.json({ error: e.message }, { status: 500 })
    data.users.forEach(u => emails.set(u.id, u.email ?? null))
    if (data.users.length < 1000) break
  }

  const usuarios = (perfiles ?? []).map(p => ({
    id: p.id, nombre: p.nombre, rol: p.rol, activo: p.activo !== false,
    email: emails.get(p.user_id as string) ?? null,
  }))
  return NextResponse.json({ usuarios })
}

/** POST /api/admin/usuarios { nombre, email, rol, password } */
export async function POST(req: NextRequest) {
  const yo = await sesionAdminUsuarios()
  if (!yo) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  let body: { nombre?: unknown; email?: unknown; rol?: unknown; password?: unknown }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
  }
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const rol = typeof body.rol === 'string' ? body.rol : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!nombre) return NextResponse.json({ error: 'Falta el nombre' }, { status: 400 })
  if (!emailValido(email)) return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  if (!ROLES_ASIGNABLES.includes(rol)) return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
  if (rol === ROL_ADMIN_SISTEMA && !yo.esAdminSistema) {
    return NextResponse.json({ error: 'Sólo un administrador del sistema puede asignar ese rol' }, { status: 403 })
  }
  if (password.length < MIN_PASSWORD) {
    return NextResponse.json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres` }, { status: 400 })
  }

  const supabase = createServerClient()
  const { data: creado, error: errAuth } = await supabase.auth.admin.createUser({ email, password, email_confirm: true })
  if (errAuth || !creado?.user) {
    return NextResponse.json({ error: errAuth?.message ?? 'No se pudo crear el usuario' }, { status: 400 })
  }

  const { data: perfil, error: errPerfil } = await supabase
    .from('perfiles').insert({ user_id: creado.user.id, nombre, rol, activo: true })
    .select('id').single()
  if (errPerfil || !perfil) {
    // Rollback: sin perfil el usuario de auth quedaría huérfano.
    await supabase.auth.admin.deleteUser(creado.user.id)
    return NextResponse.json({ error: errPerfil?.message ?? 'No se pudo crear el perfil' }, { status: 500 })
  }
  return NextResponse.json({ id: perfil.id }, { status: 201 })
}
