import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'
import { refreshAccessToken } from '@/lib/gmail'
import { getOrCreateFolder, uploadFileToDrive } from '@/lib/drive'

export const dynamic = 'force-dynamic'

async function getValidToken(userId: string) {
  const supabase = createServerClient()
  const { data: row } = await supabase.from('google_tokens').select('*').eq('user_id', userId).single()
  if (!row) return null
  let accessToken = row.access_token
  if (new Date(row.expires_at) <= new Date()) {
    const refreshed = await refreshAccessToken(row.refresh_token)
    accessToken = refreshed.access_token
    await supabase.from('google_tokens').update({
      access_token: accessToken,
      expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('user_id', userId)
  }
  return accessToken
}

// POST /api/drive/upload
// FormData fields: file (File), clienteNombre (string)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = (session.user as { id: string }).id
  const accessToken = await getValidToken(userId)
  if (!accessToken) return NextResponse.json({ error: 'not_connected' }, { status: 404 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const clienteNombre = (formData.get('clienteNombre') as string | null) ?? 'General'

  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  try {
    const rootId = await getOrCreateFolder(accessToken, 'Movimagen CRM')
    const clienteId = await getOrCreateFolder(accessToken, clienteNombre, rootId)

    const data = new Uint8Array(await file.arrayBuffer())
    const driveFile = await uploadFileToDrive(accessToken, data, file.name, file.type || 'application/octet-stream', clienteId)

    return NextResponse.json({ url: driveFile.webViewLink, driveId: driveFile.id, name: driveFile.name })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Error'
    if (msg.includes('403')) {
      return NextResponse.json({ error: 'drive_scope_missing' }, { status: 403 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
