# Access Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เปลี่ยนการควบคุมสิทธิ์จาก permission กลางแบบกว้าง ไปเป็น Access Control Module ที่แยกผู้ใช้งาน, Role, Permission และ action สำคัญ โดยคง flow ปัจจุบันและไม่เพิ่มวงเงินอนุมัติ

**Architecture:** ใช้ `app_roles`, `app_permissions`, `app_user_roles` และ `app_user_permission_overrides` เป็น source of truth เดิม แล้วเพิ่ม helper กลางสำหรับ effective permission, action authorization และ branch scope การจัดการผู้ใช้งานกับการจัดการ policy แยกสิทธิ์กันใน API และ UI โดยคง `/admin/users` กับ `/admin/roles-permissions` เป็น URL เดิมและใช้ visual shell ร่วมกัน

**Tech Stack:** Next.js App Router, React, TypeScript, Prisma 7, PostgreSQL/Supabase, Zod, Vitest, ESLint

## Global Constraints

- ใช้ `dev-target` Supabase สำหรับ schema และ migration; ห้ามพัฒนาโดยตรงกับ `legacy-prod-source`
- ห้ามเพิ่ม fallback, hardcode permission, skip-row หรือ silent coercion เมื่อไม่พบ permission/scope
- API ต้องตรวจ authentication, permission, branch scope และสถานะเอกสารซ้ำจาก UI เสมอ
- ผู้ใช้หนึ่งคนมีหลาย Role ได้ และ effective permission ใช้ `deny รายบุคคล > allow รายบุคคล > allow จาก Role > ไม่อนุญาต`
- หน้าทั่วไปใช้สิทธิ์ `ดู/จัดการ`; เอกสารสำคัญใช้ action `ดู/สร้าง/แก้ไข/ยกเลิก/เปิดบิล/อนุมัติ/จ่ายเงินจริง/ส่งออก` ตาม flow จริง
- ไม่มี approval amount limit และไม่มี approval escalation ตามยอดเงิน
- Self-approval อนุญาตเมื่อมี action permission แต่ต้องมี warning และ audit/report
- การเปลี่ยนสิทธิ์มีผลทันทีหลังบันทึกสำเร็จและต้องบันทึก before/after audit
- ห้าม commit secrets, `.env.local`, production dump หรือ raw sensitive export
- หลังแต่ละ batch ต้องอัปเดต flow/design note ที่เกี่ยวข้องและรัน validation ตามความเสี่ยง

---

## File Map

| Area | Files | Responsibility |
|---|---|---|
| Auth context | `apps/next/src/lib/server/auth-context.ts` | โหลด role, effective permission และ branch context ต่อ request |
| Permission helpers | `apps/next/src/lib/server/authorization.ts` | ตรวจ action, document state และ branch scope แบบ reusable |
| Navigation | `apps/next/src/lib/navigation.ts` | map route/page กับ permission catalog โดยไม่ใช้ broad finance fallback สำหรับ action route |
| Admin UI | `apps/next/src/app/admin/users-permissions/AdminUsersPageClient.tsx` | shared shell, users tab, roles/permissions tab |
| Admin API | `apps/next/src/app/api/admin/users/**`, `apps/next/src/app/api/admin/roles/**` | แยก user-admin และ security-admin authorization |
| Schema | `apps/next/prisma/schema.prisma` | เพิ่ม model/index เฉพาะที่จำเป็นต่อ action policy และ audit |
| DB migration | `supabase/migrations/YYYYMMDDHHMMSS_access_control_actions.sql` | catalog/action seed และ constraints/indexes |
| Tests | `apps/next/src/lib/server/*.test.ts`, `apps/next/src/app/api/**` | effective permission, scope, activation, action enforcement |

---

### Task 1: Lock Current Authorization Behavior With Tests

**Files:**
- Create: `apps/next/src/lib/server/authorization.test.ts`
- Modify: `apps/next/src/lib/server/auth-context.ts` only if a test exposes a contract bug
- Test commands: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/authorization.test.ts`

**Interfaces:**
- Input: role permission codes, user allow/deny overrides, `isAdmin`, user branch codes, requested branch code
- Produces: executable contracts for `effectivePermissionCodes`, `hasPermission`, and branch intersection behavior

- [x] **Step 1: Write failing tests for permission precedence**

```ts
it('uses deny override over role and allow override', () => {
  const result = effectivePermissionCodes({
    rolePermissionCodes: ['sales.bill.view', 'sales.bill.approve'],
    overrides: [
      { code: 'sales.bill.approve', effect: 'allow' },
      { code: 'sales.bill.approve', effect: 'deny' },
    ],
  })
  expect(result.has('sales.bill.view')).toBe(true)
  expect(result.has('sales.bill.approve')).toBe(false)
})
```

- [x] **Step 2: Add tests for multiple roles, inactive permissions, admin bypass, and branch intersection**

```ts
expect(effectivePermissionCodes({
  rolePermissionCodes: ['daily.weight_tickets.view', 'sales.bill.create'],
  overrides: [],
}).size).toBe(2)
expect(getBranchCodeIntersection(contextFor(['สมุทรสาคร']), 'นครสวรรค์')).toEqual([])
```

- [x] **Step 3: Run the focused test and confirm the new contract fails before implementation**

Run: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/authorization.test.ts`

Expected: FAIL because `effectivePermissionCodes` is not yet extracted.

- [x] **Step 4: Extract the pure effective-permission helper without changing the current broad route behavior**

Create a pure function with this contract:

```ts
export function effectivePermissionCodes(params: {
  rolePermissionCodes: string[]
  overrides: Array<{ code: string; effect: 'allow' | 'deny' }>
}): Set<string>
```

Use it from `buildAppUserContext`; keep `isAdmin` as an explicit admin bypass until action permissions are migrated.

- [x] **Step 5: Run focused and existing auth tests**

Run: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/authorization.test.ts apps/next/src/lib/customer-advance.test.ts`

Expected: all selected tests pass.

- [x] **Step 6: Commit the isolated authorization contract**

```bash
git add apps/next/src/lib/server/auth-context.ts apps/next/src/lib/server/authorization.test.ts
git commit -m "refactor: centralize effective permission evaluation"
```

Validation note: focused Vitest passed `17/17` and targeted ESLint passed. Workspace type-check remains blocked by three pre-existing errors in `apps/next/src/lib/server/analytics-dashboard.ts`.

---

### Task 2: Add Action Permission Catalog Without Replacing Existing Permissions

**Files:**
- Create: `supabase/migrations/20260719_access_control_action_permissions.sql`
- Modify: `apps/next/prisma/schema.prisma` only if the migration introduces a model/index not represented in Prisma
- Test: `apps/next/src/lib/server/permission-catalog.test.ts`

**Interfaces:**
- Produces active catalog codes such as `warehouse.receipt.open_bill`, `purchase.bill.approve`, `purchase.bill.pay`, `sales.bill.approve`, `sales.bill.receive`, `daily.petty_advance.approve`, `daily.petty_advance.pay`, and corresponding `view/create/edit/cancel/export` codes where the flow supports them.
- Does not remove or rename existing permission codes in this batch.

- [ ] **Step 1: Inventory route/action pairs before adding seed rows**

Inspect these route families and record the real business action in the test fixture:

```text
apps/next/src/app/api/daily/weight-tickets/**
apps/next/src/app/api/daily/payment-approval/**
apps/next/src/app/api/purchase/bills/**
apps/next/src/app/api/purchase/payments/**
apps/next/src/app/api/sales/bills/**
apps/next/src/app/api/sales/receipts/**
apps/next/src/app/api/daily/petty-advances/**
```

- [ ] **Step 2: Write a catalog test that rejects duplicate code and requires Thai descriptions**

```ts
expect(new Set(actionPermissionCatalog.map((item) => item.code)).size).toBe(actionPermissionCatalog.length)
expect(actionPermissionCatalog.every((item) => item.description?.trim())).toBe(true)
```

- [ ] **Step 3: Add idempotent SQL seed rows**

Use `INSERT ... ON CONFLICT (code) DO UPDATE` for descriptions/module/resource/action and preserve existing `id`, role mappings, and active state. Do not delete old broad permissions.

- [ ] **Step 4: Validate the migration against dev-target**

Run:

```bash
npx supabase db push --db-url "$DEV_TARGET_DB_URL"
npx prisma generate --schema apps/next/prisma/schema.prisma
```

Expected: migration applies once, rerun is idempotent, and Prisma generation succeeds.

- [ ] **Step 5: Commit catalog migration and contract tests**

```bash
git add supabase/migrations/20260719_access_control_action_permissions.sql apps/next/src/lib/server/permission-catalog.test.ts apps/next/prisma/schema.prisma
git commit -m "feat: add action permission catalog"
```

---

### Task 3: Split Admin Permissions and Harden Activation

**Files:**
- Modify: `apps/next/src/app/api/admin/users/route.ts`
- Modify: `apps/next/src/app/api/admin/users/[id]/route.ts`
- Modify: `apps/next/src/app/api/admin/users/[id]/status/route.ts`
- Modify: `apps/next/src/app/api/admin/users/[id]/invite/route.ts`
- Modify: `apps/next/src/app/api/admin/users/[id]/temporary-password/route.ts`
- Modify: `apps/next/src/app/api/admin/users/[id]/permission-overrides/route.ts`
- Modify: `apps/next/src/app/api/admin/roles/route.ts`
- Modify: `apps/next/src/app/api/admin/roles/[id]/route.ts`
- Create: `apps/next/src/lib/server/admin-authorization.ts`
- Test: `apps/next/src/lib/server/admin-authorization.test.ts`

**Interfaces:**
- `requireAdminAction(context, 'users.view' | 'users.manage' | 'credentials.manage' | 'roles.manage' | 'permissions.manage')`
- User endpoints use `system.users.view/manage` and `system.users.credentials.manage`.
- Role and permission endpoints use `system.roles.manage` or `system.permissions.manage`.

- [ ] **Step 1: Write tests for admin action mapping**

```ts
it('does not allow user administrator to mutate role policy', () => {
  expect(() => requireAdminAction(userAdminContext, 'roles.manage')).toThrow(/ไม่มีสิทธิ์/)
})

it('allows security administrator to update role policy', () => {
  expect(() => requireAdminAction(securityAdminContext, 'roles.manage')).not.toThrow()
})
```

- [ ] **Step 2: Implement the small admin authorization wrapper**

Map each admin action to one exact permission code and call `requirePermission`; do not make the wrapper grant `system.users.manage` access to roles or permission endpoints.

- [ ] **Step 3: Change GET user list to require only `system.users.view`**

The response must omit permission catalog and role policy details unless the caller also has the corresponding view/manage permission. Keep user data fields limited to the user-management surface.

- [ ] **Step 4: Change user create/edit/status endpoints to use user-management permissions**

The PATCH user contract must either use `values.active` consistently or remove it from the form schema; activation stays in the status endpoint and must not silently create an active account without credentials.

- [ ] **Step 5: Require credentials permission for invite and temporary-password endpoints**

Record an audit event for invite, reset link and temporary password issuance. Temporary password remains one-time response data and is never persisted as a password value.

- [ ] **Step 6: Require role/permission permissions for role and override endpoints**

Keep `assertPermissionRefs` and inactive-reference rejection. A user administrator may assign an existing Role only if the product decision allows it, but may not edit Role policy or direct permission overrides.

- [ ] **Step 7: Enforce activation completion**

When a pending user is activated, require one of `invite` or `temporary-password` completion before returning a final active state to the UI. If delivery fails, return a recoverable error and leave the account pending.

- [ ] **Step 8: Run admin API authorization tests and type-check**

Run:

```bash
npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/admin-authorization.test.ts
npm run type-check --workspace @ns-scrap-erp/next
```

- [ ] **Step 9: Commit admin authorization split**

```bash
git add apps/next/src/app/api/admin apps/next/src/lib/server/admin-authorization.ts apps/next/src/lib/server/admin-authorization.test.ts
git commit -m "feat: split user and security administration permissions"
```

---

### Task 4: Support Multiple Roles Per User and Shared Effective-Permission Display

**Files:**
- Modify: `apps/next/src/app/admin/users-permissions/AdminUsersPageClient.tsx`
- Modify: `apps/next/src/app/api/admin/users/route.ts`
- Modify: `apps/next/src/app/api/admin/users/[id]/route.ts`
- Modify: `apps/next/src/app/api/admin/roles/route.ts`
- Modify: `apps/next/src/app/admin/users/page.tsx`
- Modify: `apps/next/src/app/admin/roles-permissions/page.tsx`
- Test: `apps/next/src/app/admin/users-permissions/AdminUsersPageClient.test.tsx`

**Interfaces:**
- User form `roleIds: string[]` accepts one or more active employee roles.
- User list shows all assigned Role names and branch scope summary.
- Permission matrix shows `ตาม Role`, `อนุญาตเพิ่ม`, and `ปิดสิทธิ์` separately.

- [ ] **Step 1: Add a failing test for multiple Role assignment and deny visibility**

```tsx
expect(screen.getByLabelText('หน้าที่งาน')).toHaveValue('บัญชี, ผู้อนุมัติ')
expect(screen.getByText('ปิดสิทธิ์')).toBeVisible()
```

- [ ] **Step 2: Change user form from single Role to multi-select combobox**

Use the existing `SearchCombobox` family and render selected Role chips with remove controls. Keep active employee roles only.

- [ ] **Step 3: Remove direct permission editing from the user form**

Replace the large `สิทธิ์รายหน้า` form section with a read-only effective-permission summary and a link/tab action to the permission matrix when the caller has `system.permissions.manage`.

- [ ] **Step 4: Make the permission matrix explicit about inherited/allow/deny**

Use a three-state control per page/action. Preserve existing deny overrides on save and make a denied permission visibly different from an unassigned permission.

- [ ] **Step 5: Align shared page shell with design baseline**

Use one neutral filter card, Thai-first labels, shared table density, shared action button sizing, and the same dark-mode tokens for toolbar, KPI, table, mobile cards, and modals. Add confirmation before disabling a user.

- [ ] **Step 6: Test desktop/mobile rendering contracts without requiring live Supabase**

Run component tests for filters, role selection, effective permission states, and disabled-user confirmation. Browser UAT is a separate explicit step after deployment.

- [ ] **Step 7: Commit the shared Admin Access Control UI batch**

```bash
git add apps/next/src/app/admin/users-permissions apps/next/src/app/admin/users apps/next/src/app/admin/roles-permissions
git commit -m "feat: unify admin access control screens"
```

---

### Task 5: Introduce Action Authorization Helpers and Branch Scope Enforcement

**Files:**
- Create: `apps/next/src/lib/server/action-authorization.ts`
- Modify: `apps/next/src/lib/server/auth-context.ts`
- Modify: `apps/next/src/lib/navigation.ts`
- Test: `apps/next/src/lib/server/action-authorization.test.ts`
- Modify the route families listed in Task 6 only after the helper contract passes

**Interfaces:**

```ts
export function requireActionPermission(context: AppAuthContext, permissionCode: string): void
export function requireBranchAccess(context: AppAuthContext, branchCode: string): void
export function assertSelfApprovalPolicy(params: { actorUserId: bigint; createdByUserId: bigint | null; action: string }): { selfApproval: boolean }
```

- [ ] **Step 1: Write tests for action, branch and self-approval contracts**

Cover: missing action returns 403, forbidden branch returns 403, empty user mapping fails closed for scoped users, admin access remains explicit, and self-approval returns a reportable flag.

- [ ] **Step 2: Implement helpers using existing `requirePermission` and `getBranchCodeIntersection` contracts**

Do not add a second permission cache or browser storage. The request auth context remains source of current permission facts.

- [ ] **Step 3: Update route permission map for page visibility**

Keep broad route fallback only during migration for untouched routes. New action endpoints must have exact action permission mappings and must not fall back to `finance.cash.view`.

- [ ] **Step 4: Run helper tests and existing auth/navigation tests**

Run: `npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/action-authorization.test.ts apps/next/src/lib/server/authorization.test.ts`

- [ ] **Step 5: Commit reusable action/scope authorization**

```bash
git add apps/next/src/lib/server/action-authorization.ts apps/next/src/lib/server/action-authorization.test.ts apps/next/src/lib/server/auth-context.ts apps/next/src/lib/navigation.ts
git commit -m "feat: add action and branch authorization helpers"
```

---

### Task 6: Migrate High-Risk Transaction Actions Without Changing Business Calculations

**Files:**
- Modify: `apps/next/src/app/api/daily/weight-tickets/**`
- Modify: `apps/next/src/app/api/daily/payment-approval/**`
- Modify: `apps/next/src/app/api/daily/petty-advances/**`
- Modify: `apps/next/src/app/api/purchase/bills/**`
- Modify: `apps/next/src/app/api/purchase/payments/**`
- Modify: `apps/next/src/app/api/sales/bills/**`
- Modify: `apps/next/src/app/api/sales/receipts/**`
- Test: focused route authorization tests beside each migrated route family

- [ ] **Step 1: Add route-level failing tests for each action**

At minimum cover:

```text
weight ticket open_bill -> warehouse.receipt.open_bill / warehouse.delivery.open_bill
purchase bill approve -> purchase.bill.approve
purchase payment pay -> purchase.bill.pay
sales bill approve -> sales.bill.approve
customer receipt receive -> sales.receipt.receive
petty advance approve -> daily.petty_advance.approve
petty advance pay -> daily.petty_advance.pay
```

- [ ] **Step 2: Replace write-route broad permission checks with exact action checks**

Preserve current validation, transaction boundaries, idempotency, status transitions, branch scope and audit behavior. Only change authorization gates and action audit metadata in this batch.

- [ ] **Step 3: Add self-approval warning and audit metadata to approval routes**

Return a structured warning on the confirmation response path, require an explicit confirmation field for self-approval, and write `self_approval: true` in the approval audit metadata.

- [ ] **Step 4: Verify direct API denial**

For each migrated route, call the endpoint with an authenticated context lacking the action permission and assert `403`; do not rely only on hidden buttons.

- [ ] **Step 5: Run focused transaction tests and build**

```bash
npx vitest run --config apps/next/vitest.config.ts <focused-route-test-files>
npm run lint --workspace @ns-scrap-erp/next
npm run type-check --workspace @ns-scrap-erp/next
npm run build --workspace @ns-scrap-erp/next
```

- [ ] **Step 6: Commit high-risk action migration**

```bash
git add apps/next/src/app/api/daily apps/next/src/app/api/purchase apps/next/src/app/api/sales
git commit -m "feat: enforce transaction action permissions"
```

---

### Task 7: Audit, Self-Approval Report, and Documentation Checkpoint

**Files:**
- Modify: existing `app_audit_logs` writer through `apps/next/src/lib/server/auth-audit.ts`
- Create/modify: `apps/next/src/app/api/admin/audit/**` only if existing audit API cannot filter the required metadata
- Modify: `apps/next/src/app/admin/audit/**` only if the existing surface cannot display the fields
- Modify: `docs/notes/` flow note for Access Control
- Modify: `docs/migration/00-current-work.md` to keep only the active batch and blockers
- Test: `apps/next/src/lib/server/auth-audit.test.ts`

- [ ] **Step 1: Add audit contract tests**

Assert that user/role/permission/branch changes include actor, target, before, after, timestamp and event type, and that approval events expose `self_approval`.

- [ ] **Step 2: Add self-approval filtering to the existing audit surface**

Reuse the current audit source and add a filter only if the existing API already supports metadata filtering safely; otherwise query by indexed event type and bounded date range.

- [ ] **Step 3: Write the operational flow note**

Document what User Administrator, Security/Permission Administrator, Role, effective permission, branch scope and action permission mean and why they are separate.

- [ ] **Step 4: Run docs and audit validation**

```bash
git diff --check
npx vitest run --config apps/next/vitest.config.ts apps/next/src/lib/server/auth-audit.test.ts
```

- [ ] **Step 5: Commit audit/report documentation**

```bash
git add apps/next/src/lib/server/auth-audit.ts apps/next/src/app/api/admin/audit docs/notes docs/migration/00-current-work.md
git commit -m "feat: add access control audit reporting"
```

---

## Final Verification

- [ ] Run `npm run lint --workspace @ns-scrap-erp/next` and record the existing `qa-thai-font.tsx` warning separately from errors.
- [ ] Run `npm run type-check --workspace @ns-scrap-erp/next`.
- [ ] Run `npm run build --workspace @ns-scrap-erp/next`.
- [ ] Run all focused authorization, admin, approval and route tests.
- [ ] Run `git diff --check`.
- [ ] Perform explicit authenticated browser QA for `/admin/users` and `/admin/roles-permissions` at desktop and mobile after deployment/test environment is available.
- [ ] Verify that a user without `open_bill`, `approve` or `pay` receives `403` from direct API calls.
- [ ] Verify branch isolation for list, detail, write, approval and export.
- [ ] Verify self-approval warning and audit report.
- [ ] Promote only the reviewed batch through `dev -> UAT` using the project remote rules.
