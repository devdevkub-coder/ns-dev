# NS Scrap ERP
## Software Requirements Specification (SRS)

> Version: 1.0  
> Status: Draft for redevelopment planning  
> Project Type: Web-based ERP for scrap metal trading and factory operations

---

## 1. Purpose

เอกสารนี้ใช้เป็น SRS กลางสำหรับการปรับปรุงและพัฒนาระบบ NS Scrap ERP ใหม่ โดยสรุป:
- ขอบเขตของระบบ
- ผู้ใช้งานและสิทธิ์
- ความต้องการเชิงฟังก์ชัน
- ความต้องการเชิงไม่ใช่ฟังก์ชัน
- ข้อกำหนดด้านข้อมูล
- Tech stack เป้าหมายสำหรับการพัฒนารอบใหม่

เอกสารนี้ตั้งใจใช้เป็นฐานสำหรับ:
- คุย scope กับลูกค้า
- แยก phase การพัฒนา
- ออกแบบสถาปัตยกรรมใหม่
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

---

## 3. Business Goals

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

- สร้างและแก้ไขบิลรับซื้อ
- เก็บ line items พร้อม weight และราคา
- ผูก supplier, branch, warehouse, channel
- รองรับ receipt voucher
- รองรับเปลี่ยน supplier ย้อนหลังพร้อมเก็บ history
- สร้าง stock movement อัตโนมัติเมื่อ post เอกสาร

### 5.4 Sales Management

- สร้างและแก้ไขบิลขาย
- เก็บ line items พร้อม weight และราคา
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

---

## 10. Development Phasing

### Phase 1: Foundation

- Authentication
- Users / Roles / Permissions
- Company setup
- Master data
- Basic audit

### Phase 2: Core Transaction

- Purchase
- Sales
- Stock ledger / stock balance
- Payments / Receipts / Transfers
- AR / AP

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
- Production costing จะใช้ model เดิมหรือ redesign ใหม่
- ระดับของบัญชีและรายงานการเงินที่ต้องการใน phase แรก

---

## 12. Deliverable Expectation

ผลลัพธ์ของระบบรอบใหม่ควรมีอย่างน้อย:
- โค้ดแยกเป็นโมดูลและดูแลง่าย
- master data และ config อยู่ใน database
- transaction หลักใช้งานได้จริง
- สิทธิ์ผู้ใช้ถูกต้อง
- ตัวเลขซื้อ ขาย สต๊อก และการเงิน trace ย้อนกลับได้
- พร้อมต่อยอด API/integration ในอนาคต

