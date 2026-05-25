# NS Scrap ERP
## Software Requirements Specification (SRS)

> Version: 1.1  
> Status: Draft for system rehabilitation and refactor planning  
> Project Type: Web-based ERP for scrap metal trading and factory operations
> Canonical Role: Target system requirements. This file replaces the older filename `SRS.md`.

---

## 1. Purpose

เอกสารนี้ใช้เป็น SRS กลางสำหรับการปรับปรุงระบบ NS Scrap ERP เดิมให้ถูกหลักมากขึ้น โดยสรุป:
- ขอบเขตของระบบ
- ผู้ใช้งานและสิทธิ์
- ความต้องการเชิงฟังก์ชัน
- ความต้องการเชิงไม่ใช่ฟังก์ชัน
- ข้อกำหนดด้านข้อมูล
- Tech stack เป้าหมายสำหรับการ refactor และยกระดับระบบเดิม

เอกสารนี้ตั้งใจใช้เป็นฐานสำหรับ:
- คุย scope กับลูกค้า
- แยก phase การพัฒนา
- ออกแบบสถาปัตยกรรมเป้าหมายที่ถูกหลักกว่าเดิม
- ประเมิน effort และ risk

---

## 2. System Overview

NS Scrap ERP เป็นระบบ ERP สำหรับธุรกิจรับซื้อ-ขายเศษโลหะและการผลิตที่เกี่ยวข้อง รองรับงานตั้งแต่:
- รับซื้อวัตถุดิบ
- ขายสินค้า
- สต๊อกและคลัง
- การผลิต
- ลูกหนี้/เจ้าหนี้
- การเงินและค่าใช้จ่าย
- รายงานผู้บริหาร
- การควบคุมสิทธิ์ผู้ใช้งาน

ระบบรองรับหลายสาขา และมีลักษณะธุรกิจเฉพาะทาง เช่น:
- Dual Costing
- Trading Matching
- Grade Adjustment
- Status Convert
- Pending Sale
- Production Yield / Loss

จากการ audit โค้ดและฐานข้อมูลปัจจุบัน พบว่า:
- frontend ปัจจุบันเป็น single-file Vue app
- ฐานข้อมูลปัจจุบันมีข้อมูลจริงอยู่แล้ว และถูกใช้เป็น source ของธุรกรรมหลัก
- แนวทางที่เหมาะที่สุดไม่ใช่การทิ้งของเดิมทั้งหมด แต่คือการ `refactor ระบบเดิม` ให้เป็น `modular + relational-first`
- DB เดิมควรถูกใช้เป็น `baseline + migration source` ไม่ใช่ target architecture ตรง ๆ

---

## 3. Business Goals

- รักษา business flow เดิมที่ผู้ใช้งานคุ้นเคยให้มากที่สุด
- ปรับ code และ database ของระบบเดิมให้ถูกหลักและดูแลง่ายขึ้น
- รองรับการทำงานประจำวันของธุรกิจ scrap metal แบบ end-to-end
- ลดการทำงานซ้ำและการคำนวณด้วยมือ
- ทำให้ข้อมูลซื้อ ขาย สต๊อก และการเงินเชื่อมถึงกัน
- ควบคุมสิทธิ์และการมองเห็นข้อมูลตาม role
- ทำให้ข้อมูลพร้อมสำหรับการวิเคราะห์และการตัดสินใจของผู้บริหาร

---

## 4. Users and Roles

ระบบต้องรองรับอย่างน้อย role ต่อไปนี้:

- `Admin`
- `Owner`
- `Accountant`
- `Account Expense`
- `Coordinator`
- `Warehouse`
- `Cashier`
- `Purchaser`
- `Sales`
- `Special Role`
- `Read-only User`

แต่ละ role ต้องรองรับ:
- การกำหนดเมนูที่เข้าถึงได้
- การกำหนด action เช่น `view`, `create`, `edit`, `post`, `export`, `delete`
- การปิดข้อมูล sensitive เช่น cost, profit, cash, financial statements
- การจำกัดตามสาขา

---

## 5. Functional Scope

### 5.1 Core Administration

- Login ด้วย username/email และ password
- Logout
- จัดการผู้ใช้งาน
- จัดการ roles และ permissions
- เปลี่ยนรหัสผ่าน
- ข้อมูลบริษัท
- Audit log
- User activity log

### 5.2 Master Data

ระบบต้องมีหน้าจอจัดการข้อมูลหลักอย่างน้อย:
- Customers
- Suppliers
- Products
- Impurity types / รายการสิ่งเจือปน
- Salespersons
- Branches
- Warehouses
- Accounts
- Purchase channels
- Sales channels
- Expense categories
- Directors / Employees
- Machines
- Production lines
- Currencies
- Beneficiaries
- Payment methods
- Remittance purposes

### 5.3 Purchase Management

- รองรับ purchase flow 4 แบบ: `Stock + PO`, `Stock + Spot Buy / No PO`, `Trading + PO`, และ `Trading + Spot`
- ระบบต้องแยก 2 มิติของบิลซื้อให้ชัดเจน: `Stock/Trading` เป็นมิติผลต่อ stock ส่วน `PO/Spot Buy` เป็นมิติแหล่งซื้อ/การอ้าง PO
- `Spot Buy` หมายถึงซื้อโดยไม่มี PO ให้ตัด ไม่ได้หมายความว่าสินค้าต้องเข้า stock เสมอไป; ดังนั้น `Trading + Spot` คือ Trading ที่ไม่อ้าง PO และไม่เข้า stock
- `PO` หมายถึงบิลหรือรายการนั้นอ้าง PO Buy และต้องตัดยอด PO; ดังนั้น `Trading + PO` ไม่เข้า stock แต่ต้องตัด PO ตามจำนวน/น้ำหนักในบิลรับซื้อ
- แหล่งซื้อ `PO`/`Spot Buy` ต้องเลือกได้ระดับรายการสินค้าในบิลรับซื้อ และ header source ต้อง derive เป็น `SPOT_BUY`, `PO_RECEIPT`, หรือ `MIXED` ตามรายการจริง
- ระบบ target ไม่ใช้เลข `WT` เดี่ยว; เอกสารชั่งน้ำหนักต้องแยกทิศทางด้วย prefix ตั้งแต่เลขเอกสาร
- ซื้อเข้า stock ต้องออก `ใบรับของ / Weight Ticket In` โดยใช้เลขเอกสาร `WTI{branchCode}{YYMM}-NNNN`; ใบรับของเป็นแหล่งน้ำหนักก่อนออกบิลรับซื้อ
- ฝั่งส่งของต้องออก `ใบส่งของ / Weight Ticket Out` โดยใช้เลขเอกสาร `WTO{branchCode}{YYMM}-NNNN`; ใบส่งของเป็นแหล่งน้ำหนัก/หลักฐานส่งของใน flow ขาย/ส่งสินค้า
- หน้าออกเอกสารรับ/ส่งของใช้ชื่อเมนู `ชั่งสินค้า / รับ-ส่งของ`; หน้ารายการใช้ชื่อ `รายการใบรับ-ส่งของ` และต้องรวมทั้ง WTI/WTO เพื่อค้นหา กรอง เปิดดูรายละเอียด และเลือกเอกสารไปออกบิล
- ใบรับของต้อง auto วันที่เอกสาร เวลาสร้าง และผู้กรอก; ผู้ใช้กรอก/ยืนยันทะเบียนรถ เลือกสาขา เลือกสินค้า กรอกน้ำหนัก เลือกวิธีหักสิ่งเจือปน (`ไม่หัก`, `หัก`, `หัก%`), เลือกสิ่งเจือปนจาก master data เมื่อมีการหัก, และเพิ่มรูปภาพหลักฐานก่อนออกใบรับของ
- Stock purchase ต้องออกบิลรับซื้อจากใบรับของ และสร้าง stock movement เฉพาะเมื่อบิลเป็นประเภท Stock
- บิลรับซื้อ Stock ต้องให้ office เลือกสาขาและผู้ขายก่อน แล้วเลือกใบรับของ; ระบบแสดงสินค้า/น้ำหนักจากใบรับของ และให้ allocate น้ำหนักไปตัด PO หรือ `Spot Buy` รายบรรทัด
- ถ้าใบรับของมียอดเกิน PO ที่เลือก ผู้ใช้ต้องเพิ่มบรรทัดจากใบรับของเดิมและเลือก `Spot Buy` หรือ PO อื่นเพื่อให้ยอดในบิลครบตามใบรับของ
- รายการสินค้าในบิลรับซื้อต้องมี field `ราคาหน้าใบ` ระดับ line item เพื่อใช้คำนวณ commission ของ sale ใน Sale Tracking
- บิลรับซื้อต้องมีส่วนลดได้เฉพาะ `ส่วนลดท้ายใบ`; ไม่มีส่วนลดรายสินค้า และส่วนลดท้ายใบต้องบันทึกเป็นค่าใช้จ่าย/รายการแยกโดยไม่กระทบต้นทุนสินค้า
- Stock Spot Buy / No PO ต้องมีใบรับของแต่ไม่ตัด PO
- Trading purchase ไม่เข้า stock, ไม่ใช้ใบรับของเป็นแหล่งน้ำหนักหลัก, และต้องกรอกสินค้า จำนวน/น้ำหนักในหน้าบิลรับซื้อ
- Trading + PO ต้องตัด PO จากรายการในบิลรับซื้อ; Trading + Spot ไม่ตัด PO
- PO Buy กับใบรับของต้องรองรับ many-to-many allocation ระดับรายการสินค้า/น้ำหนักผ่านบิลรับซื้อ Stock
- PO Buy ต้องมี action `ปิดรับไม่ครบ` สำหรับกรณี Supplier ส่งของไม่ครบและไม่รอรับต่อ โดยต้องบันทึกเหตุผล หยุดรับยอดคงเหลือ และไม่กระทบเอกสาร/stock ที่รับจริงแล้ว
- Cost Pool ใน purchase flow ใช้เฉพาะสินค้ากลุ่มทองแดง/ทองเหลือง (`ทองแดง`, `ทองเหลือง`, `copper`, `brass`) ไม่ใช่ทุกสินค้าที่ซื้อเข้า stock
- เมื่อปิด PO แบบส่งของไม่ครบ ต้องตัดยอดคงเหลือที่ยังไม่ได้รับออกจาก Cost Pool candidate เฉพาะสินค้า eligible
- สร้างและแก้ไขบิลรับซื้อ
- เก็บ line items พร้อม weight และราคา
- ผูก supplier, branch, warehouse, channel
- รองรับ receipt voucher
- รองรับเปลี่ยน supplier ย้อนหลังพร้อมเก็บ history
- สร้าง stock movement อัตโนมัติเมื่อ post เอกสารเฉพาะบิลรับซื้อประเภท Stock

### 5.4 Sales Management

- สร้างและแก้ไขบิลขาย
- เก็บ line items พร้อม weight และราคา
- รองรับ `ใบส่งของ / Weight Ticket Out` เลขเอกสาร `WTO{branchCode}{YYMM}-NNNN` สำหรับยืนยันการส่งของ/น้ำหนักขาออก แยกจากบิลขายและไม่ใช้เลข `WT` เดี่ยว
- ใบส่งของ WTO ต้องแสดงรวมใน `รายการใบรับ-ส่งของ` โดยแยกประเภทจากใบรับของ WTI ชัดเจน
- บิลขาย Trading ต้องเลือกบิลรับซื้อก่อนรายการสินค้า และต้องเลือกบิลรับซื้อได้หลายใบในบิลขายเดียว
- เมื่อเลือกบิลรับซื้อ Trading แล้ว ระบบต้องเติมรายการสินค้าที่จะขายจากบิลรับซื้อ และบันทึก allocation กลับบิลรับซื้อเพื่อใช้ Trading Matching / Deal Margin / กันขายซ้ำ
- บิลขาย Trading ต้องให้ผู้ใช้เพิ่มรายการสินค้าเองจาก stock ได้ โดยรายการที่เพิ่มเองต้องตัด stock เฉพาะ line นั้น ไม่กระทบ line ที่มาจากบิลรับซื้อ Trading
- บิลขายต้องตัด PO Sale/PO Sell ได้ระดับรายการสินค้า ทั้งรายการที่มาจากบิลรับซื้อ Trading และรายการที่เพิ่มจาก stock
- รองรับต้นทุนแบบ FIFO
- แสดงกำไรต่อบรรทัด/ต่อบิลตามสิทธิ์ผู้ใช้
- รองรับ pending sale / stock issue
- รองรับ sales plan และการอ้างอิงราคา LME

### 5.5 Payments and Receipts

- จ่ายเงิน supplier แบบ partial/full
- รับเงิน customer แบบ partial/full
- บันทึก transfer ระหว่างบัญชี
- รองรับ WHT, VAT และ reference document
- รองรับ approval flow สำหรับการจ่ายเงิน

### 5.6 Expense Management

- บันทึกค่าใช้จ่าย
- รองรับหมวดค่าใช้จ่าย
- รองรับ VAT และ WHT
- รองรับ petty advance / director loan / return / allocation
- มี dashboard ค่าใช้จ่าย

### 5.7 Inventory and Stock

- Stock balance
- Stock ledger
- Stock transfer
- Stock adjustment
- Customer return
- Grade adjustment
- Status convert (RM / WIP / FG)
- รองรับ lot และ warehouse movement

### 5.8 Production

- Production order
- Production input/output
- Process cost
- WIP report
- Yield / Loss report
- Production cost report
- Machine utilization
- Reverse production transaction

### 5.9 Dual Costing and Trading

- PO Buy
- Trading purchase bill ที่ไม่เข้า stock และใช้สำหรับจับคู่ Trading
- Trading sales bill ต้องเลือกบิลรับซื้อหลายใบได้, เติมรายการขายจากบิลรับซื้อ, เพิ่ม stock line เองได้, และ allocate ไป PO Sell ได้ระดับรายการ
- Cost Pool สำหรับสินค้า eligible กลุ่มทองแดง/ทองเหลืองเท่านั้น
- ปิด PO Buy แบบส่งของไม่ครบต้อง release/remove remaining PO quantity ออกจาก Cost Pool candidate
- PO Sell
- Cost pool
- Cost allocator
- Match log
- Deal margin report
- Compare deal vs stock
- Trading dashboard
- Trading matching
- PO outstanding

### 5.10 Finance and Accounting

- AR
- AP
- Cash / Bank statement
- Cash position
- Supplier advance
- Customer advance
- Tax / VAT / WHT reports
- Profit & Loss
- Balance Sheet
- Cash Flow Statement
- Financial dashboard

### 5.11 International Finance

- FX rate management
- FCD ledger
- Overseas transfer
- Overseas receipt
- FX gain/loss report
- Bank reconciliation

### 5.12 Management Reporting

- Owner daily dashboard
- Daily report
- Dashboard รวม
- Profit & cost analysis
- Tracking by customer
- Tracking by supplier
- Tracking by product
- Business calendar
- Cash flow calendar
- Anomaly detector

### 5.13 Data Utilities

- Import master data
- Import transactions
- Export data
- Backup / restore

---

## 6. Non-Functional Requirements

### 6.1 Security

- ใช้ authentication และ authorization ที่แยกชัดเจน
- ข้อมูล sensitive ต้องเห็นได้เฉพาะ role ที่ได้รับอนุญาต
- ทุก transaction สำคัญต้องมี audit trail

### 6.2 Performance

- หน้าจอ transaction หลักต้องตอบสนองได้รวดเร็วในระดับใช้งานประจำวัน
- ตารางข้อมูลขนาดใหญ่ต้องรองรับ filtering, paging หรือ virtualization ตามความเหมาะสม

### 6.3 Reliability

- การ post เอกสารต้องคงความถูกต้องของข้อมูลซื้อ ขาย สต๊อก และการเงิน
- ระบบต้องป้องกัน inconsistent transaction ให้ได้มากที่สุด

### 6.4 Usability

- รองรับ desktop เป็นหลัก
- รองรับ tablet/mobile ในระดับใช้งานพื้นฐาน
- UI ต้องรักษา flow เดิมของธุรกิจให้มากที่สุดถ้าลูกค้าต้องการ

### 6.5 Maintainability

- แยก view, state, business logic, data access ออกจากกัน
- รองรับ unit test และ end-to-end test
- รองรับการขยายโมดูลเพิ่มในอนาคต

---

## 7. Data and Integration Requirements

ระบบต้องรองรับ:
- relational database สำหรับข้อมูลธุรกรรมหลัก
- object storage สำหรับไฟล์แนบหรือไฟล์ export/import ในอนาคต
- import/export ผ่าน Excel หรือ CSV
- การเชื่อมต่อ API ภายนอกในอนาคต เช่น pricing, banking, notifications

ข้อกำหนดสำคัญ:
- master data ต้องไม่ฝังอยู่ใน source code
- business config ต้องแยกจาก UI code
- counters, opening balance, role mapping และ company setup ต้องเก็บใน database

### 7.1 Current Database Assessment

จากการดึงข้อมูลจริงของระบบเดิม:
- มีตารางใน `public` schema ประมาณ `47` ตาราง
- มีข้อมูลธุรกรรมหลักอยู่จริง เช่น `suppliers`, `purchase_bills`, `stock_ledger`, `payments`, `po_buys`, `sales_bills`
- มีข้อมูล auth, storage, realtime ของ Supabase ปะปนอยู่ใน dump เดียวกัน

ข้อสังเกตสำคัญ:
- ตารางธุรกรรมหลายตัวเก็บ `line items` เป็น `jsonb` ในตาราง header เช่น purchase, sales, PO และ payment
- user model ซ้ำกันหลายชั้น เช่น `auth.users`, `public.users`, `user_profiles`
- permission model กระจายอยู่ทั้ง `roles` และ `roles_config`
- inventory ledger ถูกใช้เป็นตารางอเนกประสงค์ มีหลาย field แบบ generic เช่น `ref_type`, `ref_id`, flags และ note fields
- opening balance และ config บางส่วนยังเป็น `jsonb` หรือ singleton record
- มี metadata เพื่อ sync/delete เดิม เช่น `deletion_log`, `deletion_tombstones` ซึ่งควรประเมินใหม่ตาม architecture ใหม่

ผลสรุป:
- ฐานข้อมูลเดิม `มีคุณค่าในเชิงข้อมูลจริง`
- แต่ `ไม่ควรใช้เป็นแบบจำลองสุดท้ายของระบบที่ปรับปรุงแล้ว`
- ควรใช้เป็นฐานสำหรับ `migration`, `mapping`, และ `business discovery`

### 7.2 Database Redesign Principles

ระบบที่ปรับปรุงแล้วควรยึดหลักดังนี้:
- ใช้ `header` และ `line tables` แยกกันอย่างชัดเจน
- ใช้ foreign key จริงแทนการอ้างอิงแบบ generic ให้มากที่สุด
- แยก `master data`, `transaction`, `ledger`, `config`, `security` ออกจากกัน
- ใช้ `uuid` หรือ key ที่สม่ำเสมอเป็น primary key และใช้ `doc_no` เป็น business key
- หลีกเลี่ยงการเก็บ business-critical structures ไว้ใน `jsonb` ถ้าข้อมูลนั้นต้อง query, validate, report, reconcile หรือ trace ย้อนหลัง
- ledger สำคัญควรเป็น `append-only` หรืออย่างน้อยต้อง trace การเปลี่ยนแปลงได้ชัด
- auth model ต้องเหลือ source of truth เดียว
- report / aggregate / dashboard data ควรเป็น derived layer ไม่ใช่ source transaction layer

### 7.3 Recommended Target Data Domains

แนะนำให้ปรับ schema ของระบบเดิมโดยแยกเป็นโดเมนดังนี้:

1. `Security and Access`
- `auth.users` จาก Supabase
- `app_users`
- `roles`
- `permissions`
- `role_permissions`
- `user_roles`
- `user_branch_access`

2. `Organization and Master Data`
- `companies`
- `branches`
- `warehouses`
- `customers`
- `suppliers`
- `products`
- `product_grades`
- `currencies`
- `cash_bank_accounts`
- `purchase_channels`
- `sales_channels`
- `expense_categories`

3. `Procurement`
- `weight_tickets` สำหรับ `WTI...` / `WTO...` โดย `WTI` คือใบรับของขาเข้า และ `WTO` คือใบส่งของขาออก
- `weight_ticket_lines`
- `weight_ticket_images`
- `purchase_bills`
- `purchase_bill_lines`
- `purchase_bill_receipt_allocations`
- `purchase_bill_po_allocations`
- `supplier_payments`
- `supplier_payment_allocations`
- `purchase_orders`
- `purchase_order_lines`

4. `Sales`
- `sales_bills`
- `sales_bill_lines`
- `sales_bill_purchase_allocations`
- `sales_bill_stock_allocations`
- `sales_bill_po_allocations`
- `customer_receipts`
- `customer_receipt_allocations`
- `sales_orders`
- `sales_order_lines`

5. `Inventory`
- `inventory_transactions`
- `inventory_transaction_lines`
- `inventory_lots` หรือ `inventory_batches`
- `stock_reservations`
- `inventory_adjustments`

6. `Production`
- `production_orders`
- `production_inputs`
- `production_outputs`
- `production_yield_logs`

7. `Finance`
- `cash_bank_transactions`
- `journal_entries`
- `journal_entry_lines`
- `bank_reconciliation_items`
- `opening_balance_entries`

8. `Advanced Business`
- `trade_matches`
- `cost_pools`
- `cost_allocations`
- `fx_transactions`
- `overseas_transfers`

### 7.4 Keep / Refactor / Rebuild Guidance

`Keep with cleanup`
- branches
- warehouses
- currencies
- customers
- suppliers
- products
- accounts
- expense categories
- channels

`Refactor heavily`
- purchase bills
- sales bills
- payments
- receipts
- bank statement
- stock ledger
- PO buy / PO sell
- production tables

`Rebuild or replace`
- public users table
- role / permission structure
- opening balance structure
- sync/deletion metadata model
- document counters and business config structure

### 7.5 Migration Strategy

ลำดับ migration ที่แนะนำ:
1. Freeze schema และ dump ปัจจุบันไว้เป็น baseline
2. ออกแบบ target schema จาก business flow เดิมที่ยืนยันแล้ว
3. ย้าย master data ก่อน
4. ย้าย user/role/access model
5. ย้าย transaction หลัก: purchase, sales, payments, receipts
6. ย้าย inventory ledger และ reconcile ตัวเลข
7. ค่อยย้าย advanced modules เช่น production, trading, dual costing

ข้อกำหนดสำคัญ:
- ห้าม migrate โดยยก JSON structures เดิมไปทั้งก้อนถ้าเลี่ยงได้
- ต้องมี reconciliation step ระหว่างข้อมูลเดิมกับโครงสร้างใหม่
- ต้องกำหนด source of truth ของ cost, stock, AR/AP, และ cash ให้ชัดก่อนย้ายข้อมูล

---

## 8. Recommended Tech Stack

### 8.1 Frontend

- `Vue 3`
- `Vite`
- `TypeScript`
- `Vue Router`
- `Pinia`
- `TanStack Query for Vue`
- `Tailwind CSS`
- `Zod`
- `VueUse`

เหตุผล:
- รักษา ecosystem เดิมของระบบได้
- ลดความเสี่ยงจากการ rewrite ข้าม framework
- แยกจาก single-file app เดิมไปเป็น component-based structure ได้ตรงที่สุด

### 8.2 Data and Auth

- `Supabase Auth`
- `Supabase Postgres`
- `Supabase Storage` สำหรับไฟล์ในอนาคต

หมายเหตุเชิงสถาปัตยกรรม:
- ใช้ Supabase ต่อได้
- แต่ควรปรับตาราง application ให้ถูกหลักกว่าเดิม ไม่ยึด schema เดิมตรง ๆ
- ใน phase แรกยังไม่จำเป็นต้องเพิ่ม ORM หรือ backend framework ถ้ายังโฟกัสที่การ stabilize business model และ data model

### 8.3 Local/Offline Support

- `IndexedDB`
- `Dexie` เป็น wrapper ถ้าต้องรักษา local-first/offline capability

หมายเหตุ:
- offline-first ยังเป็นหัวข้อที่ต้องตัดสินใจเชิงสถาปัตยกรรมอีกครั้ง
- ถ้าไม่ต้องการ offline เต็มรูปแบบ อาจลด complexity ลงได้มาก

### 8.4 Testing

- `Vitest` สำหรับ unit/integration tests
- `Playwright` สำหรับ end-to-end tests

### 8.5 Optional Server-side Extension

หากในอนาคตต้องแยก logic ที่ sensitive ออกจาก frontend:
- `Supabase Edge Functions`
- หรือ API layer แยกต่างหากใน phase ถัดไป

---

## 9. Proposed System Architecture

```text
Frontend (Vue 3 + Vite)
  ├─ Router
  ├─ Pinia (client/app state)
  ├─ TanStack Query (server state)
  ├─ Zod validation
  ├─ IndexedDB/Dexie (optional local cache/offline)
  └─ Supabase client
        ├─ Auth
        ├─ Postgres
        └─ Storage
```

การแยกหน้าที่:
- `Pinia` ใช้เก็บ state ฝั่ง UI และ app context
- `TanStack Query` ใช้จัดการ fetch/cache/invalidate ข้อมูลจาก backend
- `Supabase` เป็น source of truth ของข้อมูล

ข้อเสนอเชิงโครงสร้าง:
- frontend ที่ refactor แล้วไม่ควรคุยกับ table เดิมแบบตรง ๆ ทุกตารางโดยไม่มี service layer
- business logic ต้องแยกจาก UI และแยกจาก persistence detail
- ในระยะแรกอาจใช้ `services/queries` ฝั่ง frontend จัดระเบียบก่อน
- เมื่อ business rule เริ่มนิ่ง ค่อยพิจารณาเพิ่ม API/Edge Function สำหรับ flow ที่ sensitive หรือซับซ้อน

---

## 10. Development Phasing

หลักของการพัฒนาคือ:
- ใช้ระบบเดิมเป็นฐาน
- ไม่ rewrite ทุกอย่างพร้อมกัน
- refactor ตาม module และตามความเสี่ยงของ business logic
- prioritize ความถูกต้องของข้อมูลก่อนความสวยของสถาปัตยกรรม

### Phase 1: Foundation

- Authentication
- Users / Roles / Permissions
- Company setup
- Master data
- Basic audit
- Target schema design
- Data migration planning

### Phase 2: Core Transaction

- Purchase
- Sales
- Stock ledger / stock balance
- Payments / Receipts / Transfers
- AR / AP
- Header/line transaction redesign
- Initial data migration and reconciliation

### Phase 3: Operational Control

- Expenses
- Petty advance
- Import / export
- Backup / restore
- Approval flows
- Basic dashboards

### Phase 4: Advanced Business

- Production
- Dual costing
- Trading matching
- International finance
- Bank reconciliation

### Phase 5: Management and Analytics

- Financial dashboards
- Tracking 360
- Anomaly detection
- Forecasting and advanced reports

---

## 11. Risks and Open Decisions

หัวข้อที่ต้องตัดสินใจให้ชัดก่อนพัฒนาระยะถัดไป:
- จะคง offline-first เต็มรูปแบบหรือไม่
- จะใช้ Supabase ตรงจาก frontend ทั้งหมด หรือจะมี API layer ในอนาคต
- Dual costing จะคง logic เดิมทั้งหมดหรือปรับ business process
- Production costing จะใช้ model เดิมหรือ refactor เป็น model ใหม่บางส่วน
- ระดับของบัญชีและรายงานการเงินที่ต้องการใน phase แรก
- จะใช้ stock ledger เดิมเป็น migration source แบบไหน และจะ derive FIFO/cost จาก transaction layer หรือ ledger layer
- จะคง `public.users` เดิมเพื่อ compatibility ชั่วคราว หรือ migrate ไป `auth.users + app_users` เต็มรูปแบบทันที
- จะเก็บ opening balance เป็น summarized JSON ต่อหรือแตกเป็น normalized entries
- จะ replace payment/receipt allocation model ตั้งแต่แรกหรือทำ compatibility layer ชั่วคราว

---

## 12. Deliverable Expectation

ผลลัพธ์ของการปรับปรุงระบบเดิมควรมีอย่างน้อย:
- โค้ดแยกเป็นโมดูลและดูแลง่าย
- master data และ config อยู่ใน database
- transaction หลักใช้งานได้จริง
- สิทธิ์ผู้ใช้ถูกต้อง
- ตัวเลขซื้อ ขาย สต๊อก และการเงิน trace ย้อนกลับได้
- พร้อมต่อยอด API/integration ในอนาคต
- มี target schema ที่ชัดเจนและไม่พึ่งโครง JSON เดิมใน transaction หลัก
- มี data migration plan ที่ตรวจสอบย้อนกลับได้
