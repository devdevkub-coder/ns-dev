---
title: วางแผนการขาย (LME) Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-11
route: /sales-plan
---

# วางแผนการขาย (LME) Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Main Dashboard / Reports |
| Route | `/sales-plan` |
| Page | วางแผนการขาย (LME) |
| Current Next | accepted code baseline |

## Canonical References

[[Menu Page Flow Catalog]]

## Flow Baseline

sales plan/LME planning ก่อน PO Sell/stock issue

## Page Responsibilities

- ช่วยวางแผนขาย/LME ก่อนสร้าง commitment หรือ stock issue
- แสดง locked/approved plan state ถ้ามี
- แสดง read model/report ตาม filter ของหน้า
- ให้เลือกตารางวิเคราะห์ผู้บริหารหรือสต๊อกว่างขายคงเหลือผ่าน line tabs เพื่อแสดงทีละรายการ
- แสดงตารางรอขายตามผลิตภัณฑ์พร้อมต้นทุน Pool, ราคาเสนอ, % LME, กำไร/Margin, รอขายจริง, ล็อกขาย, PO ซื้อรอส่ง และ STOCK เพื่อใช้ตัดสินใจขาย
- ราคาเสนอที่ดีสุด, % LME, กำไร และ Margin ในตารางรอขายต้องอิงรายการในตารางวางแผนการขายของสินค้าเดียวกันเท่านั้น; หากไม่มีแผน ให้แสดง `-` โดยไม่เติมจากราคา LME กลาง
- ตารางรอขายต้องเรียงสินค้าที่มีราคาเสนอและ % LME จากแผนขายขึ้นก่อน แล้วจึงเรียงรายการที่ยังไม่มีแผนตามปริมาณรอขาย
- รองรับ search/filter/date range/sort/export ตาม design baseline
- drilldown ไป source document หรือ source report ที่เกี่ยวข้อง
- แสดง created/document/due/as-of date แยกกันตาม Document Aging Policy

## Non-Responsibilities

- ไม่สร้างหรือแก้ business transaction
- ไม่เขียน stock_ledger หรือ bank_statement
- ไม่เปลี่ยนสถานะเอกสารต้นทาง
- ไม่เป็น source of truth แทนเอกสาร/fact table ต้นทาง

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | โหลด read model จาก Current API |
| 2 | กรองข้อมูล | apply filter/date/search/sort ฝั่ง API หรือ client ตาม contract |
| 3 | ตรวจรายละเอียด | drilldown ไป source document/report ที่เกี่ยวข้อง |
| 4 | Export/print | ส่งออกข้อมูลตาม filter ปัจจุบันโดยไม่แก้ source |

## API / Data Contract

### Current API

- `GET /api/sales-plan`
- `POST /api/sales-plan`
  - `action = fetch-live`
  - `action = save-config`

## Draft Plan Entry Form

### Purpose

- ใช้จำลองการวางแผนขายบนหน้าจอโดยยังไม่ commit ลง source transaction
- ช่วยให้ผู้ใช้เห็นตัวเลขในตารางวางแผนทันที

### Form Fields

| Field | Source / behavior | Required |
|---|---|---|
| `สินค้า` | ค้นหาและเลือกจาก Master Data สินค้าที่ active ของหมวดโลหะที่รองรับ | Yes |
| `ช่องทาง` | derive จาก `marketScope` ของลูกค้าและ map กับ `filters.channels` แบบ read-only | Yes |
| `ลูกค้า` | ค้นหาและเลือกจาก Master Data ลูกค้าที่ active | Yes |
| `จำนวนตู้` | กรอกจำนวนตู้ | Yes |
| `กก./ตู้` | default จาก `LME Reference Pricing.kgPerContainer` แต่แก้ได้ในฟอร์ม | Yes |
| `LME cf (USD/MT)` | default จาก LME ตามหมวดสินค้าที่เลือก แต่ผู้ใช้แก้ได้สำหรับแผนนี้ | Yes |
| `% LME` | กรอกเปอร์เซ็นต์ที่ใช้คำนวณราคาเสนอขาย | Yes |

### Derived / Read-Only Preview

| Preview card | Formula / source |
|---|---|
| `หมวด` | มาจากสินค้า (`metalGroup`) |
| `รวม กก.` | `จำนวนตู้ x กก./ตู้` |
| `LME cf / FX` | LME cf ที่ระบุในแผน + FX ล่าสุด |
| `ราคา THB/kg` | `(LME cf / 1000) x FX x (%LME / 100)` |

### Validation Rules

- ต้องเลือก `สินค้า`
- ต้องกรอก `ลูกค้า`
- `จำนวนตู้`, `กก./ตู้`, `LME cf`, และ `% LME` ต้องมากกว่า 0
- ถ้า validation ไม่ผ่าน ต้องไม่เรียกสร้างแผนขาย

### Add-To-Table Behavior

- ปุ่ม `เพิ่มเข้าตาราง` เรียก `POST /api/sales-plan` ด้วย `action = create-plan` เพื่อสร้างแผนสถานะ `Pending`
- หลังบันทึกสำเร็จ dialog ปิด, ฟอร์ม reset, และหน้า reload read model ใหม่จาก server

### Data Contract

- API ต้องระบุ source facts ที่ใช้ประกอบตัวเลขของหน้า
- list/report/export ต้องใช้ filter definition เดียวกัน
- source links ต้องใช้ outward document/code ใน UI และ resolve internal id ฝั่ง server
- ถ้าใช้ legacy-derived calculation ต้องบันทึก formula ก่อนแก้ runtime

## Validation / Status Rules

- plan ที่ lock แล้วต้อง trace ไป POS/SB ได้
- ยังไม่ใช่ stock/AR movement
- ตัวเลขต้อง reconcile กับ source facts ที่ระบุ
- filter/export ต้องใช้ condition ชุดเดียวกับตาราง
- ต้องแยกหน่วย/สกุลเงิน/branch/date cutoff เมื่อเกี่ยวข้อง
- cancelled/reversed source ต้องแสดงหรือ exclude ตาม report definition ชัดเจน

## Side Effects

- read-only ไม่มี transaction side effect
- export/print/report generation ไม่ mutate source data

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P2 proof baseline as of 2026-06-11.
- This page is a read-model/report surface; current APIs are `GET`-oriented and protected by report/finance permissions.
- No transaction, stock ledger, bank statement, AP/AR settlement, or source document status side effect is expected from this page.
- Future changes should reconcile formula/source/cutoff details here before changing runtime behavior.

## Current Gap

P2 proof completed against current Next page/API code. Remaining work is formula/source/cutoff refinement only when the target report definition changes or a page-specific discrepancy is found.

## Implementation Checklist

- [x] Verify current API response shape and source tables
- [ ] Verify legacy formula if current implementation is incomplete
- [ ] Define drilldown route/source document links
- [ ] Confirm export/print and date cutoff behavior
- [ ] Update this file when report formula changes
