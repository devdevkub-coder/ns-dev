---
title: จ่ายเงิน Supplier Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-07-14
route: /purchase/payments
---

# จ่ายเงิน Supplier Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Daily Transactions |
| Route | `/purchase/payments` |
| Page | จ่ายเงิน Supplier |
| Current Next | accepted code baseline |

## Canonical References

[[Payment Flow]]

## Flow Baseline

PMT จ่าย PMA approved และเขียน bank statement

## Page Responsibilities

- แสดง queue รอจ่ายจาก PMA approved
- เลือกหลาย PMA ใน PMT เดียวเมื่อผู้รับเงิน วิธีรับเงิน ธนาคาร และเลขบัญชีปลายทาง snapshot ตรงกัน
- สร้าง PMT/payment splits/bank statement/status logs
- มีแท็บประวัติ PMT เสร็จสิ้นและยกเลิกแล้ว
- เปิด detail modal จาก history โดยใช้ outward PMT/PMA doc no

## Non-Responsibilities

- ไม่อนุมัติยอดใหม่
- ไม่แก้ PB/ADV/EXP source amount
- ไม่จ่ายบางส่วนที่ชั้น PMT; partial ต้อง split ที่ PMA
- ไม่ใช้ internal voucher_id เป็น UI/URL

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดรอจ่าย | GET PMA approved ที่ยังไม่ paid |
| 2 | เลือก PMA | validate party + destination payment method/bank/account snapshot เดียวกัน |
| 3 | บันทึกจ่าย | POST สร้าง PMT + bank statement แล้วส่ง PMT Flex หลัง commit |
| 4 | ดูประวัติ | GET payment-history ตาม filter |
| 5 | cancel PMT | POST cancel reverse payment/bank facts และต้อง approve ใหม่ |

## API / Data Contract

### Current API

- `GET /api/purchase/payments - waiting PMA queue`
- `POST /api/purchase/payments - create PMT เท่านั้น; payload ที่พยายามแก้ PMT เดิมหรือกำหนดเลข PMT เองต้องถูก reject`
- `GET /api/purchase/payment-history - PMT/PMA history list`
- `GET /api/purchase/payment-history/[...id] - payment detail`
- `POST /api/purchase/payments/cancel - cancel PMT`
- `POST /api/purchase/payments/cancel-approved - void/cancel approved PMA before payment`

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- หลัง transaction สำเร็จ `POST /api/purchase/payments` enqueue และ execute LINE source `purchase_payment` / document type `PMT`; notification error ต้องไม่เปลี่ยน successful payment response
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ

## Validation / Status Rules

- PMA ที่เลือกต้อง approved และยังไม่ถูกจ่าย
- PMA ใน PMT เดียวกันต้องผู้รับเงินเดียวกันและ destination method/account เดียวกัน
- ตรวจผู้รับเงินจาก snapshot ของ PMA ก่อน และตรวจซ้ำกับผู้รับเงินของเอกสารต้นทางปัจจุบัน
- normalize วิธีรับเงินเก่า `โอนเงิน` เป็น `เงินโอน` และบันทึกชื่อ canonical จาก payment-method master; วิธีโอนต้องมีธนาคารและเลขบัญชีตัวเลข ส่วนเงินสดเว้นธนาคาร/บัญชีได้
- จ่ายเต็ม PMA ที่เลือก; discount/bank fee เป็นระดับ PMT
- cash split รวมต้อง reconcile กับ total cash out
- PMT ที่เสร็จสิ้นแล้วเป็น read-only snapshot; ถ้าข้อมูลการจ่ายผิดต้อง cancel/reverse แล้ว approve และทำจ่ายใหม่ ห้ามแก้ voucher เดิม
- cancel PMT ต้องไม่ reuse PMA เดิมเป็น active cycle

## UI / UX Baseline

- แท็บ `จ่ายเงิน` แสดง KPI เฉพาะคิว: `ยอดรอจ่าย` และ `อายุเอกสารสูงสุด`; ไม่ปนยอด PMT จากประวัติ
- filter card ของคิวใช้ search ในแถวบนและ segmented `ประเภทเอกสาร` ในแถวล่าง โดยมีเฉพาะ source type จริง `บิลซื้อ` / `เงินมัดจำ` / `ค่าใช้จ่าย` / `คืนเงินสำรองจ่าย`; ปุ่ม `ล้าง` และการเปลี่ยนแท็บต้องคืนค่าเป็น `ทุกประเภท`
- แท็บ `ประวัติ` แสดงจำนวน PMT ทั้งหมด/จ่ายแล้ว/ยกเลิก และเงินออกสุทธิที่นับเฉพาะ PMT จ่ายแล้วตาม filter
- ตาราง desktop รวมธนาคารและเลขบัญชีเป็น `ปลายทางรับเงิน`, ใช้ shared table shell/horizontal scroll เพียงชั้นเดียว, เก็บ header บรรทัดเดียวรวม `อายุเอกสาร (วัน)` ให้เห็นครบ และตรึงคอลัมน์ `จัดการ` ด้านขวาเพื่อให้ `ทำจ่าย` มองเห็นเสมอ; รอยต่อก่อนคอลัมน์ `จัดการ` ไม่แสดง resize handle หรือเส้นแบ่งแนวตั้ง เพื่อไม่ให้เกิดขีดลอยเมื่อคิวว่าง
- mobile card แสดง `ยอดรอจ่าย` เป็นตัวเลขหลัก, แสดงยอดอนุมัติเพิ่มเฉพาะเมื่อไม่เท่ากัน, แสดงประเภทเอกสาร/อายุ และมีปุ่ม `ทำจ่าย`/`ยกเลิก` ที่มองเห็นได้
- search ต้องอ่าน destination snapshot ชุดเดียวกับที่ render; supplier master ใช้เป็น fallback presentation สำหรับข้อมูลเก่าเท่านั้น
- แท็บประวัติไม่มี action แก้ไข PMT; row/detail ใช้ดู snapshot และยกเลิกตามสิทธิ์เท่านั้น
- history card/table ใช้ปุ่ม `ดูรายละเอียด` ที่เข้าถึงด้วยคีย์บอร์ด แทนการบังคับกดทั้ง card/row

## Side Effects

- สร้าง `payments`, `payment_account_splits`, `payment_status_logs`, `bank_statement`
- หลัง commit สร้าง `line_notification_jobs` ตามกฎ `PMT` ที่ระบุกลุ่มตรง ๆ และบันทึก attempt/retry แยกจาก payment transaction
- recalc source PB/ADV/EXP paid/payable status
- cancel PMT reverse payment/bank facts และเก็บ audit

## LINE Notification Contract

- trigger เฉพาะการสร้าง PMT ใหม่สำเร็จจากปุ่ม `ทำจ่าย` แล้วกด `บันทึก`; การเปิดดูหรือยกเลิก PMT ไม่ส่งซ้ำ
- routing ต้องมีกฎ `PMT` แบบ explicit ใน `/admin/line-settings`; หากไม่มีกฎต้อง skip แบบ fail-closed และห้าม fallback ไป default/all active groups
- Flex รวมทุก payment row ของ outward PMT เดียวกัน และแสดงเลข PMT/สถานะ, วันที่/สาขา, ผู้รับ, วิธีจ่ายและปลายทาง, PMA/เอกสารต้นทาง, บัญชีบริษัทที่จ่าย, ยอดจ่าย/ส่วนลด/WHT/ค่าธรรมเนียม/เงินออกสุทธิ, หมายเหตุ และปุ่มเปิดระบบ
- Flex ใช้ bubble ขนาด `mega` และแบ่ง label/value เป็น 3:4 โดย label ต้อง wrap ได้ เพื่อไม่ให้หัวข้อการเงินถูกตัดเป็น `...`
- ใช้ PMA/payment/account snapshots เป็นหลัก, mask เลขบัญชีปลายทางเหลือท้าย 4 หลัก และห้ามแสดง internal payment/voucher/source IDs, tax ID หรือข้อมูลติดต่อที่ไม่จำเป็น

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

multi-bill voucher, split accounts, reversal ต้องตรวจ runtime/legacy ครบทุก use case

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [ ] Verify legacy behavior for any gap before implementing runtime change
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [ ] Update this file and canonical reference if contract changes
