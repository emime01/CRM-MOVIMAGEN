'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, Search, Upload, X, Edit2, Trash2, History } from 'lucide-react'

interface Cliente {
  id: string
  nombre: string
  empresa: string | null
  email: string | null
  telefono: string | null
  rut: string | null
  activo: boolean
  tipo_cliente: string | null
  vendedor_id: string | null
  agencia_id: string | null
}

interface Agencia {
  id: string
  nombre: string
  email: string | null
  telefono: string | null
  ejecutivo_cuenta: string | null
  porcentaje_comision: number | null
  activo: boolean
}

interface Contacto {
  id: string
  nombres: string | null
  apellidos: string | null
  mail1: string | null
  mail2: string | null
  telefono1: string | null
  telefono2: string | null
  cumple_dia: number | null
  cumple_mes: number | null
  cuenta_id: string | null
  tipo_cuenta: string
  activo: boolean
}

interface Vendedor { id: string; nombre: string }

interface Props {
  initialClientes: Cliente[]
  initialAgencias: Agencia[]
  initialContactos: Contacto[]
  vendedores: Vendedor[]
  userRol: string
}

const MESES = ['', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const inputStyle: React.CSSProperties = {
  width: '100%', height: 36, padding: '0 10px',
  border: '1px solid var(--border)', borderRadius: 8, fontSize: 13,
  fontFamily: 'Montserrat, sans-serif', outline: 'none', boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 520, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>{title}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4 }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default function CuentasClient({ initialClientes, initialAgencias, initialContactos, vendedores, userRol }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'clientes' | 'agencias' | 'contactos'>('clientes')
  const [search, setSearch] = useState('')
  const [clientes, setClientes] = useState(initialClientes)
  const [agencias, setAgencias] = useState(initialAgencias)
  const [contactos, setContactos] = useState(initialContactos)

  // Modals
  const [clienteModal, setClienteModal] = useState<{ open: boolean; data: Partial<Cliente> | null }>({ open: false, data: null })
  const [agenciaModal, setAgenciaModal] = useState<{ open: boolean; data: Partial<Agencia> | null }>({ open: false, data: null })
  const [contactoModal, setContactoModal] = useState<{ open: boolean; data: Partial<Contacto> | null }>({ open: false, data: null })
  const [importModal, setImportModal] = useState<{ open: boolean; type: 'cuentas' | 'contactos' } | null>(null)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const vendedorMap = useMemo(() => new Map(vendedores.map(v => [v.id, v.nombre])), [vendedores])
  const clienteMap = useMemo(() => new Map(clientes.map(c => [c.id, c.nombre])), [clientes])
  const agenciaMap = useMemo(() => new Map(agencias.map(a => [a.id, a.nombre])), [agencias])

  const filteredClientes = useMemo(() => {
    if (!search) return clientes
    const q = search.toLowerCase()
    return clientes.filter(c => c.nombre.toLowerCase().includes(q) || (c.empresa ?? '').toLowerCase().includes(q))
  }, [clientes, search])

  const filteredAgencias = useMemo(() => {
    if (!search) return agencias
    const q = search.toLowerCase()
    return agencias.filter(a => a.nombre.toLowerCase().includes(q))
  }, [agencias, search])

  const filteredContactos = useMemo(() => {
    if (!search) return contactos
    const q = search.toLowerCase()
    return contactos.filter(c =>
      (c.nombres ?? '').toLowerCase().includes(q) ||
      (c.apellidos ?? '').toLowerCase().includes(q) ||
      (c.mail1 ?? '').toLowerCase().includes(q)
    )
  }, [contactos, search])

  // ── Save Cliente ──────────────────────────────────────────────
  async function saveCliente(data: Partial<Cliente>) {
    setSaving(true); setError('')
    try {
      if (data.id) {
        const res = await fetch(`/api/clientes/${data.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        if (!res.ok) { setError('Error al guardar'); return }
        setClientes(prev => prev.map(c => c.id === data.id ? { ...c, ...data } : c))
      } else {
        const res = await fetch('/api/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        if (!res.ok) { setError('Error al guardar'); return }
        const created = await res.json()
        setClientes(prev => [...prev, created])
      }
      setClienteModal({ open: false, data: null })
      router.refresh()
    } finally { setSaving(false) }
  }

  async function deleteCliente(id: string) {
    if (!confirm('¿Desactivar este cliente?')) return
    const res = await fetch(`/api/clientes/${id}`, { method: 'DELETE' })
    if (!res.ok) { alert('Error al desactivar el cliente'); return }
    setClientes(prev => prev.filter(c => c.id !== id))
  }

  // ── Save Agencia ──────────────────────────────────────────────
  async function saveAgencia(data: Partial<Agencia>) {
    setSaving(true); setError('')
    try {
      if (data.id) {
        const res = await fetch(`/api/agencias/${data.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        if (!res.ok) { setError('Error al guardar'); return }
        setAgencias(prev => prev.map(a => a.id === data.id ? { ...a, ...data } : a))
      } else {
        const res = await fetch('/api/agencias', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        if (!res.ok) { setError('Error al guardar'); return }
        const created = await res.json()
        setAgencias(prev => [...prev, created])
      }
      setAgenciaModal({ open: false, data: null })
    } finally { setSaving(false) }
  }

  async function deleteAgencia(id: string) {
    if (!confirm('¿Desactivar esta agencia?')) return
    const res = await fetch(`/api/agencias/${id}`, { method: 'DELETE' })
    if (!res.ok) { alert('Error al desactivar la agencia'); return }
    setAgencias(prev => prev.filter(a => a.id !== id))
  }

  // ── Save Contacto ─────────────────────────────────────────────
  async function saveContacto(data: Partial<Contacto>) {
    setSaving(true); setError('')
    try {
      if (data.id) {
        const res = await fetch(`/api/contactos/${data.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        if (!res.ok) { setError('Error al guardar'); return }
        setContactos(prev => prev.map(c => c.id === data.id ? { ...c, ...data } : c))
      } else {
        const res = await fetch('/api/contactos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        if (!res.ok) { setError('Error al guardar'); return }
        const created = await res.json()
        setContactos(prev => [...prev, created])
      }
      setContactoModal({ open: false, data: null })
    } finally { setSaving(false) }
  }

  async function deleteContacto(id: string) {
    if (!confirm('¿Eliminar este contacto?')) return
    const res = await fetch(`/api/contactos/${id}`, { method: 'DELETE' })
    if (!res.ok) { alert('Error al eliminar el contacto'); return }
    setContactos(prev => prev.filter(c => c.id !== id))
  }

  // ── Excel Import ──────────────────────────────────────────────
  async function handleImport() {
    if (!importFile || !importModal) return
    setImporting(true); setImportResult(null)
    try {
      const xlsx = await import('xlsx')
      const buf = await importFile.arrayBuffer()
      const wb = xlsx.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = xlsx.utils.sheet_to_json(ws, { defval: '' })

      let endpoint = ''
      let payload: object = {}

      if (importModal.type === 'cuentas') {
        // Map columns: AGENCIA, CONTACTO AGENCIA, CONTACTO CLIENTE, CLIENTE, EJEC VTAS, PORCENTAJE PONDERACIÓN PARA OBJETIVO TOTAL, C1, C2, C3
        const items = (rows as Record<string, unknown>[]).map(r => ({
          agencia: r['AGENCIA'] ?? r['agencia'] ?? '',
          contacto_agencia: r['CONTACTO AGENCIA'] ?? r['contacto_agencia'] ?? '',
          contacto_cliente: r['CONTACTO CLIENTE'] ?? r['contacto_cliente'] ?? '',
          cliente: r['CLIENTE'] ?? r['cliente'] ?? '',
          ejec_vtas: r['EJEC VTAS'] ?? r['ejec_vtas'] ?? '',
          ponderacion_pct: r['PORCENTAJE PONDERACIÓN PARA OBJETIVO TOTAL'] ?? r['ponderacion_pct'] ?? '100',
          c1: r['C1'] ?? r['c1'] ?? 0,
          c2: r['C2'] ?? r['c2'] ?? 0,
          c3: r['C3'] ?? r['c3'] ?? 0,
        }))
        endpoint = '/api/clientes'
        payload = { items }
      } else {
        // Map columns: nombre_empresa, razon_social, nombres, apellidos, telefono1, telefono2, mail1, mail2, cumple_dia, cumple_mes
        const items = (rows as Record<string, unknown>[]).map(r => ({
          nombre_empresa: r['nombre_empresa'] ?? '',
          razon_social: r['razon_social'] ?? '',
          nombres: r['nombres'] ?? '',
          apellidos: r['apellidos'] ?? '',
          telefono1: r['telefono1'] ?? '',
          telefono2: r['telefono2'] ?? '',
          mail1: r['mail1'] ?? '',
          mail2: r['mail2'] ?? '',
          cumple_dia: r['cumple_dia'] ?? 0,
          cumple_mes: r['cumple_mes'] ?? 0,
        }))
        endpoint = '/api/contactos'
        payload = { items }
      }

      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const result = await res.json()
      setImportResult(`Importación completa: ${result.total ?? 0} registros procesados.`)
      setImportFile(null)
      router.refresh()
    } catch (e) {
      setImportResult(`Error: ${e instanceof Error ? e.message : 'desconocido'}`)
    } finally {
      setImporting(false)
    }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 13, fontWeight: active ? 700 : 500,
    background: active ? 'var(--orange)' : 'transparent',
    color: active ? '#fff' : 'var(--text-secondary)',
    fontFamily: 'Montserrat, sans-serif',
  })

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 4 }}>
          {(['clientes', 'agencias', 'contactos'] as const).map(t => (
            <button key={t} style={tabStyle(tab === t)} onClick={() => { setTab(t); setSearch('') }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
              <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.8 }}>
                ({t === 'clientes' ? clientes.length : t === 'agencias' ? agencias.length : contactos.length})
              </span>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setImportModal({ open: true, type: 'cuentas' })}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-card)', fontSize: 13, fontWeight: 500, cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            <Upload size={14} /> Importar
          </button>
          <button
            onClick={() => {
              if (tab === 'clientes') setClienteModal({ open: true, data: {} })
              else if (tab === 'agencias') setAgenciaModal({ open: true, data: {} })
              else setContactoModal({ open: true, data: {} })
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--orange)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            <Plus size={14} /> Nuevo
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={`Buscar ${tab}...`}
          style={{ ...inputStyle, paddingLeft: 32, height: 38 }}
        />
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>

        {/* CLIENTES */}
        {tab === 'clientes' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-app)' }}>
                {['Nombre / Empresa', 'Email', 'Teléfono', 'Tipo', 'Agencia', 'Vendedor', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredClientes.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Sin clientes. Creá el primero o importá desde Excel.</td></tr>
              ) : filteredClientes.map((c, i) => (
                <tr key={c.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {c.nombre}
                    {c.empresa && <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>{c.empresa}</div>}
                  </td>
                  <td style={{ padding: '11px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{c.email ?? '—'}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{c.telefono ?? '—'}</td>
                  <td style={{ padding: '11px 14px' }}>
                    {c.tipo_cliente && <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: '#f1f1ef', color: '#4a4845' }}>{c.tipo_cliente}</span>}
                  </td>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>{c.agencia_id ? (agenciaMap.get(c.agencia_id) ?? '—') : '—'}</td>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>{c.vendedor_id ? (vendedorMap.get(c.vendedor_id) ?? '—') : '—'}</td>
                  <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                    <Link href={`/dashboard/cuentas/${c.id}`} title="Ver historial" style={{ display: 'inline-flex', border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, color: 'var(--orange)', marginRight: 4 }}><History size={14} /></Link>
                    <button onClick={() => setClienteModal({ open: true, data: c })} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, color: 'var(--text-muted)', marginRight: 4 }}><Edit2 size={14} /></button>
                    <button onClick={() => deleteCliente(c.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, color: '#c82f2f' }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* AGENCIAS */}
        {tab === 'agencias' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-app)' }}>
                {['Nombre', 'Email', 'Ejecutivo', 'Comisión', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredAgencias.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Sin agencias. Creá la primera o importá desde Excel.</td></tr>
              ) : filteredAgencias.map((a, i) => (
                <tr key={a.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                  <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>{a.nombre}</td>
                  <td style={{ padding: '11px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{a.email ?? '—'}</td>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>{a.ejecutivo_cuenta ?? '—'}</td>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>{a.porcentaje_comision != null ? `${a.porcentaje_comision}%` : '—'}</td>
                  <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                    <button onClick={() => setAgenciaModal({ open: true, data: a })} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, color: 'var(--text-muted)', marginRight: 4 }}><Edit2 size={14} /></button>
                    <button onClick={() => deleteAgencia(a.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, color: '#c82f2f' }}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* CONTACTOS */}
        {tab === 'contactos' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--bg-app)' }}>
                {['Nombre', 'Empresa / Tipo', 'Email', 'Teléfono', 'Cumpleaños', ''].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredContactos.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Sin contactos. Creá el primero o importá desde Excel.</td></tr>
              ) : filteredContactos.map((c, i) => {
                const cuentaNombre = c.cuenta_id ? (c.tipo_cuenta === 'agencia' ? agenciaMap.get(c.cuenta_id) : clienteMap.get(c.cuenta_id)) ?? '—' : '—'
                return (
                  <tr key={c.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
                    <td style={{ padding: '11px 14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {[c.nombres, c.apellidos].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {cuentaNombre}
                      <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 5px', borderRadius: 4, background: c.tipo_cuenta === 'agencia' ? '#e0f0ff' : '#e8f5ec', color: c.tipo_cuenta === 'agencia' ? '#1a5da8' : '#2f7d3f' }}>{c.tipo_cuenta}</span>
                    </td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{c.mail1 ?? '—'}</td>
                    <td style={{ padding: '11px 14px', color: 'var(--text-muted)', fontSize: 12 }}>{c.telefono1 ?? '—'}</td>
                    <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {c.cumple_dia && c.cumple_mes ? `${c.cumple_dia} ${MESES[c.cumple_mes]}` : '—'}
                    </td>
                    <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' }}>
                      <button onClick={() => setContactoModal({ open: true, data: c })} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, color: 'var(--text-muted)', marginRight: 4 }}><Edit2 size={14} /></button>
                      <button onClick={() => deleteContacto(c.id)} style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, color: '#c82f2f' }}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── CLIENTE MODAL ── */}
      {clienteModal.open && (
        <ClienteModalForm
          data={clienteModal.data ?? {}}
          vendedores={vendedores}
          agencias={agencias}
          onClose={() => setClienteModal({ open: false, data: null })}
          onSave={saveCliente}
          saving={saving}
          error={error}
        />
      )}

      {/* ── AGENCIA MODAL ── */}
      {agenciaModal.open && (
        <AgenciaModalForm
          data={agenciaModal.data ?? {}}
          onClose={() => setAgenciaModal({ open: false, data: null })}
          onSave={saveAgencia}
          saving={saving}
          error={error}
        />
      )}

      {/* ── CONTACTO MODAL ── */}
      {contactoModal.open && (
        <ContactoModalForm
          data={contactoModal.data ?? {}}
          clientes={[...Array.from(clienteMap.entries()).map(([id, nombre]) => ({ id, nombre }))]}
          agencias={[...Array.from(agenciaMap.entries()).map(([id, nombre]) => ({ id, nombre }))]}
          onClose={() => setContactoModal({ open: false, data: null })}
          onSave={saveContacto}
          saving={saving}
          error={error}
        />
      )}

      {/* ── IMPORT MODAL ── */}
      {importModal?.open && (
        <Modal title="Importar desde Excel" onClose={() => { setImportModal(null); setImportFile(null); setImportResult(null) }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {(['cuentas', 'contactos'] as const).map(t => (
                <button key={t} onClick={() => setImportModal({ open: true, type: t })}
                  style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, fontWeight: importModal.type === t ? 700 : 500, background: importModal.type === t ? 'var(--orange)' : '#fff', color: importModal.type === t ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}>
                  {t === 'cuentas' ? 'Cuentas y Objetivos' : 'Contactos'}
                </button>
              ))}
            </div>
            <div style={{ padding: 12, background: '#f7f6f3', borderRadius: 8, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.6 }}>
              {importModal.type === 'cuentas' ? (
                <>Columnas requeridas: <strong>AGENCIA, CONTACTO AGENCIA, CONTACTO CLIENTE, CLIENTE, EJEC VTAS, PORCENTAJE PONDERACIÓN PARA OBJETIVO TOTAL, C1, C2, C3</strong></>
              ) : (
                <>Columnas requeridas: <strong>nombre_empresa, razon_social, nombres, apellidos, telefono1, telefono2, mail1, mail2, cumple_dia, cumple_mes</strong></>
              )}
            </div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', border: '1px dashed var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text-secondary)' }}>
              <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={e => setImportFile(e.target.files?.[0] ?? null)} />
              <Upload size={14} /> {importFile ? importFile.name : 'Seleccionar archivo Excel'}
            </label>
            {importResult && (
              <div style={{ marginTop: 12, padding: '10px 14px', background: importResult.startsWith('Error') ? '#fdecec' : '#e8f5ec', borderRadius: 8, fontSize: 13, color: importResult.startsWith('Error') ? '#c82f2f' : '#2f7d3f' }}>
                {importResult}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={() => { setImportModal(null); setImportFile(null); setImportResult(null) }} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
            <button onClick={handleImport} disabled={!importFile || importing}
              style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--orange)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: importFile ? 'pointer' : 'not-allowed', opacity: importFile ? 1 : 0.5 }}>
              {importing ? 'Importando...' : 'Importar'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Sub-forms ────────────────────────────────────────────────────────────────

function ClienteModalForm({ data, vendedores, agencias, onClose, onSave, saving, error }: {
  data: Partial<Cliente>; vendedores: Vendedor[]; agencias: Agencia[]
  onClose: () => void; onSave: (d: Partial<Cliente>) => void; saving: boolean; error: string
}) {
  const [form, setForm] = useState(data)
  const set = (k: keyof Cliente, v: unknown) => setForm(p => ({ ...p, [k]: v }))
  return (
    <Modal title={form.id ? 'Editar cliente' : 'Nuevo cliente'} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Nombre *</label>
          <input style={inputStyle} value={form.nombre ?? ''} onChange={e => set('nombre', e.target.value)} placeholder="Nombre del cliente" />
        </div>
        <div>
          <label style={labelStyle}>Empresa</label>
          <input style={inputStyle} value={form.empresa ?? ''} onChange={e => set('empresa', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>RUT</label>
          <input style={inputStyle} value={form.rut ?? ''} onChange={e => set('rut', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input style={inputStyle} type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Teléfono</label>
          <input style={inputStyle} value={form.telefono ?? ''} onChange={e => set('telefono', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Agencia asociada</label>
          <select style={{ ...inputStyle, background: 'white' }} value={form.agencia_id ?? ''} onChange={e => set('agencia_id', e.target.value || null)}>
            <option value="">— Sin agencia —</option>
            {agencias.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Vendedor asignado</label>
          <select style={{ ...inputStyle, background: 'white' }} value={form.vendedor_id ?? ''} onChange={e => set('vendedor_id', e.target.value || null)}>
            <option value="">— Sin asignar —</option>
            {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Tipo cliente</label>
          <select style={{ ...inputStyle, background: 'white' }} value={form.tipo_cliente ?? 'B'} onChange={e => set('tipo_cliente', e.target.value)}>
            {['A', 'B', 'C', 'D'].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      {error && <div style={{ color: '#c82f2f', fontSize: 12, marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
        <button onClick={() => onSave(form)} disabled={!form.nombre || saving}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--orange)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: !form.nombre ? 0.5 : 1 }}>
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </Modal>
  )
}

function AgenciaModalForm({ data, onClose, onSave, saving, error }: {
  data: Partial<Agencia>; onClose: () => void; onSave: (d: Partial<Agencia>) => void; saving: boolean; error: string
}) {
  const [form, setForm] = useState(data)
  const set = (k: keyof Agencia, v: unknown) => setForm(p => ({ ...p, [k]: v }))
  return (
    <Modal title={form.id ? 'Editar agencia' : 'Nueva agencia'} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
        <div style={{ gridColumn: '1/-1' }}>
          <label style={labelStyle}>Nombre *</label>
          <input style={inputStyle} value={form.nombre ?? ''} onChange={e => set('nombre', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Email</label>
          <input style={inputStyle} type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Teléfono</label>
          <input style={inputStyle} value={form.telefono ?? ''} onChange={e => set('telefono', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Ejecutivo de cuenta</label>
          <input style={inputStyle} value={form.ejecutivo_cuenta ?? ''} onChange={e => set('ejecutivo_cuenta', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>% Comisión</label>
          <input style={inputStyle} type="number" min={0} max={100} step={0.5} value={form.porcentaje_comision ?? 0} onChange={e => set('porcentaje_comision', parseFloat(e.target.value))} />
        </div>
      </div>
      {error && <div style={{ color: '#c82f2f', fontSize: 12, marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
        <button onClick={() => onSave(form)} disabled={!form.nombre || saving}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--orange)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: !form.nombre ? 0.5 : 1 }}>
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </Modal>
  )
}

function ContactoModalForm({ data, clientes, agencias, onClose, onSave, saving, error }: {
  data: Partial<Contacto>; clientes: { id: string; nombre: string }[]; agencias: { id: string; nombre: string }[]
  onClose: () => void; onSave: (d: Partial<Contacto>) => void; saving: boolean; error: string
}) {
  const [form, setForm] = useState<Partial<Contacto>>({ tipo_cuenta: 'cliente', ...data })
  const set = (k: keyof Contacto, v: unknown) => setForm(p => ({ ...p, [k]: v }))
  const cuentas = form.tipo_cuenta === 'agencia' ? agencias : clientes
  return (
    <Modal title={form.id ? 'Editar contacto' : 'Nuevo contacto'} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Nombres</label>
          <input style={inputStyle} value={form.nombres ?? ''} onChange={e => set('nombres', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Apellidos</label>
          <input style={inputStyle} value={form.apellidos ?? ''} onChange={e => set('apellidos', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Tipo de cuenta</label>
          <select style={{ ...inputStyle, background: 'white' }} value={form.tipo_cuenta ?? 'cliente'} onChange={e => set('tipo_cuenta', e.target.value)}>
            <option value="cliente">Cliente</option>
            <option value="agencia">Agencia</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Cuenta asociada</label>
          <select style={{ ...inputStyle, background: 'white' }} value={form.cuenta_id ?? ''} onChange={e => set('cuenta_id', e.target.value || null)}>
            <option value="">— Sin asociar —</option>
            {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Teléfono 1</label>
          <input style={inputStyle} value={form.telefono1 ?? ''} onChange={e => set('telefono1', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Teléfono 2</label>
          <input style={inputStyle} value={form.telefono2 ?? ''} onChange={e => set('telefono2', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Email 1</label>
          <input style={inputStyle} type="email" value={form.mail1 ?? ''} onChange={e => set('mail1', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Email 2</label>
          <input style={inputStyle} type="email" value={form.mail2 ?? ''} onChange={e => set('mail2', e.target.value)} />
        </div>
        <div>
          <label style={labelStyle}>Día cumpleaños</label>
          <input style={inputStyle} type="number" min={1} max={31} value={form.cumple_dia ?? ''} onChange={e => set('cumple_dia', parseInt(e.target.value) || null)} />
        </div>
        <div>
          <label style={labelStyle}>Mes cumpleaños</label>
          <select style={{ ...inputStyle, background: 'white' }} value={form.cumple_mes ?? ''} onChange={e => set('cumple_mes', parseInt(e.target.value) || null)}>
            <option value="">— Mes —</option>
            {MESES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
      </div>
      {error && <div style={{ color: '#c82f2f', fontSize: 12, marginBottom: 12 }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
        <button onClick={() => onSave(form)} disabled={saving}
          style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--orange)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </Modal>
  )
}
