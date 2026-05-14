# CRM Movimagen — Manual técnico

Documentación para futuras sesiones de Claude Code. Resumen del estado, stack, estructura, roles y reglas de negocio.

---

## Stack

- **Next.js** App Router (server + client components) — TypeScript
- **Supabase** (Postgres + Auth + Storage + RLS)
- **NextAuth** para sesión (rol almacenado en `session.user.rol`)
- **Vercel** deploy automático en push a `main`
- Librerías: `recharts` (gráficos), `xlsx` (import/export), `fluent-ffmpeg` + `@ffmpeg-installer/ffmpeg` (videocomprobantes), `lucide-react` (íconos)
- Fuente UI: Montserrat (estilos inline con `fontFamily: 'Montserrat, sans-serif'`)
- Branding: naranja `#EB691C` (`--orange`)

---

## Roles del sistema

`session.user.rol` puede ser uno de:

| rol | quién |
|---|---|
| `vendedor` | Natalia, Federico, Fabián |
| `asistente_ventas` | Emiliano |
| `gerente_comercial` | Gonzalo (CEO mapeado acá) |
| `administracion` | Belén, Romina, Mauricio |
| `operaciones` | Emilia |
| `arte` | Victoria |

Contraseña inicial de todos: `Movimagen2026`.
Endpoint para seed/reseteo: `GET /api/seed-users?secret=crm-seed-movimagen-2026` (idempotente, también resetea passwords de usuarios existentes).

---

## Permisos por sección (decisiones del proyecto)

| Sección | Roles permitidos |
|---|---|
| **Leads** (sidebar + API) | `vendedor` + `gerente_comercial` |
| **Cotizaciones** (sidebar) | `vendedor` + `asistente_ventas` |
| **Crear cotización** (`POST /api/propuestas`) | `vendedor` + `asistente_ventas` |
| **Aprobar cotización** | `gerente_comercial` + `administracion` + `asistente_ventas` |
| **Registros — subir/borrar** | `administracion`, `operaciones`, `asistente_ventas`, `gerente_comercial` (vendedores solo ven) |
| **Soportes admin** (`/dashboard/admin/soportes`) | `asistente_ventas` + `administracion` |
| **Disponibilidad — aprobar reservas** | `administracion`, `operaciones`, `asistente_ventas`, `gerente_comercial` |
| **Mi Equipo** | `gerente_comercial` + `administracion` |

Roles se chequean en TRES capas: sidebar (`DashboardShell.tsx`), página server-side (`page.tsx` redirect), API route. Cambios deben aplicarse en las tres.

---

## Estructura del repo

```
src/
├── app/
│   ├── api/                    # API routes
│   │   ├── disponibilidad/     # ?fecha= y ?mes= modes
│   │   ├── soportes/           # CRUD + bulk import
│   │   ├── reservas/           # con aprobación/rechazo
│   │   ├── propuestas/         # cotizaciones (planificador)
│   │   ├── leads/
│   │   ├── comprobantes/       # genera PDF + video
│   │   ├── seed-users/         # crea/resetea 10 reales
│   │   └── ...
│   ├── dashboard/
│   │   ├── disponibilidad/     # calendar strip + cards con ocupación
│   │   ├── cotizaciones/[id]/  # CotizadorClient (planificador 2026)
│   │   ├── admin/soportes/     # CRUD + import Excel + plantilla
│   │   ├── leads/
│   │   ├── ventas/
│   │   ├── registros/
│   │   └── ...
│   └── login/
├── components/dashboard/
│   └── DashboardShell.tsx      # sidebar con NAV_ITEMS y roles
├── lib/
│   ├── auth.ts                 # NextAuth + Supabase admin
│   ├── supabase-server.ts
│   └── comprobantes/
│       ├── video.ts            # ffmpeg overlay
│       ├── pdf.ts
│       └── fonts/Montserrat-Bold.ttf
└── middleware.ts               # protege /dashboard/*

supabase/
├── migration_v2.sql ... v10_add_cap.sql
└── (también supabase_crm.sql — schema original)
```

---

## Migraciones SQL — orden de ejecución

Correr en Supabase SQL Editor en orden:

1. `supabase_crm.sql` (schema base — si DB vacía)
2. `migration_v2.sql` → `migration_v8_cotizador.sql` (en orden)
   - **v8** = enriquece `soportes` con columnas de planificador (`tipo_cotizador`, `salidas_por_hora`, `horas_encendido`, `impactos_mensuales`, `costo_produccion`, `impuestos_municipales`, `cantidad_default`, `semanas_minimas`, etc.) + siembra **64 soportes** con precios 2026
3. `migration_v9_cleanup_test_data.sql` — borra todos los datos transaccionales + clientes + agencias, preserva catálogo de soportes y perfiles reales. Auto-detecta tablas con FK a `perfiles`.
4. `migration_v10_add_cap.sql` — agrega `cap INTEGER NOT NULL DEFAULT 1` a `soportes` (capacidad para ocupación fraccionada)

---

## Cotizador / Planificador 2026

- Reemplaza el cotizador viejo (substituido en este commit). Lógica de planificador clonada de `github.com/emime01/planificador`.
- Fórmulas clave (en `CotizadorClient.tsx`):
  - `arr = precio_semanal × sem × mul × cant` (arrendamiento)
  - `mul = salidas_elegidas / 10` si es `circuito`, `/30` si es `led`, sino `1`
  - IVA 22% sobre arrendamiento si `tiene_iva = true`; siempre sobre producción
  - `mun = impuestos_municipales × sem × cant` (impuestos municipales)
  - `imp = impactos_mensuales × sem / 4.33 × cant × mul` (impactos)
  - `CPM = total / impactos × 1000`
- Dashboard con `recharts`: donut inversión, donut impactos, línea acumulada, barras eficiencia, barras alcance y CPM.
- 64 soportes precargados con `tipo_cotizador` ∈ `led | circuito | estatico_bus | banner_shopping | estatico_shopping | medianera`.
- Numeración auto: `COT-0001` via secuencia `propuestas_numero_seq`.

---

## Disponibilidad (rediseñada en esta sesión)

Inspirada en `github.com/emime01/DisponibilidadesMovimagen` (era un HTML standalone con Google Sheets backend).

**Modelo de datos clave:** ocupación **fraccionada** (no binaria). Cada soporte tiene `cap` (capacidad total). El "reservado" es la suma de `reserva_items.cantidad` + cantidad de `orden_items` activos en esa fecha. Estado: `libre` (0), `parcial` (>0 pero <cap), `ocupado` (=cap).

**API `/api/disponibilidad`** tiene dos modos:
- `?fecha=YYYY-MM-DD` → lista `SoporteOcupacion[]` con `cap`, `reservado`, `pct`, `clientes[]`, `estado`
- `?mes=YYYY-MM` → `DiaStats[]` con `libres` por día (para el calendar strip)

**UI** en `DisponibilidadClient.tsx`:
- **Calendar strip horizontal** con navegación por mes (`< Mayo 2026 >`) y chips por día mostrando `X lib`
- **Cards con barra de ocupación** + nombre de clientes activos
- **Toggle Tarjetas/Lista**
- **Filtros**: nombre, categoría (con emojis 🚌📺🏪🛍️🧱🏬), estado
- **4 tabs**: Disponibilidad, Estadísticas (métricas + barras por categoría + top clientes), Reservas (agrupadas por mes con badges de vencimiento), Aprobaciones (admin only — aprobar/rechazar pendientes)

---

## Soportes Admin (`/dashboard/admin/soportes`)

Visible para `asistente_ventas` y `administracion`.

- **CRUD individual** — modal con: nombre, categoría, tipo, sección, ubicación, precios (base + semanal), IVA, digital, **capacidad** (`cap`)
- **Importación masiva Excel** (`xlsx`):
  - Botón **"Descargar plantilla"** genera `plantilla_soportes.xlsx` con columnas y ejemplos
  - Acepta `.xlsx`, `.xls`, `.csv`
  - Columnas: `nombre`, `precio_semanal`, `tiene_iva` (requeridas) + `categoria`, `tipo`, `seccion`, `ubicacion`, `cap` (opcionales)
  - Preview de las primeras 10 filas antes de confirmar
- Activar/desactivar (soft delete vía `activo = false`)
- Tabla con columna `Cap.` resaltada en naranja si > 1

---

## Videocomprobantes (`src/lib/comprobantes/video.ts`)

Genera MP4 concatenando intro + clips (con overlay) + outro vía ffmpeg.

**Overlay (commit pendiente `e97648d`):**
- Rectángulo blanco de 120px abajo del frame (720p)
- Línea 1: nombre del soporte en MAYÚSCULAS, naranja `#EB691C`, 38pt
- Línea 2: `DESDE: DD-MM-YYYY  HASTA: DD-MM-YYYY` en naranja, 26pt
- Parte superior del frame queda limpia (video original visible)

Fuente Montserrat-Bold embebida en base64 (`FONT_B64` al inicio del archivo) — fallback para que Vercel siempre la incluya en el bundle.

---

## Comandos / endpoints útiles

| Acción | Cómo |
|---|---|
| Crear/resetear los 10 usuarios reales | `GET /api/seed-users?secret=crm-seed-movimagen-2026` |
| Verificar que migración v9 corrió bien | Query final del SQL: `perfiles=1, soportes=64` |
| Reset password de un usuario específico | Re-correr seed-users (resetea TODOS a `Movimagen2026`) |
| Type-check | `npx tsc --noEmit` |
| Dev server | `npm run dev` |

---

## Decisiones / convenciones del proyecto

1. **No agregar comentarios obvios.** Solo explicar el "por qué" cuando hay un truco/workaround. Identificadores bien nombrados ya documentan el "qué".
2. **Estilos inline** (no CSS modules ni Tailwind clases extensivas — el proyecto usa estilos inline con `fontFamily: 'Montserrat, sans-serif'`). Tailwind está disponible pero la mayoría del código existente es inline.
3. **Permisos en 3 capas**: sidebar nav (DashboardShell), página (page.tsx redirect), API (route.ts role check).
4. **Pagos en pesos uruguayos** y formatos `es-AR` para currency (no es Argentina pero el formato funciona). Fechas DD/MM/YYYY en UI, DD-MM-YYYY en videocomprobantes, YYYY-MM-DD internamente.
5. **No usar `gh` CLI ni GitHub MCP a otros repos** — el entorno está restringido a `emime01/crm-movimagen`.

---

## Estado pendiente al final de la última sesión

- **Commit `e97648d` sin pushear**: cambio del diseño del videocomprobante (overlay blanco + texto naranja con `DESDE/HASTA`). El proxy de Claude Code estaba devolviendo 403 en todos los pushes. Reintentar `git push origin main` apenas arranque la nueva sesión.

---

## Histórico de cambios mayores recientes

- v9 / v10: cleanup productivo + columna `cap`
- Cotizador reemplazado por planificador 2026 con gráficos
- 10 usuarios reales creados (`@movimagen.com.uy`)
- Permisos restringidos para leads (vendedor+gerente) y cotizaciones (vendedor+asistente)
- Disponibilidad rediseñada (calendar strip, ocupación fraccionada, 4 tabs)
- Soportes admin con plantilla descargable + columna `cap`
- Videocomprobante con nuevo diseño (pendiente push)
