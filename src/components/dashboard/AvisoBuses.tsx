import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { createServerClient } from '@/lib/supabase-server'
import { ventasConBuses } from '@/lib/buses/por-asignar'

/** Cartel para operaciones: ventas con buses sin asignar. Nada si está al día. */
export default async function AvisoBuses() {
  const { ventas } = await ventasConBuses(createServerClient())
  const pendientes = ventas.filter(v => v.faltan > 0)
  if (!pendientes.length) return null
  const faltan = pendientes.reduce((a, v) => a + v.faltan, 0)
  return (
    <Link href="/dashboard/buses" style={{
      display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 14px',
      background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 10, color: '#92400e',
      fontSize: 13, fontWeight: 600, textDecoration: 'none',
    }}>
      <AlertTriangle size={16} />
      {pendientes.length} venta{pendientes.length > 1 ? 's' : ''} con buses sin asignar ({faltan} bus{faltan > 1 ? 'es' : ''}): {pendientes.slice(0, 3).map(v => `OIC #${v.numero}`).join(', ')}{pendientes.length > 3 ? '…' : ''} → Asignar en Buses
    </Link>
  )
}
