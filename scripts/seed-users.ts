/**
 * Script CLI para sembrar / re-sembrar los 10 usuarios reales de Movimagen.
 *
 * Reemplaza al endpoint /api/seed-users que era inseguro (cualquier persona
 * con la URL + el secret hardcodeado podía resetear todas las passwords).
 *
 * Uso:
 *   1. Tener un .env.local con SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL)
 *      y SUPABASE_SERVICE_ROLE_KEY. NO se versiona, NO se expone al frontend.
 *   2. Correr en una terminal segura:
 *
 *        npx tsx scripts/seed-users.ts
 *
 *   3. Las passwords se imprimen una sola vez en STDOUT — compartilas de
 *      forma privada con cada usuario y pediles que las cambien al entrar.
 */
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'

// Carga simple de .env.local sin depender de dotenv
function loadEnvFile(path: string) {
  let content: string
  try { content = readFileSync(path, 'utf8') } catch { return }
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i)
    if (!m) continue
    const key = m[1]
    let val = m[2]
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = val
  }
}
loadEnvFile('.env.local')
loadEnvFile('.env')

const REAL_USERS = [
  { email: 'natalia@movimagen.com.uy',  nombre: 'Natalia',  rol: 'vendedor' },
  { email: 'federico@movimagen.com.uy', nombre: 'Federico', rol: 'vendedor' },
  { email: 'fabian@movimagen.com.uy',   nombre: 'Fabián',   rol: 'vendedor' },
  { email: 'emiliano@movimagen.com.uy', nombre: 'Emiliano', rol: 'asistente_ventas' },
  { email: 'gonzalo@movimagen.com.uy',  nombre: 'Gonzalo',  rol: 'gerente_comercial' },
  { email: 'belen@movimagen.com.uy',    nombre: 'Belén',    rol: 'administracion' },
  { email: 'romina@movimagen.com.uy',   nombre: 'Romina',   rol: 'administracion' },
  { email: 'mauricio@movimagen.com.uy', nombre: 'Mauricio', rol: 'administracion' },
  { email: 'emilia@movimagen.com.uy',   nombre: 'Emilia',   rol: 'operaciones' },
  { email: 'victoria@movimagen.com.uy', nombre: 'Victoria', rol: 'arte' },
] as const

function generarPassword(): string {
  // 12 chars alfanuméricos: fácil de copiar/pegar, suficiente entropía
  // (~71 bits) considerando que el usuario la cambia al primer login.
  return randomBytes(9).toString('base64url').slice(0, 12)
}

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('Falta SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y/o SUPABASE_SERVICE_ROLE_KEY en .env.local')
    process.exit(1)
  }

  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })

  const { data: { users: existingUsers }, error: listErr } = await supabase.auth.admin.listUsers()
  if (listErr) { console.error('Error listando usuarios:', listErr.message); process.exit(1) }
  const byEmail = new Map(existingUsers.map(u => [u.email, u]))

  const resultados: { email: string; nombre: string; rol: string; password: string; status: string }[] = []

  for (const u of REAL_USERS) {
    const password = generarPassword()
    const existing = byEmail.get(u.email)
    let status: string

    if (existing) {
      const { error } = await supabase.auth.admin.updateUserById(existing.id, { password, email_confirm: true })
      if (error) { resultados.push({ ...u, password: '—', status: `error: ${error.message}` }); continue }
      // Asegurar perfil
      const { data: perfil } = await supabase.from('perfiles').select('id, rol, nombre').eq('user_id', existing.id).maybeSingle()
      if (!perfil) {
        await supabase.from('perfiles').insert({ user_id: existing.id, nombre: u.nombre, rol: u.rol, porcentaje_comision: 6 })
      } else if (perfil.rol !== u.rol || perfil.nombre !== u.nombre) {
        await supabase.from('perfiles').update({ rol: u.rol, nombre: u.nombre }).eq('id', perfil.id)
      }
      status = 'password reseteada'
    } else {
      const { data, error } = await supabase.auth.admin.createUser({ email: u.email, password, email_confirm: true })
      if (error || !data.user) { resultados.push({ ...u, password: '—', status: `error: ${error?.message}` }); continue }
      await supabase.from('perfiles').insert({ user_id: data.user.id, nombre: u.nombre, rol: u.rol, porcentaje_comision: 6 })
      status = 'creado'
    }

    resultados.push({ ...u, password, status })
  }

  console.log('\n=== Resultado ===\n')
  for (const r of resultados) {
    console.log(`  ${r.email.padEnd(32)} ${r.rol.padEnd(20)} ${r.password.padEnd(14)} (${r.status})`)
  }
  console.log('\nCompartí cada password de forma privada (1Password, Signal) y pedile a cada usuario que la cambie al entrar.')
}

main().catch(err => { console.error(err); process.exit(1) })
