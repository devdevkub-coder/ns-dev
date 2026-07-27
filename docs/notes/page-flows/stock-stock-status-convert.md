---
title: ปรับสถานะสินค้า Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-21
route: /stock/status-convert
---

# ปรับสถานะสินค้า Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Stock |
| Route | `/stock/status-convert` |
| Page | ปรับสถานะสินค้า |
| Current Next | accepted code baseline |

## Canonical References

[[Stock Status Convert Page Flow]], [[Stock Ledger and Stock Balance]]

## Flow Baseline

SC ย้าย qty ระหว่าง stock status/output category โดย product เดิม. Requirement ล่าสุดจำกัด normal flow เป็น `RM -> FG` และ `FG -> RM` สำหรับ `Stock Reclassification / แก้ classification ผิด` เช่น รับซื้อเข้าเป็น `RM` แต่จริง ๆ ควรเป็น `FG`.

## Page Responsibilities

- ปรับสถานะสินค้าเฉพาะ `RM <-> FG` ตาม requirement ล่าสุด โดยใช้กับการจัดประเภทผิดตั้งแต่ต้น ไม่ใช่ production
- กรณีคลังต้นทางและปลายทางอยู่คนละสาขา ให้เลือก `สาขาต้นทาง` และ `สาขาปลายทาง` แยกกัน แล้วเลือกคลังภายใต้สาขาของแต่ละฝั่ง
- เลขเอกสาร `SC` ยึดรหัสของสาขาจากคลังต้นทาง เพราะรายการขาออกและการตรวจสอบ stock ต้นทางเป็น source ของเอกสาร; ledger ขาเข้าบันทึก `branch_id` ของสาขาปลายทาง
- เลือก product/warehouse/source status/target status/qty/reason
- เขียน paired ledger ออกจาก status เดิมและเข้า status ใหม่
- ใช้สำหรับ stock status correction และ RM/FG bucket conversion ไม่ใช่ grade/product conversion และไม่ใช่การแปรรูปจริง
- ส่งผลต่อ Stock Ledger และ stock balance ในฐานะ quantity reclassification; ไม่ใช่ event สำหรับตั้งต้นทุนหรือ reprice WAC

## Non-Responsibilities

- ไม่เปลี่ยน product code/grade
- ไม่ตั้งต้นทุนใหม่เกิน policy
- ไม่ให้ user override cost ใน normal flow
- ไม่รับ/ขาย/โอนข้าม warehouse ถ้าไม่ระบุใน rule
- ไม่สร้าง production order และไม่ควรถูกรวมเป็น `PO2` output โดยไม่มี source label แยก
- ไม่ใช้สำหรับเคสที่มี yield/loss/process cost; เคสนั้นต้องไป Production flow
- ไม่แก้ WIP ใน normal user flow; WIP correction ต้องเป็น admin/production reversal policy แยก

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET list/options |
| 2 | เลือก source stock | product+warehouse+status โดย status ต้องเป็น RM หรือ FG |
| 3 | บันทึก | POST SC paired ledger; RM->FG ลด RM เพิ่ม FG, FG->RM ลด FG เพิ่ม RM |
| 4 | reverse | target reversal pair พร้อม reason |

## API / Data Contract

### Current API

- `GET /api/stock/status-convert - list/options`
- `POST /api/stock/status-convert - create status conversion`

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ

## Validation / Status Rules

- qty > 0 และไม่เกิน available ของ source status แบบ hold-aware
- source/target status ต้องเป็น transition ที่อนุญาต: `RM -> FG` หรือ `FG -> RM`
- reason required
- branch/warehouse/product/lot ต้องสัมพันธ์กับ source balance key ที่เลือก

## Side Effects

- เขียน stock ledger out/in ด้วย ref_type SC
- balance เปลี่ยน status bucket แต่ total product warehouse อาจเท่าเดิม
- SC ไม่เปลี่ยนต้นทุนเฉลี่ยจาก action นี้; RM->FG หรือ FG->RM เป็นการลด/เพิ่มจำนวนใน bucket เท่านั้น
- ถ้า ledger เก็บ unit_cost/value เพื่อ audit ต้อง carry ค่าเดิมตาม source และไม่ถือว่าเป็น cost override
- มูลค่ารวมของ stock ไม่ควรเปลี่ยนจาก SC ถ้าไม่มี loss/gain
- production dashboard/report ต้องอ่าน `SC` เป็น source แยกจาก production order output ถ้าต้องนำไปแสดง

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

- Runtime จำกัด normal flow เป็น `RM <-> FG` แล้ว
- hold-aware available, source-status bucket validation, server pagination/filter/index ทำแล้ว; target wording ล่าสุดถือว่า SC ไม่ใช่ WAC-changing event
- reversal/reconciliation ทำแล้วด้วย append-only `SC-REV` และ reconciliation pair checks
- UI design alignment 2026-06-21: list toolbar ของ `/stock/status-convert` ไม่แสดงปุ่ม `โหลดใหม่`, modal create ใช้ dark header `rounded-md` ตาม `docs/design.md` และไม่ใช้ปุ่ม X ใน header, table header ใช้ `bg-slate-100`, body ใช้ `text-xs font-semibold`, status ใช้ dot + text, action ใช้ destructive outline, และ wording วันที่แยก `วันที่เอกสาร` / `วันที่สร้างรายการ`
- remaining: logged-in browser QA สำหรับ create/reverse

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [ ] Verify legacy behavior for any gap before implementing runtime change
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [ ] Update this file and canonical reference if contract changes
