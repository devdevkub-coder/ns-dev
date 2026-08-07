# LINE Settings Guided Connection UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้ `/admin/line-settings` ตั้งค่า LINE OA ได้ตามลำดับที่ถูกต้อง เห็นสถานะจริง เข้าใจความต่างระหว่างการทดสอบภายในกับ LINE Developers และส่งข้อความทดสอบจริงจากแท็บการเชื่อมต่อได้ โดยไม่เปิดเผยค่าลับที่บันทึกแล้ว

**Architecture:** LINE OA A และ B เป็น connection profile คนละ environment: A อยู่ SIT database/deployment และ B อยู่ Production database/deployment. คง API/ตารางเดิมเป็นหลักและเพิ่ม state/UX ที่หน้า Connection; ใช้ `GET/POST /api/admin/line-settings`, `POST .../test-connection`, `POST .../test-webhook` และ `PATCH /api/admin/line-targets action=test` ที่มีอยู่แล้ว ไม่สร้าง endpoint ส่งทดสอบซ้ำ ไม่เพิ่ม schema และไม่เก็บ secret ใน browser storage. Webhook URL เป็นค่าที่ derive แบบ read-only จาก `Public App URL`; หน้าและ API ต้องแสดง source/target environment และ fail-closed เมื่อ host/profile ไม่ตรงกัน.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Zod, Tailwind CSS, Lucide React, Vitest, Prisma

---

## Status

PLAN ONLY — ยังไม่แก้ application code, API, DB หรือ deploy

## Current Diagnosis

| # | Problem found | Severity | Recommended action |
|---|---|---|---|
| 1 | ปุ่มรูปตาเปลี่ยน `password` เป็น `text` แต่ API ส่งค่าที่บันทึกแล้วกลับมาเป็น `••••••••••••••••` จึงไม่มี key จริงให้แสดง | High UX / Security | เลิกทำให้ปุ่มตาดูเหมือนเปิดค่าที่บันทึกได้; แสดงสถานะ `บันทึกแล้ว — Protected` และให้เปิดตาได้เฉพาะค่าทดแทนที่ผู้ใช้กำลังพิมพ์ใหม่ |
| 2 | ปุ่ม `ทดสอบ Token`, `ทดสอบ Webhook` และ `บันทึก` อยู่ระดับเดียวกัน ทำให้ไม่รู้ลำดับ | High UX | ทำ guided checklist พร้อม disabled state: Token → บันทึก → Webhook ภายใน → LINE Developers Verify → กลุ่ม/ส่งจริง |
| 3 | คำว่า `ทดสอบ Webhook` ปัจจุบันทำให้เข้าใจว่าเท่ากับปุ่ม Verify ใน LINE Developers | High UX | เปลี่ยนชื่อเป็น `ทดสอบ Webhook ภายใน` และแยกขั้น `Verify ที่ LINE Developers` ให้ชัด |
| 4 | Webhook URL ต้องประกอบเองจาก Public App URL | High Config Risk | แสดง URL ที่ระบบสร้างให้แบบ read-only พร้อม `คัดลอก URL`; ไม่เพิ่มช่อง Webhook URL ที่แก้ไขแยก |
| 5 | `test-webhook` ใช้ dummy message event ซึ่งอาจสร้าง target ทดสอบปลอมผ่าน webhook route | High Data Quality | เปลี่ยน payload เป็น `{ events: [] }` แบบเดียวกับ verification handshake เพื่อทดสอบ signature/HTTP 200 โดยไม่มี business side effect |
| 6 | ปุ่มส่งข้อความจริงอยู่ในเมนูรายแถวของแท็บกลุ่มเท่านั้น ทำให้ setup flow ขาดขั้นสุดท้าย | Medium UX | เพิ่ม target selector + `ส่งข้อความทดสอบจริง` ในแท็บ Connection โดย reuse `PATCH /api/admin/line-targets` action=`test` |
| 7 | หน้า Connection ยังไม่สื่อสถานะ `ยังไม่ได้ตั้งค่า / Protected / รอการบันทึก / ผ่าน / ไม่ผ่าน` | Medium UX | เพิ่ม status strip และสถานะระดับ field ที่มาจากข้อมูล/ผลทดสอบจริงเท่านั้น |
| 8 | URL SIT และ Production คล้ายกันมาก เสี่ยงตั้ง Webhook ผิด environment | High Config Risk | แสดง environment warning และ URL ที่ถูกต้อง; ไม่ auto-save URL จาก request host และไม่ hardcode Channel ID |
| 9 | เมื่อเปลี่ยน Token ไปเป็น OA คนละตัว การ sync เดิมปิด group/user ที่ตอบ 400/404 ได้ แต่ room ตรวจสอบไม่ได้และกฎ/default เดิมอาจยังอ้าง target เก่า | High Delivery Risk | ตรวจจับ OA identity change, ขอคำยืนยัน และ deactivate target/rule เก่าโดยไม่ลบประวัติก่อนรับ target ของ OA ใหม่ |
| 10 | ถ้ามีหลาย target แต่ไม่มี default การเลือก target แรกอัตโนมัติเสี่ยงส่งข้อความทดสอบผิดกลุ่ม | High Delivery Risk | เลือกอัตโนมัติเฉพาะ default หรือกรณีมี active target เพียงหนึ่งรายการ; นอกนั้นบังคับผู้ใช้เลือกเอง |
| 11 | Token test รับ draft Token จากหน้าได้ แต่ Webhook test อ่านเฉพาะ Secret/Public App URL ที่บันทึกใน DB จึงเกิดอาการ `Token ผ่าน` แต่ Webhook ใช้ค่าเก่า | High UX / Config Risk | แสดง `draft` กับ `saved` แยกชัด, บังคับบันทึก Secret/URL ก่อน Webhook test และบอกค่าใดกำลังถูกใช้โดยไม่เปิดเผย secret |
| 12 | HTTP 400/401 ปัจจุบันไม่บอกว่าเป็น config missing, host ผิด หรือ signature mismatch | High Diagnosability | คืน structured error code/stage/sourceHost/targetHost; ใช้ 422 สำหรับ upstream signature rejection แทนการทำให้ดูเหมือน session 401 |
| 13 | ผู้ใช้มี OA A สำหรับ SIT และ OA B สำหรับ Production แต่หน้าไม่มี environment identity เด่นชัด | High Delivery Risk | แสดง connection profile `A · SIT` / `B · Production`, browser host, configured webhook host และห้ามนำค่า A ไปทดสอบกับ endpoint B |
| 14 | Production B และ localhost ปัจจุบันใช้ Supabase project `fhglqymcdmrgbsbadnwr` ชุดเดียวกัน จึงมีโอกาสที่การบันทึกจาก localhost กระทบ B จริง | High Operational Risk | แสดง persistent production-data warning บน localhost, ขอ confirmation ก่อน external action และห้ามใช้ localhost ตั้งค่า A โดยไม่เริ่ม server ด้วย SIT environment อย่างชัดเจน |

## Decisions Locked For Implementation

| Topic | Decision |
|---|---|
| Stored Token/Secret | ไม่ส่งค่าจริงกลับ browser และไม่เปิดตาให้เห็นค่าที่บันทึกแล้ว |
| Replacing credentials | กด `เปลี่ยนค่า` → ช่องใหม่ว่าง → eye toggle แสดงได้เฉพาะค่าที่พิมพ์ใหม่ → บันทึกแล้วกลับเป็น Protected |
| Setup order | กรอก → ทดสอบ Token ใหม่ก่อนบันทึก → ยืนยันเมื่อเป็น OA คนละตัว → บันทึก → ทดสอบ Webhook ภายใน → Update/Verify/Use webhook ใน LINE Developers → สร้าง target → ส่งจริง |
| Webhook URL input | ไม่มีช่องให้พิมพ์ซ้ำ; derive จาก Public App URL เท่านั้น |
| Real test send | อยู่ในแท็บ Connection และยังคง action เดิมในแท็บกลุ่ม |
| Backend reuse | ใช้ API เดิมทั้งหมด ยกเว้นแก้ payload ของ internal webhook self-test ให้ไม่มี side effect |
| LINE Developers link | เปิด `https://developers.line.biz/console/` แบบ generic; ไม่ hardcode channel `2010984472` เพราะเปลี่ยน OA ได้ |
| UI baseline | ใช้ layout จากภาพอ้างอิงเป็นทิศทาง แต่ editable inputs ต้องคงพื้นเหลืองตาม `docs/design.md`; read-only/protected fieldsใช้พื้น neutral |
| Auto-send | ยังไม่ให้เปิดเป็นส่วนหนึ่งของ connection success; แนะนำเปิดหลัง real test send ผ่านแล้ว |
| OA rotation | ไม่ลบ target/history เก่า; deactivate target และ routing rule เดิม, clear default target และให้ลงทะเบียน target ของ OA ใหม่ก่อนเปิดส่ง |
| DB / migration | ไม่มี schema change และไม่มี migration |
| Cache | ข้อมูลเป็น config/auth-sensitive; response ต้อง `private, no-store` และห้าม browser persistent cache |
| Two OA ownership | A และ B ไม่ใช่สองตัวเลือกใน DB เดียว; แต่ละ deployment อ่าน/เขียน `system_settings` ของฐานตัวเอง |
| Operational admin page | ตั้งค่า A จากหน้า SIT และตั้งค่า B จากหน้า Production; localhost ต้องแสดงชัดว่ากำลังผูกกับฐาน/profile ใดและไม่อ้างว่าเป็น SIT/Production จาก hostname อย่างเดียว |
| Webhook diagnostics | แยก `CONFIG_MISSING`, `ENVIRONMENT_MISMATCH`, `SIGNATURE_REJECTED`, `UNREACHABLE/TIMEOUT`, `OK`; ไม่แสดง Token/Secret |

## Two-OA Environment Contract

| Profile | Deployment | Supabase project | Public App URL | Webhook URL |
|---|---|---|---|---|
| OA A | SIT | `vbjlkxbytccklhqvxjuu` | `https://ns-erp-sit.vercel.app` | `https://ns-erp-sit.vercel.app/api/line/webhook` |
| OA B | Production | `fhglqymcdmrgbsbadnwr` | `https://ns-erp.vercel.app` | `https://ns-erp.vercel.app/api/line/webhook` |
| Localhost | Inherits the explicitly loaded local env | Current local run resolves to `fhglqymcdmrgbsbadnwr` | ไม่ใช้เป็น LINE public endpoint | ต้องแสดง target profile และขอ confirmation ก่อนทดสอบข้าม host |

ข้อจำกัดสำคัญ: Messaging API channel หนึ่งรายการมี Webhook URL ที่ active ได้หนึ่งปลายทาง หากต้องให้ SIT และ Production รับ event พร้อมกัน ต้องใช้คนละ channel/OA; ห้ามสลับ URL ของ channel เดียวไปมาโดยไม่ตั้งใจ.

### Verified Diagnostic Evidence — 2026-08-06

| Check | Result |
|---|---|
| Public SIT bundle | Uses Supabase `vbjlkxbytccklhqvxjuu` |
| Public Production bundle | Uses Supabase `fhglqymcdmrgbsbadnwr` |
| Current localhost process | Standard Next dev loading `.env.local`; resolves to `fhglqymcdmrgbsbadnwr` |
| Stored B Secret signing `{ events: [] }` to B endpoint | HTTP 200 `{"ok":true}` |
| Deliberately wrong signature to B endpoint | HTTP 401 `INVALID_SIGNATURE` |

Conclusion: B endpoint and currently saved B Secret work now. The earlier historical 400/401 is no longer reproducible; the evidence supports an earlier saved/draft mismatch or cross-environment Secret, but does not prove which historical user action caused it because no matching runtime log remains.

## Final User Flow

1. เปิดแท็บ `การเชื่อมต่อ`.
2. คัดลอก Channel Access Token จาก LINE Developers → Messaging API.
3. คัดลอก Channel Secret จาก LINE Developers → Basic settings.
4. กรอก `Public App URL` เป็น base URL ของ environment เท่านั้น และกรอก Storage Bucket.
5. กด `ทดสอบ Access Token`; ระบบทดสอบ draft Token โดยยังไม่บันทึก และแสดงชื่อ OA/Basic ID จริง.
6. ถ้า Basic ID ต่างจาก OA ที่บันทึกอยู่ ระบบต้องเตือนว่าเป็นการเปลี่ยน OA และให้ยืนยันผลกระทบต่อ target/default/rule เดิม.
7. กด `บันทึกการตั้งค่า`; Token ใหม่บันทึกได้เมื่อทดสอบผ่านแล้ว ส่วน Webhook test ยังปิดจนกว่าบันทึก Secret/Public App URL สำเร็จ.
8. กด `ทดสอบ Webhook ภายใน`; ระบบ sign payload ว่างด้วย secret ที่บันทึกไว้และต้องได้ HTTP 200 จาก `/api/line/webhook`.
9. กด `คัดลอก Webhook URL`.
10. เปิด LINE Developers → Messaging API → Webhook settings → Edit → วาง URL → Update → Verify → เปิด `Use webhook`.
11. เชิญ OA เข้ากลุ่มหรือส่งข้อความหา OA อย่างน้อยหนึ่งครั้ง เพื่อให้ LINE ส่ง event จริงและระบบรู้ Target ID.
12. กลับ ERP กด `ซิงค์กลุ่ม` หรือรีเฟรช แล้วเลือกกลุ่มใน `ส่งข้อความทดสอบจริง`.
13. เมื่อได้รับข้อความและมี LINE Request ID จึงค่อยเปิด auto-send WTI/WTO และตั้ง routing rules.

## Credential State Model

| State | Display | Allowed action |
|---|---|---|
| `empty` | `ยังไม่ได้ตั้งค่า` | กรอกค่าใหม่ |
| `protected` | mask + lock + `บันทึกแล้ว — Protected` | `เปลี่ยนค่า`; ไม่มี reveal |
| `editing` | input พื้นเหลือง | eye/eye-off, `ยกเลิกการเปลี่ยนค่า`, บันทึก |
| `dirty` | badge `มีค่ารอการบันทึก` | draft Token ทดสอบได้; Webhook test ปิดจน Secret/Public App URL ถูกบันทึก |
| `testing` | spinner + `กำลังทดสอบ` | ปิด action ซ้ำ |
| `passed` | green status พร้อมรายละเอียดที่ API ยืนยัน | ทำขั้นถัดไป |
| `failed` | red status พร้อม error ที่ sanitize แล้ว | แก้ค่า/ลองใหม่ |

## Responsive Layout Contract

### Desktop / landscape

- Status strip เต็มความกว้างด้านบน: OA, Token, Channel Secret, Webhook.
- ใต้ status strip ใช้ grid `lg:grid-cols-12`.
- Form อยู่ `lg:col-span-8`; guide/status/action อยู่ `lg:col-span-4`.
- Generated Webhook URL และ action copy/open LINE Developers อยู่ใน form card.
- Real test send อยู่ท้าย guide card โดยไม่สร้าง card KPI ซ้ำ.

### Mobile

- เรียงหนึ่งคอลัมน์.
- Status/checklist อยู่ก่อน form actions เพื่อให้รู้ว่าติดขั้นใด.
- ทุกปุ่ม action สูง `h-10`, target selector และปุ่มส่งจริงเต็มความกว้าง.
- Token/Secret action ไม่ล้นแนวนอน; label/help text wrap ได้.
- ไม่มี horizontal scroll และไม่ย่อ font ต่ำกว่า 14px สำหรับข้อมูลสำคัญ.

## File Map

| File | Responsibility |
|---|---|
| `apps/next/src/lib/line-connection-profile.ts` | Pure mapping/validation for OA A · SIT and OA B · Production using public host + Supabase project ref only |
| `apps/next/src/lib/line-connection-profile.test.ts` | Cross-environment alignment and unknown/local profile tests |
| `apps/next/src/app/admin/line-settings/LineSettingsPageClient.tsx` | Credential states, guided setup layout, URL copy, LINE Developers link, same-tab real test send, responsive/theme alignment |
| `apps/next/src/app/admin/line-settings/LineSettingsPageClient.connection.test.ts` | Focused source/contract checks for protected state, generated URL, action order and target test send wiring |
| `apps/next/src/app/api/admin/line-settings/route.ts` | Preserve masked secret contract and add explicit private no-store response headers |
| `apps/next/src/app/api/admin/line-settings/route.test.ts` | Verify GET never exposes Token/Secret and POST masked placeholders never overwrite stored values |
| `apps/next/src/app/api/admin/line-settings/test-connection/route.test.ts` | Verify stored-token fallback and newly submitted token behavior |
| `apps/next/src/app/api/admin/line-settings/test-webhook/route.ts` | Sign and send empty-events self-test payload to configured Webhook URL |
| `apps/next/src/app/api/admin/line-settings/test-webhook/route.test.ts` | Verify exact configured URL, signature, timeout and zero-event payload |
| `apps/next/src/app/api/line/webhook/route.test.ts` | Verify a valid signed empty-event request returns 200 and does not upsert target |
| `apps/next/src/app/api/admin/line-targets/route.test.ts` | Verify selected active target receives a real test push and request ID is returned |
| `apps/next/src/lib/server/line-target-sync.ts` | Reuse Bot Info identity and target sync helpers during confirmed OA rotation |
| `apps/next/src/lib/server/line-target-sync.test.ts` | Verify old group/user/room handling and fail-closed rotation behavior |
| `docs/notes/LINE Notification Control Center Ultimate Plan.md` | Canonical connection/setup flow, environment rules, test meanings and security behavior |
| `docs/migration/00-current-work.md` | Keep only active batch, required validation and immediate next step while implementation is in progress |

---

### Task 0: Encode The Two-OA Environment Contract

**Files:**
- Create: `apps/next/src/lib/line-connection-profile.ts`
- Create: `apps/next/src/lib/line-connection-profile.test.ts`

- [ ] **Step 1: Write failing profile-alignment tests**

Cover the known safe matrix:

```ts
expect(resolveLineConnectionProfile({
  appUrl: 'https://ns-erp-sit.vercel.app',
  supabaseUrl: 'https://vbjlkxbytccklhqvxjuu.supabase.co',
}).id).toBe('sit-a')

expect(resolveLineConnectionProfile({
  appUrl: 'https://ns-erp.vercel.app',
  supabaseUrl: 'https://fhglqymcdmrgbsbadnwr.supabase.co',
}).id).toBe('production-b')

expect(resolveLineConnectionProfile({
  appUrl: 'https://ns-erp.vercel.app',
  supabaseUrl: 'https://vbjlkxbytccklhqvxjuu.supabase.co',
}).aligned).toBe(false)
```

- [ ] **Step 2: Implement a pure, non-secret profile resolver**

Use public identifiers only:

```ts
export const LINE_CONNECTION_PROFILES = {
  'sit-a': {
    id: 'sit-a',
    label: 'OA A · SIT',
    appHost: 'ns-erp-sit.vercel.app',
    supabaseProjectRef: 'vbjlkxbytccklhqvxjuu',
  },
  'production-b': {
    id: 'production-b',
    label: 'OA B · Production',
    appHost: 'ns-erp.vercel.app',
    supabaseProjectRef: 'fhglqymcdmrgbsbadnwr',
  },
} as const
```

The resolver returns `id`, `label`, `appHost`, `supabaseProjectRef`, `aligned`, and a safe Thai reason. Unknown/custom hosts return `custom` and never guess that they are SIT or Production.

- [ ] **Step 3: Run the focused test**

```powershell
npx vitest run src/lib/line-connection-profile.test.ts
```

Expected: A→A and B→B align; A database→B endpoint and B database→A endpoint fail closed.

---

### Task 1: Lock The Credential Security Contract

**Files:**
- Modify: `apps/next/src/app/api/admin/line-settings/route.ts:28-92`
- Create: `apps/next/src/app/api/admin/line-settings/route.test.ts`

- [ ] **Step 1: Write failing GET/POST contract tests**

Test cases must prove:

```ts
expect(body.lineChannelAccessToken).toBe('••••••••••••••••')
expect(body.lineChannelSecret).toBe('••••••••••••••••')
expect(JSON.stringify(body)).not.toContain('stored-token')
expect(JSON.stringify(body)).not.toContain('stored-secret')
expect(response.headers.get('cache-control')).toBe('private, no-store')
```

For POST, submit masked placeholders and assert that the transaction contains no upsert for `LINE_CHANNEL_ACCESS_TOKEN` or `LINE_CHANNEL_SECRET`.

- [ ] **Step 2: Run the focused test and confirm it fails only on missing contract pieces**

Run:

```powershell
npx vitest run src/app/api/admin/line-settings/route.test.ts
```

Working directory: `apps/next`

Expected: GET secrecy assertions pass from existing masking; cache header assertion fails before implementation.

- [ ] **Step 3: Add a single reusable no-store header object in the route**

Use:

```ts
const PRIVATE_NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' }
```

Pass it through `NextResponse.json(..., { headers: PRIVATE_NO_STORE_HEADERS })` for successful GET/POST responses. Do not return raw value, suffix, token length or secret metadata.

- [ ] **Step 4: Run focused tests**

Expected: all credential route tests pass and no secret appears in snapshots/output.

---

### Task 2: Make Internal Webhook Test Side-Effect Free

**Files:**
- Modify: `apps/next/src/app/api/admin/line-settings/test-webhook/route.ts:24-46`
- Modify: `apps/next/src/app/api/admin/line-settings/test-webhook/route.test.ts`
- Modify: `apps/next/src/app/api/line/webhook/route.test.ts`
- Use: `apps/next/src/lib/line-connection-profile.ts`

- [ ] **Step 1: Extend tests for a LINE-style empty event verification payload**

The self-test route assertion must include:

```ts
const [, requestInit] = fetchMock.mock.calls[0]
expect(JSON.parse(String(requestInit.body))).toEqual({ events: [] })
expect(requestInit.headers).toMatchObject({
  'Content-Type': 'application/json',
  'x-line-signature': expect.any(String),
})
```

The webhook route test must send a valid HMAC-signed `{ events: [] }` request and assert:

```ts
expect(response.status).toBe(200)
expect(db.upsertTarget).not.toHaveBeenCalled()
```

- [ ] **Step 2: Confirm the new assertions fail against the current dummy message payload**

Run:

```powershell
npx vitest run src/app/api/admin/line-settings/test-webhook/route.test.ts src/app/api/line/webhook/route.test.ts
```

- [ ] **Step 3: Replace the dummy user/message event**

Use the minimal payload:

```ts
const verificationPayload = { events: [] }
const rawBody = JSON.stringify(verificationPayload)
```

Keep the configured `NEXT_PUBLIC_APP_URL`, HMAC SHA-256 signature, 10-second timeout and permission check. Do not infer or silently replace the target URL from the incoming request host.

- [ ] **Step 4: Add environment alignment before sending**

Resolve the configured App URL together with the server's public Supabase URL. For the two known profiles:

```ts
if (!profile.aligned) {
  return NextResponse.json({
    code: 'LINE_ENVIRONMENT_MISMATCH',
    stage: 'environment',
    sourceProfile: profile.dataProfileLabel,
    targetProfile: profile.targetProfileLabel,
    sourceHost: new URL(request.url).host,
    targetHost: new URL(webhookUrl).host,
    error: 'ฐานข้อมูล LINE และ Webhook URL อยู่คนละ environment',
  }, { status: 409, headers: PRIVATE_NO_STORE_HEADERS })
}
```

Never include Token, Secret, signature or database connection string.

- [ ] **Step 5: Return structured stage-specific results**

Use these contracts:

| Situation | API HTTP | `code` | `stage` |
|---|---:|---|---|
| Saved Secret missing | 400 | `LINE_SECRET_NOT_SAVED` | `configuration` |
| Public App URL missing/invalid | 400 | `LINE_APP_URL_INVALID` | `configuration` |
| Known DB/target profile mismatch | 409 | `LINE_ENVIRONMENT_MISMATCH` | `environment` |
| Destination returned signature 401 | 422 | `LINE_WEBHOOK_SIGNATURE_REJECTED` | `signature` |
| Destination timeout | 504 | `LINE_WEBHOOK_TIMEOUT` | `transport` |
| Destination network/5xx | 502 | `LINE_WEBHOOK_UNREACHABLE` | `transport` |
| Signed empty event accepted | 200 | `LINE_WEBHOOK_OK` | `complete` |

An upstream webhook 401 must not become the admin API's own HTTP 401, because that incorrectly looks like an expired ERP session. Return `upstreamStatus: 401` safely inside the 422 response instead.

- [ ] **Step 6: Add differential tests**

Mock the destination twice using the same `{ events: [] }` request:

```ts
expect(validResult.status).toBe(200)
expect(await validResult.json()).toMatchObject({ code: 'LINE_WEBHOOK_OK', stage: 'complete' })

expect(mismatchResult.status).toBe(422)
expect(await mismatchResult.json()).toMatchObject({
  code: 'LINE_WEBHOOK_SIGNATURE_REJECTED',
  stage: 'signature',
  upstreamStatus: 401,
})
```

- [ ] **Step 7: Re-run focused tests**

Expected: matching A→A/B→B returns 200, cross-environment configuration fails before transport, signature rejection is actionable, and no self-test creates a target or business notification.

---

### Task 3: Add Pure Credential And URL View-State Helpers

**Files:**
- Modify: `apps/next/src/app/admin/line-settings/LineSettingsPageClient.tsx:18-45,337-383`
- Create: `apps/next/src/app/admin/line-settings/LineSettingsPageClient.connection.test.ts`

- [ ] **Step 1: Add focused helper/source contract tests**

Cover these exact results:

```ts
expect(isProtectedCredential('••••••••••••••••')).toBe(true)
expect(isProtectedCredential('new-token')).toBe(false)
expect(buildLineWebhookUrl('https://ns-erp-sit.vercel.app/'))
  .toBe('https://ns-erp-sit.vercel.app/api/line/webhook')
expect(buildLineWebhookUrl('')).toBe('')
```

- [ ] **Step 2: Add the minimal helpers and state types**

Use:

```ts
const MASKED_CREDENTIAL = '••••••••••••••••'
type CredentialEditMode = 'empty' | 'protected' | 'editing'
type CheckState = 'idle' | 'testing' | 'passed' | 'failed'

export function isProtectedCredential(value: string | null | undefined) {
  return Boolean(value?.includes('••'))
}

export function buildLineWebhookUrl(appUrl: string) {
  if (!appUrl.trim()) return ''
  try {
    return new URL('/api/line/webhook', appUrl.trim()).toString()
  } catch {
    return ''
  }
}
```

State additions:

```ts
const [tokenMode, setTokenMode] = useState<CredentialEditMode>('empty')
const [secretMode, setSecretMode] = useState<CredentialEditMode>('empty')
const [tokenCheck, setTokenCheck] = useState<CheckState>('idle')
const [webhookCheck, setWebhookCheck] = useState<CheckState>('idle')
const [selectedTestTargetId, setSelectedTestTargetId] = useState('')
```

- [ ] **Step 3: Make `loadCredentials` map masks to protected modes without storing extra state in localStorage/sessionStorage**

After loading:

```ts
setTokenMode(isProtectedCredential(data.lineChannelAccessToken) ? 'protected' : 'empty')
setSecretMode(isProtectedCredential(data.lineChannelSecret) ? 'protected' : 'empty')
```

Keep `credentialsBaseline` as the sole dirty-form comparison.

`loadBotInfo` must set `tokenCheck` to `passed` only when LINE Bot Info returns successfully, and to `failed` when the saved token is rejected. A masked saved token is therefore testable; `protected` means hidden, not invalid. When testing a draft replacement Token, retain the returned `botName` and `basicId` as pending identity so the save flow can detect an OA change.

- [ ] **Step 4: Reset check states when their inputs change**

- Token change resets Token check and downstream real-send readiness.
- Secret or Public App URL change resets Webhook check.
- A draft replacement Token may be tested before save; changing that Token resets the result.
- Webhook test stays disabled while Secret/Public App URL changes remain unsaved.

- [ ] **Step 5: Run the focused test**

Expected: helper/contract tests pass without DOM or browser dependencies.

---

### Task 4: Replace Misleading Eye Buttons With Protected/Replace UX

**Files:**
- Modify: `apps/next/src/app/admin/line-settings/LineSettingsPageClient.tsx:1364-1415`
- Modify: `apps/next/src/app/admin/line-settings/LineSettingsPageClient.connection.test.ts`

- [ ] **Step 1: Add test assertions for the three credential states**

The test must verify source behavior contains:

```ts
'บันทึกแล้ว — Protected'
'เปลี่ยนค่า'
'ยกเลิกการเปลี่ยนค่า'
```

It must also assert that the saved/protected branch does not call `setShowToken` or `setShowSecret` to reveal stored masks.

- [ ] **Step 2: Render protected credentials as read-only neutral fields**

- Use Lucide `LockKeyhole` for protected state.
- Do not render an eye action while mode is `protected`.
- `เปลี่ยนค่า` sets mode to `editing` and clears only that credential draft.
- `ยกเลิกการเปลี่ยนค่า` restores `MASKED_CREDENTIAL` without discarding changes in other fields.

- [ ] **Step 3: Render eye toggle only in editing mode**

Use Lucide `Eye` / `EyeOff`, with Thai `aria-label`, `autoComplete="new-password"`, `spellCheck={false}` and `h-10`.

- [ ] **Step 4: Preserve design field semantics**

- Editable Token/Secret: yellow entry surface supplied by `data-ns-field-scope="entry"`.
- Protected/read-only field: neutral surface with `readOnly` and `aria-readonly="true"`.
- Invalid field: red overrides yellow.
- No emoji monkey icons.

- [ ] **Step 5: Run focused UI contract test and targeted ESLint**

```powershell
npx vitest run src/app/admin/line-settings/LineSettingsPageClient.connection.test.ts
npx eslint src/app/admin/line-settings/LineSettingsPageClient.tsx
```

---

### Task 5: Build The Guided Connection Layout And Action Order

**Files:**
- Modify: `apps/next/src/app/admin/line-settings/LineSettingsPageClient.tsx:1241-1547`
- Modify: `apps/next/src/app/admin/line-settings/LineSettingsPageClient.connection.test.ts`

- [ ] **Step 1: Add status derivations with no invented health claims**

Derive only from real state:

- OA = `botInfo` returned by LINE Bot Info.
- Environment = profile resolved from configured App URL + public Supabase project ref; show `OA A · SIT`, `OA B · Production`, or `Custom/Unknown`.
- Token = empty/protected/testing/passed/failed.
- Secret = empty/protected/editing plus `saved`/`draft`; never claim LINE accepted a draft or reveal it.
- Webhook = URL missing / ready / internal test passed / internal test failed.
- LINE Developers Verify = always shown as an external manual step unless a real webhook event has been observed; do not label it connected from internal self-test alone.

- [ ] **Step 2: Add a compact full-width status strip**

Use existing card tokens: white/neutral surface, slate border, rounded-xl, subtle shadow, 14px base text, Lucide icons. Do not create decorative KPI values. The first item must show the active profile and alignment, for example `OA B · Production · ฐานและ Webhook ตรงกัน`.

- [ ] **Step 3: Convert Connection content to responsive 12-column grid**

```tsx
<div className="grid gap-4 lg:grid-cols-12">
  <section className="space-y-5 lg:col-span-8">...</section>
  <aside className="space-y-4 lg:col-span-4">...</aside>
</div>
```

All fields stay `h-10`; cards use the existing page surface language and dark-mode semantic classes.

- [ ] **Step 4: Add generated Webhook URL block**

Render the exact read-only value from `buildLineWebhookUrl(form.appUrl)`. Add:

- `คัดลอก Webhook URL` using `navigator.clipboard.writeText(webhookUrl)`.
- `เปิด LINE Developers` linking to `https://developers.line.biz/console/` with `target="_blank"` and `rel="noreferrer"`.
- Block known A/B database-to-target mismatches before testing.
- When the browser is localhost, show a persistent amber notice such as `Localhost กำลังจัดการ OA B · Production`; require explicit acknowledgement before any external webhook/test-send action in that session.
- When a deployed browser host differs from its configured profile host, show a blocking environment error rather than a generic warning.

- [ ] **Step 5: Enforce the action sequence in UI**

- Save enabled only when valid and not saving; when Token is being replaced, save also requires that exact draft Token to have passed Bot Info validation.
- Token test disabled only while no saved/draft token exists or while testing; a saved `protected` token remains eligible because the API resolves it server-side.
- Webhook internal test disabled while Secret/Public App URL changes remain unsaved, required values are missing, Token test has not passed, or the test is already running.
- Copy/open external step enabled when generated URL is valid.
- Real send disabled until an active target is selected and Token test has passed.
- Every webhook error maps to one direct remedy:
  - `LINE_SECRET_NOT_SAVED` → `บันทึก Channel Secret ก่อนทดสอบ`.
  - `LINE_APP_URL_INVALID` → focus Public App URL.
  - `LINE_ENVIRONMENT_MISMATCH` → show A/B source and target; disable test.
  - `LINE_WEBHOOK_SIGNATURE_REJECTED` → `Secret ที่บันทึกไม่ตรงกับ Channel Secret ของ OA เป้าหมาย`.
  - `LINE_WEBHOOK_TIMEOUT/UNREACHABLE` → show transport/retry guidance without suggesting Secret replacement.

Rename buttons exactly:

```text
บันทึกการตั้งค่า
ทดสอบ Access Token
ทดสอบ Webhook ภายใน
คัดลอก Webhook URL
เปิด LINE Developers
ส่งข้อความทดสอบจริง
```

- [ ] **Step 6: Keep setup help concise and exact**

The right-side guide groups `Final User Flow` into six phases: Environment, Credentials, Save, Internal Webhook, LINE Developers, Target/Real Send. Each completed local phase gets a check icon. LINE Developers Verify remains a manual external instruction, not an automatically completed state.

- [ ] **Step 7: Run focused UI test and type-check**

Expected: no invalid imports/types, action labels/order present, and no duplicate endpoint introduced.

---

### Task 6: Put Real Test Send In The Same Tab Without Duplicating Backend Logic

**Files:**
- Modify: `apps/next/src/app/admin/line-settings/LineSettingsPageClient.tsx:534-544,863-878,1514-1545`
- Create: `apps/next/src/app/api/admin/line-targets/route.test.ts`
- Modify: `apps/next/src/app/admin/line-settings/LineSettingsPageClient.connection.test.ts`

- [ ] **Step 1: Write a route test for the existing `action=test` contract**

Mock one selected target and assert:

```ts
expect(sendLinePush).toHaveBeenCalledWith(
  'C-SELECTED-TARGET',
  expect.any(Array),
  'stored-token',
)
await expect(response.json()).resolves.toMatchObject({
  ok: true,
  lineRequestId: 'line-request-id',
})
```

- [ ] **Step 2: Default the selector safely**

Select only active targets. Auto-select the active default target; if there is no default, auto-select only when exactly one active target exists. If there are multiple active targets without a default, leave the selector empty and require an explicit user choice. Never fall back to an unrelated/global recipient.

- [ ] **Step 3: Reuse `handleTestTarget`**

Send the selected database row ID to:

```ts
fetch('/api/admin/line-targets', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: selectedTarget.id, action: 'test' }),
})
```

Do not create a new test-send endpoint and do not auto-send during save.

- [ ] **Step 4: Add empty state**

When there is no active target, show:

```text
ยังไม่พบกลุ่มรับแจ้งเตือน: เชิญ OA เข้ากลุ่ม ส่งข้อความ 1 ครั้ง แล้วกดซิงค์กลุ่ม
```

Provide `ไปที่กลุ่มแจ้งเตือน` by setting the active tab to `targets`; do not submit anything.

- [ ] **Step 5: Preserve the existing per-row test action**

The `ทดสอบส่ง` action in the Targets tab remains available and uses the same handler/API contract.

- [ ] **Step 6: Run target route and UI tests**

Expected: selected target only, real LINE request ID surfaced, no default/global fallback.

---

### Task 6A: Make LINE OA Rotation Fail-Closed

**Files:**
- Modify: `apps/next/src/app/api/admin/line-settings/route.ts`
- Modify: `apps/next/src/app/admin/line-settings/LineSettingsPageClient.tsx`
- Modify: `apps/next/src/lib/server/line-target-sync.ts`
- Modify: `apps/next/src/lib/server/line-target-sync.test.ts`
- Modify: `apps/next/src/app/api/admin/line-settings/route.test.ts`

- [ ] **Step 1: Write failing rotation tests**

Cover four contracts:

```text
same Basic ID + new Token       -> preserve active targets/rules
different Basic ID, unconfirmed -> HTTP 409 and perform no writes
different Basic ID, confirmed   -> deactivate targets/rules and clear defaults without deleting history
inactive room during sync       -> remain inactive until a real webhook event re-registers it
```

- [ ] **Step 2: Validate a replacement Token before persisting it**

When `lineChannelAccessToken` is a real draft rather than a mask, call the existing `fetchLineBotInfo` first. Invalid Token means the settings POST fails and the old stored Token remains unchanged.

- [ ] **Step 3: Compare OA identity server-side**

Persist the last accepted `basicId` as `LINE_BOT_BASIC_ID` in `system_settings`; this adds no schema. On the first run where that setting does not exist, compare the new Token with the current stored Token and treat a changed Token plus existing active targets as confirmation-required when the previous identity cannot be recovered safely.

Return only safe identity information:

```ts
return NextResponse.json({
  code: 'LINE_BOT_CHANGE_CONFIRMATION_REQUIRED',
  previousBot: { basicId: previousBasicId, name: previousBotName },
  nextBot: { basicId: nextBot.basicId, name: nextBot.botName },
}, { status: 409, headers: PRIVATE_NO_STORE_HEADERS })
```

Never return either Token.

- [ ] **Step 4: Require an explicit confirmation in the existing save flow**

Use the shared `useActionConfirmation` UI. Explain that confirmed rotation will:

- deactivate every existing LINE target,
- remove current default-target selection,
- deactivate existing routing rules until remapped,
- preserve all rows, logs and notification history,
- require a real webhook event from the new OA before sending.

Retry the same POST with `confirmBotChange: true` only after confirmation.

- [ ] **Step 5: Apply the confirmed rotation atomically**

Inside the same Prisma transaction as the settings update:

```ts
prisma.line_targets.updateMany({
  data: { is_active: false, is_default: false, last_event_type: 'oa_changed' },
}),
prisma.line_notification_rules.updateMany({
  data: { is_active: false, updated_at: new Date() },
}),
```

Also persist `LINE_DEFAULT_TARGET_ID = null` and the new `LINE_BOT_BASIC_ID`. Do not delete targets, rules, jobs, attempts or audit evidence.

- [ ] **Step 6: Stop room sync from reactivating unverifiable rooms**

LINE has no room-summary endpoint. Change proactive sync so a room preserves its current state; only a verified webhook event may activate/re-register it. This prevents a room belonging to the previous OA from becoming active merely because sync ran.

- [ ] **Step 7: Do not auto-sync old targets after confirmed OA rotation**

Return `requiresTargetRegistration: true` and guide the user to configure the new Webhook URL, trigger a real event, then refresh targets. Normal same-OA Token rotation may retain the existing sync behavior.

- [ ] **Step 8: Run rotation-focused tests**

```powershell
npx vitest run src/app/api/admin/line-settings/route.test.ts src/lib/server/line-target-sync.test.ts
```

Expected: no unconfirmed mutation, no deleted history, and no stale room reactivation.

---

### Task 7: Update The Canonical Flow Documentation

**Files:**
- Modify: `docs/notes/LINE Notification Control Center Ultimate Plan.md`
- Modify: `docs/migration/00-current-work.md`

- [ ] **Step 1: Document what each check proves**

Add:

- Token test proves the saved or draft Access Token can call LINE Bot Info and identifies the OA before persistence.
- Internal Webhook test proves the saved Secret signs a request that the configured ERP endpoint accepts.
- LINE Developers Verify proves LINE can reach the public endpoint.
- Real send proves the bot can push to a selected target and LINE returns a request ID.

- [ ] **Step 2: Document environment and credential invariants**

Include the Local/SIT/Production URL table, one-active-webhook-per-channel limitation, Protected/replace behavior, no browser storage and no secret reveal.

- [ ] **Step 3: Keep current-work operational**

Record only active objective, files, required tests and next action; archive completed details in the LINE flow note rather than growing `00-current-work.md`.

- [ ] **Step 4: Run docs validation**

```powershell
git diff --check
```

---

### Task 8: Validation And Final Review

**Files:**
- Review all files above; no new runtime dependencies.

- [ ] **Step 1: Run focused tests**

```powershell
npx vitest run \
  src/app/admin/line-settings/LineSettingsPageClient.connection.test.ts \
  src/app/api/admin/line-settings/route.test.ts \
  src/app/api/admin/line-settings/test-connection/route.test.ts \
  src/app/api/admin/line-settings/test-webhook/route.test.ts \
  src/app/api/admin/line-targets/route.test.ts \
  src/app/api/line/webhook/route.test.ts \
  src/lib/line-connection-profile.test.ts \
  src/lib/server/line-target-sync.test.ts
```

Working directory: `apps/next`

- [ ] **Step 2: Run project validation**

```powershell
npm run lint --workspace @ns-scrap-erp/next
npm run type-check --workspace @ns-scrap-erp/next
npm run build --workspace @ns-scrap-erp/next
git diff --check
```

- [ ] **Step 3: Review the final diff for security and scope**

Must prove:

- No secret/token literal, log, snapshot or response leak.
- No localStorage/sessionStorage usage.
- No DB migration or permission weakening.
- No fallback recipient.
- No unconfirmed LINE OA rotation or stale room reactivation.
- No A-database→B-webhook or B-database→A-webhook transport.
- No hardcoded LINE channel ID.
- No duplicated API endpoint.
- No unrelated dirty file staged.

- [ ] **Step 4: Run code review**

Review correctness, security, accessibility, responsive layout, error states and duplicated logic. Resolve all high/medium findings before closeout.

- [ ] **Step 5: Browser/UAT only when explicitly authorized**

Required viewport acceptance contract when requested:

| Viewport | Acceptance |
|---|---|
| Desktop 1440×900 | Status strip fits, 8/4 grid aligns, no misleading secret reveal, setup order obvious |
| Mobile 390×844 | One-column flow, no horizontal scroll, buttons/select are full-width and at least 40px high |

Real external checks must be done in this order and must not expose secrets:

1. On SIT, confirm the page says `OA A · SIT`, then complete Token → Save → Internal Webhook → LINE Verify → real event → selected target send.
2. On Production, confirm the page says `OA B · Production`, then repeat the same flow with B credentials and B endpoint.
3. Confirm the mock/automated cross-profile tests reject A→B and B→A before transport.
4. Confirm OA rotation impact when an identity actually changes within one environment.
5. Confirm each real send returns a LINE Request ID in its own environment.

- [ ] **Step 6: Pre-push safety when the user requests publication**

Fetch `sit-origin/main`, compare ancestry and changed files, semantically integrate newer SIT work, rerun affected validation, commit only intended files, and push to `sit-origin/main` without force-push or per-task branch creation.

## Acceptance Contract

Implementation is accepted only when all are true:

- Clicking an eye can reveal only a newly typed draft, never a stored Token/Secret.
- Stored credentials clearly show `Protected` and can be replaced/cancelled without losing other form edits.
- The UI visibly enforces Token validation → optional OA-change confirmation → Save → Internal Webhook → LINE Developers → Target → Real Send.
- SIT generates exactly `https://ns-erp-sit.vercel.app/api/line/webhook`.
- Production generates exactly `https://ns-erp.vercel.app/api/line/webhook`.
- The page visibly identifies `OA A · SIT` versus `OA B · Production` and shows whether data/Webhook profiles align.
- A known cross-environment profile mismatch is blocked before any signed request is sent.
- Signature rejection is reported as configuration stage `LINE_WEBHOOK_SIGNATURE_REJECTED`, not confused with ERP login 401.
- Internal webhook self-test performs no target/business writes.
- Real test send is available in Connection and still available per target.
- No active target means no send and no fallback.
- Multiple active targets without a default require explicit selection.
- Changing to a different OA cannot silently retain active targets/default/rules from the previous OA.
- Same-OA Token rotation preserves valid target/rule configuration.
- All editable fields follow the shared yellow-entry contract; protected/read-only fields remain neutral.
- Desktop/mobile layout follows the same page design language.
- Focused tests, lint, type-check, build and diff check pass.
- Final code review has no unresolved high/medium finding.

## Explicit Non-Goals

- No credential decryption/reveal API.
- No new database table or migration.
- No storage of token/secret in browser persistence.
- No hardcoded LINE Channel ID or secret; the only fixed environment identifiers live in the dedicated public A/B profile resolver and its tests.
- No automatic LINE Developers configuration; LINE does not expose this as an ERP-side setup action in this flow.
- No automatic real message send during save/test.
- No redesign of Targets, Rules, Queue and Analytics business behavior beyond shared theme consistency needed by the Connection flow.
- No production database separation/migration in this UI batch; the current B/local shared `fhglqymcdmrgbsbadnwr` backend remains a separately reported operational risk.
