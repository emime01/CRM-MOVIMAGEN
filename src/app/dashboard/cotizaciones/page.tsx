import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CotizacionesClient from './CotizacionesClient'
import { puede } from '@/lib/auth/roles'

export default async function CotizacionesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!puede(session.user.rol, ['vendedor', 'asistente_ventas', 'gerente_comercial'])) redirect('/dashboard')

  return <CotizacionesClient rol={session.user.rol} userId={session.user.id} />
}
