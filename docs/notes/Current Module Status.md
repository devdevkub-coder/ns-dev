---
title: Current Module Status
aliases:
  - Vue Module Status
  - Current Migration Status
tags:
  - ns-scrap-erp
  - migration/status
  - vue
status: active
created: 2026-05-16
updated: 2026-05-16
---

# Current Module Status

สถานะล่าสุดของ module ที่ถูกย้ายเข้า `old-apps/vue/` โดย `old-apps/legacy/` เป็น archived source เท่านั้น ระบบใหม่ไม่ route, import หรือ execute legacy runtime

## Current Snapshot

- Frontend clone surface ครบตาม inventory/sidebar ที่ตรวจพบแล้ว
- Runtime route ใหม่ไม่ใช้ `/legacy/...` แล้ว เช่น `/daily-report`, `/owner-daily`, `/production/dashboard`, `/admin/audit`
- `LegacyPlaceholderView.vue` และ placeholder route catalog ถูกลบแล้ว
- navigation internals เปลี่ยนจาก `legacyView` / `legacy.*` เป็น `viewKey` และ route names ตามหมวดใหม่
- `npm test` และ `npm run build` ผ่านหลัง route cleanup
- งานถัดไปคือเชื่อม Supabase Auth, protected routes, role/permission mapping และ browser visual review รายหน้า

## Current Pattern

- `old-apps/vue/src/views` ใช้ประกอบหน้าและ route-level orchestration
- `old-apps/vue/src/components` ใช้ UI reusable เช่น form/table
- `old-apps/vue/src/schemas` ใช้ Zod validate payload และ row shape
- `old-apps/vue/src/services` ใช้ Supabase access และ preview-mode fallback
- `old-apps/vue/src/queries` ใช้ TanStack Query key, query, mutation และ invalidation
- write flow ที่เริ่มทำแล้วใช้ preview-mode in-memory mutation เมื่อยังไม่มี Supabase env
- visual baseline ใช้ Sarabun, slate background, white panels, table/card styling และ form input styling ที่อิงจาก legacy UI แต่ไม่ import หรือ execute legacy runtime

## Module Status

| Module | Route | Status | Notes |
|---|---|---|---|
| Branches | `/master-data/branches` | CRUD/form mutation pilot | create/edit, active/inactive, Zod form validation, query invalidation |
| Warehouses | `/master-data/warehouses` | CRUD/FK form mutation pilot | create/edit, active/inactive, branch select จาก branches query |
| Customers | `/master-data/customers` | CRUD/form mutation pilot | create/edit, active/inactive, branch scope, salesperson select, credit fields |
| Suppliers | `/master-data/suppliers` | Read-only pilot | ยังไม่ทำ form/mutation, duplicate strategy ยังไม่นิยาม |
| Salespersons | `/master-data/salespersons` | Read-only pilot | ใช้ support customer ownership |
| Products | `/master-data/products` | Read-only pilot | product status/unit/metal group read model เท่านั้น |
| Accounts | `/master-data/accounts` | Read-only pilot | ยังไม่นิยาม account mapping และ opening balance final structure |
| Currencies | `/master-data/currencies` | Read-only pilot | ยังไม่ทำ FX rate workflow |
| Expense Categories | `/master-data/expense-categories` | Read-only pilot | ยังไม่ทำ expense flow |
| Channels | `/master-data/channels` | Read-only pilot | รวม purchase/sales channels |

## Pending Decisions

- customer/supplier code strategy
- customer/supplier duplicate detection
- product grade model
- standard cost/price policy
- payment methods target table/schema
- remittance purposes target table/schema
- VAT/WHT flags
- document numbering strategy
- branch/warehouse scope rules
- opening balance structure

## Verification

Latest verified command:

```bash
npm test
npm run build
```

Both commands pass for the current Vue app as of 2026-05-16 after route cleanup.

## Related

- [[docs/migration/09-implementation-tasklist|Implementation Tasklist]]
- [[2026-05-16-project-decisions|Project Decisions]]
- [[Architecture Map]]
