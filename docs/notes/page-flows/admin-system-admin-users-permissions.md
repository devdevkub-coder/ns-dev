---
title: Users & Permissions Page Flow
tags:
  - page-flow
  - menu
  - admin-system
status: accepted-baseline
updated: 2026-07-12
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
| 2 | สร้าง user | POST email/namePrefix/firstName/lastName/departmentId/roleIds/branchIds; ระบบสร้าง displayName แล้วส่ง Supabase Invite อัตโนมัติ |
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
- invite requires email and a `pending` account; password setup/reset requires an `active` account; `disabled` accounts cannot receive credential links
- การส่ง Invite ล้มเหลวต้องไม่ย้อนลบ `app_users`; ตารางจะแสดง User ที่สร้างแล้วและให้ส่งคำเชิญซ้ำจากเมนูจัดการ

## Side Effects

- writes app_users/app_user_roles/app_user_branch_access
- department assignment writes only `app_users.department_id`; it does not grant permissions
- a work-function template writes `app_roles` and `app_role_permissions`; a user can inherit multiple templates and then override any catalog permission as `allow` or `deny`
- may call Supabase Auth invite/reset
- records auth audit events
- ไม่มี business transaction side effect

## UI Table Mechanics

As of 2026-07-02, the Users and Roles desktop tables follow the active Cost Pool / Weight Ticket table mechanics: sortable `ResizableTableHead` business headers, persisted resizable column widths, reset-width control, `colgroup`, fixed table layout, and mobile card lists rendered from the same sorted row sets as desktop. This is presentation-only; admin user APIs, Supabase Auth invite/reset flow, permission checks, role matrix semantics, branch access writes, audit events, and DB state remain unchanged.

As of 2026-07-12, `/admin/users` no longer dedicates a `ตั้งรหัส` column to an occasional command. Each row has one `จัดการ` ellipsis menu containing `แก้ไข` and a conditional Supabase Auth action: invite, resend the password setup link, or reset password. Creating a User automatically attempts the Invite after the application profile is committed. If email delivery fails, the employee record remains valid and the administrator can retry from the same menu. Why it stays this way: authentication commands are row actions rather than comparable table data, and an external email failure must not destroy valid employee/profile assignments.

As of 2026-07-12, each employee row shows the resolved full name once instead of repeating `displayName` and the same structured name on a second line. The default desktop column widths are compact while remaining resizable and horizontally scrollable when needed. The status control remains an optimistic switch: it disables during the request, rolls back on failure, and writes synchronized `account_status` / `active` values through the guarded status API. A pending or disabled application user cannot pass the server auth context or obtain permission codes. Why it stays this way: account lifecycle is application access state, while Supabase Auth owns credentials.

As of 2026-07-12, a successful password login calls authenticated `POST /api/auth/login-complete`. The route resolves the current application user from the Supabase session, writes `app_users.last_login_at`, and records `app_user.login_completed` in the auth audit stream. It never accepts a user ID from the browser. The Users table reads this timestamp through `GET /api/admin/users` and formats it in `Login ล่าสุด`. Why it stays this way: Supabase validates the credential, while the application owns its employee activity timestamp and must bind that write to the authenticated identity.

As of 2026-07-13, dev-target has migration `20260712153000_add_app_user_lifecycle.sql` applied and recorded. The login-complete update depends on the same `app_users` lifecycle columns as the active Prisma schema, including `account_status`; a missing lifecycle column is database schema drift and must be repaired through the committed migration, never hidden by skipping the update or adding a runtime fallback. Reconciliation found all 21 current users active with no null lifecycle status or `account_status`/`active` mismatch, and the authenticated navigation guard passed 106 pages plus 106 RSC requests with zero failures.

As of 2026-07-12, `/admin/users` orders its data surfaces as summary cards, filter/action toolbar, then employee table on both desktop and mobile. The summary gives context before the administrator narrows the dataset; filters remain immediately adjacent to the table they control.

The row `จัดการ` control is a vertical Kebab/More Actions button. Its Dropdown Menu uses a white surface with dark text in light mode and a dark surface with light text in dark mode; trigger, hover, focus, and disabled states retain readable contrast in both themes.

The add/edit User modal uses a dark header and a theme-aware scrolling form body. In dark mode the title, labels, inputs, selects, textareas, nested profile/contact/permission panels, borders, and action states remain readable rather than retaining a light header with white title text.

The status segmented filter (`ทุกสถานะ`, `ใช้งาน`, `รอเปิดใช้งาน`, `ปิดใช้งาน`) has explicit light/dark selected and unselected states on both desktop and mobile. The selected option uses a filled blue surface with white text and `aria-pressed=true`; unselected options use the page surface, visible border, and theme-appropriate text. This keeps the current filter and account lifecycle visually unambiguous on a dark slate page.

As of 2026-07-02, `/admin/users` summary cards intentionally show only active users and users who must change password. Branch access remains available in the user table and edit form, but the branch-scoped summary card was removed because it is not a primary user-management action.

As of 2026-07-10, `/admin/users` separates ฝ่าย (the `departments` master) from Role. ฝ่าย comes from the existing `/master-data/departments` master and is stored as `app_users.department_id`; Role remains permission-oriented through `app_user_roles`. ฝ่าย is required for every create or update and the form deliberately has no “ไม่ระบุฝ่าย” choice. The Users table and mobile cards show ฝ่าย separately from Role, and the filter card supports Role, ฝ่าย, สาขา, and สถานะ. This separation prevents organizational labels such as บัญชี/คลัง/ฝ่ายขาย from becoming permission bundles.

As of 2026-07-10, `app_users.username` has been removed. Users log in and reset passwords by email only; the Users table/form no longer exposes a parallel username field. Existing audit/activity snapshot columns retain their historical `actor_username` names, but new records store the actor email in that compatibility field so history stays queryable without a separate username account identity.

As of 2026-07-11, the Roles tab is the `หน้าที่งานและสิทธิ์` management surface. A work function is a reusable template with a user-defined name, description, branch-scope policy, and a selected set of catalog permissions. User assignment is optional: a user may receive any number of templates and then set each catalog permission to inherit, explicitly allow, or explicitly deny. Effective permission is the union of active template permissions plus direct allows, minus direct denies. This is data-driven: no role code grants an implicit bypass and a missing `app_users` record has no legacy profile fallback. Why it stays this way: a team can configure access page-by-page for a person without multiplying organization departments or relying on special role names.

As of 2026-07-11, role permission selection is organized from the active Side menu rather than raw permission modules. The left column is an expandable Side menu category tree; selecting a page shows only that page's catalog actions in the adjacent column. A category is not itself a permission grant: the shell shows it only when the user can access at least one page in that category. Catalog entries that are not linked to a visible Side menu page remain visible in a separate system-permission area so existing access cannot disappear silently. The Side menu is still a code registry at this checkpoint; a future menu-management and drag/drop batch must persist the same registry in the database before changing navigation order or category placement at runtime.

As of 2026-07-11, `/admin/roles-permissions` has separate `Role ตามฝ่าย` and `สิทธิ์รายหน้า` tabs. The Role tab filters reusable work-function templates by the selected department based on real user assignments; it does not duplicate department ownership onto the role record. The permission tab selects either one Role or one user, then displays Side menu pages as a permission matrix whose columns are the registered actions for that page. Saving a Role updates its template permissions. Saving a user writes only direct `allow` overrides through `PUT /api/admin/users/:id/permission-overrides`; it does not overwrite that user's profile, department, branches, or assigned templates. Why it stays this way: a department remains an organizational fact, while a reusable Role and a single-user exception remain separate authorization mechanisms.

## Organization And Access Decision (2026-07-11)

Employee directory synchronization on 2026-07-11: migration `20260711110000_sync_employee_directory.sql` updates the approved employee names and primary departments, clears name prefixes, and removes explicit branch rows for the listed employees so their branch scope stays `ทุกสาขา`. It creates the directory row for `photsathon.spd1@gmail.com` without an `auth_user_id`; that person appears in the employee list and must be invited through the normal User Admin flow before they can sign in. The new-user form defaults its optional name prefix to `คุณ`; editing an existing employee does not overwrite their stored prefix. Role assignments and permission overrides are deliberately unchanged in this directory-only batch.

Role normalization follow-up on 2026-07-11: migration `20260711113000_normalize_employee_roles.sql` resets the approved directory users to `เจ้าหน้าที่` or `ผู้ดูแลระบบ`, so the `หน้าที่งาน` column on `/admin/users` matches the approved employee list. It deletes their legacy role assignments and direct permission overrides. `เจ้าหน้าที่` starts with no permission grant; `ผู้ดูแลระบบ` receives every active catalog permission through persisted `app_role_permissions`. What is what: the approved employee list is the only source for these users' Role. Why it stays this way: the organization explicitly reset the staff-role model, so old grants must not continue to affect access. The next permission batch configures pages/actions for each `ฝ่าย + Role` profile.

Employee modal follow-up on 2026-07-11: `หน้าที่งาน` is a single required dropdown, not a multi-select checkbox group. Its options are data-driven from `app_roles.is_employee_role`, currently `เจ้าหน้าที่`, `หัวหน้างาน`, `ผู้บริหาร`, and `ผู้ดูแลระบบ`. The create/update API also accepts exactly one active marked role, so a browser cannot save a different or multiple role assignment. Other active roles remain usable as permission templates in the Roles & Permissions area but do not appear as job titles in the employee modal. This keeps the employee directory's job label unambiguous while retaining configurable page/action permission templates.

The approved organization has four departments. Migration `20260711123000_sync_latest_employee_directory.sql` defines the current master as:

| Code | ฝ่าย | หมวด Side menu |
|---|---|---|
| `DEP-001` | บริหาร | ทั้งหมด |
| `DEP-002` | บัญชีและการเงิน | ประจำวัน, Stock, Dual Costing, Tracking 360 |
| `DEP-003` | ประสานงาน | Stock, ประจำวัน, Dual Costing, วางแผนการขาย |
| `DEP-004` | ผลิต | ผลิต, Stock, ส่งของ |

`DEP-005 คัดแยก` is merged into `DEP-004 ผลิต` and removed. The current employee directory contains 21 active users: the submitted 20-person list plus `peach@admin.com` as `ผู้ดูแลระบบ` in `บริหาร`. `ns-kwan@nsscrap.com` and `ns-or@nsscrap.com` are removed from `app_users`. Every listed employee has exactly one marked employee role and all-branch scope. The employee page defaults to active users so its first view represents the current workforce; clearing filters also returns to active users rather than all statuses. The status filter can still reveal other closed historical accounts if any remain.

`ผู้ดูแลระบบ` is a Role, not a department. The owner belongs to `DEP-001 บริหาร` and receives system-wide access only when assigned the `ผู้ดูแลระบบ` role. Migration `20260711103000_retire_admin_department.sql` removed the former admin department, and migration `20260711123000_sync_latest_employee_directory.sql` subsequently merged `DEP-005 คัดแยก` into production. Department codes are not renumbered.

This matrix controls category visibility only. Each category still expands into its registered pages and page actions, so a department-role can be granted a subset of its allowed pages/actions when needed. A user working across departments receives the union of the categories/pages granted through every active department-role assignment. The `ผู้ดูแลระบบ` role can be assigned in any department and receives all registered pages/actions through persisted grants, not through a department named ผู้ดูแลระบบ or a code bypass.

Role is not a department name. The approved standard roles are `เจ้าหน้าที่`, `หัวหน้างาน`, `ผู้บริหาร`, and `ผู้ดูแลระบบ`. A user may be assigned more than one department-role pair because one person can work across operational teams and each department can own access to multiple Side menu categories/pages.

Target assignment model:

```text
user
  -> primary department (employee/profile information)
  -> one or more department + role assignments
       -> page/action permissions for that department-role
  -> optional direct allow/deny override for an exceptional individual case
```

The effective permission set is the union of all active department-role grants, plus direct allows, minus direct denies. For example, a production employee who also supports coordination can receive grants from both operating scopes; the Side menu shows every category that contains at least one permitted page from either assignment. A category with no accessible pages stays hidden.

## User Invitation And Activation

New employees follow an invitation-first lifecycle. Creating an employee always stores the application account as `pending` / inactive and immediately sends a Supabase invitation. The employee remains unable to use protected application pages until one of these two paths completes:

```text
Normal path
create employee -> pending -> invitation sent -> employee sets password
  -> password-changed callback -> active (activation_source = invitation)

Admin override path
create employee -> pending -> invitation sent -> admin activates employee
  -> old invited Auth identity is removed so the invitation no longer controls activation
  -> active (activation_source = admin), credentials not ready
  -> admin chooses one credential path:
       A. send password reset/setup link -> employee sets password -> credentials ready
       B. issue one-time visible temporary password -> must_change_password = true
          -> employee logs in -> forced change-password page -> credentials ready
```

`account_status` is the lifecycle source of truth with `pending`, `active`, and `disabled`. The existing `active` boolean remains synchronized for permission guards and older authorization helpers. `invitation_sent_at`, `password_link_sent_at`, and `password_set_at` record delivery/readiness without inferring password state from `last_login_at`; a user can set a password before their first login. Admin activation records `activated_at`, `activated_by`, and `activation_source` for audit. Disabling an active account changes it to `disabled`; enabling it again is an Admin activation and does not send mail automatically.

The employee list opens on `active` by default, but after creating an employee it switches to the `pending` filter so the administrator can see the new row and resend a failed/expired invitation. When an administrator activates a pending employee, a compact credential-method dialog opens immediately. The recommended action sends a setup link; the alternative generates a strong temporary password on the server, stores it only in Supabase Auth, displays it once, and marks `must_change_password`. The raw password is never stored in application tables or audit metadata. The action menu allows invitation send/resend while pending, password setup/reset while active, and no credential email while disabled.

Why it stays this way: one global role cannot accurately represent a person who works across operating scopes, while creating combined role names for every cross-functional pairing causes unmaintainable role growth. Department-role assignments keep organization, job level, and page-level authority separate.

This is the approved target model. The deployed department master now has the five approved rows and `app_users.department_id` remains the employee's primary department. A dedicated migration to department-role assignments is still required before the multi-department model becomes runtime enforcement; the current role model is global `app_user_roles`.

## Current Gap

P3 proof completed from current code. Role/permission matrix future changes should update System Supporting Flows. Profile image upload/storage is not implemented yet; current contract stores an optional URL only. User department linkage is now implemented. The remaining authorization batch is to add persisted department-role assignments and migrate current global role grants without losing existing access; legacy role codes that describe departments must not remain the long-term governance model.

## Implementation Checklist

- [x] Verify current page/component API calls
- [x] Verify current API route methods and permission boundary
- [x] Keep business transaction side effects out of this page
- [x] Update this file if admin/system code changes
- [x] Split user registry route from role/permission route
