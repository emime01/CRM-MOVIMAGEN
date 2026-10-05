/**
 * Lectura de la planilla de objetivos.
 *
 * Vive aparte del componente para poder probarla contra el Excel real, que es
 * donde aparecen los problemas: la planilla de Movimagen trae los encabezados
 * en la fila 3 (arriba hay títulos combinados), la columna de agencia se llama
 * "AGENCIA/DIRECTO" y los cuatrimestres "C1 - ENE/FEB/MAR/ABR". El importador
 * buscaba nombres exactos en la fila 1 y no encontraba nada.
 */

export interface FilaObjetivo {
  agencia?: string
  contacto_agencia?: string
  contacto_cliente?: string
  cliente: string
  ejec_vtas?: string
  ponderacion_pct: number
  c1: number
  c2: number
  c3: number
}

/** Sin acentos, sin mayúsculas y sin espacios de más, para comparar nombres. */
function norm(s: unknown): string {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

/** Filas de cierre de la planilla que no son clientes. */
const NO_SON_CLIENTES = ['total', 'subtotal', 'cliente', '2025 + ipc', 'ipc']

function esCliente(nombre: string): boolean {
  const n = norm(nombre)
  if (!n || n.length < 2) return false
  return !NO_SON_CLIENTES.some(j => n === j || n.startsWith(j + ' '))
}

export function parseNumero(v: unknown): number {
  if (v == null || v === '') return 0
  if (typeof v === 'number') return isFinite(v) ? v : 0
  const s = String(v).replace(/[^0-9.,-]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

export function parsePorcentaje(v: unknown): number {
  if (v == null || v === '') return 100
  const n = parseFloat(String(v).replace('%', '').trim())
  if (isNaN(n)) return 100
  // Excel puede dar 0.33 por "33%"
  return n <= 1 ? Math.round(n * 100) : Math.round(n)
}

/**
 * Ubica la fila de encabezados. No siempre es la primera: arriba suele haber
 * un título. Se reconoce por tener una celda que diga "cliente".
 */
export function buscarFilaEncabezados(filas: unknown[][]): number {
  const hasta = Math.min(filas.length, 15)
  for (let i = 0; i < hasta; i++) {
    const celdas = (filas[i] ?? []).map(norm)
    if (celdas.some(c => c === 'cliente')) return i
  }
  return 0
}

/** Busca la columna cuyo encabezado empieza con alguno de los textos dados. */
function columna(encabezados: string[], ...alternativas: string[]): number {
  for (const alt of alternativas) {
    const i = encabezados.findIndex(h => h === alt)
    if (i >= 0) return i
  }
  for (const alt of alternativas) {
    const i = encabezados.findIndex(h => h.startsWith(alt))
    if (i >= 0) return i
  }
  return -1
}

/**
 * Convierte la hoja (como matriz de celdas) en filas de objetivo.
 *
 * Los clientes repetidos se suman en vez de pisarse: un mismo cliente puede
 * aparecer en varias líneas (distintas agencias o productos) y el objetivo del
 * año es la suma, no la última línea.
 */
export function parsearHoja(filas: unknown[][]): FilaObjetivo[] {
  if (filas.length === 0) return []

  const iEnc = buscarFilaEncabezados(filas)
  const enc = (filas[iEnc] ?? []).map(norm)

  const cCliente = columna(enc, 'cliente')
  if (cCliente < 0) return []

  const cEjec    = columna(enc, 'ejec vtas', 'ejecutivo', 'vendedor', 'ejec')
  const cAgencia = columna(enc, 'agencia/directo', 'agencia')
  const cConAg   = columna(enc, 'contacto agencia')
  const cConCli  = columna(enc, 'contacto cliente')
  const cPond    = columna(enc, 'porcentaje ponderacion para objetivo total', 'ponderacion', 'porcentaje')
  const cC1      = columna(enc, 'c1')
  const cC2      = columna(enc, 'c2')
  const cC3      = columna(enc, 'c3')

  const texto = (fila: unknown[], i: number) => (i >= 0 ? String(fila[i] ?? '').trim() : '')

  const porCliente = new Map<string, FilaObjetivo>()

  for (let r = iEnc + 1; r < filas.length; r++) {
    const fila = filas[r] ?? []
    const cliente = texto(fila, cCliente)
    if (!esCliente(cliente)) continue

    const clave = norm(cliente)
    const previo = porCliente.get(clave)
    const c1 = cC1 >= 0 ? parseNumero(fila[cC1]) : 0
    const c2 = cC2 >= 0 ? parseNumero(fila[cC2]) : 0
    const c3 = cC3 >= 0 ? parseNumero(fila[cC3]) : 0

    if (previo) {
      previo.c1 += c1; previo.c2 += c2; previo.c3 += c3
      // El ejecutivo y la agencia se toman de la primera línea que los traiga.
      previo.ejec_vtas = previo.ejec_vtas || texto(fila, cEjec) || undefined
      previo.agencia   = previo.agencia   || texto(fila, cAgencia) || undefined
      continue
    }

    porCliente.set(clave, {
      cliente,
      ejec_vtas:        texto(fila, cEjec) || undefined,
      agencia:          texto(fila, cAgencia) || undefined,
      contacto_agencia: texto(fila, cConAg) || undefined,
      contacto_cliente: texto(fila, cConCli) || undefined,
      ponderacion_pct:  cPond >= 0 ? parsePorcentaje(fila[cPond]) : 100,
      c1, c2, c3,
    })
  }

  return Array.from(porCliente.values())
}
