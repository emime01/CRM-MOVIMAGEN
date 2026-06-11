-- Migration V12: token personal para el conector MCP (Claude)
-- Cada perfil puede generar su token desde "Mi Perfil". El endpoint MCP
-- identifica al usuario por este token y aplica permisos según su rol.

ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS mcp_token TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_perfiles_mcp_token ON perfiles(mcp_token) WHERE mcp_token IS NOT NULL;
