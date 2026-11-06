import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Sube un archivo del navegador a un depósito de Storage con una URL firmada
 * que pide al servidor (/api/upload/firmada). Devuelve la ruta guardada.
 */
export async function subirArchivo(
  supabase: SupabaseClient,
  bucket: 'arte' | 'registros' | 'logos',
  file: File,
  carpeta?: string,
): Promise<{ path: string } | { error: string }> {
  const res = await fetch('/api/upload/firmada', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bucket, nombre: file.name, carpeta }),
  })
  const d = await res.json().catch(() => ({}))
  if (!res.ok) return { error: d.error ?? 'No se pudo preparar la subida' }
  const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(d.path, d.token, file, {
    contentType: file.type || undefined,
  })
  if (error) return { error: error.message }
  return { path: d.path }
}
