#!/usr/bin/env node
/**
 * Smoke test end-to-end del CRM (SOLO LECTURA: no crea ni modifica datos).
 *
 * Inicia sesión y recorre las pantallas principales. Falla ante cualquier
 * error de página, console.error o respuesta HTTP >= 500 de /api.
 *
 *   E2E_BASE_URL=https://crm.example.com E2E_EMAIL=... E2E_PASSWORD=... node tests/e2e/smoke.mjs
 *
 * Usa Playwright (instalación global o local): no corre `playwright install`.
 * No va en CI: necesita un entorno con usuario real.
 */
import { createRequire } from 'node:module'
import { execSync } from 'node:child_process'

const require = createRequire(import.meta.url)

function cargarPlaywright() {
  try { return require('playwright') } catch {}
  try {
    const raiz = execSync('npm root -g', { encoding: 'utf8' }).trim()
    return require(`${raiz}/playwright`)
  } catch {}
  console.error('No se encontró el paquete "playwright" (ni local ni global).')
  process.exit(2)
}

const BASE = (process.env.E2E_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error('Faltan E2E_EMAIL y/o E2E_PASSWORD.')
  process.exit(2)
}

// Pantallas a abrir. `opcional`: puede no estar disponible según el rol (redirige o 403).
const PAGINAS = [
  { ruta: '/dashboard', nombre: 'Dashboard' },
  { ruta: '/dashboard/leads', nombre: 'Leads' },
  { ruta: '/dashboard/cotizaciones', nombre: 'Cotizaciones' },
  { ruta: '/dashboard/ventas', nombre: 'Ventas' },
  { ruta: '/dashboard/disponibilidad', nombre: 'Disponibilidad' },
  { ruta: '/dashboard/tasks', nombre: 'Tareas' },
  { ruta: '/dashboard/reportes', nombre: 'Reportes' },
  { ruta: '/dashboard/admin/canon', nombre: 'Admin / Canon', opcional: true },
]

const { chromium } = cargarPlaywright()

const fallas = []
let contexto = 'login'
const falla = (msg) => { fallas.push(`[${contexto}] ${msg}`); console.error(`  FALLA ${msg}`) }

// Errores de consola que no dependen de la app (red de terceros, extensiones).
const IGNORAR_CONSOLA = [/favicon/i, /Failed to load resource: net::ERR_(BLOCKED|FAILED)/i]

const browser = await chromium.launch()
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()

page.on('pageerror', (e) => falla(`error de página: ${e.message}`))
page.on('console', (m) => {
  if (m.type() !== 'error') return
  const t = m.text()
  if (IGNORAR_CONSOLA.some((r) => r.test(t))) return
  falla(`console.error: ${t}`)
})
page.on('response', (r) => {
  const url = r.url()
  if (url.startsWith(BASE) && new URL(url).pathname.startsWith('/api/') && r.status() >= 500) {
    falla(`HTTP ${r.status()} ${r.request().method()} ${new URL(url).pathname}`)
  }
})

try {
  console.log(`Smoke test contra ${BASE}`)

  // Login
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }),
    page.click('button[type=submit]'),
  ])
  console.log('OK login')

  for (const p of PAGINAS) {
    contexto = p.nombre
    const antes = fallas.length
    const resp = await page.goto(`${BASE}${p.ruta}`, { waitUntil: 'networkidle', timeout: 45000 }).catch((e) => {
      falla(`no cargó: ${e.message}`)
      return null
    })
    if (!resp) continue
    if (resp.status() >= 500) falla(`HTTP ${resp.status()} en la página`)

    const path = new URL(page.url()).pathname
    if (path.startsWith('/login')) { falla('la sesión se perdió (redirigió a /login)'); continue }
    if (p.opcional && path !== p.ruta) { console.log(`SKIP ${p.nombre} (el rol no tiene acceso: ${path})`); continue }

    await page.waitForTimeout(500) // deja correr los fetch del cliente
    console.log(`${fallas.length === antes ? 'OK  ' : 'FAIL'} ${p.nombre}`)
  }
} catch (e) {
  falla(`excepción: ${e.message}`)
} finally {
  await browser.close()
}

if (fallas.length) {
  console.error(`\n${fallas.length} falla(s):`)
  for (const f of fallas) console.error(` - ${f}`)
  process.exit(1)
}
console.log('\nSmoke test OK')
