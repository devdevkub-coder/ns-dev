---
title: Stock Ledger and Stock Balance
aliases:
  - Stock Ledger
  - Stock Balance
  - Inventory Movement and Balance
  - เอกสาร stock ledger และ stock คงเหลือ
tags:
  - ns-scrap-erp
  - stock
  - inventory
  - business-flow
  - decision
status: draft
created: 2026-06-11
updated: 2026-06-12
---

# Stock Ledger and Stock Balance

เอกสารนี้เป็น canonical note สำหรับการแยกความหมายของ:

- `stock_ledger`
- `stock balance` / `stock คงเหลือ`

เพื่อให้ทุก flow ที่กระทบสินค้าใช้หลักเดียวกัน โดยเฉพาะ:

- `WTI`
- `WTO`
- `PB`
- `SB`
- `PSALE` / Pending Sale
- `Stock Transfer`
- `Stock Adjust`
- `Status Convert`
- `Grade Convert`
- `Production`

รายละเอียด DB/API/reversal contract สำหรับ runtime hardening อยู่ที่ [[Stock Ledger DB API Design]]

## Core Principle

ต้องแยก 2 เรื่องนี้ออกจากกันชัดเจน:

1. `stock_ledger`
   - คือ fact ของ movement
   - เก็บว่า “อะไรเกิดขึ้น” กับสินค้า
2. `stock balance`
   - คือค่าคงเหลือที่คำนวณจาก movement facts
   - ตอบว่า “ตอนนี้เหลือเท่าไร” ภายใต้มิติที่เลือก

สรุปสั้น:

- `stock_ledger` = event history
- `stock balance` = derived snapshot

## What Stock Ledger Is

`stock_ledger` คือ operational source of truth ของ movement สินค้า

แต่ละ row ต้องตอบได้อย่างน้อย:

- วันไหน
- สินค้าอะไร
- เข้า หรือ ออก
- จำนวนเท่าไร
- อยู่สาขาไหน
- อยู่คลังไหน
- มาจากเอกสารอะไร
- movement type อะไร

ตารางนี้ไม่ได้มีไว้ตอบแค่ว่า “เหลือเท่าไร” แต่มีไว้ตอบว่า:

- ของเข้าจากอะไร
- ของออกจากอะไร
- ใครเป็นต้นทาง/ปลายทางของ movement
- ถ้าสต็อกผิด ต้องย้อน trace จาก row ไหน

## What Stock Balance Is

`stock balance` ไม่ใช่ตาราง fact แยกในหลักการปัจจุบัน

มันคือผลรวมสะสมของ `stock_ledger` ภายใต้ key ที่กำหนด เช่น:

- product
- branch
- warehouse
- lot
- status / output category
- available vs not available

สูตรพื้นฐาน:

```text
stock balance = sum(qty_in) - sum(qty_out)
stock value   = sum(value_in) - sum(value_out)
```

สำหรับ stock ที่พร้อมใช้/พร้อมส่ง ต้องแยก reservation layer เพิ่ม:

```text
on_hand_qty   = sum(stock_ledger.qty_in - stock_ledger.qty_out)
on_hold_qty   = sum(active stock_holds.qty)
available_qty = on_hand_qty - on_hold_qty
```

ดังนั้น:

- หน้า `/stock/ledger` = ดู movement rows
- หน้า `/stock/balance` = ดูผลรวมคงเหลือจาก movement rows
- `คลัง` ในหน้า balance ยังหมายถึง warehouse ตาม ledger key
- technical `status / output category` ยังหมายถึง `RM/WIP/FG`
- ในหน้า `/stock/balance` ให้ label user-facing ของ `status / output category` เป็น `คลัง` ตามภาษาหน้างาน
- `On Hold` เป็น reservation overlay จาก active `stock_holds` เมื่อ `on_hold_qty > 0`; ไม่ใช่ ledger movement และไม่แทน `RM/WIP/FG`

## Source Of Truth Rule

กฎกลาง:

- movement source of truth = `stock_ledger`
- balance source of truth = ค่าที่ aggregate จาก `stock_ledger`

สิ่งที่ไม่ควรเป็น source of truth ของ stock balance:

- `purchase_bills.items`
- `sales_bills.items`
- `weight_tickets` header totals
- ค่า cached remaining ที่ค้างใน header ใด ๆ โดยไม่ recalc

เอกสารต้นทางเหล่านี้เป็น business document และ snapshot ของธุรกรรม
แต่ไม่ควรเป็นตัวตอบ stock on hand โดยตรง

## Current Next App Read Model

ใน active Next app ตอนนี้ helper หลักอยู่ที่:

- [apps/next/src/lib/server/stock.ts](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/apps/next/src/lib/server/stock.ts:1)

พฤติกรรมปัจจุบัน:

- `stockBalanceSnapshot()` อ่าน `stock_ledger`
- group ตาม `product + branch + warehouse + lot + output_category + not_available_for_sale`
- คำนวณ `qty`, `value`, และ `avgCost`
- มี durable `stock_holds` table/service สำหรับ WTO แล้ว และ current `/stock/balance` read model แสดง `onHoldQty` / `readyQty`
- filter/export `On Hold` ใช้ `GET /api/stock/balance?onHold=1` หลังคำนวณ hold ไม่ปนกับ `status=RM/WIP/FG`

API read contract ปัจจุบัน:

- `GET /api/stock/ledger` = movement history
- `GET /api/stock/balance` = aggregated stock balance from ledger

## API Alignment Snapshot

ตรวจ ณ 2026-06-11 เทียบกับ target docs:

| API / module | สถานะ | หมายเหตุ |
|---|---|---|
| `GET /api/stock/ledger` | ตรง target | อ่าน movement rows จาก `stock_ledger` |
| `GET /api/stock/balance` | ตรง target หลัก | aggregate จาก `stock_ledger` และแสดง derived `จองไว้ / พร้อมส่ง` จาก active `stock_holds`; hold ไม่ถูกแสดงเป็น ledger row |
| `GET /api/daily/weight-tickets/options` | ตรง target | เป็น page-scoped options สำหรับ branch/supplier/customer/impurity; warehouse options แยกตาม branch + product |
| `GET /api/daily/weight-tickets/stock-options` | เพิ่มแล้ว | ส่งคลัง `RM/FG` ของสาขาและ `onHand/onHold/available` ตาม product ที่เลือก ใช้ใน WTO create/edit |
| `GET /api/daily/weight-tickets/products` | ตรงบางส่วน | ส่ง product options พร้อม `thumbnailUrl` แล้ว; ไม่ควรส่ง stock ทุกคลังมากับ route นี้ เพราะจะหนักและขึ้นกับ branch/warehouse |
| `POST /api/daily/weight-tickets` | ตรง target สำหรับ hold | สร้าง WTI/WTO header/line/summary ได้, WTI/WTO ไม่เขียน stock ledger เอง, WTO validate warehouse/available และสร้าง active hold |
| `PUT /api/daily/weight-tickets/{id}` | ตรง target สำหรับ hold | edit เอกสารได้เมื่อยังไม่ถูกใช้; WTO release hold เดิมและ rebuild hold ใหม่ใน transaction |
| `PATCH /api/daily/weight-tickets/{id}` | ตรง target สำหรับ hold | cancel/status action; WTO mark active hold เป็น `cancelled` |
| `POST/PATCH /api/purchase/bills` | ตรง target หลักสำหรับ PB Stock ledger | create เขียน `PB`; cancel/supplier swap append `PB-CANCEL`; edit append `PB-EDIT-REV` แล้ว append `PB` state ใหม่ โดยไม่ delete/rebuild ledger เดิม |
| `POST /api/sales/bills` | ตรง target create flow | validate ให้ WTO ที่เลือก allocate ครบใน SB เดียว, consume active hold, เขียน `stock_ledger.ref_type = SB`, update WTO usage/status log และ status เป็น `billed` |
| `PATCH /api/sales/bills/{docNo}` | เพิ่มแล้วและ browser QA แล้วสำหรับ cancel | action `cancel` block เมื่อมี active RCP, เขียน `stock_ledger.ref_type = SB-CANCEL`, reopen consumed WTO hold, append `released_from_sales_bill`, คืน WTO เป็น `delivered`, reverse PO Sell header + item outstanding, และ append `sales_bill_status_logs` |
| `GET /api/stock/reconciliation` | เพิ่มแล้ว | ตรวจ orphan ledger, source docs ที่ไม่มี ledger, cancelled PB/SB net ไม่กลับศูนย์, cancelled SB hold ที่ยัง consumed, และ aggregate stock balance ติดลบ |

สรุป: read API ของ stock ตรง target แล้ว และ target write model กลับมาเป็น bill-driven ตาม legacy:

- `PB Stock` เป็น owner ของ stock-in
- `SB Stock` เป็น owner ของ stock-out
- `WTI/WTO` เป็น source evidence และ usage control ไม่ใช่ movement owner
- `WTO` ต้องสร้าง stock hold/reservation เพื่อกันยอดสินค้าก่อนออก `SB`
- implementation gap หลักที่เหลือหลัง PB/SB/PSALE hardening รอบ 2026-06-12 คือ durable allocation tables บางชนิด, PB edit/cancel browser QA, PSALE/SB-from-PSALE browser QA, และ browser QA ของ reconciliation report UI

## Business Keys For Balance

ยอดคงเหลือไม่ได้มีแค่ “สินค้านี้เหลือกี่กิโล”

ในระบบนี้ต้องคิดอย่างน้อยตามมิติเหล่านี้:

- `product`
- `branch`
- `warehouse`
- `lot_no`
- `output_category`
- `not_available_for_sale`

ดังนั้น stock ของสินค้าเดียวกันคนละคลัง ต้องถือว่าเป็นคนละกองเสมอ

ให้ถือว่า `warehouse` หรือ `คลัง` คือ stock location ของระบบ:

```text
stock location key = branch + warehouse
stock balance key  = branch + warehouse + product + lot/status flags
```

ผลต่อการออก `WTO`:

- user เลือกสินค้าก่อน
- จากนั้นเลือกคลังจริงของสาขานั้น ไม่ใช่เลือกแค่คำว่า `RM` หรือ `FG`
- ถ้าสาขานั้นมีคลัง RM/FG หลายคลัง ต้องแสดงให้เลือกทุกคลังที่ active
- คลังที่เลือกใน `WTO` คือ intended stock location ที่ `SB` ต้องใช้ตัด stock ภายหลัง
- ถ้าอยากเปลี่ยนคลังหลังบันทึก WTO ต้องเป็น edit/rebuild hold ก่อนถูกใช้ ไม่ใช่ให้ `SB` เปลี่ยนเองเงียบ ๆ

โดยเฉพาะ `WTO`:

- UX target ให้เลือก `product` ก่อนเพื่อให้ user ทำงานเร็ว
- จากนั้นต้องเลือก `warehouse` ต่อ line
- stock คงเหลือจะรู้จริงหลังมีทั้ง `product + branch + warehouse`
- ก่อน save ต้อง validate ว่า line-level warehouse เป็นคลัง `RM` หรือ `FG` ที่ active และอยู่ในสาขาเดียวกัน
- `WTO` ต้อง validate จาก `available_qty` ไม่ใช่ `on_hand_qty`
- เมื่อ save `WTO` ต้องสร้าง active hold/reservation ตาม `สินค้า + สาขา + คลัง + จำนวน`
- movement จริงยังเกิดตอนบันทึก `SB`
- `SB` ต้อง validate active hold ซ้ำใน transaction, consume hold, แล้วเขียน stock-out ledger

## Stock Hold / Reservation Layer

`stock hold` คือ reservation fact ไม่ใช่ stock movement

หน้าที่ของ hold:

- กันไม่ให้เอกสารขาออกหลายใบจองสินค้าเดียวกันเกิน stock จริง
- ลด `available_qty` แต่ไม่ลด `on_hand_qty`
- ทำให้ user เห็นว่า stock ยังอยู่ในระบบ แต่ถูกจองไว้แล้ว

กติกา:

- `WTO save` ต้องสร้าง active hold
- `WTO edit` ที่ยังไม่ถูกใช้ ต้อง rebuild hold ให้ตรงข้อมูลใหม่
- `WTO cancel` ที่ยังไม่ถูกใช้ ต้อง release hold
- `SB save from WTO` ต้อง consume hold แล้วสร้าง `stock_ledger.ref_type = SB`
- `SB cancel` ต้อง reverse `SB` ledger และ reopen/recreate hold ของ WTO ที่กลับไปรอออกบิล ถ้า WTO ยัง active

สถานะ hold target:

| status | ความหมาย |
|---|---|
| `active` | จอง stock ไว้แล้ว ยังไม่ออก SB |
| `consumed` | ถูกใช้ตอนบันทึก SB แล้ว |
| `released` | ปล่อยคืนเพราะ WTO ถูกยกเลิกหรือแก้ไข |
| `cancelled` | ปิด hold จากการยกเลิก/reversal ที่ไม่ควรนำกลับมาใช้ |

target table/read model ควรเก็บอย่างน้อย:

- `source_type` เช่น `WTO`
- `source_doc_no`
- `source_line_ref` หรือ `summary_ref`
- `product_id`
- `branch_id`
- `warehouse_id`
- `qty`
- `status`
- `held_at`, `released_at`, `consumed_at`
- `consumed_by_ref_type` / `consumed_by_ref_no` เช่น `SB`, `SB012606-0001`

user-facing label:

- `คงเหลือจริง` = on hand
- `จองไว้` = on hold
- `พร้อมใช้` หรือ `พร้อมส่ง` = available

จุดที่ต้องแสดง hold:

- หน้า `/stock/balance`: แสดง `คงเหลือจริง`, `จองไว้`, `พร้อมใช้`
- หน้า create/edit `WTO`: หลังเลือกสินค้า + คลัง ให้แสดง 3 ค่านี้ และ validate จาก `พร้อมส่ง`
- detail ของสินค้า/คลัง: แสดงว่า hold มาจาก `WTO` ใด ลูกค้าใด จำนวนเท่าไร
- detail ของ `WTO`: แสดงรายการ hold ต่อสินค้า/คลัง
- หน้า create `SB` จาก `WTO`: แสดงว่า hold นี้จะถูก consume แล้วตัด stock จริงเมื่อ save

ข้อห้าม:

- ห้ามแสดง hold เป็น row ใน `/stock/ledger`
- ห้ามใช้ hold คำนวณ WAC หรือ stock value โดยตรง
- ห้ามให้ `SB` ตัด stock จาก warehouse อื่นโดยไม่มี release/recreate hold และ audit ชัดเจน

## Movement Ownership By Document

### เอกสาร/flow ที่ควรเป็นเจ้าของ movement

| Source | Movement ที่ควรเกิด |
|---|---|
| `PB Stock` | รับซื้อเข้า / stock in จาก `WTI` source |
| `SB Stock` | ขายออก / stock out จาก `WTO` source |
| `Pending Sale / PSALE` | เบิกสินค้าออกจากคลังจริงก่อนเปิด `SB`; `SB` ที่สร้างจาก `PSALE` ห้ามตัด stock ซ้ำ |
| `Stock Transfer` | ออกจากคลังต้นทาง + เข้าคลังปลายทาง |
| `Stock Adjust` | เพิ่มหรือลดตามผลตรวจนับ |
| `Status Convert` | ออกจาก status เดิม + เข้าสถานะใหม่ |
| `Grade Convert` | ออกจากสินค้าต้นทาง + เข้าสินค้าปลายทาง |
| `Production Input/Output` | วัตถุดิบออกเข้า WIP, WIP ออก, FG/RM/Return เข้า, Loss ออก |

### เอกสารที่ไม่ควรเป็น owner หลักของ movement

| Source | บทบาทที่ควรเป็น |
|---|---|
| `WTI` | field evidence / receipt source / source snapshot สำหรับ `PB` |
| `WTO` | field evidence / delivery source / source snapshot สำหรับ `SB` |
| `PO Buy` | reservation / commitment |
| `PO Sell` | reservation / commitment |

หมายเหตุ:

- `WTI/WTO` เป็นเอกสารหน้างานและควบคุมการใช้ซ้ำ แต่ไม่เขียน stock movement
- `PB/SB` เป็นจุด post stock movement เพราะเป็นเอกสารที่ล็อก billing, ราคา, costing, และ AP/AR พร้อมกันตาม legacy
- `PSALE` เป็นข้อยกเว้นที่ถูกต้องเมื่อ stock ออกจากคลังจริงก่อน billing; target ต้องเก็บ `PSALE` ledger ไว้เป็น fact และ link ไป `SB` แทนการลบ `PSALE` แล้วสร้าง `SB` stock-out ใหม่แบบ legacy

## WTI / WTO Contract

### Target state

- `WTI save` = บันทึกหลักฐานรับของจริง แต่ยังไม่เขียน stock ledger
- `PB Stock save` = รับ stock เข้า โดยอ้าง `WTI`
- `WTO save` = บันทึกหลักฐานส่งของจริง / intended warehouse และสร้าง active stock hold แต่ยังไม่เขียน stock ledger
- `SB Stock save` = consume stock hold แล้วตัด stock ออกโดยอ้าง `WTO`
- `WTI/WTO` ต้องถูกใช้ครบทั้งใบใน `PB/SB` เดียว และถูก lock หลังถูกใช้

### Current state ณ 2026-06-11

ผลตรวจ DB ล่าสุดใน `dev-target`:

- `stock_ledger` ตอนนี้มี `ref_type = 'PB'` เท่านั้น
- ยังไม่พบ `ref_type = 'WTI'`
- ยังไม่พบ `ref_type = 'WTO'`

แปลว่า current runtime ฝั่งรับซื้อสอดคล้องกับ target bill-driven แล้วในหลักการ เพราะ `WTI` ไม่เขียน movement และ `PB` เป็นคนเขียน stock-in

ดังนั้น ณ ตอนนี้:

- stock-in ของระบบยังเป็น `purchase-bill-driven`
- `WTI/WTO` ไม่ใช่ stock movement source of truth
- ยังต้องตรวจ/เติมให้ `SB Stock` เป็น `sales-bill-driven stock-out` ให้ครบเหมือน legacy

## Pending Sale / PSALE Contract

`Pending Sale` ใช้เมื่อของถูกเบิกออกจากคลังจริงก่อนเปิดบิลขาย

กติกา target:

- `PSALE save` = เขียน `stock_ledger.ref_type = PSALE`, `movement_type = PENDING_SALE_OUT`
- `PSALE pending` = on hand ลดแล้ว แต่ยังไม่เกิด AR
- `SB from PSALE` = สร้างลูกหนี้/AR แต่ไม่เขียน stock-out ซ้ำ
- `PSALE converted` = เก็บ link ไป `SB` และห้ามใช้ซ้ำ
- `PSALE cancel before SB` = append `PSALE-CANCEL`, reopen WTO hold เป็น `active`, คืน WTO เป็น `delivered`
- `SB cancel from PSALE` = cancel `SB` แต่ reverse stock ที่เจ้าของ movement เดิม (`PSALE`) ด้วย `PSALE-CANCEL`; ห้ามเขียน `SB-CANCEL` stock row ซ้ำ
- ห้ามลบ `PSALE` ledger ตอน convert เป็น `SB`; legacy ทำแบบนั้นและถือเป็นจุดที่ต้องปรับ

ดูรายละเอียดที่ [[Pending Sale Page Flow]]

## Edit And Cancel Rules

เมื่อ document ที่เป็น owner ของ movement ถูกแก้หรือยกเลิก กติกาต้องเป็น:

### Edit

- reverse movement เดิม
- validate ข้อมูลใหม่
- create movement ใหม่
- ต้องอยู่ใน transaction เดียวกัน

### Cancel

- reverse movement เดิม
- ห้ามเหลือ movement กำพร้า

### Lock

- ถ้า `WTI` ถูกใช้ใน active `PB` แล้ว ต้อง lock edit/cancel ของ `WTI`
- ถ้า `WTO` ถูกใช้ใน active `SB` แล้ว ต้อง lock edit/cancel ของ `WTO`
- ถ้า `PB/SB` ถูกแก้หรือยกเลิก ต้อง reverse/rebuild movement ของ `PB/SB` และ release/recalc usage ของ `WTI/WTO`
- การแก้หรือยกเลิก `WTI/WTO` ที่ยังไม่ถูกใช้ ไม่ต้อง reverse stock เพราะยังไม่มี stock movement ที่เอกสารนั้นสร้าง
- ถ้า `PSALE` ยังไม่ converted แล้วถูกแก้/ยกเลิก ต้อง reverse/rebuild `PSALE` movement ใน transaction
- ถ้า `PSALE` converted เป็น `SB` แล้ว ต้อง lock edit/cancel ของ `PSALE`; การยกเลิก `SB` ต้อง reverse `PSALE` ด้วย `PSALE-CANCEL`, reopen WTO hold, และไม่สร้าง `SB-CANCEL` stock row

## Ref Type / Movement Type Principle

ควรแยก 2 field นี้ให้ทำหน้าที่คนละอย่าง:

### `ref_type`

ใช้ตอบว่า row นี้มาจากเอกสาร/flow อะไร เช่น:

- `WTI`
- `WTO`
- `PB`
- `SB`
- `PSALE`
- `ST`
- `SA`
- `SC`
- `GC`
- `PI`
- `PO2`

### `movement_type`

ใช้ตอบความหมายเชิงธุรกิจของ movement เช่น:

- รับสินค้าเข้า
- ส่งสินค้าออก
- โอนออก
- โอนเข้า
- ปรับเพิ่ม
- ปรับลด
- แปลงสถานะออก
- แปลงสถานะเข้า

หลักคือ:

- `ref_type` = source document family
- `movement_type` = operational meaning

## Stock Balance Must Stay Derived

ถ้าจะมี table/cache สำหรับ stock summary ในอนาคต ให้ถือเป็น optimization เท่านั้น

หลักการต้องยังเป็น:

- rebuild หรือ recalc ได้จาก `stock_ledger`
- ถ้า summary/cache ไม่ตรง ให้เชื่อ `stock_ledger` ก่อน

ห้ามทำให้ stock summary กลายเป็น source of truth ใหม่โดยไม่มี reconciliation ชัดเจน

## Page-Level Meaning

### `/stock/ledger`

ใช้ตอบคำถาม:

- movement นี้มาจากไหน
- วันที่ไหนมีของเข้า/ออก
- มี row ไหนทำให้ stock ติดลบ
- เอกสารไหนเป็นต้นเหตุ

### `/stock/balance`

ใช้ตอบคำถาม:

- ตอนนี้เหลือเท่าไร
- ถูกจองไว้เท่าไร
- พร้อมใช้/พร้อมส่งเท่าไร
- เหลือที่สาขาไหน
- เหลือที่คลังไหน
- เหลือเป็น RM / WIP / FG เท่าไร
- ของที่ห้ามขายมีเท่าไร

## Implementation Direction

ลำดับที่ควรยึด:

1. ล็อก owner ของ movement ให้ชัดในแต่ละ flow โดย `PB/SB` เป็น owner ของ stock buy/sell
2. ให้ทุก bill write path เขียน `stock_ledger` แบบ traceable
3. ให้ `/stock/balance` derive จาก `stock_ledger` เท่านั้น
4. ค่อยทำ optimization เช่น summary/cache/materialized read model

## Open Decisions To Track

- dedicated allocation tables ของ SB/PO Sell/Spot Sale/Customer advance ต้องแยกจาก JSON snapshot อย่างไร
- reconciliation UI/report ที่เพิ่มแล้วต้องมี browser QA และ test dataset สำหรับ:
  - WTI/WTO holds
  - PB/SB/PSALE/PI/PO2 source docs
  - stock_ledger
  - stock balance

## Related Notes

- [[Stock Balance Page Flow]]
- [[Stock Ledger Page Flow]]
- [[Stock Transfer Page Flow]]
- [[Stock Status Convert Page Flow]]
- [[Stock Convert Page Flow]]
- [[Stock Adjust Page Flow]]
- [[WTI-WTO Flow]]
- [[Purchase Flow]]
- [[Sales Flow]]
- [[Purchase Bills Page Flow]]
- [[Sales Bills Page Flow]]
