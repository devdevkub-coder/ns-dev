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

หน้าเริ่มต้นของ vault สำหรับงาน rehabilitate และ refactor ระบบ NS Scrap ERP เดิม โดยยึดหลักว่า `old-apps/legacy/` เป็น archived source และ `apps/next/` เป็น active app/deploy target ปัจจุบัน

## Core Notes

- [[REQUIREMENTS_TARGET_SYSTEM|Target Requirements]] - requirements กลาง, scope, role, module, tech stack และ phasing
- [[docs/migration/00-doc-index|Documentation Index]] - สารบัญกลางและ canonical source ของเอกสาร
- [[docs/migration/00-current-work|Current Work]] - สถานะล่าสุดและ next task
- [[AGENTS]] - agent rules, safety rules, environment rules และ migration priority
- [[2026-05-16-project-decisions|Project Decisions]] - decision log ของโปรเจกต์
- [[Current Module Status]] - สถานะล่าสุดของ Vue modules ที่ย้ายเข้า `old-apps/vue/`
- [[Architecture Map]] - map สรุป architecture, tech stack, environment, database และ auth
- [[Migration Documents]] - MOC สำหรับเอกสาร migration ทั้งชุด
- [[Purchase Flow]] - flow ซื้อแบบละเอียด: Stock/Trading, PO/Spot, ใบรับของ/WTI, ใบส่งของ/WTO, กรอกจำนวน/น้ำหนัก, ปิดรับไม่ครบ, เลขเอกสาร, สถานะ, ผลกระทบต่อ PO/PB/Stock/Cost Pool, และ `PB/payable handoff` ไป Payment Flow
- [[Cost Pool]] - กติกาแยกของ Cost Pool/Dual Costing: eligibility เฉพาะทองแดง/ทองเหลือง, source types, availability, short-close/reversal, API contract และ implementation gap
- [[Purchase Flow Status Matrix]] - matrix สถานะเอกสารราย use case และราย step สำหรับ PO/WTI/ADV/PB/PMA/PMT ใช้เป็น acceptance criteria ข้าม Purchase Flow กับ Payment Flow
- [[Payment Flow]] - flow จ่ายเงินแบบละเอียดและเป็นเจ้าของ approval/payment lifecycle: source payable, อนุมัติจ่ายเงิน, split approval, PMA, รอจ่าย, PMT, ประวัติการจ่ายเงิน, จ่ายเงินล่วงหน้า/มัดจำ, และคืนเงินมัดจำฝั่ง Supplier
- [[Purchase Flow Test Matrix]] - execution checklist ของ Purchase Flow สำหรับ UAT/smoke/regression ตั้งแต่ PO, WTI, Purchase Bill, Approval, Payment ไปจนถึง stock/reversal
- [[WTI Product Summary Design]] - design decision สำหรับการแยก `WTI` เป็น raw lot layer + per-product summary layer เพื่อให้ `บิลรับซื้อ` ใช้ยอดรวมต่อสินค้าได้โดยไม่เสีย trace ของ lot ชั่ง
- [[Document Timeline Policy]] - กฎกลางว่าเอกสารธุรกิจที่มีเลขเอกสารต้องมี timeline/history แบบ append-only แยกจาก current-state table
- [[Document History Table Design]] - target schema design สำหรับแยก history/status/usage table ตามเอกสารหรือ business flow แทนการรวมทุก event เข้า generic table เดียว
- [[Printable Documents]] - source of truth ของเอกสารที่ต้องพิมพ์/Save as PDF: PB, SB, WTI/WTO, PMA, PMT, RV, RCP และสถานะที่พิมพ์ได้ใน payment history
- [[Sales Flow]] - flow ขายแบบละเอียด: PO Sell, Pending Sale/PSALE, ใบส่งของ/WTO, บิลขาย Trading จากหลายบิลซื้อพร้อม stock line, Sales Bill, Receipt, เลขเอกสาร, สถานะ, stock/AR effect
- [[Daily Cash Flow]] - flow เงินสด/ธนาคารรายวัน โดยเริ่มจาก `/daily/transfer`: field ที่ระบบจัดการเอง, validation, และ paired bank statement side effect

## Migration Entry Points

- [[docs/migration/README|Migration README]] - ภาพรวมชุดเอกสาร migration และลำดับอ่านที่แนะนำ
- [[01-current-state]] - baseline ของระบบเดิมและปัญหาโครงสร้าง
- [[02-master-plan]] - master plan และ phase หลัก
- [[09-implementation-tasklist]] - task list สำหรับลงมือทำ
- [[10-environment-status]] - Supabase, MCP, environment และข้อควรระวังปัจจุบัน

## Current Working Direction

- Refactor ระบบเดิมแบบเป็นขั้น ไม่ rewrite ทั้งหมด
- active implementation/deploy target ปัจจุบันคือ Next.js ใน `apps/next/`; legacy/Vue baseline อยู่ใต้ `old-apps/` เพื่ออ้างอิงเท่านั้น
- ใช้ Supabase `dev-target` สำหรับ development, Auth, RLS และ schema migration testing
- ใช้ `legacy-prod-source` เป็น read-only migration source เท่านั้น
- ห้ามแตะ secrets, production dumps หรือ `.env.local` เว้นแต่ได้รับคำสั่งชัดเจน
- สถานะปัจจุบันให้ดู `docs/migration/00-current-work.md` และ tracker เฉพาะหมวด

## Phase Focus

1. Project structure และ development foundation
2. Security, users, roles และ permissions
3. Master data และ key basic data
4. Core transactions, inventory, finance และ reporting ตามลำดับความเสี่ยง

## Related Maps

- [[Migration Documents]]
- [[Architecture Map]]
- [[Purchase Flow]]
- [[Payment Flow]]
- [[Sales Flow]]
