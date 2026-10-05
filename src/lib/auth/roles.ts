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

/** Los roles que ejerce un perfil. El mixto vale por los dos. */
export function rolesDe(rol: string | null | undefined): string[] {
  if (!rol) return []
  return rol === ROL_MIXTO ? [ROL_MIXTO, 'asistente_ventas', 'operaciones'] : [rol]
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

/** Áreas de tareas que le tocan a este rol; vacío = las ve todas (gerencia). */
export function areasDeTarea(rol: string | null | undefined): string[] {
  return rolesDe(rol).filter(r => r === 'arte' || r === 'operaciones')
}
