/**
 * Excel del canon (en el navegador), con exceljs: logo de cada shopping,
 * fórmulas en todo lo que es cuenta y siempre en pesos.
 */

const IVA = 0.22
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`

export interface LineaInforme {
  agencia: string | null; marca: string | null; numero: string | null; tipo: string
  arrendamiento: number; pct_agencia: number; pct_canon: number
  cuota: number; cuotas_total: number; plan?: { cuota: number; cuotas: number } | null
}
export interface ShoppingInforme {
  shopping: { nombre: string; canon_minimo?: number }
  lineas: LineaInforme[]
  minimo: number; arrastre: number; diferido: number
}

/** El logo de cada shopping, por su nombre (public/logos-shoppings). */
export function logoDe(nombre: string): string | null {
  const n = nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  for (const k of ['colonia', 'salto', 'mercedes', 'paysandu', 'minas', 'atlantico']) if (n.includes(k)) return `/logos-shoppings/${k}.png`
  return null
}

async function imagenBase64(url: string): Promise<{ base64: string; ancho: number; alto: number } | null> {
  try {
    const blob = await (await fetch(url)).blob()
    const base64 = await new Promise<string>((ok, mal) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = mal; r.readAsDataURL(blob) })
    const dim = await new Promise<{ ancho: number; alto: number }>(ok => { const i = new Image(); i.onload = () => ok({ ancho: i.width, alto: i.height }); i.onerror = () => ok({ ancho: 120, alto: 120 }); i.src = base64 })
    return { base64, ...dim }
  } catch { return null }
}

async function descargar(wb: any, archivo: string) {
  const buf = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a'); a.href = url; a.download = archivo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\\/:*?"<>|]/g, '')
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const PESOS = '"$" #,##0.00'
const VERDE = 'FFD9EAD3'

/** Informe de un shopping para mandarle: con logo, fecha (1.º del mes) y fórmulas. */
export async function informeShoppingExcel(f: ShoppingInforme, mes: string) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Canon', { views: [{ showGridLines: false }] })
  ws.columns = [{ width: 22 }, { width: 26 }, { width: 13 }, { width: 16 }, { width: 8 }, { width: 16 }, { width: 9 }, { width: 15 }]

  // Logo arriba a la izquierda (filas 1-4) y el título al lado.
  const url = logoDe(f.shopping.nombre)
  const logo = url ? await imagenBase64(url) : null
  if (logo) {
    const id = wb.addImage({ base64: logo.base64, extension: 'png' })
    const alto = 72, ancho = Math.round(logo.ancho * alto / logo.alto)
    ws.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: ancho, height: alto } })
  }
  for (let r = 1; r <= 4; r++) ws.getRow(r).height = 19
  ws.getCell('C1').value = `Informe de canon · ${f.shopping.nombre}`
  ws.getCell('C1').font = { bold: true, size: 14 }
  ws.getCell('C2').value = `Mes liquidado: ${nombreMes(mes)}`
  ws.getCell('C3').value = 'Fecha:'
  ws.getCell('D3').value = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1))
  ws.getCell('D3').numFmt = 'dd/mm/yyyy'
  ws.getCell('D3').alignment = { horizontal: 'left' }
  ws.getCell('C4').value = 'Importes en pesos, sin IVA.'
  ws.getCell('C4').font = { italic: true, size: 9, color: { argb: 'FF777777' } }

  const H = 6
  const cab = ['Agencia', 'Marca - Anunciante', 'Nº factura', 'Arrend. s/IVA', '% Ag.', '$ Neto de Ag.', '% Canon', 'Canon']
  cab.forEach((t, i) => {
    const c = ws.getCell(H, i + 1)
    c.value = t; c.font = { bold: true }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } }
    c.alignment = { horizontal: i >= 3 ? 'right' : 'left' }
  })

  let r = H + 1
  for (const l of f.lineas) {
    const fila = ws.getRow(r)
    fila.getCell(1).value = l.agencia ?? 'Directo'
    fila.getCell(2).value = (l.marca ?? '') + (l.tipo === 'nota_credito' ? ' (nota de crédito)' : '')
      + (l.plan ? ` · cuota ${l.plan.cuota} de ${l.plan.cuotas}` : l.cuotas_total > 1 ? ` · cuota ${l.cuota} de ${l.cuotas_total}` : '')
    fila.getCell(3).value = l.numero ?? ''
    fila.getCell(4).value = l.arrendamiento
    fila.getCell(5).value = l.pct_agencia
    // Neto de agencia y canon: fórmulas (con el resultado ya calculado).
    const neto = Math.round(l.arrendamiento * (1 - l.pct_agencia / 100) * 100) / 100
    fila.getCell(6).value = { formula: `D${r}*(1-E${r}/100)`, result: neto }
    fila.getCell(7).value = l.pct_canon
    fila.getCell(8).value = { formula: `F${r}*G${r}/100`, result: Math.round(neto * l.pct_canon) / 100 }
    for (const c of [4, 6, 8]) fila.getCell(c).numFmt = PESOS
    r++
  }
  const ult = r - 1
  const variable = f.lineas.reduce((t, l) => t + Math.round(l.arrendamiento * (1 - l.pct_agencia / 100) * l.pct_canon) / 100, 0)
  r++

  const filaTotal = (texto: string, valor: { formula: string; result: number } | number, negrita = false) => {
    const fila = ws.getRow(r)
    fila.getCell(1).value = texto
    fila.getCell(8).value = valor
    fila.getCell(8).numFmt = PESOS
    if (negrita) { fila.getCell(1).font = { bold: true }; fila.getCell(8).font = { bold: true } }
    return r++
  }
  const suma = f.lineas.length ? `SUM(H${H + 1}:H${ult})` : '0'
  const rArr = f.arrastre ? filaTotal('Del mes anterior', f.arrastre) : null
  const rDif = f.diferido ? filaTotal('Pasa al mes siguiente', -f.diferido) : null
  // El mínimo no se muestra, pero si lo hay, manda.
  const formulaPagar = `${f.minimo ? `MAX(${suma},${f.minimo})` : suma}${rArr ? `+H${rArr}` : ''}${rDif ? `+H${rDif}` : ''}`
  const aPagar = Math.round((Math.max(variable, f.minimo || 0) + (f.arrastre || 0) - (f.diferido || 0)) * 100) / 100
  const rPagar = filaTotal('Canon a pagar', { formula: formulaPagar, result: aPagar }, true)
  const rIva = filaTotal('IVA 22%', { formula: `H${rPagar}*${IVA}`, result: Math.round(aPagar * IVA * 100) / 100 })
  filaTotal('Total con IVA', { formula: `H${rPagar}+H${rIva}`, result: Math.round(aPagar * (1 + IVA) * 100) / 100 }, true)

  await descargar(wb, `Canon ${f.shopping.nombre} ${nombreMes(mes)}.xlsx`)
}

export interface FilaResumen {
  shopping: string; pct: number; variable: number; minimo: number; arrastre: number; diferido: number
  estado: string; fecha_pago: string | null
}

/** Resumen del mes (todos los shoppings), con fórmulas; sin mínimo ni USD. */
export async function resumenMesExcel(filas: FilaResumen[], mes: string) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Canon')
  ws.columns = [{ width: 32 }, { width: 9 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 16 }, { width: 14 }, { width: 16 }, { width: 11 }, { width: 13 }]
  ws.getCell('A1').value = `Canon · ${nombreMes(mes)}`
  ws.getCell('A1').font = { bold: true, size: 14 }
  ws.getCell('A2').value = 'Fecha:'
  ws.getCell('B2').value = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1))
  ws.getCell('B2').numFmt = 'dd/mm/yyyy'
  const H = 4
  ;['Shopping', '% Canon', 'Canon variable', 'Del mes anterior', 'Pasa al siguiente', 'A pagar', 'IVA', 'Total con IVA', 'Estado', 'Fecha de pago'].forEach((t, i) => {
    const c = ws.getCell(H, i + 1); c.value = t; c.font = { bold: true }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } }
  })
  let r = H + 1
  for (const f of filas) {
    const fila = ws.getRow(r)
    const aPagar = Math.round((Math.max(f.variable, f.minimo || 0) + f.arrastre - f.diferido) * 100) / 100
    fila.values = [f.shopping, f.pct, f.variable, f.arrastre, f.diferido]
    fila.getCell(6).value = { formula: `${f.minimo ? `MAX(C${r},${f.minimo})` : `C${r}`}+D${r}-E${r}`, result: aPagar }
    fila.getCell(7).value = { formula: `F${r}*${IVA}`, result: Math.round(aPagar * IVA * 100) / 100 }
    fila.getCell(8).value = { formula: `F${r}+G${r}`, result: Math.round(aPagar * (1 + IVA) * 100) / 100 }
    fila.getCell(9).value = f.estado
    fila.getCell(10).value = f.fecha_pago ? f.fecha_pago.split('-').reverse().join('/') : ''
    for (const c of [3, 4, 5, 6, 7, 8]) fila.getCell(c).numFmt = PESOS
    r++
  }
  if (filas.length) {
    const fila = ws.getRow(r)
    fila.getCell(1).value = 'Total'; fila.getCell(1).font = { bold: true }
    for (const [c, col] of [[3, 'C'], [4, 'D'], [5, 'E'], [6, 'F'], [7, 'G'], [8, 'H']] as const) {
      fila.getCell(c).value = { formula: `SUM(${col}${H + 1}:${col}${r - 1})` }
      fila.getCell(c).numFmt = PESOS; fila.getCell(c).font = { bold: true }
    }
  }
  await descargar(wb, `Canon ${nombreMes(mes)}.xlsx`)
}
