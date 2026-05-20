# 20 Legacy Page Inventory

Status date: 2026-05-20

## Purpose

เอกสารนี้นับจำนวนหน้าจาก legacy prototype ที่ `https://sirimasth.github.io/ns-scrap-erp/` เพื่อใช้เป็น baseline สำหรับเทียบ route/page migration ใน Next app.

## Source And Method

- Source: `https://sirimasth.github.io/ns-scrap-erp/`
- HTTP last-modified observed: `Tue, 19 May 2026 04:56:24 GMT`
- Method: ดาวน์โหลด HTML เดี่ยวของ legacy app แล้ว parse `const menuGroups = [...]` เป็น source of truth ของหน้าใน sidebar.
- Cross-check: เทียบกับ `app.component('view-*')` ใน HTML เดียวกัน.

## Count Summary

| Metric | Count | Notes |
|---|---:|---|
| Sidebar menu entries | 110 | นับทุก entry ที่อยู่ใน `menuGroups` รวม duplicate |
| Unique sidebar view IDs | 109 | `ownerDaily` อยู่ทั้งหมวด `หน้าหลัก` และ `Finance / Accounting` |
| Registered `view-*` components | 108 | นับจาก `app.component('view-*')` |
| Sidebar view IDs without registered component | 1 | `trackAssetOverview` อยู่ในเมนู แต่ไม่พบ `view-trackAssetOverview` |
| Registered components not in sidebar | 0 | ไม่พบ component ที่อยู่นอก sidebar จาก pattern นี้ |

Important notes:

- เมนู legacy ถูก filter ด้วย role/permission ตอน runtime ดังนั้นผู้ใช้แต่ละ role อาจเห็นไม่ครบ 110 entries.
- จำนวน migration ที่ควร track แบบหน้าไม่ซ้ำคือ 109 unique view IDs.
- `trackAssetOverview` ต้องตรวจด้วย browser เพิ่มก่อนนับเป็น page ที่ใช้งานจริง เพราะอยู่ใน sidebar แต่ไม่พบ component registration ใน source.

## Group Counts

| Group | Entries |
|---|---:|
| หน้าหลัก | 11 |
| Tracking 360° | 3 |
| รายการประจำวัน | 13 |
| การผลิต | 7 |
| Dual Costing (จองดีล) | 10 |
| การเงิน & หนี้ | 6 |
| การเงินต่างประเทศ | 6 |
| สินค้า | 6 |
| Trading / ซื้อมาขายไป | 2 |
| PO Reports | 1 |
| รายงาน | 1 |
| Finance / Accounting | 20 |
| ข้อมูลหลัก | 17 |
| ระบบ | 7 |
| **Total menu entries** | **110** |

## Page List

### หน้าหลัก (11)

| # | View ID | Legacy label |
|---:|---|---|
| 1 | `ownerDaily` | ☀️ Owner Daily Control (เปิดทุกเช้า) |
| 2 | `anomalyDetector` | 🚨 ตรวจจับความผิดปกติ |
| 3 | `dailyReport` | 📰 Daily Report (รายงานประจำวัน) |
| 4 | `dashboard` | Dashboard |
| 5 | `profitCostAnalysis` | Profit & Cost Analysis |
| 6 | `pendingSales` | รายการรอขาย |
| 7 | `salesPlan` | 📋 วางแผนการขาย (LME) |
| 8 | `salesCommission` | 💼 Sales Tracking Dashboard |
| 9 | `cashFlowCalendar` | Cash Flow Calendar |
| 10 | `businessCalendar` | Business Calendar |
| 11 | `cashOthersSummary` | Cash & Others Summary |

### Tracking 360° (3)

| # | View ID | Legacy label |
|---:|---|---|
| 12 | `customerTracking` | Customer Tracking |
| 13 | `supplierTracking` | Supplier Tracking |
| 14 | `productTracking` | Product Tracking |

### รายการประจำวัน (13)

| # | View ID | Legacy label |
|---:|---|---|
| 15 | `purchase` | บิลรับซื้อ |
| 16 | `sales` | บิลขาย |
| 17 | `stockIssue` | 📦 เบิกออกรอบิล (Pending Sale) |
| 18 | `paymentApproval` | ✅ อนุมัติโอนเงิน (Payment Approval) |
| 19 | `payment` | จ่ายเงิน Supplier |
| 20 | `receiptVoucher` | 🧾 ใบสำคัญรับเงิน (Receipt Voucher) |
| 21 | `receipt` | รับเงิน Customer |
| 22 | `transfer` | โอนเงินระหว่างบัญชี |
| 23 | `expense` | ค่าใช้จ่าย |
| 24 | `pettyAdvance` | เงินสำรองจ่าย / กู้กรรมการ |
| 25 | `expenseDashboard` | Dashboard ค่าใช้จ่าย |
| 26 | `stockTransfer` | โอนสินค้าระหว่างสาขา |
| 27 | `billSwapHistory` | 📜 ประวัติเปลี่ยน Supplier ในบิล |

### การผลิต (7)

| # | View ID | Legacy label |
|---:|---|---|
| 28 | `production` | ใบสั่งผลิต |
| 29 | `productionDashboard` | 📊 Production Dashboard |
| 30 | `wipReport` | WIP คงเหลือ |
| 31 | `productionReport` | รายงานการผลิต / Yield |
| 32 | `productionCostReport` | Production Cost Report |
| 33 | `yieldLossReport` | Yield/Loss + Abnormal |
| 34 | `machineUtil` | Machine Utilization |

### Dual Costing (จองดีล) (10)

| # | View ID | Legacy label |
|---:|---|---|
| 35 | `poBuy` | PO Buy (จองซื้อ) |
| 36 | `poSell` | PO Sell (จองขาย) |
| 37 | `costPool` | Cost Pool |
| 38 | `costAllocator` | Cost Allocator (ทอง/เหลือง) |
| 39 | `waitingAllocations` | Waiting Allocations |
| 40 | `costAllocationLedger` | Allocation Ledger |
| 41 | `dualCostingReport` | Dual Costing Report |
| 42 | `matchLog` | Match Log |
| 43 | `dealMargin` | Deal Margin Report |
| 44 | `compareMargin` | Compare Deal vs Stock |

### การเงิน & หนี้ (6)

| # | View ID | Legacy label |
|---:|---|---|
| 45 | `ar` | ลูกหนี้ (AR) |
| 46 | `ap` | เจ้าหนี้ (AP) |
| 47 | `bank` | Cash / Bank Statement |
| 48 | `cashPosition` | Cash Position |
| 49 | `supplierAdvance` | จ่ายล่วงหน้า Supplier |
| 50 | `customerAdvance` | รับล่วงหน้าจาก Customer |

### การเงินต่างประเทศ (6)

| # | View ID | Legacy label |
|---:|---|---|
| 51 | `intlTransfer` | โอนเงินต่างประเทศ |
| 52 | `overseasReceipt` | รับเงินจากต่างประเทศ |
| 53 | `fxRate` | FX Rate Management |
| 54 | `fcdLedger` | FCD Ledger |
| 55 | `fxGainLossReport` | FX Gain/Loss Report |
| 56 | `bankRecon` | Bank Reconciliation |

### สินค้า (6)

| # | View ID | Legacy label |
|---:|---|---|
| 57 | `stockBalance` | สต๊อกคงเหลือ |
| 58 | `stockLedger` | Stock Ledger |
| 59 | `statusConvert` | 🔄 ปรับสถานะสินค้า (RM→FG) |
| 60 | `gradeAdjustment` | Grade Adjustment / ปรับเกรด |
| 61 | `stockAdjust` | นับสต๊อก / Stock Count Adjust |
| 62 | `customerReturn` | Customer Return / ของคืน |

### Trading / ซื้อมาขายไป (2)

| # | View ID | Legacy label |
|---:|---|---|
| 63 | `tradingDashboard` | Trading Dashboard |
| 64 | `tradingMatching` | Trading Matching / จับคู่ดีล |

### PO Reports (1)

| # | View ID | Legacy label |
|---:|---|---|
| 65 | `poOutstanding` | PO ซื้อ/ขาย คงเหลือ |

### รายงาน (1)

| # | View ID | Legacy label |
|---:|---|---|
| 66 | `reports` | รายงานทั้งหมด |

### Finance / Accounting (20)

| # | View ID | Legacy label |
|---:|---|---|
| 67 | `finDashboard` | Financial Dashboard |
| 68 | `ownerDaily` | Owner Daily Control |
| 69 | `cashFlowAnalysis` | Cash Flow Analysis |
| 70 | `cashFlowForecast` | CF Forecast Calendar |
| 71 | `workingCapital` | Working Capital Analysis |
| 72 | `stockFinance` | Stock Finance Analysis |
| 73 | `profitLeak` | Profit Leak Dashboard |
| 74 | `taxVAT` | Tax / VAT / WHT |
| 75 | `plStatement` | งบกำไรขาดทุน (P&L) |
| 76 | `balanceSheet` | งบดุล (Balance Sheet) |
| 77 | `cashFlowStatement` | งบกระแสเงินสด |
| 78 | `assetRegister` | Fixed Assets / ทรัพย์สิน |
| 79 | `depreciation` | ค่าเสื่อมราคา |
| 80 | `assetDisposal` | จำหน่ายทรัพย์สิน |
| 81 | `loanContracts` | Loan / Leasing / BSL |
| 82 | `loanDashboard` | Loan Dashboard |
| 83 | `trackAssetOverview` | Net Worth / Track Asset |
| 84 | `equityMaint` | Equity / ทุนจดทะเบียน |
| 85 | `openingBalance` | ⭐ Opening Balance / ตั้งต้นยอด |
| 86 | `historicalData` | 📅 ข้อมูลย้อนหลัง ม.ค.-เม.ย. 2026 (ก่อน Go-Live) |

### ข้อมูลหลัก (17)

| # | View ID | Legacy label |
|---:|---|---|
| 87 | `mdCustomer` | ลูกค้า |
| 88 | `mdSalesperson` | พนักงานขาย (Sales) |
| 89 | `mdSupplier` | ผู้ขาย |
| 90 | `mdProduct` | สินค้า |
| 91 | `mdBranch` | สาขา / คลัง |
| 92 | `mdAccount` | บัญชีเงิน |
| 93 | `mdChannel` | ช่องทางซื้อ/ขาย |
| 94 | `mdExpense` | หมวดค่าใช้จ่าย |
| 95 | `mdDirector` | กรรมการ/พนักงาน |
| 96 | `mdMachine` | เครื่องจักร |
| 97 | `mdProductionLine` | Production Line |
| 98 | `mdCurrency` | สกุลเงิน |
| 99 | `mdBeneficiary` | ผู้รับเงินต่างประเทศ |
| 100 | `mdPaymentMethod` | วิธีจ่าย/รับเงิน |
| 101 | `mdRemittancePurpose` | วัตถุประสงค์โอน |
| 102 | `mdImport` | Import Master จาก Excel |
| 103 | `importTxn` | Import บิลซื้อ/บิลขาย |

### ระบบ (7)

| # | View ID | Legacy label |
|---:|---|---|
| 104 | `companyProfile` | 🏢 ข้อมูลบริษัท (สำหรับใบพิมพ์) |
| 105 | `changePassword` | 🔒 เปลี่ยน Password ของฉัน |
| 106 | `transactionLedger` | 📒 Transaction Ledger (เช็คเงินเข้า-ออก) |
| 107 | `backup` | 💾 Backup / Restore (สำคัญ) |
| 108 | `audit` | Audit Log |
| 109 | `userPermission` | Users & Permissions |
| 110 | `userActivity` | User Activity Log |

