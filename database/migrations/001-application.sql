ALTER TABLE complaints ADD COLUMN IF NOT EXISTS record_origin TEXT NOT NULL DEFAULT 'historical';
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS is_draft BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS public_last_action TEXT;
ALTER TABLE complaints ADD CONSTRAINT valid_current_stage CHECK (current_stage BETWEEN 1 AND 6);
CREATE TABLE IF NOT EXISTS app_users (
 id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT NOT NULL,
 role TEXT NOT NULL CHECK (role IN ('complainant','so','da','director','chairman','admin')),
 designation TEXT NOT NULL, bureau_id TEXT REFERENCES bureaus(bureau_id), region_id TEXT REFERENCES regions(region_id),
 officer_id TEXT, complainant_id TEXT REFERENCES complainants(complainant_id), verified BOOLEAN NOT NULL DEFAULT false,
 active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES app_users(id),expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS auth_tokens (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES app_users(id),purpose TEXT NOT NULL,expires_at TIMESTAMPTZ NOT NULL,used_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY,actor_id TEXT,event_type TEXT NOT NULL,entity_id TEXT,details JSONB NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS app_notifications (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES app_users(id),complaint_id TEXT REFERENCES complaints(complaint_id),event_type TEXT NOT NULL,title TEXT NOT NULL,message TEXT NOT NULL,priority TEXT NOT NULL DEFAULT 'info',read_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS email_outbox (id TEXT PRIMARY KEY,idempotency_key TEXT NOT NULL UNIQUE,user_id TEXT REFERENCES app_users(id),recipient TEXT NOT NULL,subject TEXT NOT NULL,html TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),last_error TEXT,provider_message_id TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),sent_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS email_delivery_attempts (id TEXT PRIMARY KEY,email_id TEXT NOT NULL REFERENCES email_outbox(id),attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),status TEXT NOT NULL,error TEXT);
CREATE TABLE IF NOT EXISTS system_settings (key TEXT PRIMARY KEY,value JSONB NOT NULL,updated_by TEXT,updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS import_jobs (id TEXT PRIMARY KEY,mode TEXT NOT NULL,status TEXT NOT NULL,progress INTEGER NOT NULL DEFAULT 0,details JSONB NOT NULL DEFAULT '{}',started_at TIMESTAMPTZ NOT NULL DEFAULT now(),completed_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS scheduled_jobs (job_key TEXT PRIMARY KEY,last_run_at TIMESTAMPTZ,status TEXT,details JSONB NOT NULL DEFAULT '{}');
CREATE TABLE IF NOT EXISTS app_duplicate_candidates (id TEXT PRIMARY KEY,case_id_a TEXT NOT NULL REFERENCES complaints(complaint_id),case_id_b TEXT NOT NULL REFERENCES complaints(complaint_id),label TEXT NOT NULL,confidence DOUBLE PRECISION NOT NULL,features JSONB NOT NULL,reasons JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'pending',reviewer_id TEXT,reason TEXT,reviewed_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(case_id_a,case_id_b));
CREATE TABLE IF NOT EXISTS app_evidence (id TEXT PRIMARY KEY,complaint_id TEXT NOT NULL REFERENCES complaints(complaint_id),uploaded_by TEXT NOT NULL REFERENCES app_users(id),name TEXT NOT NULL,mime TEXT NOT NULL,size_bytes INTEGER NOT NULL,sha256 TEXT NOT NULL,storage_path TEXT NOT NULL,description TEXT,visibility TEXT NOT NULL DEFAULT 'public',created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS saved_filters (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES app_users(id),name TEXT NOT NULL,filters JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS replay_sessions (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES app_users(id),status TEXT NOT NULL DEFAULT 'stopped',speed INTEGER NOT NULL DEFAULT 1,cursor_index INTEGER NOT NULL DEFAULT 0,filters JSONB NOT NULL DEFAULT '{}',updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_complaints_scope ON complaints(current_bureau_id,region_id,current_stage);
CREATE INDEX IF NOT EXISTS idx_complaints_owner ON complaints(complainant_id,submitted_at_utc DESC);
CREATE INDEX IF NOT EXISTS idx_complaints_officer_queue ON complaints(dealing_assistant_id,current_stage,sla_due_at_utc);
CREATE INDEX IF NOT EXISTS idx_app_notifications_recipient ON app_notifications(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON email_outbox(status,next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_app_duplicate_pending ON app_duplicate_candidates(status,created_at DESC);
CREATE OR REPLACE FUNCTION reject_history_changes() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Workflow history is append-only'; END $$;
DROP TRIGGER IF EXISTS workflow_append_only ON workflow_events;
CREATE TRIGGER workflow_append_only BEFORE UPDATE OR DELETE ON workflow_events FOR EACH ROW EXECUTE FUNCTION reject_history_changes();
