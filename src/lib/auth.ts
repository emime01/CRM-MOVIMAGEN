import { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { createClient } from "@supabase/supabase-js"

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { autoRefreshToken: false, persistSession: false } }
        )

        const { data, error } = await supabase.auth.signInWithPassword({
          email: credentials.email,
          password: credentials.password,
        })

        if (error || !data.user) return null

        const { data: perfil } = await supabase
          .from("perfiles")
          .select("*")
          .eq("user_id", data.user.id)
          .single()

        if (!perfil) return null

        return {
          id: perfil.id,
          email: data.user.email!,
          name: perfil.nombre,
          rol: perfil.rol,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // token.sub is auto-set to user.id by NextAuth on first sign-in
        const u = user as unknown as Record<string, unknown>
        token.rol = u.rol as string
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        // token.sub holds perfil.id (set by NextAuth from user.id in authorize())
        const u = session.user as Record<string, unknown>
        u.id = token.sub || ''
        u.rol = token.rol
      }
      return session
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
}
