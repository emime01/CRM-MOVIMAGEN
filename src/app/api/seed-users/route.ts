import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const TEST_USERS = [
  { email: 'vendedor@test.com',     password: 'test1234', nombre: 'Vendedor Test',    rol: 'vendedor' },
  { email: 'asistente@test.com',    password: 'test1234', nombre: 'Asistente Test',   rol: 'asistente_ventas' },
  { email: 'gerente@test.com',      password: 'test1234', nombre: 'Gerente Test',     rol: 'gerente_comercial' },
  { email: 'operaciones@test.com',  password: 'test1234', nombre: 'Operaciones Test', rol: 'operaciones' },
  { email: 'arte@test.com',         password: 'test1234', nombre: 'Arte Test',        rol: 'arte' },
  { email: 'admin@test.com',        password: 'test1234', nombre: 'Admin Test',       rol: 'administracion' },
]

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const results: { email: string; status: string; detail?: string }[] = []

  for (const u of TEST_USERS) {
    // Check if perfil already exists (by email lookup in auth)
    const { data: existing } = await supabase
      .from('perfiles')
      .select('id, rol')
      .eq('rol', u.rol)
      .maybeSingle()

    if (existing) {
      results.push({ email: u.email, status: 'ya existe', detail: `perfil id: ${existing.id}` })
      continue
    }

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
    })

    if (authError) {
      results.push({ email: u.email, status: 'error auth', detail: authError.message })
      continue
    }

    // Create perfil
    const { error: perfilError } = await supabase.from('perfiles').insert({
      user_id: authData.user.id,
      nombre: u.nombre,
      rol: u.rol,
      porcentaje_comision: 6,
    })

    if (perfilError) {
      results.push({ email: u.email, status: 'error perfil', detail: perfilError.message })
    } else {
      results.push({ email: u.email, status: 'creado ✓' })
    }
  }

  return NextResponse.json({
    mensaje: 'Seed completado',
    contraseña_todos: 'test1234',
    usuarios: results,
  })
}
