/**
 * Sincronización diaria Hub → CRM de fotos, medidas e impactos de los soportes.
 *
 * El Hub es otro proyecto de Supabase (sólo legible con login). Este módulo
 * tiene dos partes:
 *  - lógica PURA y exportada (matching y reglas de actualización), sin red ni
 *    base de datos, para poder probarla con unit tests;
 *  - funciones de I/O (login al Hub, lectura, escritura en el CRM).
 *
 * Regla de oro: nunca se destruye información del CRM. Sólo se completan
 * campos vacíos y se reemplazan fotos que ya eran del propio Hub.
 */

export const HUB_URL = 'https://jfeucuihcebrlcystapv.supabase.co'
// Clave publicable (pública por diseño, OK en el código).
export const HUB_PUBLISHABLE_KEY = 'sb_publishable_bc3NkrdY5ZqtSOR4BX_PGw_Owo9nJUk'
export const HUB_SITE_URL_DEFAULT = 'https://movimagen-hub.vercel.app'
const HUB_HOST = 'jfeucuihcebrlcystapv.supabase.co'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface HubSoporte {
  id: string | number
  nombre?: string | null
  ubicacion?: string | null
  ruta?: string | null
  km?: number | string | null
  sentido?: string | null
  medidas?: string | null
  impactos_mensuales?: number | null
  tmda?: number | null
  url_imagen?: string | null
  fotos?: string[] | null
  activo?: boolean | null
}

export interface CrmSoporte {
  id: string
  /** Id del soporte en el Hub, si el CRM lo guarda; si no, se usa `id`. */
  hub_id?: string | number | null
  nombre?: string | null
  ubicacion?: string | null
  ruta?: string | null
  km?: number | string | null
  sentido?: string | null
  medidas?: string | null
  impactos_mensuales?: number | null
  url_imagen?: string | null
  activo?: boolean | null
}

export interface Cambio {
  id: string
  nombre: string
  campos: string[]
}

export interface ResumenSync {
  configurado: boolean
  dry: boolean
  revisados: number
  actualizados: number
  sinMatch: number
  sinMatchNombres: string[]
  cambios: Cambio[]
  errores: string[]
  mensaje?: string
}

// ─── Normalización ───────────────────────────────────────────────────────────

/** minúsculas, sin acentos, espacios colapsados. */
export function normalizar(s: string | null | undefined): string {
  return (s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function vacio(v: unknown): boolean {
  return v == null || (typeof v === 'string' && v.trim() === '')
}

function aNumero(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Código canónico de ruta: 'ib' (Interbalnearia) o el número ('9', '101'). */
export function normalizarRuta(r: string | null | undefined): string | null {
  const n = normalizar(r)
  if (!n) return null
  if (n.includes('interbalnearia') || n === 'ib') return 'ib'
  const m = n.match(/(?:ruta|r)\.?\s*(ib|\d+)/) ?? n.match(/^(ib|\d+)$/)
  return m ? m[1] : null
}

/** Extrae ruta y km del nombre de un rutero del CRM ("Ruta IB Km. 33.000"). */
export function parseRutaKm(nombre: string | null | undefined): { ruta: string; km: number } | null {
  const n = normalizar(nombre)
  const m = n.match(/\b(?:ruta|r)\.?\s*(ib|\d+)\s*,?\s*km\.?\s*(\d+(?:[.,]\d+)?)/)
  if (!m) return null
  const km = parseFloat(m[2].replace(',', '.'))
  return Number.isFinite(km) ? { ruta: m[1], km } : null
}

const CARDINALES = ['este', 'oeste', 'norte', 'sur']

/** Sentido/vista cardinal: "vista Este", "sentido este", "(Este, derecha)". */
export function parseSentido(texto: string | null | undefined): string | null {
  const n = normalizar(texto)
  if (!n) return null
  const m = n.match(/(?:vista|sentido)\s+(este|oeste|norte|sur)\b/) ?? n.match(/\(\s*(este|oeste|norte|sur)\b/)
  if (m) return m[1]
  return CARDINALES.includes(n) ? n : null
}

/** Margen de la ruta: derecha / izquierda. */
export function parseMargen(texto: string | null | undefined): 'derecha' | 'izquierda' | null {
  const n = normalizar(texto)
  if (/\bderecha\b/.test(n)) return 'derecha'
  if (/\bizquierda\b/.test(n)) return 'izquierda'
  return null
}

// ─── Matching ────────────────────────────────────────────────────────────────

/** Alias de circuitos: nombre CRM normalizado → nombre Hub normalizado. */
const ALIAS_CIRCUITOS: Record<string, string> = {
  'circuito premium': 'circuito premium shoppings',
  'circuito unique': 'circuito unique shoppings',
  'circuito premium duty select': 'duty select',
}

function hubIdDe(c: CrmSoporte): string {
  return String(c.hub_id ?? c.id)
}

function rutaKmCrm(c: CrmSoporte): { ruta: string; km: number } | null {
  const ruta = normalizarRuta(c.ruta)
  const km = aNumero(c.km)
  if (ruta && km != null) return { ruta, km }
  return parseRutaKm(c.nombre)
}

/** Texto de donde sacar sentido/margen de un soporte del CRM. */
function textoCrm(c: CrmSoporte): string {
  return `${c.nombre ?? ''} ${c.ubicacion ?? ''}`
}

/**
 * Devuelve los soportes del CRM que corresponden a un soporte del Hub.
 * Se aplica el primer criterio que dé resultados (id, rutero, circuito,
 * nombre+ubicación). Puede devolver varios: muchos soportes del CRM comparten
 * el id del Hub.
 */
export function matchearHubConCrm(hub: HubSoporte, crms: CrmSoporte[]): CrmSoporte[] {
  // 1. mismo id
  const porId = crms.filter(c => hubIdDe(c) === String(hub.id))
  if (porId.length) return porId

  // 2. ruteros: ruta + km
  const hubRuta = normalizarRuta(hub.ruta)
  const hubKm = aNumero(hub.km)
  if (hubRuta && hubKm != null) {
    let cand = crms.filter(c => {
      const rk = rutaKmCrm(c)
      return !!rk && rk.ruta === hubRuta && Math.abs(rk.km - hubKm) < 0.05
    })
    if (cand.length > 1) {
      const textoHub = `${hub.sentido ?? ''} ${hub.nombre ?? ''} ${hub.ubicacion ?? ''}`
      const sentidoHub = parseSentido(hub.sentido) ?? parseSentido(textoHub)
      if (sentidoHub) {
        const f = cand.filter(c => parseSentido(textoCrm(c)) === sentidoHub)
        if (f.length) cand = f
      }
      const margenHub = parseMargen(textoHub)
      if (margenHub && cand.length > 1) {
        const f = cand.filter(c => parseMargen(textoCrm(c)) === margenHub)
        if (f.length) cand = f
      }
    }
    if (cand.length) return cand
  }

  // 3. alias de circuitos
  const nombreHub = normalizar(hub.nombre)
  const porAlias = crms.filter(c => ALIAS_CIRCUITOS[normalizar(c.nombre)] === nombreHub)
  if (porAlias.length) return porAlias

  // 4. mismo nombre + ubicación normalizados
  if (nombreHub) {
    const ubHub = normalizar(hub.ubicacion)
    const porNombre = crms.filter(c => normalizar(c.nombre) === nombreHub && normalizar(c.ubicacion) === ubHub)
    if (porNombre.length) return porNombre
  }
  return []
}

// ─── Fotos ───────────────────────────────────────────────────────────────────

/** URL absoluta de una foto del Hub (las relativas se sirven desde el sitio del Hub). */
export function resolverFoto(url: string | null | undefined, hubSiteUrl: string = HUB_SITE_URL_DEFAULT): string | null {
  const u = (url ?? '').trim()
  if (!u) return null
  if (/^https?:\/\//i.test(u)) return u
  return hubSiteUrl.replace(/\/+$/, '') + (u.startsWith('/') ? u : `/${u}`)
}

/** Primera foto del Hub (fotos[0] o url_imagen), ya absoluta. */
export function primeraFotoHub(hub: HubSoporte, hubSiteUrl: string = HUB_SITE_URL_DEFAULT): string | null {
  const f = (hub.fotos ?? []).find(x => !vacio(x))
  return resolverFoto(f ?? hub.url_imagen, hubSiteUrl)
}

function hostDe(url: string): string {
  try { return new URL(url).host } catch { return '' }
}

/** ¿La URL está alojada en el Hub (storage o sitio)? */
export function esFotoDelHub(url: string, hubSiteUrl: string = HUB_SITE_URL_DEFAULT): boolean {
  const siteHost = hostDe(hubSiteUrl)
  return url.includes(HUB_HOST) || (!!siteHost && url.includes(siteHost))
}

// ─── Reglas de actualización ─────────────────────────────────────────────────

export type Parche = Record<string, string | number>

/**
 * Campos a completar en un soporte del CRM a partir del Hub. Devuelve {} si no
 * hay nada que cambiar. `fotoHub` ya debe venir absoluta (ver primeraFotoHub).
 */
export function calcularParche(
  hub: HubSoporte,
  crm: CrmSoporte,
  fotoHub: string | null,
  hubSiteUrl: string = HUB_SITE_URL_DEFAULT,
): Parche {
  const p: Parche = {}

  if (fotoHub) {
    const actual = (crm.url_imagen ?? '').trim()
    if (!actual || (esFotoDelHub(actual, hubSiteUrl) && actual !== fotoHub)) p.url_imagen = fotoHub
  }

  if (vacio(crm.medidas) && !vacio(hub.medidas)) p.medidas = String(hub.medidas).trim()

  const imp = aNumero(hub.impactos_mensuales)
  if ((!crm.impactos_mensuales || crm.impactos_mensuales === 0) && imp != null && imp > 0) {
    p.impactos_mensuales = Math.round(imp)
  }

  // Ruteros: completar ruta/km/sentido si faltan en el CRM.
  if (parseRutaKm(crm.nombre) || normalizarRuta(crm.ruta)) {
    if (vacio(crm.ruta) && !vacio(hub.ruta)) p.ruta = String(hub.ruta).trim()
    const km = aNumero(hub.km)
    if (aNumero(crm.km) == null && km != null) p.km = km
    if (vacio(crm.sentido) && !vacio(hub.sentido)) p.sentido = String(hub.sentido).trim()
  }
  return p
}

/**
 * Núcleo puro: dado el Hub y el CRM, calcula qué cambiar. `fotoExtra` permite
 * inyectar fotos de otra fuente (p. ej. el bucket) cuando el Hub no trae.
 */
export function planificarSync(
  hubs: HubSoporte[],
  crms: CrmSoporte[],
  opts: { hubSiteUrl?: string; fotoExtra?: (hub: HubSoporte) => string | null } = {},
): { cambios: Array<Cambio & { parche: Parche }>; sinMatch: HubSoporte[]; revisados: number } {
  const site = opts.hubSiteUrl ?? HUB_SITE_URL_DEFAULT
  const activos = crms.filter(c => c.activo !== false)
  const cambios: Array<Cambio & { parche: Parche }> = []
  const sinMatch: HubSoporte[] = []
  const vistos = new Set<string>()

  for (const hub of hubs) {
    const matches = matchearHubConCrm(hub, activos)
    if (!matches.length) { sinMatch.push(hub); continue }
    const foto = primeraFotoHub(hub, site) ?? opts.fotoExtra?.(hub) ?? null
    for (const crm of matches) {
      if (vistos.has(crm.id)) continue // un soporte del CRM se actualiza una sola vez
      vistos.add(crm.id)
      const parche = calcularParche(hub, crm, foto, site)
      const campos = Object.keys(parche)
      if (campos.length) cambios.push({ id: crm.id, nombre: crm.nombre ?? '', campos, parche })
    }
  }
  return { cambios, sinMatch, revisados: hubs.length }
}

// ─── I/O ─────────────────────────────────────────────────────────────────────

async function loginHub(email: string, password: string): Promise<string> {
  const res = await fetch(`${HUB_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: HUB_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`Login al Hub falló (${res.status})`)
  const j = await res.json()
  if (!j.access_token) throw new Error('Login al Hub sin access_token')
  return j.access_token as string
}

async function leerSoportesHub(token: string): Promise<HubSoporte[]> {
  const res = await fetch(`${HUB_URL}/rest/v1/soportes?select=*`, {
    headers: { apikey: HUB_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Lectura de soportes del Hub falló (${res.status})`)
  return (await res.json()) as HubSoporte[]
}

/** Primera imagen del bucket público `soportes/<id>/` del Hub, o null. */
async function fotoDeStorage(hubId: string | number): Promise<string | null> {
  try {
    const res = await fetch(`${HUB_URL}/storage/v1/object/list/soportes`, {
      method: 'POST',
      headers: {
        apikey: HUB_PUBLISHABLE_KEY,
        Authorization: `Bearer ${HUB_PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefix: String(hubId), limit: 100 }),
    })
    if (!res.ok) return null
    const items = (await res.json()) as Array<{ name: string; id?: string | null }>
    const archivo = (items ?? [])
      .filter(i => i.id && /\.(webp|jpe?g|png|avif)$/i.test(i.name))
      .map(i => i.name)
      .sort()[0]
    return archivo ? `${HUB_URL}/storage/v1/object/public/soportes/${hubId}/${archivo}` : null
  } catch {
    return null
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any

export async function sincronizarHub(supabase: SupabaseLike, opts: { dry?: boolean } = {}): Promise<ResumenSync> {
  const dry = !!opts.dry
  const base: ResumenSync = {
    configurado: true, dry, revisados: 0, actualizados: 0, sinMatch: 0,
    sinMatchNombres: [], cambios: [], errores: [],
  }
  const email = process.env.HUB_EMAIL
  const password = process.env.HUB_PASSWORD
  if (!email || !password) {
    return { ...base, configurado: false, mensaje: 'Sincronización con el Hub no configurada (faltan HUB_EMAIL / HUB_PASSWORD)' }
  }
  const site = process.env.HUB_SITE_URL || HUB_SITE_URL_DEFAULT

  const token = await loginHub(email, password)
  const hubs = (await leerSoportesHub(token)).filter(h => h.activo !== false)

  const { data: crms, error } = await supabase.from('soportes').select('*').eq('activo', true)
  if (error) throw new Error(`Lectura de soportes del CRM falló: ${error.message}`)

  // Fotos del bucket sólo para los hubs que matchean y no traen foto propia.
  const delBucket = new Map<string, string | null>()
  for (const hub of hubs) {
    if (primeraFotoHub(hub, site)) continue
    if (!matchearHubConCrm(hub, crms as CrmSoporte[]).length) continue
    delBucket.set(String(hub.id), await fotoDeStorage(hub.id))
  }

  const plan = planificarSync(hubs, crms as CrmSoporte[], {
    hubSiteUrl: site,
    fotoExtra: h => delBucket.get(String(h.id)) ?? null,
  })

  const resumen: ResumenSync = {
    ...base,
    revisados: plan.revisados,
    sinMatch: plan.sinMatch.length,
    sinMatchNombres: plan.sinMatch.map(h => h.nombre ?? String(h.id)),
    cambios: plan.cambios.map(({ id, nombre, campos }) => ({ id, nombre, campos })),
  }

  if (dry) {
    resumen.actualizados = plan.cambios.length
    return resumen
  }
  for (const c of plan.cambios) {
    const { error: e } = await supabase.from('soportes').update(c.parche).eq('id', c.id)
    if (e) resumen.errores.push(`${c.nombre}: ${e.message}`)
    else resumen.actualizados++
  }
  return resumen
}
