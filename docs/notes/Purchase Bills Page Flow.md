---
title: Purchase Bills Page Flow
aliases:
  - Flow หน้าบิลรับซื้อ
  - Purchase Bills Page Flow
  - PB Supplier Swap Flow
tags:
  - ns-scrap-erp
  - purchase
  - purchase-bills
  - page-flow
  - supplier-swap
status: draft
created: 2026-06-08
updated: 2026-06-12
---

# Purchase Bills Page Flow / Flow หน้า `/purchase/bills`

เอกสารนี้แยก flow เฉพาะหน้า `/purchase/bills` ออกจาก [[Purchase Flow]] เพื่อให้ behavior ระดับหน้า, ปุ่ม, modal, validation, และ side effects อ่านได้จบในที่เดียว

## Scope

หน้า `/purchase/bills` รับผิดชอบ:

- สร้าง `PB` จาก `WTI` สำหรับ Stock หรือกรอกรายการเองสำหรับ Trading
- แก้ไข `PB` ที่ยังไม่เข้า Payment Flow lock
- ยกเลิก `PB` ที่ยังไม่มี active `PMA` หรือ `PMT`
- เปลี่ยน Supplier ของ `PB` โดย void บิลเดิมและสร้างบิลใหม่ที่ใช้ใบรับของเดิมได้
- แสดงสถานะจ่ายจาก [[Payment Flow]] เพื่อ lock ปุ่มและ filter list
- พิมพ์บิลรับซื้อรายใบจากรายการหรือหน้ารายละเอียด

หน้า `/purchase/bills` ไม่รับผิดชอบการสร้าง `PMA` หรือ `PMT`; เมื่อ `PB.payable_balance > 0` ให้ handoff ไป [[Payment Flow]]

## Status / Filter / Action Contract

หน้า `/purchase/bills` ต้องแยกสถานะเอกสารหลักกับสถานะการจ่าย:

| แกน | สถานะ | ใช้ทำอะไร |
|---|---|---|
| `PB document` | `เปิดอยู่`, `ยกเลิก` | บอกว่าเอกสารบิลยัง active หรือถูกยกเลิกแล้ว |
| `PB payment/source` | `ยังไม่อนุมัติ`, `รอจ่าย`, `ชำระบางส่วน`, `เสร็จสิ้น`, `ยกเลิก` | ใช้กับ list filter, status badge, และ action availability |

กติกา list/filter:

- filter สถานะหลักของหน้า PB ต้องใช้ชุด `ยังไม่อนุมัติ`, `รอจ่าย`, `ชำระบางส่วน`, `เสร็จสิ้น`, `ยกเลิก`
- ไม่ใช้ `อนุมัติแล้ว` เป็น filter หลักของ PB เพราะ `อนุมัติแล้ว` เป็นสถานะของ `PMA` ใน [[Payment Flow]]
- รายการที่มี `PMA approved` แต่ยังไม่ออก `PMT` ให้แสดงฝั่ง PB เป็น `รอจ่าย`
- รายการที่จ่าย PMT สำเร็จบางส่วนและยังมียอดค้าง ให้แสดง `ชำระบางส่วน`
- รายการที่ payable balance เหลือ 0 ให้แสดง `เสร็จสิ้น`

กติกา action:

- `แก้ไข` และ `ยกเลิก` ใช้ได้เฉพาะ PB ที่ยังไม่มี active `PMA` และไม่มี active `PMT`
- เมื่อมี `PMA approved` หรือ payment cycle active แล้ว ต้อง disable action ที่กระทบยอด, คู่ค้า, ภาษี, ส่วนลด, WTI/PO allocation, และ ADV allocation
- `พิมพ์` ใช้ได้กับ PB ที่บันทึกแล้วทุกสถานะ แต่เอกสารยกเลิกต้องแสดงลายน้ำ/สถานะ `ยกเลิก`

### Remaining Runtime Checks

หลังสถานะ canonical ถูกบันทึกแล้ว ยังต้องตรวจ runtime ของหน้า `/purchase/bills` ดังนี้:

- list filter ต้องไม่มี `อนุมัติแล้ว` เป็น filter หลักของ PB
- status badge ของ PB ต้อง map จาก payment read model เป็น `ยังไม่อนุมัติ`, `รอจ่าย`, `ชำระบางส่วน`, `เสร็จสิ้น`, หรือ `ยกเลิก`
- WTI selector ของ Stock PB ต้องเลือกได้เฉพาะ `WTI = รับของแล้ว`
- WTI selector ต้องไม่แสดง legacy partial WTI เป็นตัวเลือกใน new write path
- edit/cancel/supplier-swap ต้องปิดทันทีเมื่อมี active `PMA approved` หรือ `PMT active`
- detail/print ต้องยังแสดงเอกสารยกเลิกได้เพื่อ audit แต่ไม่เปิด action ที่กระทบ allocation หรือ payment

## API / DB Optimization Snapshot

อัปเดตล่าสุด 2026-06-12 สำหรับ dev-target:

- Migration `20260612225500_optimize_purchase_bills_queries.sql` เพิ่ม index สำหรับ PB list/sort/filter, PB doc no prefix lookup, WTI options, ADV options, PMT active-by-bill lookup, PMA locked-by-source lookup, และ active allocation lookup
- Migration `20260612231500_harden_purchase_bill_allocation_lifecycle.sql` เพิ่ม lifecycle ให้ `purchase_bill_items`, `purchase_bill_receipt_allocations`, และ `purchase_bill_po_allocations`
  - `purchase_bill_items.item_status = active/superseded` และ `item_version` ใช้เก็บ line snapshot หลาย version ต่อ PB โดยไม่ลบ row เดิม
  - `purchase_bill_receipt_allocations.allocation_status = active/released` ใช้แยก WTI allocation ปัจจุบันออกจาก audit history
  - `purchase_bill_po_allocations.allocation_status = active/released` ใช้แยก PO allocation ปัจจุบันออกจาก audit history
  - unique เดิม `(purchase_bill_id, line_no)` ถูกแทนด้วย partial unique `uq_purchase_bill_items_active_bill_line` เพื่อให้ line no ซ้ำได้เฉพาะ historical/superseded rows
- `GET /api/purchase/bills` ทำ DB pagination เมื่อ request ไม่ได้ filter/sort ด้วย workflow status:
  - ใช้ `skip/take` ที่ `purchase_bills.findMany`
  - ใช้ DB `count` สำหรับ `totalRows`
  - ใช้ DB `sum(total_amount)` สำหรับ `totalAmount`
  - ยังใช้ in-memory derive/slice เฉพาะกรณีที่ต้อง filter/sort ด้วย workflow status เพราะต้องอ่าน PMA/PMT ก่อน
- `GET /api/purchase/bills` จำกัด `WTI` options ตาม branch scope ของผู้ใช้ (`allowedBranchIds`) แทนการโหลด WTI ทุกสาขา
- `POST /api/purchase/bills` และ supplier-swap create path ออกเลข `PB` ด้วย month-scoped advisory lock `purchase_bills:PB{YYMM}` และ SQL `max(running)` แทน global doc-no lock + JS scan
- `PATCH /api/purchase/bills` cancel/supplier-swap release active allocation rows แทน `deleteMany`
- `PATCH /api/purchase/bills` edit release active allocation rows, mark active item rows เป็น `superseded`, แล้ว create active item/allocation version ใหม่แทน delete/rebuild
- active availability/reconciliation paths (`WTI` usage, `PO Buy` reconciliation, PB detail/list read model) กรอง `active` lifecycle rows เท่านั้น เพื่อไม่ให้ audit history ถูกนับซ้ำ

หลักฐาน query/check จาก dev-target หลังปรับ:

- migration lifecycle ถูก apply กับ dev-target ผ่าน `psql` จาก `apps/next/.env.local`
- catalog check ยืนยันว่า unique เดิม `uq_purchase_bill_items_bill_line` ถูกลบแล้ว เหลือ `purchase_bill_items_pkey` และ partial unique `uq_purchase_bill_items_active_bill_line`
- lifecycle columns ทุก table มี default `active` และ existing rows ไม่มี `item_status is null`
- SQL smoke ของ doc no generation คืน latest running ของเดือน `2606` ได้ถูกต้อง (`last_number = 12` จากข้อมูลทดสอบล่าสุด)
- dev-target ยังมี transaction rows น้อยมาก (`purchase_bills = 12`, `weight_tickets = 25`) PostgreSQL จึงยังเลือก seq scan สำหรับบาง query ตาม cost ปกติ แต่เมื่อบังคับ `enable_seqscan = off` index path ของ PB list, ADV option, และ PMT active lookup ใช้งานได้
- targeted ESLint ของ `src/app/api/purchase/bills/route.ts`, `po-buy-reconciliation.ts`, `purchase-bill-detail.ts`, และ `weight-tickets.ts` ผ่าน
- `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false` ผ่าน
- `npm run verify:stock-ledger` ผ่าน โดย totals ทุกตัวเป็น `0`

## Print Purchase Bill

Legacy มี action พิมพ์บิลรับซื้อรายใบอยู่แล้ว โดยใช้ `erp.printDocument('receipt', row.raw.id)` จากปุ่มพิมพ์ในตาราง (`old-apps/legacy/index.html:15119`) และ render เอกสารผ่าน helper `erp.printDocument(kind, billId)` (`old-apps/legacy/index.html:6449`). Active Next app ต้องมีฟังก์ชันนี้เช่นกัน เพราะบิลรับซื้อเป็นเอกสารที่ต้องออกให้ตรวจ/ลงนาม/เก็บรายใบ ไม่ใช่แค่ข้อมูลใน detail modal

### UI Contract

- หน้า list `/purchase/bills` ต้องมี action `พิมพ์` รายแถว โดยปุ่มย่อยต้อง `stopPropagation()` เพื่อไม่ชนกับ row click ที่เปิด detail
- หน้า detail/modal และ direct URL `/purchase/bills/{docNo}` ต้องมี action `พิมพ์บิลรับซื้อ` ใช้ read-model เดียวกับ list
- action พิมพ์ใช้ได้กับ PB ที่บันทึกแล้วทุกสถานะ เพื่อเก็บสำเนาประวัติ; ถ้า PB ถูกยกเลิกหรือถูก void จาก supplier swap เอกสารพิมพ์ต้องแสดงสถานะ/ลายน้ำ `ยกเลิก` หรือ `ยกเลิก/เปลี่ยน Supplier`
- เอกสารพิมพ์เป็น print preview/popup แบบ A4 มี toolbar เฉพาะบนจอ เช่น `พิมพ์` และ `ปิด`; browser print ต้องสามารถ Save as PDF ได้
- เอกสารพิมพ์ต้องรองรับบิลที่มีรายการมากกว่า 30 รายการและแตกเป็นหลายหน้าได้ โดยตารางรายการต้อง repeat table header ทุกหน้า, ห้ามตัด row กลางรายการ, และ summary/หมายเหตุ/ลายเซ็นต้องย้ายไปหน้าสุดท้ายหรือหน้าใหม่เมื่อพื้นที่ไม่พอ
- ปุ่มพิมพ์ต้องไม่สร้าง `PMA`, `PMT`, stock movement, allocation, หรือ transaction side effect ใด ๆ

### Header / Company Profile Source

- หัวกระดาษต้องดึงข้อมูลจาก `ข้อมูลบริษัท (สำหรับใบพิมพ์)` ในเมนูระบบ (`/admin/company-profile`) ผ่าน API/source เดียวกับเอกสารพิมพ์อื่นของ active app
- ข้อมูลที่ต้องรองรับ: โลโก้, ชื่อบริษัทไทย/อังกฤษ, เลขประจำตัวผู้เสียภาษี, สาขา, ที่อยู่, โทรศัพท์, แฟกซ์, อีเมล, เว็บไซต์, bank/footer note เท่าที่ใช้กับ template
- ชื่อบริษัท, ที่อยู่, เลขผู้เสียภาษี, footer note, และโลโก้ต้องใช้ Company Profile ของสาขาเอกสารเท่านั้น; ถ้าช่องใดไม่มีข้อมูลให้แสดง `ไม่มีข้อมูล` ในช่องนั้น ห้ามใช้ default logo หรือข้อมูลบริษัทจากสาขา/row กลาง/แหล่งอื่น
- Layout หัวกระดาษต้องออกแบบใหม่ให้ดู corporate และอ่านง่าย โดยใช้รูปตัวอย่างลูกค้าที่ได้รับวันที่ 2026-06-09 เป็น data reference ไม่ใช่ pixel/layout ที่ต้องลอกตาม จุดสำคัญคือข้อมูลต้องครบ: โลโก้, ชื่อเอกสาร, ชื่อบริษัท, วันที่เอกสาร, ผู้ขาย, ทะเบียนรถ, ผู้จัดทำ, Sale/ผู้ประสานงาน, เลขเอกสาร, summary ยอด และตารางน้ำหนัก/ราคา

### Corporate Layout Direction

ออกแบบ active print template ให้เป็นเอกสารบริษัทแบบสะอาดและเป็นทางการ:

- ใช้ A4 portrait เป็น default สำหรับ PB ทุกใบ; ถ้ารายการน้อยมากยังใช้ layout เดียวกันเพื่อไม่ให้เอกสารเปลี่ยนหน้าตาตามข้อมูล
- header เป็น white/corporate header ไม่จำเป็นต้องเป็นแถบเขียวเต็มเหมือนรูปตัวอย่าง: โลโก้ซ้าย, ชื่อบริษัทและที่อยู่จาก Company Profile, ชื่อเอกสารใหญ่ด้านขวาหรือกลาง, เลขเอกสาร/วันที่เป็น document meta block
- ใช้สีแบรนด์/สีเขียวจากตัวอย่างเป็น accent เฉพาะเส้นหัวเอกสาร, badge, หรือหัวตาราง ไม่ใช้พื้นสีเข้มขนาดใหญ่ที่กินพื้นที่เอกสาร
- ข้อมูลเอกสารส่วนบนแบ่งเป็น 2 columns: ฝั่งซ้าย `Supplier/ผู้ขาย`, ที่อยู่/เลขผู้เสียภาษี/ทะเบียนรถ; ฝั่งขวา `Document Info` เช่น `PB no`, วันที่ส่ง/วันที่เอกสาร, สาขา, คลัง, ผู้จัดทำ, Sale
- summary ยอดเงินวางเป็น compact total card ด้านขวาล่างของตาราง หรือใต้ตาราง ไม่แทรกกลางเอกสารแบบพื้นที่สีใหญ่ เพื่อให้รายการสินค้าเป็นพระเอกและอ่านต่อเนื่อง
- หมายเหตุวางเป็นกล่อง `หมายเหตุ` ใต้ตารางฝั่งซ้ายเท่านั้น; ไม่แสดงบรรทัด `VAT Invoice`, วันที่ใบกำกับ, หรือ `Supplier Ref` ใน print เพราะไม่จำเป็นกับบิลรับซื้อรูปแบบนี้
- signature block วางท้ายเอกสาร 3 ช่องเท่ากัน: ผู้ส่งสินค้า, ผู้ตรวจรับ/ตรวจนับ, ผู้รับสินค้า/บริษัท
- typography ใช้ `Noto Sans Thai`, ตัวเลขชิดขวา, table header ชัด, เส้นตารางบางสี slate, spacing แน่นแต่ไม่อึดอัด
- เอกสารต้องดูเหมือนออกจากระบบ ERP บริษัท ไม่เหมือน screenshot จาก Excel/legacy ถึงแม้ field จะอิงจากตัวอย่างลูกค้า

### Document Content

เอกสารพิมพ์บิลรับซื้อควรปรับปรุงจาก legacy โดยคง field สำคัญและทำให้อ่านง่ายขึ้น:

- ชื่อเอกสาร: default ตามตัวอย่างลูกค้าคือ `ใบรับสินค้า`; ต้องยืนยัน wording สุดท้ายว่าจะใช้ `ใบรับสินค้า`, `บิลรับซื้อ`, หรือแสดงคู่กันก่อน implement
- ข้อมูลหัวบิล: เลขที่บิลรับซื้อ (`PB...`), วันที่ส่ง/วันที่เอกสาร, สาขา, คลัง, ประเภท `Stock/Trading`, แหล่งซื้อจากรายการ `PO/Spot/Mixed`, ผู้จัดทำ, Sale/ผู้ประสานงานถ้ามีใน read-model
- คู่ค้า: Supplier, เลขผู้เสียภาษี/สาขา/ที่อยู่/เบอร์โทร/Sale contact ต้องอ่านจาก PB supplier snapshot (`purchase_bills.supplier_*_snapshot`) ไม่อ่าน live Supplier master ตอนพิมพ์
- แหล่งอ้างอิง: `WTI`, `POB`, ทะเบียนรถ/ข้อมูลชั่งถ้าเป็น Stock จากใบรับของ โดยแสดงเฉพาะจุดที่ช่วยอ่านเอกสารจริง ไม่ใส่ metadata Supplier/VAT ref ที่ไม่มีในแบบพิมพ์
- ตารางรายการ: ลำดับ, รหัสสินค้า, ชื่อสินค้า, `REMARK` จากหมายเหตุ lot ของใบรับของสำหรับบิลที่อ้าง `WTI`, แหล่งซื้อรายบรรทัด (`POB...` หรือ `Spot Buy`), น้ำหนักก่อนหัก, น้ำหนักหัก, น้ำหนักสุทธิ, จำนวนพร้อมหน่วยจริง (`กก.`/`ลัง`), ราคา/หน่วย, จำนวนเงิน
- ตารางรายการต้องใช้หน่วยจาก document snapshot หรือ master data ต่อบรรทัด และ summary ต้องแยกยอดตามหน่วยเมื่อมีหลายหน่วย เช่น `รวม 1,250 กก. / 32 ลัง`
- ยอดรวมท้ายบิลเรียงตามลำดับ: ยอดเงินรวม, หักส่วนลด, ยอดหลังหักส่วนลด, VAT ที่คำนวณจากยอดหลังหักส่วนลด, ยอดรวมทั้งสิ้น, หักเงินมัดจำ/ชำระบางส่วน, และค้างชำระ
- หมายเหตุและแหล่งเอกสารที่ยังแสดงใน print ต้องมาจาก PB/WTI snapshot/read-model ไม่คำนวณจากข้อมูล master ปัจจุบันถ้าเป็นข้อมูลประวัติ
- ช่องลงนามขั้นต่ำ: ผู้ส่งสินค้า/Supplier, ผู้ตรวจรับ/ตรวจนับ, ผู้รับสินค้า/บริษัท, พร้อมเส้นวันที่

### Customer Sample Reference 2026-06-09

รูปตัวอย่างที่ลูกค้าส่งมาเป็นเอกสารแนวนอนลักษณะ receipt note ใช้เป็น data completeness checklist ไม่ใช่ layout ที่ต้องลอก:

- header เป็นแถบสีเขียวเต็มความกว้าง มีโลโก้ซ้าย และชื่อเอกสาร `ใบรับสินค้า` พร้อมชื่อบริษัทไทย/อังกฤษตรงกลาง
- ช่วงข้อมูลบนเป็น grid แถวเตี้ย แสดง `วันที่ส่ง/DELIVERY`, `เวลา/TIME`, `ชื่อผู้ขาย/NAME`, `ทะเบียนรถ/TRUCK`, `จัดทำโดย`, และ `Sale`
- ช่วงกลางมีแถบ summary ขนาดใหญ่: ฝั่งซ้ายเป็นพื้นที่หมายเหตุ/พื้นที่ว่างสีชมพู, กลางเป็นกล่องสีเข้มคำว่า `ยอดรวมทั้งสิ้น`, ฝั่งขวาเป็นสรุปยอด `ยอดเงินรวม`, `หักส่วนลด`, `หักเงินมัดจำ`, `รวมทั้งสิ้น/TOTAL`, `VAT`, `ยอดรวมทั้งสิ้น`
- ก่อนตารางรายการมีแถว metadata ซ้ำสำหรับ `ชื่อผู้ขาย`, `วันที่ส่ง`, และ `เลขที่เอกสาร`
- ตารางรายการใช้หัวสีเทา/น้ำเงินและมี columns หลัก `สินค้า`, `REMARK`, `นน.ก่อนหัก`, `นน.หัก`, `นน.สุทธิ`, `ราคา`, `รวม`
- แถวผลรวมท้ายตารางต้องรวม weight และ amount เหมือนตัวอย่าง ไม่รวมเฉพาะยอดเงิน
- ลูกค้ายืนยันภายหลังว่าแก้แบบได้ ขอให้ข้อมูลครบถ้วนและดู corporate; ดังนั้น active design ให้ยึด `Corporate Layout Direction` ด้านบน และใช้รายการ field จากรูปนี้เป็น checklist

### Implementation Notes

- Implemented 2026-06-09, updated 2026-06-10: active Next exposes PB print from `/purchase/bills` list row action, detail modal, and direct detail page. Template is corporate A4 portrait, opens a print window immediately, loads branch-specific Company Profile for header data, shows `ไม่มีข้อมูล` for missing company-profile fields instead of fallback data, includes cancelled/supplier-swap watermark, and supports multi-page item tables for 30+ lines with repeated table header and non-splitting item rows.
- Updated 2026-06-10: `REMARK` ในตารางสินค้า PB print ดึงจากหมายเหตุ lot ของใบรับของ (`weight_ticket_lines.note`) ผ่าน summary ที่ถูก allocate เข้า PB; บิล Trading หรือบรรทัดที่ไม่มี receipt allocation จึงค่อยใช้หมายเหตุบรรทัด PB เดิม
- Updated 2026-06-10: summary ยอดท้ายเอกสารเรียงตามลำดับที่ผู้ใช้กำหนด และแถว `หักเงินมัดจำ/ชำระบางส่วน` ใช้ยอดชำระรวมของบิล (`paidAmount`) เพื่อให้ครอบคลุมทั้งมัดจำและการชำระบางส่วน
- Updated 2026-06-10: stock PB validation ต้องตรวจ product membership ของ PO Buy จาก `po_buys.items` รายสินค้า ไม่ใช่ `po_buys.product_id` ระดับหัวเอกสาร เพราะ multi-product PO เช่น `POB012606-0005` อาจมีหัวเอกสารเป็น `SKU108` แต่ยังมี `SKU109` ที่ต้องตัดยอดกับ `ทองแดงเบอร์ 2` ได้
- Updated 2026-06-12: PB printable supplier fields are document-owned snapshots. `purchase_bills` stores `supplier_name_snapshot`, `supplier_tax_id_snapshot`, `supplier_address_snapshot`, `supplier_phone_snapshot`, and `supplier_sales_rep_snapshot` at create time from the selected active Supplier master. Address uses `suppliers.address` only, phone uses `suppliers.phone`, tax id uses `suppliers.tax_id`, and sale contact uses `suppliers.sales_rep`; no fallback to `purchase_bills.contact_name`, address-line fields, structured address fields, or current live Supplier master in PB/RV print/detail read paths.
- ใช้ style print เดียวกับ active print helper เช่น WTI/WTO print และ Company Profile preview โดยใช้ `Noto Sans Thai`
- `purchase_bill_items` เป็น print snapshot หลักของรายการ; allocation tables ใช้แสดง trace `WTI/POB/Spot` เพิ่มเติม แต่ห้ามทำให้ PB ที่ถูก cancel/supplier swap เสีย historical source เดิม
- ถ้า active allocation ถูก release แล้ว detail/print ต้องยังอ่าน historical source จาก `purchase_bill_items.po_buy_id` หรือ `purchase_bill_items.source_snapshot.poBuyId` ได้
- เอกสารนี้เป็น print ของ `PB` ไม่ใช่ `PMA`, `PMT`, ใบสำคัญจ่าย, หรือใบรับของ `WTI`

## Create PB

1. ผู้ใช้เลือกประเภท `STOCK` หรือ `TRADING`
2. `STOCK` ต้องเลือกสาขา, Supplier, และ `WTI`
3. เมื่อเลือก `WTI` ระบบล็อกสาขา, คลัง, Supplier, ประเภทบิล, และใบรับของ เพื่อกัน source ไม่ตรงกัน
4. ระบบดึงรายการสินค้าจาก `weight_ticket_product_summaries`
5. ผู้ใช้เลือก `PO Buy` หรือ `Spot Buy` ต่อแถว และกรอกราคาเฉพาะแถว Spot
6. ช่องเลือก `PO Buy` ต้องแตก option ตามสินค้าใน `po_buys.items` ไม่ใช่ยุบเหลือหัว PO เดียว เพื่อให้ WTI product summary แต่ละแถวเห็นเฉพาะ PO ที่มีสินค้านั้นและยอดคงเหลือของสินค้านั้น
7. ต้องจัดสรรน้ำหนัก WTI summary ที่เลือกให้ครบก่อนบันทึก
8. เมื่อบันทึกสำเร็จ ระบบ snapshot ข้อมูล Supplier สำหรับพิมพ์ลง `purchase_bills.supplier_*_snapshot`
9. ระบบสร้าง `PB`, `purchase_bill_items`, receipt/PO allocation facts, ADV allocation ถ้าเลือก, และ status/usage logs
10. Target stock movement สำหรับ Stock เกิดจาก `PB` save โดยอ้าง `WTI`; `WTI` ไม่เขียน stock ledger เอง

## Edit PB

แก้ไขปกติทำได้เฉพาะเมื่อ:

- `PB` ยังไม่ถูกยกเลิก
- ไม่มี active `payment_approvals.status in ('approved', 'paid')`
- ไม่มี `payments.status != 'cancelled'`

การแก้ไขปกติเป็นการ update `PB` เดิม โดย refresh allocation facts, ADV allocation, PO reconciliation, WTI billed/remaining, และ status logs ใน transaction เดียว แต่ต้องไม่ refresh supplier printable snapshot ถ้า Supplier ไม่เปลี่ยน เพื่อไม่ให้เอกสารเก่าเปลี่ยนตาม master data ภายหลัง

## Cancel PB

ยกเลิกทำได้เฉพาะเมื่อไม่มี active `PMA` และไม่มี active `PMT`

เมื่อยกเลิก ระบบต้อง:

- ตั้ง `purchase_bills.status = cancelled`
- ตั้ง `cancelled_at`, `cancelled_by`, `cancel_note`
- reverse/delete-rebuild stock ledger ของ `PB`
- release billing/allocation ของ PB และ recalc usage/status ของ `WTI`
- release receipt allocation และ PO allocation ของ PB เดิม
- void/release ADV allocation ของ PB เดิม
- recalc PO, WTI header, และ WTI product summary จาก active PB ที่เหลือ
- append `purchase_bill_status_logs`, `weight_ticket_usage_logs`, `weight_ticket_status_logs`, `po_buy_allocation_logs`, และ `supplier_advance_allocation_logs`

## Supplier Swap PB

ใช้เมื่อผู้ใช้ต้องการเปลี่ยน Supplier ของ PB เดิม โดยต้องคงหลักฐานใบรับของเดิมได้ แต่ราคาและ Supplier ของ PB ใหม่เปลี่ยนได้

### UI Contract

- ปุ่ม `เปลี่ยน Supplier` อยู่ใน modal แก้ไขบิล ข้างช่อง Supplier
- ปุ่มนี้ใช้เข้าโหมด supplier swap เท่านั้น ยังไม่ void เอกสารทันที
- หลังเข้าโหมด supplier swap ผู้ใช้ยังอยู่ใน form เดิม
- ระบบไม่แก้ `form.supplierId` ของ PB เดิมระหว่างอยู่ใน modal; Supplier เดิมแสดงเป็น readonly
- ระบบแสดงช่อง `Supplier ใหม่` แยกต่างหาก และเก็บเป็น draft state สำหรับ supplier swap เท่านั้น
- สาขา, คลัง, ประเภทบิล, Supplier เดิม, และ `WTI` ยังล็อกอยู่ เพราะ PB ใหม่ต้องใช้ source receipt เดิม
- ช่องค้นหา ADV/มัดจำใน supplier swap mode ต้องอิง `Supplier ใหม่` ไม่ใช่ Supplier เดิม และต้อง clear ADV ที่เลือกไว้เมื่อเปลี่ยน `Supplier ใหม่`
- เมื่อเลือก Supplier ใหม่ใน supplier swap mode ต้องไม่ reset, clear, หรือทำให้ค่า `WTI` เดิมหายจากช่องใบรับของ
- supplier search ระหว่าง supplier swap ห้ามเขียนทับ Supplier เดิมใน form; เฉพาะตอน save เท่านั้นจึงนำ `Supplier ใหม่` ไปแทน `supplierId` ใน payload
- selector ใบรับของต้องยังแสดง `WTI` เดิมได้ แม้ `WTI` นั้นมี Supplier ต้นทางต่างจาก Supplier ใหม่
- ไม่แสดงปุ่มล้างใบรับของใน modal แก้ไข/supplier swap เพราะ flow นี้ล็อกใบรับของเดิมไว้จนกว่าจะปิด modal
- รองรับ supplier swap เฉพาะ PB `STOCK` ที่มี `WTI` เดิม
- รายการใหม่ต้องคงแถว, สินค้า/source summary, และน้ำหนักเดิมจากใบรับของเดิม
- ผู้ใช้แก้ราคาได้ แต่ห้ามเพิ่ม/ลบแถวหรือเปลี่ยนน้ำหนักใน supplier swap mode
- รายการใหม่ต้องเป็น `Spot Buy` ทั้งหมด; ห้ามเลือกหรือตัด `PO Buy` ใน supplier swap mode
- ต้องแสดงข้อความเตือนว่า action จริงจะเกิดเมื่อกด `บันทึก`
- เมื่อกด `บันทึก`, ปุ่ม submit ต้องสื่อว่าเป็นการ void PB เดิมและสร้าง PB ใหม่

### Save Contract

เมื่อ save ในโหมด supplier swap ระบบต้องทำทั้งหมดใน transaction เดียว:

1. validate ว่า PB เดิมยังไม่ cancelled, ไม่มี active `PMA`, และไม่มี active `PMT`
2. validate ว่า WTI ที่ส่งมาเป็น WTI ที่อ้างจาก PB เดิมเท่านั้น
3. อนุญาตให้ Supplier ใหม่ต่างจาก Supplier เดิมและต่างจาก Supplier บน WTI ได้ เฉพาะใน supplier swap mode
4. reject ถ้า payload มี `poBuyId` ระดับหัวหรือระดับรายการ เพราะใบรับของเดิมห้ามตัด PO ข้าม Supplier
5. force PB ใหม่เป็น `Spot Buy` ทั้งหมดใน UI และตรวจซ้ำที่ API ตอนบันทึก
6. reject ถ้าจำนวนแถว, `receiptSummaryId`, หรือ `qty` ต่างจาก PB เดิม เพราะ flow นี้ล็อกใบรับของเดิมและแก้ได้เฉพาะราคา/Supplier
7. void/reverse PB เดิมทั้งใบ ด้วย side effects เทียบเท่า cancel PB แต่ raw status ของ PB เดิมต้องเป็น `cancelled_supplier_swap` และแสดงผลเป็น `ยกเลิก/เปลี่ยน Supplier`
8. void/release ADV allocation เดิมที่ผูกกับ PB เดิม
9. สร้าง PB ใหม่เลขใหม่ โดยคง receipt/WTI source เดิมและใช้ Supplier/ราคา/รายการล่าสุดใน form
10. PB ใหม่ต้อง snapshot supplier printable fields จาก Supplier ใหม่ ณ ตอน save
11. ไม่ carry ADV allocation เดิมไป PB ใหม่อัตโนมัติ ถ้าต้องใช้ ADV ให้เลือก allocation ใหม่ใน PB ใหม่
12. reverse stock ledger ของ PB เดิม และสร้าง stock ledger ใหม่จาก PB ใหม่โดยอ้าง WTI เดิม
13. recalc PO, WTI, และ stock ledger จาก active PB หลังจบ transaction
14. บันทึกประวัติใน `bill_swap_history` เพื่อให้แท็บ `ประวัติเปลี่ยนบิล Supplier` ใน `/purchase/bills` แสดงการเปลี่ยน Supplier และราคาได้

### Detail / Historical Source Contract

- `purchase_bill_po_allocations` และ `purchase_bill_receipt_allocations` คือ active allocation facts ใช้คำนวณยอดคงเหลือปัจจุบัน
- เมื่อ PB ถูกยกเลิกหรือถูก void จาก supplier swap ระบบต้อง release active allocation facts เพื่อคืนยอด PO/WTI โดยไม่ลบ row ประวัติ
- หน้า list `/purchase/bills` ต้องเปิดรายละเอียด PB เป็น modal จากการกดแถว โดยไม่ออกจากหน้ารายการ และปุ่มย่อยในแถวต้อง `stopPropagation()`
- direct URL `/purchase/bills/{docNo}` ยังเปิดรายละเอียดได้เป็น fallback/link target แต่ต้องใช้ read-model ชุดเดียวกับ modal
- หน้า detail/modal ของ PB เดิมยังต้องแสดงที่มาดั้งเดิมของรายการจาก `purchase_bill_items.po_buy_id` หรือ `purchase_bill_items.source_snapshot.poBuyId`
- ห้าม fallback เป็น `Spot Buy` ถ้า item snapshot หรือ item FK ยังระบุ PO เดิมอยู่ เช่น `PB012606-0008` ต้องยังแสดง `POB012606-0004` ในรายละเอียด allocation แม้ active PO allocation row ถูก release แล้ว
- ประวัติใน detail/modal ใช้ section `ประวัติ PB` แบบ Time Series ล่าสุดอยู่บนสุด โดยรวมสถานะ, payment event, cancel/supplier-swap event และ metadata สำคัญจาก `purchase_bill_status_logs`

### History Contract

แท็บ `ประวัติเปลี่ยนบิล Supplier` ในหน้า `/purchase/bills` ต้องเห็น:

- เลข PB เดิมที่ถูก void
- Supplier เดิม
- Supplier ใหม่
- ราคาและยอดก่อน/หลังรายแถวเท่าที่ schema รองรับ
- ผู้ทำรายการ
- เหตุผล/ข้อความระบุ PB ใหม่ที่ถูกสร้างแทน

schema ปัจจุบันของ `bill_swap_history` มี `bill_id` หนึ่งค่า จึงให้ผูกกับ PB เดิมเป็นหลัก และใส่เลข PB ใหม่ไว้ใน `reason` จนกว่าจะออกแบบ schema คู่เอกสาร `old_bill_id/new_bill_id` แยกในอนาคต

## Guard Summary

| Action | Allowed When | Blocked When |
|---|---|---|
| Create PB | master/source valid | WTI/PO/warehouse/price invalid |
| Edit PB | no active PMA/PMT | cancelled, approved PMA, active PMT |
| Cancel PB | no active PMA/PMT | approved PMA, active PMT, already cancelled |
| Supplier Swap PB | edit allowed + original WTI source retained + all new lines are Spot Buy | active PMA/PMT, changed WTI, changed branch/warehouse/source, any PO allocation, already cancelled |
