---
title: Tax / VAT / WHT Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-07-04
route: /finance-accounting/tax-vat-wht
---

# Tax / VAT / WHT Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Finance Accounting |
| Route | `/finance-accounting/tax-vat-wht` |
| Page | Tax / VAT / WHT |
| Current Next | accepted code baseline |

## Canonical References

[[Finance Accounting Flow]], [[Menu Page Flow Catalog]]

## Flow Baseline

finance/accounting read model: Tax / VAT / WHT

## Feature Summary

หน้า `Tax / VAT / WHT` เป็นหน้ารวมภาษีจากเอกสารปฏิบัติงานจริง เพื่อให้ทีมบัญชี/การเงินเห็นยอดภาษีขาย, ภาษีซื้อ, ภาษีหัก ณ ที่จ่าย, เอกสารภาษีที่ยังขาด และวันครบกำหนดนำส่งภาษีในงวดที่เลือก โดยไม่ต้องไล่เปิดเอกสารทีละระบบ

| Feature | What it shows | Business value |
|---|---|---|
| Period tax summary | VAT Output, VAT Input, VAT Payable, WHT Charged, WHT Withheld | เห็นยอดภาษีของเดือนที่เลือกทันที |
| Opening/carry-forward | VAT/WHT opening balance จาก cutover/go-live | ไม่ตกหล่นยอดยกมาจาก legacy หรือวันเริ่มระบบ |
| Missing tax document control | จำนวนเอกสารภาษีที่ยังไม่ครบ และรายการที่เกิน 60 วัน | ช่วยตามใบกำกับภาษีก่อนเสี่ยงหลุดรอบภาษี |
| VAT trend | กราฟแนวโน้ม VAT ขาย/ซื้อ/Payable 6 เดือน | เห็น pattern ภาษีที่ต้องนำส่งหรือเครดิตสะสม |
| Tax calendar | Due date ของ VAT และ WHT ย้อนหลัง 6 เดือน แยกตาม tab | ใช้เตรียมงานยื่นภาษีรายเดือนโดยไม่ให้ตารางแน่นเกินไป |
| Source drilldown | เปิด Sales Bill, Purchase Bill, Expense จากรายการภาษี | ตรวจสอบตัวเลขกลับไปที่เอกสารต้นทางได้ |
| Excel export | ส่งออก Summary, VAT Output/Input, WHT, Tax Calendar | ส่งต่อให้บัญชีหรือผู้ตรวจสอบภายนอกได้ |
| Cashflow integration | ส่ง VAT/WHT due estimate เข้า forecast calendar | เห็นภาษีเป็นเงินออกในแผนเงินสด |

## Page Responsibilities

- ใช้เป็น accounting/finance report read model จาก operational facts
- แสดง report-specific cutoff/as-of/currency/period
- drilldown ไป source finance/stock/payment/sales/purchase data
- แสดง read model/report ตาม filter ของหน้า
- รองรับ search/filter/date range/sort/export ตาม design baseline
- drilldown ไป source document หรือ source report ที่เกี่ยวข้อง
- แสดง created/document/due/as-of date แยกกันตาม Document Aging Policy

## Non-Responsibilities

- ไม่สร้างหรือแก้ business transaction
- ไม่เขียน stock_ledger หรือ bank_statement
- ไม่เปลี่ยนสถานะเอกสารต้นทาง
- ไม่เป็น source of truth แทนเอกสาร/fact table ต้นทาง

## Lifecycle / Read Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า `/finance-accounting/tax-vat-wht` | ระบบตั้งงวดเริ่มต้นเป็นเดือน/ปีปัจจุบัน และโหลดรายงานจาก `GET /api/finance-accounting/tax-vat-wht` |
| 2 | เลือกเดือน/ปี | ระบบคำนวณ VAT/WHT ใหม่เฉพาะ period ที่เลือก |
| 3 | เลือกสาขา หรือปล่อยเป็นทุกสาขา | ระบบกรอง source facts ตาม active branch reference; ถ้าเลือกสาขา จะไม่ apply opening balance global |
| 4 | เลือก tab `VAT` หรือ `WHT` | ระบบแยกพื้นที่ทำงานตามชนิดภาษี เพื่อไม่ให้ summary/table ของ VAT และ WHT กองอยู่ในหน้าเดียว |
| 5 | ตรวจ VAT tab | ผู้ใช้เห็น VAT Payable, VAT Output/Input, missing document count, aged warning, VAT trend, VAT detail tables และ VAT Calendar |
| 6 | ตรวจ WHT tab | ผู้ใช้เห็น WHT position, WHT Charged, WHT Withheld และ WHT Calendar |
| 7 | ตรวจตารางรายละเอียด | ผู้ใช้ sort/resize ตาราง VAT Output, VAT Input, WHT Charged, WHT Withheld และ Calendar ของ tab นั้นได้ |
| 8 | เปิดเอกสารต้นทาง | ถ้ารายการมี source route แล้ว ผู้ใช้กดเลขเอกสารเพื่อเปิด Sales Bill, Purchase Bill หรือ Expense ได้ |
| 9 | ส่งออก Excel | ระบบเรียก API เดียวกันด้วย `format=xlsx` และสร้าง workbook ตาม filter ปัจจุบัน |

## Screen / UX Sections

| Section | Description |
|---|---|
| Opening balance notice | แสดง VAT/WHT opening balance เมื่อมีข้อมูลใน `opening_balance.data` พร้อมเหตุผลว่า applied หรือไม่ applied |
| Desktop filter panel | เลือกเดือน, ปี, สาขา, ดูช่วง period และกดส่งออก Excel |
| Mobile filter/bottom sheet | เลือกเดือน/ปีที่ toolbar และเปิด bottom sheet เพื่อเลือกสาขา/ส่งออก Excel |
| Line tabs | แยกพื้นที่ทำงานเป็น `VAT` และ `WHT`; tab `VAT` แสดง badge จำนวนเอกสารภาษีไม่ครบเมื่อมีรายการ |
| VAT tab summary | แสดง VAT Payable card, VAT Output/Input donut และ stat cards ของ VAT |
| VAT missing document controls | แสดงจำนวนเอกสารภาษีไม่ครบ และ aged warning เฉพาะใน VAT tab เพราะเกิดจาก VAT Input/Purchase Bill |
| VAT trend panel | แสดง bar trend 6 เดือนของ VAT Output, VAT Input และ VAT Payable |
| VAT detail tables | ตาราง VAT Output และ VAT Input พร้อม sort/resize/reset width และ source drilldown |
| VAT Calendar table | ตาราง VAT due date, VAT Output, VAT Input และ VAT Payable ย้อนหลัง 6 เดือน |
| WHT tab summary | แสดง WHT Position และ stat cards ของ WHT |
| WHT detail tables | ตาราง WHT Charged และ WHT Withheld พร้อม sort/resize/reset width และ source drilldown |
| WHT Calendar table | ตาราง WHT due date, WHT Charged และ WHT Withheld ย้อนหลัง 6 เดือน |

## Source Facts

| Source | Used for | Included when | Source link |
|---|---|---|---|
| `sales_bills` | VAT Output | งวดที่เลือก, ไม่ใช่ cancelled/void/ยกเลิก, มี `vat_amount > 0` | `/sales/bills/{doc_no}` |
| `purchase_bills` | VAT Input + missing VAT invoice control | งวดที่เลือก, ไม่ใช่ cancelled/void/ยกเลิก, มี `vat_amount > 0` | `/purchase/bills/{doc_no}` |
| `expenses` | VAT Input และ WHT Charged จากค่าใช้จ่าย | งวดที่เลือก, ไม่ใช่ cancelled/void/ยกเลิก, มี VAT/WHT amount | `/daily/expense/{doc_no}` |
| `payments` | WHT Charged จากการจ่าย Supplier/Vendor | งวดที่เลือก, ไม่ใช่ cancelled/void/ยกเลิก, มี withholding tax | route detail ยัง deferred |
| `receipts` | WHT Withheld จากลูกค้าหักเรา | งวดที่เลือก, ไม่ใช่ cancelled/void/ยกเลิก, มี withholding tax | route detail ยัง deferred |
| `opening_balance.data` | VAT/WHT carry-forward | เฉพาะ all-branch go-live month หรือแสดงเหตุผลว่าไม่ applied | ไม่มี source document route |

## Calculation Rules

| Metric | Formula / rule |
|---|---|
| VAT Output | ผลรวม `sales_bills.vat_amount` ของงวดที่เลือก |
| VAT Input | ผลรวม VAT จาก `purchase_bills.vat_amount` + `expenses.vat_amount` หรือ `expenses.vat` |
| VAT Payable before opening | `VAT Output - VAT Input` |
| VAT opening adjustment | `vatOutputAccrued - vatInputCredit` เมื่อ opening balance ถูก applied |
| VAT Payable net | `VAT Payable before opening + vatOutputAccrued - vatInputCredit` |
| WHT Charged before opening | WHT จาก `payments.withholding_tax` + expense WHT |
| WHT Charged net | `WHT Charged before opening + whtPayableCarried` |
| WHT Withheld before opening | WHT จาก `receipts.withholding_tax` |
| WHT Withheld net | `WHT Withheld before opening + whtCreditCarried` |
| Missing tax document count | VAT Input rows ที่ไม่มี `vat_invoice_received/vat_invoice_no/tax_invoice_no` |
| Aged missing tax document | Purchase bill มี VAT, ยังไม่มี VAT invoice evidence, และอายุเอกสารมากกว่า 60 วัน |
| VAT due date | วันที่ 15 ของเดือนถัดไป |
| WHT due date | วันที่ 7 ของเดือนถัดไป |

## Opening Balance Behavior

VAT/WHT opening balance ใช้เพื่อไม่ให้ยอดยกมาจาก legacy/cutover หลุดจากรายงานเดือนเริ่มระบบ แต่ต้องกันไม่ให้ยอด global ถูกนับซ้ำเมื่อดูแยกรายสาขา

| Case | Behavior |
|---|---|
| ไม่มี amount ใน `opening_balance.data` | ไม่แสดง opening balance notice |
| มี amount และเลือกทุกสาขาในงวด go-live | apply เข้า summary สุทธิ |
| มี amount แต่เลือกสาขา | ไม่ apply และแจ้งว่า opening balance เป็น global |
| มี amount แต่ไม่ใช่งวด go-live | ไม่ apply และแจ้งว่ายอดยกมาใช้กับงวดเริ่มระบบเท่านั้น |

Fields ที่อ่านจาก `opening_balance.data`:

- `vatInputCredit`
- `vatOutputAccrued`
- `whtCreditCarried`
- `whtPayableCarried`
- `goLiveDate`
- `cutoffDate`
- `locked`

## Export Workbook

`GET /api/finance-accounting/tax-vat-wht?month=MM&year=YYYY&branchId=...&format=xlsx`

| Sheet | Content |
|---|---|
| `Summary` | งวด, สาขา, VAT/WHT ก่อนยอดยกมา, opening adjustment, ยอดสุทธิ, missing document count |
| `VAT Output` | รายการภาษีขายจาก Sales Bills พร้อม source/link |
| `VAT Input` | รายการภาษีซื้อจาก Purchase Bills/Expenses พร้อมสถานะเอกสารและ aged warning |
| `WHT Charged` | รายการ WHT ที่เราหักไว้จาก Payments/Expenses |
| `WHT Withheld` | รายการ WHT ที่ลูกค้าหักจาก Receipts |
| `Tax Calendar` | VAT/WHT due date และยอดย้อนหลัง 6 เดือน |

## Cashflow Integration

หน้า Tax / VAT / WHT เป็น baseline ให้ `buildCashFlowForecastCalendar()` ใช้สร้าง event เงินออกภาษี:

- WHT due event: ใช้ยอด WHT Charged net ของงวดก่อนหน้า และลงวันที่ 7 ของเดือนถัดไป
- VAT due event: ใช้ยอด VAT Payable net ของงวดก่อนหน้า และลงวันที่ 15 ของเดือนถัดไป
- event ถูกเพิ่มเฉพาะเมื่อ due date อยู่ใน forecast horizon และยอดมากกว่า 0
- event ยังเป็น estimate จาก transaction-derived tax baseline ไม่ใช่ filing/payment status จริง

## API / Data Contract

### Current API

- `GET /api/finance-accounting/tax-vat-wht`
- `GET /api/finance-accounting/tax-vat-wht?format=xlsx`

### Data Contract

- API ต้องระบุ source facts ที่ใช้ประกอบตัวเลขของหน้า
- list/report/export ต้องใช้ filter definition เดียวกัน
- source links ต้องใช้ outward document/code ใน UI และ resolve internal id ฝั่ง server
- ถ้าใช้ legacy-derived calculation ต้องบันทึก formula ก่อนแก้ runtime

## Validation / Status Rules

- report ต้องระบุ actual vs forecast/accrual assumption
- ห้ามรวมสกุลเงินหรือหน่วยโดยไม่มี conversion policy
- ตัวเลขต้อง reconcile กับ source facts ที่ระบุ
- filter/export ต้องใช้ condition ชุดเดียวกับตาราง
- ต้องแยกหน่วย/สกุลเงิน/branch/date cutoff เมื่อเกี่ยวข้อง
- cancelled/reversed source ต้องแสดงหรือ exclude ตาม report definition ชัดเจน

## Side Effects

- read-only ไม่มี transaction side effect
- export/print/report generation ไม่ mutate source data

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P2 proof baseline as of 2026-06-11 and was refined for legacy parity gaps on 2026-07-04.
- This page is a read-model/report surface; current APIs are `GET`-oriented and protected by report/finance permissions.
- No transaction, stock ledger, bank statement, AP/AR settlement, or source document status side effect is expected from this page.
- Future changes should reconcile formula/source/cutoff details here before changing runtime behavior.

## Legacy Formula Comparison

Legacy `old-apps/legacy/index.html` and current Next use the same core report model:

- VAT Output: sales bills in the selected period, excluding cancelled rows, using recorded VAT amount.
- VAT Input: purchase bills plus expenses in the selected period, excluding cancelled rows where supported, using recorded VAT amount.
- VAT Payable: VAT Output minus VAT Input.
- WHT Charged: WHT withheld from suppliers/vendors, from payment records and expense records.
- WHT Withheld: WHT withheld by customers, from receipt records.
- Missing tax document count: VAT input rows without tax/VAT invoice evidence.
- Tax Calendar: latest 6 months with VAT due on the 15th of the following month and WHT due on the 7th of the following month.

Current Next improves the implementation boundary by moving the calculation to a permission-protected server API and returning explicit source-state limitations. It also supports branch filtering through the active branch reference layer.

## Implemented Legacy Parity Refinements

- VAT/WHT opening balance fields (`vatInputCredit`, `vatOutputAccrued`, `whtCreditCarried`, `whtPayableCarried`) are read from `opening_balance.data`. Because this setup data is global, the amounts are applied only when the selected report is not branch-filtered and the selected month matches the go-live month. The UI shows the reason when the amounts are present but not applied.
- Cashflow forecast now creates tax due events for the previous month's VAT payable and WHT payable inside the selected forecast horizon. WHT due uses the 7th of the following month; VAT due uses the 15th of the following month.
- Purchase bills with VAT but missing tax invoice evidence are flagged when older than 60 days. The report keeps the total missing count and adds a separate aged-missing warning count/detail.
- Source document drilldown links are returned for sources that already have active detail routes: sales bills, purchase bills, and expenses. Payment/receipt source links remain deferred until their route contract is confirmed.
- Excel export is enabled through `format=xlsx` and uses the same period/branch/filter formula as the on-screen report.

## Current Gap

P2 proof completed against current Next page/API code and legacy core formula parity is verified. The page is now a stronger operational tax baseline, but it is still not a statutory tax ledger: normalized tax ledger, PP30/PND filing state, filing approval, period locking, and GL payable posting remain deferred.

## Implementation Checklist

- [x] Verify current API response shape and source tables
- [x] Verify legacy formula if current implementation is incomplete
- [x] Define drilldown route/source document links
- [x] Confirm export and date cutoff behavior
- [x] Update this file when report formula changes
