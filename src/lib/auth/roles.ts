/**
 * Roles y permisos.
 *
 * Hay un rol mixto —asistente de ventas y operaciones— porque en la práctica
 * una misma persona reserva los espacios (ventas) y después asigna los buses,
 * graba y arma los registros (operaciones). Con los roles sueltos no podía
 * completar su trabajo: el que aprueba la reserva no es el que la confirma.
 *
 * En vez de repetir el rol mixto en cada lista de permisos, `puede()` expande
 * el rol a los que ejerce. Así una lista que ya decía 'operaciones' lo incluye
 * sin tener que tocarla.
 */

export const ROL_MIXTO = 'asistente_ventas_ops'

/**
 * Administrador del sistema: ejerce todos los roles a la vez.
 *
 * No es un rol del negocio —nadie en Movimagen vende, aprueba, produce y
 * factura— sino el de quien administra el CRM y necesita recorrer el proceso
 * entero sin cambiar de usuario. Ojo con dárselo a alguien que no sea eso:
 * saltea todas las separaciones de responsabilidad, incluido aprobar su
 * propia venta.
 *
 * Distinto de 'administracion', que es el área de administración (Belén):
 * factura y cobra, pero no aprueba ventas ni trabaja las tareas de arte.
 */
export const ROL_ADMIN_SISTEMA = 'admin_sistema'

/** Todos los roles del negocio, que es lo que ejerce el administrador. */
export const TODOS_LOS_ROLES = [
  'vendedor', 'asistente_ventas', 'operaciones', 'arte',
  'gerente_comercial', 'administracion', ROL_MIXTO,
] as const

/** Los roles que ejerce un perfil. El mixto vale por los dos. */
export function rolesDe(rol: string | null | undefined): string[] {
  if (!rol) return []
  if (rol === ROL_ADMIN_SISTEMA) return [ROL_ADMIN_SISTEMA, ...TODOS_LOS_ROLES]
  return rol === ROL_MIXTO ? [ROL_MIXTO, 'asistente_ventas', 'operaciones'] : [rol]
}

/** ¿Es el administrador del sistema? Pasa cualquier control de rol. */
export function esAdminSistema(rol: string | null | undefined): boolean {
  return rol === ROL_ADMIN_SISTEMA
}

/** ¿El rol alcanza para alguno de los permitidos? */
export function puede(rol: string | null | undefined, permitidos: readonly string[]): boolean {
  const propios = rolesDe(rol)
  return propios.some(r => permitidos.includes(r))
}

/**
 * Las tareas se asignan a 'arte' u 'operaciones'. Esto responde si un perfil
 * trabaja las de ese área — el rol mixto trabaja las de operaciones.
 */
export function atiendeTareasDe(rol: string | null | undefined, areaTarea: string): boolean {
  return rolesDe(rol).includes(areaTarea)
}

/**
 * Sustituto de `rol === 'x'` para los controles que comparan contra un rol
 * suelto. Son los que `puede()` no cubría y por los que el administrador del
 * sistema quedaba afuera a pesar de ejercer ese rol.
 */
export function es(rol: string | null | undefined, unRol: string): boolean {
  return rolesDe(rol).includes(unRol)
}

/** Áreas de tareas que le tocan a este rol; vacío = las ve todas (gerencia). */
export function areasDeTarea(rol: string | null | undefined): string[] {
  // El administrador del sistema las ve todas, como gerencia: filtrarlo por
  // área lo dejaría viendo sólo una parte del tablero.
  if (esAdminSistema(rol)) return []
  return rolesDe(rol).filter(r => r === 'arte' || r === 'operaciones')
}
