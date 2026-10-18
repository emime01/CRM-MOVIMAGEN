import NextAuth from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      rol: "vendedor" | "asistente_ventas" | "gerente_comercial" | "operaciones" | "arte" | "administracion" | "asistente_ventas_ops" | "admin_sistema" | "asistente_administracion"
    }
  }

  interface User {
    id: string
    email: string
    name: string
    rol: "vendedor" | "asistente_ventas" | "gerente_comercial" | "operaciones" | "arte" | "administracion" | "asistente_ventas_ops" | "admin_sistema" | "asistente_administracion"
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    rol: string
  }
}
