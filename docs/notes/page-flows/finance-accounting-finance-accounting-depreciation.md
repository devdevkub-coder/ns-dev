---
title: ค่าเสื่อมราคา Page Flow
tags:
  - page-flow
  - menu
  - finance-accounting
  - fixed-assets
status: accepted-baseline
updated: 2026-06-16
route: /finance-accounting/depreciation
---

# ค่าเสื่อมราคา Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Finance Accounting |
| Route | `/finance-accounting/depreciation` |
| Page | ค่าเสื่อมราคา |
| Current Next | depreciation run/reverse baseline |

## Canonical References

[[Finance Accounting Flow]], [[Fixed Assets Page Flow]], [[จำหน่ายทรัพย์สิน Page Flow]]

## Flow Baseline

ค่าเสื่อมราคาใช้ asset master จาก `Fixed Assets` เป็น source แล้วสร้างรายการค่าเสื่อมรายเดือนใน `depreciations`. ผลลัพธ์จะลด NBV ของ asset และถูกใช้ต่อใน Balance Sheet / Asset Disposal.

## Page Responsibilities

- เลือกงวดเดือน/ปี
- preview asset ที่ eligible ก่อน commit
- commit ค่าเสื่อมแบบ idempotent ต่อ asset/period โดยไม่ run ซ้ำถ้ามี posted depreciation ที่ยังไม่ reversed
- reverse depreciation row ด้วยเหตุผล โดยเปลี่ยน status เป็น `reversed`
- อัปเดต asset เป็น `Fully Depreciated` เมื่อ NBV ลงถึง salvage value

## Non-Responsibilities

- ไม่เขียน `stock_ledger` หรือ `bank_statement`
- ไม่ post GL depreciation journal ใน dev-scope batch นี้
- ไม่ลบ depreciation row ตอน reverse

## Calculation

```text
Depreciable Amount = Net Asset Cost - Salvage Value
Monthly Depreciation = Depreciable Amount / Useful Life Months
Accumulated Depreciation = sum(active depreciation rows)
NBV = max(Salvage Value, Net Asset Cost - Accumulated Depreciation)
```

Eligibility:

- asset status ต้องไม่เป็น `Inactive`, `Sold`, `Disposed`, `Lost`, `Fully Depreciated`
- depreciation method ต้องไม่เป็น `No Depreciation` หรือ `Manual`
- useful life ต้องมากกว่า 0
- งวดเดียวกันต้องยังไม่มี active depreciation row สำหรับ asset นั้น

## API / Data Contract

- `GET /api/finance-accounting/depreciation?month=MM&year=YYYY`
- `POST /api/finance-accounting/depreciation` with `action=preview`
- `POST /api/finance-accounting/depreciation` with `action=commit`
- `PATCH /api/finance-accounting/depreciation` with `action=reverse`

Source tables:

- `assets`
- `depreciations`

## Validation / Status Rules

- `periodMonth` ต้องอยู่ระหว่าง 1-12
- `periodYear` ต้องอยู่ในช่วง target system ที่รองรับ
- commit ต้อง recompute preview ฝั่ง server ก่อนเขียน
- reverse ต้องมี reason และเปลี่ยน `depreciations.status = reversed`

## Side Effects

- Commit creates `depreciations` rows with `period_year`, `period_month`, `status = posted`
- Commit may update `assets.asset_status = Fully Depreciated`
- Reverse updates depreciation status/reversal metadata only
- ไม่มี GL/bank/stock side effect ใน batch นี้

## Legacy Comparison

- Legacy `view-depreciation` รองรับ run one/run all, duplicate-period prevention, fully-depreciated status, และ reverse run
- Target Next รองรับ preview/commit/reverse และเก็บ reversal metadata แทนการลบแถว

## Implementation Checklist

- [x] Verify legacy depreciation run/reverse behavior
- [x] Add depreciation status/reversal schema
- [x] Enable preview/commit/reverse API
- [x] Enable page UI for run and reverse
- [ ] Add GL depreciation posting only after FA5 posting/period contract is approved

## UI Checkpoint 2026-07-12

- ปุ่มตรวจค่าเสื่อมบนมือถือใช้ `rounded-md` และ font ปกติ เช่นเดียวกับ action baseline และ footer ของ filter sheet
- ไม่เปลี่ยนเงื่อนไขการคำนวณ, preview, หรือการบันทึกค่าเสื่อม; เป็นการปรับ presentation ของ action surface เท่านั้น
