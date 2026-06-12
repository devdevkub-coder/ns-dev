---
title: ใบสำคัญรับเงิน Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-11
route: /purchase/receipt-vouchers
---

# ใบสำคัญรับเงิน Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Daily Transactions |
| Route | `/purchase/receipt-vouchers` |
| Page | ใบสำคัญรับเงิน |
| Current Next | accepted code baseline |

## Canonical References

[[Receipt Voucher Page Flow]], [[Printable Documents]], [[Payment Flow]], [[Purchase Flow]]

## Flow Baseline

เอกสารพิมพ์/ประวัติใบสำคัญรับเงิน Supplier จาก manual RV facts

Legacy baseline confirmed from `old-apps/legacy/index.html` component `view-receiptVoucher`: `RV` คือเอกสารที่ Supplier/ผู้รับเงินเซ็นรับเงินสดให้บริษัท ใช้ดึงข้อมูลจาก PB มา pre-fill ได้ แต่ตัว RV ไม่ใช่ payment posting owner ไม่ใช้กับโอนเงิน/เช็ค และไม่ใช่หน้ารับเงิน Customer (`RCP` อยู่ `/sales/receipts`)

Active Next target decision: modal เริ่มจาก section ข้อมูลหลักด้านบน โดยมี Supplier selector เพียงจุดเดียวเพื่อกรอง PB ของ Supplier นั้น จากนั้นเลือก PB เพื่อเติมข้อมูลผู้รับเงินจาก PB supplier snapshot (`purchase_bills.supplier_*_snapshot`) โดยตรง และเติมรายการสินค้า/ยอด/ข้อมูลอ้างอิงให้เป็น snapshot อัตโนมัติ โดยข้อมูล Supplier ที่เติมมาแสดงเป็น read-only และ section รายการสินค้าเป็น read-only; RV ยังไม่ใช่ payment posting owner

## Page Responsibilities

- แสดงรายการใบสำคัญรับเงินที่เกี่ยวกับการซื้อ/จ่าย Supplier
- ใช้เป็น printable document/manual snapshot ไม่ใช่ transaction owner
- เลือก Supplier เพื่อกรอง PB options; เมื่อเลือก PB แล้ว seller name, tax id, address, phone, และ sale contact ต้องมาจาก PB supplier snapshot โดยตรง
- modal ต้องมี Supplier selector เพียงจุดเดียวด้านบน; ห้ามมีช่องเลือก/กรอก Supplier ซ้ำใน section ผู้รับเงิน
- Supplier snapshot ต้องไม่มี fallback ไป `purchase_bills.contact_name`, address-line fields, structured address fields, live supplier master, หรือค่าที่ค้างในฟอร์มเดิม
- modal ต้องไม่มีช่อง `ผู้รับเงิน (ลายเซ็น)`; print ใช้ชื่อ `ผู้รับเงิน` snapshot เป็นชื่อผู้รับเงินสำหรับลายเซ็น
- `ผู้จ่ายเงิน (ลายเซ็น)` ต้องเป็น read-only จากคนสร้างเอกสาร; server เป็นผู้กำหนดค่า ไม่รับ override จาก client
- เลือก PB เพื่อ pre-fill purchase bill ref, vehicle, item, amount, note snapshot ได้
- section รายการสินค้า/ยอดใน RV modal เป็น read-only จาก PB snapshot; ถ้ารายการผิดต้องแก้ที่ source PB
- รองรับ filter วันที่ Supplier เลขเอกสาร และสถานะพิมพ์/ยกเลิกตาม target
- create/edit ต้องบันทึก snapshot ของผู้รับเงิน รายการสินค้า ยอดเงิน ตัวอักษร วิธีรับเงินสด และผู้ลงนาม

## Non-Responsibilities

- ไม่สร้าง PB/PMA/PMT
- ไม่เขียน bank statement หรือ stock ledger
- ไม่เป็นแหล่ง truth ของยอดจ่าย; ต้องอ่านจาก payment/PB facts

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET voucher list + Company Profile + Supplier/PB options |
| 2 | เลือก row | ดู detail/print source |
| 3 | สร้าง/แก้ไข target | เลือก Supplier เพื่อ pre-fill ผู้รับเงิน แล้วเลือก PB เพื่อเติมรายการสินค้า |
| 4 | พิมพ์ | สร้างเอกสารพิมพ์จาก RV snapshot/company profile |
| 5 | ยกเลิก RV target | target ต้องเป็น status/cancel log; current UI ยังปิดปุ่มยกเลิก |

## API / Data Contract

### Current API

- `GET /api/purchase/receipt-vouchers - list/read model + Company Profile + active Supplier options + active PB options with item snapshots`
- `POST /api/purchase/receipt-vouchers - create manual RV snapshot with generated RVYYMM-NNNN`
- `PATCH /api/purchase/receipt-vouchers - update manual RV snapshot fields`
- Current Next has no cancel/status write API for RV yet.
- Runtime PMT write path does not create/update/delete RV automatically.

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ

## Validation / Status Rules

- ถ้าใช้ Supplier selector ต้องเลือกจาก active supplier options; seller fields ถูกบันทึกเป็น snapshot ของ RV
- ถ้าเลือก PB ต้องเป็น PB ที่ยังไม่ยกเลิก และเมื่อมี Supplier แล้ว PB options ต้องถูกกรองตาม Supplier นั้น
- RV เป็นเอกสาร Supplier เซ็นรับเงินสด/หลักฐานแนบ ไม่ใช่ payment posting owner
- ใช้กับเงินสดเท่านั้น; โอนเงิน/เช็ค/ธนาคารต้องใช้ PMT หรือหลักฐานธนาคาร ไม่ใช่ RV
- `วิธีรับเงิน` ใน modal เป็น fixed display `รับเงินสด` และ write path ต้องบันทึกเป็น `รับเงินสด` เสมอ
- cancelled source ต้องแสดง watermark/status ไม่หายจาก audit
- `seller_name` และอย่างน้อย 1 item เป็น required ตาม legacy
- item unit target ต้องเก็บจาก PB/RV item snapshot; legacy แสดง `กก.` แต่ target รองรับ `กก.` และ `ลัง`

## Side Effects

- read-only/print-only ไม่มี transaction side effect
- print ต้องไม่ mutate PB/PMT/PMA
- create/edit/cancel RV ต้องไม่เขียน bank statement, ไม่เปลี่ยน payable balance, และไม่ reverse payment
- PMT remains owner of payment/BST/AP settlement and must not auto-write `receipt_vouchers`.

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Legacy Proof / Current Gap

- Legacy `view-receiptVoucher` มี create/edit/delete/print local flow และ PB pre-fill ครบ แต่ delete เป็น hard delete ซึ่ง target ควรเปลี่ยนเป็น cancel/status log; active Next ใช้ Supplier selector เป็น primary pre-fill source และ PB selector เป็น optional item pre-fill source ตาม decision ล่าสุด
- Current Next เป็น list + print preview + create/edit manual RV จาก `receipt_vouchers`; ปุ่ม cancel ยัง disabled
- Print preview now includes the legacy template structure and Company Profile header.
- PMT auto-generate RV was removed; RV is manual from the receipt voucher page.
- signer/payment method/source fields ต้อง harden ตาม [[Receipt Voucher Page Flow]]

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [ ] Verify legacy behavior for any gap before implementing runtime change
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [ ] Update this file and canonical reference if contract changes
