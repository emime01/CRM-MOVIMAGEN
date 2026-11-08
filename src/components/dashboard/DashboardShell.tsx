'use client'

import { puede } from '@/lib/auth/roles'

import { useState, useRef, useEffect, Fragment } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import GlobalSearch from '@/components/dashboard/GlobalSearch'
import Dialogos from '@/components/ui/dialogos'
import {
  Home, FileText, Filter, Calendar, BarChart2, Users, Target, Star, Truck, Factory, Receipt, AlertCircle, Percent, Building2, CreditCard, Settings, FlaskConical, Package, BookUser, Camera, Bell, UserCircle, CalendarDays, AlertTriangle, Clock, Megaphone, ClipboardList, Menu,
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

type Rol = 'vendedor' | 'asistente_ventas' | 'gerente_comercial' | 'operaciones' | 'arte' | 'administracion' | 'asistente_ventas_ops' | 'admin_sistema' | 'asistente_administracion'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  roles: Rol[]
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: <Home size={16} />, roles: ['vendedor', 'asistente_ventas', 'gerente_comercial'] },
  { href: '/dashboard/leads', label: 'Leads', icon: <Filter size={16} />, roles: ['vendedor', 'gerente_comercial'] },
  { href: '/dashboard/cotizaciones', label: 'Cotizaciones', icon: <ClipboardList size={16} />, roles: ['vendedor', 'asistente_ventas'] },
  { href: '/dashboard/disponibilidad', label: 'Disponibilidad', icon: <Calendar size={16} />, roles: ['vendedor', 'asistente_ventas', 'gerente_comercial', 'operaciones', 'administracion'] },
  { href: '/dashboard/ventas', label: 'Ventas', icon: <FileText size={16} />, roles: ['vendedor', 'asistente_ventas', 'gerente_comercial', 'operaciones', 'arte', 'administracion', 'asistente_administracion'] },
  { href: '/dashboard/reportes', label: 'Reportes', icon: <BarChart2 size={16} />, roles: ['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion'] },
  { href: '/dashboard/cuentas', label: 'Cuentas', icon: <BookUser size={16} />, roles: ['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion', 'asistente_administracion'] },
  { href: '/dashboard/gerente', label: 'Mi Equipo', icon: <Users size={16} />, roles: ['gerente_comercial', 'administracion'] },
  { href: '/dashboard/gerente/objetivos', label: 'Objetivos', icon: <Target size={16} />, roles: ['asistente_ventas'] },
  { href: '/dashboard/tasks', label: 'Tareas', icon: <ClipboardList size={16} />, roles: ['arte', 'operaciones', 'administracion', 'gerente_comercial', 'asistente_administracion'] },
  { href: '/dashboard/calendario', label: 'Calendario', icon: <CalendarDays size={16} />, roles: ['vendedor', 'asistente_ventas', 'gerente_comercial', 'operaciones', 'arte', 'administracion', 'asistente_administracion'] },
  // La pantalla existía pero no estaba en el menú ni enlazada desde ningún
  // lado: operaciones sólo llegaba escribiendo la URL.
  { href: '/dashboard/oic', label: 'Producción', icon: <Factory size={16} />, roles: ['operaciones', 'arte'] },
  { href: '/dashboard/buses', label: 'Buses', icon: <Truck size={16} />, roles: ['operaciones', 'administracion'] },
  { href: '/dashboard/registros', label: 'Registros', icon: <Camera size={16} />, roles: ['operaciones', 'administracion', 'vendedor', 'asistente_ventas', 'gerente_comercial'] },
  { href: '/dashboard/admin/facturacion', label: 'Facturación', icon: <Receipt size={16} />, roles: ['administracion', 'asistente_administracion'] },
  { href: '/dashboard/admin/deudores', label: 'Deudores', icon: <AlertCircle size={16} />, roles: ['administracion', 'gerente_comercial', 'asistente_administracion'] },
  { href: '/dashboard/admin/comisiones', label: 'Comisiones', icon: <Percent size={16} />, roles: ['administracion', 'gerente_comercial', 'asistente_administracion'] },
  { href: '/dashboard/admin/canon', label: 'Canon', icon: <Building2 size={16} />, roles: ['administracion', 'asistente_administracion'] },
  { href: '/dashboard/admin/gastos', label: 'Gastos', icon: <CreditCard size={16} />, roles: ['administracion', 'asistente_administracion'] },
  { href: '/dashboard/admin/soportes', label: 'Soportes', icon: <Package size={16} />, roles: ['asistente_ventas', 'administracion'] },
  { href: '/dashboard/config', label: 'Configuración', icon: <Settings size={16} />, roles: ['administracion'] },
  { href: '/dashboard/perfil', label: 'Mi Perfil', icon: <UserCircle size={16} />, roles: ['vendedor', 'asistente_ventas', 'gerente_comercial', 'operaciones', 'arte', 'administracion', 'asistente_administracion'] },
]

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/ventas': 'Ventas',
  '/dashboard/ventas/nueva': 'Nueva Orden',
  '/dashboard/leads': 'Leads',
  '/dashboard/cotizaciones': 'Cotizaciones',
  '/dashboard/disponibilidad': 'Disponibilidad',
  '/dashboard/reportes': 'Reportes',
  '/dashboard/cuentas': 'Cuentas',
  '/dashboard/gerente': 'Mi Equipo',
  '/dashboard/gerente/objetivos': 'Objetivos',
  '/dashboard/tasks': 'Tareas',
  '/dashboard/calendario': 'Calendario',
  '/dashboard/gerente/ceo': 'Dashboard CEO',
  '/dashboard/oic': 'Producción',
  '/dashboard/buses': 'Buses',
  '/dashboard/registros': 'Registros',
  '/dashboard/admin/facturacion': 'Facturación',
  '/dashboard/admin/deudores': 'Deudores',
  '/dashboard/admin/comisiones': 'Comisiones',
  '/dashboard/admin/canon': 'Canon',
  '/dashboard/admin/gastos': 'Gastos',
  '/dashboard/admin/soportes': 'Soportes',
  '/dashboard/config': 'Configuración',
  '/dashboard/perfil': 'Mi Perfil',
}

// Pantallas de detalle (/dashboard/ventas/<id>, …): sin esto decían "Dashboard".
const TITULOS_DETALLE: [string, string][] = [
  ['/dashboard/ventas/', 'Venta'],
  ['/dashboard/leads/', 'Lead'],
  ['/dashboard/cotizaciones/', 'Cotización'],
  ['/dashboard/cuentas/', 'Cuenta'],
  ['/dashboard/reportes/', 'Reportes comparativos'],
  ['/dashboard/gerente/', 'Mi Equipo'],
]

const ROL_LABELS: Record<Rol, string> = {
  vendedor: 'Vendedor',
  asistente_ventas: 'Asistente de Ventas',
  asistente_ventas_ops: 'Asistente Ventas y Operaciones',
  admin_sistema: 'Administrador del sistema',
  asistente_administracion: 'Asistente administrativa',
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
  const [testMode, setTestMode] = useState(false)

  const [bellOpen, setBellOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const bellRef = useRef<HTMLDivElement>(null)


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

  // Avisos del CRM: al entrar y cada 5 minutos. (Las sugerencias de Gmail
  // con IA se sacaron: gastaban saldo de la API en cada mail.)
  useEffect(() => {
    async function fetchNotifs() {
      try {
        const res = await fetch('/api/notificaciones')
        if (res.ok) setNotificaciones(await res.json())
      } catch { /* silent */ }
    }
    fetchNotifs()
    const interval = setInterval(fetchNotifs, 5 * 60 * 1000)
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

  // Cerrar el sidebar mobile al navegar
  useEffect(() => { setSidebarOpen(false) }, [pathname])

  // puede() expande el rol mixto a ventas + operaciones, así que ve las
  // secciones de las dos áreas sin tener que listarlo en cada ítem.
  const navItems = testMode ? NAV_ITEMS : NAV_ITEMS.filter(item => puede(user.rol, item.roles))
  const pageTitle = PAGE_TITLES[pathname] ?? TITULOS_DETALLE.find(([pre]) => pathname.startsWith(pre))?.[1] ?? 'Dashboard'

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  const initials = user.name
    ? user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : user.email[0].toUpperCase()

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-app)', fontFamily: 'Montserrat, sans-serif' }}>
      <Dialogos />

      {/* Overlay (solo mobile, cuando el sidebar está abierto) */}
      <div
        className={`dash-overlay${sidebarOpen ? ' open' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`dash-sidebar${sidebarOpen ? ' open' : ''}`} style={{
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
      <div className="dash-main" style={{
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
          <button
            className="dash-hamburger"
            onClick={() => setSidebarOpen(v => !v)}
            aria-label="Abrir menú"
            style={{
              width: 36, height: 36, borderRadius: 8, border: '1px solid var(--border)',
              background: 'transparent', cursor: 'pointer', alignItems: 'center',
              justifyContent: 'center', color: 'var(--text-secondary)', flexShrink: 0,
            }}
          >
            <Menu size={18} />
          </button>
          <h1 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {pageTitle}
          </h1>

          <GlobalSearch />

          {/* Bell notifications */}
          <div ref={bellRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setBellOpen(v => !v)}
              aria-label="Notificaciones"
              title="Notificaciones"
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
              <Bell size={16} color={notificaciones.length > 0 ? 'var(--orange)' : undefined} />
              {notificaciones.length > 0 && (
                <span style={{
                  position: 'absolute', top: 4, right: 4,
                  minWidth: 16, height: 16, borderRadius: 8,
                  background: 'var(--orange)', color: '#fff',
                  border: '1.5px solid var(--bg-card)',
                  fontSize: 9, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 3px',
                }}>
                  {notificaciones.length}
                </span>
              )}
            </button>

            {/* Bell dropdown */}
            {bellOpen && (
              <div className="campanita-panel" style={{
                position: 'absolute', top: 44, right: 0,
                width: 360,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
                zIndex: 100,
                overflow: 'hidden',
              }}>
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
                        const iconMap: Record<string, React.ReactNode> = {
                          lead_sin_gestion:       <Clock size={13} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />,
                          propuesta_sin_respuesta: <Clock size={13} color="#f59e0b" style={{ flexShrink: 0, marginTop: 2 }} />,
                          campana_proxima:        <Megaphone size={13} color="#3b82f6" style={{ flexShrink: 0, marginTop: 2 }} />,
                          campana_por_terminar:   <Calendar size={13} color="#8b5cf6" style={{ flexShrink: 0, marginTop: 2 }} />,
                          campana_sin_registro:   <Camera size={13} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />,
                          deuda_antigua:          <CreditCard size={13} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />,
                          lead_ganado_sin_orden:  <Star size={13} color="#16a34a" style={{ flexShrink: 0, marginTop: 2 }} />,
                          orden_pendiente:        <AlertTriangle size={13} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />,
                        }
                        const icon = iconMap[n.tipo] ?? <AlertTriangle size={13} color="#ef4444" style={{ flexShrink: 0, marginTop: 2 }} />
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

    </div>
  )
}
