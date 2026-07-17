# Notes Index

ไฟล์นี้เป็น entrypoint กลางของ `docs/notes/`

หน้าที่ของไฟล์นี้คือ:

1. ชี้ว่าหมวดธุรกิจหรือหมวดเทคนิคควรไปอ่าน note ไหนก่อน
2. แยก note หลักออกจาก note สรุปรายวันหรือ note ประวัติ

ไฟล์นี้ไม่พยายาม list ทุกไฟล์แบบละเอียดเท่ากันทั้งหมด

## Start Here

ถ้าหา business flow หรือ page flow ให้เริ่มจาก:

1. [Menu Page Flow Catalog.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/notes/Menu%20Page%20Flow%20Catalog.md)
2. [page-flows/README.md](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/docs/notes/page-flows/README.md)
3. note หมวดธุรกิจที่เกี่ยวข้องโดยตรง

ถ้าเปิดผ่าน Obsidian และต้องการหน้า home เดิมของ vault ให้ดู `_Index.md`

## Canonical Notes By Area

| Area | Open this first | Purpose |
|---|---|---|
| Purchase | `Purchase Flow.md` | canonical purchase flow |
| WTI / WTO | `WTI-WTO Flow.md` | canonical receiving / shipping flow |
| Sales | `Sales Flow.md` | canonical sales flow |
| Payment | `Payment Flow.md` | approval / payment lifecycle |
| Finance & Debt | `Finance Debt Flow.md` | AR/AP/bank/cash/petty advance category baseline |
| Finance / Accounting | `Finance Accounting Flow.md` | accounting/reporting/GL-side menu baseline |
| Trading | `Trading Flow.md` | trading and PO reports baseline |
| Production | `Production Flow.md` | production baseline |
| Stock | `Stock Ledger and Stock Balance.md` | stock movement vs derived balance baseline |
| Main dashboards | `Main Dashboard Reports Flow.md` | reporting/dashboard baseline |
| Tracking 360 | `Tracking 360 Flow.md` | customer/supplier/product tracking baseline |
| Dual Costing | `Dual Costing Flow.md` | dual costing category baseline |
| Shared document history rules | `Document Timeline Policy.md` | history/timeline contract |
| Shared reporting rules | `Reporting History Snapshot Policy.md` | history snapshot contract |

## High-Value Supporting Notes

| Topic | Note |
|---|---|
| Purchase bill details | `Purchase Bills Page Flow.md` |
| Sales bill details | `Sales Bills Page Flow.md` |
| PO Buy | `PO Buy Page Flow.md` |
| PO Sell | `PO Sell Flow.md` |
| Petty advance | `Petty Advance Page Flow.md` |
| Receipt voucher | `Receipt Voucher Page Flow.md` |
| Customer advance receipt | `Customer Advance Receipt Flow.md` |
| FCD customer receipt / FX | `Receive Payment From The Customer Via Their FCD Account.md` |
| Stock ledger DB/API | `Stock Ledger DB API Design.md` |
| Reference cache | `Reference Master Cache Flow.md` |
| Printable docs | `Printable Documents.md` |

## Note Groups

### Category and page-flow notes

- canonical business/category notes เช่น `Purchase Flow.md`, `Sales Flow.md`, `Production Flow.md`
- page-level notes เช่น `Purchase Bills Page Flow.md`, `Finance AP Page Flow.md`
- detailed route notes ใต้ `page-flows/`

### Design and implementation notes

- contract/design notes เช่น `Stock Ledger DB API Design.md`
- shared behavior notes เช่น `Document Timeline Policy.md`
- implementation direction notes เช่น `Reference Master Cache Flow.md`

### Historical and checkpoint notes

- dated work summaries เช่น `2026-06-11-work-summary.md`
- temporary diagnosis/plan notes

ไฟล์กลุ่มนี้ไม่ควรถูกใช้เป็น start-here ก่อน canonical note เว้นแต่กำลังตามรอยงานเก่า

## Placement Rule

- note ธุรกิจใหม่ให้เก็บใน `docs/notes/`
- note ราย route ให้เก็บใน `docs/notes/page-flows/`
- note สรุปงาน/ประวัติ ให้ใช้ชื่อที่อ่านออกว่าเป็น dated summary หรือ checkpoint
- ห้ามวาง business note ใหม่ลอยไว้ใน `docs/` root
