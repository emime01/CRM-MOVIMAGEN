// Constantes compartidas entre la pantalla de usuarios (cliente) y la API (servidor).
// Sin imports de servidor, para que el cliente pueda usarlas.
import { ROL_ADMIN_SISTEMA, TODOS_LOS_ROLES } from '@/lib/auth/roles'

/** Roles que se pueden asignar a un perfil. */
export const ROLES_ASIGNABLES: string[] = [...TODOS_LOS_ROLES, ROL_ADMIN_SISTEMA]

export const ROL_LABELS: Record<string, string> = {
  vendedor: 'Vendedor',
  asistente_ventas: 'Asistente de ventas',
  asistente_ventas_ops: 'Asistente de ventas y operaciones',
  operaciones: 'Operaciones',
  arte: 'Arte',
  gerente_comercial: 'Gerente comercial',
  administracion: 'Administración',
  asistente_administracion: 'Asistente de administración',
  admin_sistema: 'Administrador del sistema',
}

export const MIN_PASSWORD = 8

export const emailValido = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
