import { redirect } from 'next/navigation'

// Las "Muestras de color" y la Planilla digital se sacaron. Queda la ruta para
// que un enlace guardado no dé 404.
export default function ColoresPage() {
  redirect('/dashboard/tasks')
}
