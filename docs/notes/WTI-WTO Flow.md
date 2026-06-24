---
title: WTI-WTO Flow
aliases:
  - Weight Ticket Flow
  - WTI WTO Flow
  - Flow ใบรับ-ส่งของ
  - Flow ชั่งสินค้า รับ-ส่งของ
tags:
  - ns-scrap-erp
  - weight-ticket
  - daily
  - business-flow
  - decision
status: draft
created: 2026-06-11
updated: 2026-06-24
---

# WTI/WTO Flow / Flow ใบรับ-ส่งของ

เอกสารนี้เป็น canonical flow สำหรับหน้ากลุ่ม `ชั่งสินค้า / รับ-ส่งของ` ในระบบ Next app:

- route สร้าง/แก้ไข: `/daily/weight-tickets`
- route list/detail entry: `/daily/weight-ticket-list`

จุดประสงค์ของเอกสารนี้คือแยกกติกาของ `WTI` และ `WTO` ออกจาก [[Purchase Flow]] และ [[Sales Flow]] ให้ชัด โดยหน้า WTI/WTO เป็นเจ้าของ flow เรื่อง:

- การสร้างเอกสารรับของ/ส่งของ
- กติกาหน้าฟอร์ม create/edit
- list/detail/timeline/print/share
- รูปสินค้า/รูปรถ
- สถานะเอกสารก่อนและหลังถูกนำไปใช้ downstream
- contract API เฉพาะหน้าสำหรับ option/product loading

ส่วน flow ซื้อและขายปลายทางให้ถือว่า:

- [[Purchase Flow]] เป็น owner ของ `WTI -> Purchase Bill`
- [[Sales Flow]] เป็น owner ของ `WTO -> Sales Bill`

## หลักการหลักของเอกสาร WTI/WTO

- ระบบ target ไม่ใช้เลข `WT` เดี่ยว
- ขาเข้าต้องใช้ `WTI{branchCode}{YYMM}-NNNN`
- ขาออกต้องใช้ `WTO{branchCode}{YYMM}-NNNN`
- เมื่อกดบันทึก ให้ถือว่าออกเอกสารจริงและมีผลต่อ usage/timeline ทันที แต่ยังไม่เขียน stock ledger
- เลขเอกสาร, วันที่เอกสาร, เวลา, และผู้บันทึก เป็น system-generated หลัง save เท่านั้น
- ผู้ใช้ต้องกรอกข้อมูลธุรกิจและน้ำหนักจริงก่อน ไม่ preview เลขเอกสารล่วงหน้า
- รูปต่อรายการสินค้าเป็นข้อมูลบังคับของเอกสาร WTI/WTO
- รูปสินค้าที่ใช้เลือกในฟอร์มเป็นเพียง master-data thumbnail เพื่อช่วยเลือกสินค้า ไม่ใช่หลักฐานแทนรูปหน้างาน
- history/timeline ของเอกสารต้องเป็น append-only ตาม [[Document Timeline Policy]]

## ขอบเขตของ WTI กับ WTO

| เอกสาร | ใช้ทำอะไร | downstream หลัก | สถานะตั้งต้น |
|---|---|---|---|
| `WTI` | รับของเข้าหน้างาน/ยืนยันน้ำหนักขาเข้า | `Purchase Bill Stock` | `รับของแล้ว` |
| `WTO` | ส่งของออก/ยืนยันน้ำหนักขาออก | `Sales Bill Stock` | `ส่งของแล้ว` |

กติกาหลัก:

- `WTI` เป็น source document ฝั่งซื้อเข้า stock
- `WTO` เป็น source document ฝั่งส่งของ/ขายออก
- หน้า create/edit ใช้ route เดียวกัน แต่ type ต้องชัดว่าเป็น `WTI` หรือ `WTO`
- list page ต้องรวมทั้ง 2 เอกสาร แต่แยก tab/filter ตาม type
- เมื่อ user กดสร้างจาก list tab `WTO` ต้องเปิด `/daily/weight-tickets?type=WTO` เพื่อให้ฟอร์มเริ่มเป็นใบส่งของ ไม่ default เป็น `WTI`
- เมื่อ user กดสร้างจาก list tab `WTI` หรือ `WTO` ให้ซ่อน tab ของอีกประเภท และหลังสร้างแล้วห้ามเปลี่ยน type; API ต้อง reject การเปลี่ยน `WTI <-> WTO`

## ภาพรวม route และ API

| Surface | Route/API | หน้าที่ |
|---|---|---|
| Create/Edit page | `/daily/weight-tickets` | สร้าง/แก้ไข WTI/WTO |
| List/Detail entry | `/daily/weight-ticket-list` | ค้นหา กรอง เปิด detail และเข้า edit |
| Header options API | `GET /api/daily/weight-tickets/options` | โหลดสาขา ผู้ขาย ลูกค้า สิ่งเจือปน |
| Product picker API | `GET /api/daily/weight-tickets/products` | preload รายการสินค้าพร้อม thumbnail |
| WTO stock options API | `GET /api/daily/weight-tickets/stock-options` | API สำหรับคลัง RM/FG และคงเหลือรายสินค้า/สาขา/คลัง |
| Save API | `POST /api/daily/weight-tickets` | สร้างเอกสารใหม่ |
| Read/Update API | `GET/PUT/PATCH /api/daily/weight-tickets/{docNo}` | อ่าน detail แก้ไข และ cancel เอกสาร |

หลักการ loading:

- หน้า `/daily/weight-tickets` ต้องไม่ใช้ `/api/master-data/products?all=1` โดยตรง
- ต้องโหลด header options ผ่าน API page-scoped ก่อน
- หลัง options สำเร็จ ระบบ preload product options ต่อทันทีแบบ background
- product picker ต้องเห็นรูป thumbnail ได้โดยไม่ต้องรอผู้ใช้เลือกสาขาหรือคู่ค้าก่อน
- แต่ก่อน save ยังต้อง validate ว่ามีสาขาและคู่ค้าถูกต้องตาม type และคู่ค้านั้นต้องมี active branch mapping กับสาขาเอกสาร
- เมื่อมี `branchId` แล้ว header options API ต้องส่งเฉพาะ Supplier/Customer ที่ผูกกับสาขานั้นผ่าน active `supplier_branches` / `customer_branches`; ถ้าไม่มี mapping ต้องไม่แสดงเป็น option และห้าม fallback เป็นทุกสาขา
- ถ้า user เปลี่ยนสาขาและ Supplier/Customer เดิมไม่อยู่ใน mapping ของสาขาใหม่ UI ต้อง clear คู่ค้าเดิมทันที
- สำหรับ `WTO` ให้ user เลือกสินค้าใน line ก่อน แล้วค่อยเลือก `คลัง` ของสินค้านั้น เพื่อให้ทำงานสะดวกกว่า
- หลังเลือกสินค้าใน `WTO` แล้ว warehouse selector ของ line นั้นต้องแสดงเฉพาะคลัง `RM` / `FG` ที่ active และอยู่ในสาขาที่เลือก
- stock คงเหลือของ `WTO` จะแสดงได้ครบหลังมี `สาขา + สินค้า + คลัง`
- ฟอร์มต้องแสดง `คงเหลือจริง`, `จองไว้`, และ `พร้อมส่ง`
- `WTO` ต้อง validate จาก `พร้อมส่ง = คงเหลือจริง - รอออก` และสร้าง pending_out เมื่อ save
- final stock movement ยังเกิดตอนบันทึก `SB` โดย consume pending_out ของ WTO
- ไม่มี fallback จาก `WTO` ไป `Pending Sale / PSALE`; ถ้าของออกก่อนเปิดบิล ให้ถือว่า `WTO` เป็น pending_out source โดยตรงเท่านั้น

## หลักการคลังของ WTO

ในระบบนี้ `คลัง` ต้องถือเป็น stock location / stock dimension หลัก ไม่ใช่แค่ label ของสถานที่

stock คงเหลือต้องแยกอย่างน้อยตาม:

```text
สาขา + คลัง + สินค้า + สถานะสินค้า
```

ตัวอย่าง:

- สาขาเดียวกัน สินค้าเดียวกัน แต่คนละคลัง `RM` / `FG` ต้องถือว่าเป็น stock คนละกอง
- ถ้าสาขามีคลัง `RM` มากกว่า 1 คลัง ต้องเลือกคลังจริง ไม่ใช่เลือกแค่ประเภท `RM`
- dropdown ใน WTO ควร label ให้ user เข้าใจทั้งประเภทและชื่อคลัง เช่น `RM - คลังวัตถุดิบหลัก`

กติกา line-level ของ `WTO`:

- เลือก `สินค้า` ก่อน เพื่อให้ user ทำงานเร็วและเห็นรูป/ชื่อสินค้าได้ทันที
- หลังเลือกสินค้าแล้วให้เลือก `คลัง` ของสาขานั้น โดย filter เฉพาะคลัง active ที่ `type in (RM, FG)`
- คงเหลือจะแสดงได้ครบหลังมี `สาขา + สินค้า + คลัง`
- ยอดที่ validate ตอน save ต้องเป็น `พร้อมส่ง` ไม่ใช่ `คงเหลือจริง`
- `พร้อมส่ง = คงเหลือจริง - จองไว้`
- line ต้องเก็บ intended warehouse เพื่อให้ `SB` ตัด stock ออกจากคลังเดียวกับที่จองไว้

## Current API / Implementation Alignment

ตรวจ ณ 2026-06-11:

| ส่วน | Current code | Target gap |
|---|---|---|
| `weight_ticket_lines` | มี `warehouse_id` สำหรับ intended warehouse ของ `WTO` แล้ว | ต้อง harden print/export ถ้าต้องแสดงคลัง |
| `stock_holds` | มี durable hold table และ helper สำหรับ `active/released/cancelled/consumed`; `WTO` source layer เหลือเฉพาะ hold ของ WTO และ `SB` consume/reopen เท่านั้น ไม่มี PSALE fallback helper | SB cancel ต้องเรียก reopen helper เพื่อ append `SB-CANCEL` และคืน hold |
| `GET /api/daily/weight-tickets/options` | ส่ง `branches`, `suppliers`, `customers`, `impurities` | ถ้ามี branch context ต้องกรอง suppliers/customers จาก branch mapping; ไม่ต้องส่ง warehouse options รวม เพราะขึ้นกับ branch + product |
| `GET /api/daily/weight-tickets/products` | ส่ง product options พร้อม `thumbnailUrl` | ยังไม่ส่ง availability และไม่ควรยัด stock ทุกคลังมากับ product list |
| `GET /api/daily/weight-tickets/stock-options` | ส่งคลัง active `RM/FG` พร้อม `onHandQty/onHoldQty/availableQty` ตาม branch + product | ใช้ใน WTO create/edit แล้ว |
| `POST /api/daily/weight-tickets` | validate WTO warehouse + available qty และสร้าง active hold ใน transaction | ตรง target หลัก |
| `PUT /api/daily/weight-tickets/{docNo}` | reject การเปลี่ยน type, release hold เดิม, validate ใหม่, rebuild hold ใหม่ใน transaction เมื่อยังไม่ถูกใช้ | เหลือ SB edit/cancel reversal/reopen hold |
| `PATCH /api/daily/weight-tickets/{docNo}` | cancel เอกสารและ mark active hold เป็น `cancelled` ใน transaction | ต้องคง lock เมื่อถูกใช้โดย bill |
| `stockBalanceSnapshot()` | aggregate `stock_ledger` ตาม product/branch/warehouse และแสดง `จองไว้ / พร้อมส่ง` จาก active hold | detail drilldown ของ hold ยังต้องเพิ่มถ้าต้องการ trace จาก stock page |

## No-Fallback WTO Source Contract

ตั้งแต่ 2026-06-24 เป็นต้นไป runtime ต้นทางของ `WTO` ต้องยึด contract นี้:

- `POST /api/daily/weight-tickets` เมื่อ `type = WTO` ต้องสร้าง `stock_holds.status = active` เท่านั้น
- `PUT /api/daily/weight-tickets/{docNo}` เมื่อ `WTO` ยังไม่ถูกใช้ ต้อง release hold เดิมแล้ว rebuild hold ใหม่ใน transaction เดียวกัน
- `PATCH /api/daily/weight-tickets/{docNo}` เมื่อ `WTO` ยังไม่ถูกใช้ ต้องเปลี่ยน active hold เป็น `cancelled`
- `WTO` ห้ามเขียน `stock_ledger` เองทุกกรณี
- `WTO` ห้ามสร้างหรือ consume `PSALE`
- การตัด stock จริงเกิดที่ `Sales Bill` เท่านั้น โดย consume hold แล้วเขียน `stock_ledger.ref_type = SB`
- การยกเลิก `Sales Bill` ต้อง append `stock_ledger.ref_type = SB-CANCEL` และเปิด hold ของ `WTO` กลับมาเป็น `active`

แนว API target ที่ควรใช้:

```http
GET /api/daily/weight-tickets/stock-options?branchId={branchCode}&productId={productCode}
```

response target:

```json
{
  "warehouses": [
    {
      "id": "WH-RM-01",
      "code": "WH-RM-01",
      "name": "คลังวัตถุดิบหลัก",
      "type": "RM",
      "branchId": "01",
      "onHandQty": 1000,
      "onHoldQty": 120,
      "availableQty": 880
    }
  ]
}
```

เหตุผลที่แยกเป็น API เฉพาะหน้า:

- product list ต้องเบาและโหลดรูป thumbnail ได้เร็ว
- stock availability ขึ้นกับ `branch + product + warehouse`
- hold-aware available qty ต้องคำนวณจาก ledger + active hold ใน server
- server ต้อง validate ซ้ำตอน save เพื่อกัน race condition ระหว่างหลาย user

## ระบบรับซื้อสิ่งเจือปนเป็นสินค้า (Auto-Buy Impurity Product Flow)

เพื่อความสะดวกในกรณีที่ทางโรงงานรับซื้อวัสดุที่มีสิ่งเจือปนปะปนเข้ามา (เช่น ทองแดงปนขยะ) และต้องการแปลงน้ำหนักที่ถูกหักจากสิ่งเจือปนนั้นไปสร้างเป็นรายการรับซื้อตัวใหม่ (เพื่อคิดเงินให้กับผู้ขายแยกต่างหากในเรทของสินค้าสิ่งเจือปนนั้นๆ) ระบบมีฟังก์ชัน **"รับซื้อสิ่งเจือปนเป็นสินค้า"** สำหรับเอกสาร `WTI`:

### 1. ลอจิกการทำงานและประเภทของสินค้า
- **การแยกประเภทสินค้า**: สินค้าจะถูกแยกกลุ่มออกจากกันอย่างเด็ดขาดผ่านฟิลด์ Category (ประเภทสินค้า):
  - สินค้าปกติ (`normalProducts`): สินค้าที่เป็นเนื้อโลหะหลักหรือสินค้าทั่วไปที่แสดงผลในลิสต์และปุ่มเพิ่มสินค้าหลัก
  - สินค้าสิ่งเจือปน (`impurityProducts`): สินค้ากลุ่มสิ่งเจือปน (เช่น ขยะ, กระดาษ, การ์ด) ที่ใช้เฉพาะในธุรกรรมการหัก/การรับซื้อสิ่งเจือปน
- **การเข้าถึงข้อมูล**: ข้อมูลสินค้าสิ่งเจือปนจะถูกแยกไปบริหารจัดการต่างหากผ่านเมนูย่อยและหน้าเพจ `/master-data/impurity-products` เพื่อป้องกันการเลือกสินค้าผิดฝั่ง

### 2. ลำดับขั้นตอนการใช้งาน (User Flow)
1. **เพิ่มแถวรายการสินค้าหลัก**: ผู้ใช้เพิ่มสินค้าปกติ (เช่น ทองแดง) และกรอกน้ำหนักขาเข้า (Gross) และค่าภาชนะตามปกติ
2. **เพิ่มรายการสิ่งเจือปน (Impurity Child Line)**:
   - ที่แถบรายละเอียดล็อตสินค้าด้านขวามือ ให้คลิกปุ่ม `+ เพิ่มเต๋าหักสิ่งเจือปน`
   - เลือกประเภทสิ่งเจือปน (เช่น ขยะ) และกรอกน้ำหนักที่ต้องการหักออก (เช่น หัก 10 กก.)
3. **การสั่งรับซื้อสิ่งเจือปน**:
   - บนแถวสิ่งเจือปนย่อยที่เพิ่มเข้ามา จะมีปุ่ม **"ซื้อ"** สีน้ำเงินแสดงขึ้นมา
   - เมื่อผู้ใช้คลิกปุ่ม **"ซื้อ"** ระบบจะทำงานดังนี้:
     - **ระบบค้นพบคู่แมตช์อัตโนมัติ (Auto-Match)**: หากชื่อประเภทสิ่งเจือปนตรงกับชื่อสินค้าในกลุ่ม "สินค้าสิ่งเจือปน" (เช่น สิ่งเจือปน "การ์ด" ตรงกับสินค้าสิ่งเจือปน "การ์ด") ระบบจะทำการสร้างแถวรายการรับซื้อใหม่ของสินค้าสิ่งเจือปนตัวนั้นเข้าสู่ใบชั่งน้ำหนักฝั่งซ้ายโดยทันทีเพื่อความสะดวกรวดเร็ว
     - **ระบบไม่พบการจับคู่ หรือเลือก "อื่นๆ"**: ระบบจะเปิดหน้าต่าง Dialog คอนเฟิร์มการรับซื้อขึ้นมา ให้ผู้ใช้เลือกค้นหาและระบุสินค้าสิ่งเจือปนที่ต้องการแปลง (แสดงเฉพาะตัวเลือกจากกลุ่ม `impurityProducts`) จากนั้นกด **"ยืนยันการรับซื้อ"**
4. **การเชื่อมโยงข้อมูลและหมายเหตุปลายทาง**:
   - ระบบจะสร้างแถวรายการรับซื้อหลัก (Parent Line) ตัวใหม่ของสินค้าสิ่งเจือปนนั้นๆ เพิ่มเข้าสู่เอกสาร WTI
   - ล็อตนี้จะมีน้ำหนัก Gross เท่ากับน้ำหนักที่หักไปจากรายการแรก (เช่น Gross = 10 กก.)
   - ที่ฟิลด์ **"หมายเหตุรายการ"** ของรายการรับซื้อใหม่ ระบบจะบันทึกข้อความอ้างอิงความเชื่อมโยงโดยอัตโนมัติเพื่อใช้ตรวจสอบย้อนกลับในรูปแบบ:
     `มาจากสิ่งเจือปน ({ชื่อสิ่งเจือปน} {น้ำหนัก} กก.) ของรายการที่ {ลำดับรายการแม่}: {รหัสสินค้าแม่} - {ชื่อสินค้าแม่}`
     (ตัวอย่างเช่น: *มาจากสิ่งเจือปน (อื่นๆ 13 กก.) ของรายการที่ 1: SKU235 - ก้ามเบรคแกะผ้า / เหล็ก*)
5. **การแสดงผลและปรับปรุงข้อมูล**:
   - เมื่อเลือกรายการสิ่งเจือปนนี้ขึ้นมาแก้ไขในแถบรายละเอียดด้านขวา ระบบจะรับทราบว่าเป็นแถวข้อมูลสินค้าสิ่งเจือปนและจะแสดงตัวเลือกตัวคัดกรองใน Dropdown ค้นหาและกล่องสุ่มรูปภาพ (Image Picker) เป็นกลุ่มสินค้าสิ่งเจือปนโดยเฉพาะ เพื่อป้องกันการเลือกข้ามชนิดกัน

## ภาพรวมข้อมูลในเอกสาร

### Header fields

| Field | ใช้กับ | หมายเหตุ |
|---|---|---|
| ประเภทเอกสาร | WTI/WTO | เลือก `WTI` หรือ `WTO` |
| สาขา | ทั้งคู่ | ใช้ทั้งใน business scope และเลขเอกสาร |
| ผู้ขาย | WTI | ใช้เฉพาะขาเข้า |
| ลูกค้า | WTO | ใช้เฉพาะขาออก |
| ทะเบียนรถ | ทั้งคู่ | ข้อมูลหน้างาน |
| รูปภาพรถส่งของ | ทั้งคู่ | แยกจากรูปต่อรายการสินค้า |
| หมายเหตุเอกสาร | ทั้งคู่ | ระดับเอกสาร |

### Line fields

| Field | หมายเหตุ |
|---|---|
| สินค้า | เลือกจาก product picker/search combobox |
| คลัง | ใช้กับ WTO; เลือกหลังสินค้าในแต่ละ line และแสดงเฉพาะคลัง `RM` / `FG` ของสาขาเดียวกัน |
| คงเหลือในคลัง | ใช้กับ WTO; แสดงตามสินค้า + คลังที่เลือกใน line นั้น |
| น้ำหนักเข้า/Gross | ค่าหลักของหน้างาน |
| วิธีหักสิ่งเจือปน | `ไม่หัก`, `หัก`, `หัก%` |
| สิ่งเจือปน | ใช้เมื่อ line มีการหัก |
| น้ำหนักหัก | derive ตาม mode/ค่าที่กรอก |
| น้ำหนักสุทธิ | ใช้เป็นยอด operational หลัก downstream |
| รูปต่อรายการสินค้า | บังคับอย่างน้อย 1 รูปต่อ line |
| หมายเหตุต่อรายการ | optional |

## โครงข้อมูล 3 ชั้นของ WTI/WTO

WTI/WTO ไม่ได้มีแค่ header + lines แต่ต้องมองเป็น 3 ชั้น:

1. `weight_tickets`
   - header และยอดรวมทั้งเอกสาร
2. `weight_ticket_lines`
   - lot ชั่งจริง / raw lines
3. `weight_ticket_product_summaries`
   - summary ระดับสินค้าต่อเอกสาร

รายละเอียด design ของชั้น summary อยู่ใน [[WTI Product Summary Design]]

กติกาสำคัญ:

- raw line ห้ามถูกทำลาย
- downstream ฝั่ง office ไม่ควรใช้ raw line เป็น operational source หลัก
- `Purchase Bill` และ `Sales Bill` ควรใช้ summary ระดับสินค้าสำหรับการ allocate เป็นหลัก

## Flow สร้าง WTI

| ขั้นตอน | ผู้ใช้ทำอะไร | ระบบทำอะไร | สถานะที่ได้ |
|---|---|---|---|
| 1 | เลือกประเภท `WTI` | เตรียมฟอร์มขาเข้า | draft ในหน้าจอ |
| 2 | เลือกสาขาและผู้ขาย | validate scope และ active `supplier_branches` | draft |
| 3 | กรอกทะเบียนรถ/รูปรถ | เก็บหลักฐานเอกสารระดับ header | draft |
| 4 | เพิ่มรายการสินค้า | เลือกสินค้า, กรอก gross/deduct/net, แนบรูปต่อรายการ | draft |
| 5 | กดบันทึก | ออกเลข `WTI...`, stamp วันเวลา/ผู้บันทึก, เขียน header/line/summary โดยไม่เขียน stock ledger | `รับของแล้ว` |

ผล downstream ของ `WTI`:

- ใช้เป็น source สำหรับ `Purchase Bill` เฉพาะกรณี `Stock`
- เมื่อบันทึก `WTI` สำเร็จ ยังไม่สร้าง stock movement; stock-in จะเกิดตอนบันทึก `Purchase Bill Stock`
- ถ้ายังไม่ถูกนำไปออกบิล จะอยู่สถานะ `รับของแล้ว`
- เมื่อถูกนำไปออก `Purchase Bill` ต้องตัดให้ครบทั้งเอกสารในบิลเดียว ห้ามเหลือ partial สำหรับไปออกบิลอีกใบ
- เมื่อถูกใช้แล้วต้องขยับเป็น `เสร็จสิ้น` ทันที

## Flow สร้าง WTO

| ขั้นตอน | ผู้ใช้ทำอะไร | ระบบทำอะไร | สถานะที่ได้ |
|---|---|---|---|
| 1 | เลือกประเภท `WTO` | เตรียมฟอร์มขาออก | draft ในหน้าจอ |
| 2 | เลือกสาขาและลูกค้า | validate scope และ active `customer_branches` | draft |
| 3 | กรอกทะเบียนรถ/รูปรถ | เก็บหลักฐานเอกสารระดับ header | draft |
| 4 | เพิ่มรายการสินค้า | เลือกสินค้าก่อน แล้วเลือกคลัง `RM` / `FG` ใน line นั้นเพื่อดูคงเหลือและ validate stock | draft |
| 5 | กดบันทึก | ออกเลข `WTO...`, stamp วันเวลา/ผู้บันทึก, เขียน header/line/summary, intended warehouse ต่อ line, และ active pending_out โดยไม่เขียน stock ledger | `ส่งของแล้ว` / `รอออก` |

ผล downstream ของ `WTO`:

- `WTO` เป็นเอกสารส่งของ/ชั่งขาออกต้นทาง แต่ไม่ใช่ movement owner ของ stock
- ตอนสร้าง `WTO` ให้เลือกสินค้าใน line ก่อน แล้วเลือก `warehouse` ของ line นั้นภายหลัง
- `warehouse` ของ `WTO` ต้อง active, อยู่ในสาขาเดียวกัน, และเป็นคลัง `RM` หรือ `FG` เท่านั้น
- stock availability ของ `WTO` เป็นราย line ตาม `สินค้า + warehouse`; ถ้ายังไม่เลือก warehouse ให้แสดงว่ายังไม่ทราบคงเหลือ แต่อย่า block การเลือกสินค้า
- ทุก line ของ `WTO` ต้องเก็บ intended warehouse และสร้าง pending_out เพื่อให้ `Sales Bill` ใช้เป็นคลังต้นทางในการตัด stock
- active pending_out ของ `WTO` ต้องลด available stock ทันที เพื่อกันการสร้าง WTO เพิ่มเกินยอดพร้อมส่ง
- เมื่อบันทึก `WTO` สำเร็จ ยังไม่สร้าง stock movement; stock-out จะเกิดตอนบันทึก `Sales Bill Stock`
- ใช้เป็น source สำหรับ `Sales Bill` ฝั่ง stock sale
- ถ้ายังไม่ถูกนำไปออกบิล จะอยู่สถานะ `ส่งของแล้ว`
- เมื่อถูกนำไปออก `Sales Bill` ต้องตัดให้ครบทั้งเอกสารในบิลเดียว ห้ามเหลือ partial สำหรับไปออกบิลอีกใบ
- เมื่อถูกใช้แล้วต้องขยับเป็น `ออกบิลแล้ว` ทันที

## WTO Two-Loops Model

`WTO` มี 2 loop ที่ต้องแยก owner ให้ชัด:

1. `warehouse / stock loop`
   - owner: หน้า `WTI/WTO` เฉพาะส่วนเก็บ intended warehouse, แสดง stock availability, และสร้าง/release pending_out
   - เกิดตอนสร้าง/แก้ไข/ยกเลิก `WTO`
   - รับผิดชอบ `product-first line entry`, `warehouse selection per line`, stock availability per product+warehouse, active pending_out, rebuild pending_out, และ release pending_out
2. `billing / usage loop`
   - owner: หน้า `Sales Bill`
   - เกิดตอน `WTO` ถูกนำไปออก `SB`
   - รับผิดชอบ consume hold, final stock validation, stock-out ledger, `weight_ticket_usage_logs`, และสถานะ `ส่งของแล้ว -> ออกบิลแล้ว`

ข้อห้าม:

- ห้าม `WTO` เขียน stock ledger เอง
- ห้าม `WTO` เป็นแค่ check stock เฉย ๆ โดยไม่กันยอดไว้
- ห้าม `SB` ตัด stock จาก warehouse อื่นโดยไม่มีเหตุผล/audit ถ้า `WTO` ระบุ intended warehouse แล้ว
- ถ้ายังไม่ได้บันทึก `SB` ให้ถือว่ายังไม่เกิด stock-out ในระบบ แม้มี `WTO` แล้วก็ตาม

## List Flow / รายการใบรับ-ส่งของ

route หลัก: `/daily/weight-ticket-list`

หน้าที่ของ page นี้:

- รวมรายการ `WTI` และ `WTO`
- มี tab แยกขาเข้า/ขาออก
- filter ตามสถานะ สาขา คู่ค้า วันที่ ทะเบียนรถ และคำค้น
- row click เปิด detail page/modal ตาม implementation ปัจจุบัน
- row actions รองรับ `พิมพ์`, `แชร์`, `แก้ไข`, `ยกเลิก` ตามสิทธิ์และสถานะ

กติกา UI หลัก:

- row ทั้งแถวต้องคลิกเข้า detail ได้
- row action ต้อง `stopPropagation()`
- status filter ของ WTI และ WTO ต้องแยกชุดกัน เพราะสถานะทางธุรกิจไม่เหมือนกัน
- branch filter ต้องใช้ shared branch combobox ตาม design baseline

## Detail / Timeline Flow

detail ของ WTI/WTO ต้องตอบได้ 4 เรื่องพร้อมกัน:

1. ข้อมูลเอกสารปัจจุบัน
2. รายการสินค้า/น้ำหนัก/รูป
3. downstream usage
4. timeline การเปลี่ยนแปลง

timeline ต้องครอบคลุมอย่างน้อย:

- สร้างเอกสาร
- แก้ไขเอกสาร
- ยกเลิกเอกสาร
- ถูกนำไปใช้ downstream
  - `WTI -> PB`
  - `WTO -> SB`

target rule:

- ระยะสั้น detail/timeline อาจยังอ่านจาก audit + usage facts ที่มีอยู่
- ระยะกลาง/ยาวควรแยก dedicated status/usage logs เป็น source of truth ตาม [[Document History Table Design]]

## กติกาแก้ไขและยกเลิก

### WTI

- ถ้า `WTI` ยังไม่ถูกใช้ใน `Purchase Bill` ต้องแก้ไข/ยกเลิกได้ตามสิทธิ์
- ถ้า `WTI` ถูกใช้ใน `Purchase Bill` แล้ว ต้อง lock ทันที เพราะ target flow บังคับตัดครบทั้งเอกสารในบิลเดียว
- การยกเลิกต้องไม่ลบเงียบ ต้องผ่าน status/timeline

### WTO

- ถ้า `WTO` ยังไม่ถูกใช้ใน `Sales Bill` ต้องแก้ไข/ยกเลิกได้ตามสิทธิ์
- การแก้ไข/ยกเลิก `WTO` ไม่ต้อง reverse stock เพราะ `WTO` ไม่ใช่ movement owner
- ถ้า `WTO` ถูกใช้ใน `Sales Bill` แล้ว ต้อง lock ทันที เพราะ target flow บังคับตัดครบทั้งเอกสารในบิลเดียว
- การยกเลิกต้องไม่ลบเงียบ ต้องผ่าน status/timeline

### หลักการร่วม

- ใช้ usage facts จริงเป็นตัวตัดสิน lock/edit/cancel
- ไม่ใช้แค่ status string อย่างเดียว
- ถ้า downstream document ถูก cancel/reverse แล้ว ต้อง recalc การ lock ของ WTI/WTO กลับจาก facts ที่ active อยู่จริง

## Mutability / Lock Rules

ให้แยก `document status` ออกจาก `mutability state` ชัดเจน

### Document status

- `WTI`: `รับของแล้ว`, `เสร็จสิ้น`, `ยกเลิก`
- `WTO`: `ส่งของแล้ว`, `ออกบิลแล้ว`, `ยกเลิก`

### Mutability state

- `edit allowed`
- `cancel allowed`
- `edit locked`
- `cancel locked`

กติกา:

- ถ้าเอกสารยังไม่ถูกใช้ downstream:
  - `edit = allowed`
  - `cancel = allowed`
- ถ้าเอกสารถูกใช้ downstream แล้ว:
  - `edit = locked`
  - `cancel = locked`

mapping:

- `WTI` ถูกใช้โดย `PB` -> lock edit/cancel
- `WTO` ถูกใช้โดย `SB` -> lock edit/cancel

ข้อสำคัญ:

- lock state ต้อง derive จาก active usage facts ไม่ใช่ derive จาก status string อย่างเดียว
- ถ้า downstream document ถูก reverse/cancel สำเร็จแล้ว ต้อง recalc mutability state กลับจาก facts ที่ยัง active จริง

## Stock Reverse Rules

หัวข้อนี้อยู่ที่เอกสาร bill เพราะ target กลับมาเป็น bill-driven ตาม legacy

### Edit / Cancel WTI-WTO

- ถ้า `WTI/WTO` ยังไม่ถูกใช้ใน `PB/SB` ให้แก้ไขหรือยกเลิกเอกสารได้ตามสิทธิ์
- การแก้ไขหรือยกเลิก `WTI/WTO` ไม่ต้อง reverse stock ledger เพราะเอกสารนี้ไม่ได้สร้าง movement
- ถ้าแก้ไข `WTO` ที่ยังไม่ถูกใช้ ต้อง rebuild active hold ให้ตรง line ล่าสุดใน transaction เดียวกัน
- ถ้ายกเลิก `WTO` ที่ยังไม่ถูกใช้ ต้อง release active hold ทั้งหมด
- ถ้า `WTI/WTO` ถูกใช้ใน active `PB/SB` แล้ว ต้อง lock edit/cancel

### Edit / Cancel PB-SB ที่อ้าง WTI-WTO

- `PB` ที่อ้าง `WTI` ต้องเป็น owner ของ stock-in ledger
- `SB` ที่อ้าง `WTO` ต้อง consume hold และเป็น owner ของ stock-out ledger
- ถ้าแก้ไข `PB/SB` ต้อง reverse/rebuild movement ของ bill นั้นใน transaction เดียวกัน
- ถ้ายกเลิก `PB/SB` ต้อง reverse movement ของ bill นั้น และ release/recalc usage/status ของ `WTI/WTO`
- ถ้ายกเลิก `SB` ที่ consume hold จาก `WTO` แล้ว และ `WTO` ยัง active ต้อง reopen/recreate hold เพื่อให้ stock ไม่กลับไป available ให้ขายซ้ำก่อนออกบิลใหม่

### Guard rail

- ถ้า `WTO` ถูกใช้ใน `SB` แล้ว ห้าม edit/cancel เพื่อไม่ให้ stock layer กับ billing layer หลุดจากกัน
- การ reverse stock ต้องอิง ledger/source movement เดิมของ `PB/SB` ไม่ใช่คำนวณใหม่แบบ best guess จาก WTI/WTO อย่างเดียว

## รูปสินค้าและรูปรถ

WTI/WTO มีรูป 2 ระดับ:

1. รูปรถระดับเอกสาร
2. รูประดับรายการสินค้า

### รูประดับรายการสินค้า

- บังคับอย่างน้อย 1 รูปต่อ line
- เป็นหลักฐานหน้างาน
- ต้องแยกจาก master product image

### รูปสินค้าใน product picker

- มาจาก `products.image_storage_key` และ `products.image_thumbnail_storage_key`
- โหลดผ่าน `/api/daily/weight-tickets/products`
- ใช้ thumbnail เพื่อให้ picker เบาและ render เร็ว
- ไม่ต้องรอเลือกสาขาหรือคู่ค้าก่อนจึงเห็นรูปสินค้า

## Print และ Share

### Print

- `WTI` และ `WTO` ต้องพิมพ์ได้จากหน้า list และ detail
- ใช้ข้อมูลบริษัทจาก `ข้อมูลบริษัท (สำหรับใบพิมพ์)`
- ใช้ wording แยกตามทิศทางเอกสาร
  - `WTI` = ใบรับสินค้า / ผู้ขาย / ผู้รับของ
  - `WTO` = ใบส่งของ / ลูกค้า / ผู้ส่งของ / ผู้รับของ

### Share

- list page ต้องมี action `แชร์`
- current share message ใช้ข้อความสั้นเพื่อส่งต่อ เช่น เลขเอกสาร คู่ค้า สาขา วันเวลา น้ำหนักสุทธิ และลิงก์ detail
- share เป็น convenience action ไม่เปลี่ยนสถานะเอกสาร

รายละเอียดเรื่อง printable contract ระดับระบบดูที่ [[Printable Documents]]

## จุดตัดกับ Purchase Flow

`WTI` ใช้ใน Purchase Flow เฉพาะกรณี `Stock`

handoff rule:

- `WTI` เป็น source document ของ `Purchase Bill Stock`
- `Purchase Bill` ต้องดึงจาก product summary เป็นหลัก
- target ใหม่เป็น `WTI 1 ใบ -> PB 1 ใบ`
- `WTI` ต้องถูกใช้ครบใน `PB` เดียว ห้าม split ไปหลาย `PB`
- `PB` แบบ Stock ใน flow นี้ต้องเลือก `WTI` ได้ 1 ใบเป็น source หลัก แต่ภายใน PB เดียวยัง split allocation ระดับสินค้าไปหลาย `PO Buy` หรือ `Spot Buy` ได้
- `PB` เป็น movement owner: เมื่อ save `PB Stock` ต้องเขียน stock-in ledger โดยอ้าง `WTI`
- หลัง save/cancel `PB` ระบบต้อง recalc usage และ status ของ `WTI`

รายละเอียดเชิงซื้อให้ดู [[Purchase Flow]] และ [[Purchase Bills Page Flow]]

## จุดตัดกับ Sales Flow

`WTO` ใช้ใน Sales Flow สำหรับ stock delivery / stock sale

handoff rule:

- `WTO` เป็น source document ของ `Sales Bill`
- `Sales Bill` ต้อง allocate usage ต่อสินค้า/summary ให้ครบตามกติกาหน้าขาย
- target ใหม่เป็น `WTO 1 ใบ -> SB 1 ใบ`
- `WTO` ต้องถูกใช้ครบใน `SB` เดียว ห้าม split ไปหลาย `SB`
- `SB` เป็น movement owner: เมื่อ save `SB Stock` ต้อง consume hold และเขียน stock-out ledger โดยอ้าง intended warehouse จาก `WTO`
- หลัง save/cancel `SB` ระบบต้อง recalc usage และ status ของ `WTO`

รายละเอียดเชิงขายให้ดู [[Sales Flow]] และ [[Sales Bills Page Flow]]

## สถานะเป้าหมายของ WTI/WTO

สถานะของ WTI/WTO ต้องแยกจากสถานะของเอกสาร downstream:

| เอกสาร | ชุดสถานะ user-facing | ไม่ใช้สถานะนี้ใน target |
|---|---|---|
| `WTI` | `รับของแล้ว`, `เสร็จสิ้น`, `ยกเลิก` | `รับบางส่วน`, `ออกบิลบางส่วน` |
| `WTO` | `ส่งของแล้ว`, `ออกบิลแล้ว`, `ยกเลิก` | `ส่งบางส่วน`, `ออกบิลบางส่วน` |

หลักการ:

- `draft` เป็น state บนหน้าจอก่อน save เท่านั้น ไม่ใช่สถานะเอกสารที่บันทึกลง lifecycle
- `WTI/WTO` เป็น all-or-nothing document ใน target write path: 1 ใบต้องถูกใช้ครบใน downstream bill เดียว
- สถานะ partial ใช้ได้กับ `POB/POS` หรือ allocation ของ PO เท่านั้น ไม่ใช่สถานะเป้าหมายของ WTI/WTO
- lock edit/cancel ต้อง derive จาก active usage facts (`WTI -> PB`, `WTO -> SB`) ไม่ใช่ derive จาก status string อย่างเดียว

### WTI

| raw status | label ที่ user เห็น | ความหมาย |
|---|---|---|
| `received` | `รับของแล้ว` | ยังไม่ถูกใช้ใน PB |
| `billed` | `เสร็จสิ้น` | ถูกใช้ใน PB ครบแล้ว |
| `cancelled` | `ยกเลิก` | เอกสารถูกยกเลิก |

### WTO

| raw status | label ที่ user เห็น | ความหมาย |
|---|---|---|
| `delivered` หรือ equivalent | `ส่งของแล้ว` | ยังไม่ถูกใช้ใน SB |
| `billed` | `ออกบิลแล้ว` | ถูกใช้ใน SB ครบแล้ว |
| `cancelled` | `ยกเลิก` | เอกสารถูกยกเลิก |

## Use Case Map

| Use Case | ชื่อกรณี | ครอบคลุมในเอกสารนี้ | สถานะ |
|---|---|---|---|
| `UC-WT-01` | สร้าง WTI เพื่อรับของเข้า | ใช่ | ครบระดับ business flow |
| `UC-WT-02` | สร้าง WTO เพื่อส่งของออก | ใช่ | ครบระดับ business flow |
| `UC-WT-03` | ค้นหา/กรอง WTI/WTO ใน list page | ใช่ | ครบระดับ page flow |
| `UC-WT-04` | เปิด detail และดู timeline | ใช่ | ครบระดับ page flow |
| `UC-WT-05` | ใช้ WTI ไปออก PB แล้ว recalc status | ใช่ | handoff covered |
| `UC-WT-06` | ใช้ WTO ไปออก SB แล้ว recalc status | ใช่ | handoff covered |
| `UC-WT-07` | พิมพ์ WTI/WTO | ใช่ | ครบระดับ page flow |
| `UC-WT-08` | แชร์ WTI/WTO | ใช่ | ครบระดับ page flow |

## เรื่องที่ยังเป็น follow-up

| เรื่อง | เหตุผล |
|---|---|
| dedicated `weight_ticket_status_logs` / `weight_ticket_usage_logs` | ให้ timeline/read model แยกจาก audit log รวม |
| policy รายละเอียดของ partial unlock หลัง downstream cancel/reversal | ต้อง finalize จาก usage facts ของ PB/SB ทุกกรณี |
| image cleanup/orphan policy ของรูปหน้างาน | ต้องกำหนด lifecycle ตอน edit/cancel/replace ให้ชัด |
| report/reconciliation และ aging เอกสาร WTI/WTO แยกหน้า | flow หลักมีแล้ว แต่รายงานตรวจสอบและ aging ต้องอิง [[Document Aging Policy]] เพิ่ม |

## Remaining Implementation Gaps

หลัง normalize สถานะ WTI/WTO แล้ว งานที่ยังต้องตาม implementation มี 5 กลุ่ม:

| กลุ่มงาน | ต้องทำอะไร | เหตุผล |
|---|---|---|
| `SB edit/cancel reversal` | เมื่อมี write path edit/cancel ของ `SB` ต้อง reverse ledger และ reopen/release hold/usage facts ให้ถูก | create path consume hold แล้ว แต่ reversal path ยังไม่มี |
| `Stock balance drilldown` | เพิ่ม drilldown ให้เห็นว่า `on hold` มาจาก `WTO` ใบไหน line ไหน | ให้ผู้ใช้ตรวจที่มาของยอดจองได้จากหน้าสต็อก |
| `Usage / timeline QA` | พิสูจน์ detail/timeline ว่าเห็น downstream usage ของ `WTI -> PB` / `WTO -> SB` ครบทุกกรณี | ใช้ lock/edit/cancel และ audit จาก facts จริง |
| `Status labels` | ตรวจ list/detail/filter/print/downstream reference ให้ใช้ status canonical: WTI ไม่มี partial, WTO ไม่มี partial; list filter ตัด partial แล้ว | ป้องกัน UI กลับไปใช้ legacy wording |
| `Reports` | ทำ aging/reconciliation สำหรับ WTI/WTO ค้างออกบิล, legacy partial-billed debt, และ status ไม่ตรง usage | ใช้ตรวจข้อมูลเก่าและ migration debt |

## Backlog ที่ควรทำต่อ

- [x] เพิ่มปุ่ม `กลับไปหน้ารายการ` บนหน้า create/edit
- [x] เพิ่มปุ่ม `กลับไปหน้ารายการ` ใน footer fixed action bar ข้างปุ่มบันทึก
- [x] ปรับ UX/API ของ `WTO` ให้เลือกสินค้าใน line ก่อน แล้วเลือกคลัง `RM/FG` ต่อ line พร้อมแสดงคงเหลือและ validate stock จาก `สินค้า + คลัง`
- [x] เพิ่ม pending_out/reservation สำหรับ `WTO`: create/rebuild/release pending_out และแสดง `คงเหลือจริง / รอออก / พร้อมส่ง`
- [x] เติม `SB Stock` ให้ consume pending_out แล้วเขียน stock-out ledger โดยอ้าง `WTO` และ intended warehouse ตาม bill-driven target ใน create path
- [x] เติม downstream trace baseline ใน detail ให้เห็นว่า `WTI/WTO` ถูกใช้กับ `PB/SB` ไหน ใช้ไปเท่าไร และเหลือเท่าไร
- [x] แยก `weight_ticket_status_logs` และ `weight_ticket_usage_logs` ออกจาก generic audit log
- [x] ล็อก type บนหน้า create/edit และ API ไม่ให้เปลี่ยน `WTI <-> WTO`
- [ ] ปิดกติกา lock/edit/cancel ทุก edge case โดยอิง usage facts จริง ไม่อิง status string อย่างเดียว โดยเฉพาะ downstream edit/cancel/reversal
- [ ] ตรวจและ unify label/status ทุก surface: detail, print, export, และ downstream references
- [ ] กำหนด lifecycle ของรูปรถและรูปรายการสินค้า: replace, remove, cancel, orphan cleanup
- [ ] ตรวจ branch-scope และ permission ของ WTI/WTO APIs และ read models ให้ครบ
- [ ] ทำ reconciliation/report สำหรับ `WTI/WTO ค้างออกบิล`, aging bucket, legacy partial-billed debt, และ `status ไม่ตรง usage`
- [ ] harden print/share wording, signature labels, และ header company info
- [ ] ทำ browser QA จริงทั้ง desktop/mobile ครบ flow create/edit/cancel/detail/print/share และ handoff ไป `PB/SB`
## การจัดเรียงและการแสดงผลตามมาตรฐาน AcexPOS (Sorting & Table Styling)

หน้าจอรายการใบรับ-ส่งของ (`/daily/weight-ticket-list`) ได้รับการปรับปรุงตามมาตรฐาน AcexPOS UI:
1. **การเรียงลำดับข้อมูล (Sorting)**:
   - **ความจำเป็นทางธุรกิจ**: ผู้ใช้จำเป็นต้องสามารถจัดเรียงลำดับใบรับ-ส่งสินค้าจำนวนมากตามมิติต่างๆ เช่น วันที่, เลขที่เอกสาร, น้ำหนัก, คู่ค้า หรือสถานะ เพื่อให้ค้นหา ตรวจสอบ และจับคู่บิลได้สะดวกรวดเร็ว
   - **การทำงานร่วมกันระหว่าง Client และ Server**:
     - ฝั่ง Client (ใน `WeightTicketListPageClient.tsx`): ใช้คอมโพเนนต์ `<SortHeader>` ครบถ้วนทุกคอลัมน์หลักบน Desktop พร้อมส่งคำขอ `sortBy` และ `sortDir` ไปยัง API
     - ฝั่ง Server (ใน `src/lib/server/weight-tickets.ts`): ฟังก์ชัน `weightTicketOrderBy` จะแปลงฟิลด์เรียงลำดับที่มาจาก Client ไปเป็นคิวรีเรียงลำดับระดับฐานข้อมูลผ่าน Prisma โดยตรง (เช่น จัดเรียงตาม `doc_no`, `party_name`, `net_weight`, `container_deduction_weight`, `deduct_weight`, `branches.name` ฯลฯ)
2. **การแสดงผลแบบตารางและขอบตาราง (Table Borders)**:
   - ใช้ขอบตารางบางเบา `border-slate-200` ครอบรอบตาราง Desktop และแบ่งแถวด้วย `divide-y divide-slate-100` ร่วมกับเอฟเฟกต์โฮเวอร์ `hover:bg-slate-50` เพื่อความสวยงามและสบายตาตามข้อกำหนด AcexPOS (หลีกเลี่ยงขอบเส้นสีดำเข้มหรือสีเด่นชัด)
   - หน้าจอเดสก์ท็อปรองรับคอลัมน์แบบยืดหดได้ (Resizable Columns) และแสดงผลปุ่ม "คืนค่าเดิมตาราง" (Reset Widths) เมื่อผู้ใช้เริ่มลากเส้นปรับแต่งขนาด

## เมนูที่ใช้ใน flow นี้

| Step | เมนู | Route |
|---|---|---|
| สร้าง/แก้ไขใบรับ-ส่งของ | `รายการประจำวัน > ชั่งสินค้า / รับ-ส่งของ` | `/daily/weight-tickets` |
| ค้นหารายการใบรับ-ส่งของ | `รายการประจำวัน > รายการใบรับ-ส่งของ` | `/daily/weight-ticket-list` |
| ออกบิลรับซื้อจาก WTI | `รายการประจำวัน > บิลรับซื้อ` | `/purchase/bills` |
| ออกบิลขายจาก WTO | `รายการประจำวัน > บิลขาย` | `/sales/bills` |
