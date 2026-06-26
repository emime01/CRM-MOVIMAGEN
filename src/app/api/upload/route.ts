import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Buckets a los que este endpoint genérico puede escribir. Evita que el
// cliente apunte a un bucket arbitrario.
const ALLOWED_BUCKETS = ['ordenes-docs', 'arte', 'comprobantes', 'logos', 'registros']

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const bucket = (formData.get('bucket') as string) || 'ordenes-docs'

  if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })
  if (!ALLOWED_BUCKETS.includes(bucket)) {
    return NextResponse.json({ error: 'Bucket no permitido' }, { status: 400 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
  const path = `${session.user.id}/${Date.now()}.${ext}`

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { contentType: file.type, upsert: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: publicUrl } = supabase.storage.from(bucket).getPublicUrl(path)

  return NextResponse.json({ url: publicUrl.publicUrl, path })
}
