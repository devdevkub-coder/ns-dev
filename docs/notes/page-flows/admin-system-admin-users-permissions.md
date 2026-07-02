---
title: Users & Permissions Page Flow
tags:
  - page-flow
  - menu
  - admin-system
status: accepted-baseline
updated: 2026-07-02
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

- `/admin/users`: list users and active branches จาก `/api/admin/users`
- `/admin/users`: create/update app user with roleIds, branchIds, profile fields, and contact fields
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
| 1 | เปิด `/admin/users` | GET users/roles/branches |
| 2 | สร้าง user | POST username/displayName/email/roleIds/branchIds |
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

## API / Data Contract

### Current API

- `GET /api/admin/users - users/roles/branches`
- `POST /api/admin/users - create app user`
- `PATCH /api/admin/users/[id] - update app user roles/branches`
- `PATCH /api/admin/users/[id]/status - active/inactive user`
- `POST /api/admin/users/[id]/invite - invite or reset password`

### Data Contract

- user identity ต้องมาจาก authenticated context ไม่รับ actor จาก form
- password/auth state อยู่ใน Supabase Auth; `app_users` เก็บเฉพาะข้อมูลผู้ใช้ของระบบ, profile, role และ branch access
- admin/support action ต้อง enforce permission ที่ API ระบุ
- admin/support pages ต้องไม่เขียน business transaction facts
- current code ใน `apps/next` เป็น proof baseline ของ P3 admin/system ณ 2026-06-11

## Validation / Status Rules

- requires permission `system.users.manage` for both `/admin/users` and `/admin/roles-permissions`
- username/displayName/email required; email format basic validated in client and server schema
- profile/contact fields are optional; `profileImageUrl` must be an http/https URL when provided
- roleIds required อย่างน้อย 1
- branchIds resolve จาก active branch code
- ห้ามปิดบัญชีตัวเอง
- invite requires email and active user; service role required for new invite path

## Side Effects

- writes app_users/app_user_roles/app_user_branch_access
- may call Supabase Auth invite/reset
- records auth audit events
- ไม่มี business transaction side effect

## UI Table Mechanics

As of 2026-07-02, the Users and Roles desktop tables follow the active Cost Pool / Weight Ticket table mechanics: sortable `ResizableTableHead` business headers, persisted resizable column widths, reset-width control, `colgroup`, fixed table layout, and mobile card lists rendered from the same sorted row sets as desktop. This is presentation-only; admin user APIs, Supabase Auth invite/reset flow, permission checks, role matrix semantics, branch access writes, audit events, and DB state remain unchanged.

As of 2026-07-02, `/admin/users` summary cards intentionally show only active users and users who must change password. Branch access remains available in the user table and edit form, but the branch-scoped summary card was removed because it is not a primary user-management action.

## Current Gap

P3 proof completed from current code. Role/permission matrix future changes should update System Supporting Flows. Profile image upload/storage is not implemented yet; current contract stores an optional URL only. User department linkage is still a follow-up because `departments` exists as master data, but `app_users` does not yet reference it.

## Implementation Checklist

- [x] Verify current page/component API calls
- [x] Verify current API route methods and permission boundary
- [x] Keep business transaction side effects out of this page
- [x] Update this file if admin/system code changes
- [x] Split user registry route from role/permission route
