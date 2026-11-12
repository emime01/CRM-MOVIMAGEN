import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import UsuariosClient from './UsuariosClient'
import { puedeAdministrarUsuarios } from '@/lib/usuarios-admin'
import { esAdminSistema } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

export default async function UsuariosPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  const u = session.user as { id?: string; rol?: string }
  if (!puedeAdministrarUsuarios(u.rol)) redirect('/dashboard')
  return <UsuariosClient miId={u.id ?? ''} soyAdminSistema={esAdminSistema(u.rol)} />
}
