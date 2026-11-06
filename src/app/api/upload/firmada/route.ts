import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// Subida directa del navegador a Storage con una URL firmada por el servidor.
// El navegador subía con la clave pública y las políticas de los depósitos lo
// rechazaban ("new row violates row-level security policy"). Pasar el archivo
// por /api/upload tampoco sirve para videos: Vercel corta los pedidos de más
// de 4,5 MB. Con la URL firmada el archivo va directo y sin ese límite.
const PERMITIDOS: Record<string, string> = {
  arte: 'digitales',
  registros: 'fotos',
  logos: 'clientes',
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const bucket = String(body.bucket ?? '')
  const carpeta = PERMITIDOS[bucket]
  if (!carpeta) return NextResponse.json({ error: 'Depósito no permitido' }, { status: 400 })

  const nombre = String(body.nombre ?? 'archivo')
  const ext = (nombre.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin'
  // Carpeta dentro del depósito (por ejemplo "<venta>/<soporte>"): sólo letras,
  // números, guiones y barras, sin subir de nivel.
  const sub = String(body.carpeta ?? '').replace(/[^a-zA-Z0-9_\/-]/g, '').replace(/\/+/g, '/').replace(/^\/|\/$/g, '').slice(0, 120)
  const path = `${sub || carpeta}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`

  const { data, error } = await createServerClient().storage.from(bucket).createSignedUploadUrl(path)
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'No se pudo preparar la subida' }, { status: 500 })
  return NextResponse.json({ path: data.path, token: data.token })
}
