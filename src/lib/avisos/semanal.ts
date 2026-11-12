import { plantillaMail } from '@/lib/mail'

/**
 * Resumen semanal para la gerencia comercial: arma el mail (HTML y texto) a
 * partir de datos ya calculados. No toca la base ni manda nada: de eso se
 * ocupa `semanal-datos.ts`.
 */

export type Totales = { UYU?: number; USD?: number }

export interface DatosResumenSemanal {
  /** Hoy en Uruguay, "AAAA-MM-DD". */
  hoy: string
  /** Lunes a domingo de la semana que se resume. */
  semana: { desde: string; hasta: string }
  cuatrimestre: { label: string; displayLabel: string }
  ventas: {
    cantidad: number
    /** Sin IVA. */
    total: Totales
    porVendedor: { nombre: string; cantidad: number; total: Totales }[]
    top: { numero: number | null; cliente: string; formato: string; monto: number; moneda: string }[]
  }
  objetivos: {
    /** Vendido sin IVA en pesos (lo que se mide contra el objetivo) y en dólares (aparte). */
    total: { vendido: number; vendidoUSD: number; objetivo: number }
    porVendedor: { nombre: string; vendido: number; vendidoUSD: number; objetivo: number }[]
  }
  propuestas: {
    enviadas: number
    aceptadas: number
    sinRespuesta: { numero: string; cliente: string; vendedor: string; dias: number }[]
  }
  /** null si no se pudo calcular. */
  ocupacion: {
    mesActual: { etiqueta: string; formatos: { formato: string; pct: number }[] }
    mesSiguiente: { etiqueta: string; formatos: { formato: string; pct: number }[] }
    libres30: number
    totalSoportes: number
  } | null
  cobranza: { facturado: Totales; cobrado: Totales; deudaVencida: Totales; facturasVencidas: number }
  alertas: {
    renovaciones: { cliente: string; vendedor: string; fin: string; numero: number | null }[]
    pendientesAprobacion: { numero: number | null; cliente: string; monto: number; moneda: string; vendedor: string }[]
    gestionesVencidas: { vendedor: string; cantidad: number }[]
  }
  /** Secciones que no se pudieron cargar (se avisan en el mail). */
  avisos: string[]
}

export interface ResumenSemanal { asunto: string; html: string; texto: string }

// ── Fechas ────────────────────────────────────────────────────────────────

export function sumarDias(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Lunes a domingo de la semana anterior a la de `hoy`. Un lunes, es la que acaba de terminar. */
export function semanaAnterior(hoy: string): { desde: string; hasta: string } {
  const dow = new Date(hoy + 'T12:00:00Z').getUTCDay() // 0 = domingo
  const lunesActual = sumarDias(hoy, -((dow + 6) % 7))
  return { desde: sumarDias(lunesActual, -7), hasta: sumarDias(lunesActual, -1) }
}

const dmy = (d: string) => d.slice(0, 10).split('-').reverse().join('/')
const ddmm = (d: string) => dmy(d).slice(0, 5)

// ── Formato ───────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const miles = (n: number) => String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
export const plata = (n: number, moneda = 'UYU') => `${n < 0 ? '-' : ''}${moneda === 'USD' ? 'U$S' : '$'} ${miles(n)}`
/** "$ 1.000 + U$S 500"; "$ 0" si no hay nada. */
export function plataTotales(t: Totales): string {
  const partes = (['UYU', 'USD'] as const).filter(m => (t[m] ?? 0) !== 0).map(m => plata(t[m]!, m))
  return partes.length ? partes.join(' + ') : plata(0)
}
const pct = (vendido: number, objetivo: number) => (objetivo > 0 ? `${Math.round((vendido / objetivo) * 100)}%` : '—')

// ── Bloques ───────────────────────────────────────────────────────────────

type Bloque =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'tabla'; cols: string[]; filas: string[][] }

interface Seccion { titulo: string; bloques: Bloque[] }

const texto = (t: string): Bloque => ({ tipo: 'texto', texto: t })
const tabla = (cols: string[], filas: string[][]): Bloque => ({ tipo: 'tabla', cols, filas })

function secciones(d: DatosResumenSemanal): Seccion[] {
  const out: Seccion[] = []
  const sem = `${dmy(d.semana.desde)} al ${dmy(d.semana.hasta)}`

  // Ventas
  const v = d.ventas
  const ventas: Bloque[] = []
  if (v.cantidad === 0) {
    ventas.push(texto('No hubo ventas cerradas en la semana.'))
  } else {
    ventas.push(texto(`${v.cantidad} venta${v.cantidad > 1 ? 's' : ''} · ${plataTotales(v.total)} sin IVA`))
    ventas.push(tabla(['Vendedor', 'Ventas', 'Monto sin IVA'], v.porVendedor.map(p => [p.nombre, String(p.cantidad), plataTotales(p.total)])))
    if (v.top.length) {
      ventas.push(texto('Las 5 ventas más grandes'))
      ventas.push(tabla(['Cliente', 'Formato', 'Monto sin IVA'], v.top.map(t => [`${t.cliente}${t.numero ? ` (OIC #${t.numero})` : ''}`, t.formato, plata(t.monto, t.moneda)])))
    }
  }
  out.push({ titulo: `Ventas de la semana (${sem})`, bloques: ventas })

  // Objetivos
  const o = d.objetivos
  const obj: Bloque[] = []
  if (o.total.objetivo > 0 || o.total.vendido > 0 || o.total.vendidoUSD > 0) {
    obj.push(texto(`Equipo: vendido ${plata(o.total.vendido)} de ${o.total.objetivo > 0 ? plata(o.total.objetivo) : 'sin objetivo cargado'} (${pct(o.total.vendido, o.total.objetivo)})${o.total.vendidoUSD ? ` · además ${plata(o.total.vendidoUSD, 'USD')} en dólares, que no suman al avance` : ''}`))
    if (o.porVendedor.length) {
      obj.push(tabla(['Vendedor', 'Vendido', 'Objetivo', 'Avance'], o.porVendedor.map(p => [p.nombre, plata(p.vendido) + (p.vendidoUSD ? ` + ${plata(p.vendidoUSD, 'USD')}` : ''), p.objetivo > 0 ? plata(p.objetivo) : '—', pct(p.vendido, p.objetivo)])))
    }
  } else {
    obj.push(texto('Todavía no hay objetivos cargados ni ventas en el cuatrimestre.'))
  }
  out.push({ titulo: `Avance del cuatrimestre ${d.cuatrimestre.displayLabel} (sin IVA)`, bloques: obj })

  // Propuestas
  const p = d.propuestas
  const prop: Bloque[] = [texto(`Enviadas en la semana: ${p.enviadas} · Aceptadas: ${p.aceptadas}`)]
  if (p.sinRespuesta.length) {
    prop.push(texto(`${p.sinRespuesta.length} propuesta${p.sinRespuesta.length > 1 ? 's' : ''} sin respuesta hace 6 días o más`))
    prop.push(tabla(['Propuesta', 'Cliente', 'Vendedor', 'Días'], p.sinRespuesta.slice(0, 15).map(s => [s.numero, s.cliente, s.vendedor, String(s.dias)])))
    if (p.sinRespuesta.length > 15) prop.push(texto(`…y ${p.sinRespuesta.length - 15} más.`))
  } else {
    prop.push(texto('Ninguna propuesta lleva 6 días o más sin respuesta.'))
  }
  out.push({ titulo: 'Propuestas', bloques: prop })

  // Ocupación
  const oc = d.ocupacion
  if (oc) {
    const formatos = Array.from(new Set([...oc.mesActual.formatos, ...oc.mesSiguiente.formatos].map(f => f.formato)))
    const de = (m: { formatos: { formato: string; pct: number }[] }, f: string) => { const x = m.formatos.find(y => y.formato === f); return x ? `${x.pct}%` : '—' }
    out.push({
      titulo: 'Ocupación',
      bloques: [
        tabla(['Formato', oc.mesActual.etiqueta, oc.mesSiguiente.etiqueta], formatos.map(f => [f, de(oc.mesActual, f), de(oc.mesSiguiente, f)])),
        texto(`Soportes libres en los próximos 30 días: ${oc.libres30} de ${oc.totalSoportes}`),
      ],
    })
  } else {
    out.push({ titulo: 'Ocupación', bloques: [texto('No se pudo calcular la ocupación esta semana.')] })
  }

  // Cobranza
  const c = d.cobranza
  out.push({
    titulo: 'Cobranza',
    bloques: [
      texto(`Facturado en la semana: ${plataTotales(c.facturado)}`),
      texto(`Cobrado en la semana: ${plataTotales(c.cobrado)}`),
      texto(`Deuda vencida total: ${plataTotales(c.deudaVencida)}${c.facturasVencidas ? ` (${c.facturasVencidas} factura${c.facturasVencidas > 1 ? 's' : ''})` : ''}`),
    ],
  })

  // Alertas
  const a = d.alertas
  const al: Bloque[] = []
  al.push(texto(a.renovaciones.length ? `Renovaciones que vencen en los próximos 30 días: ${a.renovaciones.length}` : 'No hay renovaciones por vencer en los próximos 30 días.'))
  if (a.renovaciones.length) al.push(tabla(['Cliente', 'Vendedor', 'Termina'], a.renovaciones.slice(0, 15).map(r => [`${r.cliente}${r.numero ? ` (OIC #${r.numero})` : ''}`, r.vendedor, dmy(r.fin)])))
  al.push(texto(a.pendientesAprobacion.length ? `Ventas pendientes de aprobación: ${a.pendientesAprobacion.length}` : 'No hay ventas pendientes de aprobación.'))
  if (a.pendientesAprobacion.length) al.push(tabla(['Venta', 'Vendedor', 'Monto'], a.pendientesAprobacion.slice(0, 15).map(x => [`${x.numero ? `OIC #${x.numero} · ` : ''}${x.cliente}`, x.vendedor, plata(x.monto, x.moneda)])))
  al.push(texto(a.gestionesVencidas.length ? 'Gestiones de leads vencidas por vendedor' : 'No hay gestiones de leads vencidas.'))
  if (a.gestionesVencidas.length) al.push(tabla(['Vendedor', 'Gestiones vencidas'], a.gestionesVencidas.map(g => [g.vendedor, String(g.cantidad)])))
  out.push({ titulo: 'Alertas', bloques: al })

  return out
}

// ── Render ────────────────────────────────────────────────────────────────

const TH = 'text-align:left;font-size:12px;color:#6e6a62;padding:4px 8px 4px 0;border-bottom:1px solid #e5e3dc'
const TD = 'font-size:13px;padding:4px 8px 4px 0;border-bottom:1px solid #f0eee8'

function htmlBloque(b: Bloque): string {
  if (b.tipo === 'texto') return `<p style="margin:6px 0">${esc(b.texto)}</p>`
  return `<table style="border-collapse:collapse;width:100%;margin:6px 0"><tr>${b.cols.map(c => `<th style="${TH}">${esc(c)}</th>`).join('')}</tr>${
    b.filas.map(f => `<tr>${f.map(c => `<td style="${TD}">${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`
}

function textoBloque(b: Bloque): string {
  return b.tipo === 'texto' ? b.texto : b.filas.map(f => `  - ${f.join(' · ')}`).join('\n')
}

export function asuntoSemanal(semana: { desde: string }): string {
  return `Resumen semanal Movimagen · semana del ${ddmm(semana.desde)}`
}

export function construirResumenSemanal(d: DatosResumenSemanal, baseUrl = 'https://crm-movimagen.vercel.app'): ResumenSemanal {
  const asunto = asuntoSemanal(d.semana)
  const sec = secciones(d)
  const avisos = d.avisos.length
    ? `<p style="background:#fff7ed;border:1px solid #fdba74;border-radius:6px;padding:8px 10px;font-size:13px">No se pudo cargar: ${esc(d.avisos.join(', '))}.</p>`
    : ''
  const cuerpo = `<p>Así cerró la semana del ${dmy(d.semana.desde)} al ${dmy(d.semana.hasta)} y cómo vamos en el cuatrimestre.</p>${avisos}` +
    sec.map(s => `<h3 style="font-size:15px;margin:18px 0 4px;color:#ec691a">${esc(s.titulo)}</h3>${s.bloques.map(htmlBloque).join('')}`).join('')
  const html = plantillaMail(`Resumen semanal · semana del ${ddmm(d.semana.desde)}`, cuerpo, `${baseUrl}/dashboard`)
  const txt = [asunto, '',
    ...(d.avisos.length ? [`No se pudo cargar: ${d.avisos.join(', ')}.`, ''] : []),
    ...sec.flatMap(s => [s.titulo.toUpperCase(), ...s.bloques.map(textoBloque), ''])].join('\n')
  return { asunto, html, texto: txt }
}
