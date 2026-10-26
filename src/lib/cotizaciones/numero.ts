import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Número de la próxima cotización ("COT-0042").
 *
 * Antes se pedía a una función `nextval` que no existe en la base, y al
 * fallar se usaba un número AL AZAR de 4 cifras: dos cotizaciones podían
 * salir con el mismo número. Ahora lo da la secuencia de la base (v44) y, si
 * la migración todavía no corrió, el mayor número usado más uno.
 */
export async function proximoNumeroCotizacion(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc('siguiente_numero_cotizacion')
  let n: number | null = !error && data != null ? Number(data) : null
  if (n == null || !Number.isFinite(n)) {
    const { data: filas } = await supabase.from('propuestas').select('numero').like('numero', 'COT-%').limit(5000)
    const max = (filas ?? []).reduce((m, f) => Math.max(m, Number(String(f.numero).replace(/\D/g, '')) || 0), 0)
    n = max + 1
  }
  return `COT-${String(n).padStart(4, '0')}`
}
