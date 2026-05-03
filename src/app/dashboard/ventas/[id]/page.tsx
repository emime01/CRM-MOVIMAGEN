import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { redirect, notFound } from 'next/navigation'
import OrdenDetalleClient from './OrdenDetalleClient'

export const dynamic = 'force-dynamic'

export default async function OrdenDetallePage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')

  const supabase = createServerClient()

  const { data: orden } = await supabase
    .from('ordenes_venta')
    .select(`
      id, numero, estado, moneda, monto_total, created_at, updated_at,
      contacto, facturar_a, marca, referencia, validez,
      fecha_alta_prevista, fecha_baja_prevista, fecha_alta_real, fecha_baja_real,
      es_canje, incluir_reportes, es_mensualizada,
      tiene_produccion, tiene_digital,
      forma_pago_arrend, comentario_arrend,
      forma_pago_prod, comentario_prod,
      detalles_texto, adjunto_url,
      motivo_rechazo, aprobado_at,
      lead_id,
      cliente_id,
      clientes(id, nombre, empresa),
      agencias(id, nombre),
      perfiles!vendedor_id(id, nombre),
      orden_items(
        id, cantidad, semanas, salidas, segundos,
        precio_unitario, descuento_pct, nota,
        requiere_grabado, requiere_produccion,
        soportes(id, nombre, tipo, categoria, ubicacion)
      ),
      orden_historial(
        id, estado_nuevo, comentario, created_at,
        perfiles(nombre)
      ),
      orden_documentos(id, nombre, url, tipo, created_at)
    `)
    .eq('id', params.id)
    .single()

  if (!orden) notFound()

  const userId = (session.user as { id: string }).id
  const { data: tokenRow } = await supabase
    .from('google_tokens')
    .select('gmail_email')
    .eq('user_id', userId)
    .maybeSingle()

  // Fetch leads from same client to show lead history
  let leads: unknown[] = []
  if (orden.cliente_id) {
    const { data: leadsData } = await supabase
      .from('leads')
      .select(`
        id, descripcion, monto_potencial, cuatrimestre, estado, notas, created_at, updated_at,
        perfiles!leads_vendedor_id_fkey(nombre)
      `)
      .eq('cliente_id', orden.cliente_id)
      .order('created_at', { ascending: false })
    leads = leadsData ?? []
  }

  // Sort historial ascending
  const historial = (orden.orden_historial ?? []).sort(
    (a: { created_at: string }, b: { created_at: string }) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  )

  return (
    <OrdenDetalleClient
      orden={{ ...orden, orden_historial: historial } as any}
      leads={leads as any}
      userRol={session.user.rol}
      userId={session.user.id}
      driveConnected={!!tokenRow}
    />
  )
}
