# Coordinator Role Permission Flow (SIT)

## Scope and business rationale

This note records the coordinator role as it exists on the SIT baseline. A coordinator can operate daily purchasing, sales, stock and selected master-data flows, but must not approve/pay bills, open bills from WTI/WTO, or obtain unrelated shared-reference access. The menu is only the first boundary; the proxy and each API route must enforce the same contract because a user can call an API without using the visible button.

The business entities are:

- WTI (`weight_tickets`, `doc_type=WTI`): receipt evidence used to create a stock purchase bill.
- WTO (`weight_tickets`, `doc_type=WTO`): delivery evidence used to create a stock sales bill.
- Purchase/sales bills: financial documents created from those source documents or from the supported trading flow.
- Coordinator role/user: the role grants listed below; user-level overrides and branch scope remain separate checks.

`daily.weight_tickets.open_bill` is therefore an action permission, not a page-view permission. The WTI/WTO list API exposes `canOpenPurchaseBill` and `canOpenSalesBill`, while the purchase and sales bill creation APIs enforce the same permission again. Existing bill update/cancel permissions do not implicitly grant opening a new bill from a ticket.

## SIT role and menu inventory

Evidence is from the active `coordinator` role on SIT, not Super Admin: 5 active users, branch scope `all`, 0 explicit branch-access rows, and 49 active role-permission rows. The role has no `master.reference.view` and no `daily.weight_tickets.open_bill`.

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
| พนักงานขาย | `/master-data/salespersons` | `master.salespersons.view` | เห็นแบบอ่าน |
| ลูกค้า | `/master-data/customers` | `master.customers.view` | เห็น |
| ผู้ขาย | `/master-data/suppliers` | `master.suppliers.view` | เห็น |
| สินค้า / ประเภท / หน่วย | `/master-data/products`, `/master-data/product-types`, `/master-data/product-units` | page-specific `*.view` | เห็น |
| รายการสิ่งเจือปน | `/master-data/impurities` | `master.impurities.view` | เห็น |
| Finance, payment, approval, admin, unrelated reports and other master data | various | separate permissions | ไม่เห็น |

## Menu → API → action → permission matrix

| Menu/flow | API boundary | Actions checked | Permission contract |
|---|---|---|---|
| Customer | `/api/master-data/customers`, `/options`, `/thai-address` | view, create, update, status, export, import | view; create/update/status; export; import uses create; Thai address is customer-view OR supplier-view |
| Supplier | `/api/master-data/suppliers`, `/options`, `/export`, `/import` | view, create, update/status, export, import | supplier view/create/update/status/export; import uses create |
| Product | `/api/master-data/products`, `/options`, `/export`, `/import` | view, create, update, status, export, import | product view/create/update/status/export; import uses create |
| Product type / unit | `/api/master-data/product-types`, `/product-units` | view and supported simple-master actions | page-specific `master.product_types.view` / `master.product_units.view`; no generic reference grant |
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

The coordinator role must not receive these as a workaround: `master.reference.view`, `daily.weight_tickets.open_bill`, `finance.cash.view`, `purchase.bills.approve`, `purchase.bills.pay`, `sales.bills.approve`, `sales.bills.receive`, or unrelated report/admin permissions. A 403 from an API must be traced to its route/action contract, not fixed with a broad master permission.

## Regression and SIT test matrix

| Testcase | Scope | Expected result | Result |
|---|---|---|---|
| PERM-01 | `permissionForPath` for coordinator-visible pages | each page maps to its page-specific view permission | PASS |
| PERM-02 | master options and Thai address mapping | customer/supplier-specific permissions; no generic reference fallback | PASS |
| PERM-03 | coordinator role inventory on SIT | 5 active users, all-branch role, 0 branch rows, 49 permissions; forbidden list absent | PASS |
| PERM-04 | WTI/WTO list capability response | `canOpenPurchaseBill`/`canOpenSalesBill` false without `open_bill` | PASS in code contract; browser UAT still needs the daily ticket page rerun |
| PERM-05 | WTI-based purchase bill POST | direct API call is rejected by `daily.weight_tickets.open_bill` before write | PASS |
| PERM-06 | WTO-based sales bill POST | direct API call is rejected by `daily.weight_tickets.open_bill` before write | PASS |
| PERM-07 | manual Trading sales bill | no WTI/WTO source means `open_bill` is not inferred | PASS |
| PERM-08 | build baseline | lint, type-check, build and diff check pass | PASS; build rerun after final code change |
| UAT-01 | coordinator login and `/api/auth/me` on SIT | login and auth context 200; no Super Admin evidence | PASS: roles `[coordinator]`, 49 permissions |
| UAT-02 | coordinator menu and page APIs on SIT | visible pages match inventory; 400 validation is not called a permission failure | PASS after runtime fix: menu/session was coordinator-only; page APIs and dependencies were swept on SIT |
| UAT-03 | full coordinator action matrix on SIT | every visible API action reaches its intended permission guard; malformed/fake input must stop at 400/404 without a write | PASS: coordinator session returned 200/400/404 for granted actions; stock-source bill opening, payment approval, payments, branches/warehouses and unsupported master writes returned the expected 403 |
| UAT-04 | import and product-options regression | import guard accepts multipart input and rejects invalid file input with 400; product options must serialize successfully | PASS: all three import guards returned 400 for an invalid multipart field; `/api/master-data/products/options` returned 200 after BigInt id serialization fix |

## Browser QA findings requiring follow-up

The full coordinator smoke on SIT used `watcharathat@9stepsdigital.com` and confirmed `/api/auth/me` is coordinator-only (`isAdmin=false`, role `coordinator`, 49 permissions). The browser page initially hit a Vercel Security Checkpoint after the first high-volume probe, so the final matrix used the same authenticated Playwright request context rather than treating the checkpoint as an application 403. Read-only APIs and exports returned 200 except the intentionally incomplete `stock-options` query, which returned validation 400 and then returned 200 with branch/product options from the page dependencies. Granted create/update/status/confirm/cancel/share/PO/stock actions reached 400/404 validation or fake-record boundaries; stock-source bill creation returned 403 because `daily.weight_tickets.open_bill` is absent. Payment approval, payments, branches and warehouses returned 403 as out of scope. The previously observed product-options 500 was fixed by serializing BigInt option ids and the SIT runtime now returns 200.

The generic master-data client previously rendered create/edit/status controls before checking the action permission, so a direct page visit could show controls even when its backing API returned 403. The client now receives the same permission set used by the sidebar and gates those controls; product type/unit write actions use the existing route contract `master.reference.manage`, while salespersons use their page-specific actions. The API remains authoritative.
