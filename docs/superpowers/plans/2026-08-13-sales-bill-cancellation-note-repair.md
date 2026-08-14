# Sales Bill Cancellation Note Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Work inline on the existing SIT-aligned working line; do not create a branch/worktree or delegate unless the user explicitly requests it. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** หยุดไม่ให้เหตุผลยกเลิก Sales Bill เขียนทับหมายเหตุระดับสินค้า และซ่อมเฉพาะข้อมูล SIT เก่าที่พิสูจน์ย้อนกลับได้โดยไม่แตะ Stock, WTO, ต้นทุน หรือ allocation amounts

**Architecture:** ให้ `sales_bill_lines.notes` เป็นหมายเหตุธุรกิจของสินค้าเท่านั้น ส่วนเหตุผลยกเลิกใช้ `sales_bills.cancel_note` และ `sales_bill_status_logs.note` เป็น source of truth แยกกันชัดเจน ทั้งสอง cancel API paths ต้องใช้ helper เดียวที่เปลี่ยนเฉพาะสถานะ/ผู้แก้/เวลาใน line facts แล้วใช้ one-time repair script แบบ dry-run ก่อน, exact-match, fingerprint gate และ transaction สำหรับข้อมูลเก่า

**Tech Stack:** Next.js App Router, TypeScript, Prisma, PostgreSQL/Supabase SIT, Zod, Vitest, Node `crypto`, ESLint

## Global Constraints

- รอบ implementation แก้เฉพาะ Sales Bill cancellation note ownership และข้อมูลเก่าที่ตรง exact predicate เท่านั้น
- Production (`fhglqymcdmrgbsbadnwr`) เป็น read-only และห้ามใช้ repair script นี้กับ Production
- Apply data repair ได้เฉพาะ SIT (`vbjlkxbytccklhqvxjuu`) หลัง dry-run และผู้ใช้อนุญาตให้เริ่ม implementation แล้วเท่านั้น
- ไม่เปลี่ยน REST payload/response, Prisma schema, migration, DB constraint, Storage, Redis, browser cache หรือ permission
- ไม่เปลี่ยนสูตรยอดขาย, COGS, GP, WAC, Stock Ledger, WTO pending-out, PO Sell, Customer Advance หรือ allocation amount/status contract
- คง cancellation audit ที่ `trading_allocation_facts.notes`, `sales_bill_source_allocations.notes`, `sales_bill_po_sell_allocations.notes` และ `sales_bill_customer_advance_allocations.notes`; รอบนี้ไม่ล้างข้อความจาก fact/allocation tables
- `sales_bill_lines.notes` และ `sales_bills.note/notes` เป็น business notes เดิม ต้องไม่ถูกเหตุผลยกเลิกเขียนทับหรือ append เพิ่ม
- Preserve dirty/untracked work ทั้งหมด โดยเฉพาะงานที่ค้างใน Sales Bill detail/cost files; ห้าม reset, checkout ทับ หรือ stage ไฟล์ไม่เกี่ยวข้อง
- ใช้เส้นงานเดียวที่ตรง `sit-origin/main`; ก่อน implementation และก่อน push ในอนาคตต้อง fetch แล้ว semantic-integrate ของใหม่อีกครั้ง
- รอบวางแผนนี้ไม่แก้ runtime code, ไม่ mutate SIT และไม่ commit/push/deploy
- Browser/DOM UAT ไม่อยู่ใน scope จนกว่าผู้ใช้จะสั่งทดสอบโดยตรง; ใช้ focused tests และ read-only runtime probes เป็นหลักฐานก่อน

---

## Verified Diagnosis

1. `PATCH /api/sales/bills/[id]` เขียนข้อความ `Cancelled from Sales Bill ${bill.doc_no}: ${reason}` ลง `sales_bill_lines.notes` ทุกแถว
2. Legacy-compatible `PATCH /api/sales/bills` มี write path ซ้ำและเขียนข้อความเดียวกันลง `sales_bill_lines.notes`
3. `getSalesBillDetail()` map `sales_bill_lines.notes` ไปเป็น `items[].note`
4. Detail modal, direct detail page และ print consumers จึงเห็นเหตุผลระดับบิลเป็นหมายเหตุใต้สินค้า
5. เหตุผลยกเลิกมี source of truth ที่ถูกต้องอยู่แล้วสองแห่ง: `sales_bills.cancel_note` และ `sales_bill_status_logs.note`
6. Root cancel path ยัง append เหตุผลลง `sales_bills.note/notes`; ต้องหยุดพฤติกรรมนี้และบันทึก `cancel_note/cancelled_at/cancelled_by` ให้ตรงกับ `[id]` path

### SIT data audit ที่ยืนยันแล้ว

| Bill | Candidate lines | Cancel reason | Original snapshot note | Repair value |
|---|---:|---|---|---|
| `SB012608-0002` | 2 | `ddd` | `null` ทั้งสองแถว | `NULL` |
| `SB012608-0006` | 2 | `jjj` | `null` ทั้งสองแถว | `NULL` |

รวม 4 line จาก 2 bills เท่านั้น โดย candidate ต้องผ่านทุกเงื่อนไข:

- bill และ line มีสถานะ `cancelled` หรือ `canceled`
- `bill.cancel_note` มีค่า
- `line.notes` เท่ากับ `Cancelled from Sales Bill ${bill.doc_no}: ${bill.cancel_note}` แบบ exact ทุกตัวอักษร
- line number/ตำแหน่งและ product code ตรงกับ row ใน `sales_bills.items`
- snapshot note เป็น `null` หรือ string ที่ระบุค่าเดิมได้แน่นอน

ถ้าไม่ผ่านข้อใดข้อหนึ่งต้อง `skip + report`; ห้ามเดา, ห้ามใช้ contains/regex กว้าง และห้ามล้าง note ทั้งบิล

## Bounded Impact Map

| Surface | Evidence | Class | Action | Verification |
|---|---|---|---|---|
| `sales_bill_lines.notes` | detail mapper ส่งตรงเป็น `items[].note` | change | preserve business note ตอน cancel; repair exact contaminated rows | unit + rollback QA + SIT postflight |
| `PATCH /api/sales/bills/[id]` | current UI cancel path | change | ใช้ shared line-cancel helper | source contract + focused QA |
| `PATCH /api/sales/bills` | duplicate/compatibility cancel path | change | ใช้ helper เดียวกันและเก็บ reason ที่ canonical fields | source contract + focused QA |
| `sales_bills.cancel_note` | canonical header cancellation reason | preserve/change on legacy path | คง `[id]`; เติม legacy path | header assertion |
| `sales_bill_status_logs.note` | timeline แสดง reason อยู่แล้ว | preserve | คง append-only status event | timeline assertion |
| allocation/fact `notes` | cancellation audit ของแต่ละ fact | preserve | ไม่ล้างและไม่เปลี่ยน contract | exact diff review + QA counts |
| Stock Ledger / WTO / holds / COGS | cancel reversal side effects | preserve | ห้ามแก้ | rollback QA + before/after invariants |
| detail modal/direct page/print | consume `items[].note` | verify | ไม่เพิ่ม UI fallback; ให้ข้อมูลที่ซ่อมแล้วไหลตาม reader เดิม | read-only detail/print probe |
| DB/API/cache/storage | ไม่จำเป็นต่อ fix | out | ไม่มี schema/public contract/cache/storage change | final diff scan |

---

### Task 1: สร้าง owner เดียวสำหรับการ cancel line facts และล็อก regression

**Files:**
- Create: `apps/next/src/lib/server/sales-bill-cancellation.ts`
- Create: `apps/next/src/lib/server/sales-bill-cancellation.test.ts`

**Interfaces:**
- Consumes: transaction client, Sales Bill id, actor และ cancellation timestamp
- Produces:

```ts
export async function cancelSalesBillLineFacts(
  tx: Pick<Prisma.TransactionClient, 'sales_bill_lines'>,
  input: {
    actor: string
    cancelledAt: Date
    salesBillId: bigint
  },
): Promise<Prisma.BatchPayload>
```

- [ ] **Step 1: เขียน failing unit test ว่า mutation ไม่มีสิทธิ์แก้ `notes`**

```ts
import { describe, expect, it, vi } from 'vitest'
import { cancelSalesBillLineFacts } from './sales-bill-cancellation'

describe('cancelSalesBillLineFacts', () => {
  it('changes line state without touching the existing business note', async () => {
    const cancelledAt = new Date('2026-08-13T03:00:00.000Z')
    const updateMany = vi.fn().mockResolvedValue({ count: 1 })

    await cancelSalesBillLineFacts(
      { sales_bill_lines: { updateMany } } as never,
      { actor: 'qa-sales-cancel', cancelledAt, salesBillId: 42n },
    )

    expect(updateMany).toHaveBeenCalledWith({
      data: {
        status: 'cancelled',
        updated_at: cancelledAt,
        updated_by: 'qa-sales-cancel',
      },
      where: {
        sales_bill_id: 42n,
        status: 'active',
      },
    })
  })
})
```

- [ ] **Step 2: รัน test เพื่อยืนยัน RED**

จาก `apps/next`:

```powershell
npx vitest run src/lib/server/sales-bill-cancellation.test.ts
```

Expected: FAIL เพราะ module/function ยังไม่มี

- [ ] **Step 3: เพิ่ม implementation ที่เปลี่ยนเฉพาะ line state**

```ts
import type { Prisma } from '../../../generated/prisma/client'

export async function cancelSalesBillLineFacts(
  tx: Pick<Prisma.TransactionClient, 'sales_bill_lines'>,
  input: { actor: string; cancelledAt: Date; salesBillId: bigint },
) {
  return tx.sales_bill_lines.updateMany({
    data: {
      status: 'cancelled',
      updated_at: input.cancelledAt,
      updated_by: input.actor,
    },
    where: {
      sales_bill_id: input.salesBillId,
      status: 'active',
    },
  })
}
```

ห้ามรับ `reason` เป็น parameter เพื่อให้ helper นี้ไม่มีทางนำเหตุผลยกเลิกไปเขียนลง line note

- [ ] **Step 4: เพิ่ม source-contract test ว่า cancel paths ทั้งสองใช้ helper นี้**

ใน test เดิมเพิ่ม:

```ts
import { readFileSync } from 'node:fs'

const detailRoute = readFileSync(
  new URL('../../app/api/sales/bills/[id]/route.ts', import.meta.url),
  'utf8',
)
const collectionRoute = readFileSync(
  new URL('../../app/api/sales/bills/route.ts', import.meta.url),
  'utf8',
)

it('routes both Sales Bill cancellation paths through the note-preserving helper', () => {
  expect(detailRoute).toContain('cancelSalesBillLineFacts(tx, {')
  const legacyCancelStart = collectionRoute.indexOf(
    'const { id, reason } = cancelSalesBillSchema.parse(raw)',
  )
  expect(legacyCancelStart).toBeGreaterThan(-1)
  expect(collectionRoute.slice(legacyCancelStart)).toContain(
    'cancelSalesBillLineFacts(tx, {',
  )
})
```

- [ ] **Step 5: รัน focused test ให้ผ่าน**

Expected: helper test จะผ่าน ส่วน source-contract ยัง FAIL จน Task 2 ต่อสายครบ

---

### Task 2: แก้ cancel write paths ทั้งสองโดยคง side effects เดิม

**Files:**
- Modify: `apps/next/src/app/api/sales/bills/[id]/route.ts`
- Modify: `apps/next/src/app/api/sales/bills/route.ts`
- Test: `apps/next/src/lib/server/sales-bill-cancellation.test.ts`

**Interfaces:**
- Consumes: helper จาก Task 1
- Produces: API responses และ cancellation side effects เดิม แต่ business notes ไม่ถูกเขียนทับ

- [ ] **Step 1: เปลี่ยน `[id]` path ให้เรียก helper**

เพิ่ม import:

```ts
import { cancelSalesBillLineFacts } from '@/lib/server/sales-bill-cancellation'
```

แทน `tx.sales_bill_lines.updateMany(...)` เดิมด้วย:

```ts
cancelSalesBillLineFacts(tx, {
  actor,
  cancelledAt,
  salesBillId: bill.id,
}),
```

คง `sales_bills.cancel_note`, `cancelled_at`, `cancelled_by` และ `appendSalesBillStatusLog(... note: values.note)` เดิมทั้งหมด

- [ ] **Step 2: เปลี่ยน collection/legacy path ให้เรียก helper เดียวกัน**

เพิ่ม import เดียวกัน แล้วแทน line `updateMany` ด้วย:

```ts
cancelSalesBillLineFacts(tx, {
  actor,
  cancelledAt: createdAt,
  salesBillId: bill.id,
}),
```

- [ ] **Step 3: ทำให้ legacy path ใช้ canonical cancellation header fields**

เปลี่ยน `tx.sales_bills.update()` เฉพาะส่วน data เป็น:

```ts
data: {
  cancel_note: reason,
  cancelled_at: createdAt,
  cancelled_by: actor,
  paid_amount: 0,
  receivable_balance: 0,
  received_amount: 0,
  status: SALES_BILL_STATUS.CANCELLED,
  updated_at: createdAt,
  updated_by: actor,
},
```

ห้าม append ข้อความยกเลิกลง `sales_bills.note` หรือ `sales_bills.notes`; ค่า business notes เดิมต้องอยู่เหมือนเดิม ส่วน `appendSalesBillStatusLog(... note: reason)` ต้องคงอยู่

- [ ] **Step 4: คง fact/allocation audit notes เดิม**

ห้ามเอา `notes: Cancelled from Sales Bill...` ออกจาก:

- `trading_allocation_facts`
- `sales_bill_source_allocations`
- `sales_bill_po_sell_allocations`
- `sales_bill_customer_advance_allocations`

เพราะสี่จุดนี้เป็น cancellation audit ของ fact ไม่ใช่หมายเหตุสินค้า

- [ ] **Step 5: รัน source-contract test อีกครั้ง**

```powershell
npx vitest run src/lib/server/sales-bill-cancellation.test.ts
```

Expected: PASS และทั้งสอง route ใช้ helper เดียวกัน

---

### Task 3: เพิ่ม rollback integration proof สำหรับ note, header reason และ audit

**Files:**
- Modify: `apps/next/scripts/verify-sales-bill-cancel-edge-cases.ts`
- Modify: `apps/next/package.json`

**Interfaces:**
- Consumes: `cancelSalesBillLineFacts`, `appendSalesBillStatusLog` และ fixture transaction เดิม
- Produces: QA script ที่ mutate เฉพาะใน transaction แล้ว rollback ทุกครั้ง

- [ ] **Step 1: ให้ fixture line มี business note เดิม**

```ts
const originalLineNote = 'หมายเหตุสินค้าเดิม'
const cancelReason = 'ยกเลิกเพื่อทดสอบ'

const line = await tx.sales_bill_lines.create({
  data: {
    line_amount: 400,
    line_no: 1,
    notes: originalLineNote,
    product_code_snapshot: product.code,
    product_id: product.id,
    product_name_snapshot: product.name,
    qty: 40,
    sales_bill_id: bill.id,
    unit_price: 10,
  },
})
```

- [ ] **Step 2: ใช้ helper จริงใน rollback transaction**

ขยาย dynamic imports ภายใน `main()` โดยคงการโหลด env ก่อน import Prisma:

```ts
const [
  { prisma },
  { normalizeDate, toNumber },
  { activeSalesReceiptCount },
  { reversePoSellUsage },
  { cancelSalesBillLineFacts },
  { appendSalesBillStatusLog, SALES_BILL_STATUS, SALES_BILL_STATUS_ACTION },
] = await Promise.all([
  import('../src/lib/server/prisma'),
  import('../src/lib/server/daily'),
  import('../src/lib/server/sales-bill-cancel-policy'),
  import('../src/lib/server/sales-bill-po-sell-reversal'),
  import('../src/lib/server/sales-bill-cancellation'),
  import('../src/lib/server/sales-bill-history'),
])
```

```ts
await cancelSalesBillLineFacts(tx, {
  actor,
  cancelledAt,
  salesBillId: bill.id,
})

await tx.sales_bills.update({
  data: {
    cancel_note: cancelReason,
    cancelled_at: cancelledAt,
    cancelled_by: actor,
    receivable_balance: 0,
    status: SALES_BILL_STATUS.CANCELLED,
  },
  where: { id: bill.id },
})

await appendSalesBillStatusLog(tx, {
  action: SALES_BILL_STATUS_ACTION.CANCELLED,
  actor,
  createdAt: cancelledAt,
  fromStatus: bill.status,
  meta: { reason: 'sales_bill_cancel' },
  note: cancelReason,
  salesBillId: bill.id,
  toStatus: SALES_BILL_STATUS.CANCELLED,
})
```

- [ ] **Step 3: เพิ่ม assertions ก่อน rollback sentinel**

```ts
const [cancelledLine, cancelledBill, cancellationLog] = await Promise.all([
  tx.sales_bill_lines.findUniqueOrThrow({ where: { id: line.id } }),
  tx.sales_bills.findUniqueOrThrow({ where: { id: bill.id } }),
  tx.sales_bill_status_logs.findFirstOrThrow({
    orderBy: { created_at: 'desc' },
    where: {
      action: SALES_BILL_STATUS_ACTION.CANCELLED,
      sales_bill_id: bill.id,
    },
  }),
])

assertEqual('line business note preserved', cancelledLine.notes, originalLineNote)
assertEqual('line state cancelled', cancelledLine.status, 'cancelled')
assertEqual('header cancellation reason stored', cancelledBill.cancel_note, cancelReason)
assertEqual('status timeline reason stored', cancellationLog.note, cancelReason)
assertions += 4
```

คง assertions เดิมของ receipt lock, PO Sell restore, Trading allocation, Customer Advance allocation และ rollback ไว้ทั้งหมด

- [ ] **Step 4: ลงทะเบียนคำสั่งที่ flow note อ้างถึงแต่ package ยังไม่มี**

เพิ่มใน `apps/next/package.json`:

```json
"verify:sales-bill-cancel-edge-cases": "npx tsx scripts/verify-sales-bill-cancel-edge-cases.ts"
```

- [ ] **Step 5: รัน rollback QA**

```powershell
npm run verify:sales-bill-cancel-edge-cases --workspace @ns-scrap-erp/next
```

Expected: PASS และจบด้วย `rolled back`; ไม่เหลือ QA rows ใน SIT

---

### Task 4: สร้าง exact-match repair classifier และ dry-run/apply CLI

**Files:**
- Create: `apps/next/scripts/repair-sales-bill-cancellation-notes.ts`
- Create: `apps/next/scripts/repair-sales-bill-cancellation-notes.test.ts`
- Modify: `apps/next/package.json`

**Interfaces:**
- Produces:

```ts
type RepairLine = {
  id: bigint
  line_no: number
  notes: string | null
  product_code_snapshot: string
  status: string
}

export type RepairBill = {
  cancel_note: string | null
  doc_no: string
  id: bigint
  items: unknown
  sales_bill_lines: RepairLine[]
  status: string | null
}

type NormalizedSnapshotItem = {
  lineNo: number
  note: unknown
  productCode: string
}

export type SalesBillCancellationNoteRepairCandidate = {
  billDocNo: string
  billId: string
  currentNote: string
  lineId: string
  lineNo: number
  productCode: string
  restoreNote: string | null
}

export function collectSalesBillCancellationNoteRepairCandidates(
  bills: RepairBill[],
): {
  candidates: SalesBillCancellationNoteRepairCandidate[]
  skipped: Array<{
    billDocNo: string
    lineId: string
    reason: 'line_status' | 'note_mismatch' | 'snapshot_match' | 'snapshot_note'
  }>
}

export function salesBillCancellationNoteRepairFingerprint(
  candidates: SalesBillCancellationNoteRepairCandidate[],
): string
```

- [ ] **Step 1: เขียน failing classifier tests**

ครอบคลุมอย่างน้อย:

```ts
it('restores NULL only for an exact system overwrite with a unique snapshot match')
it('restores the exact snapshot note when the snapshot contains a string note')
it('does not select a normal business note')
it('does not select a similar but non-exact cancellation string')
it('skips a missing, duplicate, or product-mismatched snapshot row')
it('accepts only cancelled/canceled bill and line statuses')
it('produces the same fingerprint regardless of input order')
```

ตัวอย่าง positive fixture:

```ts
const bill = {
  cancel_note: 'jjj',
  doc_no: 'SB012608-0006',
  id: 6n,
  items: [{ lineNo: 1, note: null, productCode: 'SKU151' }],
  sales_bill_lines: [{
    id: 61n,
    line_no: 1,
    notes: 'Cancelled from Sales Bill SB012608-0006: jjj',
    product_code_snapshot: 'SKU151',
    status: 'cancelled',
  }],
  status: 'cancelled',
}
```

Expected candidate มี `restoreNote: null` เพียงหนึ่งแถว

- [ ] **Step 2: Normalize snapshot แบบ strict ก่อน classify**

```ts
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeSnapshotItem(value: unknown, index: number): NormalizedSnapshotItem | null {
  if (!isRecord(value)) return null
  const rawLineNo = value.lineNo
  const lineNo = rawLineNo == null
    ? index + 1
    : typeof rawLineNo === 'number' && Number.isInteger(rawLineNo) && rawLineNo > 0
      ? rawLineNo
      : typeof rawLineNo === 'string' && /^[1-9]\d*$/.test(rawLineNo)
        ? Number(rawLineNo)
        : null
  if (lineNo == null) return null

  const rawProductCode = value.productCode ?? value.productId
  if (typeof rawProductCode !== 'string' || !rawProductCode.trim()) return null

  return {
    lineNo,
    note: value.note === undefined ? null : value.note,
    productCode: rawProductCode.trim(),
  }
}
```

- [ ] **Step 3: สร้าง pure classifier แบบ fail-closed**

ใช้ exact algorithm นี้:

```ts
for (const bill of bills) {
  if (!['cancelled', 'canceled'].includes(String(bill.status).toLowerCase())) continue
  const cancelNote = bill.cancel_note?.trim()
  if (!cancelNote || !Array.isArray(bill.items)) continue
  const expectedSystemNote = `Cancelled from Sales Bill ${bill.doc_no}: ${cancelNote}`

  for (const line of bill.sales_bill_lines) {
    if (typeof line.notes !== 'string' || !line.notes.startsWith('Cancelled from Sales Bill ')) continue
    if (!['cancelled', 'canceled'].includes(String(line.status).toLowerCase())) {
      skipped.push({ billDocNo: bill.doc_no, lineId: String(line.id), reason: 'line_status' })
      continue
    }
    if (line.notes !== expectedSystemNote) {
      skipped.push({ billDocNo: bill.doc_no, lineId: String(line.id), reason: 'note_mismatch' })
      continue
    }

    const snapshotMatches = bill.items
      .map((value, index) => normalizeSnapshotItem(value, index))
      .filter((item) => item != null)
      .filter((item) => (
        item.lineNo === line.line_no
        && item.productCode === line.product_code_snapshot
      ))

    if (snapshotMatches.length !== 1) {
      skipped.push({ billDocNo: bill.doc_no, lineId: String(line.id), reason: 'snapshot_match' })
      continue
    }
    const snapshot = snapshotMatches[0]
    if (snapshot.note !== null && typeof snapshot.note !== 'string') {
      skipped.push({ billDocNo: bill.doc_no, lineId: String(line.id), reason: 'snapshot_note' })
      continue
    }

    candidates.push({
      billDocNo: bill.doc_no,
      billId: String(bill.id),
      currentNote: line.notes,
      lineId: String(line.id),
      lineNo: line.line_no,
      productCode: line.product_code_snapshot,
      restoreNote: snapshot.note,
    })
  }
}
```

`normalizeSnapshotItem()` ใช้ตำแหน่ง `index + 1` เฉพาะเมื่อ snapshot ไม่มี `lineNo`; ถ้ามีแต่ malformed ต้อง skip ไม่ fallback

- [ ] **Step 4: สร้าง stable SHA-256 fingerprint**

```ts
import { createHash } from 'node:crypto'

export function salesBillCancellationNoteRepairFingerprint(candidates: SalesBillCancellationNoteRepairCandidate[]) {
  const stableRows = [...candidates]
    .sort((left, right) => (
      left.billDocNo.localeCompare(right.billDocNo)
      || left.lineNo - right.lineNo
      || left.lineId.localeCompare(right.lineId)
    ))
  return createHash('sha256').update(JSON.stringify(stableRows)).digest('hex')
}
```

- [ ] **Step 5: เพิ่ม SIT target guard และ CLI arguments**

Default ต้องเป็น dry-run; apply ต้องใช้ทั้งสามค่า:

```text
--apply
--expected-count=$candidateCount
--expected-fingerprint=$candidateFingerprint
```

หลัง `@next/env` โหลด env แล้ว script ต้องตรวจทั้ง `NEXT_PUBLIC_SUPABASE_URL` และ `DATABASE_URL` ว่าชี้ project ref `vbjlkxbytccklhqvxjuu`; ถ้าไม่ตรงให้ throw ก่อน query/mutation

```ts
import nextEnv from '@next/env'
import { fileURLToPath } from 'node:url'

const SIT_PROJECT_REF = 'vbjlkxbytccklhqvxjuu'

function requiredEnv(name: 'DATABASE_URL' | 'NEXT_PUBLIC_SUPABASE_URL') {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

function assertSitTarget() {
  const supabaseUrl = requiredEnv('NEXT_PUBLIC_SUPABASE_URL')
  const databaseUrl = requiredEnv('DATABASE_URL')
  if (new URL(supabaseUrl).hostname.split('.')[0] !== SIT_PROJECT_REF) {
    throw new Error('repair target must be SIT')
  }
  if (!databaseUrl.includes(SIT_PROJECT_REF)) {
    throw new Error('DATABASE_URL does not match the SIT project')
  }
}

function argumentValue(name: string) {
  return process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1)
}

type RepairCliOptions = {
  apply: boolean
  expectedCount: number | null
  expectedFingerprint: string | null
}

function parseRepairCliOptions(): RepairCliOptions {
  const apply = process.argv.includes('--apply')
  const expectedCountText = argumentValue('--expected-count')
  const expectedFingerprint = argumentValue('--expected-fingerprint') ?? null
  const expectedCount = expectedCountText == null ? null : Number(expectedCountText)
  if (apply && (!Number.isInteger(expectedCount) || expectedCount! < 1)) {
    throw new Error('--apply requires a positive --expected-count')
  }
  if (apply && !/^[a-f0-9]{64}$/.test(expectedFingerprint ?? '')) {
    throw new Error('--apply requires a SHA-256 --expected-fingerprint')
  }
  return { apply, expectedCount, expectedFingerprint }
}
```

ภายใน `main()` ให้เรียก `nextEnv.loadEnvConfig(fileURLToPath(new URL('..', import.meta.url)))`, `assertSitTarget()` และ `parseRepairCliOptions()` ตามลำดับ ก่อน `loadRepairBills()` ทุกครั้ง

- [ ] **Step 6: Query เฉพาะข้อมูลที่ classifier ต้องใช้**

กำหนด loader ให้ใช้ได้ทั้ง Prisma client และ transaction client:

```ts
async function loadRepairBills(
  client: Pick<Prisma.TransactionClient, 'sales_bills'>,
): Promise<RepairBill[]> {
  return client.sales_bills.findMany({
    orderBy: { doc_no: 'asc' },
    select: {
      cancel_note: true,
      doc_no: true,
      id: true,
      items: true,
      sales_bill_lines: {
        orderBy: { line_no: 'asc' },
        select: {
          id: true,
          line_no: true,
          notes: true,
          product_code_snapshot: true,
          status: true,
        },
      },
      status: true,
    },
    where: {
      cancel_note: { not: null },
      status: { in: ['cancelled', 'canceled'] },
    },
  })
}
```

Dry-run output แสดงเฉพาะ mode, projectRef, count, bill doc no, line no, product code, restore mode (`NULL` หรือ `SNAPSHOT`) และ fingerprint; ห้าม print customer, token, connection string หรือ raw env

- [ ] **Step 7: ทำ apply แบบ transaction + re-read + compare-and-set**

```ts
await prisma.$transaction(async (tx) => {
  const currentBills = await loadRepairBills(tx)
  const currentPlan = collectSalesBillCancellationNoteRepairCandidates(currentBills)
  const currentFingerprint = salesBillCancellationNoteRepairFingerprint(currentPlan.candidates)

  if (currentPlan.candidates.length !== expectedCount) {
    throw new Error('candidate count changed after dry-run')
  }
  if (currentFingerprint !== expectedFingerprint) {
    throw new Error('candidate fingerprint changed after dry-run')
  }
  if (currentPlan.skipped.length > 0) {
    throw new Error('ambiguous cancellation-note rows require manual review')
  }

  for (const candidate of currentPlan.candidates) {
    const result = await tx.sales_bill_lines.updateMany({
      data: { notes: candidate.restoreNote },
      where: {
        id: BigInt(candidate.lineId),
        notes: candidate.currentNote,
        status: { in: ['cancelled', 'canceled'] },
      },
    })
    if (result.count !== 1) throw new Error(`compare-and-set failed for line ${candidate.lineId}`)
  }
}, {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  timeout: 30_000,
})
```

หลัง commit ให้ re-read และ assert ว่า exact candidate เหลือ 0; ถ้ายังเหลือให้ exit non-zero

- [ ] **Step 8: ทำให้ module import ใน Vitest แล้วไม่รัน CLI**

```ts
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const isDirectExecution = Boolean(
  process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
)

if (isDirectExecution) {
  void main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
```

ให้ `loadEnvConfig()`, target guard, Prisma query และ CLI parsing อยู่ใน `main()` เท่านั้น; การ import pure functions ใน test ต้องไม่ connect DB

- [ ] **Step 9: ลงทะเบียนคำสั่ง**

เพิ่มใน `apps/next/package.json`:

```json
"repair:sales-bill-cancellation-notes": "npx tsx scripts/repair-sales-bill-cancellation-notes.ts"
```

- [ ] **Step 10: รัน focused classifier test**

```powershell
npx vitest run scripts/repair-sales-bill-cancellation-notes.test.ts
```

Expected: PASS ทุก exact/ambiguous/fingerprint case

---

### Task 5: Dry-run, apply เฉพาะ SIT และ postflight reconciliation

**Files:**
- Execute: `apps/next/scripts/repair-sales-bill-cancellation-notes.ts`
- No additional runtime file changes

**Interfaces:**
- Consumes: current SIT data snapshot
- Produces: restore เฉพาะ `sales_bill_lines.notes` ที่ผ่าน exact predicate

- [ ] **Step 1: รัน dry-run ก่อนแก้ข้อมูล**

```powershell
Push-Location apps/next
$dryRun = npx tsx scripts/repair-sales-bill-cancellation-notes.ts | ConvertFrom-Json
$dryRun | ConvertTo-Json -Depth 6
```

Expected บน snapshot ที่ตรวจล่าสุด:

```text
mode: dry-run
bills: SB012608-0002, SB012608-0006
candidateCount: 4
restoreMode: NULL ทั้ง 4 line
```

บันทึก fingerprint จริงจาก output; ถ้าจำนวน/doc/restore mode ต่างจากนี้ให้หยุดและสอบสวน ห้าม apply

- [ ] **Step 2: เก็บ read-only preflight invariants ของสองบิล**

ตรวจและบันทึกเฉพาะค่าที่ต้องเทียบหลัง repair:

- bill id/doc/status/cancel_note/cancelled_at
- line id/line_no/status/product_code/cogs_amount/gross_profit
- จำนวนและสถานะ `sales_bill_status_logs`
- จำนวน/qty/amount/status ของ allocation/fact tables ทั้งสี่
- จำนวน/value ของ `stock_ledger` ref `SB` และ `SB-CANCEL`
- WTO usage log count, pending-out count/status และ weight ticket status ที่เกี่ยวข้อง

ห้าม print customer/secret/raw env

- [ ] **Step 3: Apply ด้วย count + fingerprint จาก dry-run**

```powershell
if ($dryRun.candidateCount -ne 4) { throw 'SIT candidate count changed; stop before apply' }
npx tsx scripts/repair-sales-bill-cancellation-notes.ts --apply "--expected-count=$($dryRun.candidateCount)" "--expected-fingerprint=$($dryRun.fingerprint)"
Pop-Location
```

ต้องใช้ object `$dryRun` จาก Step 1 ใน PowerShell session เดียวกัน; ห้าม hardcode fingerprint ลง source หรือข้าม count check

- [ ] **Step 4: ยืนยัน postflight**

- exact contaminated candidate เหลือ 0
- `SB012608-0002` และ `SB012608-0006` ยัง cancelled
- line ทั้ง 4 ยัง cancelled และ `notes IS NULL`
- `sales_bills.cancel_note` ยังเป็น `ddd`/`jjj`
- cancelled status log และ reason ยังครบ
- preflight/postflight ของ COGS, GP, Stock Ledger, WTO, holds, usage logs, PO Sell, Customer Advance และ allocation quantities/amounts/status เท่ากันทุกค่า
- fact/allocation cancellation notes ยังคงอยู่

- [ ] **Step 5: ยืนยัน read model โดยไม่เปิด Browser**

เรียก `getSalesBillDetail()` สำหรับสองเอกสารแล้ว assert:

```ts
import { emptyCompanyProfile } from '../src/lib/company-profile'
import { buildSalesBillPrintHtml } from '../src/lib/sales-bill-print'
import { getSalesBillDetail } from '../src/lib/server/sales-bill-detail'

for (const docNo of ['SB012608-0002', 'SB012608-0006']) {
  const detail = await getSalesBillDetail(docNo)
  if (!detail) throw new Error(`${docNo} not found`)
  if (detail.items.some((item) => item.note.startsWith('Cancelled from Sales Bill '))) {
    throw new Error(`${docNo} still exposes a system cancellation note as an item note`)
  }
  if (!detail.timeline.some((event) => (
    event.action === 'cancelled'
    && event.details.some((value) => value.includes('หมายเหตุ'))
  ))) {
    throw new Error(`${docNo} cancellation reason missing from timeline`)
  }
  const printHtml = buildSalesBillPrintHtml(detail, emptyCompanyProfile)
  if (printHtml.includes('Cancelled from Sales Bill ')) {
    throw new Error(`${docNo} print still exposes the system note under an item`)
  }
}
```

ถ้าผู้ใช้สั่ง Browser UAT เพิ่มภายหลัง ให้ตรวจทั้ง detail modal และ `/sales/bills/[docNo]` ด้วย Codex In-app Browser เท่านั้น

---

### Task 6: อัปเดต business contract, validation, review และ handoff

**Files:**
- Modify: `docs/notes/page-flows/daily-transactions-sales-bills.md`
- Modify only when this becomes the active batch: `docs/migration/00-current-work.md`
- Review: all files changed by Tasks 1-5

**Interfaces:**
- Documents the corrected ownership contract; no public schema change

- [ ] **Step 1: บันทึก canonical rule ใน Sales Bill flow note**

เพิ่มข้อความสรุปนี้โดย merge กับงานค้างเดิม ห้าม overwrite ทั้งไฟล์:

```markdown
- `sales_bill_lines.notes` เป็นหมายเหตุธุรกิจของสินค้าและต้องคงเดิมตลอดการยกเลิกบิล เหตุผลยกเลิกเป็น fact ระดับเอกสารที่ `sales_bills.cancel_note` และ `sales_bill_status_logs.note`; allocation/fact tables สามารถเก็บ cancellation audit ของตัวเองได้ แต่ห้ามนำข้อความนั้นกลับมาแสดงเป็น item note
- SIT repair สำหรับข้อความระบบเก่าต้องใช้ exact string + cancelled status + unique line/product snapshot match เท่านั้น, dry-run ก่อน apply, และ restore จาก snapshot (`NULL` เมื่อ snapshot ไม่มี note). แถวที่คลุมเครือต้อง skip/report โดยไม่เดา
```

บันทึกผล postflight 4 lines/2 bills และ fingerprint/run date เฉพาะหลัง apply สำเร็จ

- [ ] **Step 2: อัปเดต active handoff แบบสั้นเมื่อเริ่ม implementation**

เก็บใน `00-current-work.md` เฉพาะ objective, write areas, validation ที่ยังเหลือ และ blocker ปัจจุบัน; ห้าม append validation log ยาวหรือทับ checkpoint งานอื่นที่ยัง active

- [ ] **Step 3: รัน focused validation**

จาก `apps/next`:

```powershell
npx vitest run src/lib/server/sales-bill-cancellation.test.ts scripts/repair-sales-bill-cancellation-notes.test.ts
npm run verify:sales-bill-cancel-edge-cases
npm run repair:sales-bill-cancellation-notes
```

คำสั่งสุดท้ายต้องเป็น dry-run หลัง apply และรายงาน candidate 0

- [ ] **Step 4: รัน project validation**

จาก repo root:

```powershell
npm run lint --workspace @ns-scrap-erp/next
npm run type-check --workspace @ns-scrap-erp/next
Push-Location apps/next
$env:NODE_OPTIONS='--max-old-space-size=8192'
npx next build
Remove-Item Env:NODE_OPTIONS
Pop-Location
git diff --check
```

ถ้า build ล้มเหลว ต้องเก็บ error จริงและแยกว่าเกิดจาก diff รอบนี้หรือ baseline; ห้ามรายงานผ่านจากการคาดเดา

- [ ] **Step 5: Review final diff แบบเข้ม**

ตรวจอย่างน้อย:

- ทั้งสอง cancel paths ใช้ helper เดียวกัน
- ไม่มี line/header business note ถูกเขียนด้วย cancellation reason
- `cancel_note`, status log, auth/branch scope และ response contract ยังครบ
- allocation/fact notes และ cancellation side effects เดิมยังอยู่
- repair script default dry-run, SIT-only, exact-match, fingerprint-gated และ transactional
- apply mutation เปลี่ยนเฉพาะ `sales_bill_lines.notes`
- ไม่มี schema/cache/storage/financial calculation change
- ไม่มี dirty/untracked file อื่นถูก stage หรือแก้โดยไม่ตั้งใจ

ถ้าพบ actionable finding ให้แก้, รัน validation ที่เกี่ยวข้องใหม่ และ review diff รอบใหม่จนไม่มี finding ค้าง

- [ ] **Step 6: Fresh-context acceptance gate**

ส่ง exact request, acceptance contract, final diff, focused test output, rollback QA, SIT dry-run/apply/postflight และ lint/type-check/build/diff-check ให้ reviewer ที่ไม่มี implementer reasoning หากผู้ใช้อนุญาต delegation; ถ้าไม่มี isolated reviewer ให้ทำ self-audit และระบุว่าเป็น degraded review อย่างตรงไปตรงมา

- [ ] **Step 7: Stop before delivery mutation**

รายงานผล local/SIT repair ตามจริง แต่ห้าม commit, push `sit-origin/main` หรือ deploy Vercel จนกว่าผู้ใช้จะสั่ง delivery step; ก่อน push ต้อง fetch และ semantic-integrate `sit-origin/main` ใหม่อีกครั้ง

---

## Acceptance Contract

- ยกเลิก Sales Bill ใหม่ผ่าน API path ใดก็ไม่แก้ `sales_bill_lines.notes`
- legacy collection path ไม่ append cancellation reason ลง `sales_bills.note/notes` และเขียน `cancel_note/cancelled_at/cancelled_by` ถูกต้อง
- business note เดิมของสินค้าและบิลยังอยู่หลัง cancel
- cancellation reason แสดงจาก header/timeline audit ได้เหมือนเดิม
- rollback QA ยืนยัน receipt lock, PO Sell restore, allocation cancellation และ transaction rollback เดิม
- current SIT dry-run พบ 4 exact candidates จาก `SB012608-0002` และ `SB012608-0006`; apply เปลี่ยนเฉพาะ 4 `sales_bill_lines.notes` เป็น `NULL`
- หลัง repair detail/read model ไม่แสดง `Cancelled from Sales Bill...` ใต้สินค้า แต่ timeline ยังมีเหตุผล `ddd`/`jjj`
- COGS, GP, Stock Ledger, WTO, pending-out, usage logs, PO Sell, Customer Advance และ allocation quantities/amounts/status ไม่เปลี่ยน
- ไม่มี REST/schema/migration/cache/storage/permission change
- focused tests, rollback QA, postflight, lint, type-check, build และ `git diff --check` ผ่าน
- final diff review ไม่มี actionable finding ค้าง

## Execution Handoff

Plan นี้ออกแบบให้ทำแบบ **Inline Execution** บน working line เดียวด้วย `superpowers:executing-plans` ตามกฎ repo ปัจจุบัน หากผู้ใช้ต้องการ delegation ต้องสั่งเป็นกรณีพิเศษก่อน รอบ plan นี้ยังไม่มี code/data mutation, commit, push หรือ deploy
