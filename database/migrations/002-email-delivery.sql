ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS text_body TEXT;
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 0;
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS processing_token TEXT;
CREATE INDEX IF NOT EXISTS idx_email_delivery_queue ON email_outbox(status,priority DESC,next_attempt_at,created_at);
