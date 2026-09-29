import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

/**
 * GET /api/tasks?rol=&estado=&limite=
 *
 * Lista las tareas. Los roles arte y operaciones solo ven las de su rol.
 * Admin y gerente pueden ver todas pasando el filtro ?rol=.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const userRol = session.user.rol
  const filterRol = searchParams.get('rol')
  const estado = searchParams.get('estado')
  const limite = Number(searchParams.get('limite') ?? 100)

  // arte / operaciones: forzar a ver solo su rol
  const effectiveRol = (userRol === 'arte' || userRol === 'operaciones') ? userRol : filterRol

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
      .order('fecha_limite', { ascending: true, nullsFirst: false })
      .limit(limite)
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
