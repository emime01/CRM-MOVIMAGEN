import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import CanonClient from './CanonClient'
import { haceAdministracion, pagaAdministracion } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

export default async function CanonPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!haceAdministracion(session.user.rol)) redirect('/dashboard')

  // El "canon contractual" (IMM, IMC) se sacó: las intendencias no cobran
  // canon, cobran los impuestos municipales, que ya van en cada venta. El
  // canon es el de los shoppings, con el mismo porcentaje para todos.
  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      <CanonClient paga={haceAdministracion(session.user.rol)} configura={pagaAdministracion(session.user.rol)} />
    </div>
  )
}
