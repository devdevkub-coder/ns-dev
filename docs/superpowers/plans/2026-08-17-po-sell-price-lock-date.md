# PO Sell Price-Lock Date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ให้ PO Sell ใช้วันที่ล็อคราคาเป็น business date ที่ผู้ใช้เลือกเองในฟอร์ม รายการ ตัวกรอง เอกสารพิมพ์ export และ downstream readers โดยแยก `created_at` ไว้เป็น audit log เท่านั้น

**Architecture:** ใช้คอลัมน์เดิม `po_sells.date` เป็น source of truth ของ `priceLockDate` และเพิ่มชื่อ field ที่ชัดเจนใน shared form/API/read model. `po_sells.created_at`/`updated_at` ยังคงเป็น server audit timestamps ที่ไม่ถูกนำมาแสดงแทน business date. ปรับเฉพาะ PO Sell contracts และ consumers ที่อ่าน PO Sell; ไม่เพิ่ม migration หรือแก้ข้อมูลเดิม.

**Tech Stack:** Next.js App Router, React/TypeScript, Prisma, Zod, Vitest, existing `DatePickerInput`, XLSX exporter, HTML print builder.

## Global Constraints

- Active implementation target is `apps/next/`.
- `po_sells.date` is the only stored price-lock date; do not add a column or fallback to `created_at`.
- `created_at` is immutable creation audit; `updated_at`/`updated_by` remain update audit.
- Customer-facing document/list wording must say `วันที่ล็อคราคา`; audit wording must say `สร้างเอกสารเมื่อ` or equivalent.
- Existing permissions, status, downstream allocation, stock, AR, and print pagination behavior must not change.
- Preserve unrelated dirty WTI/WTO and documentation changes; stage only files belonging to this task.
- Do not run browser UAT unless the user separately requests it.

---

### Task 1: Lock the shared date contract and tests

**Files:**
- Modify: `apps/next/src/lib/sales.ts:136-154`
- Test: `apps/next/src/lib/sales.test.ts` (create if the existing module test file is absent)

**Interfaces:**
- Produces `PoSellFormValues.priceLockDate: string` for the client and API.
- Keeps `PoSellFormValues.expectedDelivery` as a separate required date.

- [ ] **Step 1: Write failing schema tests**

Add tests that parse a valid PO Sell with `priceLockDate: '2026-08-17'`, reject an empty value with a Thai price-lock error, and reject a malformed value such as `'17/08/2026'`.

- [ ] **Step 2: Run the focused schema test**

Run: `npm run test --workspace @ns-scrap-erp/next -- src/lib/sales.test.ts`

Expected: the new price-lock tests fail because the field is not in the schema.

- [ ] **Step 3: Add the required field**

Extend `poSellFormSchema` with `priceLockDate: requiredDate` beside `expectedDelivery`. Keep the existing `poSellPageFormSchema` extension for required branch.

- [ ] **Step 4: Run the focused schema test again**

Run: `npm run test --workspace @ns-scrap-erp/next -- src/lib/sales.test.ts`

Expected: all price-lock schema tests pass.

- [ ] **Step 5: Run diff validation**

Run: `git diff --check`

Expected: no whitespace errors.

### Task 2: Update the PO Sell API business/audit separation

**Files:**
- Modify: `apps/next/src/app/api/sales/po-sell/route.ts:95-210, 696-930, 938-1068, 1080-1265`
- Test: `apps/next/src/app/api/sales/po-sell/route.test.ts` (create if no focused route test exists)

**Interfaces:**
- GET row produces `priceLockDate`, `createdAt`, `createdBy`, `updatedAt`, and `updatedBy`.
- POST/PATCH consume the shared `priceLockDate` field.

- [ ] **Step 1: Write failing API contract tests**

Cover these exact invariants with mocked Prisma/context calls:

```ts
expect(create.data.date).toEqual(new Date('2026-08-10'))
expect(create.data.created_at).not.toEqual(create.data.date)
expect(update.data.date).toEqual(new Date('2026-08-12'))
expect(update.data.created_at).toBeUndefined()
expect(getRow.priceLockDate).toBe('2026-08-10')
expect(getRow.createdAt).toContain('T')
```

Also add a GET filter assertion that `from`/`to` build a `date` predicate rather than a `created_at` predicate.

- [ ] **Step 2: Run the focused route tests**

Run: `npm run test --workspace @ns-scrap-erp/next -- src/app/api/sales/po-sell/route.test.ts`

Expected: the new tests fail against the current created-at mapping.

- [ ] **Step 3: Separate GET response and date range**

Rename the response field used as business date to `priceLockDate`, map it from `toDateOnly(po.date)`, retain `createdAt` from `po.created_at`, and change `createdAtDateRange`/where construction to a `date` range. Order list rows by `date desc, doc_no desc`.

- [ ] **Step 4: Map POST values**

Normalize `values.priceLockDate` once. Pass that date to `nextPoSellDocNo`, `po_sells.date`, and the effective VAT-rate lookup. Keep `createdAt = new Date()` for `created_at`, `updated_at`, and audit actor fields.

- [ ] **Step 5: Map PATCH values**

Normalize `values.priceLockDate` and write only `date` for the business date. Do not include `created_at` in the update data. Keep the existing downstream-lock, branch, customer, product, status, and version guards unchanged.

- [ ] **Step 6: Update XLSX mapping**

Rename the exported business-date column to `วันที่ล็อคราคา`/`PriceLockDate` and source it from `row.priceLockDate`. Do not export `createdAt` under the business-date heading.

- [ ] **Step 7: Run focused route tests**

Run: `npm run test --workspace @ns-scrap-erp/next -- src/app/api/sales/po-sell/route.test.ts`

Expected: all separation, filter, order, POST, PATCH, and export tests pass.

### Task 3: Update create/edit/list/detail UI

**Files:**
- Modify: `apps/next/src/components/sales/PoSellPageClient.tsx:39-190, 420-525, 617-650, 880-1010, 1037-1080, 1321-1495, 1618-1690`
- Test: `apps/next/src/components/sales/PoSellPageClient.test.ts`

**Interfaces:**
- UI form reads/writes `PoSellFormValues.priceLockDate`.
- List/detail rows read `PoSellRow.priceLockDate` for business date and `createdAt` only for audit.

- [ ] **Step 1: Write failing source-contract tests**

Add assertions that the source contains a required `วันที่ล็อคราคา` date picker, uses `priceLockDate` in the list column and detail document field, and has a separate `สร้างเอกสารเมื่อ`/audit display. Assert that the main table does not retain the old `วันที่สร้าง` business-date header.

- [ ] **Step 2: Run the focused component contract tests**

Run: `npm run test --workspace @ns-scrap-erp/next -- src/components/sales/PoSellPageClient.test.ts`

Expected: the new assertions fail before the UI contract is changed.

- [ ] **Step 3: Extend row and initial-form types**

Add `priceLockDate` to `PoSellRow`; add it to `initialPoSellForm`. Set create and Sales Plan defaults with the existing Bangkok date helper. In `openEditForm`, hydrate it from the row.

- [ ] **Step 4: Render the form field**

Add a required `DatePickerInput` labelled `วันที่ล็อคราคา`, wired to `onUpdate('priceLockDate', value)` and `errors.priceLockDate`. Keep `วันส่งมอบ` wired to `expectedDelivery`.

- [ ] **Step 5: Change list and mobile surfaces**

Rename the column key to `priceLockDate`, update header/body/sort labels, update mobile card date text, and leave `อัปเดตล่าสุด` sourced from `updatedAt`/`updatedBy`.

- [ ] **Step 6: Split detail document and audit fields**

Show `วันที่ล็อคราคา` in the document group. Add or retain a separate audit group for creation and update timestamps. Never use `createdAt` as the document date.

- [ ] **Step 7: Run focused UI tests**

Run: `npm run test --workspace @ns-scrap-erp/next -- src/components/sales/PoSellPageClient.test.ts`

Expected: source-contract and existing table-action tests pass.

### Task 4: Update PO Sell print contract and tests

**Files:**
- Modify: `apps/next/src/lib/po-sell-print.ts:19-240`
- Modify: `apps/next/src/components/sales/PoSellPageClient.tsx` only where the print row contract is passed
- Test: `apps/next/src/lib/document-print-contract.test.ts`

**Interfaces:**
- `PoSellPrintDocument.priceLockDate` is the customer-facing document date.
- `PoSellPrintDocument.createdAt` remains available only for separately-labelled audit output if one is intentionally retained.

- [ ] **Step 1: Add failing print assertions**

Build a fixture with different values (`priceLockDate = 2026-08-10`, `createdAt = 2026-08-17T10:00:00Z`) and assert that generated HTML labels the document date `วันที่ล็อคราคา`, contains the lock date, and does not use the creation date as that field. Keep existing pagination and WYSIWYG assertions.

- [ ] **Step 2: Run focused print tests**

Run: `npm run test --workspace @ns-scrap-erp/next -- src/lib/document-print-contract.test.ts`

Expected: the new date-source assertions fail.

- [ ] **Step 3: Change the print type and template**

Add `priceLockDate` to the type, use it in the document metadata block, and change visible wording from creation date to price-lock date. Do not expose `createdAt` as a customer-facing document date or approval date.

- [ ] **Step 4: Run focused print tests**

Run: `npm run test --workspace @ns-scrap-erp/next -- src/lib/document-print-contract.test.ts`

Expected: print date-source, wording, pagination, and layout tests pass.

### Task 5: Verify downstream date consumers and update flow documentation

**Files:**
- Modify: `docs/notes/PO Sell Flow.md` (Date Contract, Create Flow, Edit Flow, validation checklist)
- Modify: `docs/migration/00-current-work.md` (compact active checkpoint only)
- Inspect without changing unless a contract mismatch is found: `apps/next/src/lib/server/main-sales-control.ts`, `apps/next/src/lib/server/dual-costing-management.ts`, `apps/next/src/lib/server/sales-plans.ts`, PO outstanding readers, and Sales Bill PO readers

- [ ] **Step 1: Search all PO Sell date consumers**

Run:

```bash
rg -n "po_sells|po\.date|created_at|createdAt|วันที่สร้าง|วันที่ล็อคราคา" apps/next/src docs/notes/PO\ Sell\ Flow.md
```

Classify each hit as business-date or audit-date. Any business-date reader using `created_at` must be changed to `date`; pure audit log usage must remain unchanged.

- [ ] **Step 2: Update the canonical flow note**

Replace the old Date Contract that calls `created_at` the user-facing document date. Document `priceLockDate -> po_sells.date`, `createdAt -> created_at`, filter/sort/export/print behavior, document-number policy, and the no-migration legacy-data rule.

- [ ] **Step 3: Update the compact handoff**

Record the active batch, expected files, validation commands, no-migration scope, and remaining risk in `00-current-work.md` without appending a long history log.

- [ ] **Step 4: Run documentation validation**

Run: `git diff --check`

Expected: no whitespace errors and the flow note contains no contradictory created-date contract.

### Task 6: Full validation and mandatory code review

**Files:**
- Review all files changed by Tasks 1-5

- [ ] **Step 1: Run focused regression suite**

Run the schema, route, page, print, and existing PO Sell-related tests together. Expected: all pass.

- [ ] **Step 2: Run workspace lint**

Run: `npm run lint --workspace @ns-scrap-erp/next`

Expected: zero new errors; existing unrelated warnings must be recorded separately.

- [ ] **Step 3: Run workspace type-check**

Run: `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`

Expected: zero type errors.

- [ ] **Step 4: Run production build**

Run: `npm run build --workspace @ns-scrap-erp/next`

Expected: successful production build.

- [ ] **Step 5: Run final diff check and inspect scope**

Run:

```bash
git diff --check
git diff --stat -- apps/next/src/lib/sales.ts apps/next/src/app/api/sales/po-sell/route.ts apps/next/src/components/sales/PoSellPageClient.tsx apps/next/src/lib/po-sell-print.ts apps/next/src/lib/document-print-contract.test.ts docs/notes/PO\ Sell\ Flow.md docs/migration/00-current-work.md
```

Expected: only the intended PO Sell and documentation files are included; unrelated dirty files remain unstaged.

- [ ] **Step 6: Perform code review before completion**

Review type signatures, null handling, date normalization, timezone boundaries, document-number prefix date, audit immutability, wording, mobile/table alignment, export/print source, and downstream business-date consumers. Report findings and remaining risks before claiming completion.

- [ ] **Step 7: Commit only the intended batch**

Stage only the files listed in the final diff scope, verify staged names, and create a focused commit. Do not push or deploy until the user explicitly requests it and the relevant delivery rule has been read.
