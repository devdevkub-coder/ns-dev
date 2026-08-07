---
title: ค่าใช้จ่าย Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-08-07
route: /daily/expense
---

# ค่าใช้จ่าย Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Daily Transactions |
| Route | `/daily/expense` |
| Page | ค่าใช้จ่าย |
| Current Next | accepted code baseline |

## Canonical References

[[Daily Cash Flow]], [[Payment Flow]]

## Flow Baseline

EXP เป็น expense source ที่เลือกได้ว่าจะส่งอนุมัติหรือจ่ายเลย

## Page Responsibilities

- สร้าง `EXP` หลายรายการค่าใช้จ่ายใน voucher เดียว
- เลือกประเภทและ filter หมวดค่าใช้จ่ายตามประเภท
- คำนวณ subtotal, VAT, WHT, discount และ net payable
- mode `ส่งอนุมัติ` ส่งเข้า PMA/PMT flow
- mode `จ่ายเลย` สร้าง EXP + PMT + bank statement ใน transaction เดียว
- แสดง detail row-click, วันที่จ่าย, status และ source payment history
- พิมพ์ใบสำคัญจ่ายค่าใช้จ่ายจาก EXP snapshot โดยใช้ Company Profile ตามสาขา รองรับหลายหน้าแบบไม่จำกัด

## Non-Responsibilities

- ไม่ใช่หน้าอนุมัติจ่ายเงิน
- ไม่ใช่หน้าประวัติ PMT หลัก
- ไม่เขียน stock/PO allocation
- ไม่รับผู้รับเงินแบบ free text ถ้า target กำหนด Supplier/person master

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET list/filter และ category/type options |
| 2 | สร้าง EXP | เลือก mode, supplier/payee, type/category, expense lines |
| 3 | ส่งอนุมัติ | POST EXP pending approval |
| 4 | จ่ายเลย | POST EXP + PMT + BST |
| 5 | cancel direct payment | cancel PMT/payment facts และ set EXP status ตาม flow |

## API / Data Contract

### Current API

- `GET /api/daily/expenses - list/filter`
- `POST /api/daily/expenses - create EXP / direct payment mode`
- `PATCH /api/daily/expenses/[id] - update/cancel/status action`

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ

## Validation / Status Rules

- expense type/category/payee/date required
- category ต้องอยู่ใต้ type ที่เลือก
- money fields ใช้ money pattern และ server validate
- direct payment ต้องมี company account/payment method/receiving account
- cancel direct EXP PMT ต้อง reverse payment/bank facts

## Side Effects

- ส่งอนุมัติ: สร้าง EXP source payable แต่ยังไม่เขียน bank statement
- จ่ายเลย: สร้าง EXP, PMT, payment_account_splits, payment_status_logs, bank_statement
- history แสดงใน payment history ผ่าน payments.lines source snapshot

## Print Contract

- ใบพิมพ์ EXP แบ่งหน้าละ 15 รายการ; ทุกหน้ามีหัวบริษัท ข้อมูลเอกสาร และ table header เดิม
- หน้า `1..N-1` แสดง footer ตารางว่าง, กรอบสรุปว่าง 2 กรอบ และข้อความมีต่อหน้าแทนยอด/หมายเหตุ/ลายเซ็น
- หน้าสุดท้ายเท่านั้นแสดงยอด VAT/WHT/ยอดสุทธิ หมายเหตุ และลายเซ็นผู้จัดทำ/ผู้ตรวจสอบ/ผู้อนุมัติ/ผู้รับเงิน
- preview ใช้พื้นหลัง `#334155` กับกระดาษ A4 สีขาวมีเงา; print media ตัดพื้นหลัง เงา radius และ page gap ออก
- การพิมพ์เป็น read-only และไม่สร้างหรือแก้ EXP, PMA, PMT, Bank Statement หรือ payment history

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

approval/payment link, aging และ WHT/VAT reporting ต้องพิสูจน์เพิ่ม

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [ ] Verify legacy behavior for any gap before implementing runtime change
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [ ] Update this file and canonical reference if contract changes
