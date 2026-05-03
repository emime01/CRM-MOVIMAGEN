-- Notificaciones internas del CRM
CREATE TABLE IF NOT EXISTS notificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  tipo text NOT NULL,         -- 'lead_sin_gestion' | 'orden_pendiente' | 'campana_proxima'
  titulo text NOT NULL,
  mensaje text,
  link text,
  leida boolean DEFAULT false,
  entity_id text,             -- lead_id or orden_id (for deduplication)
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notificaciones_user_leida
  ON notificaciones(user_id, leida, created_at DESC);
