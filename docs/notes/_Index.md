---
title: NS Scrap ERP Index
aliases:
  - Project Home
  - NS Scrap ERP Home
tags:
  - ns-scrap-erp
  - moc
  - project/index
status: active
created: 2026-05-16
---

# NS Scrap ERP Index

หน้าเริ่มต้นของ vault สำหรับงาน rehabilitate และ refactor ระบบ NS Scrap ERP เดิม โดยยึดหลักว่า `old-apps/legacy/` เป็น archived source สำหรับ copy เฉพาะ logic/module ที่จำเป็นมาปรับใน `old-apps/vue/`

## Core Notes

- [[SRS]] - requirements กลาง, scope, role, module, tech stack และ phasing
- [[AGENTS]] - agent rules, safety rules, environment rules และ migration priority
- [[2026-05-16-project-decisions|Project Decisions]] - decision log ของโปรเจกต์
- [[Current Module Status]] - สถานะล่าสุดของ Vue modules ที่ย้ายเข้า `old-apps/vue/`
- [[Architecture Map]] - map สรุป architecture, tech stack, environment, database และ auth
- [[Migration Documents]] - MOC สำหรับเอกสาร migration ทั้งชุด

## Migration Entry Points

- [[docs/migration/README|Migration README]] - ภาพรวมชุดเอกสาร migration และลำดับอ่านที่แนะนำ
- [[01-current-state]] - baseline ของระบบเดิมและปัญหาโครงสร้าง
- [[02-master-plan]] - master plan และ phase หลัก
- [[09-implementation-tasklist]] - task list สำหรับลงมือทำ
- [[10-environment-status]] - Supabase, MCP, environment และข้อควรระวังปัจจุบัน

## Current Working Direction

- Refactor ระบบเดิมแบบเป็นขั้น ไม่ rewrite ทั้งหมด
- ใช้ Vue 3, Vite, TypeScript, Vue Router, Pinia, TanStack Query, Tailwind CSS, Zod, VueUse และ Supabase
- ใช้ Supabase `dev-target` สำหรับ development, Auth, RLS และ schema migration testing
- ใช้ `legacy-prod-source` เป็น read-only migration source เท่านั้น
- ห้ามแตะ secrets, production dumps หรือ `.env.local` เว้นแต่ได้รับคำสั่งชัดเจน
- module ที่เริ่ม CRUD แล้วคือ Branches, Warehouses และ Customers; module อื่นยังเป็น read-only pilot

## Phase Focus

1. Project structure และ development foundation
2. Security, users, roles และ permissions
3. Master data และ key basic data
4. Core transactions, inventory, finance และ reporting ตามลำดับความเสี่ยง

## Related Maps

- [[Migration Documents]]
- [[Architecture Map]]
