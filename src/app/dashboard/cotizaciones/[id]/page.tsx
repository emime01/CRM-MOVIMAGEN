import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CotizadorClient from './CotizadorClient'

export default async function CotizacionDetallePage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  return (
    <CotizadorClient
      propuestaId={params.id}
      rol={session.user.rol}
      userId={session.user.id}
    />
  )
}
