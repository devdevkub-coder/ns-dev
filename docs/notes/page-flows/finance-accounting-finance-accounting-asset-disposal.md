---
title: จำหน่ายทรัพย์สิน Page Flow
tags:
  - page-flow
  - menu
  - finance-accounting
  - fixed-assets
status: accepted-baseline
updated: 2026-06-16
route: /finance-accounting/asset-disposal
---

# จำหน่ายทรัพย์สิน Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Finance Accounting |
| Route | `/finance-accounting/asset-disposal` |
| Page | จำหน่ายทรัพย์สิน |
| Current Next | asset disposal/reverse baseline |

## Canonical References

[[Finance Accounting Flow]], [[Fixed Assets Page Flow]], [[ค่าเสื่อมราคา Page Flow]]

## Flow Baseline

จำหน่ายทรัพย์สินเป็นขั้นตอนปิด lifecycle ของ asset. ระบบเลือก asset ที่ยังไม่ถูกจำหน่าย, ดึง NBV ล่าสุดจาก `assets + active depreciations`, บันทึก disposal, คำนวณ gain/loss, และเปลี่ยนสถานะ asset.

## Page Responsibilities

- แสดง asset ที่ยังจำหน่ายได้ พร้อม NBV ล่าสุด
- สร้าง disposal ประเภท `Sale`, `Scrap`, `Write Off`, `Lost`, `Other`
- บันทึกราคาขาย, customer optional, receipt ref optional, reason, notes
- คำนวณ `gainLoss = sellingPrice - NBV`
- เปลี่ยนสถานะ asset เป็น `Sold`, `Disposed`, หรือ `Lost`
- Reverse disposal ด้วยเหตุผลและคืนสถานะ asset เป็น `Active`

## Non-Responsibilities

- ไม่สร้าง customer receipt หรือ bank statement จากราคาขาย
- ไม่ post GL disposal journal ใน dev-scope batch นี้
- ไม่ลบ disposal row ตอน reverse

## Calculation

```text
Accumulated Depreciation = sum(active depreciation rows)
NBV = max(Salvage Value, Net Asset Cost - Accumulated Depreciation)
Gain/Loss = Selling Price - NBV
```

Status mapping:

- `Sale` -> asset status `Sold`
- `Lost` -> asset status `Lost`
- `Scrap`, `Write Off`, `Other` -> asset status `Disposed`

## API / Data Contract

- `GET /api/finance-accounting/asset-disposal`
- `POST /api/finance-accounting/asset-disposal`
- `PATCH /api/finance-accounting/asset-disposal` with `action=reverse`

Source tables:

- `assets`
- `depreciations`
- `asset_disposals`
- `customers`

## Validation / Status Rules

- ต้องเลือก asset ที่ยังไม่เป็น `Sold`, `Disposed`, `Lost`, `Inactive`
- selling price ต้องไม่ติดลบ
- reverse ต้องมี reason
- disposal row ใช้ status `approved` หรือ `reversed`

## Side Effects

- Create writes `asset_disposals`
- Create updates `assets.asset_status`
- Reverse updates `asset_disposals.status/reversal metadata` and returns asset status to `Active`
- ไม่มี GL/bank/stock side effect ใน batch นี้

## Legacy Comparison

- Legacy `view-assetDisposal` สร้าง disposal, คำนวณ NBV/gain-loss, และ update asset status
- Target Next เพิ่ม persistent `asset_disposals` table และ reverse action เพื่อไม่ลบหรือแก้ history แบบไร้ร่องรอย

## Implementation Checklist

- [x] Verify legacy disposal behavior
- [x] Add `asset_disposals` table
- [x] Enable create disposal UI/API
- [x] Enable reverse UI/API
- [ ] Add receipt/bank/GL posting only after approved finance posting contract

## UI Checkpoint 2026-07-12

- บนมือถือย้าย action `+ จำหน่ายทรัพย์สิน` เข้า summary/action card และนำ FAB วงกลมลอยออก; desktop primary action ใช้น้ำหนักตัวอักษรปกติ
- เหตุผล: ลดการทับข้อมูลและทำให้ create action อยู่ในตำแหน่งเดียวกับ filter/action baseline โดยคง flow การจำหน่ายและย้อนกลับเดิม
