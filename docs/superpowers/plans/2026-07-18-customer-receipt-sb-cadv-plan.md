# Customer Receipt SB/CADV Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้ `/sales/receipts` รับเงินจาก SB หรือ CADV ได้อย่าง explicit, รองรับหลายรายการใน RCP เดียว และแยกผลกระทบ AR/CADV ถูกต้อง

**Architecture:** คง flow และ allocation ของ SB เดิมไว้ เพิ่ม `customer_receipt_advance_allocations` เป็น fact table แยกสำหรับ CADV และเพิ่ม source-aware contract ใน schema/API/UI. ทุก create/cancel/reissue ทำใน Prisma transaction พร้อม lock และคำนวณ CADV status จากยอดจริงผ่าน helper กลาง

**Tech Stack:** Next.js App Router, React, TypeScript, Zod, Prisma, PostgreSQL/Supabase, Vitest

## Global Constraints

- ใช้ active app ใต้ `apps/next/` เท่านั้น
- ใช้ `dev-target` สำหรับ schema/migration และ validation ที่แตะ DB
- `sourceType` ต้องเป็น `SB` หรือ `CADV` เท่านั้น
- RCP หนึ่งใบเลือกได้หลายรายการ แต่ห้ามผสม SB/CADV
- ไม่มี fallback จาก `billId`, JSON snapshot, allocation คนละประเภท หรือ ref type อื่น
- SB ลด AR; CADV เพิ่ม received/available และไม่ลด AR
- allocation เป็น audit fact: cancel ใช้ status `cancelled` ไม่ลบ fact
- บันทึก RCP, allocation, bank statement, source update และ status log ใน transaction เดียว
- ห้ามแก้ไฟล์ที่ไม่เกี่ยวข้องเพื่อรองรับข้อมูล legacy ที่ผิด contract

## File Map

| File | Responsibility |
|---|---|
| `apps/next/prisma/schema.prisma` | Prisma model และ relation ของ CADV receipt allocation |
| `supabase/migrations/20260718_add_customer_receipt_advance_allocations.sql` | ตาราง, FK, index, constraint และ RLS/migration SQL |
| `apps/next/src/lib/daily.ts` | Zod contract และ TypeScript values สำหรับ source-aware receipt form |
| `apps/next/src/lib/server/customer-advance-settlement.ts` | helper คำนวณ received/available/status ของ CADV; ใช้หรือปรับให้รับ RCP event |
| `apps/next/src/lib/server/customer-receipts.ts` | prepare/create/cancel/reissue ของ SB/CADV ใน transaction |
| `apps/next/src/app/api/sales/receipts/route.ts` | GET queue/history และ POST/PATCH boundary |
| `apps/next/src/components/daily/MoneyMovementPageClient.tsx` | modal source selector, source lines, summary, state/reset/submit |
| `apps/next/src/lib/server/customer-receipts.test.ts` | domain transaction tests ถ้ามี test boundary นี้; หากไม่มีให้ใช้ route test |
| `apps/next/src/app/api/sales/receipts/route.test.ts` | API contract, queue/history และ error tests |
| `apps/next/src/lib/customer-advance.test.ts` | CADV status/capacity calculation regression |
| `docs/notes/Customer Advance Receipt Flow.md` | canonical business/page flow update |
| `docs/migration/00-current-work.md` | short active handoff only |

## Task 1: Lock the source-aware contract with failing tests

**Files:**
- Modify: `apps/next/src/lib/daily.ts:181-220`
- Test: `apps/next/src/app/api/sales/receipts/route.test.ts`
- Test: `apps/next/src/lib/customer-advance.test.ts`

**Interfaces:**
- Produces `CustomerReceiptSourceType = 'SB' | 'CADV'`.
- Produces `customerAdvanceReceiptLineSchema` with `customerAdvanceDocNo` and positive `receiptAmount`.
- Produces `customerReceiptFormSchema` refinement that enforces exactly one non-empty source line collection.

- [ ] **Step 1: Add red schema tests**

เขียน tests ที่ parse payload `SB`, `CADV`, mixed, missing source type, duplicate source lines และ zero/negative amount โดยคาดว่า mixed/missing/invalid จะ throw

- [ ] **Step 2: Run focused schema tests**

Run: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/app/api/sales/receipts/route.test.ts apps/next/src/lib/customer-advance.test.ts`

Expected: tests ใหม่ fail เพราะยังไม่มี `sourceType` และ CADV line schema

- [ ] **Step 3: Implement the minimal Zod contract**

เพิ่ม `sourceType`, `customerAdvanceLines`, line schema และ superRefine แบบ explicit; ห้าม map CADV เป็น `salesBillDocNo`

- [ ] **Step 4: Run focused tests**

Run the same Vitest command. Expected: schema tests pass; existing SB tests ต้องยัง pass

- [ ] **Step 5: Commit**

```bash
git add apps/next/src/lib/daily.ts apps/next/src/app/api/sales/receipts/route.test.ts apps/next/src/lib/customer-advance.test.ts
git commit -m "feat(receipts): define SB and CADV source contract"
```

## Task 2: Add the CADV receipt allocation fact table

**Files:**
- Create: `supabase/migrations/20260718_add_customer_receipt_advance_allocations.sql`
- Modify: `apps/next/prisma/schema.prisma` near `customer_receipt_allocations`
- Test: migration/schema contract test or SQL inspection under the existing migration test convention

**Interfaces:**
- Produces Prisma model `customer_receipt_advance_allocations`.
- Produces relation `customer_receipts.customer_receipt_advance_allocations` and `customer_advances.customer_receipt_advance_allocations`.

- [ ] **Step 1: Write migration contract assertions**

ตรวจชื่อ table, FK ไป `customer_receipts`/`customer_advances`, unique `(receipt_id, line_no)`, indexes และ status check ที่อนุญาต `active`/`cancelled`

- [ ] **Step 2: Create SQL migration**

สร้าง `id bigint generated by default as identity`, snapshot fields, `receipt_amount`, before/after received/available fields, audit fields, FK, unique และ indexes ตาม design spec

- [ ] **Step 3: Add Prisma model and relation fields**

ให้ relation names ตรงกันทั้งสอง model และใช้ `BigInt`/`Decimal`/`Timestamptz` ตาม schema ที่มีอยู่

- [ ] **Step 4: Generate/check Prisma client without applying production changes**

Run: `npx prisma validate --schema apps/next/prisma/schema.prisma` และ migration-specific check ต่อ dev-target ตาม environment rule

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260718_add_customer_receipt_advance_allocations.sql apps/next/prisma/schema.prisma
git commit -m "feat(db): add customer receipt advance allocations"
```

## Task 3: Extract and implement CADV settlement calculations

**Files:**
- Modify: `apps/next/src/lib/server/customer-advance-settlement.ts`
- Modify: `apps/next/src/lib/customer-advance.ts` only if shared pure calculation is missing
- Test: `apps/next/src/lib/customer-advance.test.ts`

**Interfaces:**
- Produces a transaction helper with explicit operations for receipt allocation and cancellation, accepting a Prisma transaction client and actor.
- Produces a pure status calculation that maps target/received/allocated/available to the existing CADV status codes.

- [ ] **Step 1: Add red tests for partial/full receipt and reversal**

ครอบคลุม target 1000 รับ 400 => received 400/available 400/partial, รับเพิ่ม 600 => received 1000/available 1000/received, cancel 400 => คืนค่ากลับก่อนรับ และ block amount > remaining

- [ ] **Step 2: Run tests and confirm failure**

Run: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/customer-advance.test.ts`

- [ ] **Step 3: Implement pure calculation and transaction helpers**

ใช้เงิน Decimal/rounding pattern เดิม, ตรวจ non-negative/over-allocation, update CADV พร้อม version increment และ status log snapshot; ไม่อัปเดต SB

- [ ] **Step 4: Run focused tests**

Expected: all CADV calculation tests pass and existing VAT/advance allocation tests remain green

- [ ] **Step 5: Commit**

```bash
git add apps/next/src/lib/server/customer-advance-settlement.ts apps/next/src/lib/customer-advance.ts apps/next/src/lib/customer-advance.test.ts
git commit -m "feat(cadv): calculate receipt capacity and status"
```

## Task 4: Extend receipt service for CADV create/cancel/reissue

**Files:**
- Modify: `apps/next/src/lib/server/customer-receipts.ts`
- Modify: `apps/next/src/lib/server/customer-advance-settlement.ts`
- Test: `apps/next/src/app/api/sales/receipts/route.test.ts`

**Interfaces:**
- `prepareCustomerReceipt()` branches on validated `sourceType` and returns source-specific prepared lines.
- `createCustomerReceiptInTransaction()` writes exactly one allocation table based on sourceType.
- `cancelCustomerReceiptInTransaction()` loads both allocation relations but processes only populated source relation; no source inference from missing rows.

- [ ] **Step 1: Add red service/API tests**

เพิ่ม test create CADV multi-line, no SB update, allocation rows, bank statement `RCP`, cancel reverse, and mixed-source rejection

- [ ] **Step 2: Run focused tests to confirm failure**

Run: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/app/api/sales/receipts/route.test.ts`

- [ ] **Step 3: Add source-specific preparation**

โหลด CADV ด้วย `doc_no`, verify customer/branch/status/remaining, calculate CADV gross/net and account split. SB path remains explicit existing behavior.

- [ ] **Step 4: Add CADV create transaction**

สร้าง header/bank statements once, insert `customer_receipt_advance_allocations` per line, call settlement helper per line, write status logs; do not create legacy SB `receipts` line for CADV unless an explicit separate legacy contract is defined by existing schema.

- [ ] **Step 5: Add CADV cancel/reissue transaction**

reverse only active CADV allocations, create `RCP-CANCEL` bank rows, restore CADV values/status, mark allocation cancelled, then reuse existing reissue wrapper

- [ ] **Step 6: Run focused tests**

Expected: SB regression and CADV tests pass together

- [ ] **Step 7: Commit**

```bash
git add apps/next/src/lib/server/customer-receipts.ts apps/next/src/lib/server/customer-advance-settlement.ts apps/next/src/app/api/sales/receipts/route.test.ts
git commit -m "feat(receipts): post and reverse CADV receipts"
```

## Task 5: Make GET/POST/PATCH API source-aware

**Files:**
- Modify: `apps/next/src/app/api/sales/receipts/route.ts`
- Modify: `apps/next/src/app/api/sales/receipts/route.test.ts`

**Interfaces:**
- GET returns `bills`, `customerAdvances`, `rows` with explicit `sourceType` and source-specific line arrays.
- POST/PATCH parse the shared schema and pass validated values to the service.

- [ ] **Step 1: Add red GET contract tests**

ตรวจว่า CADV queue คืนเฉพาะ status ที่รับได้และ `available_amount > 0`; history ระบุ sourceType และ CADV doc numbers แยกจาก SB

- [ ] **Step 2: Implement CADV queue query**

query `customer_advances` with active customer/branch scope and remaining capacity; do not derive queue from SB or generic receipt rows

- [ ] **Step 3: Extend history query**

include both relations explicitly and serialize `customerAdvanceLines` only from the new table

- [ ] **Step 4: Validate POST/PATCH error mapping**

source contract errors return 400; business conflicts return existing API error shape with document number

- [ ] **Step 5: Run route tests**

Run: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/app/api/sales/receipts/route.test.ts`

- [ ] **Step 6: Commit**

```bash
git add apps/next/src/app/api/sales/receipts/route.ts apps/next/src/app/api/sales/receipts/route.test.ts
git commit -m "feat(api): expose CADV receipt queue and history"
```

## Task 6: Update receipt modal and client state

**Files:**
- Modify: `apps/next/src/components/daily/MoneyMovementPageClient.tsx`
- Modify: `apps/next/src/lib/daily.ts`
- Test: component/contract tests adjacent to `MoneyMovementPageClient` if available

**Interfaces:**
- UI state stores `sourceType`, `salesBillLines`, and `customerAdvanceLines` separately.
- `selectedReceiptBillDocNos` and the new CADV selection set filter only the active source collection.
- submit sends explicit empty array for the inactive source collection.

- [ ] **Step 1: Add UI contract tests**

ตรวจ source selector, CADV line label, no mixed lines, CADV summary not showing `ตัดหนี้ AR`, and reset state returns source type/default lines

- [ ] **Step 2: Add source selector to ข้อมูลใบรับเงิน**

วาง dropdown ก่อน section เอกสารต้นทาง; changing source type clears incompatible lines and recalculates summary

- [ ] **Step 3: Render SB source section**

คง combobox/amount/WHT/discount behaviorเดิมโดยอ่านจาก `salesBillLines` เท่านั้น

- [ ] **Step 4: Render CADV source section**

ใช้ `customerAdvances` จาก GET, แสดง target/received/available, เพิ่มหลายบรรทัด, รับเฉพาะยอดที่เหลือ และไม่แสดง WHT/discount ที่ไม่มีความหมายกับ CADV

- [ ] **Step 5: Update summary and submit/reset**

ใช้ labels ตาม sourceType, validate split total, send source-aware payload, reload queue/history after success, and keep existing edit/cancel behavior

- [ ] **Step 6: Run lint/type-check for touched UI**

Run: `npm run lint --workspace @ns-scrap-erp/next` and `npm run type-check --workspace @ns-scrap-erp/next`

- [ ] **Step 7: Commit**

```bash
git add apps/next/src/components/daily/MoneyMovementPageClient.tsx apps/next/src/lib/daily.ts
git commit -m "feat(ui): support SB and CADV receipt sources"
```

## Task 7: End-to-end regression, docs, and handoff

**Files:**
- Modify: `docs/notes/Customer Advance Receipt Flow.md`
- Modify: `docs/migration/00-current-work.md`
- Test: existing receipt/CADV test files from Tasks 1-6

- [ ] **Step 1: Update canonical flow note**

บันทึกว่า RCP เป็นเหตุการณ์รับเงินจริง, SB/CADV เป็น source type คนละประเภท, CADV RCP ไม่ลด AR, และ cancel/reissue reverse ตาม allocation fact

- [ ] **Step 2: Run focused regression**

Run: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/app/api/sales/receipts/route.test.ts apps/next/src/lib/customer-advance.test.ts`

Expected: all receipt/CADV tests pass

- [ ] **Step 3: Run repository checks**

Run: `git diff --check`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, and `npm run build --workspace @ns-scrap-erp/next`

- [ ] **Step 4: Update active handoff**

ให้ `00-current-work.md` เหลือ objective, batch, files, validation result, blockers และ next task เท่านั้น; ย้ายรายละเอียดเสร็จแล้วไว้ใน tracker/spec

- [ ] **Step 5: Commit documentation and validation checkpoint**

```bash
git add docs/notes/Customer\ Advance\ Receipt\ Flow.md docs/migration/00-current-work.md
git commit -m "docs(receipts): record SB and CADV receipt flow"
```

## Execution Order

ทำตามลำดับ `Task 1 -> Task 2 -> Task 3 -> Task 4 -> Task 5 -> Task 6 -> Task 7` เพราะ schema และ contract ต้องพร้อมก่อน service, API และ UI. แต่ละ task ต้องผ่าน test ของตัวเองก่อนเริ่ม task ถัดไป

## Review Checklist

- [ ] ไม่มี payload ที่ไม่มี sourceType
- [ ] ไม่มี query ที่รวม SB/CADV แล้วให้ client เดา
- [ ] ไม่มี path ที่ CADV ไป update `sales_bills`
- [ ] ไม่มี path ที่ SB ไป update `customer_advances`
- [ ] cancel/reissue ใช้ allocation ที่บันทึกจริง
- [ ] status CADV สอดคล้องกับยอดจริง
- [ ] RCP หลาย line ใช้ line_no แยกและไม่ซ้ำ
- [ ] tests ครอบคลุม partial/full/over-allocation/cancel/mixed/customer mismatch/concurrency
