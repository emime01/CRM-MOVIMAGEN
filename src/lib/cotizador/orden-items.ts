import { randomUUID } from 'crypto'

// propuesta_items no tiene columna de orden y su id es un UUID al azar, así
// que al leerlos con .order('id') los ítems salían mezclados. Para conservar
// el orden en que el vendedor los cargó, el id lleva la posición en sus
// primeros 8 dígitos hex: Postgres ordena los UUID byte a byte, y el resto
// sigue siendo aleatorio.
export function idEnOrden(posicion: number): string {
  return posicion.toString(16).padStart(8, '0').slice(-8) + randomUUID().slice(8)
}
