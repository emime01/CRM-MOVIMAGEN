'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'

const TABS = [
  { label: 'Mi Equipo', href: '/dashboard/gerente' },
  { label: 'CEO', href: '/dashboard/gerente/ceo' },
  { label: 'Objetivos', href: '/dashboard/gerente/objetivos' },
  { label: 'Ventas', href: '/dashboard/ventas' },
]

export default function GerenteLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  return (
    <div style={{ fontFamily: 'Montserrat, sans-serif' }}>
      <div style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        marginBottom: 24,
        gap: 0,
      }}>
        {TABS.map(tab => {
          const isActive = tab.href === '/dashboard/gerente'
            ? pathname === '/dashboard/gerente'
            : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                padding: '10px 20px',
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--orange)' : 'var(--text-secondary)',
                borderBottom: isActive ? '2px solid var(--orange)' : '2px solid transparent',
                textDecoration: 'none',
                marginBottom: -1,
                transition: 'color 150ms ease',
                fontFamily: 'Montserrat, sans-serif',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
      {children}
    </div>
  )
}
