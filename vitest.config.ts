import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Tests unitarios de la lógica de plata (cotizador, canon, ventas).
// `@/` resuelve a `src/`, igual que en tsconfig.json.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
})
