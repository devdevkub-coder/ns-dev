import { NextResponse } from 'next/server'
import { AuthContextError, authContextErrorResponse, getCurrentAuthContext, requirePermission } from '@/lib/server/auth-context'
import { prisma } from '@/lib/server/prisma'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const context = await getCurrentAuthContext()
    requirePermission(context, 'system.settings.manage')

    // 1. Create line_notification_jobs
    await prisma.$executeRawUnsafe(`
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
    `)

    // 2. Create line_notification_attempts
    await prisma.$executeRawUnsafe(`
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
    `)

    // 3. Create line_targets
    await prisma.$executeRawUnsafe(`
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
    `)

    // 4. Create line_notification_rules
    await prisma.$executeRawUnsafe(`
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
    `)

    // 5. Create line_message_templates
    await prisma.$executeRawUnsafe(`
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
    `)

    // 6. Create line_command_permissions
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public.line_command_permissions (
        id bigserial PRIMARY KEY,
        target_id text NOT NULL,
        user_id text NULL,
        command text NOT NULL,
        is_allowed boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `)

    // 7. Create indexes & unique constraints
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS line_notification_jobs_status_retry_idx
        ON public.line_notification_jobs (status, next_retry_at);
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS line_notification_jobs_source_idx
        ON public.line_notification_jobs (source_type, source_id);
    `)
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS line_targets_one_default_idx
        ON public.line_targets (is_default)
        WHERE is_default = true;
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS line_notification_rules_active_priority_idx
        ON public.line_notification_rules (is_active, priority);
    `)
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS line_notification_jobs_uniq_pending_idx
        ON public.line_notification_jobs (source_type, source_id, target_id)
        WHERE status IN ('pending', 'processing');
    `)

    // 8. Create old logs table for compatibility if needed
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS public.weight_ticket_notification_logs (
        id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
        weight_ticket_id bigint NOT NULL REFERENCES public.weight_tickets(id) ON DELETE CASCADE,
        delivery_channel text NOT NULL DEFAULT 'line',
        target_id text,
        status text NOT NULL,
        pdf_storage_bucket text,
        pdf_storage_key text,
        pdf_url text,
        line_request_id text,
        custom_message text,
        error_message text,
        requested_by text,
        sent_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT weight_ticket_notification_logs_channel_check CHECK (delivery_channel IN ('line')),
        CONSTRAINT weight_ticket_notification_logs_status_check CHECK (status IN ('sent', 'failed'))
      );
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_weight_ticket_notification_logs_ticket
        ON public.weight_ticket_notification_logs (weight_ticket_id, created_at DESC);
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_weight_ticket_notification_logs_status
        ON public.weight_ticket_notification_logs (status, created_at DESC);
    `)

    // 9. Backfill logic
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'line_groups') THEN
          INSERT INTO public.line_targets (target_id, target_type, display_name, picture_url, branch_code, is_active, notify_wti, notify_wto, created_at, updated_at)
          SELECT group_id, 'group', name, picture_url, branch_code, is_active, notify_wti, notify_wto, updated_at, updated_at
          FROM public.line_groups
          ON CONFLICT (target_id) DO NOTHING;
        END IF;
      END $$;
    `)

    // 10. Storage Bucket Setup
    await prisma.$executeRawUnsafe(`
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES ('weight-ticket-pdfs', 'weight-ticket-pdfs', true, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
      ON CONFLICT (id) DO UPDATE
      SET public = EXCLUDED.public,
          file_size_limit = EXCLUDED.file_size_limit,
          allowed_mime_types = EXCLUDED.allowed_mime_types;
    `)

    return NextResponse.json({ ok: true, message: 'ฐานข้อมูลและ Storage Bucket สำหรับ LINE Control Center ได้รับการอัปเกรดสำเร็จเรียบร้อยแล้ว!' })
  } catch (caught) {
    if (caught instanceof AuthContextError) return authContextErrorResponse(caught)
    return NextResponse.json({ ok: false, error: caught instanceof Error ? caught.message : 'เกิดข้อผิดพลาดในการตั้งค่าฐานข้อมูล' })
  }
}
