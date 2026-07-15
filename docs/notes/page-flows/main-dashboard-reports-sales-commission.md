---
title: Sales Tracking Dashboard Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-26
route: /sales-commission
---

# Sales Tracking Dashboard Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Main Dashboard / Reports |
| Route | `/sales-commission` |
| Page | Sales Tracking Dashboard |
| Current Next | accepted code baseline |

## Visual Update: Compact Overview Dashboard

วันที่บันทึก: 2026-07-10

หน้า overview ของ `/sales-commission` ใช้รูปแบบ dashboard compact ตามภาพอ้างอิงที่ผู้ใช้ส่งให้:

- แถวตัวกรองด้านบนแสดงช่วงวันที่และสาขาเป็น scope หลัก พร้อมปุ่ม `รีเซ็ตตัวกรอง`
- ช่วงวันที่มีตัวเลือกด่วน `วันนี้`, `7 วัน`, และ `เดือนนี้`; ปุ่ม `ล้างตัวกรอง` คืนวันที่เป็นเดือนปัจจุบัน, สาขาเป็นทั้งหมด, และตัวกรองการ์ดเป็นทั้งหมด โดยไม่เปลี่ยนสูตรหรือ payload ของรายงาน
- KPI หน้าแรกแสดงครบ 8 metric ตาม business requirement: จำนวนที่ซื้อ, ยอดซื้อ, จำนวนที่ได้คอม, ยอดซื้อที่ได้คอม, จำนวนที่ไม่ได้คอม, ยอดซื้อที่ไม่ได้คอม, จำนวนซื้อทั้งปี, และยอดซื้อทั้งปี โดย desktop วาง 4 ใบต่อแถว
- การ์ดรายพนักงานขายต้องเป็น report card แบบ 2-column metric boxes ตามภาพอ้างอิงล่าสุด: header แสดงชื่อ/รหัส/โทรและ badge ค่าคอม, ภายในแสดง `บิล`, `Supplier`, `น้ำหนักรับซื้อ`, `น้ำหนักที่ได้คอม`, `ยอดรับซื้อรวม`, `ยอดซื้อที่ได้คอม`, และ `ค่าคอมเดือนนี้`; desktop วางได้ 4 การ์ดต่อแถว และทั้ง card กดเข้า drilldown ได้. บน mobile เมื่อกดเข้า drilldown ต้องเลื่อนกลับขึ้นหัวรายละเอียด เพื่อให้เห็นชื่อพนักงานขาย, scope วันที่, ปุ่ม export, และปุ่มกลับก่อน KPI/table
- จำนวน `บิล` และ `Supplier` เป็น count จึงแสดงเลขเต็มไม่มี `.00`; ตัวกรองการ์ด `ทั้งหมด / มีรายการ / ได้คอม` ทำงานเฉพาะ presentation ของ card grid และค่าเริ่มต้นต้องเป็น `ทั้งหมด`
- หน้า drilldown รายพนักงานขายต้องใช้ KPI 8 ใบแบบสมดุล 4+4 บน desktop โดยไม่ใส่ decorative dot/marker ที่ไม่ได้สื่อความหมายจริง, ปุ่มกลับใช้ baseline `rounded-md h-9` พร้อม icon และวางเป็น standalone navigation ด้านซ้ายบน ไม่อยู่ใน header card เดียวกับปุ่ม `ส่งออก Excel`; ตารางต้องเป็นหัว neutral/Thai-first ไม่ใช้แถบดำ + emoji + `Table` อังกฤษ; หัว panel ที่ผู้ใช้เห็นต้องเป็นชื่อข้อมูลจริง ไม่ใช้ `ตาราง 1`/`ตาราง 2`; ถ้ามีตารางหลายชุดต้องจัดกลุ่มด้วย shared line tabs แทนการเรียงเป็นกำแพงตารางยาว โดยใช้ 4 แท็บคือ `ยอดรวมตามหมวด`, `ยอดได้คอม`, `ผู้ขาย`, และ `รายการสินค้า`; ห้ามให้แท็บเดียวมี 2 ตาราง และห้ามรวม Table 2 จนหายจาก navigation
- หน้า overview summary table และทุกตารางใน drilldown ต้องมี pagination row แบบเดียวกัน (`พบทั้งหมด`, page size, `ก่อนหน้า`, `หน้า X / Y`, `ถัดไป`). ภายในแต่ละ table surface ต้องเรียง toolbar/filter ก่อน pagination แล้วค่อยเป็น table. Filter ใน drilldown ต้องเป็น tab-specific: `ยอดรวมตามหมวด`/`ยอดได้คอม` ค้นหาหมวดสินค้า, `ผู้ขาย` ค้นหาผู้ขาย, และ `รายการสินค้า` ค้นหาเลขบิล/ผู้ขาย/สินค้า พร้อม segmented filter `สถานะค่าคอม`; ปุ่ม reset column width อยู่ใน toolbar ไม่แยกเป็นกรอบลอย
- ตารางสรุปราย Sales อยู่ใน white report panel พร้อม toolbar เลือกพนักงานขายและปุ่ม `ส่งออก Excel`

What is what: filter row กำหนด scope ของรายงาน, KPI 8 ใบเป็นภาพรวมสำหรับตัดสินใจ, card รายพนักงานขายใช้เลือก drilldown, line tabs ใน drilldown ใช้เลือกตารางตรวจสอบทีละชุด: Table 1 ยอดรวมตามหมวด, Table 2 ยอดได้คอม, Table 3 ผู้ขาย, หรือ Table 4 รายการสินค้า.

Why it has to be like this: หน้านี้ต้องอ่านเป็น dashboard ก่อน ไม่ใช่รายงานยาวที่มี metric ซ้ำกับ table/card หลายชั้นหรือมีกำแพงตารางต่อกัน; detail เชิงตรวจสอบยังอยู่ใน drilldown รายพนักงานขายตาม flow เดิมแต่ต้องถูกจัดกลุ่มให้เลือกดูทีละบริบท.

## Canonical References

[[Main Dashboard Reports Flow]], [[Sales Flow]], [[Purchase Flow]]

## Flow Baseline

Sales Tracking Dashboard เป็น report สำหรับดู performance ของ salesperson/supplier/customer assignment และ commission-readiness ตาม current read model

## Requested Flow Change: Remove Supplier-Salesperson Binding Chart

วันที่บันทึก: 2026-06-26

จาก requirement ล่าสุด หน้า Sales Tracking — ผลงานพนักงาน ต้องตัดกราฟ/section ที่ผูกข้อมูล Supplier กับพนักงานขายออกจากหน้า Dashboard นี้ เพราะหน้าดังกล่าวต้องโฟกัสที่ผลงานขายของพนักงาน ไม่ใช่การดูแล Supplier

### Existing Section To Remove

- Section/Panel: `ผูก Supplier กับพนักงานขาย`
- ข้อมูลที่แสดงอยู่เดิม:
  - รหัส Supplier
  - ชื่อ Supplier
  - โทร
  - พนักงานขายที่รับผิดชอบ
- Current component reference:
  - `SalesCommissionPageClient`
  - `apps/next/src/components/main/MainSalesControlClients.tsx`

### Target Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า Sales Tracking — ผลงานพนักงาน | ระบบโหลดข้อมูล performance พนักงานขายตามเดิม |
| 2 | ดู KPI และรายชื่อพนักงานขาย | แสดงยอด/จำนวนบิล/น้ำหนัก/ค่าคอมตามพนักงานขาย |
| 3 | เลือกพนักงานขาย | เปิดรายละเอียดผลงานของพนักงานขายคนนั้น |
| 4 | ดูรายละเอียด | แสดงรายการเอกสารขาย/ยอดขาย/น้ำหนัก/ค่าคอมที่เกี่ยวข้องกับพนักงานขาย |
| 5 | กลับหน้ารวม | กลับมาหน้า summary โดยไม่มีกราฟหรือ table ผูก Supplier กับพนักงานขาย |

### Keep

- KPI summary ของ Sales Tracking
- Card รายพนักงานขาย
- Drilldown รายละเอียดพนักงานขาย
- ข้อมูลยอดขาย/น้ำหนัก/จำนวนบิล/ค่าคอม
- Notice/error state เดิม

### Remove / Hide

- กราฟหรือ table ที่ใช้ดูความสัมพันธ์ Supplier กับพนักงานขาย
- Search/filter เฉพาะ Supplier ใน section ดังกล่าว
- Count Supplier binding ที่อยู่เฉพาะ section ดังกล่าว

### Acceptance Criteria

- หน้า Sales Tracking ไม่มีหัวข้อ `ผูก Supplier กับพนักงานขาย`
- ไม่มีตาราง Supplier assignment ในหน้า summary
- การโหลด `/api/sales-commission` ยังทำงานได้ตามเดิม
- การกดเข้า drilldown พนักงานขายยังทำงานได้
- ไม่กระทบ Master Data พนักงานขาย และไม่แก้ owner ของ Supplier/Customer
- ถ้ายังต้องการดู owner ของ Supplier ในอนาคต ให้ย้ายไปอยู่หน้า Tracking 360 / Supplier Tracking หรือ Master Data Supplier แทน

## Requested Flow Change: Summary Metrics Cards

วันที่บันทึก: 2026-06-26

ปัจจุบันหน้า Sales Tracking — ผลงานพนักงาน มี Summary Metrics Cards หลัก 2 รายการ:

- น้ำหนักรับซื้อรวม
- ยอดรับซื้อรวม

Requirement ล่าสุดต้องเพิ่ม Summary Metrics Cards เพื่อแยกข้อมูลตามสิทธิ์ค่าคอมมิชชั่นของพนักงานขาย และเพิ่มยอดสะสมรายปีเพื่อใช้เทียบกับผลงานตามช่วงเวลาที่เลือก

### Target Summary Metrics

| ลำดับ | Metric | ความหมาย | เงื่อนไขข้อมูล |
|---|---|---|---|
| 1 | จำนวนที่ซื้อ | น้ำหนัก/จำนวนซื้อรวมตามช่วงเวลาที่เลือก | รวมทุกรายการซื้อในช่วงวันที่ที่ filter |
| 2 | ยอดซื้อ | มูลค่าซื้อรวมตามช่วงเวลาที่เลือก | รวมทุกรายการซื้อในช่วงวันที่ที่ filter |
| 3 | จำนวนที่ได้คอมมิชชั่น | น้ำหนัก/จำนวนซื้อของรายการที่เข้าเงื่อนไขค่าคอม | salesperson เปิดสิทธิ์ค่าคอมใน Master Data พนักงานขาย และราคาซื้อ/กก. น้อยกว่าหรือเท่ากับราคาบริษัท/ราคาหน้าใบ |
| 4 | ยอดซื้อที่ได้คอมมิชชั่น | มูลค่าซื้อของรายการที่เข้าเงื่อนไขค่าคอม | salesperson เปิดสิทธิ์ค่าคอมใน Master Data พนักงานขาย และราคาซื้อ/กก. น้อยกว่าหรือเท่ากับราคาบริษัท/ราคาหน้าใบ |
| 5 | จำนวนที่ไม่ได้คอมมิชชั่น | น้ำหนัก/จำนวนซื้อของรายการที่ไม่เข้าเงื่อนไขค่าคอม | รวมรายการที่ salesperson ไม่มีสิทธิ์ค่าคอม, ไม่มี salesperson ที่เข้ากติกา, หรือราคาซื้อ/กก. มากกว่าราคาบริษัท/ราคาหน้าใบ |
| 6 | ยอดซื้อที่ไม่ได้คอมมิชชั่น | มูลค่าซื้อของรายการที่ไม่เข้าเงื่อนไขค่าคอม | รวมรายการที่ salesperson ไม่มีสิทธิ์ค่าคอม, ไม่มี salesperson ที่เข้ากติกา, หรือราคาซื้อ/กก. มากกว่าราคาบริษัท/ราคาหน้าใบ |
| 7 | จำนวนยอดซื้อทั้งปี (กก.) | น้ำหนักซื้อรวมสะสมทั้งปี | ใช้ปีจาก filter วันที่ของหน้า เช่น ถ้าเลือกวันที่ในปี 2026 ให้คำนวณตั้งแต่ 01/01/2026 ถึง 31/12/2026 หรือถึงวันที่ปัจจุบันตามนิยาม report |
| 8 | ยอดซื้อทั้งปี | มูลค่าซื้อรวมสะสมทั้งปี | ใช้ปีเดียวกับ metric จำนวนยอดซื้อทั้งปี และรวมรายการซื้อของปีนั้นตามสิทธิ์/ขอบเขต filter หลักของหน้า |

### Calculation Scope

- Metric ลำดับ 1-6 ต้องเปลี่ยนตามช่วงวันที่ที่เลือก
- Metric ลำดับ 7-8 เป็นยอดสะสมรายปี โดยยึดปีจากช่วงวันที่ที่ผู้ใช้เลือกในหน้า
- ทุก metric ต้องสอดคล้องกับ filter อื่น ๆ ของหน้า ถ้ามี เช่น สาขา, พนักงานขาย, ประเภทเอกสาร
- รายการที่ถูกยกเลิก/reverse ไม่ควรถูกนำมาคำนวณ เว้นแต่ report definition ระบุไว้เป็นอย่างอื่น
- ถ้าพนักงานขายไม่ได้เปิดสิทธิ์ค่าคอมใน Master Data พนักงานขาย ให้ยอดของพนักงานคนนั้นอยู่กลุ่ม `ไม่ได้คอมมิชชั่น`
- รายการที่พนักงานขายมีสิทธิ์ค่าคอม แต่ราคาซื้อ/กก. มากกว่าราคาบริษัท/ราคาหน้าใบ ให้จัดอยู่กลุ่ม `ไม่ได้คอมมิชชั่น`
- กล่องรายปีต้องช่วยให้ผู้ใช้เทียบได้ว่า performance ในช่วงวันที่ที่เลือกคิดเป็นสัดส่วนเท่าไรของยอดสะสมทั้งปี

### Purchase Bill Price Input Rule

วันที่บันทึก: 2026-06-27

กรณี Supplier มีผู้ดูแลเป็น Sales ที่ไม่ได้รับค่าคอมมิชชั่น ไม่ต้องแสดง field `ราคาหน้าใบ` ในหน้ากรอกบิลซื้อ และไม่ต้องบังคับให้ผู้ใช้กรอกข้อมูลนี้

หลักการ:

- ถ้า Supplier ผูกกับ Sales และ Sales คนนั้น `ไม่ได้เปิดสิทธิ์ค่าคอมมิชชั่น` ใน Master Data พนักงานขาย:
  - ไม่ต้องแสดง field `ราคาหน้าใบ` ในรายการบิลซื้อ
  - ไม่ต้อง validate `ราคาหน้าใบ`
  - รายการซื้อทั้งหมดของ Supplier/Sales คนนั้นเข้ากลุ่ม `ไม่ได้คอมมิชชั่น`
- ถ้า Supplier ผูกกับ Sales ที่ `เปิดสิทธิ์ค่าคอมมิชชั่น`:
  - ต้องแสดง field `ราคาหน้าใบ`
  - ต้องใช้ `ราคาหน้าใบ` เพื่อเปรียบเทียบกับ `ราคาซื้อ/กก.`
  - เงื่อนไขได้คอมคือ `ราคาซื้อ/กก. <= ราคาหน้าใบ`
- ถ้าไม่มี Sales หรือหา Sales owner ไม่ได้:
  - ไม่ต้องคิดค่าคอม
  - รายการอยู่กลุ่ม `ไม่ได้คอมมิชชั่น`
  - การแสดง field `ราคาหน้าใบ` ให้เป็น optional หรือซ่อนได้ตาม UX ของหน้าบิลซื้อ

Acceptance:

- Supplier ที่มี Sales ไม่ได้ค่าคอม ต้องสามารถเปิดบิลซื้อได้โดยไม่กรอก `ราคาหน้าใบ`
- ระบบต้องไม่แจ้ง validation error เรื่อง `ราคาหน้าใบ` ในกรณี Sales ไม่ได้ค่าคอม
- รายการดังกล่าวต้องไม่ถูกนับใน metric/table กลุ่ม `ได้คอมมิชชั่น`
- Table รายละเอียดควรแสดง `ราคาหน้าใบ` เป็น `-` หรือว่างสำหรับรายการที่ไม่ได้ใช้ราคาหน้าใบ

### Commission Tier Rule

วันที่บันทึก: 2026-06-27

เงื่อนไขการคำนวณค่าคอมมิชชั่นของ Sales ให้คิดจาก `ยอดซื้อที่ได้รับค่าคอมมิชชั่น` ของ Sales คนนั้นในช่วงเวลาที่เลือก โดยต้องนับเฉพาะ Sales ที่เปิดสิทธิ์ได้รับค่าคอมมิชชั่นใน Master Data พนักงานขายเท่านั้น

กติกาขั้นบันได:

| ยอดซื้อที่ได้รับค่าคอมมิชชั่น | ค่าคอมมิชชั่น |
|---:|---:|
| ต่ำกว่า 1,000,000 บาท | 0 บาท |
| ตั้งแต่ 1,000,000 บาท | 1,000 บาท |
| มากกว่า 1,500,000 บาท | 1,500 บาท |
| มากกว่า 2,000,000 บาท | 2,000 บาท |
| มากกว่า 2,500,000 บาท | 2,500 บาท |

หลักการต่อยอด:

- ค่าคอมเพิ่มทีละ 500 บาท ทุก ๆ ยอดซื้อเพิ่มขึ้น 500,000 บาท หลังจากผ่านฐาน 1,000,000 บาท
- ตัวอย่าง:
  - 999,999.99 บาท = ไม่ได้ค่าคอม
  - 1,000,000.00 บาท = 1,000 บาท
  - 1,500,000.00 บาท = 1,000 บาท ถ้าใช้เงื่อนไข `มากกว่า 1.5 ล้าน` สำหรับขั้นถัดไป
  - 1,500,000.01 บาท = 1,500 บาท
  - 2,000,000.01 บาท = 2,000 บาท
  - 2,500,000.01 บาท = 2,500 บาท
- ถ้ายอดซื้อเพิ่มต่อเนื่องเป็นหลายล้าน ให้เพิ่มค่าคอมต่อขั้นทีละ 500 บาท เช่น 3,000,000.01 บาท = 3,000 บาท
- Sales ที่ไม่ได้เปิดสิทธิ์ค่าคอมมิชชั่น ไม่ต้องคำนวณค่าคอม แม้มียอดซื้อถึงเงื่อนไข

สูตรแนะนำสำหรับ Dev:

```text
commissionable_amount = ยอดซื้อที่ได้รับค่าคอมมิชชั่นของ Sales คนนั้น

if sales_commission_enabled = false:
  commission_amount = 0
else if commissionable_amount < 1,000,000:
  commission_amount = 0
else:
  commission_amount = 1,000 + floor((commissionable_amount - 1,000,000) / 500,000) * 500

หมายเหตุ: หากลูกค้ายืนยันว่า 1,500,000 ต้องได้ 1,500 ทันที ให้เปลี่ยน floor เป็น ceil หรือปรับ threshold เป็น "ตั้งแต่" ในแต่ละขั้น
```

### Display Recommendation

- แสดงเป็น KPI cards ด้านบนของหน้า ก่อนตาราง/กราฟ
- ใช้ label ภาษาไทยตาม metric ด้านบน
- ควรแยกสีหรือ grouping ให้เห็นชัด:
  - รวมทั้งหมด: จำนวนที่ซื้อ, ยอดซื้อ
  - ได้คอมมิชชั่น: จำนวนที่ได้คอมมิชชั่น, ยอดซื้อที่ได้คอมมิชชั่น
  - ไม่ได้คอมมิชชั่น: จำนวนที่ไม่ได้คอมมิชชั่น, ยอดซื้อที่ไม่ได้คอมมิชชั่น

### Acceptance Criteria

- หน้า Sales Tracking แสดง Summary Metrics ครบ 8 รายการ
- เปลี่ยนช่วงวันที่แล้วตัวเลขทุก card ต้องเปลี่ยนตาม
- ยอด `ได้คอมมิชชั่น + ไม่ได้คอมมิชชั่น` ต้องเท่ากับยอดรวมในกลุ่มเดียวกัน
- พนักงานที่ไม่ได้เปิดสิทธิ์ค่าคอมต้องไม่ถูกนับใน metric ได้คอมมิชชั่น
- ไม่สร้างรายการจ่ายค่าคอมจริงจากหน้านี้ เป็นเพียง dashboard/report เท่านั้น

## Requested Flow Change: Overview Salesperson Cards

วันที่บันทึก: 2026-06-27

หน้าแรกของ Sales Tracking — ผลงานพนักงาน ต้องแสดงกล่องข้อมูลของ Sales แต่ละคนก่อนตาราง Sales Summary เพื่อให้ผู้ใช้เห็นภาพรวมผลงานรายคนก่อน แล้วค่อยดูตารางสรุปแยกตามหมวดสินค้า

### Page Order

ลำดับการแสดงผลในหน้าแรก:

1. Filter ช่วงเวลา / filter หลักของหน้า
2. Summary Metrics Cards ภาพรวมทั้งระบบ
3. กล่องข้อมูล Sale แต่ละคน
4. Sales Summary / สรุปยอดซื้อราย Sales

### Salesperson Card Fields

แต่ละกล่อง Sale ควรแสดงข้อมูลหลักของพนักงานขายคนนั้นตามช่วงเวลาที่เลือก:

| Field | ความหมาย |
|---|---|
| Sales | ชื่อพนักงานขาย และรหัสพนักงานขาย ถ้ามี |
| สถานะค่าคอม | ได้ค่าคอม / ไม่ได้ค่าคอม ตาม Master Data พนักงานขาย |
| บิล | จำนวนบิลซื้อที่ผูกกับ Sales คนนั้นในช่วงเวลาที่เลือก โดยนับรวมซื้อทุกบิล แม้รายการในบิลจะซื้อมาเกินเงื่อนไขค่าคอมมิชชั่น |
| Supplier | จำนวน Supplier ที่ Sales คนนั้นดูแลและมีรายการซื้อในช่วงเวลาที่เลือก โดยนับแบบ Count Distinct ทุก Supplier แม้รายการซื้อของ Supplier นั้นจะซื้อมาเกินเงื่อนไขค่าคอมมิชชั่น |
| น้ำหนักซื้อรวม (kg) | น้ำหนักรวมของ Sales คนนั้นจากบิลซื้อทั้งหมดในช่วงเวลาที่เลือก |
| ยอดรับซื้อรวม | มูลค่าซื้อรวมของ Sales คนนั้นในช่วงเวลาที่เลือก |
| น้ำหนักที่ได้ commission (kg) | น้ำหนักซื้อรวมเฉพาะรายการที่เข้าเงื่อนไขได้ค่าคอมมิชชั่น โดยรวมช่องสุทธิของรายการที่มี `ราคาซื้อ/กก. <= ราคาหน้าใบ` และ Sales เปิดสิทธิ์ค่าคอมมิชชั่น |
| ยอดซื้อที่ได้รับค่า commission (บาท) | มูลค่าซื้อรวมเฉพาะรายการที่เข้าเงื่อนไขได้ค่าคอมมิชชั่น โดยรวมยอดซื้อของรายการที่มี `ราคาซื้อ/กก. <= ราคาหน้าใบ` และ Sales เปิดสิทธิ์ค่าคอมมิชชั่น |
| ค่าคอมเดือนนี้ / ค่าคอมช่วงเวลาที่เลือก | ค่าคอมมิชชั่นที่ Sales คนนั้นได้รับจากยอดซื้อที่เข้าเงื่อนไข ตาม step commission ที่กำหนด |

### Display Behavior

- แสดงเป็น card grid ใต้ Summary Metrics Cards
- แต่ละ card ต้องแสดง field ตามชุดข้อมูลที่ผู้ใช้ต้องการ: จำนวนบิล, Supplier, น้ำหนักซื้อรวม, ยอดรับซื้อรวม, น้ำหนักที่ได้ commission, ยอดซื้อที่ได้รับค่า commission และค่า commission เดือนนี้
- จำนวนบิลและจำนวน Supplier ต้องเป็นตัวเลขภาพรวมของงานซื้อทั้งหมดในช่วงเวลาที่เลือก ไม่ถูกตัดออกเพียงเพราะรายการนั้นไม่ได้ค่าคอมมิชชั่น
- Desktop ใช้ 4 กล่องต่อแถวเมื่อพื้นที่พอ (`xl:grid-cols-4`); tablet ลดจำนวนคอลัมน์ตามพื้นที่เพื่อไม่บีบตัวเลข
- ถ้ามี Sales จำนวนมาก ต้องรองรับ pagination หรือ horizontal/section paging ตาม UX ที่ Dev เลือก
- การ์ดควรกดได้ เพื่อเปิด drilldown ราย Sales ที่แสดง 4 ตารางตาม section `Salesperson Drilldown Tables`
- ข้อมูลในการ์ดต้องเปลี่ยนตาม filter ช่วงวันที่และ filter หลักของหน้า
- ถ้า Sales ไม่มีสิทธิ์ค่าคอม ให้ยังแสดงผลงานซื้อได้ แต่ค่าคอมเป็น 0 และแสดงสถานะไม่คิดค่าคอมให้ชัดเจน

### Acceptance Criteria

- หน้าแรกต้องแสดงกล่อง Sale แต่ละคนก่อน Sales Summary
- กล่อง Sale แต่ละคนต้องใช้ข้อมูลจาก transaction จริงในช่วงเวลาที่เลือก
- คลิกกล่อง Sales แล้วต้องเปิด drilldown ราย Sales ได้
- ผลรวมของกล่อง Sales ต้อง reconcile กับ Summary Metrics Cards ภาพรวม
- หลังกล่อง Sales ต้องตามด้วย Sales Summary ตามหมวดสินค้า

## Requested Flow Change: Overview Sales Summary Table

วันที่บันทึก: 2026-06-26

จาก requirement ล่าสุด หน้าแรกของ Sales Tracking — ผลงานพนักงาน ที่แสดงข้อมูลภาพรวมทั้งหมด ต้องปรับจากตาราง `ผูก Supplier กับพนักงานขาย` เดิม มาเป็นตารางสรุปยอดซื้อของ Sales ตามหมวดสินค้า เพื่อให้ใกล้เคียงรายงาน Excel เดิมของลูกค้ามากขึ้น

### Target Section

Section ที่ต้องแสดงแทนตาราง Supplier เดิม:

- ชื่อ section: `Sales Summary` หรือ `สรุปยอดซื้อราย Sales`
- ตำแหน่ง: หน้าแรก Sales Tracking ด้านล่างกล่องข้อมูล Sale แต่ละคน
- หน้าที่: สรุปยอดซื้อรวมของพนักงานขายแต่ละคน แยกตามหมวด/ประเภทสินค้า

### Data Grouping

ลำดับการ group ข้อมูล:

1. Group ตาม Sales / พนักงานขาย
2. ภายใต้ Sales แต่ละคน group ตามหมวดสินค้า / ประเภทสินค้า
3. แสดงแถวรวมของ Sales คนนั้น
4. แสดงแถวรวมท้ายตารางของทุก Sales

### Fields

| Field | ความหมาย |
|---|---|
| Sales | ชื่อพนักงานขาย |
| ประเภท / หมวดสินค้า | หมวดสินค้า เช่น กระดาษ, ขวดแก้ว, ทองแดง, ทองเหลือง, พลาสติก, เหล็ก, อลูมิเนียม |
| จำนวน KG | น้ำหนักรวมของรายการซื้อในหมวดนั้น ภายใต้ Sales คนนั้น |
| มูลค่ารวม | ยอดซื้อรวมของรายการซื้อในหมวดนั้น ภายใต้ Sales คนนั้น |

### Display Behavior

- ค่าเริ่มต้นควรแสดงแบบ grouped table คล้าย pivot:
  - แถว Sales เป็นหัวกลุ่ม
  - แถวหมวดสินค้าเป็นรายการย่อย
  - แถว `Sales รวม` แสดงผลรวมของพนักงานขายคนนั้น
- ต้องมี dropdown/filter สำหรับเลือกดูเฉพาะ Sales ที่ต้องการในตาราง Sales Summary
  - ค่าเริ่มต้น: `ทุก Sales`
  - เมื่อเลือก Sales รายใดรายหนึ่ง ตารางต้องแสดงเฉพาะกลุ่มข้อมูลของ Sales คนนั้น
  - จำนวนรายการ/ข้อความสรุปด้านบนตารางต้องเปลี่ยนตาม Sales ที่เลือก
  - Summary Metrics Cards ด้านบนยังคงเป็นภาพรวมตาม filter หลักของหน้า เว้นแต่ผู้ใช้เลือก filter Sales ระดับหน้า
- ต้องสามารถ expand/collapse ราย Sales ได้ เพื่อดูรายการหมวดสินค้าภายใน
- ต้องเรียงตามยอดซื้อหรือจำนวน KG ได้
- ควรมี pagination หากจำนวน Sales หรือหมวดสินค้ามาก
- เมื่อคลิก Sales ควรเปิด drilldown รายพนักงานขาย 4 ตารางตาม section `Salesperson Drilldown Tables`

### Calculation Scope

- ใช้ช่วงวันที่เดียวกับ filter หลักของหน้า
- รวมเฉพาะเอกสารซื้อที่ valid/posted ตามนิยามของ report
- ไม่รวมเอกสารที่ถูกยกเลิก/reverse
- คำนวณจาก transaction จริง ไม่ใช่ master assignment อย่างเดียว
- `จำนวน KG` = ผลรวม net/gross weight ที่ report ใช้เป็นมาตรฐานสำหรับยอดซื้อ
- `มูลค่ารวม` = ผลรวมยอดซื้อของรายการที่เข้าเงื่อนไข report

### Acceptance Criteria

- หน้าแรก Sales Tracking ต้องไม่มีตาราง `ผูก Supplier กับพนักงานขาย`
- หน้าแรกต้องมีตารางสรุปยอดซื้อราย Sales แยกตามหมวดสินค้า
- ตารางต้องมี column `Sales`, `ประเภท / หมวดสินค้า`, `จำนวน KG`, `มูลค่ารวม`
- ตาราง Sales Summary ต้องมี dropdown เลือก `ทุก Sales` หรือเลือก Sales รายคนได้
- ผลรวมในตารางต้อง reconcile กับ Summary Metrics Cards ของหน้าแรก
- คลิก Sales แล้วต้องไป drilldown ราย Sales ได้

## Requested Flow Change: Salesperson Drilldown Tables

Date: 2026-06-26

เมื่อผู้ใช้เลือกเข้าไปดูข้อมูลของพนักงานขายแต่ละคนจากหน้า Sales Tracking — ผลงานพนักงาน ต้องเปิดหน้า drilldown รายพนักงานขาย โดยในหน้ารายละเอียดต้องแสดงข้อมูลหลักเป็น 4 ตาราง เพื่อให้เทียบกับรายงาน Excel เดิมของลูกค้าได้ชัดเจน

### Drilldown Entry

- ผู้ใช้เลือกพนักงานขายจาก dashboard หรือรายการสรุป
- ระบบเปิดหน้ารายละเอียดของพนักงานขายคนนั้น
- Header ต้องแสดงชื่อพนักงานขาย รหัสพนักงานขาย และช่วงวันที่ที่กำลัง filter อยู่
- ทุกตารางในหน้า drilldown ต้องใช้ช่วงเวลาและ filter เดียวกันกับหน้าหลัก เว้นแต่ผู้ใช้แก้ filter ในหน้า drilldown เอง

### Table 1: ยอดซื้อรวมตามหมวดสินค้า

ตารางนี้ใช้สรุปยอดสั่งซื้อรวมของพนักงานขายที่เลือก โดยจัดกลุ่มตามประเภท/หมวดสินค้า เพื่อให้เห็นว่าเซลท่านนั้นมียอดซื้อในสินค้าแต่ละประเภทเท่าไหร่

ข้อมูลที่ต้องแสดง:

- ประเภท / หมวดสินค้า
- จำนวน
- ยอดซื้อ
- แถวผลรวมท้ายตาราง

หลักการคำนวณ:

- รวมรายการซื้อทั้งหมดที่ผูกกับพนักงานขายคนนั้นในช่วงเวลาที่เลือก
- รวมทั้งรายการที่ได้ค่าคอมมิชชั่นและไม่ได้ค่าคอมมิชชั่น
- ยอดรวมของตารางนี้ต้องเท่ากับ Summary Metrics “จำนวนที่ซื้อ” และ “ยอดซื้อ” ของพนักงานขายคนนั้น

### Table 2: ยอดซื้อที่ได้รับค่าคอมมิชชั่นตามหมวดสินค้า

ตารางนี้ใช้สรุปยอดสั่งซื้อรวมของพนักงานขายที่เลือก โดยจัดกลุ่มตามประเภท/หมวดสินค้า แต่ดึงเฉพาะรายการที่เข้าเงื่อนไขได้รับค่าคอมมิชชั่นเท่านั้น

ข้อมูลที่ต้องแสดง:

- ประเภท / หมวดสินค้า
- จำนวน
- ยอดซื้อ
- แถวผลรวมท้ายตาราง

หลักการคำนวณ:

- ดึงเฉพาะรายการซื้อที่เข้าเงื่อนไขได้รับค่าคอมมิชชั่น
- ต้องผ่านเงื่อนไขพนักงานขายมีสิทธิ์ค่าคอมจาก Master Data พนักงานขาย
- ต้องผ่านเงื่อนไขราคา: `ราคาซื้อ/กก. <= ราคาบริษัท/ราคาหน้าใบ`
- ยอดซื้อของตารางนี้ต้องอ้างอิง `ช่องยอดรวมสินค้า` และ `น้ำหนักสุทธิ x ราคาซื้อ/กก.` เฉพาะ row ที่ผ่านเงื่อนไขค่าคอมมิชชั่น โดยใช้เป็นข้อมูลตรวจสอบคู่กัน ไม่ใช่เลือกอย่างใดอย่างหนึ่ง
- ถ้า `ราคาซื้อ/กก. > ราคาบริษัท/ราคาหน้าใบ` ให้รายการนั้นไปอยู่กลุ่มไม่ได้ค่าคอมมิชชั่น แม้พนักงานขายจะเปิดสิทธิ์ค่าคอมไว้

### Table 3: Supplier ในความดูแล

ตารางนี้แสดง Supplier ที่อยู่ในความดูแลหรือมี transaction ซื้อกับพนักงานขายคนนั้น เพื่อให้เห็นว่าเซลท่านนั้นดูแล Supplier รายใด และแต่ละ Supplier มีสัดส่วนยอดซื้อเท่าไหร่เมื่อเทียบกับยอดรวม

ข้อมูลที่ต้องแสดง:

- Supplier
- บิล (จำนวนบิล)
- น้ำหนัก
- ยอดรับซื้อ
- % ของ Total
- แถวผลรวมท้ายตาราง

Filter ที่ควรมีในตารางนี้:

- วันที่
- เลขที่บิล / เอกสารซื้อ
- Supplier

พฤติกรรมตาราง:

- ต้องมี pagination
- ต้อง sort ได้ตามจำนวนบิล, น้ำหนัก, ยอดรับซื้อ และ % ของ Total
- เมื่อคลิกชื่อ Supplier ควรเห็นรายละเอียดรายการสินค้าที่เกี่ยวข้อง หรือใช้เป็น filter ให้ตารางรายละเอียดด้านล่าง

### Table 4: รายการสินค้าละเอียด

ตารางนี้ใช้แสดงรายละเอียดรายการซื้อแบบรายสินค้า โดย 1 บรรทัดเท่ากับ 1 สินค้าในบิล เพื่อให้ตรวจสอบได้ว่ารายการซื้อของพนักงานขายคนนั้นเกิดจาก Supplier ใด สินค้าใด ราคาเท่าไหร่ และมีส่วนต่างกำไรเท่าไหร่

ขอบเขตข้อมูล: ต้องแสดงทุกรายการสินค้าของ Sales คนนั้นในช่วงเวลาที่เลือก ไม่ใช่เฉพาะรายการที่ได้คอมมิชชั่นหรือไม่ได้คอมมิชชั่นเท่านั้น

ข้อมูลที่ต้องแสดง:

- วันที่
- เลขที่บิล
- Supplier
- สินค้า
- น้ำหนัก
- ราคาซื้อ
- ราคาหน้าใบ
- ส่วนต่างกำไร
- ยอดรวม

หลักการแสดงผล:

- ต้องแยกให้เห็นระดับ Supplier และระดับสินค้า
- ถ้า 1 บิลมีหลายสินค้า ให้แสดงหลายบรรทัด โดย 1 บรรทัด = 1 สินค้า
- ต้องดึงทุกรายการสินค้าในบิลของ Sales คนนั้น ไม่ตัดรายการออกเพราะสถานะคอมมิชชั่น
- ควรมีตัวบอกสถานะ/ประเภทคอมมิชชั่นของแต่ละบรรทัด เช่น ได้คอมมิชชั่น / ไม่ได้คอมมิชชั่น เพื่อให้ตรวจสอบย้อนกลับไป Summary Metrics ได้
- ถ้า Sales ไม่ได้เปิดสิทธิ์ค่าคอมมิชชั่น และหน้าบิลซื้อไม่ได้เก็บ `ราคาหน้าใบ` ให้แสดงราคาหน้าใบเป็น `-` หรือว่าง และส่วนต่างกำไรเป็น `-`
- ส่วนต่างกำไร = ราคาหน้าใบ - ราคาซื้อ
- ยอดรวมของตารางนี้ต้อง reconcile กับ Summary Metrics “จำนวนที่ซื้อ” และ “ยอดซื้อ”
- ยอดของรายการที่ติดสถานะ “ได้คอมมิชชั่น” ต้อง reconcile กับ Summary Metrics “จำนวนที่ได้คอมมิชชั่น” และ “ยอดซื้อที่ได้คอมมิชชั่น”
- ยอดของรายการที่ติดสถานะ “ไม่ได้คอมมิชชั่น” ต้อง reconcile กับ Summary Metrics “จำนวนที่ไม่ได้คอมมิชชั่น” และ “ยอดซื้อที่ไม่ได้คอมมิชชั่น”

### General Table Requirements

- ทั้ง 4 ตารางต้องใช้ข้อมูลจาก transaction จริง ไม่ใช่ master assignment อย่างเดียว
- ทุกตารางต้องมี pagination เพื่อรองรับข้อมูลจำนวนมาก
- ทุกตารางต้องรองรับ filter วันที่, เลขที่บิล/เอกสาร และ Supplier/ลูกค้า ตามความเหมาะสมของข้อมูล
- UI ปัจจุบันใช้ pagination row เดียวกับ design baseline ทุก table surface โดยเรียง toolbar/filter -> pagination -> table และใช้ filter เฉพาะ field ที่อยู่ใน tab นั้นจริง เพื่อไม่ให้ตัวกรองลอยหรือควบคุมข้อมูลผิดบริบท
- ถ้าหน้า drilldown มีหลายตาราง ห้ามเรียง 4 ตารางลงมาในหน้าเดียว และห้ามให้แท็บเดียวมี 2 table panels ที่ต้องเทียบกันเอง ให้ใช้ shared line tabs แบบ 1 ตารางต่อ 1 แท็บ: `ยอดรวมตามหมวด` แสดง Table 1, `ยอดได้คอม` แสดง Table 2, `ผู้ขาย` แสดง Table 3, และ `รายการสินค้า` แสดง Table 4
- ห้ามนำกราฟ “ผูก Supplier กับพนักงานขาย” กลับมาใช้ในหน้านี้
- ตาราง “Supplier ในความดูแล” ต้องเน้นข้อมูล transaction ที่เกิดขึ้นจริง ไม่ใช่ master assignment อย่างเดียว

### Acceptance Criteria

- เมื่อเลือกพนักงานขาย 1 คน ต้องเข้าถึงตารางข้อมูล 4 ตารางครบถ้วนผ่าน shared line tabs โดยไม่เรียงทุกตารางพร้อมกันในหน้าเดียว และต้องไม่ทำให้ Table 2 หายจาก tab navigation
- ตารางยอดซื้อ NS รวม = ตารางได้คอม + ตารางไม่ได้คอม เมื่อรวมยอดตามช่วงเวลาเดียวกัน
- รายการของ Sales ทุกคนต้องเข้า Table 4 ทุกบรรทัดสินค้า ส่วน Table 2 แสดงเฉพาะรายการที่ได้คอมมิชชั่น
- รายการที่ได้คอมต้องเข้า Table 2 และยังถูกนับรวมใน Table 1
- ตารางรายชื่อลูกค้าต้องช่วยให้ดูยอดรายผู้ติดต่อ/ลูกค้าได้ ไม่ใช่แค่รายชื่อ master ที่ไม่มี transaction
- ข้อมูลใน drilldown ต้องสอดคล้องกับ Summary Metrics Cards ของหน้าหลัก

## Page Responsibilities

- โหลด sales tracking/commission read model จาก server
- แสดงยอดตาม salesperson หรือ assignment ที่ helper `buildSalesCommission()` ส่งกลับ
- ใช้เป็น dashboard ตรวจงาน ไม่ใช่ payroll posting

## Non-Responsibilities

- ไม่สร้าง commission payable
- ไม่แก้ salesperson master หรือ supplier/customer owner
- ไม่เขียน PB/SB/payment/receipt

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | `GET /api/sales-commission` |
| 2 | ดูสรุป | UI แสดง payload จาก `buildSalesCommission()` |
| 3 | Drilldown | ไปหน้า PB/SB/salesperson/supplier ที่เกี่ยวข้องเมื่อมี link |

## API / Data Contract

### Current API

- `GET /api/sales-commission`
- permission: `reports.reports.view`
- server helper: `buildSalesCommission()` from `main-sales-control`

### Response Schema

The server helper `buildSalesCommission()` returns the following payload:

```json
{
  "billRows": [
    {
      "amount": 12500.50,
      "date": "2026-06-25",
      "docNo": "PB012606-0004",
      "facePrice": 0,
      "id": "PB012606-0004",
      "price": 25.00,
      "productName": "ทองแดง, เหล็ก",
      "qty": 500,
      "salesId": "S001",
      "status": "รอจ่าย",
      "supplierName": "Supplier A"
    }
  ],
  "filters": {
    "dateFrom": "2026-06-01",
    "dateTo": "2026-06-27",
    "periods": ["today", "week", "month", "quarter", "year"]
  },
  "salesRows": [
    {
      "avgPrice": 25.00,
      "billCount": 1,
      "code": "SL001",
      "commission": 1500,
      "eligible": true,
      "id": "S001",
      "name": "พนักงานขาย A",
      "phone": "0812345678",
      "progressPct": 100,
      "purchaseAmt": 1500000,
      "qty": 60000,
      "remainingToTarget": 0,
      "supplierCount": 5
    }
  ],
  "sourceState": {
    "basis": "Sales Commission read/design baseline from purchase bills, salespersons, and supplier owner assignments.",
    "limitations": [
      "Period changes, CSV export, supplier assignment, bulk assignment, and persisted commission closing remain disabled until authorization and audit are designed."
    ],
    "writeActionsEnabled": false
  },
  "suppliers": [
    {
      "code": "SUP001",
      "id": "SUP001",
      "name": "Supplier A",
      "phone": "0898765432",
      "salesId": "S001"
    }
  ],
  "totals": {
    "bills": 1,
    "purchaseAmt": 1500000,
    "qty": 60000
  }
}
```

## Commission Formula & Transaction Handoff

### Commission Formula
- **Target Threshold:** 1,000,000 Baht of purchase amount in the period.
- **Eligibility:** A salesperson is eligible for commission only when `purchaseAmt >= 1,000,000`.
- **Commission Calculation:** Calculated in steps of 500,000 Baht.
  `commission = Math.floor(purchaseAmt / 500,000) * 500` if target is met; otherwise `0`.

### Transactional Payable Handoff Design
If commission becomes transactional in the future, the system will implement the following:
1. **Durable Ledger (`sales_commissions`):**
   A new database table will store approved commission results:
   `id`, `period` (e.g. `2026-06`), `salesperson_id`, `total_purchase_amount`, `calculated_commission`, `approved_by`, `approved_at`, `status` (`pending`, `posted`, `paid`), `payment_voucher_ref`.
2. **Monthly Closing / Posting Action:**
   An authorized role (e.g. Financial Manager) executes the "Close Period & Post Commission" action, which:
   - Freezes/snapshots the sales commission record for the period.
   - Automatically writes a corresponding Petty Advance or Payment voucher of type `COMMISSION` payable to the salesperson, creating an AP posting link.
   - Prevents recalculation of commission for that period even if the underlying purchase bills are edited (immutable snapshot).

## Validation / Status Rules

- commission formula must be documented before write/payroll behavior is added
- salesperson ownership source must be explicit: master assignment, PB/SB field, or snapshot
- cancelled/reversed source rows must follow report definition

## Side Effects

- read-only; no commission payout, payment, payroll, PB/SB or master-data writes

## Current Gap

- salesperson ownership source is not yet a target-complete contract
- commission threshold inclusivity needs final confirmation for exact boundary values เช่น 1,500,000 ได้ 1,000 หรือ 1,500
- needs source row drilldown and export definition

## Implementation Checklist

- [x] Verify current API endpoint
- [x] Document no-payroll/no-write boundary
- [x] Inspect and document exact `buildSalesCommission()` response shape when runtime changes
- [x] Define commission formula and payable handoff, if commission will become transactional
- [x] Document commission tier rule from business note
- [ ] Confirm commission threshold inclusivity with customer before transactional/payroll posting

## 2026-07-12 Table consistency checkpoint

`/sales-commission` now tags every overview/drilldown runtime table with `ns-table`, uses shared line tabs for `ยอดรวมตามหมวด`, `ยอดได้คอม`, `ผู้ขาย`, and `รายการสินค้า`, renders one verification table at a time, and substitutes task-grouped dense cards on mobile. Mobile cards separate descriptors in a light grouped box from right-aligned numeric summaries and keep `ราคาหน้าใบ` alongside the other desktop item facts. What is what: each tab selects one existing read-only verification dataset for the chosen salesperson. Why it stays this way: the page should not stack four wide tables, expose ordinal `Table 1-4` titles, or reduce mobile facts; commission formulas, filters, CSV export data, API behavior, permissions, database schema, and DB state are unchanged.
