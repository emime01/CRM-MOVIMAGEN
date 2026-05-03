import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createServerClient } from '@/lib/supabase-server'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const supabase = createServerClient()

  // Get storage_path before deleting so we can remove the file too
  const { data: registro } = await supabase
    .from('registros')
    .select('storage_path, subido_por')
    .eq('id', params.id)
    .single()

  if (!registro) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // Vendedores nunca pueden borrar; solo operaciones / administración o el uploader (no-vendedor).
  const isVendor = session.user.rol === 'vendedor'
  const canDelete = !isVendor && (
    session.user.id === registro.subido_por ||
    ['administracion', 'operaciones'].includes(session.user.rol)
  )
  if (!canDelete) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  // Delete from storage
  await supabase.storage.from('registros').remove([registro.storage_path])

  // Delete DB record
  const { error } = await supabase.from('registros').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
