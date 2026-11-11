import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import TasksClient from './TasksClient'
import { puede } from '@/lib/auth/roles'
import AvisoBuses from '@/components/dashboard/AvisoBuses'

export const dynamic = 'force-dynamic'

const ALLOWED = ['arte', 'operaciones', 'administracion', 'gerente_comercial', 'asistente_administracion', 'vendedor', 'asistente_ventas']

export default async function TasksPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!puede(session.user.rol, ALLOWED)) redirect('/dashboard')

  return (
    <>
      {/* Emilia y Magaly (operaciones): lo que falta asignar en Buses. */}
      {puede(session.user.rol, ['operaciones']) && <AvisoBuses />}
      <TasksClient userRol={session.user.rol} userId={session.user.id} />
    </>
  )
}
