import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

// ─── helpers ────────────────────────────────────────────────────────────────

function formatOrden(numero: number | null | undefined): string {
  if (!numero) return '—'
  return `ORD-${new Date().getFullYear()}-${String(numero).padStart(4, '0')}`
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ─── badge styles ───────────────────────────────────────────────────────────

const GRABADO_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pendiente: { bg: '#fef9ec', color: '#b45309', label: 'Pendiente' },
  grabado:   { bg: '#f0fdf4', color: '#15803d', label: 'Grabado' },
}

const PRODUCCION_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  pendiente:      { bg: '#f1f0ec', color: '#6b6965',  label: 'Pendiente' },
  en_produccion:  { bg: '#eff6ff', color: '#1d4ed8',  label: 'En producción' },
  producido:      { bg: '#fef3ec', color: '#eb691c',  label: 'Producido' },
  instalado:      { bg: '#f0fdf4', color: '#15803d',  label: 'Instalado' },
}

function Badge({ bg, color, label }: { bg: string; color: string; label: string }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 99,
      fontSize: 11,
      fontWeight: 600,
      background: bg,
      color,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  )
}

// ─── types ───────────────────────────────────────────────────────────────────

interface Soporte {
  nombre: string | null
  seccion: string | null
  ubicacion: string | null
}

interface Cliente {
  nombre: string | null
  empresa: string | null
}

interface OrdenVenta {
  id: string
  numero: number | null
  estado: string | null
  marca: string | null
  referencia: string | null
  fecha_alta_prevista: string | null
  fecha_baja_prevista: string | null
  clientes: Cliente | null
}

interface OrdenItem {
  id: string
  cantidad: number | null
  semanas: number | null
  requiere_grabado: boolean | null
  requiere_produccion: boolean | null
  estado_grabado: string | null
  estado_produccion: string | null
  numero_bus: string | null
  soportes: Soporte | null
  ordenes_venta: OrdenVenta | null
}

// ─── summary card ────────────────────────────────────────────────────────────

function SummaryCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div style={{
      background: '#fff',
      border: '1px solid #e5e3dc',
      borderRadius: 10,
      padding: '16px 20px',
      minWidth: 140,
    }}>
      <div style={{
        fontSize: 28,
        fontWeight: 800,
        color: accent ? '#eb691c' : '#1a1915',
        lineHeight: 1,
      }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: '#9a9895', marginTop: 4, fontWeight: 500 }}>
        {label}
      </div>
    </div>
  )
}

// ─── page ────────────────────────────────────────────────────────────────────

export default async function OicPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  if ((session.user as { rol?: string }).rol !== 'operaciones') redirect('/dashboard')

  const supabase = createServerClient()

  const { data: items, error } = await supabase
    .from('orden_items')
    .select(`
      id, cantidad, semanas, requiere_grabado, requiere_produccion,
      estado_grabado, estado_produccion, numero_bus,
      soportes(nombre, seccion, ubicacion),
      ordenes_venta!inner(
        id, numero, estado, marca, referencia,
        fecha_alta_prevista, fecha_baja_prevista,
        clientes(nombre, empresa)
      )
    `)
    .eq('ordenes_venta.estado', 'en_oic')
    .order('created_at', { ascending: true })

  const rows = (items ?? []) as unknown as OrdenItem[]

  // Summaries
  const total = rows.length
  const pendienteGrabado = rows.filter(r => r.estado_grabado === 'pendiente').length
  const listos = rows.filter(
    r => r.estado_produccion === 'instalado' || r.estado_produccion === 'producido'
  ).length

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif', color: '#1a1915' }}>

      {/* Summary row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <SummaryCard label="Items en OIC" value={total} accent />
        <SummaryCard label="Pendiente grabado" value={pendienteGrabado} />
        <SummaryCard label="Producidos / instalados" value={listos} />
      </div>

      {/* Error state */}
      {error && (
        <div style={{
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 8,
          padding: '12px 16px',
          color: '#dc2626',
          fontSize: 13,
          marginBottom: 16,
        }}>
          Error al cargar los datos: {error.message}
        </div>
      )}

      {/* Empty state */}
      {!error && rows.length === 0 && (
        <div style={{
          background: '#fff',
          border: '1px solid #e5e3dc',
          borderRadius: 10,
          padding: '48px 24px',
          textAlign: 'center',
          color: '#9a9895',
          fontSize: 14,
        }}>
          No hay items en estado OIC en este momento.
        </div>
      )}

      {/* Table */}
      {rows.length > 0 && (
        <div style={{
          background: '#fff',
          border: '1px solid #e5e3dc',
          borderRadius: 10,
          overflow: 'hidden',
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
            }}>
              <thead>
                <tr style={{ background: '#fafaf8', borderBottom: '1px solid #e5e3dc' }}>
                  {['Orden #', 'Cliente', 'Soporte', 'Alta prevista', 'Grabado', 'Producción', 'Bus asignado'].map(col => (
                    <th key={col} style={{
                      padding: '10px 16px',
                      textAlign: 'left',
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#9a9895',
                      letterSpacing: '0.5px',
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((item, idx) => {
                  const orden = item.ordenes_venta
                  const cliente = orden?.clientes
                  const soporte = item.soportes

                  const grabadoStyle = GRABADO_STYLES[item.estado_grabado ?? 'pendiente'] ?? GRABADO_STYLES.pendiente
                  const produccionStyle = PRODUCCION_STYLES[item.estado_produccion ?? 'pendiente'] ?? PRODUCCION_STYLES.pendiente

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: idx < rows.length - 1 ? '1px solid #f0ede8' : 'none',
                        background: idx % 2 === 0 ? '#fff' : '#fafaf8',
                      }}
                    >
                      {/* Orden # */}
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 700, color: '#eb691c' }}>
                          {formatOrden(orden?.numero)}
                        </span>
                        {orden?.marca && (
                          <div style={{ fontSize: 11, color: '#9a9895', marginTop: 2 }}>
                            {orden.marca}
                          </div>
                        )}
                      </td>

                      {/* Cliente */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontWeight: 600, color: '#1a1915' }}>
                          {cliente?.empresa || cliente?.nombre || '—'}
                        </span>
                      </td>

                      {/* Soporte */}
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontWeight: 500 }}>
                          {soporte?.nombre || '—'}
                        </span>
                        {soporte?.ubicacion && (
                          <div style={{ fontSize: 11, color: '#9a9895', marginTop: 2 }}>
                            {soporte.ubicacion}
                          </div>
                        )}
                      </td>

                      {/* Alta prevista */}
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: '#4a4845' }}>
                        {formatDate(orden?.fecha_alta_prevista)}
                      </td>

                      {/* Grabado */}
                      <td style={{ padding: '12px 16px' }}>
                        {item.requiere_grabado === false ? (
                          <span style={{ fontSize: 11, color: '#9a9895' }}>N/A</span>
                        ) : (
                          <Badge {...grabadoStyle} />
                        )}
                      </td>

                      {/* Producción */}
                      <td style={{ padding: '12px 16px' }}>
                        {item.requiere_produccion === false ? (
                          <span style={{ fontSize: 11, color: '#9a9895' }}>N/A</span>
                        ) : (
                          <Badge {...produccionStyle} />
                        )}
                      </td>

                      {/* Bus asignado */}
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        {item.numero_bus ? (
                          <span style={{
                            fontWeight: 700,
                            color: '#1a1915',
                            background: '#f1f0ec',
                            padding: '2px 8px',
                            borderRadius: 6,
                            fontSize: 12,
                          }}>
                            #{item.numero_bus}
                          </span>
                        ) : (
                          <span style={{ color: '#9a9895' }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer count */}
      {rows.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 12, color: '#9a9895', textAlign: 'right' }}>
          {rows.length} {rows.length === 1 ? 'item' : 'items'} en OIC
        </div>
      )}
    </div>
  )
}
