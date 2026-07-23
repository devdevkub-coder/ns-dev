# WTI Concurrent Draft Auto-save Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with focused commits and validation after each task.

**Goal:** ให้ผู้ใช้ 2 คนจาก 2 ตราชั่งเพิ่มและแก้รายการสินค้า เต๋า น้ำหนัก รูป และสิ่งเจือปนใน WTI draft เดียวกันได้โดยไม่เขียนทับข้อมูลกัน พร้อม auto-save และ realtime refresh

**Architecture:** ใช้ WTI line-level operations เป็น source of truth แทนการส่งฟอร์มทั้งเอกสารไป rebuild ทุกครั้ง. Server จะสร้าง/แก้/ลบ line และคำนวณ summary ใน transaction; client จะ merge event ตาม line id และ resync เมื่อ event ขาดหรือ reconnect. Manual fields ของหัวเอกสารยังใช้ PUT/ปุ่มบันทึกเดิม.

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma/PostgreSQL, Supabase Realtime, Zod, Vitest.

## Global Constraints

- ขอบเขต runtime รอบนี้คือ `WTI` เท่านั้น; ห้ามเปิด concurrent update หรือเปลี่ยน stock behavior ของ `WTO`
- WTI draft ไม่เขียน stock ledger และ confirm/cancel/downstream flow เดิมต้องคง contract
- Database เป็น source of truth; realtime เป็น event delivery ไม่ใช่แหล่งข้อมูลถาวร
- API ที่มี auth/transaction data ต้องคง `private, no-store`
- ไม่เก็บ binary รูปใน browser cache หรือ realtime payload; ใช้ storage key/metadata เดิม
- ห้ามใช้ full-document PUT ใน auto-save path

## File Map

- Modify `apps/next/prisma/schema.prisma` and add one migration under `apps/next/prisma/migrations/`: concurrency/version/idempotency data only
- Create `apps/next/src/lib/server/weight-ticket-write/wti-draft.ts`: WTI line operation transaction and summary rebuild boundary
- Create `apps/next/src/app/api/daily/weight-tickets/[id]/lines/route.ts`: add/update/delete line operation API
- Modify `apps/next/src/app/api/daily/weight-tickets/route.ts`: create WTI draft from the first line operation
- Modify `apps/next/src/app/api/daily/weight-tickets/[id]/route.ts`: limit manual PUT to header fields and preserve existing WTI/WTO confirm/cancel behavior
- Create `apps/next/src/lib/weight-ticket-realtime.ts`: client event envelope, operation ids, merge/resync helpers
- Modify `apps/next/src/components/daily/WeightTicketFormCore.tsx`: WTI-only auto-save state, manual dirty state, line operation dispatch and realtime merge
- Modify `apps/next/src/components/daily/WeightTicketAttachmentGrid.tsx` only if the existing upload/delete callback boundary cannot dispatch line operations
- Add focused tests beside server/client modules and update the WTI flow note after validation

---

### Task 1: Establish the database and operation contract

**Files:**
- Modify: `apps/next/prisma/schema.prisma`
- Create: `apps/next/prisma/migrations/YYYYMMDDHHMMSS_wti_concurrent_draft_operations/migration.sql`
- Test: `apps/next/src/lib/server/weight-ticket-write/wti-draft.test.ts`

**Interfaces:**
- Operation input: `{ documentId: bigint; actor: string; operationId: string; lineId?: bigint; expectedVersion?: number; action: 'add' | 'update' | 'delete' }`
- Operation result: `{ documentVersion: number; lineVersion?: number; changedLineIds: bigint[]; summaryVersion: number }`

- [ ] Confirm current database identifiers and choose the smallest additive schema: document version, line version, and unique operation id scoped to document/actor.
- [ ] Add migration constraints/indexes so a retry with the same operation id returns the prior result instead of inserting duplicate data.
- [ ] Add Prisma fields and generate the client.
- [ ] Add failing tests for same-document append, stale line version, and repeated operation id.
- [ ] Run `npm run type-check --workspace @ns-scrap-erp/next` and the focused test file.
- [ ] Commit: `feat(wti): add concurrent draft operation contract`.

### Task 2: Implement transactional WTI line writes

**Files:**
- Create: `apps/next/src/lib/server/weight-ticket-write/wti-draft.ts`
- Modify: `apps/next/src/lib/server/weight-tickets.ts`
- Test: `apps/next/src/lib/server/weight-ticket-write/wti-draft.test.ts`

**Interfaces:**
- `createWtiDraftLine(tx, input): Promise<WeightTicketOperationResult>`
- `updateWtiDraftLine(tx, input): Promise<WeightTicketOperationResult>`
- `deleteWtiDraftLine(tx, input): Promise<WeightTicketOperationResult>`
- `rebuildWtiDraftSummaries(tx, weightTicketId): Promise<void>`

- [ ] Reuse existing WTI supplier/product/impurity validation and `buildWeightTicketLineRows` without applying WTO warehouse or pending-out side effects.
- [ ] Lock the WTI document row inside the transaction, reject non-draft or downstream-used documents, and increment document/line version only after a successful write.
- [ ] Allocate the next `line_no` under the document lock so two scales can append simultaneously without a unique-key race.
- [ ] Rebuild `weight_ticket_product_summaries` and bridge rows from all current WTI lines after each operation.
- [ ] Store an append-only audit/status event for each operation with actor, operation id, line id, and changed fields.
- [ ] Return the changed line, current summary, document version, and event sequence needed by the client.
- [ ] Test concurrent append semantics, stale update rejection, delete idempotency, summary totals, impurity relations, and `สินค้าอื่น` behavior.
- [ ] Commit: `feat(wti): add transactional line operations`.

### Task 3: Add WTI line operation APIs

**Files:**
- Create: `apps/next/src/app/api/daily/weight-tickets/[id]/lines/route.ts`
- Modify: `apps/next/src/app/api/daily/weight-tickets/route.ts`
- Modify: `apps/next/src/app/api/daily/weight-tickets/[id]/route.ts`
- Test: `apps/next/src/app/api/daily/weight-tickets/wti-concurrency.contract.test.ts`

- [ ] Add `POST /api/daily/weight-tickets/{docNo}/lines` for append line/impurity operation.
- [ ] Add `PATCH /api/daily/weight-tickets/{docNo}/lines/{lineId}` for line/weight/impurity updates with `expectedVersion`.
- [ ] Add `DELETE /api/daily/weight-tickets/{docNo}/lines/{lineId}` with idempotent delete behavior.
- [ ] Add an explicit WTI first-line create path that creates the draft and appends the first line in one transaction; preserve the existing full POST for non-concurrent/manual compatibility until the client switches over.
- [ ] Restrict existing PUT to manual header fields and ensure it cannot delete/recreate WTI lines or summaries.
- [ ] Return `409` with the latest document/line snapshot for stale conflicts and `423`/`409` for locked documents according to the existing API error style.
- [ ] Add tests for two simultaneous appends, one stale update, duplicate operation retry, and WTI-only type guard.
- [ ] Commit: `feat(wti): expose line operation APIs`.

### Task 4: Add realtime event and resync contract

**Files:**
- Create: `apps/next/src/lib/weight-ticket-realtime.ts`
- Create: `apps/next/src/lib/server/weight-ticket-realtime.ts`
- Modify: `apps/next/src/app/api/daily/weight-tickets/[id]/lines/route.ts`
- Test: `apps/next/src/lib/weight-ticket-realtime.test.ts`

- [ ] Define event envelope `{ documentId, documentVersion, eventId, operationId, actor, action, lineIds, summary, occurredAt }` without binary image data.
- [ ] Broadcast only after the database transaction commits; use the existing Supabase server/client setup and document-scoped channel.
- [ ] Add client merge rules keyed by `line_id` and ignore duplicate/older event sequence numbers.
- [ ] Add GET resync helper that reloads the current WTI document when sequence gaps or reconnect occur.
- [ ] Test event serialization, stale event rejection, duplicate event handling, and resync trigger.
- [ ] Commit: `feat(wti): add draft realtime synchronization`.

### Task 5: Connect WTI form auto-save

**Files:**
- Modify: `apps/next/src/components/daily/WeightTicketFormCore.tsx`
- Modify: `apps/next/src/components/daily/WeightTicketsPageClient.tsx` only if modal lifecycle needs a document id callback
- Modify: `apps/next/src/lib/weight-tickets.ts` for typed line operation clients
- Test: `apps/next/src/components/daily/WeightTicketFormCore.autosave.test.tsx`

- [ ] Enable auto-save only when `form.type === 'WTI'` and the document is draft.
- [ ] On first `เพิ่มสินค้า`/`เพิ่มเต๋า`, create the WTI draft and retain the returned document id without navigating away.
- [ ] Dispatch add/update/delete operations for product, weight, image, and impurity changes; debounce only active numeric text entry, not completed add/delete actions.
- [ ] Keep manual dirty state separate for branch, supplier, vehicle, godown, remark, and other header fields; show confirmation before cancel if manual state is dirty.
- [ ] Merge realtime lines/summaries without replacing local text currently being edited, and show save/conflict/error indicators.
- [ ] Freeze both clients after `received`/`cancelled` and reload on reconnect.
- [ ] Test add/delete/impurity/image auto-save, manual cancel confirmation, two-client append merge, stale conflict UI, and retry state.
- [ ] Commit: `feat(wti): enable concurrent draft autosave in form`.

### Task 6: Validate and prepare SIT promotion

**Files:**
- Modify: `docs/notes/WTI-WTO Flow.md`
- Modify: `docs/migration/00-current-work.md`
- Test: focused WTI suite and workspace validation commands

- [ ] Run focused unit/contract tests for database/service/API/client behavior.
- [ ] Run `npm run lint --workspace @ns-scrap-erp/next`.
- [ ] Run `npm run type-check --workspace @ns-scrap-erp/next`.
- [ ] Run `npm run build --workspace @ns-scrap-erp/next` and record any pre-existing blocker separately.
- [ ] Run `git diff --check` and inspect `git diff --name-status sit-origin/main...HEAD` to prove only this feature is included.
- [ ] Apply the migration to dev-target first, verify schema and focused integration checks, then apply the same migration to SIT according to the repository migration-drift procedure.
- [ ] Push only `codex/wti-concurrent-autosave` to `sit-origin` using the verified SIT promotion path; do not mutate `origin` or customer UAT.
- [ ] Record the branch, commits, migration version, validation results, and remaining browser/UAT risk in the handoff note.

## Self-review

- Spec coverage: covers WTI-only scope, line-level auto-save, two-scale append, conflict handling, realtime, reconnect, manual-save cancel behavior, summary rebuild, and SIT promotion.
- Placeholder scan: no runtime task is left as TBD/TODO; migration timestamp is generated when the migration task is executed.
- Type consistency: all operation results share `documentVersion`, `changedLineIds`, and `summaryVersion`; later tasks consume the same event envelope and operation ids.
