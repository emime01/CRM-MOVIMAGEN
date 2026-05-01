-- Google OAuth tokens por usuario (uno por perfil)
CREATE TABLE IF NOT EXISTS google_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id uuid NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  gmail_email text NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  token_expiry timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(perfil_id)
);

-- Sugerencias de acción generadas por IA a partir de emails
CREATE TABLE IF NOT EXISTS email_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id uuid NOT NULL REFERENCES perfiles(id) ON DELETE CASCADE,
  gmail_message_id text NOT NULL,
  from_email text,
  from_name text,
  subject text,
  snippet text,
  suggestion text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | accepted | dismissed
  created_at timestamptz DEFAULT now(),
  UNIQUE(perfil_id, gmail_message_id)
);

-- RLS
ALTER TABLE google_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_suggestions ENABLE ROW LEVEL SECURITY;

-- Solo el service role accede (los endpoints usan service role key)
CREATE POLICY "service_role_google_tokens" ON google_tokens
  USING (true) WITH CHECK (true);
CREATE POLICY "service_role_email_suggestions" ON email_suggestions
  USING (true) WITH CHECK (true);
