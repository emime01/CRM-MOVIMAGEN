import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import TasksClient from './TasksClient'

export const dynamic = 'force-dynamic'

const ALLOWED = ['arte', 'operaciones', 'administracion', 'gerente_comercial']

export default async function TasksPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!ALLOWED.includes(session.user.rol)) redirect('/dashboard')

  return <TasksClient userRol={session.user.rol} userId={session.user.id} />
}
