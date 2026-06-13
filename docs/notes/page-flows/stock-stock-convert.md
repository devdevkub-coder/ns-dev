---
title: Grade Adjustment / ปรับเกรด Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-13
route: /stock/convert
---

# Grade Adjustment / ปรับเกรด Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Stock |
| Route | `/stock/convert` |
| Page | Grade Adjustment / ปรับเกรด |
| Current Next | accepted code baseline |

## Canonical References

[[Stock Convert Page Flow]], [[Stock Ledger and Stock Balance]]

## Flow Baseline

GA แปลงสินค้า/เกรดจาก source product เป็น target product พร้อม cost/yield policy

Reference update 2026-06-13: target-complete flow ต้องผูกกับ Cost Pool / Allocation Ledger ไม่ใช่เพียงสร้าง stock ledger pair แบบ WAC เฉลี่ยอย่างเดียว

## Page Responsibilities

- แปลง product/grade จาก source stock เป็น target stock
- เลือก source product/warehouse/qty และ target product/qty/reason
- คำนวณ cost carry-forward/yield/loss ตาม policy
- เขียน ledger out source และ in target
- เลือก source cost pool lots ด้วย FIFO/LIFO/Highest/Lowest/Manual
- consume source cost pool availability และสร้าง target cost pool row source type `Regrade`
- บันทึก allocation/match history เพื่อ trace source lot -> target lot
- reverse ต้องคืน cost pool และ allocation state แบบ append-only

## Non-Responsibilities

- ไม่ใช่ stock transfer ระหว่าง warehouse
- ไม่ใช่ production order เต็มรูปแบบ
- ไม่ควรใช้แก้ข้อมูลย้อนหลังโดยไม่มี reason/audit

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET conversion list/options |
| 2 | เลือก source/target | validate availability และ product relation |
| 3 | เลือก allocation method | preview source cost pool lots, qty, unit cost, value |
| 4 | บันทึก | POST GA ledger pair, consume source cost pool, create target regrade cost pool, write allocation ledger |
| 5 | reverse | target reversal ต้องคืน source/target balance และ reverse cost pool allocation |

## API / Data Contract

### Current API

- `GET /api/stock/convert - list/options`
- `POST /api/stock/convert - create grade/product conversion`
- `PATCH /api/stock/convert - reverse posted grade adjustment`

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ

## Validation / Status Rules

- source qty > 0 และ available พอ
- target qty > 0 และ target product active
- target qty ต้องน้อยกว่าหรือเท่ากับ source qty; ถ้าน้อยกว่าต้องเป็น loss/yield tracking พร้อมเหตุผล
- source cost pool available ต้องพอสำหรับ allocation mode ที่เลือก
- Manual allocation ต้องรวม qty ได้ตรง source qty หรือเข้ากฎ partial/pending ที่ออกแบบไว้
- cost/yield policy ต้องไม่ทำมูลค่าหายโดยไม่มี loss reason
- ห้าม convert stock ที่ active hold
- ห้าม fallback หรือ hard-code cost เมื่อ Cost Pool ไม่พอ; ต้อง reject, pending, หรือ partial แบบมี audit

## Side Effects

- เขียน stock ledger source out / target in ด้วย ref_type GA
- กระทบ WAC/cost bucket ตาม costing policy
- บันทึก source cost pool usage เป็น `Matched` / `Partially Used` ตามยอดที่ใช้
- เพิ่ม target cost pool row สำหรับสินค้าใหม่จาก Regrade / Conversion
- บันทึก Allocation Ledger / Match Logs

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Runtime Checkpoint

- Runtime 2026-06-13 implement Cost Pool-backed allocation ใน active Next app แล้ว
- DB migration `20260613170000_add_stock_convert_cost_pool_allocation.sql` เพิ่ม `stock_cost_pool_entries` และ `stock_cost_pool_allocations`, ขยาย `grade_adjustments`, เพิ่ม indexes และ backfill current stock balance
- Create modal มี allocation method และ Cost Pool lot preview; Manual สามารถเลือก qty ราย pool lot ได้
- POST ทำ transaction เดียว: lock source pool, create `grade_adjustments`, write paired `GA` stock ledger, consume source pool, create target `Regrade` pool, and write allocation rows
- PATCH reverse เป็น append-only และ block เมื่อ target pool ถูกใช้ต่อหรือ stock ปลายทางไม่พอ
- GET detail/export เพิ่มแล้ว: `GET /api/stock/convert?detail=<docNo>` ส่ง allocation drilldown และ `format=csv` ดาวน์โหลด allocation CSV ต่อเอกสาร
- List UI มีปุ่ม Detail เปิด modal ดู source/target cost pool lines, status, qty, unit cost, total cost และ export CSV ได้
- Pending/partial policy เพิ่มแล้ว: runtime POST reject เมื่อ Cost Pool ไม่พอ, `pending_cost` สงวนไว้ให้ legacy/import, และ `partial` หมายถึง fully costed GA ที่ทำให้ source pool lot เหลือ `Partially Used`
- Target custom cost override เพิ่มแล้วสำหรับ admin/owner เท่านั้น พร้อมบันทึก source unit cost, target unit cost, variance, และ reason
- Authenticated local QA ผ่าน: page/API/modal smoke และ API create+reverse `GA-000002` ยืนยัน allocation/ledger/pool state หลัง reverse
- Detail/export QA ผ่าน: modal เปิด `GA-000002`, detail API คืน 200/1 line, CSV คืน `text/csv` และมี doc no
- Custom cost QA ผ่าน: POST `CUSTOM_UNIT_COST` ด้วย admin/owner, detail เห็น variance/reason, และ reverse คืนสำเร็จ
- Remaining: no runtime gap for current approved stock convert slice; future accounting policy may still add GL/P&L posting for variance

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [x] Verify legacy behavior/reference for Cost Pool allocation, partial use, target regrade cost pool, and reverse workflow
- [x] Add Cost Pool-backed DB/API/UI runtime slice
- [x] Complete authenticated local browser/API QA for page/modal/create/reverse
- [x] Add allocation detail drilldown and CSV export for posted/reversed GA documents
- [x] Add pending/partial cost policy and admin/owner custom target cost override
- [x] Update this file and canonical reference if contract changes
