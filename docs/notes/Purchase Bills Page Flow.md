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
updated: 2026-06-08
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

หน้า `/purchase/bills` ไม่รับผิดชอบการสร้าง `PMA` หรือ `PMT`; เมื่อ `PB.payable_balance > 0` ให้ handoff ไป [[Payment Flow]]

## Create PB

1. ผู้ใช้เลือกประเภท `STOCK` หรือ `TRADING`
2. `STOCK` ต้องเลือกสาขา, Supplier, และ `WTI`
3. เมื่อเลือก `WTI` ระบบล็อกสาขา, คลัง, Supplier, ประเภทบิล, และใบรับของ เพื่อกัน source ไม่ตรงกัน
4. ระบบดึงรายการสินค้าจาก `weight_ticket_product_summaries`
5. ผู้ใช้เลือก `PO Buy` หรือ `Spot Buy` ต่อแถว และกรอกราคาเฉพาะแถว Spot
6. ต้องจัดสรรน้ำหนัก WTI summary ที่เลือกให้ครบก่อนบันทึก
7. เมื่อบันทึกสำเร็จ ระบบสร้าง `PB`, `purchase_bill_items`, receipt/PO allocation facts, stock ledger สำหรับ Stock, ADV allocation ถ้าเลือก, และ status/usage logs

## Edit PB

แก้ไขปกติทำได้เฉพาะเมื่อ:

- `PB` ยังไม่ถูกยกเลิก
- ไม่มี active `payment_approvals.status in ('approved', 'paid')`
- ไม่มี `payments.status != 'cancelled'`

การแก้ไขปกติเป็นการ update `PB` เดิม โดย refresh allocation facts, stock ledger, ADV allocation, PO reconciliation, WTI billed/remaining, และ status logs ใน transaction เดียว

## Cancel PB

ยกเลิกทำได้เฉพาะเมื่อไม่มี active `PMA` และไม่มี active `PMT`

เมื่อยกเลิก ระบบต้อง:

- ตั้ง `purchase_bills.status = cancelled`
- ตั้ง `cancelled_at`, `cancelled_by`, `cancel_note`
- ลบ stock ledger ที่เกิดจาก PB เดิม
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
10. ไม่ carry ADV allocation เดิมไป PB ใหม่อัตโนมัติ ถ้าต้องใช้ ADV ให้เลือก allocation ใหม่ใน PB ใหม่
11. สร้าง stock ledger ใหม่สำหรับ PB ใหม่ถ้าเป็น Stock
12. recalc PO และ WTI จาก active PB หลังจบ transaction
13. บันทึกประวัติใน `bill_swap_history` เพื่อให้หน้า `/daily/bill-swap-history` แสดงการเปลี่ยน Supplier และราคาได้

### Detail / Historical Source Contract

- `purchase_bill_po_allocations` และ `purchase_bill_receipt_allocations` คือ active allocation facts ใช้คำนวณยอดคงเหลือปัจจุบัน
- เมื่อ PB ถูกยกเลิกหรือถูก void จาก supplier swap ระบบต้อง release/delete active allocation facts เพื่อคืนยอด PO/WTI
- หน้า list `/purchase/bills` ต้องเปิดรายละเอียด PB เป็น modal จากการกดแถว โดยไม่ออกจากหน้ารายการ และปุ่มย่อยในแถวต้อง `stopPropagation()`
- direct URL `/purchase/bills/{docNo}` ยังเปิดรายละเอียดได้เป็น fallback/link target แต่ต้องใช้ read-model ชุดเดียวกับ modal
- หน้า detail/modal ของ PB เดิมยังต้องแสดงที่มาดั้งเดิมของรายการจาก `purchase_bill_items.po_buy_id` หรือ `purchase_bill_items.source_snapshot.poBuyId`
- ห้าม fallback เป็น `Spot Buy` ถ้า item snapshot หรือ item FK ยังระบุ PO เดิมอยู่ เช่น `PB012606-0008` ต้องยังแสดง `POB012606-0004` ในรายละเอียด allocation แม้ active PO allocation row ถูก release แล้ว
- ประวัติใน detail/modal ใช้ section `ประวัติ PB` แบบ Time Series ล่าสุดอยู่บนสุด โดยรวมสถานะ, payment event, cancel/supplier-swap event และ metadata สำคัญจาก `purchase_bill_status_logs`

### History Contract

หน้า `/daily/bill-swap-history` ต้องเห็น:

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
