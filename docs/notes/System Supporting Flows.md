---
title: System Supporting Flows
tags:
  - system-flow
  - auth
  - permissions
status: draft
updated: 2026-08-19
---

# System Supporting Flows

เอกสารนี้แยก flow ที่ไม่ใช่ business transaction ออกจาก page-flow รายหน้า เช่น login, session, permission, branch scope, audit และ platform health เพื่อไม่ให้ปนกับ Purchase/Sales/Payment/Stock flow

## Scope

- Login/session/current user
- Role/permission matrix
- Branch access scope
- Admin user management
- Audit/activity log
- System settings/company profile ที่เป็น platform support
- Health check และ auth event log

## Non-Business Rule

- เอกสารนี้ไม่กำหนด stock, payment, AR/AP, PO/PB/SB หรือ production side effects
- Business document API ต้อง enforce auth/permission/branch scope จาก platform layer แต่ business lifecycle อยู่ใน page-flow ของแต่ละหน้า
- หน้า business ต้องไม่แก้ user/role/session state ระหว่าง transaction

## Current API Inventory

| Area | Current API | Purpose |
|---|---|---|
| Auth | `GET /api/auth/me` | อ่าน current authenticated user/session context |
| Auth | `POST /api/auth/login-complete` | ยืนยัน session หลัง password login, ตรวจ app user แบบ identity-only, บันทึกเวลา login และ auth audit |
| Auth | `POST /api/auth/forgot-password` | request reset password flow |
| Auth | `POST /api/auth/password-changed` | record/handle password changed state |
| Admin users | `GET/POST /api/admin/users` | list/create/manage users |
| Admin user detail | `GET/PATCH /api/admin/users/[id]` | user detail/update |
| User invite | `POST /api/admin/users/[id]/invite` | invite flow |
| User status | `POST /api/admin/users/[id]/status` | enable/disable user |
| Auth events | `GET /api/admin/auth-events` | auth/security event list |
| Activity | `GET /api/activity` | activity feed |
| Audit | `GET /api/admin/audit` is not currently present; active audit page must confirm source before runtime change |
| Company profile | `GET/POST /api/admin/company-profile` | company print/header profile |
| System settings | route page exists; API contract must be confirmed before runtime change |
| Health | `GET /api/health` | platform health check |

## Platform Contract

- Application user identity must come from Supabase Auth / `auth.users`, not application password tables
- Business APIs must derive actor/user from authenticated context, not from form payload
- Branch-scoped pages must filter options and writes by branch access policy
- Admin/Owner may have broader branch visibility, but UI labels such as `ทุกสาขา` must mean every branch the user is allowed to access
- Document numbers, actor, created date, created by, and audit timestamps are server-owned
- Business transaction APIs must fail closed when user/branch permission cannot be resolved

## Password Login Completion Performance Contract

1. Browser เรียก Supabase `signInWithPassword` เพื่อยืนยัน credential และรับ session
2. `POST /api/auth/login-complete` ตรวจ session ฝั่ง server และอ่านเฉพาะ `auth_user_id`, `active`, `id`, display name/email และสถานะเปลี่ยน password ของ `app_users`; ไม่โหลด role, permission หรือ branch ซ้ำในขั้นตอนนี้
3. ระบบบันทึก `last_login_at` และเขียน `app_audit_logs` กับ `app_auth_events` ใน transaction เดียวกัน ให้ครบก่อนตอบ success; หากงานใดล้มเหลวต้อง rollback ทั้งชุด
4. Response ใช้ `private, no-store` และ `Server-Timing` แยก `auth`, `app_user`, `last_login`, `audit`, `total` เพื่อวัด latency โดยไม่บันทึก password, token หรือ secret
5. หลัง redirect หน้า `/api/auth/me` จึงโหลด context เต็มสำหรับ permission และ branch scope; login completion ไม่ใช้ fallback จาก `getSession()` เพื่ออนุญาตสิทธิ์
6. `AppShell` ต้อง invalidate summary cache เมื่ออยู่บนหน้า auth และเมื่อได้รับ `ns-scrap-erp:auth-identity-changed` เพื่อไม่ให้ account switch ใช้ permission/role summary ของบัญชีเดิม

## Page Separation Rule

Business page-flow files should reference this document only for cross-cutting platform behavior. They should not embed login/session implementation details unless the page itself is an Admin/System page.

## Open Questions

- Final role matrix per menu/page/action is not fully documented yet
- Branch access enforcement needs a dedicated matrix by route and API
- Admin audit page source table/API needs confirmation from current implementation
