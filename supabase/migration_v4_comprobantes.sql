-- Migration: comprobantes table
-- Run this in Supabase SQL editor

CREATE TABLE IF NOT EXISTS comprobantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reserva_id UUID REFERENCES reservas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('video', 'pdf')),
  storage_path TEXT,
  estado TEXT NOT NULL DEFAULT 'procesando' CHECK (estado IN ('procesando', 'listo', 'error')),
  error_msg TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comprobantes_reserva ON comprobantes(reserva_id);

ALTER TABLE comprobantes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read comprobantes" ON comprobantes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth insert comprobantes" ON comprobantes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update comprobantes" ON comprobantes FOR UPDATE TO authenticated USING (true);

-- Storage bucket for comprobantes (run via Supabase dashboard or Storage API)
-- INSERT INTO storage.buckets (id, name, public, file_size_limit)
-- VALUES ('comprobantes', 'comprobantes', true, 524288000)  -- 500MB
-- ON CONFLICT (id) DO NOTHING;
