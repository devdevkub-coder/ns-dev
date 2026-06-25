---
title: Finance AP Page Flow
aliases:
  - Accounts Payable Page
  - Flow หน้าเจ้าหนี้ AP
  - หน้า Finance AP
tags:
  - ns-scrap-erp
  - finance
  - debt
  - accounts-payable
  - page-flow
status: draft
created: 2026-06-11
updated: 2026-06-24
---

# Finance AP Page Flow / Flow หน้าเจ้าหนี้ AP

## Scope

- Route: `/finance/ap`
- API: `GET /api/finance/ap`
- Owner: Finance & Debt
- Page type: read-only AP aging and payable dashboard
- Related payment owner: `/purchase/payments`
- Aging policy: [[Document Aging Policy]]

หน้านี้ใช้ดูยอดค้างจ่าย Supplier จากบิลรับซื้อ ไม่ใช่หน้าบันทึกจ่ายเงิน และไม่ใช่หน้าปรับสถานะบิลโดยตรง

## Source Of Truth

| Data | Source | Rule |
|---|---|---|
| ยอดตั้งหนี้ | `purchase_bills.total_amount` | เกิดตอนบันทึก `PB`; นับเฉพาะบิลที่ไม่ cancelled |
| ยอดจ่าย/หักแล้ว | `purchase_bills.paid_amount` | source หลักของยอดที่ตัด AP แล้ว รวม PMT, WHT, ส่วนลด, และ Supplier Advance ที่ถูก allocate |
| ยอดค้างจ่าย | `purchase_bills.payable_balance` | source หลักของ AP balance; ห้ามคำนวณทับจาก `payments` ก่อน เพราะอาจพลาด Supplier Advance หรือ allocation fact ใหม่ |
| ที่มาของการตัดยอด | `payments`, `payment_allocations`, `payment_approvals`, `supplier_advance_allocations` | ใช้เป็น drilldown/audit ว่า PMT/ADV ใดตัด PB ใดเท่าไร; cancelled/reversed facts ต้องไม่ถูกนับ |
| Aging | derived | ปัจจุบันไม่มี credit term ในระบบ; ใช้ `purchase_bills.date` เป็นวันที่ตั้งต้นนับอายุหนี้และใช้แจ้งเตือน readiness เท่านั้น |
| Supplier/Branch | `suppliers`, `branches` | ใช้ outward business code ใน filter/API |

AP เกิดตอนบันทึก `Purchase Bill (PB)` ไม่ใช่ตอนจ่ายเงิน และ `PMT` ใช้ลด AP เท่านั้น

## AP Impact Matrix / อะไรมีผลต่อเจ้าหนี้

| Event | AP effect | Calculation | Primary read field |
|---|---|---|---|
| สร้าง `POB` | ไม่เกิด AP | PO เป็น commitment เท่านั้น | ไม่มี |
| สร้าง `WTI` | ไม่เกิด AP | WTI เป็นหลักฐานรับของ/ชั่งเข้า ยังไม่ตั้งหนี้ | ไม่มี |
| บันทึก `PB` | เพิ่ม AP | `total_amount` ตั้งเป็นยอดบิลเต็ม; ถ้ามี Supplier Advance ให้ลดด้วยยอด allocate ที่จ่ายจริงแล้ว | `purchase_bills.total_amount`, `purchase_bills.payable_balance` |
| Allocate Supplier Advance เข้า `PB` | ลด AP | `payable_balance = total_amount - paid_amount`; `paid_amount` รวมยอด advance allocation ที่ active | `purchase_bills.paid_amount`, `purchase_bills.payable_balance` |
| อนุมัติจ่าย `PMA` | ยังไม่ลด AP | PMA เป็น approval/queue ยังไม่ใช่เงินออกจริง | ใช้ audit/lock เท่านั้น |
| บันทึกจ่าย `PMT` | ลด AP | เพิ่มยอดตัด AP จาก `amount + withholding_tax + discount` ของ PMT allocation ที่ active แล้ว refresh `paid_amount/payable_balance` | `purchase_bills.paid_amount`, `purchase_bills.payable_balance` |
| ยกเลิก `PMT` | เพิ่ม AP กลับ | reverse payment allocation/bank statement แล้ว refresh PB settlement | `purchase_bills.payable_balance` |
| ยกเลิก `PB` / supplier swap cancelled | เอาออกจาก active AP | PB cancelled ไม่อยู่ใน active payable; ต้อง release active PMA/ADV/PO/WTI ตาม flow ที่เกี่ยวข้อง | PB status + balance snapshot |

## Page Meaning

ใช้สำหรับ:

- ดูยอดค้างจ่ายรวมของ Supplier
- ดู aging bucket: `Current`, `1-30`, `31-60`, `61-90`, `>90`
- drilldown จาก supplier summary ไป bill detail rows
- export AP aging เป็น `.xlsx`
- ตรวจบิลที่ควรเข้าสู่ payment approval/payment queue

ไม่ใช้สำหรับ:

- สร้าง `PMA` / `PMT`
- ยกเลิก payment
- แก้ไข purchase bill
- ปรับ bank statement

## Main UI Contract

### Summary / KPI

ควรแสดง:

- ยอดค้างจ่ายรวม
- จำนวนบิลค้างจ่าย
- จำนวน Supplier ที่มียอดค้าง
- ยอดที่เริ่มมีอายุหนี้แล้ว (`aging > 0`)
- ยอดบิลอายุ 0-7 วัน ใช้เป็นสัญญาณเตือน/จัดลำดับพร้อมจ่าย
- breakdown ตาม aging bucket

### Filters

ควรรองรับ:

- ค้นหาเลข PB / รหัส Supplier / ชื่อ Supplier / สาขา
- Supplier
- Branch
- Status
- Aging bucket
- วันที่เอกสารจาก-ถึง
- sort: date, docNo, dueDate/agingBaseDate, payableBalance, supplierName, aging

ไม่ต้องมี `Channel` filter ใน AP รอบนี้ เพราะ purchase flow ยังไม่มี purchase channel เป็น source จริง ถ้าจะเพิ่มภายหลังต้องเพิ่ม field/source ในเอกสารซื้อก่อน ไม่ใช้ dropdown เปล่าหรือ fallback

### Table Columns

คอลัมน์เป้าหมาย:

- เลข PB
- วันที่บิล
- วันที่สร้างรายการ
- วันที่ตั้งต้นนับอายุหนี้ (`Aging Base Date`)
- Aging days
- Aging bucket
- Supplier code/name
- Branch
- Transaction mode
- Status
- ยอดบิล
- จ่ายแล้ว
- ค้างจ่าย

ต้องแยก `วันที่บิล` ออกจาก `วันที่สร้างรายการ`; ใน policy ปัจจุบัน `วันที่ตั้งต้นนับอายุหนี้` เท่ากับ `วันที่บิล` เพราะยังไม่มี credit term หรือ due date เฉพาะใบ และเป็นเพียงสัญญาณเตือน ไม่ใช่ข้อกำหนดจ่ายตามสัญญา

## Row Detail / Drilldown

กด row ควรเปิด read-only detail:

- PB document data
- supplier/branch
- total/paid/balance
- aging และวันที่ตั้งต้นนับอายุหนี้
- PB source link ไป `/purchase/bills`
- PMA refs จาก `payment_approvals` สำหรับ audit/queue เท่านั้น; PMA ไม่ลดยอด AP
- PMT allocation refs จาก `payments` / `payment_allocations`
- Supplier Advance allocation refs จาก `supplier_advance_allocations`
- cancelled/reversed payment หรือ allocation ต้องแสดงเป็น audit ได้เฉพาะเมื่อออกแบบ explicit audit view แล้ว แต่ห้ามเอามาลดยอด active AP
- link ไป `/purchase/bills`, `/daily/payment-approval`, `/purchase/payments`, และ Supplier Advance source ที่เกี่ยวข้อง

## API Contract

`GET /api/finance/ap` รับ query:

- `q`
- `supplierId`
- `branchId`
- `status`
- `bucket`
- `from`
- `to`
- `page`
- `pageSize`
- `sortKey`
- `sortDirection`
- `format=json|xlsx`

Response ควรรวม:

- `rows`
- `bySupplier`
- `byBucket`
- `summary`
- `filters`
- `pagination`

`rows[*]` ต้องส่งค่า balance จาก `purchase_bills` โดยตรง:

- `totalAmount` = `purchase_bills.total_amount`
- `paidAmount` = `purchase_bills.paid_amount`
- `payableBalance` = `purchase_bills.payable_balance`
- drilldown facts เป็นข้อมูลอธิบายยอดเท่านั้น ไม่ใช่ source สำหรับคำนวณยอดใน list/export/summary

## Business Rules

- AP page ต้องไม่สร้างหรือแก้ `PMA/PMT`
- ยอดจ่ายที่ cancelled ต้องไม่ลด AP balance
- ถ้า PB ถูกยกเลิกหรือ supplier swap cancelled ต้องไม่แสดงเป็น payable active
- ยอดค้างจ่ายใน list/export/summary ต้องอ่านจาก `purchase_bills.payable_balance` เป็นหลัก
- ยอดจ่าย/หักแล้วใน list/export/summary ต้องอ่านจาก `purchase_bills.paid_amount` เป็นหลัก
- `payments`, `payment_allocations`, `payment_approvals`, และ `supplier_advance_allocations` ใช้แสดงรายการอ้างอิง PMT/ADV/drilldown เท่านั้น ไม่ใช้เป็น source หลักเพื่อ derive balance หาก `purchase_bills` มี balance snapshot แล้ว
- Supplier Advance ที่ allocate เข้า PB ต้องลด AP ผ่าน `purchase_bills.payable_balance` และ allocation facts โดยไม่รอ `PMT`
- AP aging ปัจจุบันไม่มี credit term; `dueDate` ใน API เป็น field compatibility ที่มีค่าเท่ากับ `purchase_bills.date` เพื่อใช้ sort/bucket/alert เท่านั้น
- Aging ต้องหยุดนับเมื่อยอดค้างเป็น 0

## Current Implementation / Gap

- มี read/export baseline จาก `purchase_bills` และ `payments`
- Implementation checkpoint 2026-06-25: `/api/finance/ap` อ่าน `purchase_bills.payable_balance` / `purchase_bills.paid_amount` เป็น source หลักแล้ว; `payments`, `payment_allocations`, `payment_approvals`, และ `supplier_advance_allocations` ใช้เป็น drilldown/audit เท่านั้น
- current AP aging policy ตั้งใจใช้ `purchase_bills.date` เป็นวันที่ตั้งต้นนับอายุหนี้; หากอนาคตเพิ่ม due date/credit term ให้เปลี่ยน policy และ schema ตอนนั้น
- ต้องเพิ่ม created-date display ใน list/detail/export
- AP detail drilldown เห็น PB/PMA/PMT และ Supplier Advance allocation facts โดยตรงแล้ว
- source links ไป PB/PMA/PMT/Supplier Advance แสดงใน detail modal แล้ว; export/source-link เชิงลึกยังเป็นงานต่อยอดถ้าต้องการคลิกทะลุทุกเอกสาร
- AP channel filter ถูกตัดออกจนกว่าจะมี purchase channel จริงในเอกสารซื้อ
- รอบนี้ไม่เพิ่ม/แก้ credit term หรือ due date schema: AP aging ใช้ `purchase_bills.date` เป็นฐานแจ้งเตือนเท่านั้น
- UI ต้องอยู่ตาม `docs/design.md` / Peach: KPI เป็น metric cards บน grid ตรง, toolbar/filter ขนาด `h-9` ถึง `h-10`, ตาราง desktop lined table + resizable/sort, mobile เป็น dense cards, detail modal เป็น read-only dark header

## Related Notes

- [[Document Aging Policy]]
- [[Payment Flow]]
- [[Purchase Bills Page Flow]]
- [[Finance Bank Statement Page Flow]]
