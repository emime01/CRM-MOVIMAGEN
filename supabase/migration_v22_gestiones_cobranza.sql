-- ============================================================
-- Migration v22 — Gestiones de cobranza
-- ============================================================
--
-- Registra las acciones de cobranza sobre una OIC facturada sin cobrar
-- (llamada, email, promesa de pago, etc.) para que administración pueda
-- hacer seguimiento activo de deudores. Idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS gestiones_cobranza (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orden_id        UUID NOT NULL REFERENCES ordenes_venta(id) ON DELETE CASCADE,
  tipo            TEXT NOT NULL CHECK (tipo IN ('llamada','email','whatsapp','visita','promesa_pago','otro')),
  nota            TEXT,
  proxima_accion  DATE,
  registrado_por  UUID REFERENCES perfiles(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gestiones_cobranza_orden
  ON gestiones_cobranza(orden_id, created_at DESC);

-- RLS — la app usa service_role (la bypassa). Lectura para roles que ven
-- cobranza; la escritura se controla en el endpoint (admin/gerencia).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='gestiones_cobranza'
  ) THEN
    ALTER TABLE gestiones_cobranza ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname='public' AND tablename='gestiones_cobranza' AND policyname='gestiones_cobranza_select'
    ) THEN
      CREATE POLICY gestiones_cobranza_select ON gestiones_cobranza FOR SELECT TO authenticated
        USING (public.current_rol() IN ('administracion','gerente_comercial'));
    END IF;
  END IF;
END $$;
