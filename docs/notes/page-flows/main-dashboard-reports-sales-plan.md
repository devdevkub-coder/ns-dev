---
title: วางแผนการขาย (LME) Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-07-10
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
- รองรับการเพิ่ม `draft plan` บนหน้าจอเพื่อจำลองแผนขายและเห็นตัวเลขในตารางทันที
- แสดง locked/approved plan state ถ้ามี
- แสดง read model/report ตาม filter ของหน้า
- รองรับ search/filter/date range/sort/export ตาม design baseline
- drilldown ไป source document หรือ source report ที่เกี่ยวข้อง
- แสดง created/document/due/as-of date แยกกันตาม Document Aging Policy

## Non-Responsibilities

- draft plan ที่ผู้ใช้เพิ่มบนหน้าไม่ถือเป็น persisted transaction
- ไม่สร้างหรือแก้ business transaction ต้นทาง เช่น PO Sell / Sales Bill / Stock Issue
- ไม่เขียน stock_ledger หรือ bank_statement
- ไม่เปลี่ยนสถานะเอกสารต้นทาง
- ไม่เป็น source of truth แทนเอกสาร/fact table ต้นทาง

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | โหลด read model จาก Current API |
| 2 | แก้ค่า LME / FX / กก./ตู้ | ระบบใช้ค่าหน้า `LME Reference Pricing` เป็นฐานคำนวณทั้งหน้า |
| 3 | กด `Fetch Live` | ดึงค่า live มาเติมฟอร์มเฉพาะ field ที่รองรับ แล้วผู้ใช้กดบันทึกอีกครั้งถ้าต้องการใช้จริง |
| 4 | กด `+ เพิ่มแผน` | เปิด draft form เพื่อจำลองรายการแผนขายบนหน้าจอ |
| 5 | กรองข้อมูล | apply filter/date/search/sort ฝั่ง API หรือ client ตาม contract |
| 6 | ตรวจรายละเอียด | drilldown ไป source document/report ที่เกี่ยวข้อง |
| 7 | Export/print | ส่งออกข้อมูลตาม filter ปัจจุบันโดยไม่แก้ source |

## API / Data Contract

### Current API

- `GET /api/sales-plan`
- `POST /api/sales-plan`
  - `action = fetch-live`
  - `action = save-config`

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

## Draft Plan Entry Form

### Purpose

- ใช้จำลองการวางแผนขายบนหน้าจอโดยยังไม่ commit ลง source transaction
- ช่วยให้ผู้ใช้เห็นตัวเลขในตารางวางแผนและ KPI รวมทันที

### Form Fields

| Field | Source / behavior | Required |
|---|---|---|
| `สินค้า` | เลือกจากรายการสินค้าใน `productAnalysis` ของหน้า | Yes |
| `ช่องทาง` | เลือกจาก `filters.channels` | Yes |
| `ลูกค้า` | กรอกข้อความชื่อคู่ค้าโดยตรง | Yes |
| `จำนวนตู้` | กรอกจำนวนตู้ | Yes |
| `กก./ตู้` | default จาก `LME Reference Pricing.kgPerContainer` แต่แก้ได้ในฟอร์ม | Yes |
| `LME cf (USD/MT)` | default จาก LME ตามหมวดสินค้าที่เลือก แต่ผู้ใช้แก้ได้สำหรับแผนนี้ | Yes |
| `% LME` | กรอกเปอร์เซ็นต์ที่ใช้คำนวณราคาเสนอขาย | Yes |

### Default Values

- `ช่องทาง` default เป็น `export` หรือค่า filter ช่องทางปัจจุบันถ้ามี
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
- `จำนวนตู้` ต้องมากกว่า 0
- `กก./ตู้` ต้องมากกว่า 0
- `LME cf` ต้องมากกว่า 0
- `% LME` ต้องมากกว่า 0
- ถ้า validation ไม่ผ่าน ต้องไม่เพิ่ม row ลงตาราง draft

### Add-To-Table Behavior

- ปุ่ม `เพิ่มเข้าตาราง` สร้าง row สถานะ `Draft`
- row draft ถูกเก็บใน local client state ของหน้าเท่านั้น
- row draft ต้องถูก merge กับ `planRows` จาก server เพื่อแสดงในตารางวางแผนและใช้คำนวณ KPI สรุปด้านบน
- การ refresh หน้า / reload browser ทำให้ draft ที่ยังไม่ persisted หายได้

### Current Limitation

- `ลูกค้า` ยังเป็น free text ไม่ได้ lookup/select จาก Master Customer
- draft plan ยังไม่มี document number หรือ persisted identifier ฝั่ง database
- ยังไม่มี workflow `lock/unlock`, approval, หรือ trace กลับไป `PO Sell` / `Sales Bill`
- export ปัจจุบันรวม row draft ที่อยู่บนหน้าจอร่วมกับ row จาก server

### Data Contract

- API ต้องระบุ source facts ที่ใช้ประกอบตัวเลขของหน้า
- list/report/export ต้องใช้ filter definition เดียวกัน
- source links ต้องใช้ outward document/code ใน UI และ resolve internal id ฝั่ง server
- ถ้าใช้ legacy-derived calculation ต้องบันทึก formula ก่อนแก้ runtime

## Validation / Status Rules

- plan ที่ lock แล้วต้อง trace ไป POS/SB ได้
- row draft ต้องถูกติดสถานะ `Draft` ชัดเจนและแยกจาก row ที่ persisted
- ยังไม่ใช่ stock/AR movement
- ตัวเลขต้อง reconcile กับ source facts ที่ระบุ
- filter/export ต้องใช้ condition ชุดเดียวกับตาราง
- ต้องแยกหน่วย/สกุลเงิน/branch/date cutoff เมื่อเกี่ยวข้อง
- cancelled/reversed source ต้องแสดงหรือ exclude ตาม report definition ชัดเจน

## Side Effects

- `save-config` เปลี่ยนเฉพาะ config สำหรับคำนวณหน้า Sales Plan
- `fetch-live` เปลี่ยนเฉพาะค่าที่อยู่ในฟอร์มบนหน้า จนกว่าจะกดบันทึก
- `add draft plan` เปลี่ยนเฉพาะ local client state ของหน้า
- export/print/report generation ไม่ mutate source data

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P2 proof baseline as of 2026-06-11.
- This page is primarily a read-model/report surface, but current runtime also supports page-level `LME config` editing and local `draft plan` simulation.
- Current APIs are `GET /api/sales-plan` and `POST /api/sales-plan` for LME config actions.
- No transaction, stock ledger, bank statement, AP/AR settlement, or source document status side effect is expected from this page.
- Future changes should reconcile formula/source/cutoff details here before changing runtime behavior.

## Current Gap

- ฟอร์ม `เพิ่มแผนขาย` ยังเป็น draft-only และยังไม่ persisted
- `ลูกค้า` ยังเป็น text input แทน master lookup
- ยังไม่มี lock/approval flow และ source trace ไป `PO Sell` / `Sales Bill`
- ถ้าจะเปลี่ยนจาก draft-on-screen ไปเป็น persisted plan ต้องออกแบบ schema, permission, audit trail, และ reconcile rule เพิ่ม

## Implementation Checklist

- [x] Verify current API response shape and source tables
- [x] Document current page-level LME config behavior
- [x] Document current draft plan entry behavior
- [ ] Verify legacy formula if current implementation is incomplete
- [ ] Define drilldown route/source document links
- [ ] Confirm export/print and date cutoff behavior
- [ ] Decide whether customer field stays free text or changes to master lookup
- [ ] Decide persistence model for draft plan / lock plan
- [ ] Update this file when report formula changes
