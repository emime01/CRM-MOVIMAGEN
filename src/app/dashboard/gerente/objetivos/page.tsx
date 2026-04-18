import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import ObjetivosClient from './ObjetivosClient'

export const dynamic = 'force-dynamic'

const y = new Date().getFullYear()
const CUATRIMESTRES = [`Q1-${y}`, `Q2-${y}`, `Q3-${y}`]

export default async function ObjetivosPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!['asistente_ventas', 'gerente_comercial', 'administracion'].includes(session.user.rol)) redirect('/dashboard')

  const supabase = createServerClient()

  const [{ data: vendedores }, { data: objetivos }] = await Promise.all([
    supabase
      .from('perfiles')
      .select('id, nombre, rol')
      .in('rol', ['vendedor', 'asistente_ventas', 'gerente_comercial'])
      .eq('activo', true)
      .order('nombre'),
    supabase
      .from('objetivos')
      .select('vendedor_id, cuatrimestre, objetivo_monto')
      .in('cuatrimestre', CUATRIMESTRES),
  ])

  const objMap: Record<string, number> = {}
  objetivos?.forEach(o => {
    objMap[`${o.vendedor_id}-${o.cuatrimestre}`] = Number(o.objetivo_monto)
  })

  return (
    <ObjetivosClient
      vendedores={vendedores ?? []}
      objMap={objMap}
    />
  )
}
