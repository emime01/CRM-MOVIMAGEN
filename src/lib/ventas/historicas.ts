/**
 * Ventas históricas (2024–2025): las de la planilla de antes del CRM. Se
 * medían por trimestre (Q1 ene–mar … Q4 oct–dic), sin fecha exacta ni
 * soportes, en pesos y sin IVA. Los años hasta HISTORICO_HASTA salen de la
 * tabla `ventas_historicas`; de ahí en adelante, de las órdenes del CRM.
 */

export const HISTORICO_HASTA = 2025

export interface FilaHistorica {
  anio: number
  trimestre: number
  vendedor: string
  cliente: string
  monto: number
}

/** Trimestre (1–4) de una fecha 'YYYY-MM-DD…'. */
export function trimestreDe(fecha: string): number {
  return Math.floor((Number(fecha.slice(5, 7)) - 1) / 3) + 1
}

export const NOMBRE_TRIMESTRE = ['', 'ene–mar', 'abr–jun', 'jul–sep', 'oct–dic'] as const

/** Para comparar nombres: minúsculas, sin tildes ni signos, espacios simples. */
export function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' y ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * El cliente sin el detalle de la campaña: "Coca Cola ( Lat. Full )" →
 * "Coca Cola", "Movistar - curva" → "Movistar". Es lo que se muestra y se
 * agrupa cuando la venta no quedó asociada a un cliente del CRM.
 */
export function nombreBaseCliente(texto: string): string {
  const base = texto.split(/\s+[-–]\s+|\s*\(/)[0].replace(/\s+/g, ' ').trim()
  return base || texto.trim()
}

export interface ClienteParaEmparejar { id: string; nombre: string | null; empresa: string | null }

/**
 * El cliente del CRM que corresponde al texto de la planilla, o null. Coincide
 * si el nombre (o la empresa) del cliente es el texto base completo o el
 * comienzo de él ("Conaprole renovacion anual" → Conaprole). Entre varios,
 * gana el nombre más largo; si dos clientes distintos empatan, no se elige
 * ninguno (mejor sin asociar que asociado mal).
 */
export function emparejarCliente(texto: string, clientes: readonly ClienteParaEmparejar[]): string | null {
  const candidatos = [normalizar(nombreBaseCliente(texto)), normalizar(texto)].filter(Boolean)
  let mejor: { id: string; largo: number } | null = null
  let empate = false
  for (const c of clientes) {
    for (const n of [c.nombre, c.empresa]) {
      if (!n) continue
      const cn = normalizar(n)
      if (cn.length < 3) continue
      if (!candidatos.some(t => t === cn || t.startsWith(cn + ' '))) continue
      if (!mejor || cn.length > mejor.largo) { mejor = { id: c.id, largo: cn.length }; empate = false }
      else if (cn.length === mejor.largo && c.id !== mejor.id) empate = true
    }
  }
  return mejor && !empate ? mejor.id : null
}

/** Apodos de la planilla → nombre del perfil. */
const APODOS: Record<string, string> = { fede: 'federico' }

/**
 * El perfil del vendedor de la planilla ("GONZALO", "FEDE"), o null si no hay
 * uno solo que coincida (vendedores que ya no están, "CAMILLE / NATALIA").
 */
export function emparejarVendedor(nombre: string, perfiles: readonly { id: string; nombre: string | null }[]): string | null {
  const n = normalizar(nombre)
  if (!n || /\s\/\s|\//.test(nombre)) return null
  const buscado = APODOS[n] ?? n
  const coinciden = perfiles.filter(p => {
    const pn = normalizar(p.nombre ?? '')
    return !pn.startsWith('prueba') && (pn === buscado || pn.startsWith(buscado + ' '))
  })
  return coinciden.length === 1 ? coinciden[0].id : null
}

/** "GONZALO" → "Gonzalo", "CAMILLE / NATALIA" → "Camille / Natalia". */
export function nombrePropio(s: string): string {
  return s.trim().toLowerCase().replace(/(^|[\s/(-])([a-záéíóúüñ])/g, (_, a: string, b: string) => a + b.toUpperCase())
}
