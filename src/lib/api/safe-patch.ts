/**
 * Filtra un body de PATCH a solo los campos permitidos, descartando todo lo
 * demás. Evita mass-assignment: que un usuario que solo debería poder editar
 * "notas" no pueda colar { vendedor_id, monto_total, estado } en el mismo
 * payload.
 *
 *   const updates = pickAllowed(body, ['notas', 'fecha_alta_prevista'])
 *
 * Devuelve un Record<string, unknown> con SOLO las claves listadas que estén
 * presentes en body (incluido undefined; usar `if (Object.keys(...).length)`
 * antes de un update vacío).
 */
export function pickAllowed<T extends string>(
  body: Record<string, unknown> | null | undefined,
  allowed: readonly T[],
): Partial<Record<T, unknown>> {
  const out: Partial<Record<T, unknown>> = {}
  if (!body || typeof body !== 'object') return out
  for (const key of allowed) {
    if (key in body) out[key] = (body as Record<string, unknown>)[key]
  }
  return out
}

/**
 * Escapa caracteres especiales del parser de PostgREST .or() / .ilike().
 * El parser usa `,` `(` `)` como separadores y `*` / `%` / `_` como wildcards.
 * Si el input del usuario contiene cualquiera de estos, queremos que se
 * matchee literalmente, no que extienda o quiebre la query.
 */
export function escapePostgrestPattern(raw: string): string {
  return raw
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/[,()]/g, ' ') // separadores → espacios para neutralizar el parser
    .trim()
}
