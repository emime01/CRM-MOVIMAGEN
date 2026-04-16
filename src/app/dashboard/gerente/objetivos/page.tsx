import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createServerClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

const CUATRIMESTRES = ['Q1-2026', 'Q2-2026', 'Q3-2026']
const fmt = (n: number) => '$' + n.toLocaleString('es-UY', { maximumFractionDigits: 0 })

export default async function ObjetivosPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect('/login')
  const supabase = createServerClient()

  const [{ data: vendedores }, { data: objetivos }] = await Promise.all([
    supabase.from('perfiles').select('id, nombre, rol').in('rol', ['vendedor', 'asistente_ventas']).eq('activo', true).order('nombre'),
    supabase.from('objetivos').select('vendedor_id, cuatrimestre, objetivo_monto'),
  ])

  const ROL: Record<string, string> = { vendedor: 'Vendedor', asistente_ventas: 'Asistente' }

  // Build map vendedor_id + cuatrimestre → objetivo
  const objMap: Record<string, number> = {}
  objetivos?.forEach(o => { objMap[`${o.vendedor_id}-${o.cuatrimestre}`] = Number(o.objetivo_monto) })

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 20 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>Vendedor</th>
              {CUATRIMESTRES.map(q => (
                <th key={q} style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>{q}</th>
              ))}
              <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>Total anual</th>
            </tr>
          </thead>
          <tbody>
            {vendedores?.map(v => {
              const totals = CUATRIMESTRES.map(q => objMap[`${v.id}-${q}`] ?? 0)
              const anual = totals.reduce((s, t) => s + t, 0)
              return (
                <tr key={v.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{v.nombre}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{ROL[v.rol] ?? v.rol}</div>
                  </td>
                  {totals.map((t, i) => (
                    <td key={CUATRIMESTRES[i]} style={{ padding: '14px 16px', textAlign: 'right' }}>
                      {t > 0 ? (
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(t)}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Sin definir</span>
                      )}
                    </td>
                  ))}
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, color: anual > 0 ? 'var(--orange)' : 'var(--text-muted)' }}>{anual > 0 ? fmt(anual) : '—'}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
        Para modificar los objetivos, dirigirse a Configuración o contactar al administrador del sistema.
      </p>
    </div>
  )
}
