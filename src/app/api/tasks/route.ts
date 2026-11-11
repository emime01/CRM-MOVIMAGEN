import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { areasDeTarea } from '@/lib/auth/roles'

/**
 * GET /api/tasks?rol=&estado=&limite=&vista=tablero|historial&mes=AAAA-MM
 *
 * Lista las tareas. Los roles arte y operaciones solo ven las de su rol.
 * Admin y gerente pueden ver todas pasando el filtro ?rol=.
 *
 * vista=tablero: lo pendiente, lo en curso y lo terminado en los últimos
 *   días; lo terminado antes se va al historial y no ocupa el tablero.
 * vista=historial: lo terminado, lo último primero (opcional ?mes=).
 */
const DIAS_EN_LISTO = 3
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const userRol = session.user.rol
  const filterRol = searchParams.get('rol')
  const estado = searchParams.get('estado')
  const limite = Number(searchParams.get('limite') ?? 100)
  const vista = searchParams.get('vista')
  const mes = searchParams.get('mes')

  // arte y operaciones ven sólo lo suyo; el resto (gerencia, administración)
  // ve todo y puede filtrar. El rol mixto atiende las de operaciones.
  const areas = areasDeTarea(userRol)
  const effectiveRol = areas.length > 0 ? areas[0] : filterRol

  const supabase = createServerClient()

  const CAMPOS = `
      id, tipo, asignado_a_rol, estado, descripcion, fecha_limite, created_at, completed_at,
      ordenes_venta(id, numero, clientes(nombre, empresa)),
      soportes(nombre)`

  // `perfiles(nombre)` es quién tomó la tarea (tasks.asignado_a). Va aparte para
  // poder reintentar sin ese embed: si la relación no resolviera, el tablero
  // tiene que seguir funcionando igual, sólo sin las iniciales.
  const armarQuery = (campos: string) => {
    let q = supabase
      .from('tasks')
      .select(campos)
      .limit(limite)
    if (vista === 'historial') {
      q = q.eq('estado', 'completada').order('completed_at', { ascending: false, nullsFirst: false })
      if (mes && /^\d{4}-\d{2}$/.test(mes)) {
        const [y, m] = mes.split('-').map(Number)
        const hasta = new Date(Date.UTC(y, m, 1)).toISOString()
        q = q.gte('completed_at', `${mes}-01T00:00:00Z`).lt('completed_at', hasta)
      }
    } else {
      q = q.order('fecha_limite', { ascending: true, nullsFirst: false })
      if (vista === 'tablero') {
        const desde = new Date(Date.now() - DIAS_EN_LISTO * 86400000).toISOString()
        q = q.or(`estado.neq.completada,completed_at.gte.${desde}`)
      }
    }
    if (effectiveRol) q = q.eq('asignado_a_rol', effectiveRol)
    if (estado) q = q.eq('estado', estado)
    return q
  }

  let { data, error } = await armarQuery(`${CAMPOS}, perfiles(nombre)`)
  if (error) {
    ;({ data, error } = await armarQuery(CAMPOS))
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tasks: data ?? [] })
}
