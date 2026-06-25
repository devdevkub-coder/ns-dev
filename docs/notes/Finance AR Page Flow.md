---
title: Finance AR Page Flow
aliases:
  - Accounts Receivable Page
  - Flow หน้าลูกหนี้ AR
  - หน้า Finance AR
tags:
  - ns-scrap-erp
  - finance
  - debt
  - accounts-receivable
  - page-flow
status: draft
created: 2026-06-11
updated: 2026-06-24
---

# Finance AR Page Flow / Flow หน้าลูกหนี้ AR

## Scope

- Route: `/finance/ar`
- API: `GET /api/finance/ar`
- Owner: Finance & Debt
- Page type: read-only AR aging and receivable dashboard
- Related receipt owner: `/sales/receipts`
- Aging policy: [[Document Aging Policy]]

หน้านี้ใช้ดูยอดค้างรับจากลูกค้าตามบิลขาย ไม่ใช่หน้าบันทึกรับเงิน และไม่ใช่หน้าแก้บิลขายโดยตรง

## Source Of Truth

| Data | Source | Rule |
|---|---|---|
| ยอดตั้งลูกหนี้ | `sales_bills.total_amount` | เกิดตอนบันทึก `SB`; นับเฉพาะบิลที่ไม่ cancelled |
| ยอดรับ/หักแล้ว | `sales_bills.received_amount` | source หลักของยอดที่ตัด AR แล้ว รวม RCP, WHT, ส่วนลด, และ Customer Advance ที่ถูก allocate |
| ยอดค้างรับ | `sales_bills.receivable_balance` | source หลักของ AR balance; ห้ามคำนวณทับจาก legacy `receipts` ก่อน เพราะอาจพลาด Customer Advance หรือ allocation fact ใหม่ |
| ที่มาของการตัดยอด | `customer_receipt_allocations`, `customer_receipts`, legacy `receipts` mirror | ใช้เป็น drilldown/audit ว่า RCP ใดตัดบิลใดเท่าไร; cancelled allocation/receipt ต้องไม่ถูกนับ |
| Aging | derived | ใช้ `sales_bills.due_date`; ถ้าไม่มีใช้ bill date + customer credit term |
| Customer/Branch/Channel | `customers`, `branches`, `sales_channels` | ใช้ outward business code ใน filter/API |

AR เกิดตอนบันทึก `Sales Bill (SB)` ไม่ใช่ตอนรับเงิน และ `RCP` ใช้ลด AR เท่านั้น

## AR Impact Matrix / อะไรมีผลต่อลูกหนี้

| Event | AR effect | Calculation | Primary read field |
|---|---|---|---|
| สร้าง `PO Sell` | ไม่เกิด AR | PO Sell เป็น commitment/order เท่านั้น | ไม่มี |
| สร้าง `WTO` | ไม่เกิด AR | WTO เป็นเอกสารส่งของและ `pending_out`; ยังไม่ใช่ยอดขาย/ลูกหนี้ | ไม่มี |
| บันทึก `SB` | เพิ่ม AR | `total_amount` ตั้งเป็นยอดบิลขาย; ถ้ามี Customer Advance ให้ลดด้วยยอด allocate ที่ active | `sales_bills.total_amount`, `sales_bills.receivable_balance` |
| Allocate Customer Advance เข้า `SB` | ลด AR | `receivable_balance = total_amount - received_amount`; `received_amount` รวมยอด advance allocation ที่ active | `sales_bills.received_amount`, `sales_bills.receivable_balance` |
| บันทึกรับเงิน `RCP` | ลด AR | เพิ่มยอดตัด AR จาก `amount + withholding_tax + discount` ของ receipt allocation ที่ active แล้ว refresh `received_amount/receivable_balance` | `sales_bills.received_amount`, `sales_bills.receivable_balance` |
| ยกเลิก `RCP` | เพิ่ม AR กลับ | reverse receipt allocation/bank statement แล้ว refresh SB settlement | `sales_bills.receivable_balance` |
| ยกเลิก `SB` | เอาออกจาก active AR | SB cancelled ไม่อยู่ใน active receivable; ต้อง reverse stock/WTO/PO Sell/advance ตาม flow ที่เกี่ยวข้อง | SB status + balance snapshot |

## Page Meaning

ใช้สำหรับ:

- ดูยอดค้างรับรวมของลูกค้า
- ดู aging bucket ของบิลขาย
- ดู top customers ตามยอดค้าง
- export AR aging เป็น `.xlsx`

ไม่ใช้สำหรับ:

- สร้าง `RCP`
- ยกเลิก receipt
- แก้ไข sales bill
- รับเงินล่วงหน้า customer

## Main UI Contract

### Summary / KPI

ควรแสดง:

- ยอดค้างรับรวม
- จำนวนบิลค้างรับ
- จำนวนลูกค้าที่มียอดค้าง
- ยอด overdue
- ยอดครบกำหนดภายใน 7 วัน
- breakdown ตาม aging bucket

ไม่ต้องแสดง Pending Sale / stock issue summary แล้ว เพราะ target sales flow ตัด `PSALE` ออกจาก runtime และใช้ `WTO -> pending_out -> Sales Bill` เท่านั้น

### Filters

ควรรองรับ:

- ค้นหาเลข SB / รหัสลูกค้า / ชื่อลูกค้า / ช่องทางขาย / สาขา
- Customer
- Branch
- Sales channel
- Status
- Aging bucket
- วันที่เอกสารจาก-ถึง
- sort: date, docNo, dueDate, receivableBalance, customerName, aging

### Table Columns

คอลัมน์เป้าหมาย:

- เลข SB
- วันที่บิล
- วันที่สร้างรายการ
- วันที่ครบกำหนด
- Aging days
- Aging bucket
- Customer code/name
- Branch
- Channel
- Transaction mode
- Status
- ยอดบิล
- รับแล้ว
- ค้างรับ

ต้องแยก `วันที่บิล` ออกจาก `วันที่สร้างรายการ` และ `วันที่ครบกำหนด`

## Row Detail / Drilldown

กด row ควรเปิด read-only detail:

- SB document data
- customer/branch/channel
- total/received/balance
- aging/due date
- SB source link ไป `/sales/bills`
- RCP allocation refs จาก `customer_receipt_allocations` / `customer_receipts`
- Customer Advance allocation refs จาก Sales Bill advance allocation facts
- cancelled/reversed receipt หรือ allocation ต้องแสดงเป็น audit ได้เฉพาะเมื่อออกแบบ explicit audit view แล้ว แต่ห้ามเอามาลดยอด active AR
- link ไป `/sales/bills`, `/sales/receipts`, และ Customer Advance source ที่เกี่ยวข้อง

## API Contract

`GET /api/finance/ar` รับ query:

- `q`
- `customerId`
- `branchId`
- `channelId`
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
- `byCustomer`
- `byBucket`
- `summary`
- `filters`
- `pagination`

`rows[*]` ต้องส่งค่า balance จาก `sales_bills` โดยตรง:

- `totalAmount` = `sales_bills.total_amount`
- `receivedAmount` = `sales_bills.received_amount`
- `receivableBalance` = `sales_bills.receivable_balance`
- drilldown facts เป็นข้อมูลอธิบายยอดเท่านั้น ไม่ใช่ source สำหรับคำนวณยอดใน list/export/summary

## Business Rules

- AR page ต้องไม่สร้างหรือแก้ `RCP`
- Receipt ที่ cancelled ต้องไม่ลด AR balance
- ถ้า SB ถูกยกเลิกต้องไม่แสดงเป็น receivable active
- ยอดค้างรับใน list/export/summary ต้องอ่านจาก `sales_bills.receivable_balance` เป็นหลัก
- ยอดรับแล้วใน list/export/summary ต้องอ่านจาก `sales_bills.received_amount` เป็นหลัก
- `customer_receipt_allocations` และ legacy `receipts` ใช้แสดงรายการอ้างอิง RCP/drilldown เท่านั้น ไม่ใช้เป็น source หลักเพื่อ derive balance หาก `sales_bills` มี balance snapshot แล้ว
- ถ้ามี Customer Advance ถูก allocate ตอนสร้าง SB, AR ต้องลดผ่าน `sales_bills.receivable_balance` และ allocation facts โดยไม่รอ `RCP`
- Aging ต้องใช้ due date ก่อน credit term fallback
- Aging ต้องหยุดนับเมื่อยอดค้างเป็น 0
- Customer advance ที่ allocate เข้า SB ต้องลดยอดลูกหนี้ผ่าน allocation facts ไม่ใช่ string snapshot ระยะยาว

## Current Implementation / Gap

- มี read/export baseline จาก `sales_bills` และ `receipts`
- Implementation checkpoint 2026-06-25: `/api/finance/ar` อ่าน `sales_bills.receivable_balance` / `sales_bills.received_amount` เป็น source หลักแล้ว; `customer_receipt_allocations`, legacy `receipts`, และ Customer Advance allocation facts ใช้เป็น drilldown/audit เท่านั้น
- AR due date รองรับ `due_date` และ customer credit term แล้ว
- ต้องเพิ่ม created-date display ใน list/detail/export
- customer advance allocation มี dedicated Sales Bill allocation facts แล้ว และ `/finance/ar` แสดง drilldown จาก allocation facts โดยไม่ derive balance ทับจาก log
- source links ไป SB/RCP/Customer Advance แสดงใน detail modal แล้ว; export/source-link เชิงลึกยังเป็นงานต่อยอดถ้าต้องการคลิกทะลุทุกเอกสาร
- UI ต้องอยู่ตาม `docs/design.md` / Peach: KPI เป็น metric cards บน grid ตรง, toolbar/filter ขนาด `h-9` ถึง `h-10`, ตาราง desktop lined table + resizable/sort, mobile เป็น dense cards, detail modal เป็น read-only dark header
- [x] **การปรับปรุงตามภารกิจ NSERP-27 (2026-06-20):**
  - เพิ่ม Tab switcher สลับหน้าสรุปตาม Customer (Summary) และหน้ารายบิล (Detail) ทั้งบน Desktop และ Mobile Card view
  - เพิ่มตัวชี้วัดสรุปประเภทลูกหนี้ค้างรับสะสมแยกเป็น "ในประเทศ" และ "ต่างประเทศ" บนหน้าการ์ด KPI ด้านบน
  - เปลี่ยนตัวกรองค้นหาลูกค้าเป็น `SearchCombobox` เพื่อให้ค้นหาตามชื่อ/รหัสลูกค้าได้สะดวกแบบ Autocomplete ทั้ง Desktop และลิ้นชักตัวกรอง Mobile
  - เพิ่มตารางสรุป `SummaryTable` แสดงข้อมูลรายยอดค้างรับของลูกค้าแต่ละรายแยกตามบิลและช่วงอายุหนี้ (Current, 1-30, 31-60, 61-90, >90 วัน) พร้อมยอดรวมทั้งหมดท้ายตาราง

## Related Notes

- [[Document Aging Policy]]
- [[Sales Flow]]
- [[Sales Bills Page Flow]]
- [[Finance Bank Statement Page Flow]]
- [[Customer Advance Page Flow]]
