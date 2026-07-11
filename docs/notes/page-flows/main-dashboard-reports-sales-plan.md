---
title: วางแผนการขาย (LME) Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-07-11
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
- รองรับการแก้ `LME Reference Pricing` บนหน้าเดียวกันเพื่อใช้คำนวณ Sales Plan
- รองรับการเพิ่ม Sales Plan ลงตาราง `sales_plans` เพื่อให้ refresh/reopen แล้วยังอยู่
- ช่องทางขายในฟอร์มต้องยึด `customers.market_scope` จาก Master Customer แล้ว resolve เป็น `sales_channels` ที่ active โดยอัตโนมัติ; ผู้ใช้ไม่สามารถเลือกช่องทางขัดกับลูกค้าได้
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

- Sales Plan ไม่ตัด stock และไม่สร้าง AR จนกว่าจะเปิดเอกสารขายปลายทาง
- ไม่สร้างหรือแก้ Sales Bill / Stock Issue
- ไม่เขียน stock_ledger หรือ bank_statement
- ไม่เปลี่ยนสถานะเอกสารต้นทาง
- ไม่เป็น source of truth แทนเอกสาร/fact table ต้นทาง

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | โหลด read model จาก Current API |
| 2 | แก้ค่า LME / FX / กก./ตู้ | ระบบใช้ค่าหน้า `LME Reference Pricing` เป็นฐานคำนวณทั้งหน้า |
| 3 | กด `Fetch Live` | ดึงค่า live มาเติมฟอร์มเฉพาะ field ที่รองรับ แล้วผู้ใช้กดบันทึกอีกครั้งถ้าต้องการใช้จริง |
| 4 | กด `+ เพิ่มแผน` | เปิดฟอร์มเพิ่มแผน แล้วบันทึกลง `sales_plans` เป็นสถานะ `draft` |
| 5 | กรองข้อมูล | apply filter/date/search/sort ฝั่ง API หรือ client ตาม contract |
| 6 | ตรวจรายละเอียด | drilldown ไป source document/report ที่เกี่ยวข้อง |
| 7 | Export/print | ส่งออกข้อมูลตาม filter ปัจจุบันโดยไม่แก้ source |

## API / Data Contract

### Current API

- `GET /api/sales-plan`
- `POST /api/sales-plan`
  - `action = fetch-live`
  - `action = save-config`
  - `action = create-plan`
  - `action = lock-plan`

### Persistence Tables

- `public.sales_plans` เก็บแผนขายรายเดือน, สินค้า, ลูกค้า, ช่องทาง, ตู้/กก., `LME cf`, `FX`, `% LME`, ราคา THB/kg, สถานะ, และ link กลับ `po_sells`
- สถานะหลัก: `draft` -> `locked` -> `po_created`
- `po_sell_id` ถูกเติมเมื่อสร้าง PO Sell จากแผนสำเร็จเท่านั้น

## LME Reference Pricing

### Purpose

- ใช้เป็นค่ากลางสำหรับคำนวณราคาเสนอขาย (`THB/kg`) และตัวเลขวิเคราะห์บนหน้า Sales Plan
- ให้ผู้ใช้ปรับค่าหน้าเดียวโดยไม่ต้องออกไปตั้งค่าในหน้าอื่น

### Editable Fields

| Field | Meaning | Input mode |
|---|---|---|
| `ทองแดง LME` | ราคาอ้างอิง LME ของทองแดง | กรอกเอง หรือ fetch live |
| `ทองเหลือง LME` | ราคาอ้างอิง LME ของทองเหลือง | กรอกเอง |
| `อลูมิเนียม LME` | ราคาอ้างอิง LME ของอลูมิเนียม | กรอกเอง หรือ fetch live |
| `USD/THB` | FX rate สำหรับคำนวณราคาเสนอขาย | กรอกเอง หรือ fetch live |
| `กก./ตู้` | น้ำหนักมาตรฐานต่อ 1 ตู้ | กรอกเองเท่านั้น |

### Fetch Live Rules

- ปุ่ม `Fetch Live` ใช้เติมค่าลงในฟอร์มก่อนบันทึก ไม่ใช่ auto-save
- ค่า `USD/THB` และโลหะที่รองรับจาก provider สามารถถูกเติมจาก API ได้
- `กก./ตู้` ต้องคงเป็น manual field เสมอและห้ามถูกทับจาก API
- `ทองเหลือง LME` ยังอนุญาตให้คง/manual override ได้ แม้ผู้ใช้จะกด fetch live

### Save Rules

- ผู้ใช้ต้องกด `บันทึกค่า` เพื่อให้ config ชุดใหม่ถูกใช้คำนวณทั้งหน้า
- หลังบันทึก หน้า Sales Plan ต้อง reload/read ใหม่ด้วยค่า config ล่าสุด
- ต้องแสดง `updatedAt`, `updatedBy`, และ `source` ของ config ที่ใช้งานอยู่

## Sales Plan Entry Form

### Purpose

- ใช้บันทึกการวางแผนขายลงฐานข้อมูลก่อนเปิด PO Sell
- ช่วยให้ผู้ใช้เห็นตัวเลขในตารางวางแผนและ KPI รวมทันทีหลัง API reload

### Form Fields

| Field | Source / behavior | Required |
|---|---|---|
| `สินค้า` | ค้นหาและเลือกจาก Master Data สินค้าที่ active ของหมวดโลหะที่รองรับ | Yes |
| `ช่องทาง` | เลือกจาก `filters.channels` | Yes |
| `ลูกค้า` | ค้นหาและเลือกจาก Master Data ลูกค้าที่ active | Yes |
| `จำนวนตู้` | กรอกจำนวนตู้ | Yes |
| `กก./ตู้` | default จาก `LME Reference Pricing.kgPerContainer` แต่แก้ได้ในฟอร์ม | Yes |
| `LME cf (USD/MT)` | default จาก LME ตามหมวดสินค้าที่เลือก แต่ผู้ใช้แก้ได้สำหรับแผนนี้ | Yes |
| `% LME` | กรอกเปอร์เซ็นต์ที่ใช้คำนวณราคาเสนอขาย | Yes |

### Default Values

- `ช่องทางขาย` แสดงถัดจากลูกค้าแบบ read-only และเติมจาก `Master Customer.market_scope` ทันทีที่เลือกลูกค้า
- `จำนวนตู้` default เป็น `1`
- `กก./ตู้` default จากค่า `LME Reference Pricing` ล่าสุด
- `ลูกค้า` เริ่มว่าง
- `LME cf` เริ่มว่าง และเติมค่า LME ตามหมวดทันทีเมื่อเลือกสินค้า
- `% LME` เริ่มว่าง

### Derived / Read-Only Preview

เมื่อผู้ใช้กรอกฟอร์ม ระบบต้องคำนวณ preview ทันที:

| Preview card | Formula / source |
|---|---|
| `หมวด` | มาจากสินค้า (`metalGroup`) |
| `รวม กก.` | `จำนวนตู้ x กก./ตู้` |
| `LME cf / FX` | LME cf ที่ระบุในแผน + FX ล่าสุด |
| `ราคา THB/kg` | `(LME cf / 1000) x FX x (%LME / 100)` |

### Validation Rules

- ต้องเลือก `สินค้า`
- ต้องกรอก `ลูกค้า`
- ลูกค้าต้องมี `market_scope` ที่ resolve เป็นช่องทางขาย active ได้
- `จำนวนตู้` ต้องมากกว่า 0
- `กก./ตู้` ต้องมากกว่า 0
- `LME cf` ต้องมากกว่า 0
- `% LME` ต้องมากกว่า 0
- ถ้า validation ไม่ผ่าน ต้องไม่เพิ่ม row ลงตาราง draft

### Add-To-Table Behavior

- ปุ่ม `เพิ่มเข้าตาราง` เรียก `POST /api/sales-plan` ด้วย `action = create-plan`
- server validate สินค้า/ลูกค้า และ derive ช่องทางขายจาก `Master Customer.market_scope` ก่อนคำนวณ `totalKg` กับ `sellPrice`
- หลังบันทึก หน้า reload `GET /api/sales-plan`; refresh/reopen browser ต้องยังเห็นข้อมูลจาก `sales_plans`
- แผนเริ่มที่สถานะ `draft` และต้องกด `Lock %` ก่อนเปิด PO Sell

### Current Limitation

- ยังไม่มี unlock/cancel UI สำหรับ Sales Plan
- ยังไม่มี approval workflow แยกจาก `Lock %`
- stock reservation ยังเกิดจาก PO Sell/Sales Bill flow ไม่ใช่จาก Sales Plan draft

### Data Contract

- API ต้องระบุ source facts ที่ใช้ประกอบตัวเลขของหน้า
- list/report/export ต้องใช้ filter definition เดียวกัน
- source links ต้องใช้ outward document/code ใน UI และ resolve internal id ฝั่ง server
- ถ้าใช้ legacy-derived calculation ต้องบันทึก formula ก่อนแก้ runtime

## Validation / Status Rules

- plan ที่ lock แล้วต้อง trace ไป POS/SB ได้
- row `draft` ต้องถูกติดสถานะ `Pending` ชัดเจน
- ยังไม่ใช่ stock/AR movement
- ตัวเลขต้อง reconcile กับ source facts ที่ระบุ
- filter/export ต้องใช้ condition ชุดเดียวกับตาราง
- ต้องแยกหน่วย/สกุลเงิน/branch/date cutoff เมื่อเกี่ยวข้อง
- cancelled/reversed source ต้องแสดงหรือ exclude ตาม report definition ชัดเจน

## Side Effects

- `save-config` เปลี่ยนเฉพาะ config สำหรับคำนวณหน้า Sales Plan
- `fetch-live` เปลี่ยนเฉพาะค่าที่อยู่ในฟอร์มบนหน้า จนกว่าจะกดบันทึก
- `create-plan` เพิ่มแถวใน `sales_plans` เท่านั้น ยังไม่ตัด stock
- `lock-plan` เปลี่ยนสถานะ `sales_plans` จาก `draft` เป็น `locked`
- การสร้าง PO Sell จาก Sales Plan บันทึก `po_sells` และ update `sales_plans.po_sell_id/status = po_created` ใน transaction เดียวกัน
- export/print/report generation ไม่ mutate source data

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the Sales Plan persistence baseline as of 2026-07-11.
- This page is a read-model/report surface plus Sales Plan persistence surface for create/lock before PO Sell.
- Current APIs are `GET /api/sales-plan`, `GET /api/sales-plan?planId=...`, and `POST /api/sales-plan` for LME config plus Sales Plan actions.
- No transaction, stock ledger, bank statement, AP/AR settlement, or source document status side effect is expected from this page.
- Future changes should reconcile formula/source/cutoff details here before changing runtime behavior.

## Current Gap

- ยังไม่มี unlock/cancel แผนขาย
- ยังไม่มี approval workflow แยกจากปุ่ม `Lock %`
- ยังไม่มี browser QA รอบนี้

## Implementation Checklist

- [x] Verify current API response shape and source tables
- [x] Document current page-level LME config behavior
- [x] Document current draft plan entry behavior
- [ ] Verify legacy formula if current implementation is incomplete
- [ ] Define drilldown route/source document links
- [ ] Confirm export/print and date cutoff behavior
- [x] Decide whether customer field stays free text or changes to master lookup
- [x] Decide persistence model for draft plan / lock plan
- [ ] Update this file when report formula changes
