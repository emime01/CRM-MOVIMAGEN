import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import ObjetivosClient from './ObjetivosClient'
import { puede } from '@/lib/auth/roles'

export const dynamic = 'force-dynamic'

const y = new Date().getFullYear()
const CUATRIMESTRES = [`Q1-${y}`, `Q2-${y}`, `Q3-${y}`]

export default async function ObjetivosPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!puede(session.user.rol, ['asistente_ventas', 'gerente_comercial', 'administracion'])) redirect('/dashboard')

  const supabase = createServerClient()

  const [{ data: vendedores }, { data: objetivos }, { data: clienteObjetivos }] = await Promise.all([
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
    // Se traen TODOS, con y sin vendedor: los que no tienen dueño son
    // justamente los que hay que poder asignar desde acá. Antes se filtraban
    // y quedaban invisibles, con su objetivo sin sumar para nadie.
    supabase
      .from('cliente_objetivos')
      .select('cliente_id, vendedor_id, ponderacion_pct, objetivo_c1, objetivo_c2, objetivo_c3, clientes(nombre)')
      .eq('year', y),
  ])

  const objMap: Record<string, number> = {}
  objetivos?.forEach(o => {
    objMap[`${o.vendedor_id}-${o.cuatrimestre}`] = Number(o.objetivo_monto)
  })

  const todos = (clienteObjetivos ?? []) as any[]

  return (
    <ObjetivosClient
      vendedores={vendedores ?? []}
      objMap={objMap}
      clienteObjetivos={todos.filter(co => co.vendedor_id) as any}
      sinVendedor={todos.filter(co => !co.vendedor_id) as any}
      year={y}
    />
  )
}
