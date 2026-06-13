---
title: PO Buy Page Flow
aliases:
  - Flow หน้า PO Buy
  - PO Buy Flow
  - POB Page Flow
tags:
  - ns-scrap-erp
  - purchase
  - po-buy
  - page-flow
status: draft
created: 2026-06-11
updated: 2026-06-12
---

# PO Buy Page Flow / Flow หน้า `/purchase/po-buy`

เอกสารนี้แยก flow เฉพาะหน้า `/purchase/po-buy` ออกจาก [[Purchase Flow]] และแยกจาก [[Purchase Bills Page Flow]]

## Scope

หน้า `/purchase/po-buy` รับผิดชอบ:

- สร้าง `POB` เพื่อจองซื้อ / จองต้นทุนล่วงหน้ากับ Supplier
- กำหนด Supplier, สาขา, วันที่เอกสาร, วันที่คาดว่าจะรับของ, รายการสินค้า, จำนวน, หน่วย, ราคา/หน่วย, checkbox `มี VAT` และหมายเหตุ
- เลือกว่า PO นี้ต้องรับของจริงหรือเป็น costing-only ตาม `requireDelivery`
- แสดงยอดสั่งซื้อ, ยอดคงเหลือ, สถานะรับของ/ออกบิล และสถานะปิดรับไม่ครบ
- พิมพ์ `POB` รายใบ / Save as PDF
- ส่งยอดคงเหลือให้ `WTI/PB` ใช้ตัด PO รายสินค้า
- ส่งสินค้า eligible เข้า [[Cost Pool]] ตามกติกา copper/brass เท่านั้น

หน้า `/purchase/po-buy` ไม่รับผิดชอบ:

- รับของจริง (`WTI` อยู่ใน [[WTI-WTO Flow]])
- ตั้งเจ้าหนี้หรือ stock-in (`PB` อยู่ใน [[Purchase Bills Page Flow]])
- อนุมัติจ่ายหรือทำจ่าย (`PMA/PMT` อยู่ใน [[Payment Flow]])

## PO vs PB Boundary

| เอกสาร | หน้าที่ | Stock effect | Financial effect | Downstream |
|---|---|---|---|---|
| `POB` / PO Buy | จองซื้อ, จองราคา, จองปริมาณ, ใช้เป็น commitment | ไม่มี stock ledger | ยังไม่เกิดเจ้าหนี้ | ถูกตัดโดย `PB` หรือปิดรับไม่ครบ |
| `PB` / Purchase Bill | บันทึกบิลรับซื้อ, ตั้งเจ้าหนี้, ยืนยันยอดที่รับ/ซื้อจริง | Stock PB เขียน stock-in โดยอ้าง `WTI` | เกิด AP/payable และ handoff ไป Payment Flow | ตัด `POB`, ตัด `WTI`, allocate ADV |

กติกาหลัก:

- `POB` เป็น commitment เท่านั้น ห้ามเขียน `stock_ledger`
- `POB` ห้ามสร้าง AP/payable
- VAT บน `POB` เป็น commitment/tax planning snapshot เท่านั้น; VAT/AP จริงยังเกิดที่ `PB`
- `POB` ห้ามถูกใช้เป็นหลักฐานรับของแทน `WTI`
- `PB` เป็นผู้ตัดยอด `POB` จริงผ่าน allocation รายสินค้า/จำนวน
- `PB` หนึ่งใบอาจ allocate หลาย `POB` และ Spot Buy ในใบเดียวได้
- `POB` หนึ่งใบอาจถูกตัดด้วยหลาย `PB` ได้ จน remaining หมดหรือถูกปิดรับไม่ครบ

## Current Next Snapshot

จาก active Next:

- Page: `/purchase/po-buy`
- API: `GET, POST, PATCH, cancel, short-close/export behavior` อยู่ใน `/api/purchase/po-buy`
- Current status: create/list enabled และมี branch-based numbering
- มี logic reconciliation/status log ผ่าน `po-buy-reconciliation`
- ยังต้อง harden allocation logs, close-short policy, aging, detail/timeline และ print parity

## API / DB Optimization Snapshot

อัปเดตล่าสุด 2026-06-12 สำหรับ dev-target:

- Migration `20260612225000_optimize_po_buy_queries.sql` เพิ่ม index สำหรับ list/sort, branch filter, status filter, doc no prefix lookup, product option lookup และ supplier option lookup
- `GET /api/purchase/po-buy` ลด payload โดย `select` เฉพาะ field ที่ response ใช้จริงจาก `po_buys`, `suppliers`, `po_buy_allocation_logs`, และ `po_buy_status_logs`
- `GET /api/purchase/po-buy` เลิก query supplier ซ้ำจาก `supplier_id`; ใช้ supplier relation ที่ select มากับ PO row แทน
- product lookup หลังโหลด PO เลือกเฉพาะ `id`, `code`, `name`, `unit`
- `POST /api/purchase/po-buy` ออกเลขเอกสารด้วย prefix-scoped advisory lock ตาม `POB{branchCode}{YYMM}-` และ query latest doc no เพียง 1 row แทนการ lock/global-scan ทั้งตาราง
- ไม่มีการเปลี่ยน response contract หรือ business behavior ของหน้า PO Buy

หลักฐาน query plan จาก dev-target หลังปรับ:

- supplier option query ใช้ `idx_suppliers_active_name_cover` แบบ index-only scan; จาก baseline seq scan + sort ประมาณ `183ms` เหลือประมาณ `7.6ms` บนข้อมูล supplier 1,888 rows
- product option query ใช้ `idx_products_active_code_name` แบบ index-only scan
- `po_buys` ปัจจุบันมีเพียง 19 rows planner จึงยังเลือก seq scan สำหรับ list บางกรณีได้ตามปกติ แต่ index `date/doc_no`, `branch/date/doc_no`, `status/date/doc_no`, และ `doc_no text_pattern_ops` พร้อมสำหรับข้อมูลโตขึ้น

## Legacy Baseline

Legacy `view-poBuy` ใช้ `poBuys` เป็น PO ซื้อ/จองต้นทุนล่วงหน้า:

- สร้างเลข `POB`
- เก็บ Supplier, สาขา, expected delivery, product/items, qty, unit price, total, remaining qty/amount
- รองรับแก้ไขและยกเลิก
- มี action เปลี่ยน purpose ระหว่าง delivery PO กับ costing-only
- PO Buy เข้ารายงาน outstanding เฉพาะรายการที่ `requireDelivery !== false`
- Cost Pool อ่านจาก PO Buy เฉพาะสินค้า eligible และสถานะ active

Target ใช้ legacy เป็น baseline ของ business behavior แต่ต้องใช้ schema/API ของ Next เป็น source runtime

## Status Contract

สถานะ canonical ของ `POB` ควรแยก 2 แกน:

| แกน | สถานะ | ความหมาย |
|---|---|---|
| Document status | `เปิดอยู่` | PO ยัง active และใช้ตัดได้ |
| Document status | `ยกเลิก` | PO ถูกยกเลิก ใช้ตัดไม่ได้ |
| Fulfillment status | `ยังไม่รับ` | ยังไม่มี PB active มาตัดยอด |
| Fulfillment status | `รับบางส่วน` | มี PB active ตัดบางส่วน ยังมี remaining |
| Fulfillment status | `รับครบ` | remaining = 0 |
| Fulfillment status | `ปิดรับไม่ครบ` | ผู้ใช้ปิด remaining ที่ไม่ต้องรับแล้ว |

กติกา:

- List/filter ต้องไม่ใช้สถานะ payment ของ PB/PMA/PMT มาเป็นสถานะ PO
- `ปิดรับไม่ครบ` ต้องปิดเฉพาะยอด remaining ไม่ใช่ลบประวัติยอดที่เคยถูกตัดแล้ว
- `ยกเลิก` ใช้ได้เฉพาะ PO ที่ไม่มี active PB allocation หรือมี policy reversal ชัดเจน
- PO ที่มี active allocation ต้อง lock field ที่กระทบ supplier/product/qty/unit price ย้อนหลัง เว้นแต่ใช้ edit service ที่ rebuild allocation ได้

## Create PO Buy

1. ผู้ใช้เปิด `/purchase/po-buy`
2. กดสร้าง `PO Buy`
3. ระบบออกเลข `POB{branchCode}{YYMM}-NNNN` ตามสาขา
4. ผู้ใช้เลือก Supplier และสาขา
5. ผู้ใช้กำหนดวันที่คาดว่าจะรับของ
6. ผู้ใช้เพิ่มรายการสินค้าได้หลายแถว
7. แต่ละแถวต้องมี product, qty, unit, unit price
8. ผู้ใช้เลือก checkbox `มี VAT` ได้เหมือนหน้าสร้าง `PB`; ถ้าเลือก ระบบคิด VAT แบบ `EXCLUDE` จากอัตรา VAT active ของวันสร้างเอกสาร
9. ระบบคำนวณ total qty, subtotal, VAT, total amount และ remaining qty/amount เริ่มต้นเท่ากับยอดสั่งซื้อรวม VAT
10. ผู้ใช้เลือก purpose:
   - `requireDelivery = true`: ใช้รับของจริงและเข้า PO Outstanding
   - `requireDelivery = false`: costing-only ไม่เข้า PO Outstanding delivery
11. เมื่อบันทึก สำเร็จเป็น `เปิดอยู่ / ยังไม่รับ`

VAT storage rules:

- `po_buys.has_vat` เก็บผล checkbox
- `po_buys.vat_type` ใช้ `EXCLUDE` เมื่อมี VAT และ `NONE` เมื่อไม่มี VAT
- `po_buys.vat_rate_percent` เก็บ rate snapshot ณ วันที่สร้างหรือแก้เอกสารก่อนถูกตัดรับ
- `po_buys.subtotal`, `po_buys.vat_amount`, `po_buys.total_amount`, `po_buys.remaining_amount` ต้องถูกคำนวณใหม่โดย server
- `PB` ยังเป็นเอกสารที่ตั้ง AP/VAT จริง และสามารถมี VAT ของตัวเองตามบิลจริงได้

## Edit PO Buy

แก้ไขได้เมื่อ:

- PO ยังไม่ยกเลิก
- PO ยังไม่รับครบ
- ไม่มี active PB allocation ที่ทำให้การแก้ supplier/product/qty/price กระทบ downstream หรือมี transaction-safe rebuild policy แล้ว

การแก้ไขต้อง:

- update header/items
- recalc total/remaining จาก active allocation facts
- recalc subtotal/VAT/total/remaining จาก line items และ VAT snapshot
- append status/change log
- ไม่แก้หรือ rewrite PB ที่เคยตัด PO ไปแล้ว

## Cancel PO Buy

ยกเลิกได้เมื่อ:

- ไม่มี active PB allocation
- หรือมี explicit reversal/release flow ที่ปลอดภัย

เมื่อยกเลิก:

- ตั้งสถานะ `ยกเลิก`
- กันไม่ให้ถูกเลือกใน PB
- เอาออกจาก PO Outstanding และ Cost Pool active view
- เก็บ audit/status log
- ไม่ลบ row และไม่ลบประวัติ allocation เดิม

## Close Short / ปิดรับไม่ครบ

ใช้เมื่อ Supplier ส่งของไม่ครบและบริษัทไม่ต้องรอรับยอดคงเหลือแล้ว

กติกา:

- ใช้ได้กับ `requireDelivery = true`
- ใช้ได้เมื่อมี remaining > 0
- ไม่ reverse ยอดที่ PB ตัดไปแล้ว
- ลด/release เฉพาะ remaining ที่ยังไม่รับ
- ตั้ง fulfillment status เป็น `ปิดรับไม่ครบ`
- เอา remaining ออกจาก PO Outstanding และ Cost Pool availability
- ต้องเก็บเหตุผล, ผู้ทำรายการ, วันที่ทำรายการ

## PB Allocation Contract

เมื่อ `PB` เลือก `POB`:

- selector ต้องกรองตาม Supplier, สาขา, product และ remaining qty
- matching สินค้าต้องใช้ internal product id canonical ไม่ใช้ชื่อสินค้า
- multi-product PO ต้องแตก option/remaining ตามสินค้าใน `po_buys.items`
- PB line ที่ตัด PO ต้องไม่เกิน remaining ของ PO item
- PB save ต้อง update PO remaining ใน transaction เดียว
- PB edit/cancel ต้อง release/rebuild PO allocation จาก active facts
- PB supplier swap ต้องไม่ carry PO allocation ข้าม Supplier; PB ใหม่จาก supplier swap ต้องเป็น Spot Buy ตาม [[Purchase Bills Page Flow]]

## Print PO Buy

PO Buy ต้องพิมพ์รายใบและ Save as PDF ได้:

- ใช้ Company Profile ของสาขาเอกสาร
- แสดงเลข `POB`, วันที่เอกสาร, expected delivery, Supplier, ที่อยู่ Supplier, สาขา
- แสดงรายการสินค้า, หน่วยจริง, qty, unit price, amount, remaining qty/amount
- แสดงยอดก่อน VAT, VAT, และยอดรวมเมื่อเอกสารมี VAT snapshot
- แสดงหมายเหตุและช่องลงนาม
- กรณียกเลิกต้องแสดง watermark/status สำหรับ audit
- การพิมพ์ต้องไม่มี side effect: ไม่ตัด PO, ไม่สร้าง WTI, ไม่สร้าง PB, ไม่สร้าง stock ledger

## Reporting / Aging

PO Buy ต้องเข้า aging/report แบบ operational:

- Aging เริ่มจากวันที่สร้างหรือวันที่ expected delivery ตาม report purpose
- หยุดนับเมื่อ `รับครบ`, `ปิดรับไม่ครบ`, หรือ `ยกเลิก`
- PO Outstanding แสดงเฉพาะ `requireDelivery = true` และ active remaining
- Cost Pool แสดงเฉพาะ eligible product และ active available commitment ตาม [[Cost Pool]]

## API / Runtime Checklist

- [x] `GET /api/purchase/po-buy` แสดง status, remaining, purpose, supplier/product/branch display และ VAT snapshot ครบ
- [ ] `POST /api/purchase/po-buy` validate supplier, branch, product, qty, unit, price ฝั่ง server
- [x] `POST /api/purchase/po-buy` รับ checkbox `hasVat`, snapshot VAT rate, และบันทึก subtotal/VAT/total
- [x] `PUT /api/purchase/po-buy` update VAT ได้เฉพาะ PO ที่ยังไม่ถูกตัดรับ และ reconciliation ต้องไม่ทำ VAT หาย
- [ ] `PATCH /api/purchase/po-buy` lock/rebuild downstream allocation อย่างปลอดภัย
- [ ] cancel action ไม่ทำลาย allocation history
- [ ] short-close action release เฉพาะ remaining
- [ ] export/print ใช้ snapshot/history ไม่ drift ตาม master ปัจจุบันเกินจำเป็น
- [ ] timeline/status log แสดง create/edit/cancel/short-close/allocation/release

## Related Docs

- [[Purchase Flow]]
- [[Purchase Bills Page Flow]]
- [[WTI-WTO Flow]]
- [[Cost Pool]]
- [[Payment Flow]]
- [[Document Aging Policy]]
- [[Document Timeline Policy]]
