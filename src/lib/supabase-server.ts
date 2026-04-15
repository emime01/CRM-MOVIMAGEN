import { createClient } from "@supabase/supabase-js"

/**
 * Server-only Supabase client using the service role key.
 * Use this in Server Components and Server Actions — never import from client components.
 * Returns a new client per call to avoid module-level caching across requests.
 */
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
