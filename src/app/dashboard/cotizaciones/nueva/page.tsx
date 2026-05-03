import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CotizadorClient from '../[id]/CotizadorClient'

interface Props {
  searchParams: { lead_id?: string; cliente_id?: string }
}

export default async function NuevaCotizacionPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  return (
    <CotizadorClient
      propuestaId={null}
      rol={session.user.rol}
      userId={session.user.id}
      initialLeadId={searchParams.lead_id ?? null}
      initialClienteId={searchParams.cliente_id ?? null}
    />
  )
}
