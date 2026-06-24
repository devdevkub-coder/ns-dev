---
title: บิลรับซื้อ Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-24
route: /purchase/bills
---

# บิลรับซื้อ Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Daily Transactions |
| Route | `/purchase/bills` |
| Page | บิลรับซื้อ |
| Current Next | accepted code baseline |

## Canonical References

[[Purchase Bills Page Flow]], [[Purchase Flow]], [[Payment Flow]], [[Stock Ledger and Stock Balance]]

## Flow Baseline

PB เป็นจุดตั้งเจ้าหนี้และเป็น owner ของ stock-in สำหรับ Stock purchase

## Page Responsibilities

- สร้าง `PB` จาก WTI สำหรับ Stock purchase หรือกรอกเองสำหรับ Trading
- รองรับบิลเดียวที่ line มีทั้ง PO allocation และ Spot Buy
- สำหรับ Stock: ใช้ WTI 1 ใบต่อ PB 1 ใบ และต้องตัด WTI ครบใน PB เดียว
- สำหรับ Stock: auto/use active RM warehouse ของ branch และเขียน stock-in ledger ตอนบันทึก PB
- สำหรับ Trading: ไม่เลือก WTI/warehouse, ไม่เขียน stock ledger, กรอกสินค้าได้หลายรายการพร้อม Gross, หัก, น้ำหนักสุทธิ, PO Buy optional, ราคา/กก., จำนวนตัดบิล, ราคาหน้าใบ, และยอดรวม
- คำนวณ subtotal/discount/VAT/ADV allocation/payable balance และส่ง source payable เข้า Payment Flow
- แสดง detail/timeline/source allocation/print PB และ lock เมื่อมี PMA/PMT active

## Non-Responsibilities

- ไม่อนุมัติจ่ายและไม่ทำจ่ายเงินเอง
- ไม่รับ WTI ที่ถูกใช้แล้วหรือถูกยกเลิก
- ไม่ให้เลือกคลังเองสำหรับ PB Stock; คลัง derive จาก active RM warehouse ของสาขา
- ไม่เปลี่ยน supplier แล้วทำให้ source PO/WTI กลายเป็น Spot โดยไม่มี release/audit

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET list/filter และ option source |
| 2 | เลือก Stock/Trading | Stock ใช้ WTI; Trading กรอก/เลือก source PB trading ตาม rule |
| 3 | allocate line | เลือก PO ต่อ line หรือ Spot; validate product match ด้วย internal product id |
| 4 | บันทึก PB | POST/PATCH สร้าง PB, allocation, ADV allocation, stock ledger เฉพาะ Stock, payable source |
| 5 | แก้/ยกเลิก | ถ้ายังไม่มี PMA/PMT active ให้ rebuild/reverse allocation + ledger แบบ transaction-safe |
| 6 | ส่งต่อจ่ายเงิน | payable balance > 0 เข้า `/daily/payment-approval` |

## API / Data Contract

### Current API

- `GET /api/purchase/bills - list/filter/source data`
- `POST /api/purchase/bills - create PB`
- `PATCH /api/purchase/bills - update/cancel/supplier-swap action`
- `GET /api/purchase/bills/[id] - detail/read model/print source`
- `GET /api/daily/bill-swap-history - supplier swap history tab`

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- modal Purchase Bill ต้องบังคับเลือก `สาขา` ก่อน `ผู้ขาย`; Supplier selector ต้อง disabled จนกว่าจะเลือกสาขา
- supplier options ต้องกรองตามสาขาเอกสารจาก active `supplier_branches`; Stock PB ที่มาจาก WTI ต้องใช้ supplier/branch จาก WTI และ validate ว่า mapping ยัง active ก่อนบันทึก, Trading PB ต้องกรอง supplier ตาม branch ที่เลือก
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ

## Validation / Status Rules

- WTI Stock source ต้อง active, same branch, not cancelled, not used by other PB และต้อง allocate ครบใน PB เดียว
- supplier ต้อง active และมี active `supplier_branches` กับ branch ของ PB; API ต้อง reject ถ้าไม่ตรง mapping และห้าม fallback เป็นทุกสาขา
- PO line allocation ต้อง product เดียวกันกับ PB/WTI line โดยใช้ internal product id
- POB remaining ห้ามติดลบ; ส่วนเกินเป็น Spot Buy ต่อ line ได้
- Trading PB line ต้องคำนวณ `net weight = gross - deduct` และ `line total = net weight x price/kg`
- Trading + PO ตัด PO Buy remaining ได้ แต่ห้ามตัดเกิน remaining; Trading + Spot ไม่ตัด PO Buy
- `ราคาหน้าใบ` ต้องเก็บระดับ line เพื่อใช้ Sale Tracking/commission และไม่ใช่ราคาต้นทุนซื้อ
- ADV allocation ใช้ได้เฉพาะ ADV ที่จ่ายแล้วและ available amount พอ
- lock edit/cancel เมื่อมี PMA approved หรือ payment cycle active
- money/qty ใช้ text+pattern และ server validation ซ้ำ

## Side Effects

- Stock PB เขียน `stock_ledger.ref_type = PB` เป็น stock-in
- Trading PB ไม่เขียน stock ledger และไม่กระทบ Stock On Hand/WAC
- Stock PB ที่มาจาก WTI ต้องแสดง `นน.ก่อนหัก` ใน detail/print เป็นน้ำหนักหลังหักภาชนะแล้ว (`allocated gross - container deduction ตามสัดส่วน allocation`) จากนั้นจึงแสดง `นน.หัก` และ `นน.สุทธิ`; เช่น gross 970 หักภาชนะ 36 ได้ 934 และหักสินค้า/สิ่งเจือปน 37 ได้สุทธิ 897
- Stock PB remark ต่อรายการต้องมาจากข้อมูลหักสิ่งเจือปนของ WTI product summary เดียวกัน เช่น `- 1. ฝุ่น 12 กก.` และถ้าสิ่งเจือปนนั้นซื้อกลับเป็นสินค้าอื่นต้องต่อท้าย `ซื้อเป็น <ชื่อสินค้า>`; ถ้ามีหมายเหตุรายเต๋าให้แสดงต่อท้ายเป็นลำดับถัดไปหลังรายการสิ่งเจือปน
- edit/cancel/supplier swap ของ Stock PB ใช้ append-only reversal (`PB-EDIT-REV` หรือ `PB-CANCEL`) และไม่ delete/rebuild ledger เดิม
- อัปเดต WTI usage/status เป็นออกบิลแล้ว
- อัปเดต POB remaining/status ตาม allocation
- สร้าง/ปรับ PB payable status สำหรับ Payment Flow
- cancel/supplier swap ต้อง reverse/release allocation, ADV, WTI usage และ stock ledger ตาม append/reversal policy

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

- PB stock ledger append/reversal hardening ทำแล้วสำหรับ create/edit/cancel/supplier swap
- durable allocation/status/timeline ยังต้องพิสูจน์กับ legacy ทุกกรณี โดยเฉพาะ supplier swap กับ payment lock
- browser QA สำหรับ edit/cancel/supplier swap หลัง migration index ยังต้องรันใน logged-in session

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [ ] Verify legacy behavior for any gap before implementing runtime change
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [ ] Filter/validate Supplier selector by `supplier_branches` for Purchase Bill create/edit/source selection
- [ ] Update this file and canonical reference if contract changes
