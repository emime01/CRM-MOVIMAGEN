/**
 * Los estados de una venta, en un solo lugar.
 *
 * La máquina es corta a propósito:
 *
 *   borrador → pendiente_aprobacion → aprobada
 *                                   ↘ rechazada
 *
 * `aprobada` es el final. Antes seguía `en_oic`, que quería decir "en
 * producción", pero era un estado que no cambiaba nada: lo que mueve la
 * producción son las tareas de arte y operaciones, las fechas reales y la
 * asignación de buses, no una etiqueta en la venta. Ninguna pantalla lo seteaba
 * —sólo se llegaba por API— y el nombre hablaba del papel (la OIC) en vez de
 * la etapa. También estuvieron `facturada` y `cobrada`, que sacaban la venta
 * de producción cuando administración hacía su parte; hoy son fechas aparte.
 *
 * Una venta aprobada es un compromiso comercial cerrado: no se edita ni se
 * vuelve atrás. Lo operativo —fechas reales, buses, registros, factura y
 * cobro— sigue abierto, porque las campañas se atrasan en la instalación y eso
 * no cambia lo que se vendió.
 */

export const ESTADOS_VENTA = ['borrador', 'pendiente_aprobacion', 'aprobada', 'rechazada'] as const
export type EstadoVenta = typeof ESTADOS_VENTA[number]

/**
 * Estados que ya no se setean pero pueden existir en filas viejas. Se siguen
 * contando como venta viva para no perder historia.
 */
export const ESTADOS_HEREDADOS = ['en_oic', 'facturada', 'cobrada'] as const

/** Una venta cerrada: ya no se edita ni cambia de estado. */
export function estaCerrada(estado: string | null | undefined): boolean {
  return estado === 'aprobada' || (ESTADOS_HEREDADOS as readonly string[]).includes(estado ?? '')
}

/** Quién puede llevar la venta a cada estado. `self` = el vendedor dueño. */
export const PERMISO_POR_ESTADO: Record<EstadoVenta, { roles: string[]; self?: boolean }> = {
  borrador:             { roles: ['asistente_ventas', 'gerente_comercial', 'administracion'], self: true },
  pendiente_aprobacion: { roles: ['asistente_ventas', 'gerente_comercial', 'administracion'], self: true },
  aprobada:             { roles: ['gerente_comercial'] },
  rechazada:            { roles: ['gerente_comercial'] },
}

/** Lo que se intentaba hacer y adónde se hace ahora. */
export const MOVIDO_A_SU_ENDPOINT: Record<string, string> = {
  en_oic:    'ya no existe: la venta queda aprobada y la producción se sigue por tareas y fechas reales',
  facturada: 'POST /api/ordenes/[id]/facturar',
  cobrada:   'POST /api/ordenes/[id]/cobrar',
}
