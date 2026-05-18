# 14 Auth Permission Batch Plan

## Objective

วาง batch งาน login, reset password, user management, role/permission และ access enforcement ของ Next app โดยยึด Supabase Auth เป็น source of truth และใช้ legacy behavior เป็น baseline เฉพาะ business permission เท่านั้น

## Reporting Rule

- อัปเดตเอกสารนี้หลังจบทุก auth/permission batch
- อัปเดตทันทีเมื่อ schema, route guard, API guard, RLS, reset-password flow หรือ role matrix เปลี่ยน
- บันทึก validation ทุกครั้งหลังรัน lint, type-check, build, smoke test หรือ auth flow test
- ห้ามบันทึก password, token, service role key หรือข้อมูล credential จริงลงเอกสาร
- ทุก schema migration ต้อง additive/non-destructive ก่อน UAT และห้ามลบข้อมูลเดิม

## Current Status as of 2026-05-18

- Next login page exists at `/login`.
- Login currently uses Supabase Auth email/password through `@supabase/ssr`.
- Next `proxy.ts` protects pages/API with `supabase.auth.getUser()`.
- Current route/API gate is admin-only:
  - reads `public.user_profiles.role`
  - falls back to Supabase user metadata role
  - requires role `admin` and active profile
- Logout exists in the top auth status component.
- Password visibility toggle exists on the login password field.
- Full reset-password flow is not implemented yet.
- Forgot/reset password routes have been added in Next as the first B1 implementation slice:
  - `/forgot-password`
  - `/reset-password`
  - `/login` links to forgot password
  - `proxy.ts` treats forgot/reset routes as public so Supabase recovery links can load
- Username login is implemented through `lookup_app_login_email(identifier)` over active `app_users`; the login page accepts either email or username and then signs in with Supabase Auth email/password.
- Additive target auth/permission schema migration has been drafted as `20260518093001_create_app_auth_permission_tables.sql`.
- Server auth context helper exists at `apps/next/src/lib/server/auth-context.ts`.
- `/api/auth/me` exists as a protected route to return current auth/app user, roles, and permission codes.
- `/api/admin/users` exists as the first user-management API slice and requires `system.users.manage`.
- `/api/admin/users` also supports creating `app_users` with role and branch assignments; it does not create or store passwords.
- `/api/admin/users/[id]` supports editing app user profile, role assignments, branch access, active status, and must-change-password flag.
- `/api/admin/users/[id]/invite` supports admin-triggered invite/reset email:
  - users without `auth_user_id`: sends Supabase Auth invite with service-role key on trusted server
  - users with `auth_user_id`: sends Supabase reset-password email
- `/admin/users-permissions` exists as a Next page over real `app_users`, `app_roles`, and active branches, with create/edit modal flow.
- User active/inactive can be changed from `/admin/users-permissions` through `/api/admin/users/[id]/status`; self-deactivation is blocked.
- Admin Supabase Auth user has been linked into `app_users` through `scripts/seed-app-admin.mjs`; the script reads `APP_ADMIN_EMAIL` or `DEV_LOGIN_IDENTIFIER` and does not store passwords.
- App auth SQL helper functions exist in `dev-target`: `current_app_user_id`, `current_app_role_codes`, `current_app_permission_codes`, `is_app_admin`, and `has_app_permission`.
- Next `proxy.ts` now checks normalized app permissions by path, allows active app users on non-mapped paths, and falls back to legacy `user_profiles` admin/owner guard during transition.
- Sidebar navigation now fetches `/api/auth/me` and hides menu items that require permissions the current user does not have.
- `lookup_app_login_email(identifier)` exists for pre-auth username/email lookup and is granted to `anon`/`authenticated`; it returns email only for active `app_users`.
- B5 hardening has started:
  - `app_auth_events` exists in `dev-target` as append-only audit storage with RLS enabled
  - user create/edit/status/invite/reset actions write best-effort audit events
  - `/api/admin/auth-events` and `/admin/audit` expose audit/activity events to users with `system.audit.view`; the page supports group/search/actor/target/event-type filters, server pagination, and row detail metadata; `/admin/user-activity` is intentionally folded into `/admin/audit` in the Next navigation
  - Implemented admin/master-data error case baseline: API responses normalize auth, validation, conflict, not-found, database, and server failures; client pages normalize network, permission, conflict, and invalid-response messages before showing them in Thai.
  - `app_set_updated_at()` has fixed `search_path = public`
- Master-data route-level API guards now enforce normalized permissions directly for customer, supplier, and product view/create/status/export actions, in addition to proxy path checks.
- RLS/permission model is not final; current app gating now uses normalized permissions for mapped paths, but table-level RLS rollout still needs table-by-table UAT.
- Supabase advisors still report many legacy/base tables with policies but RLS disabled; those are not changed in this auth batch because enabling them globally could break legacy-compatible flows and needs a table-by-table UAT plan.

## Legacy Findings

### Legacy DB Tables / Functions

Legacy source has these auth-adjacent structures:

| Source | Current Use / Risk | Target Direction |
|---|---|---|
| `auth.users` | Supabase-managed auth table | Keep as login source of truth |
| `public.users` | App user table with `password`, `role_id`, `branch_id`, `must_change_pwd`, `active` | Replace with `app_users`; do not keep password |
| `public.user_profiles` | Profile linked to `auth.users`, has `username`, `display_name`, `email`, `role`, `branch_ids`, `active` | Merge/refactor into `app_users` and branch access tables |
| `public.roles_config` | `role`, `permissions jsonb`, `description` | Normalize to `app_roles` + `app_permissions` + `app_role_permissions` |
| `public.roles` | Legacy role table exists in dump | Audit before deciding whether to migrate rows |
| `public.lookup_user_email(username)` | Finds active profile email by username | Replace with safe username-to-email lookup if username login is required |
| `public.current_user_role()` | Reads role from `user_profiles` | Replace with app role helper/RLS strategy |
| `public.current_user_branches()` | Reads branch ids from `user_profiles` | Replace with `user_branch_access` |
| `public.has_branch_access(branch_id)` | Branch access helper | Rebuild after branch access schema |
| `public.is_admin()` | Treats `Admin`/`Owner` as admin | Rebuild using normalized roles/permissions |

Important risks:
- `public.users.password` exists in the legacy model and must not be used in the target app.
- Existing `roles_config.permissions` is JSONB and should be used as migration/reference input, not as final permission storage.
- `user_profiles_user_id_fkey` was not cleanly restored into `dev-target` because legacy auth users were not migrated. This is acceptable until auth migration is designed.

Legacy row counts from the audit snapshot:
- `public.users`: 29
- `public.user_profiles`: 17
- `public.roles`: 14
- `public.roles_config`: 7

Current Prisma introspection already contains:
- `auth_users` mapped to `auth.users`
- `public_users` mapped to `public.users`
- `user_profiles`
- `roles`
- `roles_config`

These models are available for read/audit, but target implementation should add new normalized tables rather than expanding legacy password-bearing structures.

### Legacy UI Role Baseline

The Vue clone page `old-apps/vue/src/views/admin/UsersPermissionsView.vue` currently models:

Users fixture:
- `admin`
- `owner`
- `accountant`
- `cashier`
- `purchaser`
- `sales`
- `warehouse`

Roles fixture:
- `R-ADMIN` / Admin: all menus, all branch scope, sees cost/profit/cash/financials/opening
- `R-OWNER` / Owner: all menus, all branch scope, sees cost/profit/cash/financials/opening
- `R-ACCOUNTANT` / บัญชี: finance/accounting/reporting plus purchase/sales/master basics
- `R-ACCOUNT-EXPENSE` / บัญชีค่าใช้จ่าย: accountant plus expense/petty advance
- `R-COORDINATOR` / ประสานงาน: purchase/sales/stock/trading/PO coordination, sees cost but not profit/cash/financials
- `R-POOPAE` / Poopae: special broad role including production, assets, loans, import master
- `R-WAREHOUSE` / คลัง: branch-scoped stock/production role, does not see cost/profit/cash/financials

Permission dimensions already implied by legacy UI:
- menu visibility
- branch scope: `all` or `own`
- see cost
- see profit
- see cash/bank
- see financial statements
- edit opening balance

## Target Principles

- Use `auth.users` as authentication source of truth.
- Do not store passwords in application tables.
- Use Supabase password reset / recovery flow.
- Keep app-specific user profile data in `app_users`.
- Normalize permissions instead of relying on duplicated JSON permission blobs.
- Use `app_*` table names for new target auth/permission tables so they do not collide with legacy `public.roles` or `public.users`.
- Enforce permissions in both UI and API. Hiding buttons is not enough.
- Use RLS only after the application permission model is verified in `dev-target`.
- Keep legacy `public.users`, `user_profiles`, and `roles_config` as reference until migration mapping is signed off.

## Proposed Target Schema

Initial tables:
- `app_users`
  - `id`
  - `auth_user_id`
  - `username`
  - `display_name`
  - `email`
  - `active`
  - `must_change_password`
  - `last_login_at`
  - `created_at`, `updated_at`, `created_by`, `updated_by`
- `app_roles`
  - `id`
  - `code`
  - `name`
  - `description`
  - `is_system`
  - `branch_scope`
  - `active`
- `app_permissions`
  - `id`
  - `code`
  - `module`
  - `resource`
  - `action`
  - `description`
- `app_role_permissions`
  - `role_id`
  - `permission_id`
- `app_user_roles`
  - `user_id`
  - `role_id`
- `app_user_branch_access`
  - `user_id`
  - `branch_id`
- Optional later:
  - `auth_events`
  - `permission_audit_logs`

Permission code shape:
- `master.customers.view`
- `master.customers.create`
- `master.customers.update`
- `master.customers.export`
- `master.customers.status`
- `finance.cash.view`
- `finance.financials.view`
- `stock.ledger.view`
- `system.users.manage`
- `system.roles.manage`

## Batch Plan

### Batch B0: Legacy Auth/Permission Audit

Goal:
- Confirm how old login/users/roles/permissions worked and what must be preserved.

Tasks:
- Audit `public.users`, `user_profiles`, `roles`, `roles_config` columns and row counts in `dev-target`.
- Extract legacy role names, role ids, and permission JSON shape from `roles_config`.
- Compare DB roles with Vue clone fixture roles.
- Map legacy menu keys to Next route paths.
- Decide whether username login is required in addition to email login.

Validation:
- Read-only DB queries only.
- Document row counts and mapping gaps.

### Batch B1: Auth UX Baseline

Goal:
- Make login/logout/reset password production-shaped before full user management.

Tasks:
- Add forgot-password page.
- Add reset/update password page.
- Add auth callback/recovery handling route if required by Supabase flow.
- Add Thai error copy for common Supabase Auth failures.
- Add username lookup only if B0 confirms requirement and safe lookup is available.
- Keep dev login prefill dev-only.

Validation:
- Login success/failure smoke.
- Logout smoke.
- Forgot password request smoke.
- Reset-password route smoke with simulated/real recovery link in dev-target.

### Batch B2: Target Auth Schema

Goal:
- Add non-destructive target tables for app users and permissions.

Tasks:
- Create additive migration for `app_users`, `app_roles`, `app_permissions`, `app_role_permissions`, `app_user_roles`, `app_user_branch_access`.
- Seed baseline system roles from audited legacy roles.
- Seed permission catalog from route/menu model.
- Link current admin Supabase Auth user to `app_users`.
- Do not drop legacy `public.users`, `user_profiles`, or `roles_config`.

Validation:
- `supabase db push --dry-run`.
- `supabase db push` to `dev-target`.
- Row count checks.
- FK/orphan checks.
- RLS remains conservative until enforcement design is validated.

### Batch B3: User Management UI/API

Goal:
- Build admin user management without storing passwords.

Tasks:
- Next routes under `/admin/users-permissions` or equivalent.
- User list, create/invite, edit profile, active toggle.
- Assign roles.
- Assign branch access.
- Resend password reset/invite.
- No hardcoded password fields.

Validation:
- Admin-only route/API smoke.
- Create/update/deactivate user smoke in dev-target.
- Zod validation for every field.

### Batch B4: Permission Enforcement

Goal:
- Replace admin-only gate with normalized role/permission checks.

Tasks:
- Server helper for current app user.
- Server helper for `hasPermission(code)`.
- Route/menu visibility from permissions.
- API guards for view/create/update/export/status.
- Action button guards.
- Branch-scope filtering where applicable.

Validation:
- Admin user can access all intended routes.
- Non-admin role sees only allowed menus.
- Forbidden API returns 403 even when called directly.
- Branch-scoped user cannot access other branch data where branch scope applies.

### Batch B5: RLS and Hardening

Goal:
- Move from app-only enforcement to DB-backed security where practical.

Tasks:
- Design RLS helper functions based on normalized tables.
- Enable/adjust RLS policies table group by table group.
- Add audit log for security-sensitive changes.
- Consider rate limiting for login/reset endpoints later if needed.

Validation:
- Supabase advisors reviewed.
- RLS smoke using admin/non-admin users.
- Regression smoke for master data API.

## Open Decisions

- Username login is supported through `app_users.username -> app_users.email -> Supabase Auth`; do not use legacy `public.users.password`.
- Should `Owner` be equivalent to `Admin`, or a separate role with broad business visibility but limited system settings?
- Should system roles be editable, clone-only, or fully locked?
- Should role permissions be menu-only first, then action-level later, or action-level from the start?
- Which routes require branch-scope filtering in Phase 1?
- Should reset password be invite-only for new users, or should admins also set temporary passwords? Current recommendation: no admin-set password; use invite/reset email.

## Latest Validation

| Date | Command / Check | Result | Notes |
|---|---|---|---|
| 2026-05-18 | Legacy source audit pass | In progress | Reviewed Vue users/roles fixture and legacy DB auth-adjacent tables/functions from dump |
| 2026-05-18 | Prisma/schema audit pass | In progress | Confirmed Prisma has `auth_users`, `public_users`, `user_profiles`, `roles`, and `roles_config`; audit snapshot counts users 29, user_profiles 17, roles 14, roles_config 7 |
| 2026-05-18 | B1 reset-password implementation slice: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build` | Passed | Added forgot/reset password pages, password syntax validation, login link, and public proxy paths; build route table includes `/forgot-password` and `/reset-password` |
| 2026-05-18 | B2 target schema migration: Supabase `db push --dry-run`, `db push`, row-count verification, `npm run prisma:generate --workspace @ns-scrap-erp/next`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build` | Passed | Applied additive `app_*` auth/permission tables to `dev-target`; counts: app_users 0, app_roles 7, app_permissions 27, app_role_permissions 132, app_user_roles 0, app_user_branch_access 0; Prisma schema/client regenerated; legacy `public.users`, `user_profiles`, `roles`, and `roles_config` remain untouched |
| 2026-05-18 | Server auth context helper: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build` | Passed | Added server helper for Supabase user, `app_users`, roles, permissions, legacy profile fallback, and protected `/api/auth/me`; build route table includes `/api/auth/me` |
| 2026-05-18 | Admin app user seed: `node --check scripts/seed-app-admin.mjs`, `APP_ADMIN_EMAIL=... npm run seed:app-admin`, row-count verification | Passed | Linked current admin Auth user to `app_users`; counts after seed: app_users 1, app_user_roles 1, admin_assignments 1 |
| 2026-05-18 | App auth SQL helpers + proxy primary app guard: Supabase `db push --dry-run`, `db push`, function verification, `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build` | Passed | Added security-definer helper functions and updated proxy to check `is_app_admin()` before legacy profile fallback |
| 2026-05-18 | Username login lookup: Supabase `db push --dry-run`, `db push`, lookup verification, `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build` | Passed | Added `lookup_app_login_email(identifier)` and updated login page to accept email or username without reading legacy password fields |
| 2026-05-18 | B3 user-management API first slice: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build` | Passed | Added protected `/api/admin/users` for app users, roles, and active branches; route requires `system.users.manage` |
| 2026-05-18 | B3 read-only users/permissions page: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build` | Passed | Added `/admin/users-permissions` read-only page and kept forgot/reset password pages outside the app shell |
| 2026-05-18 | B3 user status toggle: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build` | Passed | Added `/api/admin/users/[id]/status` and active toggle in user table; self-deactivation returns 400 |
| 2026-05-18 | B3 user create/edit flow: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build` | Passed | Added protected create/edit app user APIs and `/admin/users-permissions` modal form for username, email, display name, roles, branch access, active status, and must-change-password flag; no password storage or admin-set password |
| 2026-05-18 | B3 invite/reset user action: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build` | Passed | Added trusted-server Supabase admin helper, `/api/admin/users/[id]/invite`, user-table Invite/Reset action, and `.env.example` placeholders for Next Supabase env/service-role key; no secrets committed |
| 2026-05-18 | B4 permission-aware navigation/proxy: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build` | Passed | Added path-to-permission mapping, sidebar filtering from `/api/auth/me`, and proxy enforcement through `has_app_permission`; legacy admin/owner fallback remains during transition |
| 2026-05-18 | B5 audit schema/hardening: Supabase `db push --dry-run`, `db push`, table/RLS verification query, advisors filtered for `app_`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build` | Passed with legacy caveat | Added `app_auth_events`, RLS select policy for `system.audit.view`, user-management audit writes, `/api/admin/auth-events`, `/admin/audit`, and hardened `app_set_updated_at`; advisors no longer show app-schema warning, but still report legacy tables/functions outside this batch |
| 2026-05-18 | B4/B5 route-level permission guards for key master APIs: `npm run lint --workspace @ns-scrap-erp/next`, `npm run type-check --workspace @ns-scrap-erp/next`, `npm run build` | Passed | Added direct `requirePermission` checks to customer, supplier, and product list/create/status/export API handlers; proxy remains a second layer |
