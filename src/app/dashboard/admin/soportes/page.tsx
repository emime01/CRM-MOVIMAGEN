import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'
import SoportesClient from './SoportesClient'

export const dynamic = 'force-dynamic'

export interface SoporteRow {
  id: string
  nombre: string
  categoria: string | null
  tipo: string | null
  seccion: string | null
  ubicacion: string | null
  precio_base: number | null
  precio_semanal: number | null
  tiene_iva: boolean
  activo: boolean
}

export default async function SoportesPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if (!['asistente_ventas', 'administracion'].includes(session.user.rol)) redirect('/dashboard')

  const supabase = createServerClient()
  const { data: soportes } = await supabase
    .from('soportes')
    .select('id, nombre, categoria, tipo, seccion, ubicacion, precio_base, precio_semanal, tiene_iva, activo')
    .order('activo', { ascending: false })
    .order('seccion', { nullsFirst: false })
    .order('nombre')

  return <SoportesClient initialSoportes={(soportes ?? []) as SoporteRow[]} />
}
