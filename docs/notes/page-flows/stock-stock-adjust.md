---
title: นับสต๊อก / Stock Count Adjust Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-21
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

ADJ ปรับยอดจากการนับจริง พร้อม reason/audit และ stock correction value ตาม requirement ล่าสุด

## Page Responsibilities

- บันทึกผลนับจริงเทียบ book balance
- สร้าง adjustment in/out เฉพาะส่วนต่าง
- เก็บ reason, note, actor, date และ source evidence
- ใช้ reconcile stock balance กับ physical count
- ใช้สำหรับ stock หาย, stock เกิน, audit และ cycle count
- แสดง/บันทึกราคาต่อกก. และมูลค่ารวม signed ที่อาจกระทบ WAC/margin

## Non-Responsibilities

- ไม่ใช้แทน PB/SB/ST/GA สำหรับ transaction ปกติ
- ไม่ลบ ledger เก่า
- ไม่แก้ต้นทุนย้อนหลังหรือ WAC/margin impact โดยไม่มี price/correction policy ที่ trace ได้
- ไม่สร้าง master เหตุผลแยก; เหตุผลใช้ fixed options ในหน้า

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET adjust list/options |
| 2 | เลือก stock bucket | product+branch+warehouse+lot/status |
| 3 | กรอก counted qty | ระบบคำนวณ difference, unit price/kg และมูลค่ารวม |
| 4 | บันทึก | POST ADJ ledger diff + stock correction value |
| 5 | แก้ไขภายใน 7 วัน | target correction/reversal trail พร้อม updated_by/updated_at |
| 6 | reverse/approve หลัง 7 วัน | target ต้องมี approval/reversal boundary |

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
- reason required และต้องเลือกจาก fixed options: Missing, Lost/Damaged, Found Excess, Lost, Damaged, Wrong Branch, Other
- ถ้ามี active hold ต้อง policy ว่านับ on_hand หรือ available
- adjustment date/cutoff ต้องชัด
- แก้ไขรายการนับ stock ได้ไม่เกิน 7 วัน; หลังจากนั้นต้องมี approval/reconciliation policy
- `LOSS` value ต้องติดลบ, `GAIN` value ต้องเป็นบวก และ wording คือ `มูลค่ารวม (บาท)` ไม่ใช่ `มูลค่า Note`

## Side Effects

- เขียน stock ledger ref_type ADJ เฉพาะส่วนต่าง
- balance เปลี่ยนตาม diff
- target correction value อาจกระทบ WAC และ margin ตาม price policy

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

- approval/reconciliation boundary ทำแล้วในระดับ runtime policy: direct post ถูก block ถ้า counted qty ต่ำกว่า active hold และต้องปลด hold/ทำ approval policy แยกก่อน
- current runtime สำหรับ row ใหม่ใช้ `STOCK_CORRECTION`: ADJ ledger เขียน qty และ value ตามส่วนต่าง, `value_note` เป็น signed total value, และ server reject non-zero correction ถ้าไม่พบราคาต่อกก.
- UI/API เพิ่ม server snapshot preview, fixed reason options, unit price/kg, signed `มูลค่ารวม`, `updated_by/updated_at`, และ edit/correction ภายใน 7 วัน
- UI checkpoint 2026-06-21: หน้า `/stock/adjust` ปรับตาม `docs/design.md` โดยเอาปุ่ม `โหลดใหม่` และกล่องคำอธิบายยาวออก, ใช้ modal/card `rounded-md`, desktop table breakpoint `lg`, table header `bg-slate-100`, body cell `text-xs font-semibold`, pagination row ตาม list pattern, sortable table headers, คลิก row/card เพื่อเปิด detail modal, wording `วันที่เอกสาร` / `ยอดในระบบ` / `ส่วนต่าง` / `มูลค่ารวม (บาท)`, และ action เป็น outline button
- remaining: approval flow หลัง 7 วันและ CSV/export ยังเป็น future policy/delivery แยกจาก quick count adjust

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [x] Verify legacy/updated requirement before runtime change
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [x] Update this file and canonical reference if contract changes
