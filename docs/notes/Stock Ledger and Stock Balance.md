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
updated: 2026-06-24
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
- `WTO pending_out` / รอออก
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
WAC / avg cost = stock value / stock balance
```

สำหรับ stock ที่พร้อมใช้/พร้อมส่ง ต้องแยก reservation layer เพิ่ม:

```text
on_hand_qty   = sum(stock_ledger.qty_in - stock_ledger.qty_out)
pending_out_qty = sum(active stock_holds.qty)
available_qty   = on_hand_qty - pending_out_qty
```

ดังนั้น:

- หน้า `/stock/ledger` = ดู movement rows
- หน้า `/stock/balance` = ดูผลรวมคงเหลือจาก movement rows
- `คลัง` ในหน้า balance ยังหมายถึง warehouse ตาม ledger key
- technical `status / output category` ยังหมายถึง `RM/WIP/FG`
- ในหน้า `/stock/balance` ให้ label user-facing ของ `status / output category` เป็น `คลัง` ตามภาษาหน้างาน
- `pending_out / รอออก` เป็น reservation overlay จาก active `stock_holds`; ไม่ใช่ ledger movement และไม่แทน `RM/WIP/FG`

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

## Real-time And Historical Stock Rule

Stock read model ต้องตอบได้ 2 แบบด้วยหลักเดียวกัน:

| Mode | Cutoff | ใช้ทำอะไร | Source |
|---|---|---|---|
| Real-time / ปัจจุบัน | เวลาปัจจุบันของ DB/server | หน้า stock balance, stock option ตอนสร้าง WTO/SB, dashboard ปัจจุบัน | `stock_ledger` ทั้งหมดที่ active/post แล้ว + active `stock_holds` |
| Historical as-of / ย้อนหลัง | `asOf` หรือสิ้นวันที่ report เลือก | Dashboard ย้อนหลัง, รายงานรายวัน/เดือน/ปี, audit ยอด ณ วันเก่า | `stock_ledger` ถึง cutoff นั้น + hold/usage facts ถึง cutoff นั้น |

ทั้งสอง mode ต้องคำนวณจำนวนและต้นทุนเฉลี่ยด้วย cutoff เดียวกัน:

```text
qty_as_of   = sum(qty_in - qty_out where ledger_date <= cutoff)
value_as_of = sum(value_in - value_out where ledger_date <= cutoff)
WAC_as_of   = value_as_of / qty_as_of
```

ถ้า `qty_as_of = 0` ให้ `WAC_as_of` เป็น 0 หรือ null ตาม contract ของ API แต่ห้ามใช้ WAC ปัจจุบันแทน WAC ย้อนหลัง

`pending_out` จาก `WTO` ไม่เปลี่ยน `qty_as_of`, `value_as_of`, หรือ `WAC_as_of` เพราะยังไม่ใช่ stock ledger movement. แต่ถ้า dashboard ต้องแสดง `รอออก` ย้อนหลัง ต้อง reconstruct จาก `stock_holds` lifecycle/usage facts ถึง cutoff เดียวกัน แล้วคำนวณ:

```text
available_as_of = qty_as_of - pending_out_as_of
```

ถ้ามีการบันทึกย้อนหลัง, cancel, reverse, หรือรับของคืนที่มีผลกับวันเก่า ต้อง rebuild stock daily snapshot ตั้งแต่วันที่ได้รับผลกระทบถึงวันปัจจุบัน เพราะ WAC ของวันถัดไปอาจเปลี่ยนต่อเนื่อง

## API Alignment Snapshot

ตรวจ ณ 2026-06-11 เทียบกับ target docs:

| API / module | สถานะ | หมายเหตุ |
|---|---|---|
| `GET /api/stock/ledger` | ตรง target | อ่าน movement rows จาก `stock_ledger` |
| `GET /api/stock/balance` | ตรง target หลัก | aggregate จาก `stock_ledger` และแสดง derived `รอออก / พร้อมส่ง` จาก active `stock_holds`; pending_out ไม่ถูกแสดงเป็น ledger row |
| `GET /api/daily/weight-tickets/options` | ตรง target | เป็น page-scoped options สำหรับ branch/supplier/customer/impurity; warehouse options แยกตาม branch + product |
| `GET /api/daily/weight-tickets/stock-options` | เพิ่มแล้ว | ส่งคลัง `RM/FG` ของสาขาและ `onHand/onHold/available` ตาม product ที่เลือก ใช้ใน WTO create/edit |
| `GET /api/daily/weight-tickets/products` | ตรงบางส่วน | ส่ง product options พร้อม `thumbnailUrl` แล้ว; ไม่ควรส่ง stock ทุกคลังมากับ route นี้ เพราะจะหนักและขึ้นกับ branch/warehouse |
| `POST /api/daily/weight-tickets` | ตรง target สำหรับ hold | สร้าง WTI/WTO header/line/summary ได้, WTI/WTO ไม่เขียน stock ledger เอง, WTO validate warehouse/available และสร้าง active hold |
| `PUT /api/daily/weight-tickets/{id}` | ตรง target สำหรับ hold | edit เอกสารได้เมื่อยังไม่ถูกใช้; WTO release hold เดิมและ rebuild hold ใหม่ใน transaction |
| `PATCH /api/daily/weight-tickets/{id}` | ตรง target สำหรับ hold | cancel/status action; WTO mark active hold เป็น `cancelled` |
| `POST/PATCH /api/purchase/bills` | ตรง target หลักสำหรับ PB Stock ledger | create เขียน `PB`; cancel/supplier swap append `PB-CANCEL`; edit append `PB-EDIT-REV` แล้ว append `PB` state ใหม่ โดยไม่ delete/rebuild ledger เดิม |
| `POST /api/sales/bills` | ตรง target create flow | validate ให้ WTO ที่เลือก allocate ครบใน SB เดียว, consume active hold, เขียน `stock_ledger.ref_type = SB`, update WTO usage/status log และ status เป็น `billed` |
| `PATCH /api/sales/bills/{docNo}` | เพิ่มแล้วและ browser QA แล้วสำหรับ cancel | action `cancel` block เมื่อมี active RCP, เขียน `stock_ledger.ref_type = SB-CANCEL`, append `released_from_sales_bill`, reverse PO Sell header + item outstanding, และ append `sales_bill_status_logs`; reopen consumed WTO hold เฉพาะกรณียังไม่มี return-from-WTO/SB ถ้าเคยรับคืนแล้วให้คืน stock ตรงด้วย `SB-CANCEL` และคง return/diff audit |
| `GET /api/stock/reconciliation` | ถอดออกแล้ว | ไม่เป็น active API/page แล้ว; การตรวจ stock ใช้ cross-check ใน flow ยกเลิก/แก้ไขของแต่ละเอกสารและ contract automation เฉพาะ flow |

สรุป: read API ของ stock ตรง target แล้ว และ target write model กลับมาเป็น bill-driven ตาม legacy:

- `PB Stock` เป็น owner ของ stock-in
- `SB Stock` เป็น owner ของ stock-out
- `WTI/WTO` เป็น source evidence และ usage control ไม่ใช่ movement owner
- `WTO` ต้องสร้าง `pending_out` เพื่อกันยอดสินค้าก่อนออก `SB`
- implementation gap หลักหลังตัด PSALE ออกจาก target คือทำให้เอกสาร/QA/report ใช้ `WTO -> pending_out -> SB` เป็น flow เดียวกันทั้งหมด; หน้า stock reconciliation ถูกถอดออกจาก active surface แล้ว

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
- เมื่อ save `WTO` ต้องสร้าง active `pending_out` ตาม `สินค้า + สาขา + คลัง + จำนวน`
- movement จริงยังเกิดตอนบันทึก `SB`
- `SB` ต้อง validate active hold ซ้ำใน transaction, consume hold, แล้วเขียน stock-out ledger

## Pending Out / Reservation Layer

`pending_out` คือ reservation fact ไม่ใช่ stock movement

หน้าที่ของ pending_out:

- กันไม่ให้เอกสารขาออกหลายใบจองสินค้าเดียวกันเกิน stock จริง
- ลด `available_qty` แต่ไม่ลด `on_hand_qty`
- ทำให้ user เห็นว่า stock ยังอยู่ในระบบ แต่รอออกแล้ว

กติกา:

- `WTO save` ต้องสร้าง active `pending_out`
- `WTO edit` ที่ยังไม่ถูกใช้ ต้อง rebuild `pending_out` ให้ตรงข้อมูลใหม่
- `WTO cancel` ที่ยังไม่ถูกใช้ ต้อง release `pending_out`
- `SB save from WTO` ต้อง consume `pending_out` แล้วสร้าง `stock_ledger.ref_type = SB`
- `SB save from WTO` แบบขายไม่ครบต้อง consume เฉพาะส่วนที่ออกบิลและคง remaining `pending_out` สำหรับรับของคืน
- ถ้า `SB` commercial qty มากกว่า WTO source qty ต้อง cap stock consume ที่ยอด `pending_out` ของ WTO เท่านั้น เช่น WTO 100 แต่ SB 120 ให้ `SB qty_out/COGS = 100`; ส่วนเกินเป็นยอดการค้า/AR หรือ validation error ตาม policy หน้าจอ แต่ห้ามสร้าง stock movement เกิน source
- `WTO return` ต้องเป็น action ที่อิง `WTO + สินค้า + คลัง` ไม่ใช่ action ที่อิง `SB`; `SB` ใช้เป็น reference/audit เท่านั้น
- `WTO return` คืนครบต้อง release active `pending_out` โดยไม่เขียน ledger เพราะของยังอยู่ใน on-hand; ถ้าชั่งคืนจริงน้อยกว่า pending_out ต้องบังคับเหตุผลและเขียน `stock_ledger.ref_type = WTO-RETURN-LOSS` 1 row ต่อสินค้า+คลังสำหรับส่วนขาด
- `WTO-RETURN-LOSS` ห้ามแตก row ตามเต๋า, line, internal `stock_holds`, หรือ cost portion; ถ้ามี internal rows หลายชุดต้อง aggregate เป็น business movement เดียวก่อนเขียน ledger
- `SB cancel` ต้อง reverse `SB` ledger ตาม stock movement ที่เคย post จริง และ reopen/recreate `pending_out` ของ WTO เท่าจำนวนที่เคย consume จริง ถ้า WTO ยัง active และยังไม่มี return/loss จาก SB นั้น; ถ้ามี return/loss แล้วห้าม reopen pending_out ซ้ำ

สถานะ pending_out target:

| status | ความหมาย |
|---|---|
| `active` | รอออกไว้แล้ว ยังไม่ออก SB |
| `consumed` | ถูกใช้ตอนบันทึก SB แล้ว |
| `returned` | คืน stock กลับจาก remaining pending_out ด้วยน้ำหนักชั่งจริงแล้ว |
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
- `รอออก` = pending_out
- `พร้อมใช้` หรือ `พร้อมส่ง` = available

จุดที่ต้องแสดง pending_out:

- หน้า `/stock/balance`: แสดง `คงเหลือจริง`, `รอออก`, `พร้อมใช้`
- หน้า create/edit `WTO`: หลังเลือกสินค้า + คลัง ให้แสดง 3 ค่านี้ และ validate จาก `พร้อมส่ง`
- detail ของสินค้า/คลัง: แสดงว่า pending_out มาจาก `WTO` ใด ลูกค้าใด จำนวนเท่าไร
- detail ของ `WTO`: แสดงรายการ pending_out ต่อสินค้า/คลัง
- หน้า create `SB` จาก `WTO`: แสดงว่า pending_out นี้จะถูก consume แล้วตัด stock จริงเมื่อ save

ข้อห้าม:

- ห้ามแสดง pending_out เป็น row ใน `/stock/ledger`
- ห้ามใช้ pending_out คำนวณ WAC หรือ stock value โดยตรง
- ห้ามให้ `SB` ตัด stock จาก warehouse อื่นโดยไม่มี release/recreate pending_out และ audit ชัดเจน

## Movement Ownership By Document

### เอกสาร/flow ที่ควรเป็นเจ้าของ movement

| Source | Movement ที่ควรเกิด |
|---|---|
| `PB Stock` | รับซื้อเข้า / stock in จาก `WTI` source |
| `SB Stock` | ขายออก / stock out จาก `WTO` source |
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
- `Pending Sale / PSALE` เป็น legacy flow ที่ถอดออกจาก target runtime แล้ว; flow ใหม่ต้องใช้ `WTO -> pending_out -> SB` เท่านั้น

## WAC Movement Policy

กติกากลางของต้นทุนเฉลี่ย:

- `PB Stock save` เป็น stock-in และเป็นจุดที่ทำให้จำนวน, stock value, และ WAC ปัจจุบันเปลี่ยนตามราคาซื้อของบิลนั้น
- `PB cancel` ต้อง append `PB-CANCEL` เป็น stock-out ด้วย unit cost/value เดิมของ `PB` ที่ถูกยกเลิก แล้วให้ WAC ปัจจุบันคำนวณใหม่จาก ledger ที่เหลือ
- `SB Stock save` เป็น stock-out และใช้ WAC ณ ตอนออกบิลขายเป็น COGS snapshot ใน `stock_ledger.unit_cost/value_out`
- `SB cancel` ต้องคืน stock ด้วย unit cost/value เดิมที่ snapshot จาก `SB`; `รับของคืน` ของ remaining pending_out ที่คืนครบไม่เปลี่ยน WAC แต่ถ้าคืนขาดจะตัด loss ด้วย `WTO-RETURN-LOSS` และทำให้ WAC/stock value คำนวณใหม่จาก ledger
- `WTO/pending_out` ไม่เปลี่ยน WAC เพราะยังไม่ใช่ stock ledger movement
- `SC RM<->FG` ไม่เป็น cost event และไม่ reprice WAC; เป็น quantity reclassification เพื่อแก้ classification ผิดเท่านั้น

ตัวอย่าง PB cancel:

```text
ก่อนซื้อ: 100 kg @ 40 = 4,000
PB ซื้อเข้า: 50 kg @ 60 = 3,000
หลังซื้อ: 150 kg value 7,000, WAC = 46.67

ยกเลิก PB: เอา 50 kg @ 60 ออกด้วย PB-CANCEL
หลังยกเลิก: 100 kg value 4,000, WAC = 40
```

ตัวอย่าง SB cancel หลังมีซื้อเข้าใหม่:

```text
ก่อนขาย: 100 kg @ 40 = 4,000
SB ขายออก: 50 kg @ 40, เหลือ 50 kg @ 40
PB ซื้อเข้าใหม่ก่อน cancel: 50 kg @ 60
ก่อน cancel: 100 kg value 5,000, WAC = 50

SB-CANCEL คืน 50 kg @ 40
หลัง cancel: 150 kg value 7,000, WAC = 46.67
```

## WTI / WTO Contract

### Target state

- `WTI save` = บันทึกหลักฐานรับของจริง แต่ยังไม่เขียน stock ledger
- `PB Stock save` = รับ stock เข้า โดยอ้าง `WTI`; qty/value เข้าและ WAC ปัจจุบันเปลี่ยนตามราคาซื้อของบิล
- `PB Stock cancel` = reverse stock-in เดิมด้วย `PB-CANCEL` โดยใช้ unit cost/value เดิมของ PB แล้วให้ WAC คำนวณใหม่จาก stock ที่เหลือ
- `WTO save` = บันทึกหลักฐานส่งของจริง / intended warehouse และสร้าง active `pending_out` แต่ยังไม่เขียน stock ledger
- `SB Stock save` = consume `pending_out` แล้วตัด stock ออกโดยอ้าง `WTO`; ยอดขายคิดจากน้ำหนักขายสุทธิใน SB แต่ stock/COGS consume ต้องอิงน้ำหนัก source จาก WTO ที่ถูกนำไปออกบิล
- ถ้า `SB` ขายไม่ครบตาม WTO ต้องเหลือ `pending_out` สำหรับ action `รับของคืน`; ห้ามนำ remaining นี้ไปเปิด SB ใบอื่นแบบเงียบ ๆ
- `รับของคืน` ต้องให้ผู้ใช้กรอกน้ำหนักที่ชั่งกลับมาจริงและกดยืนยันก่อนคืน stock เข้า available
- ถ้ารับคืนครบ ระบบ release hold เท่านั้น ไม่เขียน stock-in ledger; ถ้ารับคืนขาด ส่วนต่างต้องลง `WTO-RETURN-LOSS` ด้วย WAC ของ bucket ณ เวลาปิดรับคืน ไม่ใช้ราคาขายและไม่ให้ผู้ใช้กรอกต้นทุนเอง
- ถ้า `SB` ถูก cancel ก่อนรับคืน ระบบต้องคืน stock ด้วย `SB-CANCEL` และเปิด pending_out กลับมาเพื่อให้ผู้ใช้เลือกว่าจะเปิด SB ใหม่จาก WTO เดิมหรือกด `รับของคืน`; หลัง pending_out ถูกปิดด้วย return/loss แล้ว ห้ามเปิด SB ใหม่จาก WTO เดิมแบบปกติ
- `WTI/WTO` ถูก lock หลังถูกใช้กับ `PB/SB`; กรณี `WTO` ออกบิลบางส่วนจะยังมี action เฉพาะ `รับของคืน` สำหรับ remaining pending_out

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

## Removed Pending Sale / PSALE Contract

`Pending Sale / PSALE / เบิกออกรอบิล` ถูกถอดออกจาก target runtime หลังตัดสินใจให้ `WTO` เป็น pending_out source โดยตรง

กติกา target ใหม่:

- ห้ามสร้าง `stock_ledger.ref_type = PSALE` สำหรับเอกสารใหม่
- ห้ามสร้าง `stock_ledger.ref_type = PSALE-CANCEL` สำหรับเอกสารใหม่
- `/sales/stock-issue` และ `/api/sales/stock-issue` เป็น removed runtime entry point
- `POST /api/sales/bills` ต้อง reject `pendingStockIssueId/fromPsale...`
- ถ้าของออกก่อนเปิดบิล ให้สร้าง `WTO` ซึ่งทำให้ stock balance แสดง `รอออก`
- เมื่อนำ WTO ไปออก Sales Bill แล้วจึงเขียน `SB` stock-out และตอนยกเลิกเขียน `SB-CANCEL`
- ถ้า Sales Bill ถูกยกเลิกก่อนรับของคืน ให้ reopen `WTO pending_out`; ถ้ามีการรับของคืนแล้ว ห้าม reopen/recreate `pending_out` ซ้ำ และให้ `SB-CANCEL` คืน stock ตรงด้วย unit cost/value เดิมของ `SB`

ดูรายละเอียด legacy ที่ [[Pending Sale Page Flow]]

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
- ถ้า `PB/SB` ถูกแก้หรือยกเลิก ต้อง reverse/rebuild movement ของ `PB/SB` และ release/recalc usage ของ `WTI/WTO`; สำหรับ `SB` ที่มี return-from-WTO/SB แล้ว ต้องไม่ reopen pending_out ซ้ำ
- การแก้หรือยกเลิก `WTI/WTO` ที่ยังไม่ถูกใช้ ไม่ต้อง reverse stock เพราะยังไม่มี stock movement ที่เอกสารนั้นสร้าง
- PSALE legacy rows ที่ยังมีในฐานข้อมูลต้องถูกจัดการเป็น data repair/legacy migration แยก ไม่ใช่ runtime flow ปกติ

## Ref Type / Movement Type Principle

ควรแยก 2 field นี้ให้ทำหน้าที่คนละอย่าง:

### `ref_type`

ใช้ตอบว่า row นี้มาจากเอกสาร/flow อะไร เช่น:

- `WTI`
- `WTO`
- `PB`
- `SB`
- `PSALE` (legacy ref type only; no new target write)
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
- รอออกเท่าไร
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
  - WTI/WTO pending_out
  - PB/SB/PI/PO2 source docs
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
