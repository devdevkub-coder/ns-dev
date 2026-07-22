---
title: วางแผนการขาย (LME) และวิเคราะห์แผนขาย Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-07-20
route: /sales-plan
related_route: /sales-plan-analysis
---

# วางแผนการขาย (LME) และวิเคราะห์แผนขาย Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Main Dashboard / Reports |
| Operational route | `/sales-plan` |
| Analysis route | `/sales-plan-analysis` |
| Operational page | วางแผนการขาย (LME) |
| Analysis page | วิเคราะห์แผนขาย |
| Current Next | accepted code baseline |

## Canonical References

[[Menu Page Flow Catalog]]

## Flow Baseline

`/sales-plan` เป็นพื้นที่ทำงานวางแผนขาย/LME ก่อน PO Sell/stock issue ส่วน `/sales-plan-analysis` เป็น read-only report สำหรับวิเคราะห์ผลของแผนและสต๊อกว่างขาย โดยทั้งสอง route ใช้ Sales Plan read model และเดือนเดียวกันเป็น scope กลาง

## Route Responsibilities

### `/sales-plan` — Operational Planning

- ช่วยวางแผนขาย/LME ก่อนสร้าง commitment หรือ stock issue
- รองรับการตรวจราคา LME, ปรับ `USD/THB` และ `กก./ตู้` บนหน้าเดียวกันเพื่อใช้คำนวณ Sales Plan
- รองรับการเพิ่ม Sales Plan ลงตาราง `sales_plans` เพื่อให้ refresh/reopen แล้วยังอยู่
- ช่องทางขายในฟอร์มต้องยึด `customers.market_scope` จาก Master Customer แล้ว resolve เป็น `sales_channels` ที่ active โดยอัตโนมัติ; ผู้ใช้ไม่สามารถเลือกช่องทางขัดกับลูกค้าได้
- แสดงสถานะแผน `draft`, `locked`, และ `po_created` แยกกันชัดเจน โดยไม่รวม `locked` กับ `po_created` เป็นสถานะเดียว
- ตารางแผนใช้เดือน สินค้า หมวด และช่องทาง; ตารางรอขายซึ่ง aggregate ระดับสินค้าใช้เดือน สินค้า และหมวดเดียวกัน ส่วนช่องทางใช้จำกัดแผนราคาที่นำมาเปรียบเทียบ ไม่ได้ตัด stock row ที่ไม่มีมิติช่องทาง
- แสดงตารางรอขายตามผลิตภัณฑ์พร้อมต้นทุน Pool, ราคาเสนอ, % LME, กำไร/Margin, รอขายจริง, ล็อกขาย, PO ซื้อรอส่ง และ STOCK เพื่อใช้ตัดสินใจขาย
- ราคาเสนอที่ดีสุด, % LME, กำไร และ Margin ในตารางรอขายและตารางวิเคราะห์ต้องอิงรายการในตารางวางแผนการขายของสินค้าเดียวกันเท่านั้น; หากไม่มีแผน ให้แสดง `-` และไม่คำนวณกำไรจากราคา LME กลาง
- ตารางรอขายต้องเรียงสินค้าที่มีราคาเสนอและ % LME จากแผนขายขึ้นก่อน แล้วจึงเรียงรายการที่ยังไม่มีแผนตามปริมาณรอขาย
- รองรับเดือน สินค้า หมวด และช่องทาง พร้อม sort/export ของตารางแผนตามพฤติกรรมปัจจุบัน

### `/sales-plan-analysis` — Read-Only Analysis

- แยกมุมมองวิเคราะห์ออกจาก operational page เพื่อไม่ให้ฟอร์มสร้าง/ล็อกแผนปนกับ report surface
- ใช้ปุ่มแท็บเฉพาะหน้า 2 มุมมอง: `วิเคราะห์แผนขายและสต๊อกว่างขาย` และ `สต๊อกว่างขายหลังหักแผนที่ล็อก`; ยังไม่ได้ย้ายเป็น shared line tabs
- รองรับ filter เดือน หมวด และสินค้า พร้อม pagination และ export ตามข้อมูลที่ผู้ใช้เห็น; ตารางปัจจุบันยังไม่รองรับ sort หรือ resize/reset column width
- แสดงเฉพาะ read model; ไม่มี action แก้ LME, สร้างแผน, ล็อกแผน, ยกเลิกแผน หรือเปิด PO Sell
- ใช้ source/formula/no-fallback contract เดียวกับ `/sales-plan`; สินค้าที่ไม่มี Sales Plan ต้องไม่ถูกเติมราคาเสนอหรือกำไรจาก LME กลาง

## Design Decisions (2026-07-20)

Manual-entry visual follow-up: every field that the user types into or selects in an operational business form stays pale yellow whether it is required or optional. Filters and system-owned values remain neutral; validation remains red and focus remains blue. This does not change which fields are actually required by the Sales Plan schema.

| Topic | Decision |
|---|---|
| Route split | `/sales-plan` เป็น operational planning surface ส่วน `/sales-plan-analysis` เป็น read-only analysis surface; ไม่ render ตารางวิเคราะห์ซ้ำในหน้า operational |
| Status KPI | KPI ของแผนต้องแยก `รอล็อกแผน (draft)`, `ล็อกแผนแล้ว (locked)`, และ `เปิด PO ขายแล้ว (po_created)` เป็นคนละค่า ห้ามรวม `locked` กับ `po_created`; ไม่เพิ่ม card `แผนทั้งหมด` ถ้าซ้ำกับ count/pagination ของตาราง และคง KPI สต๊อกไว้เฉพาะค่าที่ช่วยตัดสินใจจริง |
| Manual-entry fields | field ที่ผู้ใช้กรอกหรือเลือกเองใช้พื้นเหลืองอ่อนคงอยู่ทั้ง required และ optional; focus ใช้กรอบน้ำเงิน `#3B82F6` กับวงแหวนโปร่ง 3px; validation error ใช้แดงแทนเหลือง ส่วน filter/search, ค่า API, calculated, read-only และ disabled ใช้พื้น neutral |
| Auto-fill provenance | `USD/THB`, `กก./ตู้` และ `LME cf` ใช้พื้น neutral เฉพาะตอนค่าถูกเติมจากระบบจริง; เมื่อผู้ใช้แก้เอง field นั้นกลับเป็น manual-yellow และสินค้าที่ไม่มี LME อัตโนมัติต้องเริ่มเป็น manual-yellow |
| LME on mobile | action ดึงราคา/บันทึกยังเข้าถึงได้ใน first viewport ส่วนราคาและสมมติฐานอยู่ใน native disclosure `ดูราคาและสมมติฐาน` ที่ปิดเริ่มต้นเพื่อลดความสูง; Desktop แสดงข้อมูลชุดเดิมโดยไม่ต้องเปิด disclosure |
| Filters on mobile | ใช้ toolbar กระชับ 2 แถว: ค้นหาสินค้า + `ตัวกรอง` และ `สร้างแผนขาย` + `ส่งออก Excel`; ย้ายเดือน/ประเภทโลหะ/ช่องทางเข้า `MobileFilterSheet` โดยแก้ค่าแบบ draft และค่อยใช้เมื่อกด `ใช้ตัวกรอง`; ซ่อน action ยกเลิกเมื่อไม่มีแผนรอล็อก และเมื่อมีให้แสดงเป็น destructive action ขนาดเล็กแยกจาก primary actions |
| Mobile data cards | ตารางแผนและตารางรอขายสลับเป็น dense cards; card ต้องคงข้อมูลที่ใช้ตัดสินใจและ action ของ row นั้น เช่นสินค้า ลูกค้า ช่องทาง น้ำหนัก มูลค่ารอขาย ราคา/% LME กำไร สถานะ และ lock/open-PO โดยไม่ทำ generic two-column dump |
| Shortage state | mobile card สินค้าขาดคงพื้น neutral เหมือนรายการปกติ; ใช้สีแดงเฉพาะขอบบาง, badge `สต๊อกไม่พอ` และค่าติดลบ ไม่ย้อมพื้นทั้งใบเป็นสีแดงเพราะ shortage เป็นภาวะข้อมูล ไม่ใช่ destructive document state |
| Pending-sale table | ใช้ `ns-table` + `ResizableTableHead` + `useResizableColumns`, header `p-2`, body `p-3`, header ทุกคอลัมน์อยู่บรรทัดเดียว และคง horizontal overflow; ห้ามใช้ `<br>` แบ่งหัวคอลัมน์ และต้องมี `คืนค่าเดิมตาราง` เมื่อมี custom width |
| Technical details | แสดง source เป็นคำไทยสั้น (`ดึงอัตโนมัติ`, `กรอกเอง`, `ดึงอัตโนมัติและปรับเอง`) และซ่อน provider/raw note ใน disclosure `รายละเอียดแหล่งข้อมูล`; เวลา/ผู้แก้ล่าสุดและสูตร `รอขายจริง` ยังคงมองเห็นในบริบทที่ใช้ตัดสินใจ ส่วน runtime/validation error ต้องเห็นโดยไม่เปิด disclosure |

## Non-Responsibilities

- Sales Plan ไม่ตัด stock และไม่สร้าง AR จนกว่าจะเปิดเอกสารขายปลายทาง
- ไม่สร้างหรือแก้ Sales Bill / Stock Issue
- ไม่เขียน stock_ledger หรือ bank_statement
- ไม่เปลี่ยนสถานะเอกสารต้นทาง
- ไม่เป็น source of truth แทนเอกสาร/fact table ต้นทาง

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิด `/sales-plan` | โหลด operational read model และแผนของเดือนปัจจุบันจาก Current API |
| 2 | ตรวจ LME และแก้ FX / กก./ตู้ | ระบบใช้ค่าหน้า `LME Reference Pricing` เป็นฐานคำนวณทั้งหน้า |
| 3 | กด `ดึงราคาล่าสุด` | ดึงค่า live มาเติมฟอร์มเฉพาะ field ที่รองรับ แล้วผู้ใช้กด `บันทึกค่าอ้างอิง` อีกครั้งถ้าต้องการใช้จริง |
| 4 | กด `สร้างแผนขาย` | เปิดฟอร์มเพิ่มแผน แล้วบันทึกลง `sales_plans` เป็นสถานะ `draft` |
| 5 | กรองข้อมูล operational | เดือน/สินค้า/หมวดใช้กับตารางแผนและตารางรอขาย; ช่องทางและ sort ใช้กับตารางแผน โดยช่องทางยังจำกัดแผนราคาที่นำไปประกอบตารางรอขาย |
| 6 | เปิด `/sales-plan-analysis` | โหลด read model เดือนที่เลือกโดยไม่มี write action |
| 7 | สลับแท็บรายงาน | แสดงมุมมองวิเคราะห์หรือสต๊อกหลังหักแผนทีละหนึ่ง data surface |
| 8 | ตรวจรายละเอียด | อ่านข้อมูลจากตารางของมุมมองที่เลือก; route ปัจจุบันยังไม่มี drilldown |
| 9 | Export | ส่งออกข้อมูลตาม filter และ active analysis tab ปัจจุบันโดยไม่แก้ source |

## API / Data Contract

### Current API

- `GET /api/sales-plan`
- `GET /api/sales-plan?month=YYYY-MM` ใช้ร่วมกันโดย `/sales-plan` และ `/sales-plan-analysis`; analysis route อ่านเฉพาะ `productAnalysis`, filter metadata และ source facts ที่จำเป็น
- `POST /api/sales-plan`
  - `action = fetch-live`
  - `action = save-config`
  - `action = create-plan`
  - `action = lock-plan`

### Persistence Tables

- `public.sales_plans` เก็บแผนขายรายเดือน, สินค้า, ลูกค้า, ช่องทาง, ตู้/กก., `LME cf`, `FX`, `% LME`, ราคา THB/kg, สถานะ, และ link กลับ `po_sells`
- สถานะฐานข้อมูลหลัก: `draft` -> `locked` -> `po_created`
- สถานะที่แสดงใน UI: `รอล็อกแผน` -> `ล็อกแผนแล้ว` -> `เปิด PO ขายแล้ว`
- `po_sell_id` ถูกเติมเมื่อสร้าง PO Sell จากแผนสำเร็จเท่านั้น

## LME Reference Pricing

### Purpose

- ใช้เป็นค่ากลางสำหรับคำนวณราคาเสนอขาย (`THB/kg`) และตัวเลขวิเคราะห์บนหน้า Sales Plan
- ให้ผู้ใช้ปรับค่าหน้าเดียวโดยไม่ต้องออกไปตั้งค่าในหน้าอื่น

### Current Visible Fields

| Field | Meaning | Input mode |
|---|---|---|
| `ทองแดง LME` | ราคาอ้างอิง LME ของทองแดง | read-only บนหน้าและเติมจากข้อมูลที่ fetch/live config ไว้ |
| `USD/THB` | FX rate สำหรับคำนวณราคาเสนอขาย | กรอกเอง หรือ fetch live |
| `กก./ตู้` | น้ำหนักมาตรฐานต่อ 1 ตู้ | กรอกเองเท่านั้น |

### ดึงราคาล่าสุด (Fetch Live) Rules

- ปุ่ม `ดึงราคาล่าสุด` ใช้เติมค่าลงในฟอร์มก่อนบันทึก ไม่ใช่ auto-save
- ค่า `USD/THB` และ `ทองแดง LME` ที่แสดงบนหน้าสามารถถูกเติมจาก API ได้
- current provider baseline: `USD/THB` มาจาก `https://www.google.com/finance/beta/quote/USD-THB`; ถ้าอ่านไม่สำเร็จและตั้ง `EXCHANGERATE_API_KEY` ไว้จะ fallback ไป ExchangeRate API
- `ทองแดง LME` มาจาก `https://3g.fx678.com/Market/index/LME` โดยอิงค่า `最新` ของแถว `LME铜`
- `กก./ตู้` ต้องคงเป็น manual field เสมอและห้ามถูกทับจาก API
- หน้า operational ปัจจุบันไม่เปิดช่องแก้ `ทองเหลือง LME` หรือ `อลูมิเนียม LME`; สินค้าที่ไม่มีค่า LME อัตโนมัติต้องให้ผู้ใช้กรอก `LME cf` ในแผนเอง
- route cron ภายใน `/api/cron/sales-plan-lme` สามารถบันทึกค่า live อัตโนมัติได้เมื่อ deployment ตั้ง `CRON_SECRET` และใช้ Vercel Cron

### Save Rules

- ผู้ใช้ต้องกด `บันทึกค่าอ้างอิง` เพื่อให้ config ชุดใหม่ถูกใช้คำนวณทั้งหน้า
- `USD/THB` และ `กก./ตู้` ต้องมากกว่า 0 ทั้งที่หน้าและ API; validation ต้องแสดงใต้ field และ focus ช่องแรกที่แก้ได้
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
| `ช่องทาง` | resolve อัตโนมัติจาก `Master Customer.market_scope` และแสดงแบบ read-only | Yes |
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
- validation ต้องแสดงข้อความใต้ field ที่แก้ได้จริงและเลื่อน/focus ไป field แรก; error ที่ช่องทางของลูกค้า resolve ไม่ได้ต้องผูกกับ field `ลูกค้า`

### Add-To-Table Behavior

- ปุ่ม `เพิ่มเข้าตาราง` เรียก `POST /api/sales-plan` ด้วย `action = create-plan`
- server validate สินค้า/ลูกค้า และ derive ช่องทางขายจาก `Master Customer.market_scope` ก่อนคำนวณ `totalKg` กับ `sellPrice`
- หลังบันทึก หน้า reload `GET /api/sales-plan`; refresh/reopen browser ต้องยังเห็นข้อมูลจาก `sales_plans`
- แผนเริ่มที่สถานะ `draft` และต้องกด `ล็อกแผน` ก่อนเปิด PO Sell

### Current Limitation

- การยกเลิกแผนทำได้เฉพาะแผน `draft` ที่ยังไม่เปิด PO ขาย โดยเป็นการลบรายการออกจาก `sales_plans`; UI ต้องแสดงคำว่า `ยกเลิกแผน` และยืนยันผลกระทบก่อนลบ
- ยังไม่มี approval workflow แยกจาก `ล็อกแผน`
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

- Current `apps/next` page/API code is accepted as the Sales Plan persistence baseline; the route separation and design decisions in this note supersede the former single-page analysis layout as of 2026-07-20.
- `/sales-plan` is the Sales Plan persistence surface for config/create/lock before PO Sell plus its operational pending-sale read model.
- `/sales-plan-analysis` is a separate read-only analysis surface with two page-local tab buttons, filter/pagination/export, a non-resizable unsorted table, and no mutation controls.
- Current APIs are `GET /api/sales-plan`, `GET /api/sales-plan?planId=...`, and `POST /api/sales-plan` for LME config plus Sales Plan actions.
- Neither route writes stock ledger, bank statement, AP/AR settlement, or source document status; only the documented Sales Plan actions on `/sales-plan` may mutate Sales Plan/config state.
- Future changes should reconcile formula/source/cutoff details here before changing runtime behavior.

## Current Gap

- ยังไม่มี unlock สำหรับแผนที่ล็อกแล้ว; การยกเลิกปัจจุบันจำกัดเฉพาะแผน `draft` ที่ยังไม่เปิด PO ขาย
- ยังไม่มี approval workflow แยกจากปุ่ม `ล็อกแผน`
- `/sales-plan-analysis` ต้องคง no-fallback contract: สินค้าที่ไม่มี Sales Plan แสดง `-` สำหรับค่าที่ขึ้นกับราคาเสนอ และไม่เติมราคา LME กลาง
- `/sales-plan-analysis` ยังต้องย้ายปุ่มแท็บเฉพาะหน้าและตารางธรรมดาไปใช้ shared line tabs, sort และ resizable-column baseline ในงานแยก
- drilldown, print และ date/cutoff contract ยังต้องยืนยันให้ครบก่อนถือว่า report flow สมบูรณ์

## Implementation Checklist

- [x] Verify current API response shape and source tables
- [x] Document current page-level LME config behavior
- [x] Document current draft plan entry behavior
- [ ] Verify legacy formula if current implementation is incomplete
- [ ] Define drilldown route/source document links
- [ ] Confirm export/print and date cutoff behavior
- [x] Decide whether customer field stays free text or changes to master lookup
- [x] Decide persistence model for draft plan / lock plan
- [x] Separate operational `/sales-plan` from read-only `/sales-plan-analysis`
- [x] Record the accepted Sales Plan UI/design decisions for desktop and mobile
- [ ] Update this file when report formula changes
