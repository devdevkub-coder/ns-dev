---
title: Backup / Restore Page Flow
tags:
  - page-flow
  - menu
  - admin-system
status: accepted-baseline
updated: 2026-06-11
route: /admin/migration-tools
---

# Backup / Restore Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Admin / System |
| Route | `/admin/migration-tools` |
| Page | Backup / Restore |
| Current Next | accepted code baseline |

## Canonical References

[[System Supporting Flows]], [[Menu Page Flow Catalog]]

## Flow Baseline

admin maintenance UI; current code has page component but no page-specific API route

## Page Responsibilities

- แสดง maintenance/migration tools ตาม current component
- ใช้เป็น support page สำหรับการ migrate/backup/restore ที่ต้องมี runbook
- ต้องแยก high-risk operation ออกจาก business transaction flow

## Non-Responsibilities

- ไม่ควร execute destructive DB operation โดยไม่มี explicit runbook/confirmation
- ไม่เป็น replacement ของ Supabase migration process
- ไม่ commit dumps/secrets/env files

## Lifecycle / Support Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | render current MigrationToolsPageClient |
| 2 | เลือก operation | ต้องอ้าง runbook/confirmation ก่อนเปิด runtime action |
| 3 | execute target future | ต้องใช้ approved API/tool แยกและ audit |
| 4 | audit | บันทึก actor/time/result |

## API / Data Contract

### Current API

- `No page-specific /api/admin/migration-tools route in current code`

### Data Contract

- user identity ต้องมาจาก authenticated context ไม่รับ actor จาก form
- admin/support action ต้อง enforce permission ที่ API ระบุ
- admin/support pages ต้องไม่เขียน business transaction facts
- current code ใน `apps/next` เป็น proof baseline ของ P3 admin/system ณ 2026-06-11

## Validation / Status Rules

- high-risk action ต้อง require explicit confirmation
- ต้องห้าม secrets/dumps ใน repo
- current code เป็น proof baseline ว่ายังไม่มี write API เฉพาะหน้า

## Side Effects

- current page has no confirmed transaction side effect
- future operations must be separately documented

## Current Gap

P3 proof completed from current code. Gap is intentional: no page-specific API route today.

## Table Mechanics Checkpoint - 2026-07-02

What is what:
- Snapshot auto-backup is the only table-like surface on this support page today. It represents browser-local backup snapshots once the future write flow is approved.
- Current runtime state is still an empty-state table; no snapshot row action is live.

Why it has to be like this:
- The table must share the active Cost Pool table mechanics so admin/support pages do not look or behave like a separate legacy UI.
- Backup, restore, sync, migration, and reset actions are high-risk operations, so this checkpoint intentionally changes only table presentation and keeps destructive behavior disabled until a separate runbook/API/audit design exists.

Implementation note:
- The Snapshot table now uses sortable `ResizableTableHead` headers, persisted resizable column widths, a reset-width control, `colgroup`, and fixed table layout.
- No page-specific API, permission, localStorage write/delete, cloud sync, Supabase, or DB behavior changed.

## Implementation Checklist

- [x] Verify current page/component API calls
- [x] Verify current API route methods and permission boundary
- [x] Keep business transaction side effects out of this page
- [ ] Update this file if admin/system code changes
