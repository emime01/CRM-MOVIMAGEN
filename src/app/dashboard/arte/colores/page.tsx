import { redirect } from 'next/navigation'

// La paleta de "Muestras de color" se sacó: no se usaba. Queda la ruta para
// que un enlace guardado no dé 404.
export default function ColoresPage() {
  redirect('/dashboard/arte')
}
