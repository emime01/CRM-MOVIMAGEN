// ─── Factura interna (documento imprimible, NO comprobante fiscal) ────────────
//
// Genera el HTML de una factura/detalle de facturación a partir de una OIC.
// Se imprime con window.print() (mismo patrón que el PDF del cotizador).
// NO es un CFE de DGI — para eso ver la etapa 2 (integración fiscal).

// Datos del emisor (Movimagen — razón social Giralor S.A.).
// El RUT no se publica online; completalo cuando lo tengas a mano.
export const EMISOR = {
  nombre:       'Movimagen',
  razon_social: 'Giralor S.A.',
  rut:          '', // TODO: completar con el RUT real de Giralor S.A.
  direccion:    'Av. Almirante Harwood 6411, Montevideo',
  telefono:     '(+598) 2600 18 81',
  email:        'info@movimagen.com',
}

interface FacturaItem {
  cantidad: number
  semanas: number
  precio_unitario: number
  descuento_pct: number
  soporte_nombre: string
  soporte_ubicacion: string | null
}

interface FacturaEntidad {
  nombre: string
  empresa: string | null
  rut: string | null
  email: string | null
  telefono: string | null
}

export interface FacturaData {
  numero: number | null
  factura_numero: string | null
  fecha_facturacion: string | null
  moneda: string
  monto_total: number | null
  marca: string | null
  referencia: string | null
  facturar_a: string | null
  fecha_alta: string | null
  fecha_baja: string | null
  receptor: FacturaEntidad
  items: FacturaItem[]
  forma_pago: string | null
}

function fmtDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s.length <= 10 ? s + 'T12:00:00' : s)
  return d.toLocaleDateString('es-UY', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function esc(s: string | null | undefined): string {
  if (!s) return ''
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function facturaHTML(d: FacturaData): string {
  const sym = d.moneda === 'USD' ? 'U$S' : '$'
  const money = (n: number) => `${sym} ${Math.round(n).toLocaleString('es-UY')}`

  const lineas = d.items.map(it => {
    const bruto = it.precio_unitario * it.cantidad * it.semanas
    const subtotal = bruto * (1 - (it.descuento_pct ?? 0) / 100)
    return `
      <tr>
        <td><strong>${esc(it.soporte_nombre)}</strong>${it.soporte_ubicacion ? `<br><span style="color:#6b7280;font-size:10px">${esc(it.soporte_ubicacion)}</span>` : ''}</td>
        <td style="text-align:center">${it.cantidad}</td>
        <td style="text-align:center">${it.semanas}</td>
        <td style="text-align:right">${money(it.precio_unitario)}</td>
        <td style="text-align:center">${it.descuento_pct ? it.descuento_pct + '%' : '—'}</td>
        <td style="text-align:right;font-weight:600">${money(subtotal)}</td>
      </tr>`
  }).join('')

  const sumaLineas = d.items.reduce((s, it) => s + it.precio_unitario * it.cantidad * it.semanas * (1 - (it.descuento_pct ?? 0) / 100), 0)
  const total = d.monto_total ?? sumaLineas

  const numeroFactura = d.factura_numero || (d.numero ? `s/factura · OIC #${String(d.numero).padStart(5, '0')}` : '—')
  const receptorNombre = d.receptor.empresa || d.receptor.nombre || '—'

  const emisorLinea = [EMISOR.rut && `RUT ${esc(EMISOR.rut)}`, EMISOR.direccion && esc(EMISOR.direccion), EMISOR.telefono && esc(EMISOR.telefono), EMISOR.email && esc(EMISOR.email)]
    .filter(Boolean).join(' · ')
  const receptorLineas = [
    d.receptor.rut && `RUT ${esc(d.receptor.rut)}`,
    d.receptor.email && esc(d.receptor.email),
    d.receptor.telefono && esc(d.receptor.telefono),
  ].filter(Boolean).join(' · ')

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Factura ${esc(numeroFactura)}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:0;padding:28px}
    .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #eb691c;padding-bottom:14px;margin-bottom:18px}
    .emisor h1{font-size:24px;margin:0;color:#eb691c;letter-spacing:-0.5px}
    .emisor .line{font-size:10px;color:#6b7280;margin-top:4px;max-width:280px}
    .doc{text-align:right}
    .doc .tipo{font-size:13px;font-weight:700;color:#111}
    .doc .num{font-size:12px;color:#374151;margin-top:2px}
    .doc .fecha{font-size:11px;color:#6b7280;margin-top:2px}
    .parties{display:flex;gap:16px;margin-bottom:18px}
    .party{flex:1;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px}
    .party .lbl{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
    .party .name{font-size:13px;font-weight:700;color:#111}
    .party .sub{font-size:10px;color:#6b7280;margin-top:3px}
    .meta{font-size:11px;color:#374151;margin-bottom:14px}
    .meta span{margin-right:16px}
    table{width:100%;border-collapse:collapse;font-size:11px}
    th{background:#f3f4f6;padding:7px 8px;text-align:left;border-bottom:1px solid #e5e7eb;font-size:10px;text-transform:uppercase;color:#6b7280}
    td{padding:7px 8px;border-bottom:1px solid #f3f4f6;vertical-align:top}
    .totals{display:flex;justify-content:flex-end;margin-top:16px}
    .totals .box{background:#111827;color:#fff;padding:12px 24px;border-radius:8px;text-align:right}
    .totals .t-label{font-size:10px;opacity:.6}
    .totals .t-value{font-size:18px;font-weight:700;margin-top:2px}
    .nota{margin-top:18px;font-size:11px;color:#374151}
    .disclaimer{margin-top:24px;padding:10px 12px;background:#fffbeb;border:1px solid #fcd34d;border-radius:7px;font-size:10px;color:#92400e}
    .footer{margin-top:18px;font-size:10px;color:#9ca3af;text-align:center}
    @media print{body{padding:0}}
  </style></head><body>
  <div class="head">
    <div class="emisor">
      <h1>${esc(EMISOR.nombre)}</h1>
      <div class="line"><strong>${esc(EMISOR.razon_social)}</strong>${emisorLinea ? ' · ' + emisorLinea : ''}</div>
    </div>
    <div class="doc">
      <div class="tipo">DETALLE DE FACTURACIÓN</div>
      <div class="num">${esc(numeroFactura)}</div>
      <div class="fecha">Fecha: ${fmtDate(d.fecha_facturacion)}</div>
    </div>
  </div>

  <div class="parties">
    <div class="party">
      <div class="lbl">Facturar a${d.facturar_a === 'agencia' ? ' (agencia)' : ''}</div>
      <div class="name">${esc(receptorNombre)}</div>
      ${receptorLineas ? `<div class="sub">${receptorLineas}</div>` : ''}
    </div>
    <div class="party">
      <div class="lbl">Referencia</div>
      <div class="name">${d.marca ? esc(d.marca) : '—'}</div>
      ${d.referencia ? `<div class="sub">${esc(d.referencia)}</div>` : ''}
    </div>
  </div>

  <div class="meta">
    <span><strong>Período:</strong> ${fmtDate(d.fecha_alta)} – ${fmtDate(d.fecha_baja)}</span>
    ${d.forma_pago ? `<span><strong>Forma de pago:</strong> ${esc(d.forma_pago)}</span>` : ''}
  </div>

  <table>
    <thead><tr>
      <th>Soporte</th>
      <th style="text-align:center">Cant.</th>
      <th style="text-align:center">Sem.</th>
      <th style="text-align:right">Precio unit.</th>
      <th style="text-align:center">Desc.</th>
      <th style="text-align:right">Subtotal</th>
    </tr></thead>
    <tbody>${lineas || '<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:16px">Sin ítems</td></tr>'}</tbody>
  </table>

  <div class="totals">
    <div class="box">
      <div class="t-label">TOTAL ${esc(d.moneda)}</div>
      <div class="t-value">${money(total)}</div>
    </div>
  </div>

  <div class="disclaimer">
    Documento interno generado desde el CRM — <strong>no válido como comprobante fiscal</strong>.
    La factura electrónica oficial (CFE) se emite por el sistema de facturación de la empresa.
  </div>

  <p class="footer">Generado el ${new Date().toLocaleString('es-UY')} · ${esc(EMISOR.nombre)} CRM</p>
  </body></html>`
}
