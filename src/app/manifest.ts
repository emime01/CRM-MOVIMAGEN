import type { MetadataRoute } from 'next'

// La app instalable del CRM (PWA): desde el celular, "Agregar a pantalla de
// inicio" la deja con su ícono y a pantalla completa, como una app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'CRM Movimagen',
    short_name: 'Movimagen',
    description: 'Sistema de gestión comercial de Movimagen',
    id: '/dashboard',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#EB691C',
    theme_color: '#EB691C',
    lang: 'es-UY',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
    shortcuts: [
      { name: 'Tareas', url: '/dashboard/tasks', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Ventas', url: '/dashboard/ventas', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Disponibilidad', url: '/dashboard/disponibilidad', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  }
}
