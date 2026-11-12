'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, X, Search } from 'lucide-react'
import { avisar, confirmar } from '@/components/ui/dialogos'
import { ROL_LABELS, ROLES_ASIGNABLES, MIN_PASSWORD } from '@/lib/usuarios-constantes'

interface Usuario {
  id: string
  nombre: string
  email: string | null
  rol: string
  activo: boolean
}

const esDePrueba = (u: Usuario) =>
  u.nombre.startsWith('[PRUEBA]') || (u.email ?? '').toLowerCase().includes('@prueba.')

const inputStyle: React.CSSProperties = {
  width: '100%', height: 38, padding: '0 10px', border: '1px solid var(--border)', borderRadius: 8,
  fontSize: 13, boxSizing: 'border-box', background: 'var(--bg-card)', color: 'var(--text-primary)',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4,
}
const btnPrimario: React.CSSProperties = {
  padding: '8px 16px', borderRadius: 8, border: 'none', background: '#ec691a', color: '#fff',
  cursor: 'pointer', fontSize: 13, fontWeight: 600,
}
const btnSecundario: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)',
  color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
}

export default function UsuariosClient({ miId, soyAdminSistema }: { miId: string; soyAdminSistema: boolean }) {
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [mostrarPrueba, setMostrarPrueba] = useState(false)
  const [editando, setEditando] = useState<Usuario | null>(null)
  const [creando, setCreando] = useState(false)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const res = await fetch('/api/admin/usuarios')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error al cargar')
      setUsuarios(data.usuarios)
    } catch (e) {
      await avisar(e instanceof Error ? e.message : 'No se pudieron cargar los usuarios')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return usuarios.filter(u => {
      if (!mostrarPrueba && esDePrueba(u)) return false
      if (!q) return true
      return u.nombre.toLowerCase().includes(q)
        || (u.email ?? '').toLowerCase().includes(q)
        || (ROL_LABELS[u.rol] ?? u.rol).toLowerCase().includes(q)
    })
  }, [usuarios, busqueda, mostrarPrueba])

  const rolesAsignables = ROLES_ASIGNABLES.filter(r => soyAdminSistema || r !== 'admin_sistema')

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--text-muted)' }} />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre, email o rol"
            style={{ ...inputStyle, paddingLeft: 30 }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={mostrarPrueba} onChange={e => setMostrarPrueba(e.target.checked)} />
          Mostrar usuarios de prueba
        </label>
        <button onClick={() => setCreando(true)} style={{ ...btnPrimario, marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> Nuevo usuario
        </button>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflowX: 'auto' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>Usuarios del sistema</div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{visibles.length} usuarios</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-app)', borderBottom: '1px solid var(--border)' }}>
              {['Nombre', 'Email', 'Rol', 'Estado', ''].map(h => (
                <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={5} style={{ padding: 20, color: 'var(--text-muted)' }}>Cargando…</td></tr>}
            {!cargando && visibles.length === 0 && <tr><td colSpan={5} style={{ padding: 20, color: 'var(--text-muted)' }}>No hay usuarios para mostrar.</td></tr>}
            {visibles.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '11px 16px', fontWeight: 600, color: 'var(--text-primary)' }}>{u.nombre}</td>
                <td style={{ padding: '11px 16px', color: 'var(--text-muted)', fontSize: 12 }}>{u.email ?? '—'}</td>
                <td style={{ padding: '11px 16px', color: 'var(--text-secondary)' }}>{ROL_LABELS[u.rol] ?? u.rol}</td>
                <td style={{ padding: '11px 16px' }}>
                  <span style={{
                    background: u.activo ? 'rgba(21,128,61,0.12)' : 'rgba(107,114,128,0.12)',
                    color: u.activo ? '#15803d' : '#6b7280', padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 700,
                  }}>{u.activo ? 'Activo' : 'Inactivo'}</span>
                </td>
                <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                  {/* Un admin del sistema sólo lo toca otro admin del sistema. */}
                  {(soyAdminSistema || u.rol !== 'admin_sistema') && (
                    <button onClick={() => setEditando(u)} title="Editar" aria-label={`Editar ${u.nombre}`}
                      style={{ ...btnSecundario, padding: '5px 8px' }}><Pencil size={13} /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creando && (
        <ModalNuevo roles={rolesAsignables} onCerrar={() => setCreando(false)} onListo={() => { setCreando(false); cargar() }} />
      )}
      {editando && (
        <ModalEditar usuario={editando} roles={rolesAsignables} esYo={editando.id === miId}
          onCerrar={() => setEditando(null)} onListo={() => { setEditando(null); cargar() }} />
      )}
    </div>
  )
}

// ─── Modales ──────────────────────────────────────────────────────────────────

function Modal({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: React.ReactNode }) {
  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onCerrar() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" style={{ background: 'var(--bg-card)', borderRadius: 12, width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', fontFamily: 'Montserrat, sans-serif' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{titulo}</div>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={18} /></button>
        </div>
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
      </div>
    </div>
  )
}

function SelectRol({ valor, roles, onChange }: { valor: string; roles: string[]; onChange: (v: string) => void }) {
  // Si el usuario ya tiene un rol que el que edita no puede asignar, igual se muestra.
  const opciones = roles.includes(valor) || !valor ? roles : [valor, ...roles]
  return (
    <select value={valor} onChange={e => onChange(e.target.value)} style={inputStyle}>
      {opciones.map(r => <option key={r} value={r}>{ROL_LABELS[r] ?? r}</option>)}
    </select>
  )
}

async function llamar(url: string, method: string, body: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    return res.ok ? null : (data.error ?? 'Error inesperado')
  } catch {
    return 'No se pudo conectar con el servidor'
  }
}

function ModalNuevo({ roles, onCerrar, onListo }: { roles: string[]; onCerrar: () => void; onListo: () => void }) {
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState('vendedor')
  const [password, setPassword] = useState('')
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    if (!nombre.trim()) return avisar('Ingresá el nombre')
    if (!email.trim()) return avisar('Ingresá el email')
    if (password.length < MIN_PASSWORD) return avisar(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`)
    setGuardando(true)
    const err = await llamar('/api/admin/usuarios', 'POST', { nombre, email, rol, password })
    setGuardando(false)
    if (err) return avisar(err)
    await avisar('Usuario creado')
    onListo()
  }

  return (
    <Modal titulo="Nuevo usuario" onCerrar={onCerrar}>
      <div><label style={labelStyle}>Nombre</label><input value={nombre} onChange={e => setNombre(e.target.value)} style={inputStyle} /></div>
      <div><label style={labelStyle}>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} /></div>
      <div><label style={labelStyle}>Rol</label><SelectRol valor={rol} roles={roles} onChange={setRol} /></div>
      <div>
        <label style={labelStyle}>Contraseña inicial</label>
        <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} style={inputStyle} />
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Mínimo {MIN_PASSWORD} caracteres.</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onCerrar} style={btnSecundario}>Cancelar</button>
        <button onClick={guardar} disabled={guardando} style={{ ...btnPrimario, opacity: guardando ? 0.6 : 1 }}>{guardando ? 'Creando…' : 'Crear usuario'}</button>
      </div>
    </Modal>
  )
}

function ModalEditar({ usuario, roles, esYo, onCerrar, onListo }: {
  usuario: Usuario; roles: string[]; esYo: boolean; onCerrar: () => void; onListo: () => void
}) {
  const [nombre, setNombre] = useState(usuario.nombre)
  const [email, setEmail] = useState(usuario.email ?? '')
  const [rol, setRol] = useState(usuario.rol)
  const [activo, setActivo] = useState(usuario.activo)
  const [password, setPassword] = useState('')
  const [guardando, setGuardando] = useState(false)

  const esAdminPropio = esYo && usuario.rol === 'admin_sistema'

  const guardar = async () => {
    if (!nombre.trim()) return avisar('Ingresá el nombre')
    const cambios: Record<string, unknown> = {}
    if (nombre.trim() !== usuario.nombre) cambios.nombre = nombre
    if (email.trim().toLowerCase() !== (usuario.email ?? '').toLowerCase()) cambios.email = email
    if (rol !== usuario.rol) cambios.rol = rol
    if (activo !== usuario.activo) cambios.activo = activo
    if (!Object.keys(cambios).length) return onCerrar()
    if (cambios.activo === false && !(await confirmar(`¿Desactivar a ${usuario.nombre}? No va a poder iniciar sesión.`))) return
    setGuardando(true)
    const err = await llamar(`/api/admin/usuarios/${usuario.id}`, 'PATCH', cambios)
    setGuardando(false)
    if (err) return avisar(err)
    onListo()
  }

  const cambiarPassword = async () => {
    if (password.length < MIN_PASSWORD) return avisar(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres`)
    if (!(await confirmar(`¿Cambiar la contraseña de ${usuario.nombre}?`))) return
    setGuardando(true)
    const err = await llamar(`/api/admin/usuarios/${usuario.id}`, 'PATCH', { password })
    setGuardando(false)
    if (err) return avisar(err)
    setPassword('')
    await avisar('Contraseña actualizada')
  }

  return (
    <Modal titulo={`Editar usuario${esYo ? ' (vos)' : ''}`} onCerrar={onCerrar}>
      <div><label style={labelStyle}>Nombre</label><input value={nombre} onChange={e => setNombre(e.target.value)} style={inputStyle} /></div>
      <div><label style={labelStyle}>Email</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} /></div>
      <div>
        <label style={labelStyle}>Rol</label>
        <select value={rol} onChange={e => setRol(e.target.value)} disabled={esAdminPropio} style={inputStyle}>
          {(roles.includes(rol) ? roles : [rol, ...roles]).map(r => <option key={r} value={r}>{ROL_LABELS[r] ?? r}</option>)}
        </select>
        {esAdminPropio && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>No podés quitarte tu propio rol de administrador.</div>}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: esYo ? 'not-allowed' : 'pointer' }}>
        <input type="checkbox" checked={activo} disabled={esYo} onChange={e => setActivo(e.target.checked)} />
        Usuario activo (puede iniciar sesión)
      </label>
      {esYo && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -8 }}>No podés desactivarte a vos mismo.</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onCerrar} style={btnSecundario}>Cancelar</button>
        <button onClick={guardar} disabled={guardando} style={{ ...btnPrimario, opacity: guardando ? 0.6 : 1 }}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
        <label style={labelStyle}>Cambiar contraseña</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder={`Nueva contraseña (mín. ${MIN_PASSWORD})`} style={inputStyle} />
          <button onClick={cambiarPassword} disabled={guardando || !password} style={{ ...btnSecundario, whiteSpace: 'nowrap', opacity: password ? 1 : 0.5 }}>Cambiar</button>
        </div>
      </div>
    </Modal>
  )
}
