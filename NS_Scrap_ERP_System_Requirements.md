# NS Scrap ERP — ระบบบริหารโรงงานรับซื้อ-ขายเศษโลหะ
## เอกสารสรุประบบ (System Requirements)

> **Version:** 1.0 Prototype  
> **Tech Stack:** Vue 3 SPA (Single Page Application), Supabase (Backend + Auth), localStorage + IndexedDB (Offline-first), Tailwind CSS, Chart.js, SheetJS (XLSX Export)  
> **Deployment:** Single HTML file (`index.html` ~3.3MB) + `export-button.js` (25KB) — เปิดด้วย browser ได้ทันที

---

## 1. ภาพรวมระบบ

**NS Scrap ERP** เป็นระบบ ERP แบบครบวงจร สำหรับธุรกิจรับซื้อ-ขายเศษโลหะ (Scrap Metal) รองรับโลหะ 11 กลุ่ม: อลูมิเนียม, ทองแดง, ทองเหลือง, เหล็ก, สแตนเลส, ตะกั่ว, แบตเตอรี่, พลาสติก, ขวดแก้ว, ขวด PET, กระดาษ

**คุณสมบัติเด่น:**
- Offline-first — ทำงานได้แม้ไม่มีเน็ต, sync กลับ Supabase เมื่อเชื่อมต่อ
- Multi-branch — 3 สาขา (สำนักงานใหญ่, สมุทรสาคร, นครสวรรค์)
- Role-based Access Control — 10+ roles, แต่ละ role กำหนดสิทธิ์ view/create/edit/delete/export
- Dual Costing (PO Buy/Sell) — จองต้นทุน-จองขายล่วงหน้า ก่อนของเข้า stock จริง
- การผลิต (Production) — ติดตาม WIP, Yield, Machine Utilization
- การเงินระหว่างประเทศ — FCD, FX Rate, โอนเงินต่างประเทศ, Bank Reconciliation

---

## 2. Authentication & User Management

### 2.1 ระบบ Login
- Login ด้วย Username/Email + Password
- รองรับ 2 โหมด:
  - **Supabase Auth** — ถ้าเชื่อมต่อ Supabase → ตรวจสอบผ่าน `supabase.auth.signInWithPassword()`
  - **Local Fallback** — ถ้า offline → ตรวจสอบกับ `db.users` ใน localStorage

### 2.2 Roles & Permissions
| Role | สิทธิ์ |
|------|-------|
| **Admin** | ทุกเมนู, ทุก action |
| **Owner** | ทุกเมนู, ทุก action |
| **บัญชี (Accountant)** | บิลซื้อ/ขาย, AR/AP, งบการเงิน, ภาษี (ไม่เห็นค่าใช้จ่าย) |
| **บัญชีค่าใช้จ่าย** | เหมือนบัญชี + ค่าใช้จ่าย, Petty Advance, หมวดค่าใช้จ่าย |
| **ประสานงาน (Coordinator)** | บันทึกบิล, สต๊อก, Trading, PO (ไม่เห็นต้นทุน/กำไร/การเงิน) |
| **Poopae (Special)** | บัญชี + การผลิต + Asset + Loan + Bank Recon |
| **คลัง (Warehouse)** | Stock, Production, Transfer (เฉพาะสาขาตัวเอง) |
| **การเงิน (Cashier)** | จ่ายเงิน, รับเงิน, โอนเงิน, อนุมัติจ่าย |
| **ฝ่ายซื้อ (Purchaser)** | บิลซื้อ, PO Buy, Supplier |
| **ฝ่ายขาย (Sales)** | บิลขาย, PO Sell, Customer, Sales Plan, Commission |
| **User** | เข้าได้บางหน้า อ่านอย่างเดียว |

แต่ละ Role กำหนด:
- `menus` — รายการหน้าที่เข้าได้ (`"*"` = all)
- `actions` — `view`, `create`, `edit`, `post`, `export`, `delete`
- `seeCost`, `seeProfit`, `seeCash`, `seeFinancials`, `seeOpening` — บังคับปิดข้อมูล sensitive ใน UI
- `branchScope` — `"all"` หรือตาม `branchId` ของ user

### 2.3 Read-Only Mode
- User ที่ดูหน้าได้แต่ไม่มีสิทธิ์ write → UI แสดง banner "โหมดดูอย่างเดียว" + ปุ่มเขียนถูก disable

---

## 3. โมดูลธุรกิจหลัก

### 3.1 🏭 Master Data (ข้อมูลหลัก)
จัดการข้อมูลอ้างอิงทั้งหมดของระบบ:
- **ลูกค้า (Customers)** — ชื่อ, Tax ID, Credit Term, Credit Limit, Salesperson
- **ผู้ขาย/Supplier (~1,800+ รายการ)** — บุคคล/นิติบุคคล/ต่างประเทศ
- **สินค้า (Products — ~200+ SKU)** — code, กลุ่มโลหะ, ราคามาตรฐาน, หน่วย (กก.), สถานะ (RM/WIP/FG)
- **พนักงานขาย (Salespersons)** — Commission%, Base Salary
- **สาขา (Branches)** — 3 สาขา
- **คลัง (Warehouses)** — 6 คลัง (หลัก/WIP/FG)
- **บัญชีเงิน (Accounts)** — เงินสด, ธนาคาร, OD, FCD
- **ช่องทางซื้อ/ขาย (Purchase/Sales Channels)**
- **หมวดค่าใช้จ่าย (Expense Categories)**
- **กรรมการ/พนักงาน (Directors/Employees)**
- **เครื่องจักร (Machines)** — capacity, yield%, cost/hr
- **Production Line**
- **สกุลเงิน (Currencies)** — THB, USD, CNY, JPY, EUR, SGD
- **ผู้รับเงินต่างประเทศ (Overseas Beneficiaries)**
- **วิธีจ่าย/รับเงิน (Payment Methods)**
- **วัตถุประสงค์โอนเงิน (Remittance Purposes)**
- **Import Master จาก Excel**

### 3.2 📥 บิลรับซื้อ (Purchase Bills)
- บันทึกการซื้อเศษโลหะจาก Supplier
- **Line Items:** สินค้า + Lot No + Gross/Tare/Net Weight + ราคา/หน่วย + ส่วนลด
- **Header:** Supplier, สาขา, คลัง, ช่องทาง, Credit Term, VAT Type, ทะเบียนรถ, ผู้ติดต่อ
- รองรับ **Trading** (ซื้อมาขายไป — อ้างอิง PO Buy)
- **ใบสำคัญรับเงิน (Receipt Voucher)** — สำหรับ Supplier บุคคลธรรมดา
- **เปลี่ยน Supplier ในบิลย้อนหลัง** — มีประวัติ (Bill Swap History)
- สร้าง Stock Ledger entry อัตโนมัติตอนบันทึก

### 3.3 📤 บิลขาย (Sales Bills)
- บันทึกการขายเศษโลหะให้ Customer
- **Line Items:** สินค้า + Lot + Weight + ราคา/หน่วย + ส่วนลด + **ต้นทุน (FIFO)** + กำไร/บรรทัด
- **Header:** Customer, สาขา, คลัง, ช่องทาง, Credit Term, VAT
- รองรับ **Trading** (ซื้อมาขายไป — อ้างอิง Purchase Bill)
- **Sales Plan / วางแผนขาย** — เทียบราคา LME (London Metal Exchange) เพื่อกำหนดราคา
- **เบิกออกรอบิล (Stock Issue / Pending Sale)** — ตัด stock แล้ว แต่รอเปิดบิล

### 3.4 💸 จ่ายเงิน Supplier (Payments)
- เลือกจ่ายตามบิลซื้อ (partial/full payment)
- หัก ณ ที่จ่าย (WHT)
- เลือกบัญชีจ่าย, เลขที่เช็ค/อ้างอิง

### 3.5 💰 รับเงิน Customer (Receipts)
- เลือกรับตามบิลขาย (partial/full)
- หัก ณ ที่จ่าย (WHT)
- เลือกบัญชีรับ

### 3.6 🔄 โอนเงินระหว่างบัญชี (Transfers)
- โอนเงินสด ↔ ธนาคาร ระหว่างบัญชี

### 3.7 🧾 ค่าใช้จ่าย (Expenses)
- บันทึกค่าใช้จ่ายตามหมวด
- VAT, WHT
- อนุมัติโดยกรรมการ
- **Dashboard ค่าใช้จ่าย** — วิเคราะห์ตามหมวด/เดือน/สาขา

### 3.8 🏦 เงินสำรองจ่าย / กู้กรรมการ (Petty Advance)
- บันทึกเงินที่กรรมการ/พนักงานยืมไปใช้จ่าย
- ติดตามการคืนเงิน (Petty Returns)
- หักล้างกับค่าใช้จ่าย (Advance Allocations)

### 3.9 ✅ อนุมัติโอนเงิน (Payment Approval)
- บัตรอนุมัติส่งให้ Cashier
- อนุมัติ/ปฏิเสธการจ่าย

---

## 4. Stock & Inventory (สินค้าคงคลัง)

### 4.1 Stock Ledger
- บันทึกทุก movement เข้า-ออก (FIFO-based)
- Movement types: ซื้อ, ขาย, ผลิต (เข้า/ออก), โอนระหว่างสาขา, ปรับสต๊อก, คืนสินค้า
- แต่ละ entry ผูกกับ Reference (บิลซื้อ/ขาย/ผลิต/โอน)

### 4.2 สต๊อกคงเหลือ (Stock Balance)
- แสดงคงเหลือแยกตาม Product / Branch / Warehouse
- มูลค่าคงเหลือตามต้นทุนถัวเฉลี่ย

### 4.3 โอนสินค้าระหว่างสาขา (Stock Transfer)
- โอนระหว่างคลัง/สาขา

### 4.4 ปรับสถานะสินค้า (Status Convert: RM → WIP → FG)
- เปลี่ยนสถานะ Raw Material → Work-in-Progress → Finished Goods

### 4.5 ปรับเกรด (Grade Adjustment)
- เปลี่ยนเกรด/ชนิดสินค้า (เช่น ทองแดงเบอร์ 1 → เบอร์ 2)

### 4.6 นับสต๊อก / ปรับยอด (Stock Count Adjust)
- บันทึกผลนับจริง vs ระบบ → ปรับ +/-

### 4.7 Customer Return (ของคืน)
- บันทึกรับคืนสินค้าจากลูกค้า

---

## 5. Dual Costing (ระบบจองต้นทุน)

### 5.1 PO Buy (จองซื้อ)
- สั่งซื้อล่วงหน้า — จองต้นทุนก่อนของเข้า stock จริง
- **Cost Pool / Costing** — PO Buy + Spot Buy = ต้นทุนที่ใช้ Match ได้
- ติดตาม: รับแล้ว vs คงเหลือรับ

### 5.2 PO Sell (จองขาย)
- จองขายล่วงหน้า — จองดีลขายก่อนของออก
- ติดตาม: ส่งแล้ว vs คงเหลือส่ง

### 5.3 Cost Pool
- รวมต้นทุนที่ใช้จองได้ (จาก PO Buy + Spot Buy)
- Filter ตาม Product, Branch, Channel

### 5.4 Cost Allocator
- จัดสรรต้นทุนจาก Cost Pool → PO Sell (FIFO)

### 5.5 Match Log
- ประวัติการ Match ต้นทุน

### 5.6 Deal Margin Report
- กำไรต่อดีล — เทียบ Cost ที่จอง vs ราคาขาย

### 5.7 Compare Deal vs Stock
- เทียบ Margin ระหว่างดีลที่จอง vs ขายจาก stock จริง

---

## 6. การผลิต (Production)

### 6.1 ใบสั่งผลิต (Production Orders)
- เปิดใบสั่งผลิต — เลือก Machine, Production Line
- **Input:** วัตถุดิบ (RM) — multi-round
- **Output:** สินค้าสำเร็จรูป (WIP/FG) — multi-round
- **Process Costs:** ค่าแรง, ค่าไฟ, ค่าเครื่องจักร
- คำนวณ Yield%, Loss%
- Reverse ได้ (ยกเลิกการผลิต)

### 6.2 Production Dashboard
- สรุปภาพรวมการผลิต

### 6.3 WIP Report
- งานระหว่างผลิตคงเหลือ

### 6.4 Production Report / Yield
- รายงาน Yield แยกตาม Machine, Product

### 6.5 Production Cost Report
- ต้นทุนการผลิต — Input + Process Costs → ต้นทุน/กก.

### 6.6 Yield/Loss + Abnormal Report
- รายงาน Loss ผิดปกติ

### 6.7 Machine Utilization
- อัตราการใช้เครื่องจักร

---

## 7. Trading / ซื้อมาขายไป

- **Trading Dashboard** — ภาพรวมดีล Trading
- **Trading Matching** — จับคู่ PO Buy ↔ PO Sell, ซื้อ ↔ ขาย
- **Trading Deals** — ติดตามดีล

---

## 8. การเงิน & หนี้

### 8.1 ลูกหนี้ (AR — Accounts Receivable)
- ติดตามยอดคงค้างลูกค้า
- Aging Report

### 8.2 เจ้าหนี้ (AP — Accounts Payable)
- ติดตามยอดคงค้าง Supplier
- Aging Report

### 8.3 Cash / Bank Statement
- บันทึกรายการเดินบัญชีธนาคาร (Statement)
- Import Bank Statement

### 8.4 Cash Position
- สถานะเงินสด-ธนาคาร แยกตามบัญชี

### 8.5 จ่ายล่วงหน้า Supplier (Supplier Advance)
- บันทึกจ่ายเงินมัดจำ/ล่วงหน้าให้ Supplier

### 8.6 รับล่วงหน้าจาก Customer (Customer Advance)
- บันทึกรับเงินมัดจำ/ล่วงหน้าจาก Customer

---

## 9. การเงินต่างประเทศ (International Finance)

### 9.1 โอนเงินต่างประเทศ (Intl Transfer)
- บันทึกโอนเงินไปต่างประเทศ — เลือก Beneficiary, Currency, Purpose
- คำนวณ Bank Charges (Domestic, Swift, Intermediary, Receiving)

### 9.2 รับเงินจากต่างประเทศ (Overseas Receipt)
- บันทึกรับเงินจากต่างประเทศ

### 9.3 FX Rate Management
- จัดการอัตราแลกเปลี่ยน
- FX Gain/Loss Report

### 9.4 FCD Ledger
- บัญชีเงินตราต่างประเทศ

### 9.5 Bank Reconciliation
- กระทบยอดธนาคาร

---

## 10. รายงาน & วิเคราะห์

### 10.1 หน้าหลัก / Dashboard
- **Owner Daily Control** — เปิดทุกเช้า: สรุปยอดซื้อ/ขาย/เงินสด/กำไรวันนี้
- **Dashboard** — ภาพรวมทั้งระบบ
- **Daily Report** — รายงานประจำวัน

### 10.2 รายงานการเงิน
- **Financial Dashboard** — ภาพรวมการเงิน
- **งบกำไรขาดทุน (P&L Statement)**
- **งบดุล (Balance Sheet)**
- **งบกระแสเงินสด (Cash Flow Statement)**
- **Cash Flow Analysis**
- **Cash Flow Forecast Calendar**
- **Working Capital Analysis**
- **Stock Finance Analysis**
- **Profit Leak Dashboard** — จุดรั่วไหลกำไร
- **Profit & Cost Analysis**
- **Tax / VAT / WHT Report**

### 10.3 Cash & Others Summary
- สรุปเงินสดและรายการอื่น

### 10.4 Cash Flow Calendar
- ปฏิทินกระแสเงินสด

### 10.5 Business Calendar
- ปฏิทินธุรกิจ

### 10.6 Sales Commission / Sales Tracking Dashboard
- ติดตามยอดขายและคอมมิชชั่นพนักงานขาย

### 10.7 Fixed Assets
- **Asset Register** — ทะเบียนทรัพย์สิน
- **Depreciation** — คำนวณค่าเสื่อมราคา
- **Asset Disposal** — จำหน่ายทรัพย์สิน

### 10.8 Loan / Leasing / BSL
- **Loan Contracts** — สัญญาเงินกู้
- **Loan Dashboard** — ภาพรวมหนี้สิน

### 10.9 Equity / ทุนจดทะเบียน
- บันทึกทุนบริษัทและการเปลี่ยนแปลง

### 10.10 Opening Balance
- ตั้งต้นยอดยกมา

### 10.11 Historical Data (ม.ค.-เม.ย. 2026)
- ข้อมูลย้อนหลังก่อน Go-Live

### 10.12 Anomaly Detector
- ตรวจจับความผิดปกติในข้อมูล

### 10.13 Transaction Ledger
- เช็คเงินเข้า-ออกทุกรายการ

---

## 11. Tracking 360°

- **Customer Tracking** — ติดตามประวัติซื้อขาย, กำไร/ขาดทุนรายลูกค้า
- **Supplier Tracking** — ติดตามประวัติซื้อ, ราคา, volume ราย Supplier
- **Product Tracking** — ติดตามราคาซื้อ/ขาย, กำไร, turnover รายสินค้า

---

## 12. ระบบสนับสนุน

### 12.1 Backup / Restore
- Backup ข้อมูลทั้งหมดลงไฟล์ JSON → download
- Restore จากไฟล์ backup
- Auto-snapshot ก่อน Pull จาก Cloud
- จัดการ Snapshot (ลบอัตโนมัติเมื่อ localStorage ใกล้เต็ม)

### 12.2 Audit Log
- บันทึกทุก action: LOGIN, LOGIN_FAIL, VIEW, CREATE, UPDATE, DELETE, POST, IMPORT, EXPORT, BACKUP, RESTORE, SYNC
- เก็บสูงสุด 1,000 รายการ

### 12.3 User Activity Log
- ติดตาม activity ของผู้ใช้แต่ละคน

### 12.4 Users & Permissions
- จัดการ Users, Roles, Permissions

### 12.5 เปลี่ยน Password
- ผู้ใช้เปลี่ยน password ตัวเอง

### 12.6 ข้อมูลบริษัท (Company Profile)
- สำหรับใบพิมพ์ (ชื่อ, ที่อยู่, Tax ID, โลโก้)

### 12.7 Import Data
- **Import Master จาก Excel** — นำเข้าข้อมูลลูกค้า/Supplier/สินค้า
- **Import บิลซื้อ/บิลขาย** — นำเข้าธุรกรรมจาก Excel

---

## 13. Cloud Sync (Supabase)

### 13.1 Push to Cloud
- Push ข้อมูลจาก local → Supabase (ทุกตาราง)
- Push เฉพาะที่เปลี่ยนแปลง (delta) ตามโมดูล
- Push Master Data (suppliers, customers, products, etc.)
- Error handling: UNIQUE conflict, NOT NULL, FK constraint, RLS
- Failed queue → retry อัตโนมัติ

### 13.2 Pull from Cloud
- Pull ข้อมูลจาก Supabase → local
- Pull เฉพาะ Master Data
- Pull ทั้งระบบ (Full Pull) → ใช้ตอน Restore/migrate
- Auto-snapshot ก่อน pull (กันข้อมูลหาย)

### 13.3 Sync Health
- แสดงสถานะ sync: healthy / stale / critical / error
- Sync Errors Modal — แสดงรายการที่ push ไม่ได้ พร้อมวิธีแก้
- Auto-fix Duplicate docNo
- Force Push / Force Pull

### 13.4 Cloud Check Overlay
- ตอนเปิดแอป → เช็คว่าได้ pull ล่าสุดจาก cloud หรือยัง
- ถ้าไม่ → แสดง overlay "กำลังโหลดจาก Cloud" + ปุ่ม Skip

---

## 14. Export to Excel

- Export ได้จากปุ่ม floating button (📥 Export Excel)
- 9 Sheets ในไฟล์เดียว:
  1. **สรุป** — จำนวนรายการ/มูลค่ารวม ทุกประเภท
  2. **บิลซื้อ** — Purchase Bills (ขยาย line items)
  3. **บิลขาย** — Sales Bills (ขยาย line items, รวม COGS/กำไร)
  4. **ค่าใช้จ่าย** — Expenses
  5. **จ่ายเงิน** — Payments
  6. **รับเงิน** — Receipts
  7. **Stock Ledger** — ทุก movement
  8. **PO Buy** — Purchase Orders
  9. **PO Sell** — Sales Orders
- Join ID → ชื่อจริง (Supplier/Customer/Product/Branch/Warehouse/etc.)
- 1 บรรทัดต่อ 1 รายการสินค้า
- ปุ่มลาก-วางตำแหน่งได้ (draggable), ย่อ-ขยายได้ (minimizable)
- จำตำแหน่งปุ่ม (localStorage)

---

## 15. Data Storage Architecture

```
User Browser
├── localStorage (Primary — sync write)
│   └── ns_erp_db_v1         ← ข้อมูลทั้งหมด (JSON)
│   └── ns_erp_sync_failed_queue  ← push errors
├── IndexedDB (Fallback — async write, debounce 300ms)
│   └── ns_erp_idb / kv      ← mirror localStorage
└── Memory Cache (_ram)       ← sync access
```

- **Patched Storage.prototype** — 111 callsites เดิมทำงานได้ไม่ต้องแก้
- Proactive cleanup — ลบ snapshot เก่าถ้า localStorage > 7MB
- Quota exceeded → clear snapshots → retry

---

## 16. UI/UX Features

- **Responsive Sidebar** — เมนูจัดกลุ่ม, collapse บน mobile
- **Branch Filter** — เลือกดูข้อมูลเฉพาะสาขา
- **Cloud Sync Indicator** — แสดงสถานะ sync บน topbar (☁️✓ / ☁️⏰ / ☁️⚠ / ☁️✗)
- **Global Save Status Badge** — แสดงสถานะ save (⏳ กำลังบันทึก... / ✓ บันทึกสำเร็จ / ✗ Failed)
- **Empty Data Banner** — เตือนถ้า master data ว่าง (ยังไม่เคย sync)
- **Read-Only Banner** — แสดงเมื่อ user ดูได้แต่วาดไม่ได้
- **Access Denied Page** — เมื่อ user เข้าหน้าที่ไม่มีสิทธิ์
- **Toast Notifications** — success / warn / error
- **Vue 3 Composition API** — `reactive`, `ref`, `computed`, `watch`, `onMounted`

---

## 17. ข้อมูล Seed Data (Default)

| Entity | จำนวน |
|--------|-------|
| Suppliers | ~1,800+ |
| Products | ~200+ |
| Customers | 3 (ตัวอย่าง) |
| Branches | 3 |
| Warehouses | 6 |
| Accounts (Bank/Cash) | 7 |
| Directors/Employees | 3 |
| Machines | 4 |
| Production Lines | 3 |
| Users (Default) | 7 |
| Roles | 10+ |
| Currencies | 6 |
| FX Rates | 4 |
| Payment Methods | 6 |
| Remittance Purposes | 6 |
| Overseas Beneficiaries | 2 |

---

## สรุปโมดูลทั้งหมด

| # | กลุ่ม | โมดูล |
|---|------|-------|
| 1 | **หน้าหลัก** | Owner Daily Control, Anomaly Detector, Daily Report, Dashboard, Profit & Cost Analysis, Pending Sales, Sales Plan (LME), Sales Tracking Dashboard, Cash Flow Calendar, Business Calendar, Cash & Others Summary |
| 2 | **Tracking 360°** | Customer Tracking, Supplier Tracking, Product Tracking |
| 3 | **รายการประจำวัน** | บิลรับซื้อ, บิลขาย, เบิกออกรอบิล (Stock Issue), อนุมัติโอนเงิน, จ่ายเงิน Supplier, ใบสำคัญรับเงิน, รับเงิน Customer, โอนเงินระหว่างบัญชี, ค่าใช้จ่าย, เงินสำรองจ่าย/กู้กรรมการ, Dashboard ค่าใช้จ่าย, โอนสินค้าระหว่างสาขา, ประวัติเปลี่ยน Supplier ในบิล |
| 4 | **การผลิต** | ใบสั่งผลิต, Production Dashboard, WIP Report, รายงานการผลิต/Yield, Production Cost Report, Yield/Loss + Abnormal, Machine Utilization |
| 5 | **Dual Costing** | PO Buy, PO Sell, Cost Pool, Cost Allocator, Match Log, Deal Margin Report, Compare Deal vs Stock |
| 6 | **การเงิน & หนี้** | AR (ลูกหนี้), AP (เจ้าหนี้), Cash/Bank Statement, Cash Position, จ่ายล่วงหน้า Supplier, รับล่วงหน้าจาก Customer |
| 7 | **การเงินต่างประเทศ** | โอนเงินต่างประเทศ, รับเงินจากต่างประเทศ, FX Rate, FCD Ledger, FX Gain/Loss, Bank Reconciliation |
| 8 | **สินค้า** | Stock Balance, Stock Ledger, ปรับสถานะสินค้า (RM→FG), Grade Adjustment, Stock Count Adjust, Customer Return |
| 9 | **Trading** | Trading Dashboard, Trading Matching |
| 10 | **PO Reports** | PO ซื้อ/ขาย คงเหลือ |
| 11 | **รายงานการเงิน** | Financial Dashboard, Cash Flow Analysis, Cash Flow Forecast, Working Capital, Stock Finance, Profit Leak, Tax/VAT/WHT, P&L, Balance Sheet, Cash Flow Statement, Fixed Assets, Depreciation, Asset Disposal, Loan/Leasing, Loan Dashboard, Equity, Opening Balance, Historical Data |
| 12 | **ข้อมูลหลัก** | ลูกค้า, พนักงานขาย, ผู้ขาย, สินค้า, สาขา/คลัง, บัญชีเงิน, ช่องทางซื้อ/ขาย, หมวดค่าใช้จ่าย, กรรมการ/พนักงาน, เครื่องจักร, Production Line, สกุลเงิน, ผู้รับเงินต่างประเทศ, วิธีจ่าย/รับเงิน, วัตถุประสงค์โอน, Import Master, Import บิลซื้อ/ขาย |
| 13 | **ระบบ** | ข้อมูลบริษัท, เปลี่ยน Password, Transaction Ledger, Backup/Restore, Audit Log, Users & Permissions, User Activity Log |

---

> **รวม: 13 กลุ่ม, 80+ หน้าจอ/โมดูล**
