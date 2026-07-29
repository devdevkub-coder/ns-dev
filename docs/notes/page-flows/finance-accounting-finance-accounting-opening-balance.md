---
title: Opening Balance Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-07-29
route: /finance-accounting/opening-balance
---

# Opening Balance Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Finance Accounting |
| Route | `/finance-accounting/opening-balance` |
| Page | Opening Balance |
| Current Next | accepted code baseline |

## Canonical References

[[Finance Accounting Flow]], [[Menu Page Flow Catalog]]

## Flow Baseline

Opening Balance cutover setup. The `สต็อก` tab owns the controlled Stock Opening entry flow; the remaining finance/accounting sections stay read-only.

## Page Responsibilities

- ใช้ตั้งต้นข้อมูลก่อน Go-Live ตาม cutoff date
- แท็บ `สต็อก` รองรับสินค้า, RM/WIP/FG, สาขา, คลัง, Lot, Qty และ WAC/หน่วย
- `Apply` สร้าง `OPENING_STOCK_IN` ใน `stock_ledger`; `Unapply` ลบ opening ledger ของรายการก่อนล็อกยอด
- แสดง report-specific cutoff/as-of/currency/period
- drilldown ไป source finance/stock/payment/sales/purchase data
- แสดง read model/report ตาม filter ของหน้า
- รองรับ search/filter/date range/sort/export ตาม design baseline
- drilldown ไป source document หรือ source report ที่เกี่ยวข้อง
- แสดง created/document/due/as-of date แยกกันตาม Document Aging Policy

## Non-Responsibilities

- ไม่สร้างบิลซื้อ/ขายหรือรายการบัญชี AR/AP/GL
- ไม่แก้ `bank_statement` และไม่เปลี่ยนสถานะเอกสารต้นทาง
- ไม่เปลี่ยนสถานะเอกสารต้นทาง
- ไม่เป็น source of truth แทนเอกสาร/fact table ต้นทาง

## Lifecycle / Read and Stock Opening Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | โหลด opening row และ active product/branch/warehouse/supplier references |
| 2 | เพิ่ม/บันทึก | เก็บ pending item ใน `opening_balance.data.stockItems` |
| 3 | Apply | ตรวจ references แล้วสร้างหรือ update `OPENING_STOCK_IN` ใน transaction เดียวกับการ mark Applied |
| 4 | Unapply | ลบ opening ledger และเปลี่ยนรายการกลับเป็น Pending |

## API / Data Contract

### Current API

- `GET /api/finance-accounting/opening-balance`
- `POST /api/finance-accounting/opening-balance` with `action: save | apply | unapply`

### Data Contract

- API ต้องระบุ source facts ที่ใช้ประกอบตัวเลขของหน้า
- list/report/export ต้องใช้ filter definition เดียวกัน
- source links ต้องใช้ outward document/code ใน UI และ resolve internal id ฝั่ง server
- ถ้าใช้ legacy-derived calculation ต้องบันทึก formula ก่อนแก้ runtime
- Stock value = `qty × unitCost`; Apply ต้องมี active สินค้า/สาขา/คลัง, `qty > 0`, `unitCost > 0`

## Validation / Status Rules

- report ต้องระบุ actual vs forecast/accrual assumption
- ห้ามรวมสกุลเงินหรือหน่วยโดยไม่มี conversion policy
- ตัวเลขต้อง reconcile กับ source facts ที่ระบุ
- filter/export ต้องใช้ condition ชุดเดียวกับตาราง
- ต้องแยกหน่วย/สกุลเงิน/branch/date cutoff เมื่อเกี่ยวข้อง
- cancelled/reversed source ต้องแสดงหรือ exclude ตาม report definition ชัดเจน

## Side Effects

- `save` mutate เฉพาะ `opening_balance.data.stockItems`
- `apply` สร้าง/ปรับ `stock_ledger` ด้วย `ref_type=OPENING`, `movement_type=OPENING_STOCK_IN`, `is_opening=true`
- `unapply` ลบ opening ledger ของรายการ; ถ้า opening row ถูกล็อก ทุก stock write ถูกปฏิเสธ

## Current Code Baseline

- Current `apps/next` page/API code supports legacy-parity Stock Opening as of 2026-07-29.
- Finance/accounting overview remains protected by `finance.financials.view`; stock writes fail closed on invalid references or locked opening data.
- GL posting and period close remain outside this batch. Unpaid Stock Opening rows with a Supplier now auto-create an idempotent AP shadow bill; Unapply removes that shadow bill together with the opening ledger row.
- Future changes should reconcile formula/source/cutoff details here before changing runtime behavior.

## Current Gap

Legacy parity is implemented for Stock Opening only. AR/AP, cash, asset, tax, equity, lock/reconciliation and GL sections remain separate future write contracts.

## Implementation Checklist

- [x] Verify current API response shape and source tables
- [x] Verify legacy stock-opening fields and `OPENING_STOCK_IN` behavior
- [x] Implement Stock Opening save/apply/unapply path
- [ ] Define drilldown route/source document links
- [ ] Confirm export/print and date cutoff behavior
- [ ] Update this file when report formula changes
