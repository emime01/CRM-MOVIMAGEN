'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Home, FileText, Filter, Calendar, BarChart2,
  Users, Target, Star, Wrench, Truck, Monitor,
  Palette, Receipt, AlertCircle, Percent, Building2,
  CreditCard, Settings, MessageCircle, X, Send,
  FlaskConical, Package, BookUser,
} from 'lucide-react'

type Rol = 'vendedor' | 'asistente_ventas' | 'gerente_comercial' | 'operaciones' | 'arte' | 'administracion'

interface NavItem {
  href: string
  label: string
  icon: React.ReactNode
  roles: Rol[]
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: <Home size={16} />, roles: ['vendedor', 'asistente_ventas', 'gerente_comercial'] },
  { href: '/dashboard/ventas', label: 'Ventas', icon: <FileText size={16} />, roles: ['vendedor', 'asistente_ventas', 'gerente_comercial'] },
  { href: '/dashboard/leads', label: 'Leads', icon: <Filter size={16} />, roles: ['vendedor', 'asistente_ventas', 'gerente_comercial'] },
  { href: '/dashboard/disponibilidad', label: 'Disponibilidad', icon: <Calendar size={16} />, roles: ['vendedor', 'asistente_ventas', 'gerente_comercial'] },
  { href: '/dashboard/reportes', label: 'Reportes', icon: <BarChart2 size={16} />, roles: ['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion'] },
  { href: '/dashboard/cuentas', label: 'Cuentas', icon: <BookUser size={16} />, roles: ['vendedor', 'asistente_ventas', 'gerente_comercial', 'administracion'] },
  { href: '/dashboard/gerente', label: 'Mi Equipo', icon: <Users size={16} />, roles: ['gerente_comercial', 'administracion'] },
  { href: '/dashboard/gerente/objetivos', label: 'Objetivos', icon: <Target size={16} />, roles: ['asistente_ventas'] },
  { href: '/dashboard/oic', label: 'OIC', icon: <Wrench size={16} />, roles: ['operaciones'] },
  { href: '/dashboard/buses', label: 'Buses', icon: <Truck size={16} />, roles: ['operaciones'] },
  { href: '/dashboard/arte', label: 'Planilla digital', icon: <Monitor size={16} />, roles: ['arte'] },
  { href: '/dashboard/arte/colores', label: 'Muestras de color', icon: <Palette size={16} />, roles: ['arte'] },
  { href: '/dashboard/admin/facturacion', label: 'Facturación', icon: <Receipt size={16} />, roles: ['administracion'] },
  { href: '/dashboard/admin/deudores', label: 'Deudores', icon: <AlertCircle size={16} />, roles: ['administracion'] },
  { href: '/dashboard/admin/comisiones', label: 'Comisiones', icon: <Percent size={16} />, roles: ['administracion'] },
  { href: '/dashboard/admin/canon', label: 'Canon', icon: <Building2 size={16} />, roles: ['administracion'] },
  { href: '/dashboard/admin/gastos', label: 'Gastos', icon: <CreditCard size={16} />, roles: ['administracion'] },
  { href: '/dashboard/admin/soportes', label: 'Soportes', icon: <Package size={16} />, roles: ['asistente_ventas', 'administracion'] },
  { href: '/dashboard/config', label: 'Configuración', icon: <Settings size={16} />, roles: ['administracion'] },
]

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/dashboard/ventas': 'Ventas',
  '/dashboard/ventas/nueva': 'Nueva Orden',
  '/dashboard/leads': 'Leads',
  '/dashboard/disponibilidad': 'Disponibilidad',
  '/dashboard/reportes': 'Reportes',
  '/dashboard/cuentas': 'Cuentas',
  '/dashboard/gerente': 'Mi Equipo',
  '/dashboard/gerente/objetivos': 'Objetivos',
  '/dashboard/gerente/ceo': 'Dashboard CEO',
  '/dashboard/oic': 'OIC',
  '/dashboard/buses': 'Buses',
  '/dashboard/arte': 'Planilla Digital',
  '/dashboard/arte/colores': 'Muestras de Color',
  '/dashboard/admin/facturacion': 'Facturación',
  '/dashboard/admin/deudores': 'Deudores',
  '/dashboard/admin/comisiones': 'Comisiones',
  '/dashboard/admin/canon': 'Canon',
  '/dashboard/admin/gastos': 'Gastos',
  '/dashboard/admin/soportes': 'Soportes',
  '/dashboard/config': 'Configuración',
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
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessage, setChatMessage] = useState('')
  const [testMode, setTestMode] = useState(false)

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
          <h1 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
            {pageTitle}
          </h1>
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
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <div style={{
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: 13,
            marginTop: 40,
          }}>
            <div style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'var(--orange-pale)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
            }}>
              <MessageCircle size={22} color="var(--orange)" />
            </div>
            <p style={{ fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
              ¡Hola! Soy Movi.
            </p>
            <p style={{ fontSize: 12, lineHeight: 1.5 }}>
              Tu asistente de IA de Movimagen.<br />
              Próximamente disponible.
            </p>
          </div>
        </div>

        {/* Chat input */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          gap: 8,
        }}>
          <input
            type="text"
            value={chatMessage}
            onChange={e => setChatMessage(e.target.value)}
            placeholder="Escribí tu consulta..."
            disabled
            style={{
              flex: 1,
              padding: '8px 12px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 13,
              fontFamily: 'Montserrat, sans-serif',
              color: 'var(--text-primary)',
              background: 'var(--gray-100)',
              outline: 'none',
            }}
          />
          <button
            disabled
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: 'var(--orange)',
              border: 'none',
              cursor: 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: 0.5,
            }}
          >
            <Send size={15} color="#fff" />
          </button>
        </div>
      </div>

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
