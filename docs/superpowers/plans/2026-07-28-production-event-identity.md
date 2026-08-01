# Production Event Identity Implementation Plan
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task.

**Goal:** เปลี่ยน production flow ให้ `PO` เป็นเลขเอกสารธุรกิจเพียงตัวเดียว ส่วนการเบิกวัตถุดิบ รับผลผลิต คืนวัตถุดิบ และยกเลิกผลผลิตเป็น event ภายใน PO โดยเลข PO ต้องมีรหัสสาขา และรอบรับผลผลิตแสดงเป็น `PO<branch><YYMM>-####/NN`

**Architecture:** ใช้ `production_orders.doc_no` เป็น business document; เพิ่ม identity ของ event/รอบแยกจากเลขเอกสารใน production tables; ให้ stock ledger และ cost pool อ้าง `PO` เป็น `ref_no/source_ref_no` และอ้าง row/event id เป็น `ref_id/source_ref_id`; ห้ามสร้างหรืออ่านเลข `PI`, `PO2`, `PI-REV`, `PO2-REV` ใน flow ใหม่ และห้ามเพิ่ม fallback ให้ข้อมูลไม่ครบ

**Tech Stack:** Next.js App Router, TypeScript, Prisma/PostgreSQL, Zod, Vitest

## Global Constraints

- ไม่ backfill หรือปรับข้อมูลเก่า; migration/schema ใช้กับ flow ใหม่และไม่เพิ่ม compatibility branch
- ไม่ restore route reverse ที่ถูกลบ; ใช้ input return และ output void ที่เป็น flow ปัจจุบัน
- `WTI`/`WTO` ยังคงเป็นเอกสารจริงที่ผู้ใช้สร้างและอ้างอิงได้
- Stock ledger ยังต้องเขียนทุก stock fact แต่ reference ต้องชี้กลับ PO + event identity
- แก้เฉพาะ active app ใน `apps/next/`; ไม่แตะ legacy เพื่อให้รองรับ contract ใหม่
- ทุก batch ต้องมี focused unit/contract tests ก่อนรวมเข้าชุด validation ใหญ่

## Batch 1: Domain Contract And Unit Tests

### Task 1: Add production event identity helpers

- Add `apps/next/src/lib/server/production-event.ts`.
- Define event kinds for material issue, material return, output round, output void, and loss.
- Implement strict helpers for PO round display, event reference construction, and validation of a PO document number.
- Keep formatting deterministic and reject blank/invalid PO or non-positive round numbers.

### Task 2: Cover the contract with unit tests

- Add `apps/next/src/lib/server/production-event.test.ts`.
- Test branch-coded PO format, round display `/01` and `/02`, event identity stability, invalid inputs, and the absence of PI/PO2 document generation.
- Run the focused Vitest file and `git diff --check`.

## Batch 2: Database And Write Paths

### Task 3: Add event/round storage without old-data backfill

- Add a migration and Prisma model fields for an event group/round identity shared by all output lines in one posting.
- Store production input and output event identity separately from the PO document number.
- Preserve row ids for line identity and add indexes/uniqueness needed to allocate the next output round inside the order transaction.
- Do not populate old rows and do not make runtime reads branch on whether old fields are populated.

### Task 4: Refactor production writes

- PO creation continues to use the strict branch code and remains the only production document generator.
- Input posting creates an internal event under the PO, without generating `PI`.
- Output posting allocates the next round for the PO and writes the same event identity to every line, without generating `PO2`.
- Input return and output void reference the original event; they create reversal ledger movements without generating `PI-REV` or `PO2-REV`.
- Return explicit PO/event identifiers from service functions and keep all writes transactional.

### Task 5: Test write contracts

- Extend focused production service/route tests to assert no PI/PO2/reversal document generator is called.
- Assert all ledger rows use the PO in `ref_no` and event identity in `ref_id`.
- Assert all output lines in one posting share one round/event identity and void targets only that event.

## Batch 3: API, UI, History, And Filters

### Task 6: Update API response contracts

- Replace input/output document labels with PO/event labels while keeping stable IDs for actions.
- Return output round display values such as `PO012607-0001/01` and the underlying event id where needed.
- Update route params, validation, timeline metadata, search, grouping, and filter contracts to operate within a PO.

### Task 7: Update production pages

- Update `ProductionOrdersPageClient` history, detail, void, return, and modal wording to show PO and event/round context.
- Update reconciliation and production report pages to group by PO and classify internal movements by event kind, with no PO2 document wording.
- Keep table filters for branch and PO; do not expose internal database ids as user-facing document numbers.

### Task 8: Test API/UI contracts

- Add/extend route contract tests for serialization, event grouping, filter/search behavior, and void/return target validation.
- Add pure component/contract tests where the page derives display labels or reconciliation groups.

## Batch 4: Ledger, Cost Pool, And Reports

### Task 9: Normalize references

- Update stock ledger indexes, movement-type contracts, cost pool source references, reconciliation labels, and report joins to use PO + event id.
- Keep historical data out of the new runtime contract rather than adding fallbacks or silent coercion.
- Ensure output void dependency checks exclude only the current PO event movements and still detect later real consumption.

### Task 10: Verify finance/stock impact

- Add focused tests for WIP issue, WIP return, output receipt, loss, output void, cost-pool allocation, and reconciliation balance.
- Run the stock-ledger write-path QA script and production report contract tests.

## Batch 5: Validation And Documentation

### Task 11: Run validation

- Focused Vitest suites for every changed batch.
- `npm run lint --workspace @ns-scrap-erp/next`.
- `npm run type-check --workspace @ns-scrap-erp/next`.
- `npm run build --workspace @ns-scrap-erp/next` when schema/API batches are complete.
- `git diff --check` and stock ledger write-path QA.

### Task 12: Update operational docs

- Update `docs/migration/00-current-work.md` with the active batch, decision, write areas, and next validation only.
- Archive completed checkpoints in the production tracker/notes.
- [x] Update production flow, user guide, API/data dictionary notes, and migration status to explain what PO/event/round/ledger references mean and why they are separate.
- [ ] Run authenticated browser UAT and read-only duplicate/unique audit before promotion. Old test data is intentionally not migrated/backfilled.

## Completion Criteria

- A new production order has a branch-coded PO.
- No new production flow emits PI, PO2, PI-REV, or PO2-REV as documents.
- Output lines in one posting display one PO round, for example `PO012607-0001/01`.
- Ledger and cost pool retain traceability to both PO and internal event id.
- No fallback path is added for missing branch/event identity.
- Focused unit tests and the required workspace validation pass, with any pre-existing unrelated failures reported explicitly.
