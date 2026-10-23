import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { puede } from '@/lib/auth/roles'
import { tokenDeGoogle } from '@/lib/google-token'
import { listEvents } from '@/lib/calendar'

export const dynamic = 'force-dynamic'

/**
 * Los vendedores, cuyos calendarios ve el gerente. La asistente de ventas
 * (Magaly) no vende: no entra en el equipo de vendedores.
 */
const ROLES_EQUIPO = ['vendedor']

/** Los perfiles de prueba automática no son personas del equipo. */
const esDePrueba = (nombre: string | null) => (nombre ?? '').startsWith('[PRUEBA]')

/**
 * GET /api/calendar/equipo?from=ISO&to=ISO
 *
 * Los eventos de Google Calendar de todo el equipo comercial, para que el
 * gerente vea las reuniones y llamadas de cada vendedor. Se leen con la
 * conexión a Google que cada uno ya hizo en su perfil; los que no
 * conectaron vuelven en `sin_conectar`.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puede(session.user.rol, ['gerente_comercial'])) {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const from = new Date(searchParams.get('from') ?? Date.now())
  const to = new Date(searchParams.get('to') ?? Date.now() + 31 * 86400000)
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return NextResponse.json({ error: 'Fechas inválidas' }, { status: 400 })

  const supabase = createServerClient()
  const { data: equipo } = await supabase
    .from('perfiles')
    .select('id, nombre')
    .in('rol', ROLES_EQUIPO)
    .eq('activo', true)
    .neq('id', session.user.id)
    .order('nombre')

  const sinConectar: string[] = []
  const conError: string[] = []
  const porPersona = await Promise.all((equipo ?? []).filter(p => !esDePrueba(p.nombre)).map(async p => {
    try {
      const token = await tokenDeGoogle(supabase, p.id)
      if (!token) { sinConectar.push(p.nombre); return [] }
      const evs = await listEvents(token, from, to)
      return evs.map(e => ({ ...e, vendedor_id: p.id, vendedor: p.nombre }))
    } catch {
      // Permiso de Calendar vencido o revocado: se avisa, no se cae todo.
      conError.push(p.nombre)
      return []
    }
  }))

  return NextResponse.json({ eventos: porPersona.flat(), sin_conectar: sinConectar, con_error: conError })
}
