---
title: WTI Product Summary Design
aliases:
  - WTI Summary Design
  - Weight Ticket Product Summary
  - WTI Product Aggregation
tags:
  - ns-scrap-erp
  - purchase
  - weight-ticket
  - database-design
  - decision
status: draft
created: 2026-05-26
updated: 2026-05-26
---

# WTI Product Summary Design

เอกสารนี้กำหนด target design สำหรับการมีข้อมูล 2 ชั้นใน `ใบรับของ / WTI`:

1. ชั้นดิบตาม lot ชั่งจริง
2. ชั้นสรุประดับสินค้าในเอกสารเดียวกัน

เป้าหมายคือให้ `WTI` เป็น source document ที่ trace ได้จริง แต่ในขณะเดียวกันรองรับงาน office ที่ต้องดึงสินค้า “ทั้งก้อนของสินค้านั้น” ไปใช้ใน `บิลรับซื้อ` โดยไม่ต้องทำ 1 receipt line = 1 bill line เสมอ

## ปัญหาที่ต้องแก้

ปัจจุบัน `WTI` มี:

- header total ทั้งเอกสารใน `weight_tickets.gross_weight / deduct_weight / net_weight`
- raw line ตาม lot ชั่งใน `weight_ticket_lines`

แต่ยังไม่มี summary ระดับสินค้าใน `WTI` เดียวกัน ทำให้:

- สินค้าชนิดเดียวกันที่ชั่งหลาย lot ถูกส่งต่อไป `บิลรับซื้อ` เป็นหลายบรรทัด
- หน้างานบันทึก lot ถูกต้อง แต่ office ใช้งานยาก
- allocation ในอนาคตเสี่ยงผูกกับ raw line แบบละเอียดเกินความจำเป็นของงานออกบิล

## หลักการออกแบบ

### 1. อย่าทำลายข้อมูลดิบ

`weight_ticket_lines` ต้องคงไว้เป็นข้อมูลดิบตาม lot ชั่งจริงเสมอ เพราะใช้สำหรับ:

- audit/reconcile
- รูปภาพต่อรายการ
- หมายเหตุต่อ lot
- ตรวจย้อนกรณีข้อโต้แย้งเรื่องน้ำหนัก/สิ่งเจือปน

ห้าม merge raw lines ทับลง table หลัก

### 2. แยก operational summary ออกจาก raw source

`WTI` ต้องมี 3 ระดับข้อมูลชัดเจน:

1. `Document Header Summary`
   - รวมทั้งเอกสาร
   - มีอยู่แล้วที่ `weight_tickets`
2. `Raw Weighing Lots`
   - เก็บ lot ชั่งจริง
   - มีอยู่แล้วที่ `weight_ticket_lines`
3. `Product Summary`
   - รวมสินค้าชนิดเดียวกันใน WTI เดียวกัน
   - เป็นชั้นที่ `Purchase Bill` ควรใช้

### 3. ใช้ summary ระดับสินค้าเป็น operational source ของบิลรับซื้อ

เมื่อ office เลือก `WTI` เพื่อออก `บิลรับซื้อ Stock`:

- ไม่ควรดึง `weight_ticket_lines` ดิบไปแสดงตรง ๆ
- ควรดึง `WTI Product Summary`
- 1 สินค้าใน WTI = 1 operational row ใน section ใบรับของของ `บิลรับซื้อ`

### 4. ต้อง trace กลับไป raw lots ได้

ถึงแม้ `บิลรับซื้อ` จะใช้งานระดับสินค้า แต่ระบบยังต้องตอบได้ว่า:

- summary row นี้มาจาก raw lines ไหนบ้าง
- raw line ไหนถูกกลุ่มไว้ใต้ summary row ไหน

ดังนั้น design ที่ถูกต้องต้องไม่ทำให้ความสัมพันธ์ raw -> summary หายไป

## Target Data Layers

### Layer A: Header

Table ปัจจุบัน:

- `public.weight_tickets`

หน้าที่:

- metadata เอกสาร
- gross/deduct/net รวมทั้งเอกสาร
- status/cancel/audit fields

### Layer B: Raw Lots

Table ปัจจุบัน:

- `public.weight_ticket_lines`

หน้าที่:

- เก็บ lot ชั่งจริง
- 1 สินค้าอาจมีหลายบรรทัด
- 1 บรรทัดมีรูป/หมายเหตุ/วิธีหักของตัวเองได้

### Layer C: Product Summary

Target ใหม่:

- `public.weight_ticket_product_summaries`

หน้าที่:

- รวม raw lines ของสินค้าเดียวกันภายใต้ `WTI` เดียวกัน
- ใช้เป็น source หลักของการออก `Purchase Bill Stock`
- ใช้เป็นฐานสำหรับ remaining/billed state ระดับสินค้า

## Recommendation

ข้อเสนอที่ถูกโครงที่สุดคือ:

- เพิ่ม table summary จริงใน DB
- ไม่ใช้แค่ UI merge
- ไม่ใช้ derived object เฉพาะ route เดียว

เหตุผล:

1. ใช้ซ้ำได้หลาย module
   - `/purchase/bills`
   - รายงานรับของ
   - allocation/reconciliation
   - detail/print ที่ต้องการมุมมองรวมต่อสินค้า

2. รองรับ state เชิงปฏิบัติการ
   - billed/remaining ต่อสินค้า
   - lock/cancel policy ในอนาคต

3. ลดการ merge logic ซ้ำหลายจุด
   - ไม่ต้องให้แต่ละหน้า aggregate raw lines เองคนละแบบ

4. ทำให้ allocation model สะอาดกว่า
   - purchase bill ควรตัดจาก summary row มากกว่าตัดจาก raw lot ทีละบรรทัด

## Proposed Schema

### 1. `public.weight_ticket_product_summaries`

วัตถุประสงค์:

- เก็บยอดรวมระดับสินค้าใน `WTI/WTO` เดียวกัน

field ที่แนะนำ:

| Field | Type | Notes |
|---|---|---|
| `id` | string PK | summary row id |
| `weight_ticket_id` | string FK | อ้าง `weight_tickets.id` |
| `product_id` | string FK | อ้าง `products.id` |
| `product_name` | string | snapshot ชื่อสินค้า |
| `line_count` | int | จำนวน raw lines ใต้ summary นี้ |
| `gross_weight` | decimal | gross รวมของสินค้านี้ |
| `deduct_weight` | decimal | น้ำหนักหักรวม |
| `net_weight` | decimal | net รวม |
| `billed_weight` | decimal default 0 | ยอดที่ถูกใช้ไปออกบิลแล้ว |
| `remaining_weight` | decimal | `net_weight - billed_weight` |
| `has_mixed_deduction_profiles` | boolean | สินค้าเดียวกันแต่ raw lots มี deduction profile ต่างกันหรือไม่ |
| `created_at` | timestamptz | สร้าง summary |
| `updated_at` | timestamptz | ปรับล่าสุด |

ข้อสังเกต:

- summary row ไม่ควรเก็บ `impurity_id` เดี่ยวเป็นหลัก เพราะสินค้าเดียวกันอาจมีหลาย impurity/mode
- ถ้าต้องการแสดงผล UI อาจมี field ช่วย เช่น `impurity_labels_preview` หรือ derive ตอน read

unique key ที่แนะนำ:

- `unique(weight_ticket_id, product_id)`

### 2. `public.weight_ticket_product_summary_lines`

วัตถุประสงค์:

- เป็น bridge ระหว่าง summary row กับ raw lot lines

field ที่แนะนำ:

| Field | Type | Notes |
|---|---|---|
| `id` | string PK | bridge row id |
| `summary_id` | string FK | อ้าง `weight_ticket_product_summaries.id` |
| `weight_ticket_line_id` | string FK | อ้าง `weight_ticket_lines.id` |
| `created_at` | timestamptz | เวลาผูก |

unique key ที่แนะนำ:

- `unique(summary_id, weight_ticket_line_id)`
- `unique(weight_ticket_line_id)` ถ้า 1 raw line ต้องอยู่ใต้ summary เดียวเสมอ

เหตุผลที่ยังแนะนำ bridge table:

- ทำให้ raw -> summary trace ชัด
- ไม่ต้องพึ่ง query `where weight_ticket_id + product_id` อย่างเดียว
- รองรับอนาคตถ้ากติกาการ group ซับซ้อนกว่า `product_id` เพียงตัวเดียว

## Grouping Rule

### กติกาหลัก

summary ระดับสินค้าควร group โดย:

- `weight_ticket_id`
- `product_id`

ไม่ควร group แยกตาม:

- impurity
- deduction mode
- note
- image

เหตุผล:

- business use case ที่ยืนยันแล้วคือ “สินค้าชนิดเดียวกัน แม้แบ่ง lot ชั่ง เวลาดึงไปใช้ในบิลให้เป็นทั้งก้อนของสินค้านั้น”
- impurity/note/image เป็นรายละเอียดของ raw lot ไม่ใช่ key ของ operational purchase allocation

### แต่ต้องไม่ทำให้รายละเอียดหาย

เมื่อ grouped แล้ว ระบบยังต้อง:

- เก็บ raw lot detail ไว้ครบ
- ระบุได้ว่า summary row นี้มีหลาย lot
- เปิดดู raw lines ใต้ summary ได้ในอนาคต

### Mixed deduction profile

ถ้าสินค้าเดียวกันมี raw lots ที่:

- deduction mode ต่างกัน
- impurity ต่างกัน

ให้ยังรวมเป็น summary row เดียวได้

แต่ควรมี flag:

- `has_mixed_deduction_profiles = true`

เพื่อให้ UI/รายงานสามารถแจ้งได้ว่า summary นี้มาจากหลาย profile

## Write Flow

### ตอนสร้างหรือแก้ไข WTI

เมื่อ save `WTI`:

1. เขียน `weight_tickets`
2. เขียน `weight_ticket_lines`
3. ลบ/refresh summary rows ของ ticket นี้
4. สร้าง `weight_ticket_product_summaries`
5. สร้าง `weight_ticket_product_summary_lines`
6. คำนวณ `remaining_weight = net_weight`

ข้อสำคัญ:

- summary เป็น projection จาก raw lines
- ห้ามให้ user แก้ summary row ตรง ๆ
- source of truth ของการชั่งยังเป็น raw lines

### ตอนยกเลิก WTI

เมื่อเอกสารถูกยกเลิก:

- `weight_tickets.status = cancelled`
- summary rows ของเอกสารนั้นต้องถูก mark/cascade ให้ไม่ใช้ต่อ
- ถ้ามี billed allocation แล้ว ต้อง block การยกเลิกตั้งแต่ business layer

## Read Flow

### Detail Page ของ WTI

ควรแสดงได้ทั้ง 2 มุมมอง:

1. `Raw Lots`
2. `Per-Product Summary`

โดย default อาจยังเน้น raw lots ก่อน เพราะเป็นเอกสารชั่ง

### Purchase Bill Stock Form

เมื่อเลือก `WTI`:

- ดึง `weight_ticket_product_summaries`
- สร้าง bill item เริ่มต้นจาก summary rows
- ไม่ดึง `weight_ticket_lines` ดิบมาเป็น default bill lines

ผลที่คาดหวัง:

- สินค้าชนิดเดียวกันใน WTI แสดงเป็น 1 row
- น้ำหนักรวมต่อสินค้าอ่านง่าย
- form ของ office ไม่แตกเป็นหลายบรรทัดเพราะ lot ชั่ง

## Allocation Direction

ถ้าจะทำให้ถูกโครงต่อเนื่องไปถึง `Purchase Bill`:

- `purchase_bill_items` ควรอ้าง summary layer ไม่ใช่ raw lot line โดยตรง

table ที่ควรตามมาภายหลัง:

- `purchase_bill_receipt_allocations`

field ระดับหลักที่ควรมี:

| Field | Notes |
|---|---|
| `purchase_bill_item_id` | bill line ที่รับของ |
| `weight_ticket_product_summary_id` | summary row ที่ถูกใช้ |
| `allocated_weight` | น้ำหนักที่ตัดไปใช้ |
| `created_at` | audit |

ผลคือ:

- bill item 1 บรรทัดตัดจาก WTI summary 1 row หรือหลาย row ได้
- remaining ของ WTI คิดจาก allocation table ได้สะอาด

## Why Not UI-Only Merge

การ merge แค่ในหน้า `/purchase/bills` ไม่พอ เพราะ:

1. logic จะกระจาย
2. หน้า detail/report/print จะ merge ไม่ตรงกัน
3. save path ยังต้องย้อนแกะกลับ raw line เอง
4. remaining/billed state ระดับสินค้าจะไม่มี source กลาง

ดังนั้น UI-only merge เป็น shortcut ไม่ใช่ target design

## Why Not Replace `weight_ticket_lines`

การรวมตั้งแต่ table หลักไม่ถูก เพราะ:

- lot จริงหาย
- รูป/หมายเหตุ/สิ่งเจือปนต่อ lot หายบริบท
- audit และ dispute trace ย้อนหลังยาก

raw lines ต้องอยู่ต่อ

## Archive / Formula Stability Impact

design นี้ช่วยเรื่อง “เอกสารเก่าไม่ควรถูกกระทบจากสูตรใหม่” ทางอ้อมด้วย:

- raw lines เป็น immutable source ของ lot เดิม
- summary rows เป็น persisted projection ของเอกสาร ณ เวลานั้น
- purchase bill ควรอ้าง summary/allocation ที่ถูก persist แล้ว ไม่ใช่ recompute จาก master data ล่าสุดทุกครั้ง

แต่เอกสารนี้ยังไม่ใช่ archive/versioning solution เต็มรูป

สิ่งที่ยังต้องมีต่อ:

- allocation tables จริง
- status history/log tables
- snapshot policy สำหรับ purchase bill / sales bill / cost calculations

## Implementation Order

ลำดับที่แนะนำ:

1. เพิ่ม schema `weight_ticket_product_summaries`
2. เพิ่ม schema `weight_ticket_product_summary_lines`
3. ปรับ write path ของ `WTI/WTO` ให้ rebuild summary ทุกครั้ง
4. ปรับ read mapper ของ weight-ticket domain ให้ส่งทั้ง raw lines และ product summaries
5. ปรับ `/purchase/bills` ให้ใช้ product summaries
6. ค่อยต่อ allocation tables ระหว่าง `WTI summary -> Purchase Bill`

## Decision

ข้อสรุปที่ใช้เป็น target:

- `weight_ticket_lines` ยังคงเป็น raw lot source of truth
- `weight_tickets` ยังคงเป็น header summary ทั้งเอกสาร
- เพิ่ม `weight_ticket_product_summaries` เป็นชั้นกลางระดับสินค้า
- `Purchase Bill Stock` ต้องใช้ชั้น summary ระดับสินค้า ไม่ใช้ raw lot lines เป็น default source
- ไม่ใช้ UI-only merge เป็นคำตอบระยะยาว

## Open Questions

เรื่องที่ยังต้องตัดสินตอนลง schema จริง:

1. `WTO` จะใช้ product summary table เดียวกันด้วยหรือไม่  
   - recommendation: ใช้ table เดียวกัน เพราะ structure เหมือนกัน ต่างกันที่ `doc_type`

2. `remaining_weight` จะ persist เป็นคอลัมน์ หรือ derive จาก allocation table  
   - recommendation: ช่วงแรก persist ได้เพื่ออ่านเร็ว แต่ source of truth ระยะยาวควรมาจาก allocation table + refresh service

3. UI detail page ของ WTI จะ default โชว์ raw lots หรือ summary  
   - recommendation: raw lots เป็น default และมี summary section เพิ่ม

4. ถ้าสินค้าเดียวกันแต่มีหลาย impurity profile ควรแสดง label อะไรใน summary  
   - recommendation: ไม่เอา impurity เดี่ยวเป็น summary field หลัก; ใช้ flag/preview text แทน
