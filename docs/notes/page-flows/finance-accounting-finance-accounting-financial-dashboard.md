---
title: Financial Dashboard Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-07-17
route: /finance-accounting/financial-dashboard
---

# Financial Dashboard Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Finance Accounting |
| Route | `/finance-accounting/financial-dashboard` |
| Page | Financial Dashboard |
| Current Next | accepted code baseline |

## Canonical References

[[Finance Accounting Flow]], [[Menu Page Flow Catalog]]

## Flow Baseline

finance/accounting read model: Financial Dashboard

## Page Responsibilities

- ใช้เป็น accounting/finance report read model จาก operational facts
- แสดง report-specific cutoff/as-of/currency/period
- drilldown ไป source finance/stock/payment/sales/purchase data
- แสดง read model/report ตาม filter ของหน้า
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

- `GET /api/finance-accounting/financial-dashboard`

### Data Contract

- API ต้องระบุ source facts ที่ใช้ประกอบตัวเลขของหน้า
- list/report/export ต้องใช้ filter definition เดียวกัน
- source links ต้องใช้ outward document/code ใน UI และ resolve internal id ฝั่ง server
- ถ้าใช้ legacy-derived calculation ต้องบันทึก formula ก่อนแก้ runtime

## Validation / Status Rules

- report ต้องระบุ actual vs forecast/accrual assumption
- ห้ามรวมสกุลเงินหรือหน่วยโดยไม่มี conversion policy
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
- Public `branchId` values are outward branch codes, not internal bigint IDs. An explicitly selected inactive/unknown code returns `400`; it must never fall back to the all-branch aggregate. A code outside the caller's effective authorized scope returns `403`.
- No transaction, stock ledger, bank statement, AP/AR settlement, or source document status side effect is expected from this page.
- Future changes should reconcile formula/source/cutoff details here before changing runtime behavior.

## Current Gap

P2 proof completed against current Next page/API code. P&L, Cash Flow Analysis, AR, AP and Asset Overview now accept the Dashboard's source scope before their first request. Cash Position, Stock Finance and Balance Sheet are intentionally not clickable from this Dashboard until their destination APIs support the same authorized branch/as-of contract; showing a link that silently expands to global/default data would be misleading.

## Design And Data-Presentation Baseline (2026-07-17)

- ลำดับหน้าที่รับรองคือ `ตัวกรองทั้งหน้า -> KPI หลัก -> กราฟ/โครงสร้างสินทรัพย์ -> ประมาณการเงินสด 7/30 วัน -> ผลประกอบการ/ฐานะการเงิน -> ประเด็นที่ควรติดตาม`
- KPI หลักใช้ shared `KpiCardGrid` ชั้นเดียวและเป็น 2 คอลัมน์บน mobile; ห้ามซ้อน KPI card ใน outer section card
- KPI ใช้ 3 คอลัมน์ตลอดช่วง `lg`/`xl` และขยายเป็น 6 คอลัมน์เมื่อถึง `2xl` เท่านั้น; loading skeleton ต้องใช้ breakpoint เดียวกัน เพื่อไม่ให้ตัวเลขการเงินแตกหลายบรรทัดบนจอ laptop หลังหักพื้นที่ Sidebar
- ชุดประมาณการ 7/30 วันแสดงเพียงหนึ่งครั้ง และแยก `คาดรับ`, `คาดจ่าย`, `เงินสดคาดการณ์`, และ `เปลี่ยนแปลงสุทธิ` ให้ชัด
- ขอบเขตข้อมูล, ประมาณการ, cutoff, สาขา, หน่วยหลัก และสถานะ management report ต้องปรากฏแบบ compact โดยไม่อ้าง snapshot completeness ที่ payload ยังพิสูจน์ไม่ได้
- ค่า `netProfitBeforeTax` ต้องใช้คำว่า `กำไรก่อนภาษี`; ห้ามเรียกว่า `กำไรสุทธิ` จนกว่าสูตรภาษี/closing policy จะรองรับ
- ถ้า source ไม่มี metric หรือส่งค่าที่ไม่ใช่ finite number ให้ omit metric หรือแสดง `ไม่มีข้อมูล`; ห้ามเติม `0.00`, `0%`, หรือสถานะเชิงบวกเพื่อให้หน้าดูครบ
- Loading/refetch/error ต้องซ่อนตัวเลขเก่าที่ไม่ตรงกับ filter ใหม่ และใช้ skeleton/status ที่ screen reader อ่านได้
- Cash runway, เงิน, และเปอร์เซ็นต์ต้อง format ตามหน่วยธุรกิจ; ค่าที่คำนวณได้เกิน 999 วันใช้ `มากกว่า 999 วัน` ไม่ใช้ `∞`
- THB cash/projection รวมเฉพาะเงินสดและธนาคาร; FCD ใช้ `accounts.opening_balance` และติดป้าย `ยอดตั้งต้น` เพราะ `bank_statement` ปัจจุบันไม่มี foreign amount, รวมได้เฉพาะภายในสกุลเดียวกัน, บัญชีที่ไม่ระบุสกุลต้องแสดงแยก, ห้ามคืน scalar ข้ามสกุล และห้ามบวกเข้ายอดบาทจนกว่าจะมี foreign-movement/FX policy
- ยอดบัญชี THB ต้องคำนวณจาก opening balance + movement aggregate ฝั่งฐานข้อมูลโดยไม่ตัดจำนวน statement และไม่โหลดประวัติทั้งหมดเข้า application memory
- Query ที่ใช้ cutoff ต้อง normalize วันที่ธุรกิจกรุงเทพก่อนหาเดือน และจบวันแบบ explicit (`23:59:59.999 +07:00`) โดยไม่ขึ้นกับ timezone ของ runtime
- Cash projection เป็นค่าจาก server read model; ศูนย์จริงใช้สถานะ `สมดุล`, ค่าที่หายใช้ `ไม่มีข้อมูล`, cash basis ที่ไม่เป็นบวกต้องไม่รายงาน stock/cash เป็น `0% ปกติ`, และ OD usage ต้องไม่ถูกซ่อนเมื่อวงเงินเป็นศูนย์
- Mobile แสดง compact scope กับปุ่ม `ตัวกรอง` และเปิด `MobileFilterSheet`; วันที่ as-of เป็น required scope และล้างให้ว่างไม่ได้
- Drilldown เป็น read-only navigation เฉพาะ owner route ที่รักษา scope ได้: P&L/Cash Flow Analysis รับ month-start/as-of/branch, AR/AP รับ as-of โดยตั้ง `from=` ว่างเพื่อไม่ตัดบิลเปิดเก่า, Asset Overview รับ as-of/branch, และ WTO list รับ `type`; Cash Position/Stock Finance/Balance Sheet แสดงข้อมูลแต่ยังไม่เป็นลิงก์จนกว่าจะมี destination scope contract
- กราฟ P&L ใช้แกน X แบบสัดส่วนเต็มพื้นที่สำหรับ 6 เดือนและมี Y tick พร้อม label 5 ระดับ; ห้ามบีบกราฟด้วย fixed `viewBox` ที่ทำให้เกิด letterbox บนการ์ดกว้าง
- Y-domain ต้องรวมศูนย์และอิงช่วงข้อมูลจริง: ชุดข้อมูลบวกทั้งหมดวางศูนย์ที่ฐานเพื่อใช้ความสูงพล็อตเต็ม ส่วนชุดผสมบวก/ลบวางเส้นศูนย์ตามสัดส่วนจริง
- ค่า series ที่ไม่ใช่ finite number ต้องไม่สร้าง SVG geometry; ให้ละเว้นแท่งนั้นและคงคำว่า `ไม่มีข้อมูล` ในคำอธิบาย ขณะที่ช่วงข้อมูลต่ำกว่า 1 บาทต้องใช้สเกลจริงโดยไม่บังคับขั้นต่ำ 1 บาท
- บนจอแคบกราฟคงความกว้างขั้นต่ำ `720px` และเลื่อนแนวนอนภายใน panel เพื่อรักษาความกว้างแท่งและระยะห่างของเดือน; scroll region ต้อง focus ด้วยคีย์บอร์ดได้และมี accessible label
- Hover/focus/tap กลุ่มเดือนต้องเปิด custom tooltip ภายใน rendered frame แรกโดยไม่มี show delay และแสดงค่าจริงแบบเต็มของ `รายได้`, `ต้นทุนขาย (COGS)`, และ `กำไรก่อนภาษี`; ห้ามใช้ browser-native SVG `<title>` เป็น interaction หลัก
- Desktop ต้องวาง tooltip ข้างกลุ่มเดือนโดยไม่ทับ hit area หรือแท่งของเดือนที่กำลังดู ส่วน mobile ต้องแสดง tooltip แบบ in-flow ใต้กราฟ; `Escape` และการแตะพื้นที่ว่างต้องปิด tooltip ได้
- เดือนที่ทั้ง Revenue, COGS และ PBT ไม่มี finite non-zero value ถือว่าไม่มีแท่งให้ inspect: ต้องไม่มี tooltip hit area, pointer/click/focus handler หรือ tab stop และการเลื่อนเมาส์จากแท่งจริงเข้าสู่พื้นที่ว่างต้องปิด tooltip เดิม; ค่าศูนย์ยังคงอยู่ใน `<desc>` เพื่อให้ความหมายข้อมูลไม่หาย

Live visual QA ที่ viewport `1920x1080` ยืนยัน panel `1190x338.7px`, SVG `1148x210px`, และ plot `1044.7x159.1px` หรือ `90.8%` ของ content width; แท่งที่มองเห็นกว้างเฉลี่ย `25.3px`, ไม่มี document overflow, console/page error, failed request หรือ HTTP error response. หลักฐานอยู่ที่ `reports/playwright/financial-dashboard-chart-professional/desktop-1920x1080.png`, `pl-chart-card.png`, และ `metrics.json`.
Mobile QA ที่ `390x844` ยืนยัน scroll viewport `309px` ต่อ chart `720px`; region รับ keyboard focus, `ArrowRight` เลื่อนจาก `0` เป็น `40px` และไปถึงปลาย `411px` ได้ โดยเดือน `ก.ค.` ยังมองเห็นและไม่มี document overflow หรือ browser/network error. หลักฐานคือภาพ `mobile-*.png` และ `mobile-metrics.json` ใน report directory เดียวกัน.
Tooltip QA รอบ final v3 ยืนยัน desktop ครบ 6 เดือน: DOM mutation `5.09–7.59ms`, gap จาก active group `11.485–11.515px`, ไม่มี intersection, ไม่มี native `<title>`, hover เข้า tooltip ได้และ `Escape` ปิดค้างได้. Mobile `390x844` เปิดด้วย tap ครั้งแรก, วาง panel ใต้กราฟ 8px โดยไม่ทับแท่ง, ปิดด้วย non-group tap และใช้ keyboard ได้ครบ; error ทุกช่องเป็นศูนย์. หลักฐานคือ `custom-tooltip-final-v3-metrics.json` และภาพ `custom-tooltip-final-v3-*.png`.

What is what: การเปลี่ยนรอบนี้จัดรูป read model เดิมให้เป็น management dashboard ที่ตัดสินใจได้เร็วขึ้น และแก้เฉพาะ label/date/format/unsupported placeholder ที่ทำให้ผู้ใช้เข้าใจข้อมูลผิด. Why it has to be like this: dashboard การเงินต้องแยก fact ออกจาก forecast, ไม่ทำค่าที่ไม่มี source ให้ดูเหมือนศูนย์จริง, และไม่ซ้ำตัวเลขชุดเดียวกันจนความเสี่ยงสำคัญถูกฝังอยู่ท้ายหน้า.

## Scoped Drilldown Checkpoint 2026-07-17

- What is what: `filters.monthStart`, `filters.asOf` และ outward branch code จาก payload เป็น source scope เดียวของลิงก์ Dashboard. P&L/Cash Analysis ใช้ช่วงเดือนถึง as-of, AR/AP ใช้ยอดคงค้างถึง as-of โดยไม่มี lower bound, และ Asset Overview hydrate as-of/branch ก่อน request แรก.
- Why it has to be like this: ตัวเลขปลายทางต้อง reconcile กับการ์ดที่ผู้ใช้คลิกและต้องไม่ขยายสิทธิ์หรือช่วงข้อมูลระหว่าง navigation. ลิงก์ไป Cash Position, Stock Finance และ Balance Sheet จึงถูกพักไว้จน API ปลายทางรองรับ branch/as-of authorization แบบ fail-closed.
- The Dashboard remains read-only; this contract changes only navigation and does not create, settle or post any finance document.

## Implementation Checklist

- [x] Verify current API response shape and source tables
- [ ] Verify legacy formula if current implementation is incomplete
- [x] Define drilldown route/source document links
- [ ] Confirm export/print and date cutoff behavior
- [x] Update this file when report formula changes
