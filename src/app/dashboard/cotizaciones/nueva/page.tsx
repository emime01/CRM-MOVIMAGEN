import { redirect } from 'next/navigation'

/**
 * Ruta vieja de "nueva cotización".
 *
 * Las cotizaciones ahora se crean únicamente desde un lead
 * (/dashboard/leads/[id]/cotizar). Se mantiene la ruta para que los enlaces y
 * favoritos guardados no caigan en un 404: si trae el lead, se redirige al
 * cotizador de ese lead; si no, a la lista de leads para que se elija uno.
 */
export default function NuevaCotizacionPage({
  searchParams,
}: {
  searchParams: { lead_id?: string; lead?: string }
}) {
  const leadId = searchParams.lead_id ?? searchParams.lead
  redirect(leadId ? `/dashboard/leads/${leadId}/cotizar` : '/dashboard/leads?cotizar=1')
}
