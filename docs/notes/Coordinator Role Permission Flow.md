# Coordinator Role Permission Flow (SIT)

## Scope and business rationale

This note records the coordinator role as it exists on the SIT baseline. A coordinator can operate every action exposed by the visible daily, purchasing, sales, stock and selected master-data menus, including opening bills from WTI/WTO and writing product type/unit and salesperson masters. Finance payment/approval pages and unrelated shared-reference pages remain hidden. The menu is only the first boundary; the proxy and each API route must enforce the same contract because a user can call an API without using the visible button.

The business entities are:

- WTI (`weight_tickets`, `doc_type=WTI`): receipt evidence used to create a stock purchase bill.
- WTO (`weight_tickets`, `doc_type=WTO`): delivery evidence used to create a stock sales bill.
- Purchase/sales bills: financial documents created from those source documents or from the supported trading flow.
- Coordinator role/user: the role grants listed below; user-level overrides and branch scope remain separate checks.

`daily.weight_tickets.open_bill` is therefore an action permission, not a page-view permission. The WTI/WTO list API exposes `canOpenPurchaseBill` and `canOpenSalesBill`, while the purchase and sales bill creation APIs enforce the same permission again. Existing bill update/cancel permissions do not implicitly grant opening a new bill from a ticket.

## SIT role and menu inventory

Evidence is from the active `coordinator` role on SIT, not Super Admin: branch scope `all`, 0 explicit branch-access rows, and 59 active role-permission rows after the visible-menu grant migration. The role still has no `master.reference.view` or `master.reference.manage`.

| Menu | Path | Required permission | Coordinator result |
|---|---|---|---|
| วางแผนการขาย (LME) | `/sales-plan` | `reports.sales_plan.view` | เห็น |
| วิเคราะห์แผนขาย | `/sales-plan-analysis` | `reports.sales_plan_analysis.view` | เห็น |
| บิลรับซื้อ | `/purchase/bills` | `purchase.bills.view` | เห็น |
| บิลขาย | `/sales/bills` | `sales.bills.view` | เห็น |
| Dashboard / รายการใบรับ-ส่งของ | `/daily/weight-ticket-dashboard`, `/daily/weight-ticket-list` | `daily.weight_tickets.view` | เห็น |
| โอนสินค้า / Stock / ปรับสถานะ / ปรับเกรด / นับสต๊อก | `/stock/*` | `stock.ledger.view` | เห็น |
| PO Buy | `/purchase/po-buy` | `purchase.po_buy.view` | เห็น |
| PO Sell | `/sales/po-sell` | `sales.po_sell.view` | เห็น |
| พนักงานขาย | `/master-data/salespersons` | `master.salespersons.view` | เห็นและจัดการ |
| ลูกค้า | `/master-data/customers` | `master.customers.view` | เห็น |
| ผู้ขาย | `/master-data/suppliers` | `master.suppliers.view` | เห็น |
| สินค้า / ประเภท / หน่วย | `/master-data/products`, `/master-data/product-types`, `/master-data/product-units` | page-specific `*.view` และ resource/action ของแต่ละหน้า | เห็นและจัดการ |
| รายการสิ่งเจือปน | `/master-data/impurities` | `master.impurities.view` | เห็น |
| Finance, payment, approval, admin, unrelated reports and other master data | various | separate permissions | ไม่เห็น |

## Menu → API → action → permission matrix

| Menu/flow | API boundary | Actions checked | Permission contract |
|---|---|---|---|
| Customer | `/api/master-data/customers`, `/options`, `/thai-address` | view, create, update, status, export, import | view; create/update/status; export; import uses create; Thai address is customer-view OR supplier-view |
| Supplier | `/api/master-data/suppliers`, `/options`, `/export`, `/import` | view, create, update/status, export, import | supplier view/create/update/status/export; import uses create |
| Product | `/api/master-data/products`, `/options`, `/export`, `/import` | view, create, update, status, export, import | product view/create/update/status/export; import uses create |
| Product type / unit | `/api/master-data/product-types`, `/product-units` | view, create, update, status | page-specific `master.product_types.*` / `master.product_units.*`; no generic reference grant |
| Impurity | `/api/master-data/impurities` | view, create, update, status | `master.impurities.view/create/update/status` |
| Sales plan | `/api/sales-plan` | view and the existing plan-write actions | `reports.sales_plan.view` by current contract; no new action code inferred |
| Sales-plan analysis | page and shared sales-plan reader | view | `reports.sales_plan_analysis.view` for page; shared API uses its mapped report permissions |
| WTI/WTO | `/api/daily/weight-tickets`, `/options`, `/products`, `/stock-options`, dashboard | view, create, update, confirm, cancel, share, export | view/create/update/confirm/cancel/share; export is view; open bill requires separate `daily.weight_tickets.open_bill` |
| Purchase bill | `/api/purchase/bills`, `/options` | view, create, update, cancel, export | `purchase.bills.view/create/update/cancel`; export is view; WTI-based create additionally requires `daily.weight_tickets.open_bill` |
| Sales bill | `/api/sales/bills`, `/options` | view, create, update, cancel, export | `sales.bills.view/create/update/cancel`; WTO-based create additionally requires `daily.weight_tickets.open_bill` |
| PO Buy | `/api/purchase/po-buy` | view, create, update, cancel, short-close | `purchase.po_buy.view/create/update/cancel/short_close` |
| PO Sell | `/api/sales/po-sell` | view, create, update, cancel, short-close | `sales.po_sell.view/create/update/cancel/short_close` |
| Stock | `/api/stock/transfer`, `/balance`, `/ledger`, `/status-convert`, `/convert`, `/adjust` | view and current stock actions | `stock.ledger.view`; custom financial cost action remains separately protected |

## Explicitly excluded permissions

The coordinator role must not receive these as a workaround: `master.reference.view`, `master.reference.manage`, `finance.cash.view`, `purchase.bills.approve`, `purchase.bills.pay`, `sales.bills.approve`, `sales.bills.receive`, or unrelated report/admin permissions. `daily.weight_tickets.open_bill` is explicitly granted because it is an action on the visible WTI/WTO menu. A 403 from an in-scope API is a failure; a hidden finance API remains out of scope and must not be enabled indirectly.

## Regression and SIT test matrix

| Testcase | Scope | Expected result | Result |
|---|---|---|---|
| PERM-01 | `permissionForPath` for coordinator-visible pages | each page maps to its page-specific view permission | PASS |
| PERM-02 | master options and Thai address mapping | customer/supplier-specific permissions; no generic reference fallback | PASS |
| PERM-03 | coordinator role inventory on SIT | 5 active users, all-branch role, 0 branch rows, 59 permissions; forbidden list absent | PASS |
| PERM-04 | WTI/WTO list capability response | `canOpenPurchaseBill`/`canOpenSalesBill` true for coordinator | PASS after SIT grant |
| PERM-05 | WTI-based purchase bill POST | valid in-scope action is not rejected by `daily.weight_tickets.open_bill` | PASS: Trading and STOCK create/update/cancel fixtures returned 2xx |
| PERM-06 | WTO-based sales bill POST | valid in-scope action is not rejected by `daily.weight_tickets.open_bill` | PASS with full UI payload; omitted optional `deliveryTicketDocNo` needs runtime rerun after `7cb1cdbf` deployment |
| PERM-07 | manual Trading sales bill | no WTI/WTO source means `open_bill` is not inferred | PASS |
| PERM-08 | build baseline | lint, type-check, build and diff check pass | PASS for local lint/type-check/diff check after final code change; build remains to rerun with the final commit |
| UAT-01 | coordinator login and `/api/auth/me` on SIT | login and auth context 200; no Super Admin evidence | PASS: roles `[coordinator]`, 59 permissions after grant |
| UAT-02 | coordinator menu and page APIs on SIT | visible pages match inventory; 400 validation is not called a permission failure | PASS after runtime fix: menu/session was coordinator-only; page APIs and dependencies were swept on SIT |
| UAT-03 | full coordinator action matrix on SIT | every visible API action reaches its intended permission guard; valid happy paths must not return 403/400/404 | PASS for valid CRUD/status/confirm/cancel/open-bill/PO/import/export fixtures; 22 reads and 6 XLSX exports 2xx. `notify-line` is blocked by `NO_TARGETS_ROUTED` configuration. Omitted WTO display-doc field awaits runtime deployment rerun. |
| UAT-04 | import and product-options regression | import guard accepts multipart input and rejects invalid file input with 400; product options must serialize successfully | PASS on rerun: all three import guards returned 400 for an invalid multipart field; `/api/master-data/products/options` returned 200 |

## Browser QA findings requiring follow-up

The coordinator smoke on SIT uses `watcharathat@9stepsdigital.com` and must confirm coordinator-only (`isAdmin=false`) after each auth refresh. A browser security checkpoint is not an application permission result. The acceptance rerun must use valid, reversible business fixtures: visible read/export APIs return 200; create/update/status/confirm/cancel/share/open-bill/PO/stock actions must complete with 2xx; validation 400, fake-id 404 and any 403 are failures when used on the happy path. Payment approval, payments, branches and warehouses remain hidden and are not evidence for this role. Product options must remain 200 after the BigInt serialization fix.

The generic master-data client previously rendered create/edit/status controls before checking the action permission, so a direct page visit could show controls even when its backing API returned 403. The client now receives the same permission set used by the sidebar and gates those controls; product type/unit write actions now use resource-scoped `master.product_types.*` / `master.product_units.*` permissions, while salespersons use their page-specific actions. The API remains authoritative.

## SIT browser rerun evidence — 2026-08-04

The fresh browser session used only `watcharathat@9stepsdigital.com` with role `coordinator`; `/api/auth/me` returned `200`, `isAdmin=false`, 59 permissions, and no `master.reference.view`. The visible operational read sweep covered 22 APIs and returned 2xx. The six visible operational exports used the page contract `?format=xlsx` and returned `200` with XLSX content. Valid import fixtures for customers, products, and suppliers each reported one successful insert. Reversible master CRUD/status, WTI create/update/confirm/status, purchase/sales bill create/update/cancel, PO Buy/Sell create/update/cancel/short-close, and stock flow fixtures returned 2xx.

The user-facing contract treats every valid 403/400/404 as failure. The remaining runtime follow-up is the valid Sales STOCK request that omits the duplicated optional `deliveryTicketDocNo`; commit `7cb1cdbf` defaults it from `deliveryTicketId`, but SIT deployment evidence still points to `faaa7d7d`, so this case is not marked PASS until the new deployment is observed and the fixture is rerun. `notify-line` returned `400 NO_TARGETS_ROUTED` because SIT has no configured recipient target; no notification was sent.
