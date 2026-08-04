# SIT Department Role Access Test — 2026-08-04

Scope: `sorting_department` and `production_department` only. Super Admin evidence is excluded. Passwords, tokens, user names, and business row data are not recorded.

## Inventory and expected contract

| Surface | Sorting department | Production department | Forbidden for both |
|---|---|---|---|
| WTI/WTO list/dashboard | view | view | — |
| WTI/WTO create/update/confirm/cancel/share | allow | allow | — |
| WTI/WTO to Purchase/Sales Bill handoff | deny; no `daily.weight_tickets.open_bill` | deny; no `daily.weight_tickets.open_bill` | open-bill action |
| Production order list/create/input/input-return/output/reverse/complete/cancel/export | deny | allow | sorting role |
| Production dashboard/report | deny | allow | sorting role |
| Stock menus and stock write APIs | deny | deny after removing `stock.ledger.view` | stock.ledger.view |
| Purchase Bill / Sales Bill list, create, update, cancel | deny | deny | all `purchase.bills.*` / `sales.bills.*` |

## Test results

| # | Testcase | Expected | Evidence | Status |
|---:|---|---|---|---|
| 1 | Central mapping for `/api/production/orders/product-stock` | `production.orders.view`; sorting denied, production allowed | `navigation-page-permissions.test.ts`, API route test | ✅ 3 focused suites / 15 tests |
| 2 | Production output void guard | `production.orders.reverse`, not broad output permission | route regression test | ✅ |
| 3 | SIT role grants and scopes | sorting=2 users, production=6 users, scope `all`; production landing grant present | controlled SIT postflight | ✅ |
| 4 | SIT forbidden role grants | zero stock/open-bill/Purchase/Sales role grants | controlled SIT postflight | ✅ |
| 5 | SIT forbidden direct user overrides | zero for users assigned either department role | controlled SIT postflight | ✅ |
| 6 | Deployed runtime commit | Vercel SIT READY on `991d1349` | deployment `dpl_DiLtdiCAUvnmyr42gM4gMZnf3yun` | ✅ |
| 7 | Browser/API matrix with sorting department | authenticated non-admin session and protected pages/APIs deny outside scope; WTI open-bill flags false | available session resolved to `system_admin` / `isAdmin=true` | ⏸ blocked; admin evidence discarded |
| 8 | Browser/API matrix with production department | authenticated non-admin session allows production actions and denies stock/bills/open-bill | no separate non-admin credential available in local SIT env | ⏸ blocked |

What is what: database role grants and route guards define the security boundary; the sidebar and WTI/WTO action menu are presentation of that same boundary. Why it has to be like this: a page HTTP 200 or a hidden button is not sufficient evidence when the API can still be called, so both role identity and authenticated API status must be captured with non-admin sessions. A Super Admin session is intentionally not a substitute.
