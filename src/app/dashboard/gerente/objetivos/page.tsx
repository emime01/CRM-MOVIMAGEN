import { redirect } from 'next/navigation'

// La pantalla pasó a /dashboard/objetivos para que no dependa del layout de
// gerencia (pestañas de gerente) y la use también la asistente de ventas.
export default function ObjetivosLegacyPage() {
  redirect('/dashboard/objetivos')
}
