# LINE Notification Control Center Ultimate Plan

เป้าหมายของแผนนี้คือยกระบบจาก "ส่ง LINE หลังสร้างใบชั่ง" ให้เป็น "LINE Notification Control Center" ที่ตั้งค่าได้จากเว็บเราเองเกือบทั้งหมด ตรวจสอบได้ว่าส่งจริงหรือไม่ ส่งผิดกลุ่มยาก กู้คืนเมื่อส่งพังได้ และรองรับกฎธุรกิจระดับละเอียดในอนาคต

เอกสารนี้เขียนให้ AGY ใช้เป็น implementation plan โดยตรง

## ขอบเขตระบบ

- Active app: `apps/next`
- หน้าหลัก: `/admin/line-settings`
- Flow เอกสาร: `/daily/weight-ticket-list`, `/daily/weight-tickets`
- LINE webhook: `/api/line/webhook`
- ตัวส่งหลักปัจจุบัน: `apps/next/src/lib/server/weight-ticket-line-notification.ts`
- Database: Supabase Postgres
- Storage: Supabase Storage bucket `weight-ticket-pdfs`
- Target dev URL: `https://ns-dev.devkub.com`

## ปัญหาปัจจุบันที่ต้องแก้ก่อนขยายระบบ

1. หน้า settings ส่งข้อความทดสอบได้ แต่การส่งใบชั่งจริงอาจไม่เข้า LINE
   - ปุ่มทดสอบไม่ได้ผ่าน flow สร้าง PDF จริงเสมอ
   - ปุ่มแชร์และ auto-send ต้องสร้าง PDF, upload storage, resolve target, push LINE

2. ระบบเคยตอบว่า `SENT` แม้รอบนั้นไม่ได้ push จริง
   - กรณี duplicate protection skip เอกสารที่เคยส่งแล้ว แต่ UI ยังบอกว่าส่งแล้ว
   - ต้องแยกสถานะ `sent`, `skipped`, `failed`, `already_sent`, `no_target`

3. Target ID เสี่ยงผิดชนิด
   - `U...` คือ userId
   - `C...` คือ groupId
   - `R...` คือ roomId
   - ถ้าลูกค้าต้องการส่งเข้ากลุ่ม แต่ใส่ `U...` ข้อความจะไปหา user ไม่ใช่กลุ่ม

4. `line_groups` อาจว่าง
   - ต้องมี flow register กลุ่มจาก webhook หรือคำสั่ง `/register`
   - หน้า settings ต้องบอกชัดว่าตอนนี้ bot เห็น group ไหนบ้าง

5. Auto-send และ manual-send ต้องมี behavior ต่างกัน
   - Auto-send: กันส่งซ้ำด้วย `force = false`
   - Manual share: ผู้ใช้ตั้งใจกดเอง ต้องส่งซ้ำได้ด้วย `force = true`

## Vision: 7 แท็บใน `/admin/line-settings`

1. Overview & Health
2. Channel Credentials
3. Targets / Groups
4. Routing Rules
5. Message Templates
6. Outbox / Retry Queue
7. Analytics / Audit Log

## Phase 1: Reliability Foundation

ทำให้ระบบส่ง LINE เชื่อถือได้ก่อนเพิ่มฟีเจอร์ fancy

### 1.1 Outbox / Job Queue

เพิ่มตาราง `line_notification_jobs`

```sql
create table if not exists public.line_notification_jobs (
  id bigserial primary key,
  source_type text not null default 'weight_ticket',
  source_id bigint not null,
  document_no text not null,
  document_type text not null,
  target_id text not null,
  target_type text not null default 'unknown',
  template_id bigint null,
  custom_message text null,
  status text not null default 'pending',
  priority integer not null default 100,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  next_retry_at timestamptz not null default now(),
  locked_at timestamptz null,
  locked_by text null,
  retry_key uuid not null default gen_random_uuid(),
  pdf_storage_bucket text null,
  pdf_storage_key text null,
  pdf_url text null,
  line_request_id text null,
  accepted_request_id text null,
  last_error_code text null,
  last_error_message text null,
  requested_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz null
);

create index if not exists line_notification_jobs_status_retry_idx
  on public.line_notification_jobs (status, next_retry_at);

create index if not exists line_notification_jobs_source_idx
  on public.line_notification_jobs (source_type, source_id);
```

เพิ่มตาราง `line_notification_attempts`

```sql
create table if not exists public.line_notification_attempts (
  id bigserial primary key,
  job_id bigint not null references public.line_notification_jobs(id) on delete cascade,
  attempt_no integer not null,
  status text not null,
  http_status integer null,
  line_request_id text null,
  accepted_request_id text null,
  error_code text null,
  error_message text null,
  duration_ms integer null,
  created_at timestamptz not null default now()
);
```

Behavior:

- เมื่อสร้าง/แก้ไขใบชั่ง ให้ enqueue job แทนการ push ทันที
- Manual share จะ enqueue job แบบ `force = true` หรือ process ทันทีโดยไม่ skip duplicate
- Worker จะ process job แล้ว update attempt/log
- ถ้า LINE timeout หรือ 5xx ให้ retry
- ถ้า LINE 4xx เช่น target invalid, token invalid, bot blocked ให้ failed ถาวร
- ใช้ `X-Line-Retry-Key` ตอน retry เพื่อกัน duplicate execution
- ถ้า LINE ตอบ 409 จาก retry key ให้ถือว่า accepted แล้ว โดยบันทึก `accepted_request_id`

ไฟล์ที่ต้องแก้:

- `apps/next/src/lib/server/weight-ticket-line-notification.ts`
- เพิ่ม `apps/next/src/lib/server/line-notification-jobs.ts`
- เพิ่ม `apps/next/src/app/api/admin/line-notifications/jobs/process/route.ts`
- `apps/next/src/app/api/daily/weight-tickets/route.ts`
- `apps/next/src/app/api/daily/weight-tickets/[id]/route.ts`
- `apps/next/src/app/api/daily/weight-tickets/[id]/notify-line/route.ts`

### 1.2 Send Result ที่ตรงความจริง

`notifyWeightTicketLine` หรือ job processor ต้องคืนสถานะ:

- `SENT`: มี target อย่างน้อย 1 ตัวที่ LINE API accepted จริง
- `PARTIAL_SENT`: บาง target สำเร็จ บาง target failed
- `ALREADY_SENT`: auto-send skip เพราะเคยส่งแล้ว
- `NO_TARGET`: ไม่พบ target ที่ส่งได้
- `PDF_FAILED`: สร้าง PDF หรือ upload storage ไม่สำเร็จ
- `LINE_FAILED`: LINE Push API ไม่สำเร็จ
- `CONFIG_INVALID`: token, secret, bucket, appUrl ไม่พร้อม

ห้าม return success ถ้าไม่มี `line_request_id` หรือ accepted request id จาก LINE

### 1.3 PDF Reliability

ตรวจให้ชัวร์ว่า deploy อ่าน font ได้

Required file:

- `apps/next/public/fonts/NotoSansThai-Regular.ttf`

PDF generator ควรหา font ตามลำดับนี้:

1. `process.cwd()/public/fonts/NotoSansThai-Regular.ttf`
2. `process.cwd()/src/assets/fonts/NotoSansThai-Regular.ttf`
3. `process.cwd()/apps/next/public/fonts/NotoSansThai-Regular.ttf`
4. `process.cwd()/apps/next/src/assets/fonts/NotoSansThai-Regular.ttf`

ถ้าไม่พบ ให้ error message บอก path ที่ลองทั้งหมด

## Phase 2: Target Manager ขั้นสุด

แทน `line_groups` ด้วย concept กลางชื่อ `line_targets`

### 2.1 Database

```sql
create table if not exists public.line_targets (
  id bigserial primary key,
  target_id text not null unique,
  target_type text not null check (target_type in ('group', 'room', 'user')),
  display_name text not null,
  picture_url text null,
  branch_code text null,
  is_default boolean not null default false,
  is_active boolean not null default true,
  notify_wti boolean not null default true,
  notify_wto boolean not null default true,
  last_seen_at timestamptz null,
  last_event_type text null,
  registered_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists line_targets_one_default_idx
  on public.line_targets (is_default)
  where is_default = true;
```

Backfill:

- migrate existing `line_groups` into `line_targets`
- map `group_id` to `target_id`
- set `target_type = 'group'`

### 2.2 Webhook Registration

ใน `apps/next/src/app/api/line/webhook/route.ts`

รองรับ event:

- `join`: bot ถูกเชิญเข้ากลุ่ม/room
- `message`: ใช้จับ `source.groupId`, `source.roomId`, `source.userId`
- `leave`: mark inactive
- `memberJoined`: optional audit

Command:

- `/register`
- `/register สาขา=สมุทรสาคร`
- `/register name=NS PRODUCTION branch=02`

เมื่อมี event:

- upsert `line_targets`
- update `last_seen_at`
- ถ้า target เป็น group และยังไม่มีชื่อ ให้เรียก LINE profile/group summary API ถ้าทำได้
- ถ้าเรียกไม่ได้ ให้ใช้ชื่อชั่วคราว เช่น `LINE Group C...abcd`

### 2.3 UI Target Manager

ใน `/admin/line-settings` เพิ่มแท็บ Targets / Groups

Columns:

- Target name
- Type: group / room / user
- Target ID masked แต่ copy full ได้ถ้ามี permission
- Branch
- WTI toggle
- WTO toggle
- Active toggle
- Default badge
- Last seen
- Last test result
- Actions: Test send, Set default, Copy ID, Disable, Delete

Validation:

- ถ้า user กรอก target manual:
  - `U...` แสดง warning ว่าเป็น user ไม่ใช่ group
  - `C...` แสดงว่าเป็น group
  - `R...` แสดงว่าเป็น room
  - อื่น ๆ block save

## Phase 3: Routing Rule Engine

ให้ตั้งกฎส่งได้ละเอียดระดับธุรกิจ

### 3.1 Database

```sql
create table if not exists public.line_notification_rules (
  id bigserial primary key,
  name text not null,
  description text null,
  priority integer not null default 100,
  is_active boolean not null default true,
  target_id text not null,
  template_id bigint null,
  stop_after_match boolean not null default false,
  conditions jsonb not null default '{}'::jsonb,
  created_by text null,
  updated_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists line_notification_rules_active_priority_idx
  on public.line_notification_rules (is_active, priority);
```

ตัวอย่าง `conditions`

```json
{
  "documentTypes": ["WTI"],
  "branchCodes": ["02"],
  "warehouseIds": ["warehouse-id"],
  "productIds": ["product-id"],
  "partyIds": ["supplier-id"],
  "minNetWeight": 5000,
  "maxNetWeight": null,
  "minImpurityWeight": 50,
  "requiresImages": true,
  "requiresScalePhoto": true,
  "timeWindows": [
    { "days": ["mon", "tue", "wed", "thu", "fri"], "from": "08:00", "to": "18:00" }
  ]
}
```

### 3.2 Resolver

เพิ่ม service:

- `apps/next/src/lib/server/line-notification-routing.ts`

Functions:

- `resolveLineTargetsForWeightTicket(ticket)`
- `matchesLineNotificationRule(ticket, rule)`
- `dedupeTargets(targets)`
- `explainRoutingDecision(ticket)`

Resolver result ต้องบอกเหตุผลได้:

```ts
type RoutingDecision = {
  targetId: string
  targetType: 'group' | 'room' | 'user'
  ruleId: string | null
  ruleName: string | null
  templateId: string | null
  reason: string
}
```

หน้า UI ควรมีปุ่ม "ทดลองกฎกับเอกสารจริง" โดยเลือกเลขเอกสาร แล้วแสดงว่าจะส่งไปกลุ่มไหน เพราะกฎอะไร

## Phase 4: Template Builder ขั้นสุด

### 4.1 Database

```sql
create table if not exists public.line_message_templates (
  id bigserial primary key,
  name text not null,
  template_type text not null default 'weight_ticket',
  is_default_wti boolean not null default false,
  is_default_wto boolean not null default false,
  is_active boolean not null default true,
  config jsonb not null,
  created_by text null,
  updated_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

ตัวอย่าง `config`

```json
{
  "layout": "flex_card_pdf",
  "title": "{{documentTypeLabel}} {{documentNo}}",
  "subtitle": "{{partyName}} · {{netWeight}} กก.",
  "theme": {
    "headerColorWti": "#047857",
    "headerColorWto": "#1d4ed8"
  },
  "fields": [
    { "key": "partyName", "label": "ผู้ขาย/ลูกค้า", "enabled": true },
    { "key": "branchName", "label": "สาขา", "enabled": true },
    { "key": "warehouseName", "label": "โกดัง", "enabled": true },
    { "key": "grossWeight", "label": "น้ำหนักรวม", "enabled": true },
    { "key": "containerDeductionWeight", "label": "หักภาชนะ", "enabled": true },
    { "key": "deductionWeight", "label": "หักสิ่งเจือปน", "enabled": true },
    { "key": "netWeight", "label": "น้ำหนักสุทธิ", "enabled": true },
    { "key": "enteredBy", "label": "ผู้บันทึก", "enabled": true }
  ],
  "buttons": {
    "pdf": true,
    "detail": true
  }
}
```

### 4.2 UI

เพิ่มแท็บ Message Templates

Features:

- เลือก template
- duplicate template
- preview จากเอกสารจริง
- drag/drop field order
- เปิด/ปิด field
- ตั้งสี WTI/WTO
- ตั้งปุ่ม PDF/detail
- validate Flex JSON ก่อน save

Implementation:

- ทำ renderer `buildFlexMessageFromTemplate(ticket, template, links)`
- ทำ preview API `/api/admin/line-settings/templates/preview`
- ทำ validate API `/api/admin/line-settings/templates/validate`

## Phase 5: Bot Commands และ Interactive Workflow

ให้ผู้ใช้ทำงานจาก LINE ได้

### 5.1 Commands

รองรับ:

- `/help`
- `/register`
- `/latest WTI`
- `/latest WTO`
- `/pdf WTI012606-0022`
- `/status WTI012606-0022`
- `/retry WTI012606-0022`
- `/today`
- `/summary 2026-06-24`
- `/settings`

### 5.2 Permission

เพิ่มตาราง:

```sql
create table if not exists public.line_command_permissions (
  id bigserial primary key,
  target_id text not null,
  user_id text null,
  command text not null,
  is_allowed boolean not null default true,
  created_at timestamptz not null default now()
);
```

Default:

- group command พื้นฐาน `/help`, `/register` ใช้ได้
- command sensitive เช่น `/retry`, `/settings` ต้อง allowlist

### 5.3 Quick Reply และ Postback

เมื่อ bot ส่ง card สามารถมีปุ่ม:

- เปิด PDF
- เปิดในระบบ
- ส่งซ้ำ
- ดูสถานะ
- ดูรายการวันนี้

LINE quick reply รองรับใน chat/group/room ที่ bot อยู่ และรองรับได้สูงสุด 13 ปุ่มต่อข้อความ

## Phase 6: Analytics & Monitoring

### 6.1 Metrics

หน้า Analytics แสดง:

- ส่งทั้งหมดวันนี้
- success rate
- failed count
- retry pending
- average PDF generation time
- average LINE API latency
- top target groups
- top error reasons
- top document types
- target ที่ไม่ได้ active นานเกิน X วัน

### 6.2 APIs

เพิ่ม:

- `GET /api/admin/line-settings/analytics/summary`
- `GET /api/admin/line-settings/analytics/errors`
- `GET /api/admin/line-settings/analytics/targets`
- `GET /api/admin/line-settings/jobs`
- `POST /api/admin/line-settings/jobs/[id]/retry`
- `POST /api/admin/line-settings/jobs/[id]/cancel`

### 6.3 UI

แท็บ Analytics / Audit Log:

- filter วันที่
- filter WTI/WTO
- filter target
- filter status
- ปุ่มเปิด PDF
- ปุ่ม retry
- ปุ่ม copy error
- ปุ่ม export CSV

## Phase 7: Security & Governance

### 7.1 Secrets

Rules:

- ไม่ส่ง token/secret เต็มไป frontend
- หลัง save ให้แสดง masked เท่านั้น
- ถ้าส่ง masked กลับมา ห้าม overwrite secret เดิม
- audit log ทุกครั้งที่แก้ credential

### 7.2 Permissions

เพิ่ม permission:

- `line.settings.view`
- `line.settings.manage_credentials`
- `line.targets.manage`
- `line.rules.manage`
- `line.templates.manage`
- `line.jobs.retry`
- `line.analytics.view`

### 7.3 Audit

บันทึก:

- ใครแก้ token
- ใครเปลี่ยน target default
- ใครเปลี่ยน routing rule
- ใครกด retry
- ใครส่ง manual share

## UI Layout ที่แนะนำ

หน้า `/admin/line-settings`

### Header

- Environment badge: DEV / UAT / PROD
- App URL
- Webhook URL
- Copy webhook URL
- Last webhook received
- Last successful push
- Health status

### Tab 1: Overview & Health

- Credential status
- Webhook status
- Storage bucket status
- PDF font status
- Default target status
- Pending jobs
- Failed jobs
- Quick actions: test token, test webhook, test PDF, test send

### Tab 2: Channel Credentials

- Channel ID
- Channel access token masked
- Channel secret masked
- Buttons:
  - Test token
  - Test webhook signature
  - Rotate token note

### Tab 3: Targets / Groups

- Table targets
- Register instruction wizard
- Manual target input with type detection
- Test send per target
- Set default target

### Tab 4: Routing Rules

- Rule list
- Rule builder
- Rule simulator
- Priority ordering

### Tab 5: Message Templates

- Template list
- Template editor
- Live LINE preview
- Validate Flex JSON

### Tab 6: Outbox / Retry Queue

- Job list
- Status filter
- Retry selected
- Cancel selected
- Open PDF
- View attempts

### Tab 7: Analytics / Audit

- Metrics cards
- Charts
- Error table
- Audit log

## API Design Summary

```text
GET    /api/admin/line-settings
POST   /api/admin/line-settings

GET    /api/admin/line-targets
POST   /api/admin/line-targets
PATCH  /api/admin/line-targets/[id]
POST   /api/admin/line-targets/[id]/test
POST   /api/admin/line-targets/[id]/set-default

GET    /api/admin/line-rules
POST   /api/admin/line-rules
PATCH  /api/admin/line-rules/[id]
DELETE /api/admin/line-rules/[id]
POST   /api/admin/line-rules/simulate

GET    /api/admin/line-templates
POST   /api/admin/line-templates
PATCH  /api/admin/line-templates/[id]
DELETE /api/admin/line-templates/[id]
POST   /api/admin/line-templates/[id]/preview
POST   /api/admin/line-templates/[id]/validate

GET    /api/admin/line-jobs
POST   /api/admin/line-jobs/process
POST   /api/admin/line-jobs/[id]/retry
POST   /api/admin/line-jobs/[id]/cancel

GET    /api/admin/line-analytics/summary
GET    /api/admin/line-analytics/errors
GET    /api/admin/line-analytics/targets
```

## Test Plan

### Unit Tests

- target ID detection: `U`, `C`, `R`
- rule matching
- rule priority
- template rendering
- duplicate protection
- retry decision by HTTP status

### Integration Tests

- create WTI with auto-send enabled creates job
- edit WTI with auto-send enabled creates job if not duplicate
- manual share creates force job
- worker sends and writes attempt
- worker retry on timeout/5xx
- worker no retry on 4xx
- no target returns `NO_TARGET`
- PDF font exists in deploy path

### Playwright Tests

- `/admin/line-settings` loads
- credentials are masked
- target table shows target type
- manual target `U...` shows warning
- rule simulator returns expected target
- template preview renders
- job retry button works
- analytics filters work

### Manual Dev Verification

1. Invite bot into LINE group
2. Send `/register`
3. Check target appears in `/admin/line-settings`
4. Set target default
5. Enable WTI auto-send
6. Create new WTI
7. Confirm LINE receives message
8. Confirm job status `sent`
9. Confirm attempt has `line_request_id`
10. Click manual share same document
11. Confirm it sends again because manual uses force

## Rollout Plan

### Batch 1: Fix Reliability

- Outbox tables
- send result truthfulness
- manual force send
- PDF font check
- target type validation

### Batch 2: Target Manager

- line_targets
- webhook registration
- `/register`
- UI target table

### Batch 3: Routing Rules

- rules table
- resolver
- UI rule builder
- simulator

### Batch 4: Templates

- template table
- renderer
- preview
- validation

### Batch 5: Bot Commands

- command router
- `/pdf`, `/status`, `/latest`, `/today`, `/retry`
- permission checks

### Batch 6: Analytics

- summary APIs
- dashboard
- CSV export
- audit log view

## Definition of Done

ถือว่าเสร็จเมื่อ:

- หน้า settings ตั้งค่าได้โดยไม่ต้องเข้า LINE Developers ยกเว้นการเอา token/secret ครั้งแรก
- bot ลงทะเบียนกลุ่มผ่าน `/register` ได้
- default target บอก type ชัดเจน
- auto-send สร้าง job และส่งจริง
- manual share ส่งซ้ำได้จริง
- ถ้าส่งไม่สำเร็จ UI ต้องแสดง error จริง ไม่ขึ้นว่าสำเร็จ
- ทุก LINE push ที่สำเร็จต้องมี `line_request_id` หรือ accepted request id
- retry ใช้ `X-Line-Retry-Key`
- log บอกได้ว่าส่งไป target ไหน ด้วย template ไหน เพราะ rule ไหน
- Playwright smoke test ผ่าน
- `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false` ผ่าน
- `npm run lint --workspace @ns-scrap-erp/next` ผ่าน
- `npm run build --workspace @ns-scrap-erp/next` ผ่าน

## หมายเหตุสำหรับ AGY

- ห้าม commit token, secret, `.env.local`, scratch scripts ที่มี credential
- ห้าม `git add .`
- Stage เฉพาะไฟล์ที่เกี่ยวข้อง
- ถ้าต้อง query dev Supabase ให้ใช้ env/secret จากเครื่องหรือระบบ deploy เท่านั้น และห้ามพิมพ์ secret ลง log
- ทุกครั้งที่แก้ flow ส่ง LINE ต้องทดสอบทั้ง 2 ทาง:
  - ปุ่มทดสอบจาก settings
  - ส่งจริงจากใบชั่ง WTI/WTO
