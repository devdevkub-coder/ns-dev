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
- [[README|Notes Index]] - entrypoint กลางของ business/domain/page-flow notes
- [[AGENTS]] - agent rules, safety rules, environment rules และ migration priority
- [[2026-05-16-project-decisions|Project Decisions]] - decision log ของโปรเจกต์
- [[Current Module Status]] - สถานะล่าสุดของ Vue modules ที่ย้ายเข้า `old-apps/vue/`
- [[Architecture Map]] - map สรุป architecture, tech stack, environment, database และ auth
- [[System Supporting Flows]] - flow สนับสนุนที่ไม่ใช่ business transaction เช่น auth/session, users, role/permission, branch scope, audit, company profile และ health check
- [[P0 Transaction Stock Payment Current Code Baseline]] - decision ล่าสุดว่า Transaction/Stock/Payment กลุ่ม P0 proof กับ current Next code/API ครบแล้ว แต่ยังมี runtime hardening gaps ก่อน target-complete
- [[Master Data Current Code Baseline]] - decision ล่าสุดว่า Master Data ใน current Next code ถูกต้องแล้วและเป็น accepted baseline สำหรับเอกสารรายหน้า ไม่ต้องรอ legacy proof
- [[P1 Finance Production Current Code Baseline]] - decision ล่าสุดว่า Finance/Production/Daily read-model กลุ่ม P1 ใน current Next code/API ถูกต้องเป็น accepted baseline แล้ว เหลือเฉพาะ source/cutoff/status/write-side-effect reconciliation เมื่อปรับ behavior
- [[P2 Report Current Code Baseline]] - decision ล่าสุดว่า report/read-model กลุ่ม P2 ใน current Next code/API ถูกต้องเป็น accepted baseline แล้ว เหลือเฉพาะ formula/source/cutoff reconciliation เมื่อมีการปรับ report
- [[Migration Documents]] - MOC เดิมของเอกสาร migration; ใช้เป็น reference เพิ่มเติม ไม่ใช่ start-here หลัก
- [[Purchase Flow]] - flow ซื้อแบบละเอียด: Stock/Trading, PO/Spot, ใบรับของ/WTI, ใบส่งของ/WTO, กรอกจำนวน/น้ำหนัก, ปิดรับไม่ครบ, เลขเอกสาร, สถานะ, ผลกระทบต่อ PO/PB/Stock/Cost Pool, และ `PB/payable handoff` ไป Payment Flow
- [[WTI-WTO Flow]] - canonical flow ของหน้า `ชั่งสินค้า / รับ-ส่งของ` และ `รายการใบรับ-ส่งของ`: create/edit/list/detail/timeline, รูปสินค้า/รูปรถ, print/share, product thumbnail preload, และจุดตัด `WTI -> PB` / `WTO -> SB`
- [[Stock Ledger and Stock Balance]] - canonical note แยกความหมาย `stock_ledger` (movement fact) ออกจาก `stock คงเหลือ` (derived balance), รวม ownership ของ movement, key ที่ใช้ aggregate, และผลกระทบกับ `WTI/WTO/PB/SB`
- [[Stock Balance Page Flow]] - contract หน้า `/stock/balance`: derived balance, `คงเหลือจริง / จองไว้ / พร้อมใช้`, filter, drilldown และ hold-aware gap
- [[Stock Ledger Page Flow]] - contract หน้า `/stock/ledger`: movement history, source document links, reconciliation และ rule ว่า pending_out ไม่ใช่ ledger row
- [[Stock Transfer Page Flow]] - contract หน้า `/stock/transfer`: paired `ST` out/in ledger movement, no-revenue transfer, source/destination validation, source available/cost preview, doc/date/weight filters, total value และ draft-only edit/cancel policy
- [[Stock Status Convert Page Flow]] - contract หน้า `/stock/status-convert`: paired `SC` สำหรับแก้ classification ผิดระหว่าง RM/FG, update จำนวนใน bucket, ไม่ reprice WAC, ไม่ใช่ production/yield และ reverse/reconciliation gap
- [[Stock Convert Page Flow]] - contract หน้า `/stock/convert`: grade/product conversion `GA`, source-target cost/yield policy และ deferred confirm/reverse flow
- [[Stock Adjust Page Flow]] - contract หน้า `/stock/adjust`: stock count/cycle count correction `ADJ`, fixed reason options, แก้ไขได้ภายใน 7 วัน, ราคาต่อกก., มูลค่ารวม signed และ WAC/margin impact gap
- [[Dual Costing Flow]] - ภาพรวมหมวด Dual Costing ทั้ง 8 เมนู active: scope เฉพาะทองแดง/ทองเหลือง, Cost Pool -> Allocator -> Match Log/Ledger -> Report, และเส้นแบ่ง Deal Cost management view ออกจาก WAC/P&L
- [[Dual Costing Detailed Flow]] - คู่มือ flow Dual Costing แบบละเอียดสำหรับคุยงาน: Cost Pool, Waiting Allocations, Cost Allocator, Full Match Guard, Allocation Facts, Report และ Grade Adjustment/Regrade linkage
- [[Cost Pool]] - กติกาแยกของ Cost Pool/Dual Costing: eligibility เฉพาะทองแดง/ทองเหลือง, source types, availability, short-close/reversal, API contract และ implementation gap
- [[Purchase Flow Status Matrix]] - matrix สถานะเอกสารราย use case และราย step สำหรับ PO/WTI/ADV/PB/PMA/PMT ใช้เป็น acceptance criteria ข้าม Purchase Flow กับ Payment Flow
- [[Payment Flow]] - flow จ่ายเงินแบบละเอียดและเป็นเจ้าของ approval/payment lifecycle: source payable, อนุมัติจ่ายเงิน, split approval, PMA, รอจ่าย, PMT, ประวัติการจ่ายเงิน, จ่ายเงินล่วงหน้า/มัดจำ, และคืนเงินมัดจำฝั่ง Supplier
- [[Finance Debt Flow]] - ภาพรวมหมวด `การเงิน & หนี้`: Petty Advance, AR, AP, Bank Statement, Cash Position, Customer Advance, snapshot-first AR/AP read model, current APIs, legacy baseline, side effect boundary และ open gaps
- [[Petty Advance Page Flow]] - contract หน้า `/daily/petty-advance` ในหมวด `การเงิน & หนี้`: `PADV` ยอดค้าง, `PRET` คืนเงิน, จังหวะสร้าง `BST`, recipient snapshot และ allocation gap
- [[Finance AP Page Flow]] - contract หน้า `/finance/ap`: AP aging จาก `purchase_bills` balance snapshot, no AP channel filter จนกว่าจะมี purchase channel จริง, current no-credit-term policy, supplier summary, export และ PMA/PMT/Supplier Advance drilldown gap
- [[Finance AR Page Flow]] - contract หน้า `/finance/ar`: AR aging จาก `sales_bills` balance snapshot, SB/RCP/Customer Advance drilldown, due date/customer credit term และ no Pending Sale summary ใน target runtime
- [[Finance Bank Statement Page Flow]] - contract หน้า `/finance/bank`: read-only cash/bank ledger จาก `bank_statement`, running balance, source refs และ admin cleanup boundary
- [[Finance Cash Position Page Flow]] - contract หน้า `/finance/cash-position`: liquidity dashboard จาก accounts/bank statement/AR/AP exposure และ as-of/currency gap
- [[Main Dashboard Reports Flow]] - ภาพรวมหมวด Main / Dashboard & Reports และ `/reports`: current APIs, source tables/helpers, query params, response sections, management-read boundary, และ gap เรื่องสูตร/drilldown/export
- [[Reporting History Snapshot Policy]] - กฎกลางสำหรับ Dashboard/Report/Tracking ย้อนหลัง: แยก transaction facts, document snapshots, reporting snapshots, `as_of_date`, และ rollup รายวัน/รายเดือน/รายปี
- [[Finance And Accounting Menu Summary]] - summary รายเมนูของ `การเงิน & หนี้` และ `Finance / Accounting`: แต่ละหน้าคืออะไร, source/write boundary, AR/AP/Cash/Stock/Asset impact, และ month/year close freeze direction
- [[Finance Accounting Flow]] - ภาพรวมหมวด Finance / Accounting ทั้ง 21 เมนู: current APIs/policy UI, query params, source builders/tables, write-disabled design states, management-report boundary, และ gap เรื่อง GL/statutory close/tax/asset/loan write flows
- [[Fixed Assets Workflow]] - กระบวนการทำงานระบบทรัพย์สินถาวรแบบละเอียด: ตั้งแต่การตั้งค่าข้อมูลหลัก (หมวดหมู่/แผนก), การขึ้นทะเบียนทรัพย์สิน, การคิดค่าเสื่อมราคา, และการจำหน่ายทรัพย์สิน พร้อมสูตรคำนวณและกฎทางธุรกิจ
- [[Trading Flow]] - ภาพรวมหมวด `Trading / PO Reports`: Trading Dashboard แบบ trader/operator monitor, Trading Matching, PO Outstanding, ex-VAT GP, Sales Bill-led Trading allocation, Matched COGS, buy-side remaining cost, PO commitment report, และ side-effect boundary ว่า Trading ไม่เขียน stock ledger/WAC
- [[Tracking 360 Flow]] - ภาพรวมหมวด `Tracking 360`: Customer, Supplier, Product tracking จาก SB/RCP, PB/PMT และ stock ledger พร้อม read-only/export boundary และ gap เรื่อง drilldown/source timeline
- [[Purchase Flow Test Matrix]] - execution checklist ของ Purchase Flow สำหรับ UAT/smoke/regression ตั้งแต่ PO, WTI, Purchase Bill, Approval, Payment ไปจนถึง stock/reversal
- [[WTI Product Summary Design]] - design decision สำหรับการแยก `WTI` เป็น raw lot layer + per-product summary layer เพื่อให้ `บิลรับซื้อ` ใช้ยอดรวมต่อสินค้าได้โดยไม่เสีย trace ของ lot ชั่ง
- [[Document Timeline Policy]] - กฎกลางว่าเอกสารธุรกิจที่มีเลขเอกสารต้องมี timeline/history แบบ append-only แยกจาก current-state table
- [[Document History Table Design]] - target schema design สำหรับแยก history/status/usage table ตามเอกสารหรือ business flow แทนการรวมทุก event เข้า generic table เดียว
- [[Document Aging Policy]] - กติกากลางสำหรับ aging เอกสาร `PB/SB/WTI/WTO/POB/POS`: แยก financial due aging จาก operational pending aging, bucket, stop-counting rule, และ API/report direction
- [[Menu Page Flow Catalog]] - catalog flow ครบ 107 route ตามเมนูใหม่เท่านั้น พร้อม link ไปเอกสารละเอียด และใช้ legacy เป็น baseline เฉพาะหน้าที่อยู่ในเมนูใหม่แต่ Next flow ยังไม่ครบ
- [[page-flows/README|Page Flow Index]] - index ไฟล์รายหน้า 107 route ในเมนูใหม่ ทุกไฟล์มี minimum detailed contract; batch แรกเริ่มขยายรายละเอียดเฉพาะหน้าแล้วในกลุ่ม Purchase, Sales, Payment และ Stock พร้อม Current API ต่อหน้า
- [[Page Flow Proof Tracker]] - tracker ว่าไม่เหลือหน้า missing page-flow แล้ว; P0/P1/P2/P3 ทำ current-code proof baseline แล้ว เหลือ runtime hardening หลักใน P0 transaction/stock/payment gaps
- [[PO Buy Page Flow]] - contract หน้า `/purchase/po-buy`: `POB` เป็น commitment เท่านั้น ไม่สร้าง stock/AP เอง, มี close-short, allocation boundary ไป PB, print, aging และ runtime checklist
- [[Printable Documents]] - source of truth ของเอกสารที่ต้องพิมพ์/Save as PDF: POB, PB, SB, WTI/WTO, PMA, PMT, RV, RCP และสถานะที่พิมพ์ได้ใน payment history
- [[Sales Flow]] - flow ขายแบบละเอียด: PO Sell, ใบส่งของ/WTO พร้อม pending_out, บิลขาย Trading จากหลายบิลซื้อหรือรายการ Trading ที่ไม่ตัด stock, Sales Bill, Receipt, เลขเอกสาร, สถานะ, stock/AR effect
- [[Pending Sale Page Flow]] - removed target-flow note ของหน้า `/sales/stock-issue`: legacy `PSALE` เก็บไว้เป็น reference เท่านั้น; target runtime ใช้ `WTO -> pending_out -> Sales Bill`
- [[Sales Bills Page Flow]] - contract หน้า `/sales/bills`: สร้าง SB จาก WTO, allocate เข้า PO Sell รายบรรทัด, แยกยอดเกินเป็น Spot Sale, VAT/totals แบบ PB, และหักมัดจำ Customer
- [[Production Flow]] - canonical flow หมวด `การผลิต`: production order, input, output, process cost, WIP, yield/loss, ref type `PI/PO2`, และสถานะ implementation read baseline
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
