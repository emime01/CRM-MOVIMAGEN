// ============================================================
// CRM Movimagen — Supabase client
// ============================================================
import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Cliente para uso en el browser (componentes cliente)
export const supabase = createClient(supabaseUrl, supabaseKey)

// Helper: cliente con service role para server-side (API routes)
export const createServiceClient = () =>
  createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
