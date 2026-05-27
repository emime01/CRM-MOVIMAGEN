# CRM Movimagen — Servidor MCP (Fase 1, solo lectura)

Permite consultar el CRM conversacionalmente desde Claude usando la
suscripción de cada usuario (no consume créditos de API de la empresa).

Esta primera fase es **solo lectura** y está pensada para el perfil **asistente**
(acceso amplio de consulta). No modifica datos.

## ⭐ Opción recomendada: conector remoto (sin instalar nada)

El servidor también corre **dentro del propio deploy de Vercel** en
`https://crm-movimagen.vercel.app/api/mcp`. Cada persona lo agrega como
conector — sin terminal, sin descargar el repo, sin editar archivos.

### Configuración en Vercel (una sola vez, por el admin)

1. En Vercel → proyecto → **Settings → Environment Variables**, agregá:
   - `MCP_SECRET` = un texto secreto largo (ej: generá uno random)
2. Redeploy.

### Conectarlo en Claude (cada usuario)

- **Claude web/desktop** → **Settings → Connectors → Add custom connector**
- Pegar la URL con el secreto:
  `https://crm-movimagen.vercel.app/api/mcp?key=EL_MCP_SECRET`
- Guardar. Ya aparecen las herramientas del CRM en el chat.

> El `?key=` protege el endpoint. Si no se setea `MCP_SECRET` en Vercel, el
> endpoint queda abierto (no recomendado). Para identidad por usuario (que cada
> uno vea solo lo suyo) hace falta OAuth — planificado para una fase posterior.

---

## Opción alternativa: servidor local (Claude Desktop, requiere terminal)

Solo si preferís correrlo en tu máquina en vez de usar el conector remoto.

## Herramientas disponibles

| Herramienta | Qué hace |
|---|---|
| `consultar_disponibilidad` | Estado (libre/reservado/ocupado) de los soportes en una fecha |
| `buscar_cliente` | Busca clientes por nombre o empresa |
| `listar_cotizaciones` | Lista propuestas con su estado, cliente y montos |
| `consultar_objetivos` | Objetivos C1/C2/C3 por cliente y vendedor |
| `listar_soportes` | Catálogo de soportes con precios y capacidad |
| `listar_reservas` | Reservas por estado (default: pendientes) |

## Requisitos

- Node.js 18+
- Claude Desktop (con suscripción Pro/Team/Enterprise)
- El repo clonado y `npm install` ejecutado

## Configuración en Claude Desktop

1. Abrí Claude Desktop → **Settings → Developer → Edit Config**
   (o editá directamente el archivo de config):
   - macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. Agregá esta entrada (ajustá la ruta absoluta al repo y las credenciales):

```json
{
  "mcpServers": {
    "crm-movimagen": {
      "command": "node",
      "args": ["/ruta/absoluta/al/repo/CRM-MOVIMAGEN/mcp-server/index.mjs"],
      "env": {
        "NEXT_PUBLIC_SUPABASE_URL": "https://TU-PROYECTO.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "tu-service-role-key"
      }
    }
  }
}
```

3. Reiniciá Claude Desktop. En el chat vas a ver el ícono de herramientas (🔌)
   con `crm-movimagen` disponible.

## Ejemplos de uso

- "¿Qué soportes están libres el 2026-06-15?"
- "Buscá el cliente Pronto y decime quién es el vendedor"
- "Mostrame las cotizaciones enviadas"
- "¿Cómo viene Fabián contra su objetivo del año?"
- "¿Cuánto sale el circuito de buses por semana?"
- "¿Hay reservas pendientes de aprobación?"

## Notas de seguridad

- Usa el **service role key** de Supabase, así que tiene acceso de lectura
  completo. NO compartas el archivo de config ni la key.
- Esta fase **no escribe** datos. Las herramientas de carga (leads, reservas,
  cotizaciones) se agregarán en la Fase 2 con validación y confirmación.
- Para el despliegue multi-usuario (todos los perfiles, vía conector remoto
  con OAuth) ver la Fase 3 del plan.
