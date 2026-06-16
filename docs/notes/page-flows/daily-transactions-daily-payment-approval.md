---
title: อนุมัติจ่ายเงิน Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-11
route: /daily/payment-approval
---

# อนุมัติจ่ายเงิน Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Daily Transactions |
| Route | `/daily/payment-approval` |
| Page | อนุมัติจ่ายเงิน |
| Current Next | accepted code baseline |

## Canonical References

[[Payment Flow]]

## Flow Baseline

PMA approval document สำหรับ source payable ก่อน PMT

## Page Responsibilities

- แสดง source payable จาก PB/ADV/EXP ในสถานะยังไม่อนุมัติ
- อนุมัติยอดเต็มหรือ split ยอดเป็น PMA running ใหม่ทุกครั้ง
- แสดง PMA approved ที่รอทำจ่าย และ PMA voided แบบ read-only
- snapshot ผู้รับเงิน ช่องทางรับเงิน บัญชีรับเงิน ยอดอนุมัติ และผู้อนุมัติ
- lock source document เมื่อมี active PMA approved
- ใบพิมพ์ชุดที่เลือกต้องแสดงรายการเดิมครบ, sort ให้ผู้รับเงิน/Supplier และช่องทางจ่ายเดียวกันอยู่ติดกัน, แสดงเลขที่เอกสารต้นทาง, ใช้วันที่ PMA ในคอลัมน์วันที่ และเพิ่มแถวรวมเมื่อผู้รับเงิน/Supplier เดียวกันใช้ช่องทางจ่ายหรือเลขบัญชีเดียวกันมากกว่า 1 รายการ

## Non-Responsibilities

- ไม่ทำจ่ายเงินจริงและไม่เขียน bank statement
- ไม่แก้ยอด source document
- ไม่เขียน stock/PO/WTI allocation
- ไม่ reuse PMA เดิมหลัง void/cancel payment

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดคิว | GET pending source + approved/voided PMA |
| 2 | เลือก source | ตรวจยอด pending จาก source current state |
| 3 | อนุมัติ | POST สร้าง PMA snapshot ตามยอดที่อนุมัติ |
| 4 | split approval | ยอดที่เหลือกลับเป็น pending candidate |
| 5 | void PMA | คืนยอดเข้าคิวและเก็บ PMA เป็น audit |
| 6 | handoff | PMA approved ไป `/purchase/payments` |

## API / Data Contract

### Current API

- `GET /api/daily/payment-approval - pending/approved/voided queues`
- `POST /api/daily/payment-approval - create approval/split/void action`

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ

## Validation / Status Rules

- approve amount > 0 และไม่เกิน pending source amount
- source cancelled ไม่อยู่ในคิว
- destination payment method/account ต้องมาจาก source party snapshot/master ที่ถูกต้อง
- void ได้เฉพาะก่อนเกิด active PMT
- filter/status ต้องแยก source pending, PMA approved, PMA voided

## Side Effects

- สร้าง `PMA`/payment approval snapshot และ status log
- ไม่สร้าง PMT/BST
- source lock เกิดเมื่อมี PMA approved อย่างน้อย 1 รายการ

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

status/timeline และ payment-cycle locks ต้องพิสูจน์ runtime เพิ่ม

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [ ] Verify legacy behavior for any gap before implementing runtime change
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [ ] Update this file and canonical reference if contract changes
