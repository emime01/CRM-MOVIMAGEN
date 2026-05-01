-- Tokens OAuth de Google por usuario
CREATE TABLE IF NOT EXISTS google_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL UNIQUE,
  gmail_email text NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Sugerencias de acción generadas por IA a partir de emails
CREATE TABLE IF NOT EXISTS email_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  gmail_message_id text NOT NULL,
  gmail_thread_id text,
  from_email text,
  from_name text,
  subject text,
  snippet text,
  suggestion text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, gmail_message_id)
);

-- RLS (acceso solo por service role desde los API routes)
ALTER TABLE google_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_only_google_tokens" ON google_tokens USING (true) WITH CHECK (true);
CREATE POLICY "service_only_email_suggestions" ON email_suggestions USING (true) WITH CHECK (true);
