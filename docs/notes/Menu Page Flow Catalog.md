---
title: Menu Page Flow Catalog
tags:
  - system-flow
  - menu
  - migration
status: draft
updated: 2026-06-11
---

# Menu Page Flow Catalog / Flow ทุกหน้าตามเมนู

เอกสารนี้เป็น catalog กลางของทุกหน้าที่อยู่ในเมนูใหม่ `apps/next/src/lib/navigation.ts` เท่านั้น

หลักการอ่าน:

- `Detailed doc` = มีเอกสาร flow แยกแล้ว ให้ใช้เอกสารนั้นเป็น source หลัก
- `Current Next` = สถานะ implementation ใน active Next app เท่าที่ตรวจจาก route/API และ sitemap
- `Flow baseline` = flow ที่ควรยึดตอนออกแบบหรือเขียนต่อ ถ้า Next ยังไม่มี flow ครบ ให้ยึด legacy inventory / legacy page behavior เป็นตั้งต้น
- `Gap` = งานที่ยังต้องแยกออกไปทำ ไม่ถือว่าทำเสร็จเพราะมีเอกสารนี้

Source:

- Active menu: `apps/next/src/lib/navigation.ts`
- Active route/API snapshot: `docs/migration/18-next-system-sitemap.md`
- Legacy page inventory: `docs/migration/20-legacy-page-inventory.md`
- Detailed docs in `docs/notes/`
- Per-page flow files: `docs/notes/page-flows/README.md`

## Main / Dashboard & Reports

| Route | Page | Detailed doc | Current Next | Flow baseline | Gap |
|---|---|---|---|---|---|
| `/owner-daily` | Owner Daily Control | [[Main Dashboard Reports Flow]], [[page-flows/main-dashboard-reports-owner-daily|Owner Daily Page Flow]] | accepted code baseline | current `/api/owner-daily` delegates to dashboard API and reads `ownerDaily` payload: cash plan, actual activity, due AR/AP, loan, expense, pending work | finalize due-date policy and source route mapping |
| `/anomaly-detector` | ตรวจจับความผิดปกติ | [[Main Dashboard Reports Flow]], [[page-flows/main-dashboard-reports-anomaly-detector|Anomaly Detector Page Flow]] | accepted code baseline | current `/api/anomaly-detector`: read-only deterministic scan for stock/cash/AR/AP/PB/SB/master/bank/trading anomalies | confirm thresholds and add row-level navigation/highlight |
| `/daily-report` | Daily Report | [[Main Dashboard Reports Flow]], [[page-flows/main-dashboard-reports-daily-report|Daily Report Page Flow]] | accepted code baseline | current `/api/daily-report` delegates to dashboard API and reads `dailyReport` payload: purchase/sales/cash/expense/group/top-party report | define final print/export and cutoff test cases |
| `/dashboard` | Financial Dashboard | [[Main Dashboard Reports Flow]], [[page-flows/main-dashboard-reports-dashboard|Dashboard Page Flow]] | accepted code baseline | current `/api/dashboard`: management KPI overview from PB/SB/EXP/PMT/RCP/stock/bank/production/historical facts | reconcile KPI formulas with Finance Accounting dashboards |
| `/profit-cost-analysis` | Profit & Cost Analysis | [[Main Dashboard Reports Flow]], [[page-flows/main-dashboard-reports-profit-cost-analysis|Profit & Cost Page Flow]] | accepted code baseline | current `/api/profit-cost-analysis`: PB/SB item, COGS, GP, stock value and product/customer/supplier/channel margin view | lock COGS/WAC source after stock ledger policy is finalized |
| `/pending-sales` | รายการรอขาย | [[Sales Flow]], [[Cost Pool]] | accepted code baseline | legacy `pendingSales`: compare stock/cost pool/PO Sell commitments and sale readiness | separate `WTO hold`, `PSALE stock-out`, and cost pool quantities in the UI |
| `/sales-plan` | วางแผนการขาย (LME) | [[Sales Flow]] | accepted code baseline | legacy `salesPlan`: propose sale channel/LME percentage and lock selling plan | connect locked plan to PO Sell / stock issue write flow |
| `/sales-commission` | Sales Tracking Dashboard | [[Main Dashboard Reports Flow]], [[page-flows/main-dashboard-reports-sales-commission|Sales Tracking Page Flow]] | accepted code baseline | current `/api/sales-commission`: salesperson/assignment performance read model; not payroll posting | define salesperson ownership source and commission formula |
| `/cash-flow-calendar` | Cash Flow Calendar | [[Main Dashboard Reports Flow]], [[page-flows/main-dashboard-reports-cash-flow-calendar|Cash Flow Calendar Page Flow]] | accepted code baseline | current `/api/cash-flow-calendar`: actual cash calendar from accounts and bank statement by month | decide forecast/expected cash inclusion policy |
| `/business-calendar` | Business Calendar | [[Main Dashboard Reports Flow]], [[page-flows/main-dashboard-reports-business-calendar|Business Calendar Page Flow]] | accepted code baseline | current `/api/business-calendar`: daily PB/SB/EXP/RCP/PMT activity, GP and net cash by month | define drilldown source links per day |
| `/cash-others-summary` | Cash & Others Summary | [[Main Dashboard Reports Flow]], [[page-flows/main-dashboard-reports-cash-others-summary|Cash & Others Page Flow]] | accepted code baseline | current `/api/cash-others-summary`: as-of cash, AR/AP, stock, pending sale, trading pending, asset/debt composition | reconcile with balance sheet and cash position |

## Tracking 360

| Route | Page | Detailed doc | Current Next | Flow baseline | Gap |
|---|---|---|---|---|---|
| `/tracking/customer` | Customer Tracking | [[Tracking 360 Flow]], [[page-flows/tracking-360-tracking-customer|Customer Tracking Page Flow]] | accepted code baseline | legacy `customerTracking`: customer sales, receipts, AR, GP, yearly trend, and customer drilldown | add source document drilldown and product/channel breakdown |
| `/tracking/supplier` | Supplier Tracking | [[Tracking 360 Flow]], [[page-flows/tracking-360-tracking-supplier|Supplier Tracking Page Flow]] | accepted code baseline | legacy `supplierTracking`: supplier purchase, payments, AP, avg buy price, product mix, and supplier drilldown | add bill/payment drilldown and server-side supplier/search filter |
| `/tracking/product` | Product Tracking | [[Tracking 360 Flow]], [[page-flows/tracking-360-tracking-product|Product Tracking Page Flow]] | accepted code baseline | legacy `productTracking`: product purchase, sales, GP, stock, WAC, slow movers, and stock movement drilldown | align with final stock ledger/balance, hold visibility, and COGS policy |

## Daily Transactions

| Route | Page | Detailed doc | Current Next | Flow baseline | Gap |
|---|---|---|---|---|---|
| `/purchase/bills` | บิลรับซื้อ | [[Purchase Bills Page Flow]], [[Purchase Flow]] | accepted code baseline | target: `WTI -> PB -> PMA/PMT`; PB owns stock-in for stock purchase | finish durable allocation/status/timeline/reversal |
| `/sales/bills` | บิลขาย | [[Sales Bills Page Flow]], [[Sales Flow]] | accepted code baseline | target: `WTO -> SB -> RCP`, PO Sell allocation, Spot Sale split, and PSALE source support | finish allocation facts, stock-out rules, and receipt relation |
| `/sales/stock-issue` | เบิกออกรอบิล | [[Pending Sale Page Flow]] | accepted code baseline | legacy `stockIssue`: `PSALE` stock-out before billing; target keeps `PSALE` ledger and SB does not cut stock twice | implement create/edit/cancel/convert and ledger reversal |
| `/daily/payment-approval` | อนุมัติจ่ายเงิน | [[Payment Flow]] | accepted code baseline | target: PMA approval document for payment queue before PMT | complete status/timeline and payment-cycle locks |
| `/purchase/advance-payments` | จ่ายเงินล่วงหน้า / มัดจำ | [[Supplier Advance Payment Flow]] | accepted code baseline | target: supplier ADV, allocation to PB, release on cancel/supplier swap | complete allocation facts and status logs |
| `/purchase/payments` | จ่ายเงิน Supplier | [[Payment Flow]] | accepted code baseline | target: PMT pays approved AP/ADV/expense sources and writes bank statement | support multi-bill voucher, split accounts, reversal |
| `/purchase/receipt-vouchers` | ใบสำคัญรับเงิน | [[Receipt Voucher Page Flow]], [[Printable Documents]], [[Payment Flow]] | accepted code baseline | legacy `receiptVoucher`: cash-only Supplier-signed `RV` with PB pre-fill; separate from customer receipt `RCP` | implement cash-only source-aware create/edit/cancel, Company Profile print, status/timeline, signer/payment fields |
| `/sales/receipts` | รับเงิน Customer | [[Sales Flow]], [[Payment Flow]] | accepted code baseline | target: RCP receives against SB/customer advance and writes bank statement | finish multi-bill receipt, allocation, reversal |
| `/daily/weight-ticket-list` | รายการใบรับ-ส่งของ | [[WTI-WTO Flow]] | accepted code baseline | target list/detail for WTI/WTO with downstream PB/SB usage locks | finish timeline and bill usage reconciliation |
| `/daily/transfer` | โอนเงินระหว่างบัญชี | [[Daily Cash Flow]] | accepted code baseline | legacy `transfer`: internal account transfer creates balanced bank statement movements | finish reversal/audit and no-P&L policy |
| `/daily/expense` | ค่าใช้จ่าย | [[Daily Cash Flow]] | accepted code baseline | target expense invoice before payment, with VAT/WHT and payable/payment status | finish approval/payment link and aging |
| `/daily/expense-dashboard` | Dashboard ค่าใช้จ่าย | [[Expense Dashboard Flow]] | accepted code baseline | legacy `expenseDashboard`: expense analysis by type/category/status/period | align with final expense category/type model |
| `/purchase/po-buy` | PO Buy | [[PO Buy Page Flow]], [[Purchase Flow]] | accepted code baseline | target: PO Buy reservation/cost commitment, feeds WTI/PB and cost pool; PO has no stock/AP effect by itself | finish close-short, allocation logs, timeline, print/detail parity, and PO aging |
| `/sales/po-sell` | PO Sell | [[PO Sell Flow]], [[Sales Flow]] | accepted code baseline | target: PO Sell reservation/customer commitment, feeds WTO/SB and cost allocator | finish line-level allocation and branch-aware numbering |
| `/daily/design-mockup` | Design Mockup | [[Architecture Map]] | playground | internal UI/design playground, not a business transaction flow | keep out of production business flow and permissions if needed |

## Production

| Route | Page | Detailed doc | Current Next | Flow baseline | Gap |
|---|---|---|---|---|---|
| `/production/orders` | ใบสั่งผลิต | [[Production Flow]] | accepted code baseline | legacy `production`: create production order, issue inputs, receive outputs, process cost, complete/close | implement PI/PO2 write services and reversal |
| `/production/output-categories` | หมวดหมู่ผลผลิต | [[Production Flow]] | accepted code baseline | target master for output categories `FG`, `RM`, `CUSTOMER_RETURN`, `LOSS` | enforce category effect in production output write flow |
| `/production/dashboard` | Production Dashboard | [[Production Flow]] | accepted code baseline | legacy `productionDashboard`: production KPIs, WIP, output, cost, yield | reconcile with ledger facts after PI/PO2 writes |
| `/production/report` | รายงานการผลิต / Yield | [[Production Flow]] | accepted code baseline | legacy `productionReport`: yield/output/loss report | connect abnormal loss policy and output categories |
## Dual Costing

| Route | Page | Detailed doc | Current Next | Flow baseline | Gap |
|---|---|---|---|---|---|
| `/dual-costing/cost-pool` | Cost Pool | [[Dual Costing Flow]], [[page-flows/dual-costing-dual-costing-cost-pool|Cost Pool Page Flow]], [[Cost Pool]] | accepted code baseline | legacy `costPool`: eligible copper/brass cost candidates from PO/PB plus legacy Production/Regrade display | enforce target inclusion: copper/brass only, PO Buy + Stock PB Spot/No PO only |
| `/dual-costing/cost-allocator` | Cost Allocator | [[Dual Costing Flow]], [[page-flows/dual-costing-dual-costing-cost-allocator|Cost Allocator Page Flow]], [[PO Sell Flow]] | accepted code baseline | legacy `costAllocator`: choose source mode, product, target, allocation mode, preview lots, confirm match | persist allocation decisions and link to PO Sell/SB through durable match/ledger |
| `/dual-costing/waiting-allocations` | Waiting Allocations | [[Dual Costing Flow]], [[page-flows/dual-costing-dual-costing-waiting-allocations|Waiting Allocations Page Flow]] | accepted code baseline | legacy `waitingAllocations`: PO Sell/SB/weight-diff queue waiting for cost allocation | define stale allocation aging and target action ownership |
| `/dual-costing/cost-allocation-ledger` | Allocation Ledger | [[Dual Costing Flow]], [[page-flows/dual-costing-dual-costing-cost-allocation-ledger|Allocation Ledger Page Flow]] | accepted code baseline | legacy `costAllocationLedger`: grouped match history with lot drilldown and reverse-not-delete policy | write durable allocation ledger when allocator writes are implemented |
| `/dual-costing/report` | Dual Costing Report | [[Dual Costing Flow]], [[page-flows/dual-costing-dual-costing-report|Dual Costing Report Page Flow]] | accepted code baseline | legacy `dualCostingReport`: management report by PO/Spot allocation and pending cost | reconcile to final deal matching and SB cost facts |
| `/dual-costing/match-log` | Match Log | [[Dual Costing Flow]], [[page-flows/dual-costing-dual-costing-match-log|Match Log Page Flow]] | accepted code baseline | legacy `matchLog`: active/reversed cost matching log | align with durable allocation ledger and audit |
| `/dual-costing/deal-margin` | Deal Margin Report | [[Dual Costing Flow]], [[page-flows/dual-costing-dual-costing-deal-margin|Deal Margin Page Flow]] | accepted code baseline | legacy `dealMargin`: margin by matched deal with top deals/month filters | reconcile source with trading deals and future allocation ledger |
| `/dual-costing/compare-margin` | Compare Deal vs Stock | [[Dual Costing Flow]], [[page-flows/dual-costing-dual-costing-compare-margin|Compare Margin Page Flow]] | accepted code baseline | legacy `compareMargin`: compare Deal Cost vs Stock/WAC margin | define final stock-side formula and eligible scope |

## Finance & Debt

| Route | Page | Detailed doc | Current Next | Flow baseline | Gap |
|---|---|---|---|---|---|
| `/daily/petty-advance` | เงินสำรองจ่าย / กู้กรรมการ | [[Finance Debt Flow]], [[Petty Advance Page Flow]], [[page-flows/finance-debt-daily-petty-advance|Petty Advance Page Flow]] | accepted code baseline | target `PADV` outstanding + `PRET` return; no `BST` on PADV create | finish expense allocation, created-date display, status logs |
| `/finance/ar` | ลูกหนี้ (AR) | [[Finance Debt Flow]], [[Finance AR Page Flow]], [[page-flows/finance-debt-finance-ar|AR Page Flow]] | accepted code baseline | legacy `ar`: receivable aging from sales bills/receipts and pending sale banner | add source document links, created-date display, customer advance allocation facts |
| `/finance/ap` | เจ้าหนี้ (AP) | [[Finance Debt Flow]], [[Finance AP Page Flow]], [[page-flows/finance-debt-finance-ap|AP Page Flow]] | accepted code baseline | legacy `ap`: payable aging from purchase bills/payments | fix due-date source, sync PMA/PMT states and payment locks |
| `/finance/bank` | Cash / Bank Statement | [[Finance Debt Flow]], [[Finance Bank Statement Page Flow]], [[page-flows/finance-debt-finance-bank|Bank Statement Page Flow]] | accepted code baseline | legacy `bank`: account statement, running balance, charts, export | define admin correction boundary, created-date display, source links |
| `/finance/cash-position` | Cash Position | [[Finance Debt Flow]], [[Finance Cash Position Page Flow]], [[page-flows/finance-debt-finance-cash-position|Cash Position Page Flow]] | accepted code baseline | legacy `cashPosition`: cash/bank/FCD/OD + AR/AP liquidity summary | define as-of/currency policy and drilldown links |
| `/finance/customer-advance` | รับล่วงหน้าจาก Customer | [[Finance Debt Flow]], [[Customer Advance Page Flow]], [[page-flows/finance-debt-finance-customer-advance|Customer Advance Page Flow]] | accepted code baseline | legacy `customerAdvance`: CADV receipt, bank statement in, allocation to SB | implement dedicated customer advance and allocation tables |

## Stock

| Route | Page | Detailed doc | Current Next | Flow baseline | Gap |
|---|---|---|---|---|---|
| `/stock/transfer` | โอนสินค้าระหว่างสาขา | [[Stock Transfer Page Flow]], [[Stock Ledger and Stock Balance]] | accepted code baseline | target transfer stock between branches/warehouses with no revenue impact, source available/cost preview, and paired `ST` ledger | implement hold-aware validation, source cost/value, target filters/columns, and draft-only edit/cancel policy |
| `/stock/balance` | สต๊อกคงเหลือ | [[Stock Balance Page Flow]], [[Stock Ledger and Stock Balance]] | accepted code baseline | target balance = ledger-derived on hand, hold, available by product/warehouse/status | implement hold-aware drilldown |
| `/stock/ledger` | Stock Ledger | [[Stock Ledger Page Flow]], [[Stock Ledger and Stock Balance]] | accepted code baseline | target ledger shows physical stock movements only; hold is not ledger | finish source links and no-hold-row rule |
| `/stock/status-convert` | ปรับสถานะสินค้า (RM/FG) | [[Stock Status Convert Page Flow]] | accepted code baseline | target `SC`: RM<->FG status bucket conversion with paired stock ledger, ready-stock validation, source WAC carry-forward, and Production reporting source label | finish hold-aware validation and reversal policy |
| `/stock/convert` | Grade Adjustment / ปรับเกรด | [[Stock Convert Page Flow]] | accepted code baseline | legacy `gradeAdjustment`: convert product/grade using source WAC | finish cost allocation and reversal |
| `/stock/adjust` | นับสต๊อก / Stock Count Adjust | [[Stock Adjust Page Flow]] | accepted code baseline | legacy `stockAdjust`: count adjustment with reason and note-only/P&L policy | finalize approval/reconciliation boundary |

## Trading & PO Reports

| Route | Page | Detailed doc | Current Next | Flow baseline | Gap |
|---|---|---|---|---|---|
| `/trading/dashboard` | Trading Dashboard | [[Trading Flow]], [[page-flows/trading-po-reports-trading-dashboard|Trading Dashboard Page Flow]] | accepted code baseline | legacy `tradingDashboard`: monitor Trading PB/SB/deals, ex-VAT GP, unmatched, AR/AP; Trading does not affect stock on hand/WAC | add source document links and aging buckets |
| `/trading/matching` | Trading Matching | [[Trading Flow]], [[page-flows/trading-po-reports-trading-matching|Trading Matching Page Flow]] | accepted code baseline | legacy `tradingMatching`: match Trading PB to Trading SB, calculate GP before VAT, reverse by marking Cancelled | finish durable match write/reverse API and audited duplicate cleanup |
| `/po-reports/outstanding` | PO ซื้อ/ขาย คงเหลือ | [[Trading Flow]], [[page-flows/trading-po-reports-po-reports-outstanding|PO Outstanding Page Flow]], [[Purchase Flow]], [[PO Sell Flow]] | accepted code baseline | legacy `poOutstanding`: outstanding PO Buy and PO Sell commitments with remaining qty/value and delivery aging | add server-side filters/export, source usage links, and close-short ownership |

## Reports

| Route | Page | Detailed doc | Current Next | Flow baseline | Gap |
|---|---|---|---|---|---|
| `/reports` | รายงานทั้งหมด | [[Main Dashboard Reports Flow]], [[page-flows/reports-reports|Reports Page Flow]] | accepted code baseline | current `/api/reports/aggregate`: report catalog plus PB/SB aggregate tabs by date range | keep static catalog synced with navigation and decide server-side export |

## Finance / Accounting

| Route | Page | Detailed doc | Current Next | Flow baseline | Gap |
|---|---|---|---|---|---|
| `/finance-accounting/financial-dashboard` | Financial Dashboard | [[Finance Accounting Flow]] | accepted code baseline | current `GET /api/finance-accounting/financial-dashboard`: management dashboard from operational accounting helpers | reconcile with transaction-ledger/accounting model |
| `/finance-accounting/cash-flow-analysis` | Cash Flow Analysis | [[Finance Accounting Flow]] | accepted code baseline | current `GET /api/finance-accounting/cash-flow-analysis`: profit vs cash and cash pressure explanation | lock formulas and source drilldowns |
| `/finance-accounting/cf-forecast-calendar` | CF Forecast Calendar | [[Finance Accounting Flow]] | accepted code baseline | current `GET /api/finance-accounting/cf-forecast-calendar`: forecast from AR/AP/loan/tax assumptions | connect due-date facts and manual forecast rows |
| `/finance-accounting/working-capital` | Working Capital Analysis | [[Finance Accounting Flow]] | accepted code baseline | current `GET /api/finance-accounting/working-capital`: CCC, AR/AP, inventory and turnover view | define period cutoffs and inventory valuation source |
| `/finance-accounting/stock-finance` | Stock Finance Analysis | [[Finance Accounting Flow]] | accepted code baseline | current `GET /api/finance-accounting/stock-finance`: stock finance risk from stock/payment facts | reconcile with stock balance and AP payment facts |
| `/finance-accounting/profit-leak` | Profit Leak Dashboard | [[Finance Accounting Flow]] | accepted code baseline | current `GET /api/finance-accounting/profit-leak`: leakage rules from period performance | define exact rule list and severity |
| `/finance-accounting/tax-vat-wht` | Tax / VAT / WHT | [[Finance Accounting Flow]] | accepted code baseline | current `GET /api/finance-accounting/tax-vat-wht`: transaction tax baseline, not filing ledger | connect to VAT/WHT settings and document status |
| `/finance-accounting/pl-statement` | งบกำไรขาดทุน | [[Finance Accounting Flow]] | accepted code baseline | current `GET /api/finance-accounting/pl-statement`: management P&L from operational facts | finalize GL/posting or report-derived policy |
| `/finance-accounting/balance-sheet` | งบดุล | [[Finance Accounting Flow]] | accepted code baseline | current `GET /api/finance-accounting/balance-sheet`: management balance sheet from operational/asset/loan/equity facts | define balancing and opening balance rules |
| `/finance-accounting/cash-flow-statement` | งบกระแสเงินสด | [[Finance Accounting Flow]] | accepted code baseline | current `GET /api/finance-accounting/cash-flow-statement`: management cash flow statement | classify every bank movement source |
| `/finance-accounting/asset-register` | Fixed Assets | [[Finance Accounting Flow]] | accepted code baseline | current `GET /api/finance-accounting/asset-register`: read-only asset register with NBV/depreciation summary | implement asset lifecycle write/audit if needed |
| `/finance-accounting/depreciation` | ค่าเสื่อมราคา | [[Finance Accounting Flow]] | accepted code baseline | current `GET /api/finance-accounting/depreciation`: posted depreciation rows and pending assets; run/reverse disabled | define posting/export policy |
| `/finance-accounting/asset-disposal` | จำหน่ายทรัพย์สิน | [[Finance Accounting Flow]] | accepted code baseline | current `GET /api/finance-accounting/asset-disposal`: active asset options and NBV; disposal write disabled | implement disposal write and accounting effect |
| `/finance-accounting/loan-contracts` | Loan / Leasing / BSL | [[Finance Accounting Flow]] | accepted code baseline | current `GET /api/finance-accounting/loan-contracts`: loan contracts/schedules/payments; writes disabled | implement schedule/payment relation |
| `/finance-accounting/loan-dashboard` | Loan Dashboard | [[Finance Accounting Flow]] | accepted code baseline | current `GET /api/finance-accounting/loan-dashboard`: due/overdue/outstanding from loan schedules | connect to contract schedule and bank statement |
| `/finance-accounting/asset-overview` | Net Worth / Track Asset | [[Finance Accounting Flow]] | accepted code baseline | current `GET /api/finance-accounting/asset-overview`: cash/asset/debt overview from Financial Dashboard + Cash & Others | reconcile with statutory balance sheet later |
| `/finance-accounting/equity-maint` | Equity / ทุนจดทะเบียน | [[Finance Accounting Flow]] | accepted code baseline | current `GET /api/finance-accounting/equity-maint`: latest equity row; write disabled | define write permissions and audit |
| `/finance-accounting/opening-balance` | Opening Balance | [[Finance Accounting Flow]] | accepted code baseline | current `GET /api/finance-accounting/opening-balance`: opening balance row + accounts; save/apply disabled | define cutover lock and adjustment policy |
| `/finance-accounting/historical-data` | Historical Data | [[Finance Accounting Flow]] | accepted code baseline | current `GET /api/finance-accounting/historical-data`: historical monthly rows; save/clear disabled | define import validation and non-mutating historical scope |

## Master Data

| Route | Page | Detailed doc | Current Next | Flow baseline | Gap |
|---|---|---|---|---|---|
| `/master-data/customers` | ลูกค้า | This catalog | CRUD baseline | legacy `mdCustomer`: customer master for SB/RCP/AR/tracking | finish required fields, status lock, import/export |
| `/master-data/salespersons` | พนักงานขาย | This catalog | CRUD baseline | legacy `mdSalesperson`: salesperson master for tracking/commission | define ownership relation to supplier/customer/bill |
| `/master-data/suppliers` | ผู้ขาย | This catalog | CRUD baseline | legacy `mdSupplier`: supplier master for PB/PMT/AP/tracking | finish UI/design parity and status constraints |
| `/master-data/products` | สินค้า | This catalog | CRUD baseline | legacy `mdProduct`: product master, unit, type, images, stock behavior | finish image storage/thumb policy and stock-related validations |
| `/master-data/product-types` | ประเภทสินค้า | This catalog | CRUD baseline | target split from product master setup | define relation to stock/dual-costing categories |
| `/master-data/product-units` | หน่วยสินค้า | This catalog | CRUD baseline | target split from product master setup | define conversion if future multi-unit is needed |
| `/master-data/impurities` | รายการสิ่งเจือปน | [[WTI-WTO Flow]] | CRUD baseline | target impurity master for WTI/WTO deduction lines | enforce active-only selection and history |
| `/master-data/branches` | สาขา | This catalog | CRUD baseline | legacy `mdBranch`: branch/warehouse setup for document numbering and stock | clarify branch vs warehouse split |
| `/master-data/warehouses` | คลัง | This catalog | CRUD baseline | target warehouse master split from branch | define RM/FG/WIP/hold usage flags |
| `/master-data/accounts` | บัญชีเงินบริษัท | [[Daily Cash Flow]] | CRUD baseline | legacy `mdAccount`: cash/bank/FCD/OD account master | enforce account type/subtype and bank statement ownership |
| `/master-data/payment-methods` | วิธีจ่าย/รับเงิน | [[Payment Flow]] | CRUD baseline | legacy `mdPaymentMethod`: payment/receipt method options | map to bank/cash behavior |
| `/master-data/account-subtypes` | ประเภทบัญชีธนาคาร | This catalog | CRUD baseline | target account subtype master | define allowed subtype per account type |
| `/master-data/bank-names` | ชื่อธนาคาร | This catalog | CRUD baseline | target bank name master for accounts/directors/suppliers/customers | define duplicate/code pattern |
| `/master-data/channels` | ช่องทางขาย | [[Sales Flow]] | CRUD baseline | legacy `mdChannel`: purchase/sales channel master | split purchase/sales usage if needed |
| `/master-data/expense-categories` | หมวดค่าใช้จ่าย | [[Daily Cash Flow]] | CRUD baseline | legacy `mdExpense`: expense category master | category filtered by expense type |
| `/master-data/expense-types` | ประเภทค่าใช้จ่าย | [[Daily Cash Flow]] | CRUD baseline | target split from expense category | define category relation and required behavior |
| `/master-data/directors` | พนักงาน / กรรมการ | [[Petty Advance Page Flow]] | CRUD baseline | legacy `mdDirector`: directors/employees/shareholders/related persons for petty advance and accounts | finish person code/type/account requirements |
| `/master-data/machines` | เครื่องจักร | [[Production Flow]] | CRUD baseline | legacy `mdMachine`: machine master for production/utilization | link to production line and utilization reports |
| `/master-data/machine-types` | ประเภทเครื่องจักร | [[Production Flow]] | CRUD baseline | target split from machine master | define relation and active-only selection |
| `/master-data/production-lines` | Production Line | [[Production Flow]] | CRUD baseline | legacy `mdProductionLine`: production line master | link to orders, machines, reports |
| `/master-data/currencies` | สกุลเงิน | This catalog | CRUD baseline | legacy `mdCurrency`: currency master for foreign finance/FCD | define FX relation and active currencies |
| `/master-data/beneficiaries` | ผู้รับเงินต่างประเทศ | This catalog | CRUD baseline | legacy `mdBeneficiary`: overseas beneficiary bank details | connect to foreign transfer/remittance flow |
| `/master-data/remittance-purposes` | วัตถุประสงค์โอน | This catalog | CRUD baseline | legacy `mdRemittancePurpose`: remittance purpose and required docs | connect to foreign transfer validation |

## Admin / System

| Route | Page | Detailed doc | Current Next | Flow baseline | Gap |
|---|---|---|---|---|---|
| `/admin/system-settings` | ตั้งค่าระบบ | This catalog | partial settings | legacy VAT/WHT/system settings | define setting versioning and audit |
| `/admin/company-profile` | ข้อมูลบริษัท | [[Printable Documents]] | partial write | legacy `companyProfile`: company data for printed documents | finish branch/profile print precedence |
| `/admin/transaction-ledger` | Transaction Ledger | [[Daily Cash Flow]], [[Payment Flow]] | read baseline | legacy `transactionLedger`: cash in/out transaction trace | reconcile with bank statement and source document links |
| `/admin/migration-tools` | Backup / Restore | This catalog | admin tool | legacy `backup`: backup/restore/import tools | keep dev-only safeguards and prevent destructive production misuse |
| `/admin/audit` | Audit & Activity Log | [[Document History Table Design]] | read baseline | legacy `audit` and `userActivity`: activity and audit trails | unify auth events, document logs, and user activity |
| `/admin/users-permissions` | Users & Permissions | This catalog | partial admin | legacy `userPermission`: users, roles, menus, actions | enforce Supabase Auth as password source of truth |

## Implementation Follow-up

- [ ] For every row marked `This catalog`, decide whether it needs a dedicated page flow doc before implementation changes.
- [ ] For every read baseline page, document source tables, filters, sorting, row click/detail behavior, export/print behavior, and aging rules where relevant.
- [ ] For every write page, add status/timeline/allocation/reversal rules before expanding runtime behavior.
- [ ] Keep this catalog synced whenever `navigation.ts` changes.
- [ ] Do not document or migrate legacy-only pages unless they are added back into the new menu.
