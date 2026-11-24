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

/** Partes de nombres compuestos que describen el rubro y no identifican a nadie. */
const PARTES_GENERICAS = new Set([
  'yerba', 'cafe', 'congelados', 'helados', 'peliculas', 'seguros', 'lacteos', 'aguas', 'herramientas',
  'supermercados', 'programatica', 'tradicional', 'bebidas', 'alimentos', 'retail', 'banco', 'directo',
])

/**
 * Los nombres con los que se reconoce a un cliente del CRM: su nombre y su
 * empresa completos y, con menos prioridad, cada parte de un nombre compuesto
 * ("Coca Cola - Sprite - Fanta", "Movistar / Tigo", "RBS - Peliculas").
 */
function aliasDe(c: ClienteParaEmparejar): { alias: string; completo: boolean }[] {
  const out = new Map<string, boolean>()
  for (const n of [c.nombre, c.empresa]) {
    if (!n) continue
    const completo = normalizar(n)
    if (completo.length >= 3) out.set(completo, true)
    for (const parte of n.split(/\s*\/\s*|\s+[-–]\s+|\s*[()]\s*/)) {
      const p = normalizar(parte)
      if (p.length >= 3 && !PARTES_GENERICAS.has(p) && !out.has(p)) out.set(p, false)
    }
  }
  return Array.from(out, ([alias, completo]) => ({ alias, completo }))
}

/**
 * El cliente del CRM que corresponde al texto de la planilla, o null. Coincide
 * si un nombre del cliente (ver aliasDe) es el texto base completo, el comienzo
 * de él ("Conaprole renovacion anual" → Conaprole) o lo mismo sin espacios
 * ("Pedidos Ya" → PedidosYa). Gana el nombre completo sobre una parte y, a
 * igualdad, el más largo; si dos clientes distintos empatan, no se elige
 * ninguno (mejor sin asociar que asociado mal).
 */
export function emparejarCliente(texto: string, clientes: readonly ClienteParaEmparejar[]): string | null {
  const candidatos = [normalizar(nombreBaseCliente(texto)), normalizar(texto)].filter(Boolean)
  const junto = (s: string) => s.replace(/ /g, '')
  let mejor: { id: string; puntaje: number } | null = null
  let empate = false
  for (const c of clientes) {
    for (const { alias, completo } of aliasDe(c)) {
      if (!candidatos.some(t => t === alias || t.startsWith(alias + ' ') || junto(t) === junto(alias))) continue
      const puntaje = (completo ? 10000 : 0) + alias.length
      if (!mejor || puntaje > mejor.puntaje) { mejor = { id: c.id, puntaje }; empate = false }
      else if (puntaje === mejor.puntaje && c.id !== mejor.id) empate = true
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
