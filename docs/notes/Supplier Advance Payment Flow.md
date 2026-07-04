---
title: Supplier Advance Payment Flow
aliases:
  - จ่ายเงินล่วงหน้า Supplier
  - มัดจำ Supplier
  - Supplier Deposit Flow
  - ADV Flow
tags:
  - ns-scrap-erp
  - purchase
  - payment
  - supplier-advance
  - business-flow
status: draft
created: 2026-06-01
updated: 2026-07-04
---

# Supplier Advance Payment Flow / จ่ายเงินล่วงหน้า Supplier

เอกสารนี้เป็น flow เฉพาะของ `จ่ายเงินล่วงหน้า / มัดจำ Supplier` (`ADV`) เพื่อแยก rule ออกจาก `PO Buy`, `Purchase Bill`, และ `Payment Flow` แต่ยังเชื่อมกันในภาพรวมซื้อ

เอกสารที่เกี่ยวข้อง:

- [[Purchase Flow]] สำหรับภาพรวม `PO Buy -> WTI -> Purchase Bill -> Approval -> Payment`
- [[Payment Flow]] สำหรับ `PMA`, `PMT`, queue อนุมัติจ่ายเงิน, รอจ่าย, และประวัติการจ่ายเงิน

## ขอบเขต

ใช้เมื่อบริษัทต้องจ่ายเงินให้ Supplier ก่อนออก `บิลรับซื้อ` เต็มใบ เช่น:

- มี `PO Buy` แล้ว และตกลงจ่ายมัดจำก่อน Supplier ส่งของ
- รถเข้าของแบบชั่งน้ำหนักรวมจากเครื่องชั่งใหญ่ แต่ยังไม่ได้แตกชั่งย่อย/ตรวจสอบละเอียดใน `WTI`
- ต้องจ่ายบางส่วนก่อน แล้วค่อยออก `Purchase Bill` หลังข้อมูลรับของหรือ trading bill สมบูรณ์
- มี invoice/tax invoice ของเงินมัดจำจาก Supplier แล้ว ต้องบันทึกเลข invoice และ VAT ตั้งแต่ตอนสร้าง ADV

`ADV` เป็น source document ฝั่งจ่ายเงินของตัวเอง ไม่ใช่ `PMA` และไม่ใช่ `PMT`

## Mermaid Flow

```mermaid
flowchart TD
  A[เริ่มจาก PO Buy หรือข้อตกลงซื้อ] --> B{ต้องจ่ายเงินล่วงหน้าหรือไม่}
  B -- ไม่ต้องจ่าย --> C[ดำเนิน flow ปกติ: WTI หรือ Trading PB]
  B -- ต้องจ่าย --> D[สร้าง ADV<br/>status = ยังไม่อนุมัติ]
  D --> E[/daily/payment-approval<br/>source pending = ADV]
  E --> F{อนุมัติยอด ADV เท่าไหร่?}
  F -- บางส่วน --> PA[สร้าง PMA ตามยอดอนุมัติ<br/>ADV = อนุมัติแล้วบางส่วน]
  F -- เต็มยอด --> AP[สร้าง PMA ครอบคลุมยอด ADV<br/>ADV = อนุมัติแล้ว]
  PA --> E
  PA --> Q[/purchase/payments<br/>PMA รอจ่าย]
  AP --> Q
  Q --> V{void PMA ก่อนจ่าย?}
  V -- ใช่ --> R[recalc ADV จาก active PMA<br/>ไม่มี active = ยังไม่อนุมัติ<br/>เหลือบางส่วน = อนุมัติแล้วบางส่วน]
  R --> E
  V -- ไม่ --> G[จ่ายเงินจริงเป็น PMT<br/>ต้องจ่ายเต็ม PMA]
  G --> X{cancel PMT?}
  X -- ใช่ --> Y[ปิดรอบ PMA เดิมเป็น audit<br/>recalc ADV จาก active PMA/PMT/allocation]
  Y --> E
  X -- ไม่ --> H[ADV = จ่ายแล้ว/จ่ายแล้วบางส่วน<br/>ยอด paid พร้อมนำไป allocate]
  H --> I[สร้าง Purchase Bill ภายหลัง]
  I --> J[เลือก ADV ที่จะหักกับ PB]
  J --> K{ยอด ADV available เทียบยอด PB}
  K -- น้อยกว่า PB --> L[ADV = ใช้หักบิลแล้ว<br/>PB เหลือ payable balance]
  L --> M[ยอดคงเหลือ PB เข้าอนุมัติจ่ายเงิน]
  M --> N[จ่ายยอดคงเหลือเป็น PMT]
  K -- เท่ากับ PB --> O[ADV = ใช้หักบิลแล้ว<br/>PB เสร็จสิ้น ไม่ต้องเข้า approval เพิ่ม]
  K -- มากกว่า PB --> P[ADV = ใช้หักบิลบางส่วน<br/>ห้าม carry forward อัตโนมัติ]
  P --> Z[Supplier refund future flow<br/>ไม่ใช่ ADV status/filter ปัจจุบัน]
```

## เอกสารและสถานะ

| เอกสาร | หน้าที่ | สถานะหลัก |
|---|---|---|
| `POB` | ต้นทางสั่งซื้อ/จองซื้อ ถ้ามี PO | `เปิดอยู่`, `ออกบิลบางส่วน`, `ออกบิลแล้ว`, `ปิดรับไม่ครบ` |
| `ADV` | source document ของเงินล่วงหน้า Supplier | `ยังไม่อนุมัติ`, `อนุมัติแล้วบางส่วน`, `อนุมัติแล้ว`, `จ่ายแล้วบางส่วน`, `จ่ายแล้ว`, `ใช้หักบิลบางส่วน`, `ใช้หักบิลแล้ว`, `ยกเลิก` |
| `PMA` | approval snapshot ของ ADV หรือยอดคงเหลือ PB | `อนุมัติแล้ว`, `จ่ายแล้ว` หรือสถานะตาม Payment Flow ล่าสุด |
| `PMT` | voucher จ่ายเงินจริง | `เสร็จสิ้น`, `ยกเลิกแล้ว` |
| `PB` | บิลรับซื้อที่นำ ADV ไปหักภายหลัง | `ยังไม่อนุมัติ`, `รอจ่าย`, `ชำระบางส่วน`, `เสร็จสิ้น`, `ยกเลิก` |

## ข้อมูลขั้นต่ำของ ADV

ข้อมูลการเงิน:

- Supplier
- สาขา
- วันที่จ่าย
- ยอดจ่ายล่วงหน้า
- หมายเหตุ
- เอกสารอ้างอิง เช่น `POB`, ใบชั่งน้ำหนักใหญ่, หรือเลขอ้างอิงจาก Supplier

ข้อมูลต้นทางจากใบชั่งน้ำหนักใหญ่ ถ้ามี:

- เลขที่เอกสารใบชั่งน้ำหนักใหญ่
- วันที่เข้า
- วันที่ออก
- ทะเบียนรถ
- รูปรถ
- ชื่อสินค้า
- น้ำหนักเข้า
- น้ำหนักออก
- น้ำหนักสุทธิ เป็นค่าอัตโนมัติจาก `น้ำหนักเข้า - น้ำหนักออก` ในหน้า `/purchase/advance-payments` ไม่ใช่ช่องที่ผู้ใช้แก้เอง
- ราคา/กก.

หมายเหตุล่าสุด: หน้า `/purchase/advance-payments` ไม่แสดง `วิธีจ่าย`, `บัญชีที่จ่าย`, `ชื่อลูกค้า`, `พนักงานขับรถ`, `ผู้ชั่งน้ำหนัก`, หรือ `ผู้ส่ง`; ข้อมูลช่องทางจ่ายจริงอยู่ใน approval/payment flow

### ADV แบบ Invoice + VAT

เคสพิเศษนี้ใช้เมื่อ Supplier ออก invoice/tax invoice สำหรับเงินมัดจำแล้ว จึงต้องเก็บข้อมูลภาษีตั้งแต่ ADV แต่ยังใช้ approval/payment lifecycle เดียวกับ ADV ปกติ

ข้อมูลขั้นต่ำ:

- สาขา
- Supplier
- เลข Invoice บังคับกรอก
- ประเภท VAT บังคับเลือก: `ไม่มี VAT` หรือ `มี VAT`
- ยอดมัดจำก่อน VAT
- VAT amount คำนวณอัตโนมัติ
- ยอดจ่ายจริงรวม VAT คำนวณอัตโนมัติ
- หมายเหตุ

สูตรคำนวณ:

- `advance_base_amount` = ยอดมัดจำก่อน VAT ที่ผู้ใช้กรอก
- `advance_vat_amount` = 0 เมื่อเลือก `ไม่มี VAT`; ถ้าเลือก `มี VAT` ให้คำนวณจาก `advance_base_amount * active VAT rate`
- `advance_gross_amount` = `advance_base_amount + advance_vat_amount`
- `PMA.approved_amount` และ `PMT` ต้องใช้ `advance_gross_amount` เพราะเป็นยอดเงินออกจริง
- ยอดที่นำไปหักกับ PB ต้องเก็บแยกเป็นฐานก่อน VAT และ VAT ไม่ใช้ยอด gross ไปหักฐานสินค้าโดยตรง

## Rule การจ่าย ADV

- หลังบันทึก ADV ต้องเข้า `/daily/payment-approval`
- ผู้อนุมัติสามารถ split ADV เป็นหลาย approval item ได้
- แต่ละ approval item ต้องไปเป็นรายการรอจ่ายใน `/purchase/payments`
- เมื่อทำจ่ายสำเร็จ ต้องเกิด `PMT`
- ADV ที่ยังไม่จ่ายสำเร็จ ห้ามนำไป allocate หักกับ PB
- ADV แบบ Invoice + VAT ต้องอนุมัติและจ่ายด้วยยอดรวม VAT (`advance_gross_amount`) แต่ต้องเก็บฐานก่อน VAT และ VAT ไว้สำหรับตอน allocate เข้า PB
- ถ้า approve ADV ไม่เต็มยอด ให้ ADV แสดง `อนุมัติแล้วบางส่วน` และยอดที่เหลือยังเป็น pending source candidate
- ถ้า PMA ของ ADV ถูก void หรือ PMT ของ ADV ถูกยกเลิก ต้อง recalc ADV จาก active PMA/PMT/allocation ใหม่; ถ้าไม่เหลือ active PMA ให้กลับเป็น `ยังไม่อนุมัติ`, ถ้าเหลือบางส่วนให้เป็น `อนุมัติแล้วบางส่วน`
- PMA เดิมที่ถูก void หรือถูกปิดรอบจาก cancel PMT ใช้เป็น audit/history เท่านั้น และต้องสร้าง PMA ใหม่ก่อนจ่าย ADV ใหม่

## Rule การ allocate ADV เข้าบิลรับซื้อ

- `PB` 1 ใบอาจใช้ ADV ได้หลายรายการ
- `ADV` 1 รายการอาจถูกใช้กับ PB เดียวหรือหลาย PB ได้ตาม policy ที่จะออกแบบต่อ
- ต้องกันไม่ให้ allocate ADV เกินยอดจ่ายจริงที่ยังเหลือ
- ยอดเจ้าหนี้สุทธิของ PB = `ยอดบิลเต็ม - ยอด ADV ที่ allocate`
- ถ้า ADV ไม่มี VAT ให้ allocate ด้วยยอดมัดจำตามปกติ
- ถ้า ADV มี VAT ให้ allocate กับ PB แบบแยกฐานและ VAT:
  - หัก `PB base/subtotal` ด้วย `ADV base amount` ที่ allocate
  - หักหรืออ้างอิง `PB VAT` ด้วย `ADV VAT amount` ที่ allocate
  - ห้ามนำ `ADV gross amount` ไปหัก `PB base/subtotal` โดยตรง
  - ยอดคงเหลือที่ต้องจ่ายของ PB = `(PB base - allocated ADV base) + (PB VAT - allocated ADV VAT)`
- ถ้าใช้ ADV มี VAT บางส่วนหรือใช้ข้ามหลาย PB ต้องคำนวณ VAT allocation ตามสัดส่วนของฐานที่ allocate เพื่อไม่ให้ VAT ถูกใช้ซ้ำหรือเกินยอด invoice
- ถ้ายอดเจ้าหนี้สุทธิ `> 0` ให้ยอดคงเหลือเข้า `/daily/payment-approval`
- ถ้ายอดเจ้าหนี้สุทธิ `= 0` ให้ PB เป็น `เสร็จสิ้น` และไม่ต้องเข้า approval เพิ่ม
- ถ้า ADV มากกว่า PB ห้าม carry forward เป็นเครดิต Supplier อัตโนมัติ ต้องเข้า flow `คืนเงินมัดจำ/คืนเงินล่วงหน้า Supplier`
- `รอคืนเงิน` และ `คืนเงินแล้ว` ไม่ใช่สถานะ runtime ของ ADV ใน phase ปัจจุบัน และต้องไม่แสดงใน filter หน้า `/purchase/advance-payments`; refund ต้องเป็น flow Supplier แยกต่างหากเมื่อออกแบบเพิ่ม
- ถ้า PB ถูกยกเลิกหรือ supplier swap void PB เดิม ต้องคืน ADV allocation แล้ว recalc สถานะใหญ่กลับไปเป็น `จ่ายแล้ว` หรือ `จ่ายแล้วบางส่วน` ตามยอด PMT จริง

## Traceability ที่ต้องเห็น

ในรายละเอียดเอกสารควร trace ได้อย่างน้อย:

- `POB` ใดเป็นบริบทของ ADV ถ้ามี
- เลข Invoice, ประเภท VAT, ฐานก่อน VAT, VAT, และยอดรวม VAT ของ ADV แบบ Invoice + VAT
- `ADV` ใดถูกจ่ายด้วย `PMA/PMT` ใด
- `ADV` ใดถูก allocate เข้า `PB` ใด
- ยอด ADV เดิม, ยอดใช้แล้ว, ยอดคงเหลือ
- สำหรับ ADV มี VAT ต้อง trace ยอดฐานและ VAT ที่ถูก allocate เข้า PB แต่ละใบ
- ถ้า PB ถูกยกเลิก ต้องมี rule คืนยอด ADV allocation ให้ถูกต้องตาม policy และ audit trail

## Open Decisions

- จะให้ `ADV` 1 รายการ allocate ข้ามหลาย PB ได้ทันทีหรือจำกัด 1 ADV ต่อ 1 PB ใน phase แรก
- UX ของหน้า `/purchase/advance-payments` จะใช้ mode แยกชัดเจนระหว่าง `ADV ปกติ` กับ `ADV Invoice + VAT` หรือใช้ field set เดียวแล้วซ่อน/แสดงตามประเภท
- policy การ round VAT เมื่อนำ ADV มี VAT ไป allocate แบบบางส่วนหรือข้ามหลาย PB
- route สำหรับ `คืนเงินมัดจำ/คืนเงินล่วงหน้า Supplier`
- policy เมื่อ PB ถูกยกเลิกหลังมี ADV allocation แต่ยังไม่มี payment ยอดคงเหลือ
- report/reconciliation สำหรับ `POB -> ADV -> PMT -> PB`
