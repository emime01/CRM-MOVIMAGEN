import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CotizacionesClient from './CotizacionesClient'

export default async function CotizacionesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  return <CotizacionesClient rol={session.user.rol} userId={session.user.id} />
}
