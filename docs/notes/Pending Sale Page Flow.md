---
title: Pending Sale Page Flow
aliases:
  - Pending Sale
  - Stock Issue Before Billing
  - เบิกออกรอบิล
  - Flow หน้าเบิกออกรอบิล
tags:
  - ns-scrap-erp
  - sales
  - stock
  - pending-sale
  - page-flow
status: draft
created: 2026-06-11
updated: 2026-06-12
---

# Pending Sale Page Flow / Flow หน้าเบิกออกรอบิล

## Scope

- Route: `/sales/stock-issue`
- API ปัจจุบัน: `GET /api/sales/stock-issue`
- Owner: Sales + Stock
- Page type: list/read baseline now; target write flow for physical stock issue before Sales Bill
- Related flow: [[Sales Flow]], [[Sales Bills Page Flow]], [[Stock Ledger and Stock Balance]]

หน้านี้ใช้เมื่อมีใบชั่งขาออกแล้วและต้องเบิกสินค้าจาก Stock ให้ลูกค้าก่อนสร้างบิลขายจริง เช่น ของถูกเบิกขึ้นรถ/ส่งให้ลูกค้าแล้ว แต่ฝ่ายเอกสารยังไม่เปิด `SB`

## Business Meaning

`Pending Sale` ไม่ใช่ PO และไม่ใช่บิลขาย

มันคือ stock issue document ที่บอกว่า:

- สินค้าผ่านใบชั่งขาออกแล้ว
- สินค้าถูกเอาออกจากคลังจริงแล้ว
- ยังไม่เกิด AR / ลูกหนี้ เพราะยังไม่เปิด Sales Bill
- ต้นทุนของสินค้านี้ควรถูกแยกติดตามเป็น "ต้นทุนรอเปิดบิล"
- เมื่อเปิด Sales Bill จาก Pending Sale แล้ว ห้ามตัด stock ซ้ำในเคสที่ stock ถูกตัดไปแล้ว

## Legacy Finding

Legacy มี flow `stockIssues` / `PSALE` จริง:

- หน้า legacy อยู่ที่ `old-apps/legacy/index.html` component `view-stockIssue`
- เลขเอกสารใช้ `erp.nextDocNo('PSALE')`
- field ตอนสร้าง: date, customer optional, branch, warehouse, items, qty, unitCost/WAC, estimated sale price, lot/no note
- รองรับ pre-fill จากใบชั่ง OUT ผ่าน `sessionStorage` key `ns_erp_weighing_to_psale`
- เมื่อ pre-fill จากใบชั่ง ระบบใส่ customer/branch/items/note/impurity/photo summary แล้วให้ user เลือก warehouse ก่อน save
- ตอน save Pending Sale validate warehouse + item qty > 0 แล้วเช็ก stock on hand จาก `erp.stockOnHand(productId, branchId, warehouseId)`
- ถ้า qty เกิน stock legacy ให้ confirm override ได้; target ไม่ควรปล่อย override โดยไม่มีสิทธิ์/เหตุผล
- ตอน save เขียน `stockLedger.refType = 'PSALE'` และ `movementType = 'PENDING_SALE_OUT'`
- ตอน edit legacy ลบ ledger `PSALE` เดิมแล้วสร้างใหม่
- ตอน cancel/delete legacy ลบ ledger `PSALE` เพื่อคืน stock
- ตอน convert เป็น Sales Bill legacy ลบ ledger `PSALE` แล้วสร้าง `SB` stock-out ใหม่

ข้อดีของ legacy:

- stock on hand ลดทันทีเมื่อของถูกเบิกออกจริง
- dashboard เห็นต้นทุนรอเปิดบิล
- หน้าฟอร์มแสดง stock ก่อนเบิก / จำนวนที่จะเบิก / stock หลังเบิก ระดับ line

ข้อเสีย/จุดผิดของ legacy:

- การลบ `PSALE` แล้วสร้าง `SB` ใหม่ทำให้ audit trail ของ stock movement วันที่ของออกจริงหาย
- ถ้ามี sync/import/error ระหว่างลบกับสร้างใหม่ อาจเกิด orphan หรือ duplicate
- `stock_ledger` กลายเป็นเอกสารที่ถูก rewrite แทนที่จะเป็น movement fact
- การยอมให้เบิกเกิน stock ด้วย confirm override เสี่ยงต่อ negative stock ถ้าไม่มี approval/permission policy

## Confirmed Business Rules

Requirement clarified on 2026-06-12: `Pending Sale Release / เบิกออกรอบิล` ในเมนูนี้คือการเบิกของจาก Stock ให้ลูกค้าก่อนสร้างบิลขายจริง ไม่ใช่การจอง stock ลอย ๆ

| Rule | Meaning | Stock effect |
|---|---|---|
| Requires outbound weighing | ต้องมีใบชั่งขาออกก่อนมาที่เมนูเบิกออกรอบิล | ใช้ WTO/ใบชั่ง OUT เป็น source ก่อนสร้าง PSALE |
| Issue stock immediately | เมื่อเพิ่มสินค้าและผูกเข้ารายการเบิกออกรอบิล สินค้านั้นถูกตัด Stock ทันที | เขียน `stock_ledger.ref_type = PSALE` เป็น stock-out |
| Pending until billed | หลังตัด stock เอกสารเป็น `pending` จนกว่าจะผูกบิลขาย | ยังไม่เกิด AR/revenue |
| Convert Pending to Sales Bill | เมื่อผูกบิลขายแล้ว รายการเปลี่ยนเป็นเปิดบิลแล้ว | สร้าง/ผูก SB กับ PSALE และห้ามตัด stock ซ้ำ |
| Over Selling Protection | ห้ามเบิกออกรอบิลสินค้าเกินของที่มีใน Stock | ตรวจ available ก่อนสร้าง PSALE |

## Target Decision

ให้แยก `WTO hold` ออกจาก `Pending Sale / PSALE`

| Flow | ความหมาย | Stock effect |
|---|---|---|
| `WTO` | เอกสารส่งของ/ชั่งขาออก + จอง stock ก่อนเปิด SB | สร้าง hold จากใบส่งของ ไม่เข้า ledger |
| `Pending Sale / PSALE` | เบิกสินค้าออกจากคลังจริงหลังมีใบชั่งขาออกและก่อนเปิด SB | เข้า `stock_ledger` เป็น stock-out จริงและสถานะ `pending` |
| `SB from WTO` | เปิดบิลจากใบส่งของที่จองไว้ | consume hold + เขียน `SB` stock-out |
| `SB from PSALE` | เปิดบิลจากของที่เบิกออกไปแล้ว | ไม่เขียน stock-out ซ้ำ; link ไป `PSALE` |

ดังนั้น `PSALE` เป็น movement fact ก่อน billing. Target ต้องไม่ลบ `PSALE` movement ตอน convert เป็น `SB`

## Target Flow

| Step | ผู้ใช้ทำอะไร | ระบบทำอะไร | Stock impact |
|---|---|---|---|
| 1 | สร้าง/เลือกใบชั่งขาออก | ระบบมี WTO/ใบชั่ง OUT เป็น source | WTO hold กัน available ก่อนเปิดเอกสารถัดไป |
| 2 | เพิ่มสินค้าเข้ารายการเบิกออกรอบิล | ออกเลข `PSALE...`, บันทึก customer, branch, warehouse, items, estimated price | เขียน `stock_ledger.ref_type = PSALE`, on hand ลดทันที |
| 3 | ระบบแสดงใน `/sales/stock-issue` | สถานะ `pending` / `เบิกแล้ว รอเปิดบิล` | on hand ลดแล้ว แต่ยังไม่เกิด AR/revenue |
| 4 | เปิด Sales Bill จาก PSALE | สร้าง `SB`, copy/snapshot รายการสินค้า, ราคา, customer, branch, warehouse | ไม่ตัด stock ซ้ำ |
| 5 | ระบบอัปเดต PSALE | ตั้งสถานะ `converted`, เก็บ `converted_to_bill_id/doc_no` | ledger `PSALE` ยังอยู่และ link กับ SB |
| 6 | รับเงิน | ใช้ receipt ปกติ | ไม่มี stock impact |
| 7 | ยกเลิกก่อนเปิดบิล | append reversal ตาม policy | คืน stock ด้วย reversal entry |

## Stock Ledger Rule

Target ledger สำหรับ Pending Sale:

| Field | Value |
|---|---|
| `ref_type` | `PSALE` |
| `movement_type` | `PENDING_SALE_OUT` |
| `qty_in` | `0` |
| `qty_out` | จำนวนที่เบิก |
| `value_out` | จำนวน x WAC ณ ตอนเบิก |
| `ref_no` | เลข `PSALE...` |

เมื่อ convert เป็น `SB`:

- ห้ามลบ `PSALE` ledger
- ห้ามสร้าง `SB` stock-out สำหรับ line ที่มาจาก PSALE
- `SB` ต้องเก็บ source line ว่ามาจาก `PSALE`
- COGS ของ SB ใช้ต้นทุน snapshot จาก `PSALE` หรือ cost snapshot ที่ผูกกับ movement

## Availability Rule

```text
onHand = sum(stock_ledger.qty_in - stock_ledger.qty_out)
reserved = sum(stock_holds.qty where status = active)
available = onHand - reserved
usedPending = sum(PSALE qty_out where stock_issues.status = pending)
```

การสร้าง PSALE ต้อง reject ถ้า requested qty มากกว่า available ตาม branch + warehouse + product เดียวกัน เพื่อป้องกัน over selling. ถ้า PSALE มาจาก WTO hold เดียวกัน ต้อง consume/release hold ให้ชัดเพื่อไม่ให้ reserved ถูกนับซ้ำหลังตัด stock จริง

## Status

| Status | ความหมาย | แก้ไข | ยกเลิก | เปิดบิล |
|---|---|---:|---:|---:|
| `pending` | เบิกแล้ว รอเปิดบิล | ได้ตามสิทธิ์ | ได้ตามสิทธิ์ | ได้ |
| `converted` | เปิดบิลขายแล้ว | ไม่ได้ | ไม่ได้ | ไม่ได้ |
| `cancelled` | ยกเลิกแล้ว | ไม่ได้ | ไม่ได้ | ไม่ได้ |

## Current Next Implementation Snapshot

ตรวจ ณ 2026-06-11:

- `stock_issues` table มีใน Prisma schema
- `/sales/stock-issue` แสดงด้วย `TransactionBillsPageClient mode="stock-issue"`
- `GET /api/sales/stock-issue` อ่าน list จาก `stock_issues`
- หน้า list มีปุ่ม `เปิดบิลขาย`, `แก้ไข`, `ยกเลิก`
- API ยังไม่มี `POST`, `PATCH`, `cancel`, หรือ `convert-to-sales-bill`
- ปุ่ม `เปิดบิลขาย` ยังไม่มี action handler ที่เชื่อม write flow
- ยังไม่มี runtime write `stock_ledger.ref_type = PSALE`
- `/api/pending-sales` เป็น dashboard/read model คนละความหมาย ไม่ใช่ write flow ของ `PSALE`

## Implementation Gaps

- [ ] เพิ่ม `POST /api/sales/stock-issue` สำหรับสร้าง PSALE จาก WTO/ใบชั่ง OUT
- [ ] เพิ่ม stock availability validation จาก `onHand - activeReserved`
- [ ] เขียน `stock_ledger.ref_type = PSALE` ใน transaction เดียวกับ stock issue
- [ ] ปิด/consume/release WTO hold ที่ถูกนำมาออก PSALE เพื่อไม่ให้นับ reserved ซ้ำ
- [ ] เพิ่ม cancel policy ด้วย append reversal
- [ ] เพิ่ม convert-to-SB API และ UI action
- [ ] SB ที่สร้างจาก PSALE ต้องไม่ตัด stock ซ้ำ
- [ ] เพิ่ม source snapshot ระดับ line ระหว่าง `PSALE -> SB`
- [ ] เพิ่ม timeline/status log สำหรับ PSALE
- [ ] เพิ่ม reconciliation: PSALE pending, PSALE converted, SB linked, orphan ledger, double stock-out
- [ ] เพิ่ม reconciliation: WTO hold consumed/released by PSALE, over-sell blocked
- [ ] เพิ่ม UI/API support สำหรับ prefill จาก WTO/ใบชั่ง OUT โดยยังคงให้เลือก warehouse และ validate stock ก่อน save
- [ ] เพิ่ม line-level stock preview `onHand / reserved / available / issueQty / afterQty`
- [ ] ตัด legacy override ที่ให้ confirm เบิกเกิน stock ออก หรือทำเป็น permission-gated exception พร้อม audit reason

## Related Notes

- [[Sales Flow]]
- [[Sales Bills Page Flow]]
- [[Stock Ledger and Stock Balance]]
- [[Stock Balance Page Flow]]
