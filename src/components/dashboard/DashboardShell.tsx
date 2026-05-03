'use client'

import { useState, useRef, useEffect, Fragment } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Home, FileText, Filter, Calendar, BarChart2,
  Users, Target, Star, Wrench, Truck, Monitor,
  Palette, Receipt, AlertCircle, Percent, Building2,
  CreditCard, Settings, MessageCircle, X, Send,
  FlaskConical, Package, BookUser, Camera, Bell,
  UserCircle, Mail, Check, ChevronRight, Reply, Copy, Loader2, CalendarDays,
  AlertTriangle, Clock, Megaphone,
} from 'lucide-react'

// ─── Markdown renderer ───────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g
  let last = 0, m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[1] !== undefined) parts.push(<strong key={m.index}>{m[1]}</strong>)
    else if (m[2] !== undefined) parts.push(<em key={m.index}>{m[2]}</em>)
    else if (m[3] !== undefined) parts.push(<code key={m.index} style={{ background: 'rgba(0,0,0,0.08)', borderRadius: 3, padding: '1px 5px', fontSize: 11, fontFamily: 'monospace' }}>{m[3]}</code>)
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.length === 1 ? parts[0] : <Fragment>{parts}</Fragment>
}

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n')
  const out: React.ReactNode[] = []
  let listBuf: { type: 'ul' | 'ol'; items: string[] } | null = null
  let key = 0

  const flushList = () => {
    if (!listBuf) return
    const Tag = listBuf.type
    out.push(
      <Tag key={key++} style={{ margin: '4px 0 8px', paddingLeft: 20 }}>
        {listBuf.items.map((item, j) => (
          <li key={j} style={{ marginBottom: 3, lineHeight: 1.55 }}>{renderInline(item)}</li>
        ))}
      </Tag>
    )
    listBuf = null
  }

  for (const line of lines) {
    const bullet   = line.match(/^[-*•]\s+(.+)/)
    const numbered = line.match(/^\d+\.\s+(.+)/)
    const h2       = line.match(/^##\s+(.+)/)
    const h3       = line.match(/^###\s+(.+)/)
    const hr       = /^---+$/.test(line.trim())

    if (bullet) {
      if (listBuf?.type === 'ol') flushList()
      if (!listBuf) listBuf = { type: 'ul', items: [] }
      listBuf.items.push(bullet[1])
    } else if (numbered) {
      if (listBuf?.type === 'ul') flushList()
      if (!listBuf) listBuf = { type: 'ol', items: [] }
      listBuf.items.push(numbered[1])
    } else {
      flushList()
      if (h2) {
        out.push(<div key={key++} style={{ fontWeight: 700, fontSize: 13, color: 'var(--orange)', margin: '10px 0 4px' }}>{renderInline(h2[1])}</div>)
      } else if (h3) {
        out.push(<div key={key++} style={{ fontWeight: 700, fontSize: 12, margin: '8px 0 2px' }}>{renderInline(h3[1])}</div>)
      } else if (hr) {
        out.push(<hr key={key++} style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />)
      } else if (line.trim() === '') {
        out.push(<div key={key++} style={{ height: 5 }} />)
      } else {
        out.push(<div key={key++} style={{ lineHeight: 1.55, marginBottom: 1 }}>{renderInline(line)}</div>)
      }
    }
  }
  flushList()
  return <>{out}</>
}

// ─────────────────────────────────────────────────────────────────────────────

type Rol = 'vendedor' | 'asistente_ventas' | 'gerente_comercial' | 'operaciones' | 'arte' | 'administracion'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  roles: Rol[]
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: <Home size={16} />, roles: ['vendedor', 'asistente_ventas', 'gerente_comercial'] },
  { href: '/dashboard/ventas', label: 'Ventas', icon: <FileText size={16} />, roles: ['vendedor', 'asistente_ventas', 'gerente_comercial', 'operaciones'] },
  { href: '/dashboard/leads', label: 'Leads', icon: <Filter size={16} />, roles: ['vendedor', 'asistente_ventas', 'gerente_comercial'] },
  { href: '/dashboard/disponibilidad', label: 'Disponibilidad', icon: <Calendar size={16} />, roles: ['vendedor', 'asistente_ventas', 'gerente_comercial', 'operaciones', 'administracion'] },
  { href: '/dashboard/agenda', label: 'Agenda', icon: <CalendarDays size={16} />, roles: ['vendedor', 'asistente_ventas', 'gerente_comercial'] },
  { href: '/dashboard/reportes', label: 'Reportes', icon: <BarChart2 size={16} />, roles: ['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion'] },
  { href: '/dashboard/cuentas', label: 'Cuentas', icon: <BookUser size={16} />, roles: ['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion'] },
  { href: '/dashboard/gerente', label: 'Mi Equipo', icon: <Users size={16} />, roles: ['gerente_comercial', 'administracion'] },
  { href: '/dashboard/gerente/objetivos', label: 'Objetivos', icon: <Target size={16} />, roles: ['asistente_ventas'] },
  { href: '/dashboard/buses', label: 'Buses', icon: <Truck size={16} />, roles: ['operaciones', 'administracion'] },
  { href: '/dashboard/registros', label: 'Registros', icon: <Camera size={16} />, roles: ['operaciones', 'administracion', 'vendedor', 'asistente_ventas', 'gerente_comercial'] },
  { href: '/dashboard/arte', label: 'Planilla digital', icon: <Monitor size={16} />, roles: ['arte'] },
  { href: '/dashboard/arte/colores', label: 'Muestras de color', icon: <Palette size={16} />, roles: ['arte'] },
  { href: '/dashboard/admin/facturacion', label: 'Facturación', icon: <Receipt size={16} />, roles: ['administracion'] },
  { href: '/dashboard/admin/deudores', label: 'Deudores', icon: <AlertCircle size={16} />, roles: ['administracion'] },
  { href: '/dashboard/admin/comisiones', label: 'Comisiones', icon: <Percent size={16} />, roles: ['administracion'] },
  { href: '/dashboard/admin/canon', label: 'Canon', icon: <Building2 size={16} />, roles: ['administracion'] },
  { href: '/dashboard/admin/gastos', label: 'Gastos', icon: <CreditCard size={16} />, roles: ['administracion'] },
  { href: '/dashboard/admin/soportes', label: 'Soportes', icon: <Package size={16} />, roles: ['asistente_ventas', 'administracion'] },
  { href: '/dashboard/config', label: 'Configuración', icon: <Settings size={16} />, roles: ['administracion'] },
  { href: '/dashboard/perfil', label: 'Mi Perfil', icon: <UserCircle size={16} />, roles: ['vendedor', 'asistente_ventas', 'gerente_comercial', 'operaciones', 'arte', 'administracion'] },
]

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/ventas': 'Ventas',
  '/dashboard/ventas/nueva': 'Nueva Orden',
  '/dashboard/leads': 'Leads',
  '/dashboard/disponibilidad': 'Disponibilidad',
  '/dashboard/agenda': 'Agenda',
  '/dashboard/reportes': 'Reportes',
  '/dashboard/cuentas': 'Cuentas',
  '/dashboard/gerente': 'Mi Equipo',
  '/dashboard/gerente/objetivos': 'Objetivos',
  '/dashboard/gerente/ceo': 'Dashboard CEO',
  '/dashboard/buses': 'Buses',
  '/dashboard/registros': 'Registros',
  '/dashboard/arte': 'Arte',
  '/dashboard/arte/colores': 'Muestras de Color',
  '/dashboard/admin/facturacion': 'Facturación',
  '/dashboard/admin/deudores': 'Deudores',
  '/dashboard/admin/comisiones': 'Comisiones',
  '/dashboard/admin/canon': 'Canon',
  '/dashboard/admin/gastos': 'Gastos',
  '/dashboard/admin/soportes': 'Soportes',
  '/dashboard/config': 'Configuración',
  '/dashboard/perfil': 'Mi Perfil',
}

const ROL_LABELS: Record<Rol, string> = {
  vendedor: 'Vendedor',
  asistente_ventas: 'Asistente de Ventas',
  gerente_comercial: 'Gerente Comercial',
  operaciones: 'Operaciones',
  arte: 'Arte',
  administracion: 'Administración',
}

interface User {
  id: string
  email: string
  name: string
  rol: Rol
}

interface DashboardShellProps {
  user: User
  children: React.ReactNode
}

export default function DashboardShell({ user, children }: DashboardShellProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [testMode, setTestMode] = useState(false)

  // Gmail suggestions state
  interface EmailSuggestion {
    id: string
    from_name: string
    from_email: string
    subject: string
    body_preview: string
    received_at: string
    suggestion_type: string
    suggestion_data: { summary?: string; suggested_action?: string }
    lead_id: string | null
    orden_id: string | null
  }
  const [suggestions, setSuggestions] = useState<EmailSuggestion[]>([])
  const [bellOpen, setBellOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)

  // Reply modal state
  const [replyModal, setReplyModal] = useState<{ id: string; from: string; subject: string } | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [replyLoading, setReplyLoading] = useState(false)
  const [replyCopied, setReplyCopied] = useState(false)

  // CRM notifications state
  interface Notificacion {
    id: string
    tipo: string
    titulo: string
    mensaje: string | null
    link: string | null
    leida: boolean
    created_at: string
  }
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])

  // Fetch suggestions on mount + poll every 5 min
  useEffect(() => {
    async function pollGmail() {
      try {
        await fetch('/api/gmail/poll', { method: 'POST' })
        const res = await fetch('/api/gmail/suggestions')
        if (res.ok) setSuggestions(await res.json())
      } catch { /* silent */ }
    }
    async function fetchNotifs() {
      try {
        const res = await fetch('/api/notificaciones')
        if (res.ok) setNotificaciones(await res.json())
      } catch { /* silent */ }
    }
    pollGmail()
    fetchNotifs()
    const interval = setInterval(() => { pollGmail(); fetchNotifs() }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Close bell panel on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) setBellOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function dismissSuggestion(id: string) {
    await fetch(`/api/gmail/suggestions/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'dismissed' }) })
    setSuggestions(prev => prev.filter(s => s.id !== id))
  }

  async function applySuggestion(id: string) {
    const res = await fetch(`/api/gmail/suggestions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'applied' }),
    })
    setSuggestions(prev => prev.filter(s => s.id !== id))
    if (res.ok) {
      const data = await res.json()
      if (data.createdLeadId || data.updatedLeadId) {
        setBellOpen(false)
        router.push('/dashboard/leads')
      }
    }
  }

  async function openReply(s: EmailSuggestion) {
    setReplyModal({ id: s.id, from: s.from_name || s.from_email, subject: s.subject })
    setReplyDraft('')
    setReplyCopied(false)
    setReplyLoading(true)
    try {
      const res = await fetch(`/api/gmail/suggestions/${s.id}/reply`, { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setReplyDraft(data.draft ?? '')
      } else {
        setReplyDraft('No se pudo generar el borrador. Intentá de nuevo.')
      }
    } finally {
      setReplyLoading(false)
    }
  }

  async function copyReply() {
    try {
      await navigator.clipboard.writeText(replyDraft)
      setReplyCopied(true)
      setTimeout(() => setReplyCopied(false), 2000)
    } catch { /* silent */ }
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, chatLoading])

  async function sendMessage() {
    const text = chatInput.trim()
    if (!text || chatLoading) return
    const updated = [...chatMessages, { role: 'user' as const, content: text }]
    setChatMessages(updated)
    setChatInput('')
    setChatLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updated, userName: user.name, userRol: user.rol }),
      })
      const data = await res.json()
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.text ?? 'Lo siento, no pude responder.' }])
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Lo siento, ocurrió un error. Intentá de nuevo.' }])
    } finally {
      setChatLoading(false)
    }
  }

  const navItems = testMode ? NAV_ITEMS : NAV_ITEMS.filter(item => item.roles.includes(user.rol))
  const pageTitle = PAGE_TITLES[pathname] ?? 'Dashboard'

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  const initials = user.name
    ? user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : user.email[0].toUpperCase()

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-app)', fontFamily: 'Montserrat, sans-serif' }}>

      {/* Sidebar */}
      <aside style={{
        width: 'var(--sidebar-width)',
        minWidth: 'var(--sidebar-width)',
        height: '100vh',
        background: 'var(--bg-card)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 30,
        overflow: 'hidden',
      }}>

        {/* Logo */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--orange)', letterSpacing: '-0.5px' }}>
            MOVIMAGEN
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '2px', marginTop: 2 }}>
            CRM
          </div>
        </div>

        {/* Test mode banner */}
        {testMode && (
          <div style={{
            background: '#7c3aed',
            padding: '6px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            <FlaskConical size={12} color="#fff" />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              Modo prueba
            </span>
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
          {navItems.map(item => {
            const active = isActive(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 16px',
                  margin: '1px 8px',
                  borderRadius: 8,
                  textDecoration: 'none',
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  color: active ? 'var(--orange)' : 'var(--text-secondary)',
                  background: active ? 'var(--orange-pale)' : 'transparent',
                  borderLeft: active ? '3px solid var(--orange)' : '3px solid transparent',
                  transition: 'all 150ms ease',
                }}
              >
                <span style={{ opacity: active ? 1 : 0.7 }}>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* User footer */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: 'var(--orange)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
          }}>
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {user.name || user.email}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
              {ROL_LABELS[user.rol] ?? user.rol}
            </div>
          </div>
          <button
            onClick={() => setTestMode(v => !v)}
            title={testMode ? 'Desactivar modo prueba' : 'Activar modo prueba (ver todos los módulos)'}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: testMode ? '1.5px solid #7c3aed' : '1px solid var(--border)',
              background: testMode ? '#ede9fe' : 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <FlaskConical size={14} color={testMode ? '#7c3aed' : 'var(--text-muted)'} />
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div style={{
        marginLeft: 'var(--sidebar-width)',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        minWidth: 0,
      }}>

        {/* Topbar */}
        <header style={{
          height: 'var(--topbar-height)',
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
          position: 'sticky',
          top: 0,
          zIndex: 20,
          gap: 8,
        }}>
          <h1 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0, flex: 1 }}>
            {pageTitle}
          </h1>

          {/* Bell notifications */}
          <div ref={bellRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setBellOpen(v => !v)}
              style={{
                width: 36, height: 36,
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: bellOpen ? 'var(--orange-pale)' : 'transparent',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                position: 'relative',
                color: 'var(--text-secondary)',
              }}
            >
              <Bell size={16} color={(suggestions.length + notificaciones.length) > 0 ? 'var(--orange)' : undefined} />
              {(suggestions.length + notificaciones.length) > 0 && (
                <span style={{
                  position: 'absolute', top: 4, right: 4,
                  minWidth: 16, height: 16, borderRadius: 8,
                  background: 'var(--orange)', color: '#fff',
                  border: '1.5px solid var(--bg-card)',
                  fontSize: 9, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 3px',
                }}>
                  {suggestions.length + notificaciones.length}
                </span>
              )}
            </button>

            {/* Bell dropdown */}
            {bellOpen && (
              <div style={{
                position: 'absolute', top: 44, right: 0,
                width: 360,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                zIndex: 100,
                overflow: 'hidden',
              }}>
                <div style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Mail size={14} color="var(--orange)" />
                    Sugerencias de Gmail
                    {suggestions.length > 0 && (
                      <span style={{
                        background: 'var(--orange)', color: '#fff',
                        borderRadius: 99, fontSize: 10, fontWeight: 700,
                        padding: '1px 6px',
                      }}>
                        {suggestions.length}
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                  {suggestions.length === 0 ? (
                    <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                      Sin sugerencias pendientes
                    </div>
                  ) : (
                    suggestions.map(s => (
                      <div key={s.id} style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border)',
                        background: '#fff',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <Mail size={13} color="var(--orange)" style={{ marginTop: 2, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {s.from_name || s.from_email}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {s.subject}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--orange)', marginTop: 4, fontWeight: 500 }}>
                              {s.suggestion_data?.summary || s.suggestion_type}
                            </div>
                            {s.suggestion_data?.suggested_action && (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, fontStyle: 'italic' }}>
                                {s.suggestion_data.suggested_action}
                              </div>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                          {(s.lead_id || s.orden_id) && (
                            <a
                              href={s.orden_id ? `/dashboard/ventas/${s.orden_id}` : `/dashboard/leads`}
                              onClick={() => { applySuggestion(s.id); setBellOpen(false) }}
                              style={{
                                flex: 1,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                padding: '5px 10px',
                                borderRadius: 6,
                                background: 'var(--orange)', color: '#fff',
                                fontSize: 11, fontWeight: 600,
                                textDecoration: 'none',
                              }}
                            >
                              <ChevronRight size={11} /> Ver
                            </a>
                          )}
                          <button
                            onClick={() => applySuggestion(s.id)}
                            title={s.suggestion_type === 'new_lead' ? 'Crear lead automáticamente' : 'Marcar como aplicado'}
                            style={{
                              flex: 1,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                              padding: '5px 10px',
                              borderRadius: 6,
                              border: '1px solid #bbf7d0',
                              background: '#f0fdf4', color: '#15803d',
                              fontSize: 11, fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            <Check size={11} /> {s.suggestion_type === 'new_lead' ? 'Crear lead' : 'Aplicar'}
                          </button>
                          <button
                            onClick={() => openReply(s)}
                            title="Generar borrador de respuesta"
                            style={{
                              width: 28, height: 28,
                              borderRadius: 6,
                              border: '1px solid #bfdbfe',
                              background: '#eff6ff', color: '#1d4ed8',
                              cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            <Reply size={12} />
                          </button>
                          <button
                            onClick={() => dismissSuggestion(s.id)}
                            title="Descartar"
                            style={{
                              width: 28, height: 28,
                              borderRadius: 6,
                              border: '1px solid var(--border)',
                              background: 'transparent', color: 'var(--text-muted)',
                              cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 11,
                              flexShrink: 0,
                            }}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
                  <a
                    href="/dashboard/perfil"
                    onClick={() => setBellOpen(false)}
                    style={{ fontSize: 11, color: 'var(--orange)', textDecoration: 'none', fontWeight: 600 }}
                  >
                    Gestionar integración Gmail →
                  </a>
                </div>

                {/* CRM Notifications section */}
                <div style={{ borderTop: '2px solid var(--border)', background: 'var(--bg-app)' }}>
                  <div style={{
                    padding: '10px 16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AlertTriangle size={13} color="#f59e0b" />
                      Recordatorios CRM
                      {notificaciones.length > 0 && (
                        <span style={{ background: '#f59e0b', color: '#fff', borderRadius: 99, fontSize: 10, fontWeight: 700, padding: '1px 6px' }}>
                          {notificaciones.length}
                        </span>
                      )}
                    </div>
                    {notificaciones.length > 0 && (
                      <button
                        onClick={async () => {
                          await fetch('/api/notificaciones/all', { method: 'DELETE' })
                          setNotificaciones([])
                        }}
                        style={{ fontSize: 10, color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        Marcar leídas
                      </button>
                    )}
                  </div>

                  <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                    {notificaciones.length === 0 ? (
                      <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                        Sin recordatorios pendientes
                      </div>
                    ) : (
                      notificaciones.map(n => {
                        const icon = n.tipo === 'lead_sin_gestion'
                          ? <Clock size={13} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />
                          : n.tipo === 'campana_proxima'
                            ? <Megaphone size={13} color="#3b82f6" style={{ flexShrink: 0, marginTop: 2 }} />
                            : <AlertTriangle size={13} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
                        return (
                          <div
                            key={n.id}
                            style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: '#fff', cursor: n.link ? 'pointer' : 'default' }}
                            onClick={async () => {
                              await fetch(`/api/notificaciones/${n.id}`, { method: 'PATCH' })
                              setNotificaciones(prev => prev.filter(x => x.id !== n.id))
                              if (n.link) { setBellOpen(false); router.push(n.link) }
                            }}
                          >
                            <div style={{ display: 'flex', gap: 8 }}>
                              {icon}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>{n.titulo}</div>
                                {n.mensaje && (
                                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>{n.mensaje}</div>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main style={{
          flex: 1,
          overflowY: 'auto',
          padding: 24,
          background: 'var(--bg-app)',
        }}>
          {children}
        </main>
      </div>

      {/* Chat backdrop */}
      {chatOpen && (
        <div
          onClick={() => setChatOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.2)',
            zIndex: 39,
          }}
        />
      )}

      {/* Chat panel */}
      <div style={{
        position: 'fixed',
        right: 0,
        top: 0,
        height: '100vh',
        width: 380,
        background: 'var(--bg-card)',
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 40,
        transform: chatOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 220ms ease',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.08)',
      }}>
        {/* Chat header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
              Movi
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              IA de Movimagen
            </div>
          </div>
          <button
            onClick={() => setChatOpen(false)}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: '1px solid var(--border)',
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-secondary)',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Messages area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>
          {chatMessages.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginTop: 40 }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--orange-pale)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                <MessageCircle size={22} color="var(--orange)" />
              </div>
              <p style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>¡Hola! Soy Movi.</p>
              <p style={{ fontSize: 12, lineHeight: 1.6 }}>Tu asistente del CRM de Movimagen.<br />Preguntame lo que necesites.</p>
            </div>
          ) : (
            chatMessages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
                <div style={{
                  maxWidth: '88%',
                  padding: '8px 12px',
                  borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                  background: msg.role === 'user' ? 'var(--orange)' : 'var(--bg-app)',
                  color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                  fontSize: 13,
                  border: msg.role === 'assistant' ? '1px solid var(--border)' : 'none',
                  wordBreak: 'break-word',
                }}>
                  {msg.role === 'assistant' ? renderMarkdown(msg.content) : msg.content}
                </div>
              </div>
            ))
          )}
          {chatLoading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
              <div style={{ padding: '10px 14px', borderRadius: '12px 12px 12px 2px', background: 'var(--bg-app)', border: '1px solid var(--border)', display: 'flex', gap: 5, alignItems: 'center' }}>
                {[0, 1, 2].map(j => (
                  <div key={j} style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--orange)', opacity: 0.7, animation: `bounce 1.2s ease-in-out ${j * 0.2}s infinite` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Chat input */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder="Escribí tu consulta..."
            disabled={chatLoading}
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 13,
              fontFamily: 'Montserrat, sans-serif',
              color: 'var(--text-primary)',
              background: chatLoading ? 'var(--gray-100)' : '#fff',
              outline: 'none',
            }}
          />
          <button
            onClick={sendMessage}
            disabled={chatLoading || !chatInput.trim()}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'var(--orange)',
              border: 'none',
              cursor: chatLoading || !chatInput.trim() ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: chatLoading || !chatInput.trim() ? 0.5 : 1,
              flexShrink: 0,
            }}
          >
            <Send size={15} color="#fff" />
          </button>
        </div>
      </div>

      {/* Reply modal */}
      {replyModal && (
        <div
          onClick={() => setReplyModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 12,
              width: '100%',
              maxWidth: 600,
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 12px 48px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Borrador de respuesta
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Para: {replyModal.from} · Re: {replyModal.subject}
                </div>
              </div>
              <button
                onClick={() => setReplyModal(null)}
                style={{
                  width: 30, height: 30,
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-muted)',
                }}
              >
                <X size={15} />
              </button>
            </div>

            <div style={{ padding: 20, flex: 1, overflowY: 'auto' }}>
              {replyLoading ? (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  padding: 60,
                  color: 'var(--text-muted)',
                  fontSize: 13,
                }}>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Generando respuesta...
                </div>
              ) : (
                <textarea
                  value={replyDraft}
                  onChange={e => setReplyDraft(e.target.value)}
                  rows={14}
                  style={{
                    width: '100%',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    padding: 12,
                    fontSize: 13,
                    fontFamily: 'Montserrat, sans-serif',
                    color: 'var(--text-primary)',
                    lineHeight: 1.5,
                    resize: 'vertical',
                    outline: 'none',
                  }}
                />
              )}
            </div>

            <div style={{
              padding: '12px 20px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              gap: 8,
              justifyContent: 'flex-end',
            }}>
              <button
                onClick={() => setReplyModal(null)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  fontSize: 13, fontWeight: 600,
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontFamily: 'Montserrat, sans-serif',
                }}
              >
                Cerrar
              </button>
              <button
                onClick={copyReply}
                disabled={replyLoading || !replyDraft}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: replyCopied ? '#16a34a' : 'var(--orange)',
                  color: '#fff',
                  fontSize: 13, fontWeight: 600,
                  cursor: replyLoading || !replyDraft ? 'not-allowed' : 'pointer',
                  opacity: replyLoading || !replyDraft ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', gap: 6,
                  fontFamily: 'Montserrat, sans-serif',
                }}
              >
                {replyCopied ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar texto</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating chat button */}
      <button
        onClick={() => setChatOpen(v => !v)}
        title="Movi — IA de Movimagen"
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 52,
          height: 52,
          borderRadius: '50%',
          background: 'var(--orange)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          boxShadow: '0 4px 16px rgba(235,105,28,0.35)',
          transition: 'background 150ms ease, transform 150ms ease',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--orange-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'var(--orange)')}
      >
        <MessageCircle size={22} color="#fff" />
      </button>
    </div>
  )
}
