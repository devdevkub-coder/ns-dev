-- LINE Notification Control Center Ultimate Plan Schema Migration

-- 1. Create line_notification_jobs table
CREATE TABLE IF NOT EXISTS public.line_notification_jobs (
  id bigserial PRIMARY KEY,
  source_type text NOT NULL DEFAULT 'weight_ticket',
  source_id bigint NOT NULL,
  document_no text NOT NULL,
  document_type text NOT NULL,
  target_id text NOT NULL,
  target_type text NOT NULL DEFAULT 'unknown',
  template_id bigint NULL,
  custom_message text NULL,
  status text NOT NULL DEFAULT 'pending',
  priority integer NOT NULL DEFAULT 100,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz NULL,
  locked_by text NULL,
  retry_key uuid NOT NULL DEFAULT gen_random_uuid(),
  pdf_storage_bucket text NULL,
  pdf_storage_key text NULL,
  pdf_url text NULL,
  line_request_id text NULL,
  accepted_request_id text NULL,
  last_error_code text NULL,
  last_error_message text NULL,
  requested_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS line_notification_jobs_status_retry_idx
  ON public.line_notification_jobs (status, next_retry_at);

CREATE INDEX IF NOT EXISTS line_notification_jobs_source_idx
  ON public.line_notification_jobs (source_type, source_id);

-- 2. Create line_notification_attempts table
CREATE TABLE IF NOT EXISTS public.line_notification_attempts (
  id bigserial PRIMARY KEY,
  job_id bigint NOT NULL REFERENCES public.line_notification_jobs(id) ON DELETE CASCADE,
  attempt_no integer NOT NULL,
  status text NOT NULL,
  http_status integer NULL,
  line_request_id text NULL,
  accepted_request_id text NULL,
  error_code text NULL,
  error_message text NULL,
  duration_ms integer NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Create line_targets table
CREATE TABLE IF NOT EXISTS public.line_targets (
  id bigserial PRIMARY KEY,
  target_id text NOT NULL UNIQUE,
  target_type text NOT NULL CHECK (target_type IN ('group', 'room', 'user')),
  display_name text NOT NULL,
  picture_url text NULL,
  branch_code text NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  notify_wti boolean NOT NULL DEFAULT true,
  notify_wto boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NULL,
  last_event_type text NULL,
  registered_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS line_targets_one_default_idx
  ON public.line_targets (is_default)
  WHERE is_default = true;

-- Backfill from existing line_groups to line_targets if line_groups table exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'line_groups') THEN
    INSERT INTO public.line_targets (target_id, target_type, display_name, picture_url, branch_code, is_active, notify_wti, notify_wto, created_at, updated_at)
    SELECT group_id, 'group', name, picture_url, branch_code, is_active, notify_wti, notify_wto, updated_at, updated_at
    FROM public.line_groups
    ON CONFLICT (target_id) DO NOTHING;
  END IF;
END $$;

-- 4. Create line_notification_rules table
CREATE TABLE IF NOT EXISTS public.line_notification_rules (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  description text NULL,
  priority integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  target_id text NOT NULL,
  template_id bigint NULL,
  stop_after_match boolean NOT NULL DEFAULT false,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by text NULL,
  updated_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS line_notification_rules_active_priority_idx
  ON public.line_notification_rules (is_active, priority);

-- 5. Create line_message_templates table
CREATE TABLE IF NOT EXISTS public.line_message_templates (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  template_type text NOT NULL DEFAULT 'weight_ticket',
  is_default_wti boolean NOT NULL DEFAULT false,
  is_default_wto boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL,
  created_by text NULL,
  updated_by text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Create line_command_permissions table
CREATE TABLE IF NOT EXISTS public.line_command_permissions (
  id bigserial PRIMARY KEY,
  target_id text NOT NULL,
  user_id text NULL,
  command text NOT NULL,
  is_allowed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Create partial unique index to guarantee atomic idempotency and prevent duplicate queue items
CREATE UNIQUE INDEX IF NOT EXISTS line_notification_jobs_uniq_pending_idx
  ON public.line_notification_jobs (source_type, source_id, target_id)
  WHERE status IN ('pending', 'processing');
