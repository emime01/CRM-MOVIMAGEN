-- Migration V16: blindaje de seguridad (RLS real + hash de mcp_token + grants)
--
-- Antes de esta migración, casi todas las tablas tenían policies
-- USING(true) WITH CHECK(true) — RLS efectivamente desactivada. Y el
-- mcp_token estaba en plaintext. Esta migración:
--
--   1. Reemplaza las policies abiertas por policies scopeadas por rol /
--      vendedor_id.
--   2. Sustituye mcp_token (plain) por mcp_token_hash (sha256 hex). Los
--      tokens existentes quedan INVALIDADOS — cada usuario tiene que
--      regenerar el suyo desde Mi Perfil.
--   3. Aplica GRANTs explícitos (anticipado al cambio default de Supabase
--      de Octubre 2026).
--
-- El service_role bypassea RLS, por lo que todas las API routes
-- (createServerClient) siguen funcionando sin cambios.

-- ============================================================
-- 0. Extensión pgcrypto (idempotente)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- 1. Helpers para resolver identidad del usuario logueado
-- ============================================================
CREATE OR REPLACE FUNCTION public.current_perfil_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM perfiles WHERE user_id = auth.uid() LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.current_rol() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT rol FROM perfiles WHERE user_id = auth.uid() LIMIT 1 $$;

GRANT EXECUTE ON FUNCTION public.current_perfil_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_rol()       TO authenticated;

-- ============================================================
-- 2. Limpia policies USING(true) de los recursos sensibles
-- ============================================================
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'perfiles', 'leads', 'propuestas', 'propuesta_items',
        'ordenes_venta', 'orden_items', 'orden_historial',
        'reservas', 'reserva_items', 'clientes', 'agencias',
        'contactos', 'objetivos', 'cliente_objetivos', 'comisiones',
        'comisiones_agencia', 'pagos', 'evidencias', 'comprobantes',
        'notificaciones', 'google_tokens', 'email_suggestions',
        'tasks', 'comentarios_orden', 'soportes', 'registros',
        'gastos_tarjeta', 'canon_liquidaciones'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- ============================================================
-- 3. Policies nuevas — scopeadas por rol y vendedor_id
-- ============================================================

-- ── perfiles ────────────────────────────────────────────────
-- Cada usuario lee su propio perfil; gerente y administración ven todos.
-- mcp_token_hash queda inaccesible: hash, no se puede usar al leerlo.
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY perfiles_select ON perfiles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.current_rol() IN ('gerente_comercial', 'administracion'));

CREATE POLICY perfiles_update_self ON perfiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── notificaciones ──────────────────────────────────────────
-- Cada usuario ve y marca leídas SOLO sus propias notificaciones.
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY notif_select ON notificaciones FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY notif_update ON notificaciones FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── google_tokens y email_suggestions ───────────────────────
-- Solo service_role: ningún cliente authenticated puede leerlos.
ALTER TABLE google_tokens ENABLE ROW LEVEL SECURITY;
-- (sin policy → nadie con authenticated tiene acceso; service_role bypassa RLS)

ALTER TABLE email_suggestions ENABLE ROW LEVEL SECURITY;

-- ── leads ───────────────────────────────────────────────────
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY leads_rw ON leads FOR ALL TO authenticated
  USING (
    public.current_rol() IN ('asistente_ventas','gerente_comercial','administracion')
    OR vendedor_id = public.current_perfil_id()
  )
  WITH CHECK (
    public.current_rol() IN ('asistente_ventas','gerente_comercial','administracion')
    OR vendedor_id = public.current_perfil_id()
  );

-- ── propuestas ──────────────────────────────────────────────
ALTER TABLE propuestas ENABLE ROW LEVEL SECURITY;

CREATE POLICY propuestas_rw ON propuestas FOR ALL TO authenticated
  USING (
    public.current_rol() IN ('asistente_ventas','gerente_comercial','administracion')
    OR vendedor_id = public.current_perfil_id()
  )
  WITH CHECK (
    public.current_rol() IN ('asistente_ventas','gerente_comercial','administracion')
    OR vendedor_id = public.current_perfil_id()
  );

ALTER TABLE propuesta_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY propuesta_items_rw ON propuesta_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM propuestas p WHERE p.id = propuesta_items.propuesta_id))
  WITH CHECK (EXISTS (SELECT 1 FROM propuestas p WHERE p.id = propuesta_items.propuesta_id));

-- ── ordenes_venta ───────────────────────────────────────────
ALTER TABLE ordenes_venta ENABLE ROW LEVEL SECURITY;

CREATE POLICY ordenes_rw ON ordenes_venta FOR ALL TO authenticated
  USING (
    public.current_rol() IN ('asistente_ventas','gerente_comercial','administracion','operaciones','arte')
    OR vendedor_id = public.current_perfil_id()
  )
  WITH CHECK (
    public.current_rol() IN ('asistente_ventas','gerente_comercial','administracion','operaciones','arte')
    OR vendedor_id = public.current_perfil_id()
  );

ALTER TABLE orden_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY orden_items_rw ON orden_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM ordenes_venta o WHERE o.id = orden_items.orden_id))
  WITH CHECK (EXISTS (SELECT 1 FROM ordenes_venta o WHERE o.id = orden_items.orden_id));

ALTER TABLE orden_historial ENABLE ROW LEVEL SECURITY;
CREATE POLICY orden_historial_rw ON orden_historial FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM ordenes_venta o WHERE o.id = orden_historial.orden_id))
  WITH CHECK (EXISTS (SELECT 1 FROM ordenes_venta o WHERE o.id = orden_historial.orden_id));

-- ── reservas ────────────────────────────────────────────────
ALTER TABLE reservas ENABLE ROW LEVEL SECURITY;
CREATE POLICY reservas_rw ON reservas FOR ALL TO authenticated
  USING (
    public.current_rol() IN ('asistente_ventas','gerente_comercial','administracion','operaciones')
    OR vendedor_id = public.current_perfil_id()
  )
  WITH CHECK (
    public.current_rol() IN ('asistente_ventas','gerente_comercial','administracion','operaciones')
    OR vendedor_id = public.current_perfil_id()
  );

ALTER TABLE reserva_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY reserva_items_rw ON reserva_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM reservas r WHERE r.id = reserva_items.reserva_id))
  WITH CHECK (EXISTS (SELECT 1 FROM reservas r WHERE r.id = reserva_items.reserva_id));

-- ── clientes y agencias ─────────────────────────────────────
-- Todos los roles comerciales leen. Vendedor solo modifica los suyos.
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
CREATE POLICY clientes_select ON clientes FOR SELECT TO authenticated USING (true);
CREATE POLICY clientes_write ON clientes FOR INSERT TO authenticated
  WITH CHECK (
    public.current_rol() IN ('asistente_ventas','gerente_comercial','administracion')
    OR vendedor_id = public.current_perfil_id()
  );
CREATE POLICY clientes_update ON clientes FOR UPDATE TO authenticated
  USING (
    public.current_rol() IN ('asistente_ventas','gerente_comercial','administracion')
    OR vendedor_id = public.current_perfil_id()
  );
CREATE POLICY clientes_delete ON clientes FOR DELETE TO authenticated
  USING (public.current_rol() IN ('gerente_comercial','administracion'));

ALTER TABLE agencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY agencias_select ON agencias FOR SELECT TO authenticated USING (true);
CREATE POLICY agencias_write ON agencias FOR INSERT TO authenticated
  WITH CHECK (public.current_rol() IN ('asistente_ventas','gerente_comercial','administracion'));
CREATE POLICY agencias_update ON agencias FOR UPDATE TO authenticated
  USING (public.current_rol() IN ('asistente_ventas','gerente_comercial','administracion'));
CREATE POLICY agencias_delete ON agencias FOR DELETE TO authenticated
  USING (public.current_rol() IN ('gerente_comercial','administracion'));

ALTER TABLE contactos ENABLE ROW LEVEL SECURITY;
CREATE POLICY contactos_rw ON contactos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── objetivos ───────────────────────────────────────────────
ALTER TABLE objetivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY objetivos_rw ON objetivos FOR ALL TO authenticated
  USING (
    public.current_rol() IN ('asistente_ventas','gerente_comercial','administracion')
    OR vendedor_id = public.current_perfil_id()
  )
  WITH CHECK (
    public.current_rol() IN ('asistente_ventas','gerente_comercial','administracion')
    OR vendedor_id = public.current_perfil_id()
  );

ALTER TABLE cliente_objetivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY cliente_objetivos_rw ON cliente_objetivos FOR ALL TO authenticated
  USING (
    public.current_rol() IN ('asistente_ventas','gerente_comercial','administracion')
    OR vendedor_id = public.current_perfil_id()
  )
  WITH CHECK (
    public.current_rol() IN ('asistente_ventas','gerente_comercial','administracion')
    OR vendedor_id = public.current_perfil_id()
  );

-- ── comisiones y financiero ─────────────────────────────────
ALTER TABLE comisiones ENABLE ROW LEVEL SECURITY;
CREATE POLICY comisiones_select ON comisiones FOR SELECT TO authenticated
  USING (
    public.current_rol() IN ('gerente_comercial','administracion')
    OR vendedor_id = public.current_perfil_id()
  );

ALTER TABLE comisiones_agencia ENABLE ROW LEVEL SECURITY;
CREATE POLICY comisiones_agencia_select ON comisiones_agencia FOR SELECT TO authenticated
  USING (public.current_rol() IN ('gerente_comercial','administracion'));

ALTER TABLE pagos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pagos_select ON pagos FOR SELECT TO authenticated
  USING (public.current_rol() IN ('gerente_comercial','administracion'));

ALTER TABLE evidencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY evidencias_select ON evidencias FOR SELECT TO authenticated USING (true);

ALTER TABLE comprobantes ENABLE ROW LEVEL SECURITY;
CREATE POLICY comprobantes_select ON comprobantes FOR SELECT TO authenticated USING (true);

-- ── tasks ────────────────────────────────────────────────────
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tasks_select ON tasks FOR SELECT TO authenticated
  USING (
    public.current_rol() IN ('asistente_ventas','gerente_comercial','administracion')
    OR public.current_rol() = asignado_a_rol
  );
CREATE POLICY tasks_update ON tasks FOR UPDATE TO authenticated
  USING (
    public.current_rol() IN ('administracion','gerente_comercial')
    OR public.current_rol() = asignado_a_rol
  );

-- ── comentarios_orden ───────────────────────────────────────
ALTER TABLE comentarios_orden ENABLE ROW LEVEL SECURITY;
CREATE POLICY comentarios_rw ON comentarios_orden FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ── soportes, registros, gastos, canon — solo admin/operaciones ─
ALTER TABLE soportes ENABLE ROW LEVEL SECURITY;
CREATE POLICY soportes_select ON soportes FOR SELECT TO authenticated USING (true);
CREATE POLICY soportes_write ON soportes FOR INSERT TO authenticated
  WITH CHECK (public.current_rol() IN ('asistente_ventas','administracion'));
CREATE POLICY soportes_update ON soportes FOR UPDATE TO authenticated
  USING (public.current_rol() IN ('asistente_ventas','administracion'));

ALTER TABLE registros ENABLE ROW LEVEL SECURITY;
CREATE POLICY registros_rw ON registros FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE gastos_tarjeta ENABLE ROW LEVEL SECURITY;
CREATE POLICY gastos_select ON gastos_tarjeta FOR SELECT TO authenticated
  USING (public.current_rol() IN ('administracion','gerente_comercial'));

ALTER TABLE canon_liquidaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY canon_select ON canon_liquidaciones FOR SELECT TO authenticated
  USING (public.current_rol() IN ('administracion','gerente_comercial'));

-- ============================================================
-- 4. mcp_token → mcp_token_hash (hash sha256 hex)
-- ============================================================
-- Los tokens existentes quedan invalidados; cada usuario debe regenerar
-- el suyo desde Mi Perfil. La columna vieja mcp_token se borra para que
-- nadie pueda leer el plain (aún via service_role).
ALTER TABLE perfiles ADD COLUMN IF NOT EXISTS mcp_token_hash TEXT UNIQUE;
ALTER TABLE perfiles DROP COLUMN IF EXISTS mcp_token;

CREATE INDEX IF NOT EXISTS idx_perfiles_mcp_token_hash
  ON perfiles(mcp_token_hash) WHERE mcp_token_hash IS NOT NULL;

-- ============================================================
-- 5. GRANTs explícitos (Supabase Oct-2026 deja sin acceso por default)
-- ============================================================
DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE          ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- google_tokens y email_suggestions: revoco al authenticated (RLS ya bloquea,
-- pero por defensa en profundidad sacamos el privilegio).
REVOKE ALL ON public.google_tokens     FROM authenticated;
REVOKE ALL ON public.email_suggestions FROM authenticated;
