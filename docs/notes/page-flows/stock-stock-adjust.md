---
title: นับสต๊อก / Stock Count Adjust Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-11
route: /stock/adjust
---

# นับสต๊อก / Stock Count Adjust Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Stock |
| Route | `/stock/adjust` |
| Page | นับสต๊อก / Stock Count Adjust |
| Current Next | accepted code baseline |

## Canonical References

[[Stock Adjust Page Flow]], [[Stock Ledger and Stock Balance]]

## Flow Baseline

ADJ ปรับยอดจากการนับจริง พร้อม reason/audit

## Page Responsibilities

- บันทึกผลนับจริงเทียบ book balance
- สร้าง adjustment in/out เฉพาะส่วนต่าง
- เก็บ reason, note, actor, date และ source evidence
- ใช้ reconcile stock balance กับ physical count

## Non-Responsibilities

- ไม่ใช้แทน PB/SB/ST/GA สำหรับ transaction ปกติ
- ไม่ลบ ledger เก่า
- ไม่แก้ต้นทุนย้อนหลังโดยไม่มี accounting policy

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET adjust list/options |
| 2 | เลือก stock bucket | product+branch+warehouse+lot/status |
| 3 | กรอก counted qty | ระบบคำนวณ difference |
| 4 | บันทึก | POST ADJ ledger diff |
| 5 | reverse/approve | target ต้องมี approval/reversal boundary |

## API / Data Contract

### Current API

- `GET /api/stock/adjust - list/options`
- `POST /api/stock/adjust - create stock adjustment`

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ

## Validation / Status Rules

- counted qty ต้อง >= 0
- reason required
- ถ้ามี active hold ต้อง policy ว่านับ on_hand หรือ available
- adjustment date/cutoff ต้องชัด

## Side Effects

- เขียน stock ledger ref_type ADJ เฉพาะส่วนต่าง
- balance เปลี่ยนตาม diff

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

- approval/reconciliation boundary ทำแล้วในระดับ runtime policy: direct post ถูก block ถ้า counted qty ต่ำกว่า active hold และต้องปลด hold/ทำ approval policy แยกก่อน
- accounting impact เป็น `NOTE_ONLY`: ADJ ledger value ต้องเป็นศูนย์ และ reconciliation ตรวจ policy นี้แล้ว
- remaining: dedicated approval/reversal document ยังเป็น future policy แยกจาก quick count adjust

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [ ] Verify legacy behavior for any gap before implementing runtime change
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [ ] Update this file and canonical reference if contract changes
