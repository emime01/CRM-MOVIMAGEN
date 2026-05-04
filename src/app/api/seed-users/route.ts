import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const REAL_USERS = [
  { email: 'natalia@movimagen.com.uy',   nombre: 'Natalia',   rol: 'vendedor' },
  { email: 'federico@movimagen.com.uy',  nombre: 'Federico',  rol: 'vendedor' },
  { email: 'fabian@movimagen.com.uy',    nombre: 'Fabián',    rol: 'vendedor' },
  { email: 'emiliano@movimagen.com.uy',  nombre: 'Emiliano',  rol: 'asistente_ventas' },
  { email: 'gonzalo@movimagen.com.uy',   nombre: 'Gonzalo',   rol: 'gerente_comercial' },  // CEO → mapeado a gerente_comercial
  { email: 'belen@movimagen.com.uy',     nombre: 'Belén',     rol: 'administracion' },
  { email: 'romina@movimagen.com.uy',    nombre: 'Romina',    rol: 'administracion' },
  { email: 'mauricio@movimagen.com.uy',  nombre: 'Mauricio',  rol: 'administracion' },
  { email: 'emilia@movimagen.com.uy',    nombre: 'Emilia',    rol: 'operaciones' },
  { email: 'victoria@movimagen.com.uy',  nombre: 'Victoria',  rol: 'arte' },
]

const DEFAULT_PASSWORD = 'Movimagen2026'

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

  for (const u of REAL_USERS) {
    const existingAuthUser = existingByEmail.get(u.email)

    if (existingAuthUser) {
      // Reset password + ensure email is confirmed for every existing user
      const { error: pwError } = await supabase.auth.admin.updateUserById(existingAuthUser.id, {
        password: DEFAULT_PASSWORD,
        email_confirm: true,
      })

      const { data: perfiles } = await supabase
        .from('perfiles')
        .select('id, rol, nombre')
        .eq('user_id', existingAuthUser.id)

      let perfilStatus = ''
      if (perfiles && perfiles.length > 0) {
        const p = perfiles[0]
        if (p.rol !== u.rol || p.nombre !== u.nombre) {
          await supabase.from('perfiles').update({ rol: u.rol, nombre: u.nombre }).eq('id', p.id)
          perfilStatus = 'perfil actualizado'
        } else {
          perfilStatus = 'perfil ok'
        }
      } else {
        const { error: perfilError } = await supabase.from('perfiles').insert({
          user_id: existingAuthUser.id,
          nombre: u.nombre,
          rol: u.rol,
          porcentaje_comision: 6,
        })
        perfilStatus = perfilError ? `error perfil: ${perfilError.message}` : 'perfil creado'
      }

      results.push({
        email: u.email,
        status: pwError ? `error contraseña: ${pwError.message}` : `contraseña reseteada ✓ — ${perfilStatus}`,
      })
      continue
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: u.email,
      password: DEFAULT_PASSWORD,
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
    contraseña_todos: DEFAULT_PASSWORD,
    usuarios: results,
  })
}
