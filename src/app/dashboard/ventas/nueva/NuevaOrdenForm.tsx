'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, ChevronLeft } from 'lucide-react'

interface Soporte {
  id: string
  nombre: string
  categoria: string | null
  tipo: string | null
  ubicacion: string | null
  precio_base: number | null
  precio_semanal: number | null
  costo_produccion: number | null
}

interface Cliente {
  id: string
  nombre: string
  empresa: string | null
}

interface Agencia {
  id: string
  nombre: string
}

interface Vendedor {
  id: string
  nombre: string
}

interface ItemRow {
  id: string
  soporteId: string
  cantidad: number
  semanas: number
  salidas: number
  segundos: number
  precioUnitario: number
  descuentoPct: number
  nota: string
  requiereGrabado: boolean
  requiereProduccion: boolean
  esDigital: boolean
}

interface Props {
  soportes: Soporte[]
  clientes: Cliente[]
  agencias: Agencia[]
  vendedores: Vendedor[]
  formasPago: string[]
  currentUserId: string
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 38,
  padding: '0 12px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 13,
  fontFamily: 'Montserrat, sans-serif',
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
  background: 'white',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  marginBottom: 6,
}

const sectionStyle: React.CSSProperties = {
  background: 'var(--bg-card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 24,
  marginBottom: 20,
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--text-primary)',
  marginBottom: 20,
  paddingBottom: 12,
  borderBottom: '1px solid var(--border)',
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function emptyItem(): ItemRow {
  return {
    id: uid(),
    soporteId: '',
    cantidad: 1,
    semanas: 4,
    salidas: 0,
    segundos: 0,
    precioUnitario: 0,
    descuentoPct: 0,
    nota: '',
    requiereGrabado: false,
    requiereProduccion: false,
    esDigital: false,
  }
}

const IVA_RATE = 0.22

export default function NuevaOrdenForm({ soportes, clientes, agencias, vendedores, formasPago, currentUserId }: Props) {
  const router = useRouter()

  // Header state
  const [clienteId, setClienteId] = useState('')
  const [contacto, setContacto] = useState('')
  const [agenciaId, setAgenciaId] = useState('')
  const [facturarA, setFacturarA] = useState<'agencia' | 'cliente_final'>('cliente_final')
  const [marca, setMarca] = useState('')
  const [referencia, setReferencia] = useState('')
  const [validez, setValidez] = useState('')
  const [esCanje, setEsCanje] = useState(false)
  const [incluirReportes, setIncluirReportes] = useState(true)
  const [asignadoAId, setAsignadoAId] = useState(currentUserId)
  const [moneda, setMoneda] = useState<'USD' | 'UYU'>('USD')
  const [fechaAltaPrevista, setFechaAltaPrevista] = useState('')
  const [fechaBajaPrevista, setFechaBajaPrevista] = useState('')

  // Items state
  const [items, setItems] = useState<ItemRow[]>([emptyItem()])

  // Conditions state
  const [formaPagoArrend, setFormaPagoArrend] = useState('')
  const [comentarioArrend, setComentarioArrend] = useState('')
  const [formaPagoProd, setFormaPagoProd] = useState('')
  const [comentarioProd, setComentarioProd] = useState('')

  // UI state
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Totals
  const totals = useMemo(() => {
    let subtotal = 0
    let totalDescuento = 0
    items.forEach(item => {
      if (!item.soporteId) return
      const bruto = item.precioUnitario * item.cantidad * item.semanas
      const descuento = bruto * (item.descuentoPct / 100)
      subtotal += bruto - descuento
      totalDescuento += descuento
    })
    const iva = subtotal * IVA_RATE
    const total = subtotal + iva
    return { subtotal, totalDescuento, iva, total }
  }, [items])

  function itemLineTotal(item: ItemRow): number {
    if (!item.soporteId) return 0
    const bruto = item.precioUnitario * item.cantidad * item.semanas
    return bruto * (1 - item.descuentoPct / 100)
  }

  function updateItem(id: string, changes: Partial<ItemRow>) {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...changes } : item))
  }

  function handleSoporteChange(itemId: string, soporteId: string) {
    const soporte = soportes.find(s => s.id === soporteId)
    const esDigital = soporte?.tipo?.toLowerCase().includes('digital') ?? false
    const precio = soporte?.precio_semanal ?? soporte?.precio_base ?? 0
    updateItem(itemId, {
      soporteId,
      esDigital,
      precioUnitario: precio,
      requiereProduccion: !!soporte?.costo_produccion,
    })
  }

  function addItem() {
    setItems(prev => [...prev, emptyItem()])
  }

  function removeItem(id: string) {
    setItems(prev => prev.filter(item => item.id !== id))
  }

  async function handleSubmit(estado: 'borrador' | 'pendiente_aprobacion') {
    setError('')
    if (!clienteId) {
      setError('Seleccioná un cliente.')
      return
    }
    if (items.some(i => i.soporteId && i.precioUnitario <= 0)) {
      setError('Todos los ítems deben tener un precio mayor a 0.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/ordenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clienteId,
          contacto,
          agenciaId: agenciaId || undefined,
          facturarA: agenciaId ? facturarA : undefined,
          marca,
          referencia,
          validez: validez || undefined,
          fechaAltaPrevista: fechaAltaPrevista || undefined,
          fechaBajaPrevista: fechaBajaPrevista || undefined,
          moneda,
          esCanje,
          incluirReportes,
          asignadoAId,
          formaPagoArrend: formaPagoArrend || undefined,
          comentarioArrend: comentarioArrend || undefined,
          formaPagoProd: formaPagoProd || undefined,
          comentarioProd: comentarioProd || undefined,
          estado,
          items: items
            .filter(i => i.soporteId)
            .map(i => ({
              soporteId: i.soporteId,
              cantidad: i.cantidad,
              semanas: i.semanas,
              salidas: i.esDigital ? i.salidas : undefined,
              segundos: i.esDigital ? i.segundos : undefined,
              precioUnitario: i.precioUnitario,
              descuentoPct: i.descuentoPct,
              nota: i.nota || undefined,
              requiereGrabado: i.requiereGrabado,
              requiereProduccion: i.requiereProduccion,
            })),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Error al guardar la orden.')
        return
      }

      router.push('/dashboard/ventas')
    } catch {
      setError('Error de red. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat('es-UY', {
    style: 'currency', currency: moneda,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n)

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif', maxWidth: 960, margin: '0 auto' }}>

      {/* Back link */}
      <button
        onClick={() => router.back()}
        style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, padding: 0, marginBottom: 20 }}
      >
        <ChevronLeft size={16} /> Volver a Ventas
      </button>

      {/* Section 1: Header */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Datos de la orden</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          <div>
            <label style={labelStyle}>Cuenta (cliente) *</label>
            <select value={clienteId} onChange={e => setClienteId(e.target.value)} style={inputStyle}>
              <option value="">— Seleccioná un cliente —</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}{c.empresa ? ` (${c.empresa})` : ''}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Contacto</label>
            <input type="text" value={contacto} onChange={e => setContacto(e.target.value)} placeholder="Nombre del contacto" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Agencia (opcional)</label>
            <select value={agenciaId} onChange={e => setAgenciaId(e.target.value)} style={inputStyle}>
              <option value="">— Sin agencia —</option>
              {agencias.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </div>

          {agenciaId && (
            <div>
              <label style={labelStyle}>Facturar a</label>
              <div style={{ display: 'flex', gap: 16, height: 38, alignItems: 'center' }}>
                {(['agencia', 'cliente_final'] as const).map(v => (
                  <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)' }}>
                    <input type="radio" name="facturarA" value={v} checked={facturarA === v} onChange={() => setFacturarA(v)} />
                    {v === 'agencia' ? 'Agencia' : 'Cliente final'}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label style={labelStyle}>Marca</label>
            <input type="text" value={marca} onChange={e => setMarca(e.target.value)} placeholder="Marca o campaña" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Referencia</label>
            <input type="text" value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Código o referencia interna" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Validez</label>
            <input type="date" value={validez} onChange={e => setValidez(e.target.value)} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Moneda *</label>
            <div style={{ display: 'flex', gap: 16, height: 38, alignItems: 'center' }}>
              {(['USD', 'UYU'] as const).map(v => (
                <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)' }}>
                  <input type="radio" name="moneda" value={v} checked={moneda === v} onChange={() => setMoneda(v)} />
                  {v}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Fecha alta prevista</label>
            <input type="date" value={fechaAltaPrevista} onChange={e => setFechaAltaPrevista(e.target.value)} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Fecha baja prevista</label>
            <input type="date" value={fechaBajaPrevista} onChange={e => setFechaBajaPrevista(e.target.value)} style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Asignado a</label>
            <select value={asignadoAId} onChange={e => setAsignadoAId(e.target.value)} style={inputStyle}>
              {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 24, paddingTop: 24 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={esCanje} onChange={e => setEsCanje(e.target.checked)} />
              Es canje
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={incluirReportes} onChange={e => setIncluirReportes(e.target.checked)} />
              Incluir en reportes
            </label>
          </div>
        </div>
      </div>

      {/* Section 2: Products */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Líneas de productos</div>

        {/* Items table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead>
              <tr style={{ background: 'var(--gray-100)' }}>
                {['Soporte', 'Cant.', 'Semanas', 'P. Unitario', '% Desc.', 'Total', 'Nota', ''].map(h => (
                  <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '8px 10px', minWidth: 200 }}>
                    <select
                      value={item.soporteId}
                      onChange={e => handleSoporteChange(item.id, e.target.value)}
                      style={{ ...inputStyle, height: 34, fontSize: 12 }}
                    >
                      <option value="">— Soporte —</option>
                      {Array.from(new Set(soportes.map(s => s.categoria ?? 'Sin categoría'))).sort().map(cat => (
                        <optgroup key={cat} label={cat}>
                          {soportes.filter(s => (s.categoria ?? 'Sin categoría') === cat).map(s => (
                            <option key={s.id} value={s.id}>{s.nombre}{s.ubicacion ? ` — ${s.ubicacion}` : ''}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    {item.esDigital && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                        <input type="number" min={0} value={item.salidas} onChange={e => updateItem(item.id, { salidas: +e.target.value })}
                          placeholder="Salidas" style={{ ...inputStyle, height: 30, fontSize: 11 }} />
                        <input type="number" min={0} value={item.segundos} onChange={e => updateItem(item.id, { segundos: +e.target.value })}
                          placeholder="Segundos" style={{ ...inputStyle, height: 30, fontSize: 11 }} />
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '8px 10px', width: 70 }}>
                    <input type="number" min={1} value={item.cantidad} onChange={e => updateItem(item.id, { cantidad: Math.max(1, +e.target.value) })}
                      style={{ ...inputStyle, height: 34, fontSize: 12 }} />
                  </td>
                  <td style={{ padding: '8px 10px', width: 80 }}>
                    <input type="number" min={1} value={item.semanas} onChange={e => updateItem(item.id, { semanas: Math.max(1, +e.target.value) })}
                      style={{ ...inputStyle, height: 34, fontSize: 12 }} />
                  </td>
                  <td style={{ padding: '8px 10px', width: 110 }}>
                    <input type="number" min={0} step={0.01} value={item.precioUnitario} onChange={e => updateItem(item.id, { precioUnitario: Math.max(0, +e.target.value) })}
                      style={{ ...inputStyle, height: 34, fontSize: 12 }} />
                  </td>
                  <td style={{ padding: '8px 10px', width: 80 }}>
                    <input type="number" min={0} max={100} step={0.5} value={item.descuentoPct} onChange={e => updateItem(item.id, { descuentoPct: Math.min(100, Math.max(0, +e.target.value)) })}
                      style={{ ...inputStyle, height: 34, fontSize: 12 }} />
                  </td>
                  <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', minWidth: 100 }}>
                    {item.soporteId ? fmt(itemLineTotal(item)) : '—'}
                  </td>
                  <td style={{ padding: '8px 10px', minWidth: 160 }}>
                    <input type="text" value={item.nota} onChange={e => updateItem(item.id, { nota: e.target.value })}
                      placeholder="Nota opcional" style={{ ...inputStyle, height: 34, fontSize: 12 }} />
                  </td>
                  <td style={{ padding: '8px 10px', width: 40 }}>
                    <button
                      onClick={() => removeItem(item.id)}
                      disabled={items.length === 1}
                      style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: items.length === 1 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: items.length === 1 ? 0.3 : 1 }}
                    >
                      <Trash2 size={13} color="var(--red)" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <button
          onClick={addItem}
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, padding: '8px 14px', borderRadius: 8, border: '1px dashed var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)', fontFamily: 'Montserrat, sans-serif' }}
        >
          <Plus size={14} />
          Agregar producto
        </button>

        {/* Totals */}
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: 280 }}>
            {[
              { label: 'Subtotal', value: fmt(totals.subtotal + totals.totalDescuento), muted: false },
              { label: 'Descuentos', value: `– ${fmt(totals.totalDescuento)}`, muted: true },
              { label: 'Neto', value: fmt(totals.subtotal), muted: false },
              { label: `IVA (${(IVA_RATE * 100).toFixed(0)}%)`, value: fmt(totals.iva), muted: true },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 13, color: row.muted ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
                <span>{row.label}</span>
                <span>{row.value}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', borderTop: '2px solid var(--border)', marginTop: 4 }}>
              <span>Total</span>
              <span style={{ color: 'var(--orange)' }}>{fmt(totals.total)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Conditions */}
      <div style={sectionStyle}>
        <div style={sectionTitleStyle}>Condiciones de pago</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          <div>
            <label style={labelStyle}>Forma de pago — Arrendamiento</label>
            <select value={formaPagoArrend} onChange={e => setFormaPagoArrend(e.target.value)} style={inputStyle}>
              <option value="">— Seleccioná —</option>
              {formasPago.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Comentario arrendamiento</label>
            <input type="text" value={comentarioArrend} onChange={e => setComentarioArrend(e.target.value)} placeholder="Condiciones adicionales" style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Forma de pago — Producción</label>
            <select value={formaPagoProd} onChange={e => setFormaPagoProd(e.target.value)} style={inputStyle}>
              <option value="">— Seleccioná —</option>
              {formasPago.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Comentario producción</label>
            <input type="text" value={comentarioProd} onChange={e => setComentarioProd(e.target.value)} placeholder="Condiciones adicionales" style={inputStyle} />
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div style={{ padding: '12px 16px', background: 'var(--red-pale)', border: '1px solid var(--red)', borderRadius: 8, marginBottom: 16, color: 'var(--red)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingBottom: 40 }}>
        <button
          onClick={() => router.back()}
          disabled={saving}
          style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', fontFamily: 'Montserrat, sans-serif' }}
        >
          Cancelar
        </button>
        <button
          onClick={() => handleSubmit('borrador')}
          disabled={saving}
          style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'Montserrat, sans-serif', opacity: saving ? 0.6 : 1 }}
        >
          {saving ? 'Guardando...' : 'Guardar borrador'}
        </button>
        <button
          onClick={() => handleSubmit('pendiente_aprobacion')}
          disabled={saving}
          style={{ padding: '10px 24px', borderRadius: 8, border: 'none', background: 'var(--orange)', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: 'Montserrat, sans-serif', opacity: saving ? 0.6 : 1 }}
          onMouseEnter={e => !saving && (e.currentTarget.style.background = 'var(--orange-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'var(--orange)')}
        >
          Enviar para aprobación
        </button>
      </div>
    </div>
  )
}
