---
title: Users & Permissions Page Flow
tags:
  - page-flow
  - menu
  - admin-system
status: accepted-baseline
updated: 2026-07-10
route: /admin/users, /admin/roles-permissions
---

# Admin Users And Roles Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Admin / System |
| Route | `/admin/users`, `/admin/roles-permissions` |
| Page | รายชื่อพนักงาน / Users, Roles & Permissions |
| Current Next | accepted code baseline |

## Canonical References

[[System Supporting Flows]], [[Menu Page Flow Catalog]]

## Flow Baseline

split admin user management from role/permission viewing:

- `/admin/users` = employee/user profile registry with role assignment, branch access, invite/reset, and active status
- `/admin/roles-permissions` = role list and permission capability view
- `/admin/users-permissions` = compatibility route that redirects to `/admin/users`

## Page Responsibilities

- `/admin/users`: list users, active departments, and active branches จาก `/api/admin/users`
- `/admin/users`: create/update app user with departmentId, roleIds, branchIds, profile fields, and contact fields
- `/admin/users`: toggle active status ผ่าน status API
- `/admin/users`: send invite/reset password ผ่าน invite API
- `/admin/roles-permissions`: list role definitions and role usage counts จาก `/api/admin/users`
- record auth audit events for admin user actions

## Non-Responsibilities

- ไม่เก็บ password ใน application table
- ไม่ bypass Supabase Auth invite/reset flow
- ไม่สร้าง business transaction
- ไม่แก้ role matrix โดยไม่มี API/schema support
- ไม่ใช้ Department แทน Role; Department คือสังกัด/ฝ่ายของพนักงาน ส่วน Role คือชุดสิทธิ์การใช้งาน

## Lifecycle / Support Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิด `/admin/users` | GET users/roles/departments/branches |
| 2 | สร้าง user | POST email/namePrefix/firstName/lastName/departmentId/roleIds/branchIds; ระบบสร้าง displayName |
| 3 | แก้ user | PATCH /api/admin/users/[id] |
| 4 | เปิด/ปิด user | PATCH status; ห้ามปิดบัญชีตัวเอง |
| 5 | invite/reset | POST invite; ใช้ Supabase invite/reset ตาม auth state |
| 6 | เปิด `/admin/roles-permissions` | GET users/roles/branches แล้วแสดงเฉพาะ role/permission summary |

Profile/contact fields are stored on `app_users` as application profile data:

| Field group | Fields | Purpose |
|---|---|---|
| ชื่อบุคคล | `name_prefix`, `first_name`, `last_name` | แยกคำนำหน้า ชื่อ และนามสกุล เพื่อให้ระบบแสดงชื่อจริงได้ละเอียดกว่า `display_name` |
| รูป profile | `profile_image_url` | เก็บ URL รูปผู้ใช้งานสำหรับหน้า admin/list/detail ในอนาคต |
| Contact | `contact_phone`, `contact_line_id`, `contact_note` | เก็บช่องทางติดต่อภายในฝ่าย/โรงงานโดยไม่ผูกกับระบบ login |
| ฝ่าย | `department_id -> departments.id` | บอกสังกัด/ฝ่ายหลักของพนักงาน เป็นข้อมูลบังคับ และแยกจาก Role ซึ่งเป็นชุดสิทธิ์ |

## API / Data Contract

### Current API

- `GET /api/admin/users - users/roles/departments/branches`
- `POST /api/admin/users - create app user`
- `PATCH /api/admin/users/[id] - update app user roles/branches`
- `PATCH /api/admin/users/[id]/status - active/inactive user`
- `POST /api/admin/users/[id]/invite - invite or reset password`

### Data Contract

- user identity ต้องมาจาก authenticated context ไม่รับ actor จาก form
- password/auth state อยู่ใน Supabase Auth; `app_users` เก็บเฉพาะข้อมูลผู้ใช้ของระบบ, profile, department, role และ branch access
- admin/support action ต้อง enforce permission ที่ API ระบุ
- admin/support pages ต้องไม่เขียน business transaction facts
- current code ใน `apps/next` เป็น proof baseline ของ P3 admin/system ณ 2026-06-11

## Validation / Status Rules

- requires permission `system.users.manage` for both `/admin/users` and `/admin/roles-permissions`
- email is the only login identifier and is validated in client and server schema; name prefix is a fixed dropdown (`นาย`, `นาง`, `นางสาว`, `คุณ`); `display_name` is derived by the API from prefix, first name, and last name (falling back to email for legacy users without structured names)
- profile/contact fields are optional; `profileImageUrl` must be an http/https URL when provided
- departmentId is required and must resolve to an active row in `departments`; the user form has no “ไม่ระบุฝ่าย” option
- roleIds required อย่างน้อย 1
- branchIds resolve จาก active branch code
- ห้ามปิดบัญชีตัวเอง
- invite requires email and active user; service role required for new invite path

## Side Effects

- writes app_users/app_user_roles/app_user_branch_access
- department assignment writes only `app_users.department_id`; it does not grant permissions
- a work-function template writes `app_roles` and `app_role_permissions`; a user can inherit multiple templates and then override any catalog permission as `allow` or `deny`
- may call Supabase Auth invite/reset
- records auth audit events
- ไม่มี business transaction side effect

## UI Table Mechanics

As of 2026-07-02, the Users and Roles desktop tables follow the active Cost Pool / Weight Ticket table mechanics: sortable `ResizableTableHead` business headers, persisted resizable column widths, reset-width control, `colgroup`, fixed table layout, and mobile card lists rendered from the same sorted row sets as desktop. This is presentation-only; admin user APIs, Supabase Auth invite/reset flow, permission checks, role matrix semantics, branch access writes, audit events, and DB state remain unchanged.

As of 2026-07-02, `/admin/users` summary cards intentionally show only active users and users who must change password. Branch access remains available in the user table and edit form, but the branch-scoped summary card was removed because it is not a primary user-management action.

As of 2026-07-10, `/admin/users` separates ฝ่าย (the `departments` master) from Role. ฝ่าย comes from the existing `/master-data/departments` master and is stored as `app_users.department_id`; Role remains permission-oriented through `app_user_roles`. ฝ่าย is required for every create or update and the form deliberately has no “ไม่ระบุฝ่าย” choice. The Users table and mobile cards show ฝ่าย separately from Role, and the filter card supports Role, ฝ่าย, สาขา, and สถานะ. This separation prevents organizational labels such as บัญชี/คลัง/ฝ่ายขาย from becoming permission bundles.

As of 2026-07-10, `app_users.username` has been removed. Users log in and reset passwords by email only; the Users table/form no longer exposes a parallel username field. Existing audit/activity snapshot columns retain their historical `actor_username` names, but new records store the actor email in that compatibility field so history stays queryable without a separate username account identity.

As of 2026-07-11, the Roles tab is the `หน้าที่งานและสิทธิ์` management surface. A work function is a reusable template with a user-defined name, description, branch-scope policy, and a selected set of catalog permissions. User assignment is optional: a user may receive any number of templates and then set each catalog permission to inherit, explicitly allow, or explicitly deny. Effective permission is the union of active template permissions plus direct allows, minus direct denies. This is data-driven: no role code grants an implicit bypass and a missing `app_users` record has no legacy profile fallback. Why it stays this way: a team can configure access page-by-page for a person without multiplying organization departments or relying on special role names.

As of 2026-07-11, role permission selection is organized from the active Side menu rather than raw permission modules. The left column is an expandable Side menu category tree; selecting a page shows only that page's catalog actions in the adjacent column. A category is not itself a permission grant: the shell shows it only when the user can access at least one page in that category. Catalog entries that are not linked to a visible Side menu page remain visible in a separate system-permission area so existing access cannot disappear silently. The Side menu is still a code registry at this checkpoint; a future menu-management and drag/drop batch must persist the same registry in the database before changing navigation order or category placement at runtime.

As of 2026-07-11, `/admin/roles-permissions` has separate `Role ตามฝ่าย` and `สิทธิ์รายหน้า` tabs. The Role tab filters reusable work-function templates by the selected department based on real user assignments; it does not duplicate department ownership onto the role record. The permission tab selects either one Role or one user, then displays Side menu pages as a permission matrix whose columns are the registered actions for that page. Saving a Role updates its template permissions. Saving a user writes only direct `allow` overrides through `PUT /api/admin/users/:id/permission-overrides`; it does not overwrite that user's profile, department, branches, or assigned templates. Why it stays this way: a department remains an organizational fact, while a reusable Role and a single-user exception remain separate authorization mechanisms.

## Current Gap

P3 proof completed from current code. Role/permission matrix future changes should update System Supporting Flows. Profile image upload/storage is not implemented yet; current contract stores an optional URL only. User department linkage is now implemented; remaining cleanup is role naming/governance so legacy role codes that describe departments can gradually become permission-oriented roles.

## Implementation Checklist

- [x] Verify current page/component API calls
- [x] Verify current API route methods and permission boundary
- [x] Keep business transaction side effects out of this page
- [x] Update this file if admin/system code changes
- [x] Split user registry route from role/permission route
