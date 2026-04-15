import type { Metadata } from "next"
import "./globals.css"
import Providers from "./providers"
export const metadata: Metadata = { title: "CRM Movimagen", description: "Sistema de gestión comercial interno" }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head><link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet"/></head>
      <body><Providers>{children}</Providers></body>
    </html>
  )
}
