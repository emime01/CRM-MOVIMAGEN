/**
 * El plan de una cotización (soportes elegidos con semanas, cantidad y
 * salidas) y su cálculo. Lo comparten el cotizador (la pantalla) y la
 * presentación comercial, que calcula cada opción (A, B, C…) igual que la
 * pantalla calcula la propuesta que se está mirando.
 */
import { calcularItem, esCircuito, esLed, type CalcResultado } from './calcular'

export interface Soporte {
  id: string
  cotizador_id: number | null
  nombre: string
  categoria: string                                     // Digital | Shopping | Exterior | Bus | Otro
  seccion: string | null                                // full grouping label, e.g. "PANTALLAS GIGANTES"
  tipo_cotizador: string | null                         // led | circuito | estatico_bus | banner_shopping | estatico_shopping | medianera
  ubicacion: string | null
  precio_semanal: number | null
  tiene_iva: boolean                                    // iva_arrendamiento
  salidas_por_hora: number | null
  horas_encendido: number | null
  impactos_mensuales: number | null
  costo_produccion: number | null
  impuestos_municipales: number | null                  // flat $ per week per unit
  cantidad_default: number | null
  semanas_minimas: number | null
  precio_semanal_alta?: number | null
  semanas_minimas_alta?: number | null
  temporada_alta: boolean
  temporada_baja: boolean
  comentario: string | null
  url_imagen: string | null
  medidas?: string | null
  activo: boolean
}

export interface PlanItem {
  uid: number
  soporte: Soporte
  semanas: number
  salidasElegidas: number | null
  cantidadSoportes: number
}

export interface SavedItem {
  id: string
  soporte_id: string | null
  nombre_soporte: string
  ubicacion: string | null
  categoria_soporte: string | null
  tipo_cotizador: string | null
  cantidad: number
  cantidad_soportes: number | null
  salidas_elegidas: number | null
  semanas: number
  precio_unitario: number
  subtotal: number | null
  impactos_calc: number | null
}

export type Calc = CalcResultado

/** Cálculo de un renglón del plan (arrendamiento, IVA, producción, impuestos, impactos). */
export function calcItem(item: PlanItem, inicio?: string | null): Calc {
  return calcularItem({
    soporte: item.soporte,
    semanas: item.semanas,
    cantidad: item.cantidadSoportes,
    salidas: item.salidasElegidas,
    inicio,
  })
}

/** Reconstruye el plan a partir de los ítems guardados de una cotización. */
export function planDesdeGuardados(saved: SavedItem[], soportes: Soporte[], nuevoUid: () => number): PlanItem[] {
  return saved.map((it, i) => {
    const matched = soportes.find(s => s.id === it.soporte_id) ??
      soportes.find(s => s.nombre === it.nombre_soporte && (s.ubicacion ?? '') === (it.ubicacion ?? ''))
    const fallback: Soporte = matched ?? {
      id: it.soporte_id ?? `legacy-${i}`,
      cotizador_id: null,
      nombre: it.nombre_soporte,
      categoria: it.categoria_soporte ?? 'Otro',
      seccion: null,
      tipo_cotizador: it.tipo_cotizador ?? null,
      ubicacion: it.ubicacion,
      precio_semanal: it.precio_unitario,
      tiene_iva: false,
      salidas_por_hora: null,
      horas_encendido: null,
      impactos_mensuales: null,
      costo_produccion: null,
      impuestos_municipales: null,
      cantidad_default: 1,
      semanas_minimas: 1,
      temporada_alta: false,
      temporada_baja: false,
      comentario: null,
      url_imagen: null,
      activo: true,
    }
    return {
      uid: nuevoUid(),
      soporte: fallback,
      semanas: it.semanas || 1,
      salidasElegidas: it.salidas_elegidas ?? (esLed(fallback) ? 30 : esCircuito(fallback) ? 10 : null),
      cantidadSoportes: it.cantidad_soportes ?? it.cantidad ?? 1,
    }
  })
}
