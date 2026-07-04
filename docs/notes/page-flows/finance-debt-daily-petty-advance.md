---
title: เงินสำรองจ่าย / กู้กรรมการ Page Flow
tags:
  - page-flow
  - menu
  - finance-debt
  - petty-advance
status: accepted-baseline
updated: 2026-06-11
route: /daily/petty-advance
---

# เงินสำรองจ่าย / กู้กรรมการ Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Finance & Debt |
| Route | `/daily/petty-advance` |
| Page | เงินสำรองจ่าย / กู้กรรมการ |
| Current Next | accepted code baseline |

## Canonical References

[[Finance Debt Flow]], [[Petty Advance Page Flow]], [[Daily Cash Flow]], [[Finance Bank Statement Page Flow]]

## Page Purpose

หน้านี้ใช้สร้างและติดตามเงินที่บริษัทให้กรรมการ/พนักงานยืม หรือเงินสำรองจ่ายที่ต้องเคลียร์คืนภายหลัง. เอกสารหลักคือ `PADV` เป็นยอดคงค้าง, ส่วนการคืนเงินใช้ `PRET`.

Target ที่ยืนยันแล้ว: `PADV` create/edit ไม่สร้าง `BST`; `PRET` return เท่านั้นที่สร้าง bank statement เงินเข้า.

## Legacy Baseline

Legacy `view-pettyAdvance` มี:

- เลขเอกสาร `PADV`
- วันที่
- ประเภท `DIRECTOR_LOAN` / `PETTY_CASH`
- ผู้รับเงิน
- จำนวนเงิน
- บัญชีจ่ายออกของบริษัท
- status `active`, `closed`, `cancelled`
- ค้นหา, filter type/status
- ปุ่ม `คืนเงิน`
- detail แสดงค่าใช้จ่ายที่ link กับ advance และประวัติคืนเงิน

ความต่างของ target จาก legacy: legacy สร้าง `bankStatement` เงินออกตอนบันทึก `PADV`; target ปัจจุบันไม่ทำ เพราะ user ยืนยันว่าเงินสำรอง/กู้เป็นรายการยืมก่อน และ `BST` เกิดตอนคืนเงินใน flow นี้.

## Page Responsibilities

- แสดงรายการ `PADV` พร้อมยอดจ่าย, คืนแล้ว, คงเหลือ
- สร้าง/แก้ `PADV` ด้วยผู้รับเงินจาก master `director_employees`
- snapshot ชื่อผู้รับเงินและบัญชีรับเงินลงเอกสาร
- บันทึกคืนเงิน `PRET`
- ปิดสถานะเป็น `closed` เมื่อยอดคืนสะสมเท่ากับยอด `PADV`
- แสดง detail ของ return history ต่อเอกสาร

## Non-Responsibilities

- ไม่ใช่หน้า `EXP` และไม่สร้างค่าใช้จ่ายทันที
- ไม่สร้าง `PMA` / `PMT`
- ไม่ให้กรอกบัญชีจ่ายออกของบริษัทใน modal create
- ไม่รับผู้รับเงินแบบ free-text
- ไม่แก้ `bank_statement` ตรงจากหน้านี้

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | โหลด `PADV` rows, return rows, accounts, recipient options |
| 2 | สร้าง `PADV` | server ออกเลข `PADV`, validate recipient, snapshot bank fields, save outstanding |
| 3 | แก้ `PADV` | update header/snapshot ถ้ายังไม่ถูก lock ตาม status |
| 4 | กดคืนเงิน | เปิด return modal โดยตั้งยอดคงเหลือเป็นค่าเริ่มต้น |
| 5 | บันทึกคืนเงิน | สร้าง `PRET`, update returned amount/status, เขียน `bank_statement` เงินเข้า |
| 6 | คืนครบ | status `closed`, future edit/cancel ต้องถูก lock ตาม policy |

## Current API

| Method | API | Current behavior |
|---|---|---|
| `GET` | `/api/daily/petty-advances` | โหลด `accounts`, `recipientOptions`, `rows`; include returns; sort by date/created_at |
| `POST` | `/api/daily/petty-advances` | create/update `PADV`; resolve recipient by `director_employees.code`; no bank statement write |
| `POST` | `/api/daily/petty-advances/returns` | create `PRET`; update `petty_advances.returned_amount/status`; create `bank_statement.ref_type = PRET` |

Permission ปัจจุบัน: `finance.cash.view`.

## Data Contract

- Outward id ของ advance คือ `petty_advances.doc_no`.
- Recipient option id คือ `director_employees.code`.
- Recipient ที่เลือกต้อง active และ type อยู่ใน `กรรมการ`, `พนักงาน`.
- Recipient ต้องมี `bank_name`, `bank_account_name`, และเลขบัญชีตัวเลข.
- `petty_advances.account_id` ไม่ถูกใช้เป็นบัญชีจ่ายออกใน target create flow.
- Return account ใช้ `accounts.code` แล้ว server resolve เป็น internal account id.

## Validation / Status Rules

- `date`, `type`, `recipientId`, `amount` required.
- `amount > 0`.
- ผู้รับเงินต้องอยู่ในรายชื่อ active และมีบัญชีรับเงินครบ.
- `return amount > 0` และต้องไม่เกินยอดคงเหลือ; current code ยังต้อง harden server-side check ตรงนี้.
- `active` = ยังมียอดคงเหลือ, `closed` = คืนครบ, `cancelled` = ยกเลิก.
- Future cancel/reverse ต้องเป็น append-only และไม่ลบ source facts เงียบ ๆ.

## Side Effects

- `PADV create/edit`: ไม่มี `bank_statement`.
- `PRET return`: สร้าง `bank_statement` เงินเข้า, `ref_type = PRET`, `ref_no = PRET doc no`.
- ไม่มี stock/AP/AR/GL side effect จากหน้านี้.

## UI / Table Contract

ควรแสดงอย่างน้อย:

- เลข `PADV`
- วันที่จ่าย
- วันที่สร้างรายการ
- ประเภท
- ผู้รับเงิน
- บัญชีรับเงิน snapshot
- จำนวนเงิน
- คืนแล้ว
- คงเหลือ
- สถานะ
- Action: แสดงเฉพาะปุ่มที่กดได้จริง เช่น คืนเงิน, แก้ ตาม lock; เปิด detail โดยกดทั้งแถว

Filter:

- search จากเลขเอกสาร/ผู้รับเงิน/หมายเหตุ
- segmented ประเภท
- segmented สถานะ แยกบรรทัดตาม design
- list surface ใช้ตารางหลักเดียวทุกขนาดจอ; ไม่ใช้ mobile card list แยกอีกชุด

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the implementation baseline as of 2026-06-11.
- หน้า `/daily/petty-advance` ไม่แสดง field `ใช้ไปแล้ว` แล้ว เพื่อไม่ให้สื่อความหมายผิดกับ flow ปัจจุบันที่ยังไม่ได้ finalize expense allocation จาก `PADV`
- Current API ไม่ expose `created_at` ใน row payload; target list/export ควรเพิ่ม.

## Current Gap

- Expense allocation/clearing กับ `EXP` ยังไม่สมบูรณ์.
- ต้องเพิ่ม `petty_advance_status_logs` หรือ equivalent timeline.
- ต้อง harden return overpayment server-side.
- ต้องกำหนด cancel/reverse policy ให้ชัดก่อนเปิดใช้งานจริง.

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [x] Capture legacy baseline and target difference
- [ ] Add created-at to list/detail/export contract
- [ ] Design expense allocation/clearing
- [ ] Design append-only cancel/reverse/status logs
