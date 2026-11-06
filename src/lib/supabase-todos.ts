/**
 * Trae todas las filas de una consulta de a 1.000, que es el tope de filas
 * que devuelve la base por pedido. Sin esto, las listas largas (contactos)
 * se cortaban en 1.000 sin avisar.
 *
 *   const { data } = await todos((d, h) => supabase.from('x').select('*').order('id').range(d, h))
 */
export async function todos<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null | unknown }>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await pagina(desde, desde + 999)
    if (error) return { data: out, error: error as { message: string } }
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return { data: out, error: null }
}
