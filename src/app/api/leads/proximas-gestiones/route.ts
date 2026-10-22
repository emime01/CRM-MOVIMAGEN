import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { puede } from '@/lib/auth/roles'
import { hoyUY } from '@/lib/fechas'

export const dynamic = 'force-dynamic'

/**
 * GET /api/leads/proximas-gestiones?ventana=14&vendedor=
 *
 * Lista los leads activos con próxima gestión clasificados para el semáforo:
 *   rojo:    proxima_gestion < hoy (atrasada)
 *   amarillo: proxima_gestion = hoy
 *   verde:   proxima_gestion > hoy y dentro de la ventana
 *
 * Default ventana: 14 días. Default scope: los leads del usuario logueado,
 * sea cual sea su rol. Gerencia, asistente de ventas y Administración pueden
 * pasar ?vendedor=<id> para ver los de otro, o ?vendedor=todos.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const ventanaDias = Math.max(1, Math.min(60, Number(searchParams.get('ventana') ?? 14)))
  const vendedorFiltro = searchParams.get('vendedor')

  // Fechas en hora de Uruguay: en UTC, de noche "hoy" ya era mañana.
  const hoy = hoyUY()
  const limite = hoyUY(new Date(Date.now() + ventanaDias * 86400000))

  const supabase = createServerClient()

  let q = supabase
    .from('leads')
    .select('id, descripcion, estado, monto_potencial, proxima_gestion, nota_gestion, vendedor_id, perfiles(nombre), clientes(nombre, empresa)')
    .not('proxima_gestion', 'is', null)
    .in('estado', ['nuevo', 'en_conversacion', 'propuesta_enviada', 'negociacion', 'en_seguimiento'])
    .lte('proxima_gestion', limite)
    .order('proxima_gestion', { ascending: true })
    .limit(50)

  // Cada uno ve sus gestiones. Antes sólo se filtraba al rol vendedor, así
  // que todos los demás (gerente, asistentes, operaciones, arte,
  // Administración) veían en su inicio las de todos los vendedores —en la
  // práctica, las de Fabián—. Ver las de otro es a pedido y sólo para
  // quienes supervisan.
  const supervisa = puede(session.user.rol, ['gerente_comercial', 'asistente_ventas', 'administracion'])
  if (supervisa && vendedorFiltro === 'todos') {
    // sin filtro
  } else if (supervisa && vendedorFiltro) {
    q = q.eq('vendedor_id', vendedorFiltro)
  } else {
    q = q.eq('vendedor_id', session.user.id)
  }

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = (data ?? []).map((l: any) => {
    const fecha = l.proxima_gestion as string
    const semaforo: 'rojo' | 'amarillo' | 'verde' =
      fecha < hoy ? 'rojo' : fecha === hoy ? 'amarillo' : 'verde'
    const diasFaltantes = Math.floor((Date.parse(fecha + 'T00:00:00') - Date.parse(hoy + 'T00:00:00')) / 86400000)
    return {
      id: l.id,
      descripcion: l.descripcion,
      estado: l.estado,
      monto_potencial: l.monto_potencial,
      proxima_gestion: l.proxima_gestion,
      nota_gestion: l.nota_gestion,
      vendedor: Array.isArray(l.perfiles) ? l.perfiles[0]?.nombre : l.perfiles?.nombre,
      cliente: (Array.isArray(l.clientes) ? l.clientes[0] : l.clientes)?.empresa
            ?? (Array.isArray(l.clientes) ? l.clientes[0] : l.clientes)?.nombre
            ?? null,
      semaforo,
      dias_faltantes: diasFaltantes,
    }
  })

  return NextResponse.json({
    items,
    resumen: {
      rojo:     items.filter(i => i.semaforo === 'rojo').length,
      amarillo: items.filter(i => i.semaforo === 'amarillo').length,
      verde:    items.filter(i => i.semaforo === 'verde').length,
    },
  })
}
