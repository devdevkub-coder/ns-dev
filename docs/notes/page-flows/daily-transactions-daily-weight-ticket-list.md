---
title: รายการใบรับ-ส่งของ Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-06-20
route: /daily/weight-ticket-list
---

# รายการใบรับ-ส่งของ Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Daily Transactions |
| Route | `/daily/weight-ticket-list` |
| Page | รายการใบรับ-ส่งของ |
| Current Next | accepted code baseline |

## Canonical References

[[WTI-WTO Flow]], [[Purchase Flow]], [[Sales Flow]], [[Stock Ledger and Stock Balance]]

## Flow Baseline

list/detail/create link สำหรับ WTI/WTO; WTI/WTO เป็น evidence/usage control ไม่ใช่ movement owner

## Current UI Behavior Summary

- หน้า list แสดง WTI/WTO และส่ง context ประเภทเอกสารไปหน้า create/edit ให้ถูกต้อง
- modal create/edit ของใบรับ/ส่งของใช้รายการสินค้าเป็น card หลัก และในแต่ละ card แยกเป็น `เต๋าสินค้า`, `สรุปน้ำหนักเต๋า`, `ซื้อเพิ่มจากสิ่งเจือปน`, `สิ่งเจือปน`, และ summary รวมท้ายรายการ
- ต้องเลือกสินค้าก่อนจึงจะกรอกน้ำหนัก เพิ่มเต๋า แนบรูป หรือเพิ่มสิ่งเจือปนได้
- ถ้าเปลี่ยนสินค้าใน card หลัก ต้องล้างเต๋า รูป สิ่งเจือปน และรายการซื้อเพิ่มที่ผูกกับสินค้าเดิม
- แต่ละเต๋ายุบ/ขยายได้; ตอนยุบยังเห็นน้ำหนักรวม หักภาชนะ น้ำหนักหลังหักภาชนะ และจำนวนรูป
- card `สรุปน้ำหนักเต๋า` รวมเฉพาะเต๋าจริง ไม่รวมรายการซื้อเพิ่มจากสิ่งเจือปน
- ถ้ายังไม่มีเต๋าจริงใน card นั้น ต้องเพิ่มสิ่งเจือปนไม่ได้
- สิ่งเจือปนแบบ `%` คำนวณจาก `สรุปน้ำหนักเต๋า > น้ำหนักรวมทุกเต๋า` เท่านั้น
- `สินค้าอื่น` ในสิ่งเจือปนสามารถเลือกสินค้าที่ปนมาและเลือก `ซื้อ/ไม่ซื้อ`; ถ้าเลือกซื้อจะสร้าง/รวมรายการซื้อเพิ่มไว้ใน card ของสินค้านั้น ไม่สร้างเป็นเต๋าปลอม
- เปลี่ยน `ซื้อ` กลับเป็น `ไม่ซื้อ` หรือลบแถวสิ่งเจือปน ต้องลบเฉพาะรายการซื้อเพิ่มที่ผูกกับ source นั้น และต้องคง card ปลายทางไว้ถ้ายังมีเต๋าจริงหรือ source ซื้ออื่นอยู่

## Page Responsibilities

- แสดง list WTI/WTO พร้อม filter type/status/customer/supplier/date
- เปิด detail/timeline/print/share และ link ไปหน้า create/edit `/daily/weight-tickets`
- ปุ่มสร้างจาก tab `WTO` ต้องส่ง `?type=WTO` ไปหน้า create เพื่อเปิดฟอร์มใบส่งของ ไม่ default กลับเป็น `WTI`
- เมื่อเข้าหน้า create จาก tab `WTI` หรือ `WTO` ต้องล็อกประเภทเอกสารและซ่อน tab ของอีกประเภท; edit เอกสารเดิมก็ต้องล็อกประเภทเช่นกัน
- WTI ใช้เป็น source PB: 1 WTI ต่อ 1 PB และต้องถูกใช้ครบใน PB เดียว
- WTO ใช้เป็น source SB: 1 WTO ต่อ 1 SB และต้องถูกใช้ครบใน SB เดียว
- แสดง product thumbnail, เต๋า/summary, vehicle/image evidence และ downstream usage lock
- WTI create/edit ต้องแยกข้อมูลในแต่ละเต๋าเป็น `ข้อมูลเต๋า` -> `ซื้อเพิ่มจากสิ่งเจือปน` -> `รายการหักสิ่งเจือปน`
- ในแต่ละรายการต้องเลือกสินค้าก่อนกรอกข้อมูลเต๋า/น้ำหนัก/รูป/สิ่งเจือปน และเมื่อเปลี่ยนสินค้าต้องล้างข้อมูลเต๋า รูป สิ่งเจือปน และรายการซื้อเพิ่มที่ผูกกับสินค้าเดิม
- แต่ละเต๋าต้องแสดงค่าน้ำหนักหลังหักภาชนะจาก `น้ำหนักรวม - หักภาชนะ` เป็นค่าคำนวณอ่านอย่างเดียว
- แต่ละเต๋าต้องยุบ/ขยายได้เพื่อรองรับรายการที่มีข้อมูลและรูปจำนวนมาก; ตอนยุบยังต้องเห็นสรุปน้ำหนักรวม หักภาชนะ น้ำหนักหลังหักภาชนะ และจำนวนรูป
- ถ้ารายการสินค้านั้นยังไม่มีเต๋าจริง ต้องไม่สามารถเพิ่มรายการหักสิ่งเจือปนได้
- รายการหักสิ่งเจือปนต้องรองรับ master impurity ชื่อ `สินค้าอื่น`; เมื่อเลือก `สินค้าอื่น` ต้องให้เลือกสินค้าที่ปนมาและเลือก `ซื้อ/ไม่ซื้อ`

## Non-Responsibilities

- WTI ไม่เขียน stock-in เอง; PB เป็น owner ของ stock-in
- WTO ไม่เขียน stock-out เอง; target WTO สร้าง hold และ SB เป็น owner ของ stock-out
- ไม่ตั้ง AP/AR และไม่รับ/จ่ายเงิน

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิด list | GET weight tickets list |
| 2 | สร้าง/แก้ | ไป `/daily/weight-tickets?type=WTI|WTO` หรือ edit พร้อม type context และใช้ options/products APIs |
| 3 | detail | GET by id/doc no แสดง summary/timeline/images |
| 4 | PB/SB ใช้งาน | update usage/status/lock |
| 5 | cancel/edit | ถ้าถูก bill ใช้แล้วต้อง lock; ถ้ายังไม่ใช้ให้ release/rebuild hold สำหรับ WTO |

## API / Data Contract

### Current API

- `GET /api/daily/weight-tickets - list`
- `POST /api/daily/weight-tickets - create WTI/WTO`
- `GET /api/daily/weight-tickets/[id] - detail`
- `PUT /api/daily/weight-tickets/[id] - edit`
- `PATCH /api/daily/weight-tickets/[id] - cancel/status action`
- `GET /api/daily/weight-tickets/options - current branches/suppliers/customers/impurities only`
- `GET /api/daily/weight-tickets/products - product options with thumbnails`
- `GET /api/daily/weight-tickets/stock-options?branchId={branchCode}&productId={productCode}`
  - returns active warehouses in the selected branch where `type in (RM, FG)`
  - returns `onHandQty`, `onHoldQty`, and `availableQty` per warehouse
  - derives `onHandQty` from `stock_ledger`
  - derives `onHoldQty` from active stock holds
- `POST /api/daily/weight-tickets`
  - for `WTO`, must require `warehouseId` per line
  - must validate requested qty/net weight against server-side `availableQty`
  - must create active hold rows in the same transaction as the WTO document
- `PUT /api/daily/weight-tickets/[id]`
  - for editable unused `WTO`, must rebuild hold rows to match latest lines
- `PATCH /api/daily/weight-tickets/[id]`
  - for cancel `WTO`, must release active hold rows

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ
- น้ำหนักสุทธิต้องคำนวณจาก `gross_weight - container_deduction_weight - deduct_weight`; `container_deduction_weight` คือหักภาชนะ ส่วน `deduct_weight` คือหักสิ่งเจือปนเดิม และต้องเก็บแยกทั้ง header/line/product summary
- สิ่งเจือปนปกติ เช่น ทราย/ดิน/พลาสติก เป็นการหักน้ำหนักอย่างเดียว และต้องไม่แสดง action ซื้อ
- การหักสิ่งเจือปนแบบ `%` ต้องคำนวณจากตัวเลขเดียวกับ card `สรุปน้ำหนักเต๋า > น้ำหนักรวมทุกเต๋า` ของสินค้านั้น ไม่ใช่น้ำหนักเฉพาะเต๋าที่ผูกแถวสิ่งเจือปน และต้องไม่เอาน้ำหนักสินค้าที่ซื้อเพิ่มจากสิ่งเจือปนมารวมเป็นฐานคำนวณ
- ช่องกรอกค่าหักสิ่งเจือปนต้องกระชับและจำกัดความยาวประมาณ 5 ตัวอักษร; ถ้าเลือกหักแบบ `%` ต้องแสดงช่องอ่านอย่างเดียวสำหรับน้ำหนักที่หักจริงเป็นกิโลกรัม
- `สินค้าอื่น` เป็น special impurity สำหรับกรณีมีสินค้าอีกชนิดปนมากับเต๋านั้น เช่น เต๋ากระทะมีเหล็กปน
- เมื่อเลือก `สินค้าอื่น` ต้องบันทึกข้อมูลว่าเลือกสินค้าที่ปนมาเป็นสินค้าอะไร และเลือก `ซื้อ` หรือ `ไม่ซื้อ`
- ถ้าเลือก `ไม่ซื้อ`, น้ำหนักรายการนั้นยังเป็น `deduct_weight` ของเต๋าต้นทางเท่านั้น และไม่สร้างรายการสินค้าหลักเพิ่ม
- ถ้าเลือก `ซื้อ`, น้ำหนักรายการนั้นยังต้องถูกหักออกจากเต๋าต้นทาง และต้องสร้าง/รวมรายการซื้อเพิ่มของสินค้าที่เลือกไว้ในเอกสารเดียวกัน
- เมื่อผู้ใช้ลบแถวสิ่งเจือปนที่เป็น source ของรายการซื้อเพิ่ม ต้องลบรายการซื้อเพิ่มที่ผูกกับ source นั้นด้วย; ถ้าสินค้านั้นไม่มีรายการหลัก/เต๋าจริง card ต้องหายไป
- เมื่อเปลี่ยนแถว `สินค้าอื่น` จาก `ซื้อ` เป็น `ไม่ซื้อ` ต้องลบเฉพาะรายการซื้อเพิ่มที่ผูกกับ source นั้น และต้องเช็ค card สินค้าปลายทางก่อนลบ ถ้ายังมีเต๋าจริงหรือ source ซื้ออื่นอยู่ card ต้องคงอยู่
- ช่องเลือกสินค้าที่ปนมาของ `สินค้าอื่น` ต้องไม่แสดงสินค้าหลักของเต๋าต้นทาง เช่น เต๋ากระทะต้องเลือกกระทะเป็นสินค้าที่ปนมาไม่ได้
- ถ้าสินค้าที่ซื้อจากสิ่งปนมามีอยู่แล้วในรายการสินค้าหลักของเอกสาร ให้รวมเข้ากับ product summary ของสินค้านั้น แต่ UI ต้องยังแสดงแหล่งที่มาว่ามาจากเต๋าใด
- ถ้าสินค้าที่ซื้อจากสิ่งปนมายังไม่มีในรายการสินค้าหลักของเอกสาร ให้สร้างรายการสินค้าหลักใหม่โดยใช้ weight จากรายการ `สินค้าอื่น` ที่เลือกซื้อ
- รายการสินค้าซื้อเพิ่มจากสิ่งปนมาต้องไม่แสดงในรูปแบบตารางเต๋าหรือสร้างเต๋าว่าง และต้องแสดงแยกเป็น section readonly ต่อจากข้อมูลเต๋าแต่ละเต๋า ก่อน section รายการหักสิ่งเจือปน เพื่อให้เห็นชัดว่าน้ำหนักใดถูกซื้อเพิ่มจากเต๋าไหน
- ก่อน section `ซื้อเพิ่มจากสิ่งเจือปน` ต้องแสดง card สรุปน้ำหนักเต๋าจริงของสินค้านั้น โดยรวมเฉพาะเต๋าหลัก/เต๋าเพิ่มจริง ไม่รวมรายการที่สร้างจากการซื้อสิ่งเจือปน
- card สินค้าที่ถูกสร้าง/รวมจากสิ่งปนมาต้องแสดง section readonly `ซื้อเพิ่มจากสิ่งเจือปน` โดยดึง source line ย้อนกลับมาแสดงน้ำหนัก ประเภทการหัก ที่มา และหมายเหตุ; section นี้ต้องอยู่ใน card ของสินค้าที่ซื้อเพิ่ม ไม่ใช่ card ของสินค้าต้นทางที่มีสิ่งปนมา
- ถ้า card สินค้ามาจากสิ่งปนมาอย่างเดียวและไม่มีเต๋าจริง หมายเหตุรายการต้องแสดง summary ที่คำนวณจากรายการซื้อเพิ่มทั้งหมด เช่น จำนวน source และน้ำหนักรวม แทนการใช้ note ของแถวแรกเพียงแถวเดียว
- เมื่อลบ source impurity line ที่เคยสร้าง card สินค้าซื้อเพิ่มไว้ ถ้า card นั้นมีเต๋าจริงหรือ child/source อื่นแล้ว ห้ามลบ card หลักทิ้ง; ต้องลบเฉพาะ purchase line ที่ผูกกับ source นั้น และ promote/reparent เต๋าจริงให้เป็นรายการหลักต่อ
- Runtime contract ต้องไม่พึ่ง `note` เพื่อ trace ความสัมพันธ์นี้เพียงอย่างเดียว; ต้องมี field/relation ที่ระบุ source impurity line, target product, buy decision, และ target purchase line/summary
- สำหรับ `WTO`, `warehouseId` เป็น line-level stock location ไม่ใช่ header field เพราะแต่ละสินค้าอาจออกจากคลังต่างกัน
- `warehouseId` ที่ส่งออก client ควรเป็น business code ของ warehouse; server resolve เป็น internal bigint id ก่อนเขียน DB

### Target Impurity Purchase Flow

| Case | User input | System result |
|---|---|---|
| สิ่งเจือปนปกติ | เลือกสิ่งเจือปน เช่น ทราย และกรอกน้ำหนักหัก | หักน้ำหนักจากเต๋าต้นทางเท่านั้น, ไม่แสดงปุ่มซื้อ |
| `สินค้าอื่น` ไม่ซื้อ | เลือก `สินค้าอื่น`, เลือกสินค้าที่ปนมา, เลือก `ไม่ซื้อ`, กรอกน้ำหนักหัก | หักน้ำหนักจากเต๋าต้นทาง, เก็บ trace ว่าสินค้าอะไรปนมาแต่ไม่ซื้อ |
| `สินค้าอื่น` ซื้อและมีสินค้าหลักอยู่แล้ว | เลือก `สินค้าอื่น`, เลือกสินค้าที่ปนมา, เลือก `ซื้อ`, กรอกน้ำหนักหัก | หักน้ำหนักจากเต๋าต้นทาง และรวมเข้ากับ summary ของสินค้านั้น พร้อมแสดงใน table ซื้อเพิ่มจากสิ่งปนมา |
| `สินค้าอื่น` ซื้อแต่ยังไม่มีสินค้าหลัก | เลือก `สินค้าอื่น`, เลือกสินค้าที่ปนมา, เลือก `ซื้อ`, กรอกน้ำหนักหัก | สร้างรายการสินค้าหลักใหม่ในเอกสาร แล้วรวมเข้า summary พร้อม source trace |

### Proposed Schema / API Contract

- `weight_ticket_lines` หรือ relation ใหม่ต้องรองรับข้อมูลอย่างน้อย:
  - `impurity_purchase_action`: `none | buy`
  - `impurity_purchase_product_id`: product ที่เลือกเมื่อ impurity เป็น `สินค้าอื่น`
  - `impurity_purchase_source_line_id`: line สิ่งเจือปนต้นทาง ถ้าแยกเป็น target purchase line
  - `impurity_purchase_target_line_id`: line สินค้าหลักที่ถูกสร้าง/รวมจากสิ่งปนมา
- API create/edit ต้อง validate ว่า:
  - ถ้า impurity ไม่ใช่ `สินค้าอื่น`, `impurity_purchase_action` ต้องเป็น `none`
  - ถ้า impurity เป็น `สินค้าอื่น`, ต้องเลือก target product เสมอ
  - ถ้าเลือก `buy`, target product ต้องเป็น active product และต้องสร้าง/รวม purchase line ใน transaction เดียวกัน
  - น้ำหนักซื้อเพิ่มจากสิ่งปนมาต้องเท่ากับน้ำหนักหักของ source impurity line เพื่อไม่ให้ยอดสุทธิ drift
- Read model detail/print/share/PB source options ต้องอ่าน relation นี้กลับมาได้ เพื่อแสดงว่าแต่ละ summary มีน้ำหนักที่มาจากเต๋า/สิ่งปนใด

## Validation / Status Rules

- WTI supplier/branch/product/weight required ตาม receipt mode
- WTO customer/branch/product/warehouse/qty required และ target validate available qty จาก branch+product+warehouse
- WTO warehouse ต้อง active, อยู่ใน branch ที่เลือก, และเป็นคลัง `RM` หรือ `FG`
- WTI/WTO ไม่มีสถานะ partial ใน target filter/status: `WTI = รับของแล้ว/เสร็จสิ้น/ยกเลิก`, `WTO = ส่งของแล้ว/ออกบิลแล้ว/ยกเลิก`
- ประเภทเอกสาร (`WTI`/`WTO`) เปลี่ยนไม่ได้หลังเปิดจาก create context เฉพาะประเภทหรือหลังสร้างเอกสารแล้ว; API ต้อง reject payload ที่พยายามเปลี่ยน `type`
- edit/cancel lock เมื่อ PB/SB active ใช้งานแล้ว
- product image ต้องมาจาก storage thumbnail key/url ตาม target ไม่ใช้ fallback runtime

## Side Effects

- WTI save สร้าง evidence/summary แต่ไม่ stock ledger
- WTO target save สร้าง active stock hold/reservation แต่ไม่ stock ledger
- PB/SB เป็นผู้ consume source และเขียน ledger

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

- SB edit/cancel ยังไม่มี write path ที่ release/reopen/reverse stock hold และ stock ledger หลัง `WTO` ถูกใช้แล้ว
- stock balance ยังไม่มี drilldown UI ให้เห็นว่า `on hold` มาจาก `WTO` ใบไหน/line ไหน
- ต้องทำ browser QA เต็ม flow create/edit/cancel/detail/print/share และ handoff ไป `PB/SB`
- ต้องทำ report/reconciliation สำหรับ `WTI/WTO ค้างออกบิล`, aging bucket, legacy partial-billed debt, และ `status ไม่ตรง usage`
- WTI impurity purchase flow ปัจจุบันยังไม่ครบ target: UI จำกัด action `ซื้อ/ไม่ซื้อ` ไว้เฉพาะ `สินค้าอื่น` แล้ว สร้าง/รวมรายการหลักใน modal เมื่อเลือก `ซื้อ` โดยไม่แสดงเป็นเต๋าปลอม และแสดง source table ใน card ของสินค้าที่ซื้อเพิ่ม แต่ DB/API ยังไม่มี field/relation สำหรับ buy decision + target product + source/target line trace

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [x] Add `warehouse_id` to WTO lines and expose it in form/detail/read models
- [x] Add hold-aware stock-options API for branch+product warehouse availability
- [x] Add stock hold table/service and integrate WTO save/edit/cancel + SB create consume
- [x] Lock WTI/WTO document type in create context and edit API
- [ ] Add `สินค้าอื่น` impurity purchase contract to schema/API/read model
- [x] Add per-te๋า table `รายการสินค้าซื้อเพิ่มจากสิ่งปนมา` before impurity deduction section
- [x] Hide buy action for normal impurities and show product + buy/not-buy controls only for `สินค้าอื่น`
- [x] Ensure bought impurity product creates or merges into main product card in current UI with source trace
- [x] Add card `สรุปน้ำหนักเต๋า` before `ซื้อเพิ่มจากสิ่งเจือปน`
- [x] Calculate `%` impurity deduction from real lot gross summary only
- [x] Keep real-lot card when changing impurity purchase from `ซื้อ` to `ไม่ซื้อ`
- [x] Add collapse/expand for each เต๋า
- [x] Disable adding impurity rows when the product card has no real lots
- [ ] Persist impurity purchase source/target relation through schema/API/read model
- [ ] Verify legacy behavior for remaining SB edit/cancel/reversal gap before implementing runtime change
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [ ] Update this file and canonical reference if contract changes
