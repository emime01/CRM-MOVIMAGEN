import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import TasksClient from './TasksClient'
import { puede } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

const ALLOWED = ['arte', 'operaciones', 'administracion', 'gerente_comercial']

export default async function TasksPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!puede(session.user.rol, ALLOWED)) redirect('/dashboard')

  return <TasksClient userRol={session.user.rol} userId={session.user.id} />
}
