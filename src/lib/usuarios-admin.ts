import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { puede, esAdminSistema } from '@/lib/auth/roles'

export { ROLES_ASIGNABLES, ROL_LABELS, MIN_PASSWORD, emailValido } from '@/lib/usuarios-constantes'

/** Roles que pueden administrar usuarios (el admin del sistema pasa siempre). */
export const ROLES_ADMIN_USUARIOS = ['administracion', 'gerente_comercial'] as const

export function puedeAdministrarUsuarios(rol: string | null | undefined): boolean {
  return puede(rol, ROLES_ADMIN_USUARIOS)
}

/** Sesión del que llama, o null si no está autenticado o no tiene permiso. */
export async function sesionAdminUsuarios() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  const u = session.user as { id?: string; rol?: string }
  if (!puedeAdministrarUsuarios(u.rol)) return null
  return { id: u.id ?? '', rol: u.rol ?? '', esAdminSistema: esAdminSistema(u.rol) }
}
