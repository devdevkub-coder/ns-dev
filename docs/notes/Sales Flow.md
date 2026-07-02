---
title: Sales Flow
aliases:
  - Flow ขาย
  - Sales Flow
  - PO Sell to Sales Bill Flow
tags:
  - ns-scrap-erp
  - sales
  - business-flow
  - decision
status: draft
created: 2026-05-24
updated: 2026-07-02
---

# Sales Flow / Flow ขาย

เอกสารนี้เป็น target flow สำหรับงานขายในระบบ Next app โดยยึด business rule ที่คุยล่าสุด:

- เมื่อกดบันทึก ให้ถือว่าออกเอกสารและมีผลทันที
- ถ้าสินค้าออกจากคลังก่อนเปิดบิล ให้สร้าง `WTO` และให้ระบบมองเป็น `pending_out / รอออก`; ขั้นนี้ยังไม่เขียน `stock_ledger`
- ตัด stock จริงและเขียน `stock_ledger.ref_type = SB` เมื่อสร้าง `Sales Bill` ที่ดึง `WTO` ไปใช้เท่านั้น
- ต้นทุนขายของ Stock SB ใช้ `ต้นทุนเฉลี่ย ณ เวลาขาย` ตอน `SB` consume `WTO pending_out`; ค่า cost ต้องถูก snapshot ลง `stock_ledger.unit_cost/value_out` ของ `SB` แล้วรายงาน COGS อ่านจาก ledger ที่ posted แล้ว ไม่คำนวณย้อนหลังจาก WAC ปัจจุบัน
- เมื่อยกเลิก `SB` หรือรับของคืนจาก `WTO` หลังออกบิลบางส่วน ต้องคืน stock ด้วย unit cost/value เดิมที่ snapshot ตอนออกบิล แล้วให้ WAC ปัจจุบันคำนวณใหม่จาก stock ledger ปัจจุบันรวมรายการคืนเข้า
- ถ้าระหว่างออกบิลกับยกเลิก/รับคืนมี PB/production/adjust เข้า stock เพิ่ม WAC หลังคืนอาจเปลี่ยนจาก WAC ตอนขาย เพราะ value เดิมของ SB ถูกนำกลับไปผสมกับ stock ปัจจุบัน
- ถ้า `SB` ถูกยกเลิกก่อนมีการรับของคืน ให้ reopen `WTO pending_out` กลับมารอออกบิล; ถ้า `WTO` เคยรับของคืนแล้ว ให้ `SB-CANCEL` คืน stock ตรงด้วยต้นทุนเดิมของ `SB` และห้าม reopen `pending_out` ซ้ำ
- `SB` ที่ขายจาก `WTO` อาจแยก SKU ขายจริงไม่ตรงกับ SKU ที่ส่งออกได้ เช่น หน้างานตีว่าสินค้าบางส่วนเป็น SKU อื่น; ระบบต้องเก็บ SKU ขายจริงที่ `sales_bill_lines` แต่ source/cost ยังอ้าง `WTO` เดิมผ่าน `sales_bill_source_allocations.weight_ticket_product_summary_id`
- `WTO` ที่ถูกนำไปใช้ใน `SB` แล้วต้องแก้ไขไม่ได้ เพราะ `SB` ใช้ pending_out/source/cost snapshot จากเอกสารนั้นเป็น audit trail
- `SB` ที่มีรายการรับเงิน Customer active แล้วต้องแก้ไขไม่ได้; ถ้าต้องปรับยอดหลังรับเงิน ต้องไปจัดการ reversal/cancel flow ของ receipt ก่อน ไม่แก้บิลย้อนหลังกระทบ AR
- flow `Pending Sale / PSALE / เบิกออกรอบิล` ถูกถอดจาก target runtime แล้ว ไม่ใช้เป็นเอกสารคั่นกลางระหว่าง WTO กับ SB
- Customer ใน PO Sell, WTO, Sales Bill, Receipt/AR ต้องเลือกจาก active `customer_branches` ของสาขาเอกสารเท่านั้น; ไม่มี mapping ต้องไม่แสดงเป็น option และ API ต้อง reject โดยไม่ fallback เป็นทุกสาขา
- ถ้าต้องออกเอกสารส่งของ/น้ำหนักขาออก ให้ใช้ `ใบส่งของ / Weight Ticket Out` เลขเอกสาร `WTO{branchCode}{YYMM}-NNNN`; ไม่มีเลข `WT` เดี่ยวใน target
- flow หลักของการสร้างบิลขายต้องเป็น `PO Sell -> WTO -> Sales Bill`; หน้า `/sales/bills` เลือก `WTO` แล้วแสดงรายการสินค้าจากใบส่งของเพื่อ allocate เข้า `PO Sell`
- ถ้าปริมาณจาก `WTO` เกิน remaining ของ `PO Sell` ส่วนเกินต้องถูกแยกเป็น `Spot Sale` ไม่ตัด PO เกินยอด
- ในหน้า Sales Bill ข้อความใต้ช่อง `อ้างอิง` ของ PO Sell ต้องคำนวณจากจำนวนที่ row นั้นตัดกับ PO จริง (`น้ำหนักขายสุทธิ`) เพื่อให้ `ใช้ในบิลนี้` และ `คงเหลือ` เปลี่ยนตามการแก้ไขในฟอร์มทันที ไม่ใช้ข้อความ option เดิมที่ hydrate มาจากเอกสารเก่า
- บิลขาย Trading จากบิลรับซื้อยังเป็น target follow-up แต่ไม่ใช่แกน create flow รอบนี้
- บิลขายควรออกจาก `WTO` ที่มี `pending_out` แล้ว เพื่อให้ trace ของออกและต้นทุนย้อนกลับไปที่ใบส่งของได้
- ใบรับเงินต้องตัดลูกหนี้และลง bank statement ใน transaction เดียวกัน
- เอกสารที่มีผลทาง stock/เงินแล้ว ถ้ายกเลิกต้องทำผ่าน reversal/status log ไม่ลบทิ้งเงียบ ๆ

## AR Contract / กติกาลูกหนี้

- `AR / ลูกหนี้` เกิดตอนบันทึก `Sales Bill (SB)` ไม่ใช่ตอน `PO Sell`, `WTO`, หรือ `RCP`
- `PO Sell` เป็น commitment/order ยังไม่ตั้งลูกหนี้
- `WTO` เป็นเอกสารส่งของและ `pending_out`; ยังไม่ตั้งลูกหนี้และยังไม่เขียน stock ledger
- `SB` ตั้งลูกหนี้จาก `sales_bills.total_amount` และเก็บยอดค้างหลักที่ `sales_bills.receivable_balance`
- Customer Advance ที่ allocate เข้า `SB` ต้องลด AR ผ่าน `sales_bills.received_amount` / `sales_bills.receivable_balance` และ allocation facts
- `RCP` ลด AR หลังบันทึกรับเงินจริง โดยยอดที่ตัด AR รวม receipt amount, withholding tax, และ discount ตาม receipt allocation ที่ active
- `/finance/ar` และ report ที่เป็น AR balance ต้องอ่าน `sales_bills.receivable_balance` และ `sales_bills.received_amount` เป็น source หลัก
- `customer_receipt_allocations`, `customer_receipts`, และ legacy `receipts` mirror ใช้เป็น drilldown/audit ว่าเอกสารใดตัดยอด ไม่ใช้ derive balance ทับจาก log ก่อน snapshot ของ `sales_bills`
- AR read model ต้องไม่ derive ยอดค้างรับจาก legacy `receipts` ก่อน เพราะอาจไม่รวม Customer Advance allocation; ให้ใช้ `sales_bills.receivable_balance` เป็น source หลัก

## ภาพรวมเอกสารใน Flow ขาย

| เอกสาร | ใช้ทำอะไร | ผู้ใช้กรอกหลัก ๆ | เลขเอกสารที่เกิด | สถานะแรกหลังบันทึก |
|---|---|---|---|---|
| PO Sell | รับ order / จองขายจาก Customer | สาขา, Customer ที่ผูกกับสาขา, วันส่งมอบ, สินค้า, จำนวน, ราคาขาย | `POS{branchCode}{YYMM}-NNNN` | `เปิดอยู่` |
| ใบส่งของ / WTO | ยืนยันการส่งของและน้ำหนักขาออก | Customer ที่ผูกกับสาขา, สาขา, ทะเบียนรถ, ผู้รับของ, สินค้า, Gross, หัก, Net, รูป/หมายเหตุ | `WTO{branchCode}{YYMM}-NNNN` | `ส่งของแล้ว` |
| บิลขาย | เปิดบิล / ตั้งลูกหนี้ / ยืนยันยอดขาย | WTO อ้างอิง, allocation เข้า PO Sell/Spot Sale, Customer, ราคา, VAT, เครดิตเทอม, มัดจำ, หมายเหตุ | `SB{branchCode}{YYMM}-NNNN` | `เปิดอยู่` |
| ใบรับเงิน | รับเงิน Customer / ตัดลูกหนี้ | บิลที่รับเงิน, บัญชีรับ, วิธีรับ, ยอดรับ, ค่าธรรมเนียม, WHT, ส่วนลด | `RCP{branchCode}{YYMM}-NNNN` | `บันทึกรับเงินแล้ว` |

ตัวอย่างเลขเอกสาร:

| ประเภทเอกสาร | ตัวอย่าง |
|---|---|
| PO Sell | `POS012605-0001` |
| ใบส่งของ / Weight Ticket Out | `WTO012605-0001` |
| บิลขาย | `SB012605-0001` |
| ใบรับเงิน | `RCP012605-0001` |

เลขเอกสาร target ควรเป็น branch-aware เหมือนฝั่งซื้อ เพื่อให้ดูสาขาและช่วงเวลาได้จากเลขเอกสาร

## Use Case Map

หัวข้อนี้ใช้เช็คว่า flow ขายครอบคลุมกรณีธุรกิจอะไรบ้าง และกรณีไหนยังเป็น follow-up

| Use Case | ชื่อกรณี | ครอบคลุมในเอกสารนี้ | Sequence หลัก | สถานะ |
|---|---|---|---|---|
| `UC-SAL-01` | ขายตาม PO Sell แล้วออก WTO ก่อนเปิดบิลขาย | ใช่ | `Flow ขายแบบมี PO Sell ผ่าน WTO` | ครบระดับ business flow |
| `UC-SAL-02` | ขาย Trading โดยอ้างบิลรับซื้อหลายใบ | ใช่ | `Flow บิลขาย Trading` | target follow-up หลัง flow WTO -> SB |
| `UC-SAL-03` | ขายสดแบบออก WTO ก่อนแล้วค่อยเปิดบิล | ใช่ | `Flow ขายสด / Spot Sale แบบ A` | ครบระดับ business flow |
| `UC-SAL-04` | ขายสดแบบเปิดบิลทันที | ใช่ | `Flow ขายสด / Spot Sale แบบ B` | ครบระดับ business flow |
| `UC-SAL-05` | สร้างใบส่งของ / WTO ก่อนออกบิลขาย | ใช่ | `Flow ใบส่งของ / WTO` | ครบระดับ business flow |
| `UC-SAL-06` | ใช้ WTO ไปออกบิลขายแล้วต้องล็อกเอกสาร | ใช่ | `Flow ใบส่งของ / WTO` | ครบระดับ control rule |
| `UC-SAL-07` | บิลขาย 1 ใบอ้างหลายบิลซื้อ Trading | ใช่ | `Flow บิลขาย Trading` | ครบระดับ business rule |
| `UC-SAL-08` | บิลขาย Trading ผูกหรือไม่ผูก PO Sell โดยไม่ตัด stock | ใช่ | `Flow บิลขาย Trading` | ครบระดับ business rule |
| `UC-SAL-09` | รับเงินจากหลายบิลขาย / ตัดลูกหนี้ | ใช่ | `ใบรับเงิน Customer` | ครบระดับ business flow |
| `UC-SAL-10` | หักมัดจำ/เงินล่วงหน้า Customer ตอนออก SB | ใช่ | `บิลขายจาก WTO` | ครบระดับ business rule |

### Use Case Follow-up ที่ยังต้องออกแบบต่อ

| Use Case | เรื่อง | เหตุผล |
|---|---|---|
| `UC-SAL-F01` | allocation ระดับ line ภายใน Sales Bill เดียวเมื่อ 1 WTO แตกเป็นหลาย PO Sell/Spot rows | ต้อง implement ตาม [[Sales Bills Page Flow]]; target ห้ามใช้ 1 WTO ข้ามหลาย Sales Bill |
| `UC-SAL-F02` | guard ห้ามแก้ไข/ยกเลิก WTO เมื่อถูกใช้กับบิลขายแล้วครบทุกกรณี | ต้องผูก usage reference และ reversal policy ให้ครบ |
| `UC-SAL-F03` | print/share ของ WTO | ต้องออกแบบ template พิมพ์, สิทธิ์ใช้งาน, และ audit trail |
| `UC-SAL-F04` | reconciliation/report ระหว่าง WTO, SB, stock ledger, และ receipt | flow หลักมีแล้ว แต่รายงานตรวจสอบและ exception flow ยังต้องแยกเอกสารเพิ่ม |

รายละเอียด legacy ของ `PSALE` อยู่ที่ [[Pending Sale Page Flow]] เพื่อเป็น historical reference เท่านั้น; target ใหม่ห้ามใช้ PSALE สำหรับ flow ใหม่

## Flow ใบส่งของ / WTO

ใช้เมื่อหน้างานต้องออกเอกสารส่งของ/น้ำหนักขาออกก่อนหรือพร้อมกับการติดตามไปออกบิลขาย

| ขั้นตอน | ผู้ใช้ทำอะไร | กรอกอะไรบ้าง | ระบบออกเลขอะไร | สถานะที่เกิด | ผลกระทบ |
|---|---|---|---|---|---|
| 1 | สร้างใบส่งของ / WTO | ประเภท `ขาออก`, เลือก Customer, สาขา, ทะเบียนรถ, สินค้า, คลังต่อรายการ, น้ำหนัก, วิธีหักสิ่งเจือปน, รูปต่อรายการสินค้า/หมายเหตุ | `WTO...` | WTO = `ส่งของแล้ว` / `pending_out` | บันทึกเอกสารส่งของ/ชั่งขาออก, intended warehouse ต่อ line, และ active `pending_out`; ยังไม่เขียน stock ledger |
| 2 | Office ค้นหา WTO | ค้นหาตามเลขเอกสาร, Customer, สาขา, วันที่ | ไม่มี | WTO ยัง `ส่งของแล้ว` | ใช้ติดตามว่ายังไม่ถูกนำไปออกบิลขาย |
| 3 | เปิดบิลขายโดยอ้าง WTO | เลือก Customer, สาขา, WTO ที่เกี่ยวข้อง, ตรวจรายการสินค้า/น้ำหนัก, กรอกจำนวนที่ Customer ชั่ง/ยอมซื้อจริง, หักสิ่งเจือปนเมื่อซื้อครบหรือซื้อเกิน, allocate เข้า PO Sell หรือ Spot Sale, กรอกราคา/VAT/เครดิตเทอม/มัดจำ | `SB...` | Sales Bill = `เปิดอยู่` | ตั้งลูกหนี้/AR จากน้ำหนักขายสุทธิ, consume hold และสร้าง stock-out ledger โดยอ้าง WTO/warehouse ตามน้ำหนัก source ที่ส่งออก, snapshot WAC ณ ตอนออกบิล, บันทึก usage ของ WTO, ตัด PO Sell ตาม line allocation และหัก customer advance ถ้ามี |
| 4 | ระบบอัปเดต WTO | ไม่ต้องกรอกเพิ่ม | ไม่มี | WTO = `ออกบิลแล้ว` หรือ `ออกบิลบางส่วน/รอรับของคืน` | กันการแก้ไข/ยกเลิก WTO; ถ้าซื้อไม่ครบต้องคง remaining pending_out ไว้เพื่อรับของคืน ไม่ให้นำไปเปิด SB ใบอื่นเงียบ ๆ |
| 5 | รับของคืนเมื่อซื้อไม่ครบ | กด `รับของคืน`, กรอกน้ำหนักที่ชั่งกลับมาจริง, หมายเหตุ แล้วกดยืนยัน | เอกสาร/ledger return ตาม design | pending_out ถูกคืนหรือปิดตามน้ำหนักจริง | คืน stock เข้า available ตามน้ำหนักชั่งจริง โดยใช้ WAC ที่ snapshot ไว้ตอนออกบิลขาย; diff ระหว่างค้างตามระบบกับคืนจริงต้องเก็บ audit |
| 6 | รับเงิน Customer | เลือกบิลขาย, บัญชีรับ, วิธีรับ, ยอดรับ, ค่าธรรมเนียม, WHT, ส่วนลด | `RCP...` | Receipt = `บันทึกรับเงินแล้ว` | บันทึกเงินเข้าและตัดลูกหนี้ |

กติกาสำคัญของ WTO:

- `WTO` เป็นเอกสารขาออกต้นทางของฝั่งส่งของ ไม่ใช่บิลขาย
- เมื่อ `WTO` ถูกนำไปใช้เปิดบิลขายแล้ว ให้ถือว่าเอกสารถูกใช้งานแล้ว
- Target write path ต้องรองรับ `ออกบิลบางส่วน/รอรับของคืน` เมื่อ Customer ซื้อไม่ครบตามน้ำหนักที่ส่งออก
- `WTO` หนึ่งใบห้ามถูกใช้ข้ามหลาย Sales Bill
- `WTO` ที่ถูกใช้แล้วต้อง `แก้ไขไม่ได้` และ `ยกเลิกไม่ได้`
- `WTO` ที่ออกบิลบางส่วนต้องใช้ action `รับของคืน` สำหรับ remaining `pending_out`; remaining นี้ห้ามนำไปเปิดบิลขายใบอื่น
- ตอน `รับของคืน` ต้องให้ผู้ใช้กรอกน้ำหนักที่ชั่งกลับมาจริงและยืนยันก่อน ระบบจึงคืน stock เข้า available
- `SB` ที่มี `customer_receipt_allocations` active แล้วต้อง `แก้ไขไม่ได้` และ `ยกเลิกไม่ได้` เพื่อไม่ให้ยอดรับเงิน/ลูกหนี้และ audit trail ของ receipt เพี้ยน; ถ้าข้อมูลเก่ามีแต่ legacy receipt ต้อง repair/migrate เข้าสัญญาใหม่ ไม่ใช้ runtime fallback
- ต้นทุนรับคืนต้องใช้ WAC/cost per unit ณ ตอนออกบิลขายที่ snapshot ไว้บน `SB`/stock ledger ไม่ใช้ WAC ปัจจุบันหรือราคาขาย

### WTO -> SB Source Allocation Contract

เมื่อเปิด `SB` จาก `WTO` ให้แยกข้อมูลออกเป็น 2 แกน:

| แกนข้อมูล | ตารางหลัก | ความหมาย |
|---|---|---|
| สินค้าที่ขายจริง | `sales_bill_lines.product_id/product_code_snapshot/product_name_snapshot` | SKU ที่ลูกค้าตี/ยอมซื้อจริงในบิลขาย ใช้กับราคา, ส่วนลด, VAT, GP และเอกสารขาย |
| แหล่ง stock/cost | `sales_bill_source_allocations.weight_ticket_product_summary_id` | Summary ของสินค้าใน `WTO` เดิมที่ถูกกันเป็น `pending_out` และใช้เป็นต้นทุน/COGS source |

กติกา:

- ถ้าแตกแถวจาก `WTO` ใน `SB` แถวใหม่ default เป็นสินค้าเดิม แต่ผู้ใช้เปลี่ยน SKU ขายจริงได้
- การเปลี่ยน SKU ใน `SB` ไม่แก้ `WTO`, `stock_holds`, หรือ stock/cost source เดิมย้อนหลัง
- `sales_bill_source_allocations.source_line_no` หมายถึง line ของเอกสารต้นทางจริงเท่านั้น; allocation ระดับ summary ที่ไม่มี line ชัดเจนให้เป็น `null` ไม่ใช้เลขแถวของ `SB`
- `sales_bill_source_allocations.meta.deliverySummaryId` ยังเป็น outward id สำหรับ form snapshot/read UI แต่ FK จริงในการ trace source คือ `weight_ticket_product_summary_id`
- หลังรับคืนแล้ว WAC ปัจจุบันของ bucket อาจเปลี่ยน เพราะต้นทุนเดิมของ SB ถูกคืนเข้าไปผสมกับ stock ปัจจุบันที่อาจมี PB/production/adjust เกิดขึ้นระหว่างทาง
- `WTO` ที่ยังไม่ถูกใช้เปิดบิลขายยังคงอยู่สถานะ `ส่งของแล้ว` และยังอนุญาตให้แก้ไข/ยกเลิกได้ตามสิทธิ์
- ถ้าแก้ไขก่อนถูกใช้ ต้อง rebuild `pending_out`
- ถ้ายกเลิกก่อนถูกใช้ ต้อง release `pending_out`
- ไม่ต้อง reverse stock ledger เพราะ `WTO` ไม่ใช่ movement owner แต่ต้องบันทึก status/timeline ไม่ลบเอกสารเงียบ ๆ
- เมื่อ `SB` ยกเลิก ต้อง append `released_from_sales_bill` ใน `weight_ticket_usage_logs`, append `SB-CANCEL`, และบันทึก log คืน PO Sell ผ่าน `po_sell_allocation_logs`; คืนสถานะ WTO เป็น `ส่งของแล้ว` เฉพาะกรณียังไม่เคยรับของคืน ถ้าเคยรับคืนแล้วให้คง timeline รับคืนและคืน stock ตรงจาก `SB-CANCEL`

## Flow ขายแบบมี PO Sell ผ่าน WTO

| ขั้นตอน | ผู้ใช้ทำอะไร | กรอกอะไรบ้าง | ระบบออกเลขอะไร | สถานะที่เกิด | ผลกระทบ |
|---|---|---|---|---|---|
| 1 | สร้าง PO Sell | สาขา, Customer, ช่องทางขาย, วันส่งมอบ, สินค้า, จำนวน, ราคาขาย, หมายเหตุ | `POS...` | PO Sell = `เปิดอยู่` | เก็บยอดจองขายและยอดคงเหลือรอเบิก/รอออกบิล |
| 2 | เตรียมส่งของให้ Customer | ยังไม่กรอกเพิ่ม | ไม่มี | PO Sell ยัง `เปิดอยู่` | รอเบิกสินค้าจริง |
| 3 | ออกใบส่งของ / WTO จากการส่งจริง | เลือก Customer, สาขา, ทะเบียนรถ, สินค้า, คลังต่อรายการ, น้ำหนัก/จำนวนจริง, รูป/หมายเหตุ | `WTO...` | WTO = `ส่งของแล้ว` / `pending_out` | บันทึกหลักฐานส่งของ/น้ำหนักจริง, intended warehouse ต่อ line, และ active `pending_out`; ยังไม่เขียน stock ledger |
| 4 | เปิดบิลขายจาก WTO | เลือก WTO ที่ยังไม่ถูกออกบิล, ตรวจรายการสินค้า, allocate เข้า PO Sell หรือ Spot Sale, กรอกราคา, VAT, เครดิตเทอม, มัดจำ, หมายเหตุ | `SB...` | Sales Bill = `เปิดอยู่` | ตั้งลูกหนี้/AR, consume hold, สร้าง stock-out ledger โดยอ้าง WTO/warehouse, ตัด PO Sell ตามยอดที่ allocate, ส่วนเกินเป็น Spot Sale |
| 5 | ระบบอัปเดต WTO | ไม่ต้องกรอกเพิ่ม | ไม่มี | WTO = `ออกบิลแล้ว` | กันการใช้ WTO ซ้ำและทำ usage log |
| 6 | ระบบอัปเดต PO Sell จากบิลขาย | ไม่ต้องกรอกเพิ่ม | ไม่มี | PO Sell = `ออกบิลบางส่วน` หรือ `ออกบิลแล้ว` | ปิด flow เมื่อออกบิลครบ; ไม่ปิดจากยอด Spot Sale |
| 7 | รับเงิน Customer | เลือกบิลค้างรับ, บัญชีรับ, วิธีรับ, ยอดรับ, ค่าธรรมเนียม, WHT, ส่วนลด, หมายเหตุ | `RCP...` | Receipt = `บันทึกรับเงินแล้ว` | บันทึกเงินเข้าและตัดลูกหนี้ |
| 8 | ระบบอัปเดตบิลขาย | ไม่ต้องกรอกเพิ่ม | ไม่มี | Sales Bill = `รับบางส่วน` หรือ `รับครบ` | ยอดค้างรับลดลง |

### ตัวอย่าง Flow มี PO แบบครบ

```text
POS012605-0001 เปิดอยู่
-> WTO012605-0001 ส่งของแล้ว
-> SB012605-0001 เปิดอยู่
-> WTO012605-0001 ออกบิลแล้ว
-> POS012605-0001 ออกบิลแล้ว
-> RCP012605-0001 บันทึกรับเงินแล้ว
-> SB012605-0001 รับครบ
```

### ตัวอย่าง Flow มี PO แบบส่งบางส่วนตาม PO

```text
POS012605-0001 เปิดอยู่
-> WTO012605-0001 ส่งของแล้ว
-> SB012605-0001 เปิดอยู่
-> WTO012605-0001 ออกบิลแล้ว
-> POS012605-0001 ออกบิลบางส่วน
```

ถ้า Customer รับของงวดถัดไป ให้เกิด `WTO` และ `SB` รอบใหม่จน PO Sell ครบหรือถูกปิดส่งไม่ครบ

## Flow บิลขาย Trading

ใช้เมื่อบิลขายต้องอ้างอิงต้นทางจากบิลรับซื้อ Trading ก่อน แล้วค่อยออกบิลขายให้ Customer โดยหนึ่งบิลขายเลือกบิลรับซื้อได้หลายใบ

| ขั้นตอน | ผู้ใช้ทำอะไร | กรอกอะไรบ้าง | ระบบออกเลขอะไร | สถานะที่เกิด | ผลกระทบ |
|---|---|---|---|---|---|
| 1 | เปิดบิลขาย Trading | เลือกประเภท `Trading`, Customer, สาขา, เงื่อนไข VAT/เครดิตเทอม | ยังไม่ออกเลขจนบันทึก | Draft ในหน้าจอ | เตรียมกรองบิลรับซื้อและ PO Sell ที่เกี่ยวข้อง |
| 2 | เลือกบิลรับซื้อ Trading | เลือกบิลรับซื้อได้หลายใบที่ยังเหลือยอดสำหรับขาย/จับคู่ | ไม่มี | Draft | ระบบดึงรายการสินค้า จำนวน/น้ำหนัก ราคา และต้นทุนจากบิลรับซื้อมาเป็นรายการตั้งต้น |
| 3 | ตรวจ/แก้รายการขาย | ปรับจำนวน/น้ำหนักที่จะขาย ราคา และเลือก PO Sell ที่ต้องตัดถ้ามี | ไม่มี | Draft | รายการ Trading ใช้สำหรับ Trading matching/COGS ไม่ตัด stock |
| 4 | เลือกผูก PO Sell ถ้ามี | เลือก PO Sell ต่อ line หรือปล่อยเป็นไม่ผูก PO Sell | ไม่มี | Draft | ถ้าผูก PO Sell ต้องตัดยอด commitment/remaining ของ PO Sell ระดับรายการ แต่ยังไม่ตัด stock |
| 5 | บันทึกบิลขาย | ตรวจยอดรวม VAT ส่วนลด เครดิตเทอม และหมายเหตุ | `SB...` | Sales Bill = `เปิดอยู่` | ตั้งลูกหนี้/AR, บันทึก allocation ไปบิลรับซื้อ/Trading Matching, และตัด PO Sell ตาม line allocation ถ้ามี โดยไม่เขียน stock ledger สำหรับ Trading |
| 6 | รับเงิน Customer | เลือกบิลค้างรับ, บัญชีรับ, วิธีรับ, ยอดรับ, ค่าธรรมเนียม, WHT, ส่วนลด | `RCP...` | Receipt = `บันทึกรับเงินแล้ว` | บันทึกเงินเข้าและตัดลูกหนี้ |

Target rule สำคัญสำหรับ Trading sale:

- บิลขาย Trading ต้องส่งรายการไปจับคู่กับบิลรับซื้อ Trading เพื่อให้ระบบรู้ต้นทุน/ยอดคงเหลือที่ขายได้
- เลือกบิลรับซื้อได้หลายใบ และหนึ่งบิลรับซื้อสามารถถูกนำไปขายหลายบิลขายได้จนยอดคงเหลือหมด
- บิลรับซื้อ Trading ที่นำมา match จะผูกหรือไม่ผูก PO Buy ก็ได้
- บิลขาย Trading สามารถผูกหรือไม่ผูก PO Sell ได้
- ถ้าผูก PO Sell ต้องตัดยอด PO Sell remaining/commitment ระดับ line item
- การตัด/คืน PO Sell จาก `SB` ต้องมี `po_sell_allocation_logs` แยกจาก allocation fact เพื่อให้ timeline/audit อ่านย้อนหลังได้ ไม่เดาจาก status string
- รายการสินค้าในบิลขาย Trading ไม่ต้องตัด stock และต้องไม่เขียน stock ledger แม้สินค้าเป็นทองเหลือง/ทองแดงหรือมี PO Sell
- ทองเหลือง/ทองแดงที่เป็น Trading ให้ไป Trading Matching เพื่อจับคู่ขาย/ตัดขายนอกระบบ ไม่ตัด Stock ตัวเอง
- ถ้าเลือก PO Sell แล้ว จำนวน/น้ำหนักที่ตัดต้องไม่เกินยอด PO Sell ที่ยังไม่ออกบิล/ยังไม่ถูกตัด
- ถ้ามีสินค้าบริษัทจาก Stock ที่ต้องตัด stock จริง ให้ใช้ WTO source ใน Sales Bill เท่านั้น ไม่ปะปนเป็น stock-out line ที่ไม่มี WTO ใน Sales Bill Trading

## Flow ขายสด / Spot Sale

Spot Sale มีได้ 2 แบบ ขึ้นกับการทำงานหน้างานจริง

### แบบ A: ออก WTO ก่อน แล้วค่อยเปิดบิล

ใช้เมื่อสินค้าถูกเอาออกจากคลังก่อน แต่เอกสารขายยังไม่เปิดทันที

| ขั้นตอน | ผู้ใช้ทำอะไร | กรอกอะไรบ้าง | ระบบออกเลขอะไร | สถานะที่เกิด | ผลกระทบ |
|---|---|---|---|---|---|
| 1 | ออกใบส่งของ / WTO แบบ Spot | Customer ถ้ารู้แล้ว, สาขา, คลังต่อรายการ, สินค้า, น้ำหนัก/จำนวน, หมายเหตุ | `WTO...` | WTO = `ส่งของแล้ว` / `pending_out` | สร้าง `pending_out / รอออก`; ยังไม่เขียน stock ledger |
| 2 | เปิดบิลขายจาก WTO | เลือก WTO, ตรวจ Customer/สินค้า/จำนวน, กรอกราคาจริง, VAT, เครดิตเทอม, หมายเหตุ | `SB...` | Sales Bill = `เปิดอยู่` | ตั้งลูกหนี้/AR, consume `pending_out`, และเขียน `stock_ledger.ref_type = SB` |
| 3 | ระบบอัปเดต WTO | ไม่ต้องกรอกเพิ่ม | ไม่มี | WTO = `ออกบิลแล้ว` | กันออกบิลซ้ำ |
| 4 | รับเงิน Customer | เลือกบิลขาย, บัญชีรับ, วิธีรับ, ยอดรับ, ค่าธรรมเนียม, WHT, ส่วนลด | `RCP...` | Receipt = `บันทึกรับเงินแล้ว` | บันทึกเงินเข้าและตัดลูกหนี้ |
| 5 | ระบบอัปเดตบิลขาย | ไม่ต้องกรอกเพิ่ม | ไม่มี | Sales Bill = `รับบางส่วน` หรือ `รับครบ` | ยอดค้างรับลดลง |

### แบบ B: เปิดบิลทันที ไม่ผ่าน WTO

ไม่ใช่ flow หลักของ stock sale แล้ว ใช้ได้เฉพาะกรณีที่ไม่ต้องตัด stock จริงหรือเป็น flow อื่นที่ได้รับอนุมัติ; stock sale target ต้องมี WTO ก่อน

| ขั้นตอน | ผู้ใช้ทำอะไร | กรอกอะไรบ้าง | ระบบออกเลขอะไร | สถานะที่เกิด | ผลกระทบ |
|---|---|---|---|---|---|
| 1 | เปิดบิลขายตรง | Customer, สาขา, คลัง, ช่องทางขาย, สินค้า, จำนวน, ราคา, VAT, เครดิตเทอม, หมายเหตุ | `SB...` | Sales Bill = `เปิดอยู่` | ตั้งลูกหนี้และตัด stock ใน transaction เดียวกัน |
| 2 | รับเงิน Customer | เลือกบิลขาย, บัญชีรับ, วิธีรับ, ยอดรับ, ค่าธรรมเนียม, WHT, ส่วนลด | `RCP...` | Receipt = `บันทึกรับเงินแล้ว` | บันทึกเงินเข้าและตัดลูกหนี้ |
| 3 | ระบบอัปเดตบิลขาย | ไม่ต้องกรอกเพิ่ม | ไม่มี | Sales Bill = `รับบางส่วน` หรือ `รับครบ` | ยอดค้างรับลดลง |

Target rule: ถ้าของออกจากคลังก่อนเปิดบิล ให้ใช้แบบ A โดยให้ WTO สร้าง `pending_out` ก่อน และให้ Sales Bill เป็นจุดตัด stock จริง

## มุมเมนูที่ใช้ในแต่ละขั้นตอน

หัวข้อนี้แยกจาก flow หลักเพื่อให้ดูเร็วว่าแต่ละ step ต้องไปทำที่เมนูไหน ส่วน step ที่เป็นระบบอัตโนมัติไม่ต้องเข้าหน้าเอง

### Flow ขายแบบมี PO Sell ผ่าน WTO

| Step | ทำอะไร | เมนูที่ใช้ | Route |
|---|---|---|---|
| 1 | สร้าง PO Sell | `Dual Costing (จองดีล) > PO Sell (จองขาย)` | `/sales/po-sell` |
| 2 | เตรียมส่งของให้ Customer | ไม่ต้องเข้าระบบ | - |
| 3 | ออกใบส่งของ / WTO | `รายการประจำวัน > ชั่งสินค้า / รับ-ส่งของ` | `/daily/weight-tickets` |
| 4 | เปิดบิลขายจาก WTO และ allocate เข้า PO Sell/Spot Sale | `รายการประจำวัน > บิลขาย` | `/sales/bills` |
| 5 | ระบบอัปเดต WTO จากบิลขาย | ระบบอัตโนมัติ | - |
| 6 | ระบบอัปเดต PO Sell จากบิลขาย | ระบบอัตโนมัติ | - |
| 7 | รับเงิน Customer | `รายการประจำวัน > รับเงิน Customer` | `/sales/receipts` |
| 8 | ระบบอัปเดตบิลขาย | ระบบอัตโนมัติ | - |

หมายเหตุ: สำหรับ create flow หลักของ `/sales/bills` ต้องเลือก `WTO` ก่อนเสมอ รายละเอียดหน้าอยู่ที่ [[Sales Bills Page Flow]]

### Flow บิลขาย Trading

| Step | ทำอะไร | เมนูที่ใช้ | Route |
|---|---|---|---|
| 1 | เปิดบิลขาย Trading และเลือกบิลรับซื้อหลายใบ | `รายการประจำวัน > บิลขาย` | `/sales/bills` |
| 2 | ระบบเติมรายการสินค้าจากบิลรับซื้อ | ระบบอัตโนมัติในหน้า `บิลขาย` | - |
| 3 | เพิ่มรายการจาก stock ถ้าต้องขายเพิ่ม | `รายการประจำวัน > บิลขาย` | `/sales/bills` |
| 4 | เลือก PO Sell เพื่อตัดยอดขายตามรายการ | `รายการประจำวัน > บิลขาย` | `/sales/bills` |
| 5 | ระบบบันทึกบิลขาย, Trading allocation handoff, และ PO Sell cut ถ้ามีการผูก | ระบบอัตโนมัติ | ไม่เขียน stock ledger สำหรับ Trading sale |
| 6 | รับเงิน Customer | `รายการประจำวัน > รับเงิน Customer` | `/sales/receipts` |

### Flow ขายสด / Spot Sale แบบออก WTO ก่อน

| Step | ทำอะไร | เมนูที่ใช้ | Route |
|---|---|---|---|
| 1 | ออกใบส่งของ / WTO แบบ Spot | `รายการประจำวัน > ชั่งสินค้า / รับ-ส่งของ` | `/daily/weight-ticket-list` |
| 2 | เปิดบิลขายจาก WTO | `รายการประจำวัน > บิลขาย` | `/sales/bills` |
| 3 | ระบบอัปเดต WTO | ระบบอัตโนมัติ | - |
| 4 | รับเงิน Customer | `รายการประจำวัน > รับเงิน Customer` | `/sales/receipts` |
| 5 | ระบบอัปเดตบิลขาย | ระบบอัตโนมัติ | - |

### Flow ขายสด / Spot Sale แบบเปิดบิลทันที

| Step | ทำอะไร | เมนูที่ใช้ | Route |
|---|---|---|---|
| 1 | เปิดบิลขายตรง | `รายการประจำวัน > บิลขาย` | `/sales/bills` |
| 2 | รับเงิน Customer | `รายการประจำวัน > รับเงิน Customer` | `/sales/receipts` |
| 3 | ระบบอัปเดตบิลขาย | ระบบอัตโนมัติ | - |

## มุมสิทธิ์และสาขา

หัวข้อนี้ยังเป็นข้อกำหนดเบื้องต้น เพราะ role matrix และ branch-scope enforcement ยังต้อง finalize แยกต่างหาก

| เรื่อง | กติกาเบื้องต้น |
|---|---|
| เมนูที่ใช้ | ตารางเมนูด้านบนบอก functional path เท่านั้น ไม่ได้แปลว่าทุก role จะเห็นหรือทำได้ |
| สิทธิ์ role | ต้องอิง role/permission matrix จาก `app_roles`, `app_permissions`, `app_role_permissions`, และ `app_user_roles` |
| สิทธิ์สาขา | ต้องอิง `app_user_branch_access`; `Admin`/`Owner` อาจเห็นทุกสาขา แต่ role อื่นต้องเห็นเฉพาะสาขาที่ได้รับสิทธิ์ |
| ความหมายของ `สาขา` | ใน flow นี้หมายถึงสาขาของเอกสารและเลขเอกสาร ไม่ใช่สิทธิ์ในการเข้าถึงโดยอัตโนมัติ |
| ตัวเลือก `ทุกสาขา` | ต้องหมายถึงทุกสาขาที่ user มีสิทธิ์ ไม่ใช่ทุกสาขาในระบบ |
| ระบบอัตโนมัติ | step ที่เป็นระบบอัตโนมัติต้อง enforce ใน API/server transaction ไม่พึ่ง logic ฝั่ง browser |
| งานข้ามสาขา | ถ้าต้องเบิก/ขาย/รับเงิน/ลง stock ข้ามสาขา ต้องมี rule เฉพาะก่อน implement |

## รายละเอียดข้อมูลที่กรอกในแต่ละหน้า

### 1. PO Sell

ผู้ใช้กรอก:

| Field | จำเป็น | หมายเหตุ |
|---|---:|---|
| สาขา | ใช่ | ใช้กำหนดเลขเอกสารและ branch scope |
| Customer | ใช่ | ลูกค้าที่จอง/สั่งซื้อ |
| ช่องทางขาย | ไม่ | ถ้ามี |
| วัน PO | ใช่ | วันที่สร้างเอกสาร |
| วันส่งมอบ | ไม่ | ใช้จัดลำดับ PO ค้างส่ง |
| สินค้า | ใช่ | รองรับหลายรายการ |
| จำนวน | ใช่ | ใช้เป็นยอดตั้งต้นของ PO Sell |
| ราคาขาย/หน่วย | ใช่ | ใช้คำนวณมูลค่า PO Sell |
| หมายเหตุ | ไม่ | ข้อมูลประกอบ |

ระบบสร้าง/คำนวณ:

| Field | ค่า |
|---|---|
| เลขเอกสาร | `POS{branchCode}{YYMM}-NNNN` |
| จำนวนรวม | รวมจากรายการสินค้า |
| มูลค่ารวม | จำนวน x ราคาขาย |
| จำนวนคงเหลือรอเบิก | เริ่มเท่ากับจำนวนรวม |
| จำนวนคงเหลือรอออกบิล | เริ่ม 0 จนมีการเบิกจริง |
| สถานะ | `เปิดอยู่` |

### 2. ใบเบิกออกรอบิล / Pending Sale

สถานะ target ล่าสุด: **ถอดออกจาก runtime flow แล้ว**

- ไม่ใช้ `/sales/stock-issue` สำหรับเอกสารใหม่
- ไม่สร้าง `PSALE` / `PSALE-CANCEL` ใน target write path
- ไม่ให้ Sales Bill เปิดจาก `pendingStockIssueId` หรือ `fromPsale...`
- หากของออกก่อนเปิดบิล ให้ใช้ `WTO` เพื่อสร้าง `pending_out / รอออก`
- เมื่อออก `Sales Bill` จาก `WTO` แล้วจึง consume `pending_out` และเขียน `stock_ledger.ref_type = SB`

เอกสาร [[Pending Sale Page Flow]] เก็บไว้เฉพาะ historical/legacy reference ว่าเคยมี flow PSALE แบบไหน และทำไม target ใหม่ไม่ใช้แล้ว

### 3. บิลขาย

ผู้ใช้เริ่ม flow หลักจาก `WTO`; flow อื่นเป็น follow-up:

| ทางเข้า | ใช้เมื่อไหร่ | ผลต่อ stock |
|---|---|---|
| เปิดจาก WTO | ออกใบส่งของ/น้ำหนักขาออกและจอง stock แล้ว | consume hold และตัด stock ตอนบันทึก SB โดยอ้าง intended warehouse จาก WTO |
| เปิดจาก Pending Sale | ไม่ใช่ target runtime แล้ว | reject payload เก่าและให้เปิดจาก WTO แทน |
| เปิดบิลขายตรง | ไม่ใช่ flow หลักสำหรับ stock sale | ต้องใช้ WTO ก่อนเพื่อควบคุม pending_out/warehouse/source |
| เปิดบิลขาย Trading | follow-up ขายแบบจับคู่ต้นทุน จะผูกหรือไม่ผูก PO Sell ก็ได้ | ไม่ตัด stock; ถ้าผูก PO Sell ให้ตัดเฉพาะยอด commitment/remaining ของ PO Sell |

ผู้ใช้กรอก/ตรวจ:

| Field | จำเป็น | แหล่งข้อมูล | หมายเหตุ |
|---|---:|---|---|
| WTO อ้างอิง | ใช่ใน flow หลัก | เลือก WTO | ต้องยังไม่ถูกออกบิล และ Customer/สาขาตรงกัน |
| Pending Sale อ้างอิง | ไม่รองรับใน target | - | API reject `pendingStockIssueId/fromPsale...` |
| บิลรับซื้ออ้างอิง | เฉพาะ Trading sale | เลือกได้หลายบิลรับซื้อ | ใช้เติมรายการสินค้าและต้นทุนตั้งต้น ต้องยังเหลือยอดขาย/จับคู่ได้ |
| PO Sell allocation | เฉพาะยอดที่ตัด PO | เลือกต่อ line จาก PO Sell remaining | ห้ามตัดเกิน remaining; ส่วนเกินเป็น Spot Sale |
| Customer | ใช่ | search dropdown; ดึงจาก WTO/PO หรือเลือกเอง | ลูกหนี้ ต้องค้นหาได้จากรหัส/ชื่อ |
| สาขา | ใช่ | ดึงจาก WTO หรือกรอก | ใช้กำหนดเลขบิล |
| คลัง | เฉพาะ WTO-backed stock line | ดึงจาก intended warehouse ใน WTO | Trading sale ไม่ใช้คลังเพื่อตัด stock |
| ช่องทางขาย | ไม่ | จาก PO/Customer หรือกรอก | ถ้ามี |
| สินค้า | ใช่ | ดึงจาก WTO หรือบิลรับซื้อ Trading | ต้องตรงกับยอดที่จะออกบิล |
| แหล่งรายการสินค้า | ใช่ | ระบบ derive หรือผู้ใช้เลือก | `WTO_PO_SELL`, `WTO_SPOT_SALE`, `PURCHASE_BILL`, หรือ source equivalent เพื่อคุมผล stock/cost |
| จำนวน | ใช่ | ดึงจาก WTO/บิลรับซื้อ | ห้ามเกินยอด WTO, บิลรับซื้อ, หรือ PO Sell ที่ยังตัดได้ตาม source |
| ราคาขาย | ใช่ | จาก PO/ราคาคาด หรือกรอก | เป็นยอดจริงในบิล |
| ส่วนลดรายการ | ไม่ | กรอก | ถ้ามี |
| ส่วนลดท้ายบิล | ไม่ | กรอก | ถ้ามี |
| VAT | ใช่ | เลือก | ไม่มี VAT / VAT แยก / VAT รวม |
| เลขใบกำกับภาษี | เฉพาะ VAT | กรอก | ถ้าออกแล้ว |
| วันที่ใบกำกับภาษี | เฉพาะ VAT | กรอก | ถ้าออกแล้ว |
| เครดิตเทอม | ไม่ | จาก Customer หรือกรอก | ใช้คำนวณวันครบกำหนด |
| มัดจำ/เงินล่วงหน้า Customer | ไม่ | เลือกจากยอด available | หักจากยอดลูกหนี้สุทธิ ห้ามเกินยอดบิลหลัง VAT |
| หมายเหตุ | ไม่ | กรอก | ข้อมูลประกอบ |

ช่องที่ไม่อยู่ใน SB create/edit:

- `เลขที่อ้างอิง` แบบ free-text ให้ตัดออก; reference ของ SB มาจาก `WTO` และ `PO Sell allocation`
- `ทะเบียนรถ` ให้ตัดออกจาก form SB; ถ้าต้องดู ให้แสดง read-only จาก source `WTO`

ระบบสร้าง/คำนวณ:

| Field | ค่า |
|---|---|
| เลขเอกสาร | `SB{branchCode}{YYMM}-NNNN` |
| สถานะ SB | `เปิดอยู่` |
| Subtotal | รวมยอดรายการ |
| VAT amount | คำนวณจาก VAT config ณ วันออกบิล |
| Total amount | ยอดสุทธิ |
| Customer advance allocated | ยอดมัดจำ/เงินล่วงหน้า Customer ที่เลือกหัก |
| Received amount | เริ่ม 0 |
| Receivable balance | เริ่มเท่ากับ total amount - customer advance allocated |
| Due date | วันที่บิล + credit term |
| Gross profit | ยอดขายก่อน VAT - ต้นทุนที่ snapshot ไว้ |
| Purchase Bill sold/matched qty | เพิ่มตามจำนวนที่ออกบิล ถ้ามาจากบิลรับซื้อ Trading |
| Stock ledger | สร้าง stock out สำหรับ SB ที่อ้าง WTO เท่านั้นใน stock-sale target; Trading PB-derived lines ไม่เขียน stock ledger |
| PO Sell billed qty | เพิ่มตามจำนวนที่ allocate เข้า PO Sell จาก WTO/SB line |
| WTO billed qty | เพิ่มตามจำนวนที่ถูกใช้ใน SB |

### 4. ใบรับเงิน Customer

ผู้ใช้กรอก:

| Field | จำเป็น | หมายเหตุ |
|---|---:|---|
| Customer | ใช่ | ใช้กรองบิลค้างรับ |
| บิลขาย | ใช่ | เลือกได้หลายบิลถ้า flow รองรับ |
| บัญชีรับ | ใช่ | เงินสด/ธนาคาร |
| วิธีรับเงิน | ใช่ | เช่น โอน, เงินสด, เช็ค |
| ยอดรับ | ใช่ | ต้องไม่เกินยอดค้างรับ |
| ค่าธรรมเนียมธนาคาร | ไม่ | หักจากเงินเข้า bank statement |
| WHT | ไม่ | ถ้ามี |
| ส่วนลด | ไม่ | ถ้ามี |
| หมายเหตุ | ไม่ | ข้อมูลประกอบ |

ระบบสร้าง/คำนวณ:

| Field | ค่า |
|---|---|
| เลขเอกสาร | `RCP{branchCode}{YYMM}-NNNN` |
| สถานะ Receipt | `บันทึกรับเงินแล้ว` |
| Net cash in | ยอดรับ - bank fee - WHT |
| Sales bill received amount | เพิ่มจากยอดรับ + WHT + ส่วนลด |
| Sales bill receivable balance | ลดจากยอดที่รับ/หัก |
| Bank statement | สร้างเงินเข้าอ้างอิง `RCP` |

AR contract:

- `AR / ลูกหนี้` เกิดตอนบันทึก `Sales Bill (SB)` ไม่ใช่ตอน `RCP`
- `WTO` ยังไม่ทำให้เกิด AR เพราะเป็นเพียง pending_out / รอออก
- `RCP` ใช้ลด AR โดยเพิ่ม `sales_bills.received_amount` และลด `sales_bills.receivable_balance`
- Customer Advance ที่ allocate เข้า `SB` ต้องลด AR ตั้งแต่ตอนสร้าง `SB` โดยอัปเดต `sales_bills.receivable_balance` และเขียน allocation facts
- หน้า `/finance/ar` และ report ที่เป็น AR balance ต้องอ่าน `sales_bills.receivable_balance` เป็น source หลัก; `customer_receipt_allocations` / `receipts` ใช้แสดงที่มาของการตัดยอดเท่านั้น

## สถานะภาษาไทย

### ใบส่งของ / WTO

| สถานะ | ใช้เมื่อไหร่ |
|---|---|
| `ส่งของแล้ว` | สร้าง WTO แล้ว แต่ยังไม่ถูกใช้เปิดบิลขาย |
| `ออกบิลแล้ว` | WTO ถูกนำไปใช้เปิดบิลขายครบทั้งเอกสารใน `SB` เดียวแล้ว |
| `ยกเลิก` | ยกเลิกเอกสารก่อนถูกใช้ หรือผ่าน reversal ตาม policy ที่อนุญาต |

### PO Sell

| สถานะ | ใช้เมื่อไหร่ |
|---|---|
| `เปิดอยู่` | สร้าง PO Sell แล้ว ยังไม่มีการเบิกครบ |
| `รอออก/รอเปิดบิล` | มี WTO/pending_out ที่เกี่ยวข้อง แต่ยังไม่ออก SB |
| `ออกบิลบางส่วน` | มี SB บางส่วนแล้ว |
| `ออกบิลแล้ว` | ออกบิลครบตาม PO แล้ว |
| `ปิดส่งไม่ครบ` | ปิด PO โดยส่งไม่ครบ และมีเหตุผลประกอบ |
| `ยกเลิก` | ยกเลิก PO ก่อน flow จบ หรือผ่าน reversal ที่ครบ |

### ใบเบิกออกรอบิล

ไม่มีสถานะ target runtime ใหม่แล้ว เพราะ `/sales/stock-issue` ถูกถอดออกจาก flow ใหม่ทั้งหมด

### บิลขาย

| สถานะ | ใช้เมื่อไหร่ |
|---|---|
| `เปิดอยู่` | เปิดบิลแล้ว ตั้งลูกหนี้แล้ว ยังไม่รับเงิน |
| `รับบางส่วน` | มีการรับเงินบางส่วน |
| `รับครบ` | รับเงินครบแล้ว |
| `ยกเลิก` | ยกเลิกบิลตาม rule ที่อนุญาต |

### ใบรับเงิน

| สถานะ | ใช้เมื่อไหร่ |
|---|---|
| `บันทึกรับเงินแล้ว` | บันทึกรับเงินแล้ว กระทบเงินสด/ธนาคารและตัดลูกหนี้แล้ว |
| `กลับรายการ` | กลับรายการใบรับเงิน |

### รายการสต๊อก

| สถานะ | ใช้เมื่อไหร่ |
|---|---|
| `บันทึกแล้ว` | รายการ stock มีผลแล้ว |
| `กลับรายการ` | มีรายการกลับ stock แล้ว |

## Validation Rules

### ตอนออก WTO / pending_out จาก PO Sell

- PO Sell ต้องไม่ใช่ `ยกเลิก`
- PO Sell ต้องยังไม่ `ออกบิลแล้ว`
- จำนวนที่ส่ง/ชั่งออกต้องไม่เกิน stock available หลังหัก active `pending_out`
- WTO ต้องสร้าง `pending_out` แต่ยังไม่เขียน stock ledger

### ตอนออกบิลขาย

- flow หลักต้องเลือก `WTO` ที่ยังไม่ถูกออกบิล และดึงรายการสินค้าจาก WTO snapshot
- line จาก WTO ต้อง allocate เป็น `PO_SELL`, `SPOT_SALE`, หรือ split mixed source ได้ชัดเจน
- จำนวน/น้ำหนักที่ตัด `PO Sell` ต้องไม่เกิน remaining; ส่วนเกินต้องเป็น `Spot Sale`
- `จำนวนที่ขายได้` ใน SB คือยอดที่ Customer ชั่ง/ยอมซื้อจริง จึงอาจขาดหรือเกินจากน้ำหนักสุทธิที่ส่งออกได้
- `หักสิ่งเจือปน` ใช้เฉพาะเมื่อ Customer ซื้อครบหรือซื้อเกิน; ถ้าซื้อไม่ครบให้ปิดช่องนี้และรอรับของคืนแทน
- ยอดขายและ PO allocation คิดจาก `น้ำหนักขายสุทธิ` ของ line โดยตรง; `หักสิ่งเจือปน` เป็นข้อมูลประกอบของการชั่ง/คุณภาพ และต้องไม่เกิน `จำนวนที่ขายได้` แต่ไม่บังคับให้ระบบหักซ้ำจาก `น้ำหนักขายสุทธิ`
- ห้ามใช้ `เลขที่อ้างอิง` free-text เป็น source control ของ SB
- ห้ามให้ผู้ใช้กรอก `ทะเบียนรถ` ใน SB; ทะเบียนรถเป็น read-only trace จาก WTO
- ถ้าเปิดจาก WTO ต้อง validate active hold จาก intended warehouse ของ WTO, consume hold, และสร้าง stock ledger ใน transaction เดียวกับ sales bill
- stock/COGS ต้อง consume ตามน้ำหนัก source จาก WTO ที่ถูกนำไปออกบิล ไม่ใช่ตามน้ำหนักที่ Customer ชั่งปลายทางเมื่อชั่งเกิน
- ห้ามเปิดจาก PSALE/Pending Sale ใน target ใหม่; API ต้อง reject `pendingStockIssueId/fromPsale...`
- ไม่เปิดบิลขายตรงเพื่อ stock-out โดยไม่มี WTO เพราะจะข้าม pending_out/source/warehouse control
- ต้อง snapshot VAT, total amount, cost, และ gross profit ที่ใช้ในบิล
- ถ้าเลือกมัดจำ/เงินล่วงหน้า Customer ต้องตรวจว่าเป็น Customer/สาขาเดียวกัน, มียอด available, และไม่ทำให้ receivable balance ติดลบ

### ตอนออกบิลขาย Trading

- ต้องเลือก/บันทึกสินค้าที่จะส่งไป Trading Matching เพื่อจับคู่กับบิลรับซื้อ Trading
- บิลรับซื้อ Trading ที่ match ได้จะเป็น Trading + PO หรือ Trading + Spot ก็ได้
- สามารถเลือกผูกหรือไม่ผูก PO Sell ต่อ line ได้
- ถ้า line ใดผูก PO Sell ต้องตรวจว่าไม่เกินยอด PO Sell ที่ยังตัดได้ และบันทึก allocation กลับ PO Sell ระดับ line
- Line ของ Sales Bill Trading ต้องไม่ตรวจ stock พร้อมขายและต้องไม่สร้าง stock ledger
- ทองเหลือง/ทองแดงที่เป็น Trading ต้องไม่ตัด stock ตัวเองหลังเปิดบิลขาย ให้ถูกส่งไป Trading Matching เพื่อจับคู่ขาย/ตัดขายนอกระบบ
- ถ้าต้องตัด stock จริง ให้ใช้ WTO-backed stock line ใน Sales Bill เท่านั้น
- ต้องคำนวณ COGS/GP จาก Trading allocation หลัง match กับบิลรับซื้อ ก่อนรวมเข้า read model ของ margin

### ตอนรับเงิน

- รับเงินได้เฉพาะ SB ที่ยังไม่ `รับครบ` และไม่ `ยกเลิก`
- ยอดรับรวมต้องไม่เกินยอดค้างรับ
- เมื่อรับเงินแล้วต้องอัปเดต received amount, receivable balance, และสถานะ SB ใน transaction เดียวกัน
- ต้องสร้าง bank statement อ้างอิง `RCP` ใน transaction เดียวกัน
- AR read model ต้องไม่ derive ยอดค้างรับจาก legacy `receipts` ก่อน เพราะอาจไม่รวม Customer Advance หรือ allocation facts ใหม่; ให้ใช้ `sales_bills.receivable_balance` เป็น source หลัก

## Source of Truth ที่ควรมี

เอกสารที่จบแล้วต้องอ่านได้โดยไม่ต้องคำนวณใหม่จาก master data ที่อาจเปลี่ยนภายหลัง โดยเฉพาะ VAT, ยอดรวม, ต้นทุนขาย, และ gross profit

| เรื่อง | Source of truth |
|---|---|
| PO Sell ปัจจุบัน | `po_sells` |
| ยอดรอออก / pending_out | `stock_holds` จาก WTO |
| ยอดออกบิล | `sales_bills` + sales bill line table ในอนาคต |
| ยอดใช้ WTO ไปออกบิล | `sales_bill_lines` + `sales_bill_wto_allocations` หรือ allocation table equivalent |
| ยอดขาย Trading | `sales_bill_lines` + `trading_deals` / `sales_bill_purchase_allocations` หรือ allocation table equivalent |
| ยอดขายจาก stock | `sales_bill_lines` + `stock_ledger` เฉพาะ WTO-backed Sales Bill Stock flow ไม่ใช่ Trading line |
| ยอดตัด PO Sell | `sales_bill_lines` + `sales_bill_po_allocations` หรือ allocation table equivalent |
| ยอดหักมัดจำ Customer | `customer_advance_allocations` หรือ allocation table equivalent |
| ยอดรับเงิน | `receipts` |
| ผลต่อเงินสด/ธนาคาร | `bank_statement` |
| ผลต่อ stock | `stock_ledger` |
| Aging เอกสาร | อ่านตาม [[Document Aging Policy]]: `SB` ใช้ financial due aging, `WTO/POS` ใช้ operational pending aging |
| ประวัติสถานะ | แยก status logs ตามเอกสาร เช่น `po_sell_status_logs`, `weight_ticket_status_logs`, `sales_bill_status_logs`, `receipt_status_logs` ตาม [[Document History Table Design]] |
| ประวัติการใช้งาน/ตัดยอด | แยก usage/allocation logs และ fact tables ตาม flow เช่น `po_sell_allocation_logs`, `receipt_allocations`, `weight_ticket_usage_logs` สำหรับ WTO |
| Summary/KPI | maintained summary current tables |

### Sales Bill Detail History

- หน้า detail ของบิลขายต้องใช้ `ประวัติสถานะ SB` เป็น audit surface หลักเหมือนแนวคิดของใบส่งของ ไม่แยกข้อมูล usage เป็นกล่อง debug ถาวร
- ข้อมูลการใช้ต้นทางสินค้า/ต้นทุน เช่น WTO usage, PO Sell allocation, Trading allocation, และ Customer advance allocation ให้แสดงเป็นตารางยุบ/ขยายชื่อ `ต้นทางสินค้าและต้นทุน` ภายใน timeline
- ตารางนี้เป็นข้อมูลของบิลขายโดยตรง ไม่ใช่ประวัติ stock hold ดิบ: ต้องแสดง line สินค้าที่ขาย, เอกสารต้นทาง, จำนวนที่ใช้, ต้นทุน/COGS, สถานะ allocation/usage, และเวลาเกิด fact
- ถ้า Sales Bill line ขาย SKU จริงต่างจาก SKU ต้นทางของ WTO ให้แสดงข้อความ `คัดแยกจาก: <สินค้าเดิม>` ในรายการสินค้า เพื่อให้ audit เข้าใจว่าลูกค้าคัดแยกสินค้าจากแถว WTO เดิม ไม่ใช่การแก้ WTO ย้อนหลัง
- ไม่ควรเปลี่ยน source/cost identity ของ WTO หรือ stock hold จาก UI detail; detail เป็น read model เพื่ออธิบายความสัมพันธ์ของ SB กับ source เท่านั้น
- หน้าแก้ไขบิลขายสามารถลบ split line ได้ แต่ต้องทำแบบ audit-safe: ใช้ `salesBillLineNo`/`line_no` จับคู่ line fact เดิม, mark line ที่ถูกลบเป็น `reversed`, reverse source allocation/PO Sell allocation, release WTO pending_out, และคำนวณยอดบิลใหม่จาก line ที่เหลือ ห้าม hard delete line fact เดิม
- โหมดสร้างบิลใหม่ยังต้องบังคับจำนวนและราคามากกว่า 0 เสมอ; โหมดแก้ไขก็ต้องส่งเฉพาะ line ที่ยังใช้งานจริง ไม่ใช้ zero-out เป็นตัวแทนการลบแถว

## งาน Implementation ที่ตามมา

- เพิ่ม status/usage log สำหรับ PO Sell, WTO, SB, Receipt ตาม [[Document History Table Design]]
- เพิ่ม summary tables สำหรับ PO Sell, WTO pending_out และ AR/Sales Bill
- ปรับ `/sales/po-sell` ให้ใช้ status ไทยและแยกยอดรอออก/ยอดออกบิล
- ไม่เพิ่ม write path ให้ `/sales/stock-issue`; route/API ถูกถอดจาก target runtime แล้ว
- ปรับ `/sales/bills` ให้ออกบิลจาก WTO เป็น flow หลัก ดึงรายการสินค้าอัตโนมัติ และ allocate line เข้า PO Sell/Spot Sale ตาม [[Sales Bills Page Flow]]
- เพิ่ม Customer advance allocation ใน `/sales/bills`
- ปรับ `/sales/bills` สำหรับ Trading sale ให้เลือกบิลรับซื้อได้หลายใบหรือเปิดเป็น Spot Trading ได้, เติมรายการสินค้าอัตโนมัติเมื่อมี PB source, ผูกหรือไม่ผูก PO Sell ได้, และส่งต่อเข้า Trading Matching โดยไม่ตัด stock; ถ้าต้องขายจาก stock จริงให้ใช้ WTO-backed stock line แยกต่างหาก
- ปรับ `/sales/receipts` ให้ refresh SB received amount, receivable balance, และ status ใน write path
- เพิ่ม aging read model ตาม [[Document Aging Policy]] สำหรับ `SB` ลูกหนี้ค้างรับ, `WTO` ค้างออกบิลขาย, และ `POS` ค้างส่ง/ค้างออกบิล
- ทำ write service กลางสำหรับ `create WTO pending_out`, `create SB from WTO`, `cancel SB from WTO`, `create RCP`
- ทำ transaction ให้ update current state, append status log, update stock/bank ledger และ refresh summary พร้อมกัน
- ปรับ UI detail ให้แสดง timeline/history จาก status logs
- ปรับ document number ให้ branch-aware ครบทุกเอกสารขาย
- ทำ QA flow ขายครบสาย: PO Sell -> WTO -> SB -> RCP
