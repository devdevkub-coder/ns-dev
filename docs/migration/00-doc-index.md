# 00 Documentation Index

## Purpose

ไฟล์นี้เป็นสารบัญกลางของเอกสาร NS Scrap ERP เพื่อให้ session ใหม่หรือ agent ใหม่รู้ทันทีว่าควรอ่านอะไรและไฟล์ไหนเป็น source of truth ของเรื่องใด

## Start Here

อ่านตามลำดับนี้ก่อนเริ่มงานใหญ่:

1. `AGENTS.md` - กฎ project, safety, environment, git, validation
2. `docs/migration/00-current-work.md` - สถานะล่าสุดและ next task
3. `REQUIREMENTS_TARGET_SYSTEM.md` - requirements ของระบบเป้าหมาย
4. `docs/migration/17-next-remaining-modules-progress.md` - tracker งานที่เหลือทั้งหมด
5. `docs/agent-rules/README.md` - index ของ rule รายละเอียดเฉพาะงาน
6. `docs/design.md` - design conventions กลางของ active Next app
7. Tracker เฉพาะเรื่องที่เกี่ยวข้องกับงานนั้น

## Canonical Sources

| Topic | Canonical Document | Notes |
|---|---|---|
| Agent/project rules | `AGENTS.md` | hard rules และ entrypoint; ต้องตามก่อน skill/doc อื่น |
| Detailed agent rules | `docs/agent-rules/README.md` | rule เฉพาะเรื่อง เช่น DB, validation, testing, sub agents |
| Target requirements | `REQUIREMENTS_TARGET_SYSTEM.md` | แทนชื่อเดิม `SRS.md`; ใช้เป็น SRS ของระบบใหม่/เป้าหมาย |
| Legacy/prototype requirements | `REQUIREMENTS_LEGACY_PROTOTYPE.md` | แทนชื่อเดิม `NS_Scrap_ERP_System_Requirements.md`; ใช้อ้างอิงระบบเก่า |
| Current work status | `docs/migration/00-current-work.md` | สรุป batch ปัจจุบัน, next task, blockers |
| UI/design conventions | `docs/design.md` | source of truth สำหรับ list/filter/table/pagination/button/wording baseline |
| Page checklist CSV | `docs/page-inventory-checklist.csv` | รายการหน้าสำหรับ assign dev, checklist, และ QA ใน Google Sheets |
| Migration document map | `docs/migration/README.md` | รายการ docs migration ทั้งชุด |
| Remaining module plan | `docs/migration/17-next-remaining-modules-progress.md` | batch/task tree, Playwright rule, OpenAPI/sitemap preflight |
| Next sitemap/API map | `docs/migration/18-next-system-sitemap.md` | route/page/API/permission status baseline for active Next app |
| OpenAPI baseline | `docs/api/openapi.yaml` | skeleton API contract catalog for current Next route handlers |
| Data dictionary | `docs/data-dictionary/` | table/column business meaning for developers; start with `purchase-bills.md` |
| Purchase flow | `docs/notes/Purchase Flow.md` | target purchase flow: Stock/Trading, PO/Spot, ใบรับของ/WTI, ใบส่งของ/WTO numbering, short-close PO, Cost Pool eligibility, quantity/weight entry rules, Thai statuses, PO/PB/Stock effects, and `PB/payable handoff` to Payment Flow |
| WTI/WTO flow | `docs/notes/WTI-WTO Flow.md` | canonical page flow for `/daily/weight-tickets` and `/daily/weight-ticket-list`: create/edit/list/detail/timeline, page-scoped option/product APIs, product thumbnails, image rules, print/share, WTI/WTO statuses, and Purchase/Sales handoff boundaries |
| Stock ledger and stock balance | `docs/notes/Stock Ledger and Stock Balance.md` | canonical stock note that separates `stock_ledger` as movement source of truth from `stock balance` as derived aggregate, including ownership of movement, aggregate keys, and implications for `WTI/WTO/PB/SB` |
| Stock ledger DB/API design | `docs/notes/Stock Ledger DB API Design.md` | DB/API/reversal contract for `stock_ledger`, `stock_holds`, `WTO -> SB`, `SB-CANCEL`, and remaining stock hardening gaps |
| Stock balance page flow | `docs/notes/Stock Balance Page Flow.md` | page-specific contract for `/stock/balance`: derived stock availability, hold-aware `คงเหลือจริง / จองไว้ / พร้อมใช้`, filters, drilldown, export, and current hold aggregation gaps |
| Stock ledger page flow | `docs/notes/Stock Ledger Page Flow.md` | page-specific contract for `/stock/ledger`: movement history, source-document audit, ref type boundaries, and rule that `WTO` holds must not appear as ledger rows |
| Stock transfer page flow | `docs/notes/Stock Transfer Page Flow.md` | page-specific contract for `/stock/transfer`: paired `ST` ledger movement, no-revenue stock transfer, source available/cost preview, doc/date/weight filters, total value, and draft-only edit/cancel policy |
| Stock status convert page flow | `docs/notes/Stock Status Convert Page Flow.md` | page-specific contract for `/stock/status-convert`: paired `SC` RM/FG reclassification for wrong stock classification, ready-stock validation, quantity-only bucket update, no WAC reprice, no production/yield effect, Production reporting source-label boundary, and reconciliation/reverse policy gap |
| Stock convert page flow | `docs/notes/Stock Convert Page Flow.md` | page-specific contract for `/stock/convert`: `GA` grade/product conversion, Cost Pool allocation, target regrade cost pool, source-target quantity/cost policy, loss/yield tracking, and reverse allocation behavior |
| Stock adjust page flow | `docs/notes/Stock Adjust Page Flow.md` | page-specific contract for `/stock/adjust`: `ADJ` stock count/cycle count correction, fixed reason options, 7-day correction window, unit price/kg, signed total value, WAC/margin impact gap, and reverse/correction policy |
| Dual Costing flow | `docs/notes/Dual Costing Flow.md` | category-level Dual Costing source of truth for active menu pages: copper/brass-only scope, Cost Pool -> Allocator -> Match Log/Ledger -> reports, and Deal Cost vs WAC/P&L boundary |
| Purchase bills page flow | `docs/notes/Purchase Bills Page Flow.md` | page-specific contract for `/purchase/bills`: create/edit/cancel PB, Stock/WTI allocation UI, supplier-swap button, void-old/create-new save semantics, ADV release, and the `ประวัติเปลี่ยนบิล Supplier` tab |
| Cost Pool | `docs/notes/Cost Pool.md` | canonical Cost Pool/Dual Costing rule: copper/brass-only eligibility, source types, availability, short-close/reversal behavior, API/read-model contract, and current implementation gap |
| PO Buy page flow | `docs/notes/PO Buy Page Flow.md` | page-specific contract for `/purchase/po-buy`: `POB` commitment only, no stock/AP side effect, close-short, PB allocation boundary, print, aging, and runtime checklist |
| Purchase flow status matrix | `docs/notes/Purchase Flow Status Matrix.md` | cross-flow acceptance matrix for purchase/payment document statuses by use case and step, covering `POB`, `WTI`, `ADV`, `PB`, `PMA`, `PMT`, void PMA, cancel PMT, and source lock rules without moving PMA/PMT ownership into Purchase Flow |
| Payment flow | `docs/notes/Payment Flow.md` | canonical payment/approval flow and owner of source payable lifecycle: `อนุมัติจ่ายเงิน`, split approval items, `รอจ่าย`, `PMA/PMT`, `ADV`, `EXP/ค่าใช้จ่าย`, payment history, and supplier advance refund rules |
| Finance Debt flow | `docs/notes/Finance Debt Flow.md` | category-level Finance & Debt source of truth for active menu pages: Petty Advance, AR, AP, Bank Statement, Cash Position, Customer Advance, snapshot-first AR/AP read models, current APIs, legacy baseline, side-effect boundaries, and open allocation/status gaps |
| Petty advance page flow | `docs/notes/Petty Advance Page Flow.md` | page-specific contract for `/daily/petty-advance` under Finance & Debt: `PADV` outstanding document, `PRET` return flow, bank statement timing, recipient account snapshots, and expense-allocation gap |
| Finance AP page flow | `docs/notes/Finance AP Page Flow.md` | page-specific contract for `/finance/ap`: AP aging from `purchase_bills` balance snapshots, no AP channel filter until purchase channel exists, current no-credit-term aging policy, supplier summary, export, and PMA/PMT/Supplier Advance drilldown gaps |
| Finance AR page flow | `docs/notes/Finance AR Page Flow.md` | page-specific contract for `/finance/ar`: AR aging from `sales_bills` balance snapshots, Sales Bill/Receipt/Customer Advance drilldown, customer credit term/due-date rules, and no Pending Sale summary in target runtime |
| Finance bank statement page flow | `docs/notes/Finance Bank Statement Page Flow.md` | page-specific contract for `/finance/bank`: read-only cash/bank statement ledger, running balance, source refs, export, and admin cleanup boundary |
| Finance cash position page flow | `docs/notes/Finance Cash Position Page Flow.md` | page-specific contract for `/finance/cash-position`: liquidity dashboard from accounts, bank statement, AR/AP exposure, near-due data, and as-of/currency gaps |
| Customer advance page flow | `docs/notes/Customer Advance Page Flow.md` | page-specific contract for `/finance/customer-advance`: current CADV bank-statement read baseline, remaining/used semantics, and target customer advance allocation tables |
| Main Dashboard Reports flow | `docs/notes/Main Dashboard Reports Flow.md` | category-level Main / Dashboard & Reports and `/reports` source of truth: current APIs, query params, source tables/helpers, management-read boundary, and formula/drilldown/export gaps |
| Reporting history snapshot policy | `docs/notes/Reporting History Snapshot Policy.md` | cross-domain rule for historical Dashboard/Report/Tracking data: transaction facts, document snapshots, reporting snapshots, `as_of_date`, and daily/monthly/yearly rollups |
| Finance and accounting menu summary | `docs/notes/Finance And Accounting Menu Summary.md` | readable per-menu summary for both `การเงิน & หนี้` and `Finance / Accounting`: what each page means, primary source/write boundary, AR/AP/Cash/Stock/Asset effects, and month/year close freeze direction |
| Finance Accounting flow | `docs/notes/Finance Accounting Flow.md` | category-level Finance / Accounting source of truth for 21 active menu pages: current APIs/policy UI, query params, source builders/tables, write-disabled design states, management-report boundary, and GL/statutory/tax/asset/loan gaps |
| Fixed Assets workflow | `docs/notes/Fixed Assets Workflow.md` | Detailed business workflow, rules, math calculations, and database structures for Fixed Asset lifecycle |
| Trading flow | `docs/notes/Trading Flow.md` | category-level Trading / PO Reports source of truth for active menu pages: Trading Dashboard as trader/operator monitor, Trading Matching, PO Outstanding, ex-VAT GP, Sales Bill-led Trading allocation, Matched COGS, buy-side remaining cost, PO commitment report, current APIs, and no-stock-ledger side-effect boundary |
| Tracking 360 flow | `docs/notes/Tracking 360 Flow.md` | category-level Tracking 360 source of truth for Customer, Supplier, and Product tracking: current APIs, legacy drilldown baseline, source tables, export contracts, no-side-effect boundary, and source drilldown gaps |
| Printable documents | `docs/notes/Printable Documents.md` | canonical backlog/contract for business documents that need print/Save as PDF: `PB`, `SB`, `WTI/WTO`, `PMA`, `PMT`, `RV`, `RCP`, including payment-history print statuses |
| Receipt voucher page flow | `docs/notes/Receipt Voucher Page Flow.md` | page-specific contract for `/purchase/receipt-vouchers`: cash-only Supplier-signed `RV` evidence, legacy PB pre-fill behavior, print snapshot, source/payment boundary, and distinction from customer receipt `RCP` |
| Purchase flow test matrix | `docs/notes/Purchase Flow Test Matrix.md` | execution/UAT matrix for Purchase Flow: PO Buy, WTI, Purchase Bill, payment approval, supplier payment, payment rollback, and stock impact/reversal |
| WTI product summary design | `docs/notes/WTI Product Summary Design.md` | canonical design note for keeping raw weighing lots plus per-product summary rows under WTI/WTO, and for making Purchase Bill consume summary rows instead of raw `weight_ticket_lines` |
| Document timeline policy | `docs/notes/Document Timeline Policy.md` | platform rule for every business document with a user-facing document number to have append-only timeline/history separate from the current-state table |
| Document history table design | `docs/notes/Document History Table Design.md` | target schema decision that business timeline/history tables are separated by document/flow (`*_status_logs`, `*_usage_logs`, allocation facts) instead of one generic `document_events` table |
| Document aging policy | `docs/notes/Document Aging Policy.md` | target read-model/report rule for aging `PB/SB/WTI/WTO/POB/POS`, separating financial due aging from operational pending aging and defining buckets, stop-counting rules, and API direction |
| System supporting flows | `docs/notes/System Supporting Flows.md` | non-business platform flow contract for auth/session, users, permissions, branch scope, audit/activity, company profile, and health APIs, kept separate from business page-flow files |
| P0 transaction stock payment current code baseline | `docs/notes/P0 Transaction Stock Payment Current Code Baseline.md` | accepted implementation baseline for current Next transaction/stock/payment pages and APIs; records critical runtime gaps before target-complete behavior |
| Master data current code baseline | `docs/notes/Master Data Current Code Baseline.md` | accepted decision that current Next master-data code is correct and is the baseline for master-data page-flow docs, without waiting for legacy proof |
| P1 finance production current code baseline | `docs/notes/P1 Finance Production Current Code Baseline.md` | accepted decision that current Next finance/production/daily read-model pages and APIs for P1 are the baseline; remaining work is source/cutoff/status/write-side-effect reconciliation when behavior changes |
| P2 report current code baseline | `docs/notes/P2 Report Current Code Baseline.md` | accepted decision that current Next report/read-model pages and APIs for P2 are the baseline; remaining work is formula/source/cutoff reconciliation when reports change |
| Menu page flow catalog | `docs/notes/Menu Page Flow Catalog.md` | active-menu-only catalog for all 107 routes in `apps/next/src/lib/navigation.ts`, linking detailed docs where they exist and using legacy flow as baseline only for active new-menu pages without a complete Next flow |
| Page flow index | `docs/notes/page-flows/README.md` | per-page flow index and one page-flow file for each of the 107 active menu routes; all files now include minimum detailed contract sections covering responsibilities, lifecycle/read flow, API/data contract, validation/status rules, side effects, gaps, and implementation checklist |
| Page flow proof tracker | `docs/notes/Page Flow Proof Tracker.md` | proof/reconciliation tracker after page-flow coverage; P0/P1/P2/P3 active menu groups are now accepted/current-code proof baseline; remaining work is P0 runtime hardening |
| Sales flow | `docs/notes/Sales Flow.md` | target sales flow: PO Sell, ใบส่งของ/WTO with pending_out, Trading sales bill from purchase bills/Trading lines without stock-out, Sales Bill, Receipt, generated document numbers, Thai statuses, stock and AR effects |
| Customer receipt page flow | `docs/notes/page-flows/daily-transactions-sales-receipts.md` | page-specific contract for `/sales/receipts`: customer payment `RCP`, multi-SB allocation, partial/full receipt, AR/SB balance recalculation, bank statement money-in, cancel-and-reissue edit policy, and API/DB optimization notes |
| Pending sale page flow | `docs/notes/Pending Sale Page Flow.md` | removed target-flow note for `/sales/stock-issue`: legacy `PSALE` reference only; target runtime uses `WTO -> pending_out -> Sales Bill` and stock-issue API returns 410 |
| PO Sell flow | `docs/notes/PO Sell Flow.md` | page-specific contract for `/sales/po-sell`: create status, match status, downstream visibility in planning summaries, Cost Allocator, PO Outstanding, Sales Bill/WTO handoff, and current gaps |
| Production flow | `docs/notes/Production Flow.md` | canonical production category flow: production order/input/output/process cost/WIP/yield-loss, stock ledger refs `PI/PO2`, current read baseline, and write-flow gaps |
| Production order DB/API design | `docs/notes/Production Order DB API Design.md` | detailed MVP write contract for `/production/orders`: simplified status flow, no-approval/no-fallback rules, additive DB design, `PI/PO2` ledger mapping, write APIs, reconciliation checks, and P3 task breakdown |
| Daily cash flow | `docs/notes/Daily Cash Flow.md` | target daily cash/bank flow for `/daily/transfer` and related money-moving daily documents, including system-managed transfer fields and bank statement side effects |
| Expense dashboard flow | `docs/notes/Expense Dashboard Flow.md` | page-specific read-only dashboard contract for `/daily/expense-dashboard`: legacy category/month calculation, anomaly thresholds, UI wording, and validation checklist |
| Legacy page inventory | `docs/migration/20-legacy-page-inventory.md` | counted legacy sidebar entries and view IDs from `https://sirimasth.github.io/ns-scrap-erp/` |
| Next design audit plan | `docs/migration/22-next-design-audit-plan.md` | active Next sidebar design audit plan and static findings against `docs/design.md` |
| Environment status | `docs/migration/10-environment-status.md` | Supabase/Vercel/MCP/env |
| Master data | `docs/migration/13-next-master-data-progress.md` | Next master-data tracker |
| Auth/permission | `docs/migration/14-auth-permission-batch-plan.md` | login, users, roles, permissions |
| Daily transactions | `docs/migration/15-next-daily-transactions-progress.md` | purchase/sales/daily/finance linked flows |
| Production | `docs/migration/16-next-production-progress.md` | production pages/categories/reports |

## Requirements Documents

- `REQUIREMENTS_TARGET_SYSTEM.md`
  - ระบบเป้าหมายและ SRS ปัจจุบัน
  - ใช้ยืนยัน scope, module, roles, NFR, target architecture
  - อัปเดตเมื่อ flow ที่ยืนยันแล้วเปลี่ยน requirement
- `REQUIREMENTS_LEGACY_PROTOTYPE.md`
  - เอกสารระบบเก่า/prototype
  - ใช้อ้างอิง behavior, menus, roles, offline/local behavior เดิม
  - ไม่ใช่ source of truth ของ target architecture

## Agent Rule Documents

| File | Use For |
|---|---|
| `docs/agent-rules/README.md` | index rule รายละเอียด |
| `docs/agent-rules/configuration.md` | project config, MCP, skills, secrets |
| `docs/agent-rules/database.md` | DB design, Supabase environments, migration safety |
| `docs/agent-rules/development.md` | active app, legacy source, migration priority |
| `docs/agent-rules/validation.md` | form/API syntax validation, master data list pattern |
| `docs/agent-rules/testing.md` | test/QA, Playwright, click-path checks |
| `docs/agent-rules/sub-agents.md` | sub agent usage and close rules |
| `docs/agent-rules/session-handoff.md` | resumable checkpoint documentation |
| `docs/agent-rules/git-communication.md` | git and communication rules |

## Migration Trackers

| File | Use For |
|---|---|
| `01-current-state.md` | baseline ระบบเดิมและปัญหา |
| `02-master-plan.md` | migration master plan |
| `03-target-architecture.md` | target architecture |
| `04-master-data-definition.md` | master/key basic data definitions |
| `05-schema-mapping.md` | schema mapping |
| `06-module-rollout.md` | rollout order |
| `07-reconciliation-plan.md` | reconciliation checks |
| `08-cutover-plan.md` | cutover/backout |
| `09-implementation-tasklist.md` | phase tasklist หลัก |
| `10-environment-status.md` | environment/MCP/status |
| `11-frontend-clone-tracker.md` | legacy route clone tracker |
| `12-frontend-visual-audit-checklist.md` | visual/browser QA |
| `13-next-master-data-progress.md` | master data progress |
| `14-auth-permission-batch-plan.md` | auth/permission progress |
| `15-next-daily-transactions-progress.md` | daily transaction progress |
| `16-next-production-progress.md` | production progress |
| `17-next-remaining-modules-progress.md` | remaining module batch/task tree |
| `18-next-system-sitemap.md` | Next route/page/API/permission status map |
| `19-next-legacy-ui-parity-audit.md` | post-SYS legacy UI parity audit excluding master-data/admin |
| `20-legacy-page-inventory.md` | legacy sidebar page count and view ID inventory |
| `21-db-first-identifier-cutover.md` | DB-first identifier cutover tracker, inventory, and wave log |
| `22-next-design-audit-plan.md` | active Next sidebar design audit plan and route findings |

## Planned Documents

Batch PRE created:

- `docs/migration/18-next-system-sitemap.md`
- `docs/api/openapi.yaml`

## Naming Rules

- ใช้ prefix เลขสำหรับ migration docs ที่เป็นลำดับอ่านหรือ tracker: `00-`, `01-`, ...
- Requirements ที่เป็น root-level ให้ใช้ชื่อชัดเจน:
  - `REQUIREMENTS_TARGET_SYSTEM.md`
  - `REQUIREMENTS_LEGACY_PROTOTYPE.md`
- Tracker เฉพาะหมวดใช้รูปแบบ:
  - `NN-next-<module>-progress.md`
- เอกสารที่เป็นสถานะปัจจุบันต้องมีคำว่า `current` และอัปเดตบ่อยได้
