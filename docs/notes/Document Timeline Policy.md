---
title: Document Timeline Policy
aliases:
  - Document History Policy
  - Timeline Policy
tags:
  - ns-scrap-erp
  - architecture
  - audit
  - document-flow
status: active
created: 2026-06-06
---

# Document Timeline Policy

กฎกลางสำหรับเอกสารธุรกิจในระบบ NS Scrap ERP: รายการที่มีเลขเอกสารธุรกิจและผู้ใช้ใช้ติดตามงาน ต้องมี timeline หรือ history ที่ตรวจย้อนหลังได้

target table design รายละเอียดอยู่ที่ [[Document History Table Design]]

## Scope

ใช้กับเอกสารธุรกิจที่มีเลขเอกสาร outward เช่น:

- Purchase: `POB`, `WTI`, `WTO`, `PB`, `ADV`
- Payment: `PMA`, `PMT`
- Sales: `POS`, `PSALE`, `SB`, `RCP`
- Stock/production/finance documents ที่มี `doc_no`, `document_no`, `voucher_no`, หรือ `ref_no` ที่ผู้ใช้เห็นและใช้ค้นหา

ไม่ใช้กฎนี้กับ:

- master data `code` เช่น supplier code, product code, branch code
- internal bridge/detail rows ที่ไม่มีเลขเอกสารของตัวเอง เช่น allocation lines, summary lines, join tables
- internal system rows ที่ไม่ใช่เอกสารธุรกิจ เช่น auth/session/config rows

## Required Model

เอกสารที่มีเลขเอกสารต้องแยก source of truth เป็น 2 ชั้น:

| ชั้นข้อมูล | หน้าที่ | ตัวอย่าง |
|---|---|---|
| Current document table | เก็บสถานะล่าสุดและยอดปัจจุบัน | `po_buys`, `weight_tickets`, `purchase_bills`, `payment_approvals`, `payments`, `sales_bills` |
| Append-only timeline/event log | เก็บประวัติการเกิดเหตุการณ์และ transition | default เป็น table เฉพาะตามเอกสารหรือ flow เช่น `po_buy_status_logs`, `purchase_bill_status_logs`, `weight_ticket_usage_logs`, `payment_status_logs` |

ห้ามใช้ timeline/event log เป็นยอดปัจจุบันโดยตรง และห้ามเอา row ที่ยกเลิกแล้วกลับไปปนใน active allocation เพื่อให้เห็น history

Decision 2026-06-06:

- ไม่ใช้ `document_events` กลาง table เดียวเป็น source of truth ของ business timeline
- ให้แยก history table ตามเอกสารหรือ business flow เป็น default แล้วให้ read service/UI รวมข้อมูลจากแต่ละ table มาแสดง
- ข้อมูลเฉพาะของแต่ละ event ต้องมี typed columns และ FK จริงก่อนใช้ `metadata`
- `app_audit_logs` / `app_activity_logs` ใช้เป็น security/activity audit ไม่ใช่ replacement ของ document timeline

## Minimum Event Fields

Timeline/event log ของเอกสารควรมี field ขั้นต่ำ:

| Field | ความหมาย |
|---|---|
| `event_key` | outward stable key ของ event ห้ามใช้ bigint id เป็น outward key |
| `document_doc_no` หรือ `*_doc_no` | เลขเอกสารหลักที่ event ผูกอยู่ |
| `document_type` | ใช้เมื่อ table log รวมหลายเอกสาร |
| `action` | create, edit, approve, post, cancel, void, reverse, allocate, payment-recorded ฯลฯ |
| `from_status` | สถานะก่อนหน้า ถ้ามี |
| `to_status` | สถานะหลัง event ถ้ามี |
| `reason` | เหตุผล สำหรับ cancel/void/short-close/reverse |
| `changed_by` | ผู้ทำรายการจาก auth/app user |
| `changed_at` | เวลาเกิด event จาก server |
| `metadata` | JSON snapshot เฉพาะข้อมูลประกอบที่จำเป็นต่อ audit/reconcile |

## UI Rule

หน้ารายละเอียดของเอกสารทุกตัวที่มีเลขเอกสารต้องมี section ประวัติ เช่น:

- `Timeline`
- `ประวัติเอกสาร`
- `ประวัติการเปลี่ยนสถานะ`
- `ประวัติการใช้งาน` สำหรับเอกสารที่ถูกนำไป allocate หรือใช้ต่อ เช่น WTI -> PB

หน้า list ไม่จำเป็นต้องแสดง timeline เต็ม แต่ต้องเปิด detail หรือ modal ที่เห็นประวัติได้

## History Types

เอกสารบางตัวต้องมี history มากกว่า 1 มุม:

| ประเภทประวัติ | ใช้เมื่อไหร่ | ตัวอย่าง |
|---|---|---|
| Status timeline | create/edit/approve/cancel/void/reverse | `POB`, `PB`, `PMA`, `PMT`, `SB`, `RCP` |
| Usage timeline | เอกสารถูกนำไปใช้/allocate ต่อ | `WTI` ถูกใช้ใน `PB`, `ADV` ถูก allocate เข้า `PB` |
| Financial timeline | เกี่ยวกับการอนุมัติ/จ่าย/รับ/กลับรายการเงิน | `PMA`, `PMT`, `RCP` |
| Stock timeline | กระทบ stock ledger หรือ reversal | `WTI`, `WTO`, stock transfer/adjustment, production issue/output |

## Migration Rule

สำหรับข้อมูลเดิมที่เกิดก่อนมี event log:

- ให้ backfill baseline event เช่น `created`, `imported`, หรือ `baseline` ด้วย `event_key` จริง
- ถ้าเอกสารเคยถูกยกเลิกหรือ reverse แล้ว ต้องมี event ยกเลิก/reverse ใน history
- ห้ามแก้ runtime code ให้ fabricate history จาก internal id หรือ fallback จากข้อมูลผิด
- ถ้าข้อมูลเดิมไม่พอสร้าง event รายละเอียด ให้บันทึกเป็น baseline/imported พร้อม metadata ว่าเป็น migrated history

## Implementation Priority

เรียงลำดับตามเอกสารที่ผู้ใช้ต้อง trace และมีผลต่อยอดก่อน:

1. Purchase/Payment: `WTI`, `POB`, `PB`, `ADV`, `PMA`, `PMT`
2. Sales/Receipt: `WTO`, `POS`, `PSALE`, `SB`, `RCP`
3. Stock/production documents ที่ post หรือ reverse ได้
4. Finance/support vouchers ที่มีเลขเอกสารและผู้ใช้อ้างอิงย้อนหลัง

## Current Coverage Audit 2026-06-06

ตรวจจาก dev-target schema, Prisma schema, API/write helpers, และ active Next UI เมื่อ 2026-06-06

| เอกสาร/table | เลขที่พบ | Coverage ตอนนี้ | ขาดอะไร |
|---|---|---|---|
| `po_buys` | `doc_no` / `POB` | ครบระดับแรก | มี `po_buy_status_logs.event_key` สำหรับสถานะ, มี `po_buy_allocation_logs.event_key` สำหรับ PB allocate/release, write path append log แล้ว, และ UI detail แสดงประวัติสถานะกับประวัติการจัดสรร |
| `purchase_bills` | `doc_no`, `ref_no` / `PB` | ครบระดับแรก | มี `purchase_bill_status_logs.event_key`, write path append log, และ detail page แสดง timeline; ยังต้องต่อ usage/reconcile report เชิงลึกตาม flow |
| `weight_tickets` | `doc_no` / `WTI`, `WTO` | บางส่วน | มี timeline การแก้ไขจาก `app_audit_logs` และมี `weight_ticket_usage_logs` สำหรับ `WTI -> PB` allocate/release; ยังไม่มี `weight_ticket_status_logs` และยังไม่ได้ต่อ usage ของ `WTO -> SB` |
| `supplier_advance_payments` | `doc_no` / `ADV` | ครบระดับแรก | มี `supplier_advance_status_logs.event_key` สำหรับ lifecycle/status และ `supplier_advance_allocation_logs.event_key` สำหรับการหัก/คืนยอดจาก PB; detail timeline อ่านจาก dedicated logs แล้ว ไม่ใช้ `app_audit_logs` หรือ active allocation fact เป็น source หลัก |
| `payment_approvals` | `doc_no` / `PMA` | ขาด | ต้องมี `payment_approval_status_logs` สำหรับ approve, void, consume/paid, reverse และ detail/timeline |
| `payments` | `doc_no` / `PMT` | ขาด | มี payment history list แต่ยังไม่มี `payment_status_logs`, `payment_allocations`, `payment_account_splits` และ detail/timeline ของ PMT เอง |
| `po_sells` | `doc_no` / `POS` | ขาด | ต้องมี PO Sell status log และ detail/timeline |
| `stock_issues` | `doc_no` / `PSALE` หรือ stock issue | ขาด | ต้องมี issue/post/cancel/reverse timeline และ stock effect trace |
| `sales_bills` | `doc_no`, `ref_no` / `SB` | ขาด | ต้องมี sales bill status log, receipt/payment allocation events, cancel/reverse timeline |
| `receipts` | `doc_no` / `RCP` | ขาด | ต้องมี receipt/payment-in event log, cancel/reverse timeline, และ detail/timeline |
| `expenses` | `doc_no` / expense source | ขาด | ต้องมี expense source timeline และ handoff/approval/payment events |
| `transfers` | `doc_no` | ขาด | ต้องมี transfer create/post/cancel/reverse timeline |
| `bank_statement` | `doc_no`, `ref_no` | ขาดบางส่วน | เป็น ledger/read layer แต่ถ้า user เห็นเลขรายการและเปิดตรวจ ต้องมี event/source trace ไปเอกสารต้นทางหรือ ledger event history |
| `petty_advances` | `doc_no` | ขาด | ต้องมี petty advance lifecycle timeline |
| `petty_advance_returns` | `doc_no` | ขาด | ต้องมี return lifecycle timeline |
| `receipt_vouchers` | `doc_no` | ขาด | ต้องมี voucher status/history หรือถูกประกาศเป็น print/read model ที่ trace จาก source ได้ |
| `stock_adjustments` | `doc_no` | ขาด | ต้องมี stock adjustment post/cancel/reverse timeline |
| `grade_adjustments` | `doc_no` | ขาด | ต้องมี grade/status conversion timeline หรือ trace จาก stock ledger source |
| `production_orders` | `doc_no` | ขาด | ต้องมี production order lifecycle timeline |
| `loan_payments` | `doc_no` | ขาด | ต้องมี loan payment event/status timeline |
| `stock_ledger` | `ref_no` + `ledger_key` | บางส่วน | มี persisted `ledger_key` และควรเป็น append-only ledger แต่ยังไม่มี detail timeline ต่อ source document; ต้อง trace กลับ source doc/event ได้ |

สรุปปัจจุบัน: ระบบยังไม่เป็นไปตาม policy ครบทุกเอกสาร มี coverage จริงเฉพาะ `POB`, `PB`, และ `ADV`; `WTI` มี usage history สำหรับฝั่งบิลรับซื้อแล้วแต่ยังเป็น partial เพราะยังขาด status log และฝั่ง `WTO`; ที่เหลือต้องเพิ่ม event/timeline layer ตามลำดับ priority ข้างบน
