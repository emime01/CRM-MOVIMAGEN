import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const fmt = (n: number) => '$' + n.toLocaleString('es-UY', { maximumFractionDigits: 0 })

const ROL_LABELS: Record<string, string> = {
  vendedor: 'Vendedor',
  asistente_ventas: 'Asistente de Ventas',
  gerente_comercial: 'Gerente Comercial',
  operaciones: 'Operaciones',
  arte: 'Arte',
  administracion: 'Administración',
}

export default async function ConfigPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  const supabase = createServerClient()

  const [{ data: perfiles }, { data: soportes }, { data: objetivos }] = await Promise.all([
    supabase.from('perfiles').select('id, nombre, rol, activo, email').order('rol').order('nombre'),
    supabase.from('soportes').select('id, nombre, seccion, ubicacion, tipo, precio_base, activo').order('seccion').order('nombre'),
    supabase.from('objetivos').select('vendedor_id, cuatrimestre, objetivo_monto').order('cuatrimestre'),
  ])

  const cy = new Date().getFullYear()
  const CUATRIMESTRES = [`Q1-${cy}`, `Q2-${cy}`, `Q3-${cy}`]
  const vendedores = perfiles?.filter(p => ['vendedor', 'asistente_ventas'].includes(p.rol)) ?? []

  const objMap: Record<string, number> = {}
  objetivos?.forEach(o => { objMap[`${o.vendedor_id}-${o.cuatrimestre}`] = Number(o.objetivo_monto) })

  const TIPO_LABELS: Record<string, string> = { estatico: 'Estático', led: 'LED', digital: 'Digital', bus: 'Bus' }

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      {/* Users */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Usuarios del sistema</div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{perfiles?.length ?? 0} usuarios</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
              {['Nombre', 'Email', 'Rol', 'Estado'].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {perfiles?.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '11px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>{p.nombre}</td>
                <td style={{ padding: '11px 16px', color: 'var(--text-muted)', fontSize: 12 }}>{p.email ?? '—'}</td>
                <td style={{ padding: '11px 16px', color: 'var(--text-secondary)' }}>{ROL_LABELS[p.rol] ?? p.rol}</td>
                <td style={{ padding: '11px 16px' }}>
                  <span style={{
                    background: p.activo ? 'rgba(21,128,61,0.12)' : 'rgba(107,114,128,0.12)',
                    color: p.activo ? '#15803d' : '#6b7280',
                    padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700
                  }}>{p.activo ? 'Activo' : 'Inactivo'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Objectives config */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Objetivos de ventas {cy}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>Vendedor</th>
              {CUATRIMESTRES.map(q => (
                <th key={q} style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>{q}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vendedores.map(v => (
              <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '11px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {v.nombre}
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 6 }}>{ROL_LABELS[v.rol] ?? v.rol}</span>
                </td>
                {CUATRIMESTRES.map(q => {
                  const val = objMap[`${v.id}-${q}`]
                  return (
                    <td key={q} style={{ padding: '11px 16px', textAlign: 'right' }}>
                      {val > 0 ? (
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(val)}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Soportes */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Soportes publicitarios</div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{soportes?.length ?? 0} soportes</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
              {['Nombre', 'Sección', 'Ubicación', 'Tipo', 'Precio base', 'Estado'].map(h => (
                <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {soportes?.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '10px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{s.nombre}</td>
                <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{s.seccion ?? '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--text-muted)' }}>{s.ubicacion ?? '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--text-secondary)' }}>{TIPO_LABELS[s.tipo] ?? s.tipo ?? '—'}</td>
                <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--text-primary)' }}>{s.precio_base ? fmt(Number(s.precio_base)) : '—'}</td>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{
                    background: s.activo ? 'rgba(21,128,61,0.12)' : 'rgba(107,114,128,0.12)',
                    color: s.activo ? '#15803d' : '#6b7280',
                    padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700
                  }}>{s.activo ? 'Activo' : 'Inactivo'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
