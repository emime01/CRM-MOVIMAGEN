import { redirect } from 'next/navigation'

/**
 * La Agenda se juntó con el Calendario: las reuniones de Google son una capa
 * más. Queda la dirección para los enlaces viejos ("Agendar" desde un lead).
 */
export default function AgendaPage({ searchParams }: { searchParams: { lead?: string } }) {
  redirect(searchParams.lead ? `/dashboard/calendario?lead=${encodeURIComponent(searchParams.lead)}` : '/dashboard/calendario')
}
