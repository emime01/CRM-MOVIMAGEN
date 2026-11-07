import { redirect } from 'next/navigation'

// La Planilla digital se sacó: el contenido de las pantallas se maneja en el
// CMS de las pantallas y los archivos quedan en su servidor, así que acá era
// trabajo repetido. Queda la ruta para que un enlace guardado no dé 404.
export default function ArtePage() {
  redirect('/dashboard/tasks')
}
