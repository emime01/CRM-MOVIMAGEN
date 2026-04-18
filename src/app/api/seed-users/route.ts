import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const TEST_USERS = [
  { email: 'vendedor@test.com',     password: 'test1234', nombre: 'Vendedor Test',    rol: 'vendedor' },
  { email: 'vendedor2@test.com',    password: 'test1234', nombre: 'Vendedor 2',       rol: 'vendedor' },
  { email: 'vendedor3@test.com',    password: 'test1234', nombre: 'Vendedor 3',       rol: 'vendedor' },
  { email: 'asistente@test.com',    password: 'test1234', nombre: 'Asistente Test',   rol: 'asistente_ventas' },
  { email: 'gerente@test.com',      password: 'test1234', nombre: 'Gerente Test',     rol: 'gerente_comercial' },
  { email: 'operaciones@test.com',  password: 'test1234', nombre: 'Operaciones Test', rol: 'operaciones' },
  { email: 'arte@test.com',         password: 'test1234', nombre: 'Arte Test',        rol: 'arte' },
  { email: 'admin@test.com',        password: 'test1234', nombre: 'Admin Test',       rol: 'administracion' },
]

// Allow running in production with a secret token
const SEED_SECRET = 'crm-seed-movimagen-2026'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('secret')

  if (process.env.NODE_ENV === 'production' && token !== SEED_SECRET) {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const results: { email: string; status: string; detail?: string }[] = []

  const { data: { users: existingUsers } } = await supabase.auth.admin.listUsers()
  const existingByEmail = new Map(existingUsers.map(u => [u.email, u]))

  for (const u of TEST_USERS) {
    const existingAuthUser = existingByEmail.get(u.email)

    if (existingAuthUser) {
      const { data: perfiles } = await supabase
        .from('perfiles')
        .select('id')
        .eq('user_id', existingAuthUser.id)

      if (perfiles && perfiles.length > 0) {
        results.push({ email: u.email, status: 'ya existe', detail: `perfil id: ${perfiles[0].id}` })
      } else {
        const { error: perfilError } = await supabase.from('perfiles').insert({
          user_id: existingAuthUser.id,
          nombre: u.nombre,
          rol: u.rol,
          porcentaje_comision: 6,
        })
        results.push({ email: u.email, status: perfilError ? `error perfil: ${perfilError.message}` : 'perfil creado ✓' })
      }
      continue
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
    })

    if (authError) {
      results.push({ email: u.email, status: 'error auth', detail: authError.message })
      continue
    }

    const { error: perfilError } = await supabase.from('perfiles').insert({
      user_id: authData.user.id,
      nombre: u.nombre,
      rol: u.rol,
      porcentaje_comision: 6,
    })

    results.push({
      email: u.email,
      status: perfilError ? `error perfil: ${perfilError.message}` : 'creado ✓',
    })
  }

  return NextResponse.json({
    mensaje: 'Seed completado',
    contraseña_todos: 'test1234',
    usuarios: results,
  })
}
