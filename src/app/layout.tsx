import type { Metadata, Viewport } from "next"
import "./globals.css"
import Providers from "./providers"
import RegistrarSW from "./RegistrarSW"

export const metadata: Metadata = {
  title: "CRM Movimagen",
  description: "Sistema de gestión comercial interno",
  applicationName: "CRM Movimagen",
  // iPhone: "Agregar a inicio" la abre a pantalla completa, con su ícono.
  appleWebApp: { capable: true, title: "Movimagen", statusBarStyle: "default" },
  icons: {
    icon: [{ url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/icon-180.png", sizes: "180x180" }],
  },
}

export const viewport: Viewport = {
  themeColor: "#EB691C",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet"/></head>
      <body><Providers>{children}</Providers><RegistrarSW /></body>
    </html>
  )
}
