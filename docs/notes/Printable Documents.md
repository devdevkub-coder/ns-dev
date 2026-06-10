---
title: Printable Documents
aliases:
  - เอกสารพิมพ์
  - Print Documents
  - Document Print Backlog
tags:
  - ns-scrap-erp
  - print
  - document
  - business-flow
status: draft
created: 2026-06-09
updated: 2026-06-10
---

# Printable Documents / เอกสารที่ต้องพิมพ์

เอกสารนี้เป็น source of truth กลางสำหรับรายการเอกสารธุรกิจที่ต้องมี print/Save as PDF ใน active Next app โดยอิงจาก legacy `old-apps/legacy/index.html` และ flow target ปัจจุบัน

หลักทั่วไป:

- เอกสารพิมพ์ต้องใช้ข้อมูลหัวกระดาษจาก `/admin/company-profile` หรือ `ข้อมูลบริษัท (สำหรับใบพิมพ์)` เป็นหลัก
- เอกสารพิมพ์ต้องเป็น snapshot/read-model ของเอกสารนั้น ห้ามกดพิมพ์แล้วเกิด side effect เช่น สร้าง `PMA`, `PMT`, `BST`, stock ledger, หรือแก้สถานะ
- เอกสารที่ถูกยกเลิกแล้วยังพิมพ์สำเนาได้ แต่ต้องแสดงสถานะ/ลายน้ำยกเลิกให้ชัด
- รายการสินค้า/เงินต้องแสดงหน่วยจริงและยอด snapshot ของเอกสาร ไม่ resolve จาก master data ปัจจุบันถ้าทำให้ประวัติเปลี่ยน
- รายงาน/dashboard ที่ใช้ `window.print()` เพื่อพิมพ์หน้าจอ ไม่ถือเป็นเอกสารธุรกิจใน backlog นี้

## รายการเอกสารพิมพ์

| Priority | เอกสาร | Route หลัก | สถานะ Next | Legacy evidence | หมายเหตุ |
|---|---|---|---|---|---|
| P0 | `POB` PO Buy / ใบสั่งซื้อ | `/purchase/po-buy` | Implemented | Legacy PO Buy อยู่ใน flow จองซื้อ/สั่งซื้อก่อนรับของ; active target ใช้เลข `POB...` เป็นเอกสารซื้อหลักก่อน PB | ใช้ corporate A4 portrait ที่อ้างอิง design บิลซื้อ, Company Profile header, พิมพ์จาก list/detail modal, แสดง Supplier พร้อมที่อยู่, รายการสินค้าครบพร้อมหน่วยจริง, ยอดสั่งซื้อ/คงเหลือ, หมายเหตุ, ช่องลงนาม และลายน้ำเฉพาะกรณียกเลิก |
| P0 | `PB` บิลรับซื้อ / ใบรับสินค้า | `/purchase/bills` | Implemented | `erp.printDocument('receipt', row.raw.id)` ที่ `old-apps/legacy/index.html:15119`, helper ที่ `old-apps/legacy/index.html:6449` | ใช้ corporate A4 portrait, Company Profile header, พิมพ์จาก list/detail/direct detail, รองรับ multi-page สำหรับ 30+ รายการ |
| P0 | `SB` บิลขาย / ใบส่งของ | `/sales/bills` | Implemented print, allocation hardening follow-up | `erp.printDocument('delivery', b.id)` ที่ `old-apps/legacy/index.html:20390`, helper เดียวกับ PB ที่ `old-apps/legacy/index.html:6449` | ใช้ flow `WTO -> SB` ตาม [[Sales Bills Page Flow]], A4 portrait/multi-page/totals baseline เดียวกับ PB, Company Profile ตามสาขา, แสดง Customer, WTO trace, VAT, หักมัดจำ Customer, และยอดลูกหนี้สุทธิ; follow-up คือแสดง `PO Sell`/`Spot Sale` จาก line-level allocation facts เมื่อ write flow แยก allocation ครบ |
| P0 | `WTI/WTO` ใบรับของ/ใบส่งของจากงานชั่ง | `/daily/weight-ticket-list` | Implemented print, share/audit follow-up | `printWeighingTicket(ticket)` และปุ่ม `ใบชั่ง` ที่ `old-apps/legacy/index.html:52560` ถึง `old-apps/legacy/index.html:52985` | Active helper รองรับ WTI/WTO แล้ว; ต้องคง template ที่เน้นน้ำหนัก/สิ่งเจือปน/รูป/ทะเบียนรถ |
| P1 | `PMA` ใบอนุมัติจ่ายเงิน / ส่ง Cashier | `/daily/payment-approval`, `/purchase/payments` | Required follow-up | `printApprovalSheet` และปุ่ม `พิมพ์ใบอนุมัติส่ง Cashier` ที่ `old-apps/legacy/index.html:27680` ถึง `old-apps/legacy/index.html:27773` | ต้องพิมพ์จาก approval snapshot หลังเกิด PMA แล้ว ไม่พิมพ์จาก pending source live row |
| P1 | `PMT` Payment Voucher / ใบสำคัญจ่าย | `/purchase/payments?tab=history` | Partial: daily report implemented, per-voucher print follow-up | Legacy payment-history evidence ไม่ชัดเท่า PB/SB/PMA แต่ active UI มี shell `ดู/พิมพ์` ใน history | ต้องอยู่ในแท็บประวัติเท่านั้น เพราะ PMT เป็นเอกสารหลังจ่ายจริงหรือหลังยกเลิก |
| P1 | `RV` ใบสำคัญรับเงิน | `/purchase/receipt-vouchers` | Partial / needs hardening | print preview `ใบสำคัญรับเงิน` ที่ `old-apps/legacy/index.html:42980` ถึง `old-apps/legacy/index.html:43240` | Active มี preview แล้ว แต่ต้อง harden ให้ใช้ Company Profile/snapshot และแก้ fallback payment method |
| P2 | `RCP` Receipt Voucher / ใบรับเงิน Customer | `/sales/receipts` | Required follow-up | Legacy direct evidence ไม่ชัดใน print helper แต่ flow target ต้องมีหลักฐานรับเงินลูกค้า | ควรใช้หลักเดียวกับ PMT: พิมพ์จาก history หลังเกิด receipt แล้ว |

## Payment History Print Status

เอกสารใน `/purchase/payments?tab=history` ต้องพิมพ์จากสถานะ snapshot ที่จบเหตุการณ์แล้วเท่านั้น

| แถวในประวัติ | เอกสารที่พิมพ์ | พิมพ์ได้หรือไม่ | เหตุผล |
|---|---|---|---|
| `PMT` status `จ่ายแล้ว` | Payment Voucher / ใบสำคัญจ่าย | ได้ | มีการจ่ายจริงแล้ว มี `PMT`, bank/payment split, และ payment timeline |
| `PMT` status `ยกเลิก` | Payment Voucher ฉบับยกเลิก / สำเนาการยกเลิกการจ่าย | ได้ | ต้องใช้เป็นหลักฐาน audit ว่าเคยจ่ายแล้วถูก cancel/reverse; เอกสารต้องมีลายน้ำ/สถานะ `ยกเลิก` |
| `PMA` voided ที่ยังไม่มี `PMT` | ใบยกเลิกรายการอนุมัติจ่าย / PMA void snapshot | ได้ แต่ไม่ใช่ Payment Voucher | ยังไม่เกิดการจ่ายจริง จึงห้ามพิมพ์เป็น PMT; ใช้แสดงว่า approval item ถูกยกเลิกก่อนจ่าย |
| `PMA` status `รอจ่าย` ใน queue | ไม่มีเอกสาร PMT | ไม่ได้จาก history | ยังอยู่ในแท็บ `จ่ายเงิน Supplier`; ถ้าต้องพิมพ์ให้ใช้เอกสาร PMA approval sheet ไม่ใช่ PMT |
| `PB/ADV/EXP` pending source | ไม่มีเอกสารจ่าย | ไม่ได้ | ยังไม่อนุมัติและยังไม่เกิด snapshot PMA/PMT |

กติกา UI:

- ปุ่ม `ดู/พิมพ์` ของ payment history ควรอยู่ในแท็บ `ประวัติ` ของ `/purchase/payments`
- Implemented 2026-06-09: แท็บ `ประวัติ` มี action `พิมพ์รายงานประจำวัน` เพื่อออกเอกสารรวมรายการจ่ายประจำวันสำหรับฝ่ายบัญชี/การเงิน
- เอกสารพิมพ์ประจำวันต้องใช้ date filter ของ history เป็น source หลัก; แท็บประวัติการจ่ายเงินต้อง default filter วันที่เป็นวันที่ปัจจุบันของ timezone ระบบ/ผู้ใช้ตอนเปิดหน้า/เข้าแท็บ แต่ปุ่มล้าง filter ต้องล้างเป็นทุกวัน
- Per user clarification on 2026-06-09, daily print ข้าม `PMA` ไปก่อนและรวมเฉพาะ PMT ในช่วงวันที่นั้น ได้แก่ `PMT จ่ายแล้ว` และ `PMT ยกเลิก`
- เอกสารพิมพ์ประจำวันต้องมีหัวบริษัท, วันที่รายงาน, เวลาพิมพ์, summary จำนวน `PMT ทั้งหมด`, จำนวน `จ่ายแล้ว`, จำนวน `ยกเลิก`, ยอดเงินออกสุทธิ, และตารางรายการ PMT/source/ผู้รับเงิน/บัญชี/ยอดเงิน/สถานะ
- ยอดรวมสำหรับ downstream cash-out ต้องนับเฉพาะ `PMT จ่ายแล้ว`; `PMT ยกเลิก` แสดงเพื่อ audit แต่ไม่รวมเป็นยอดเงินออกสุทธิ
- row click ยังคงเปิด detail modal ได้; ปุ่มพิมพ์ต้องไม่เปิด route แยก `/purchase/payments/{id}`
- ถ้า row เป็น direct `EXP -> PMT` ที่ไม่มี `PMA`, เอกสาร PMT ต้องแสดง source เป็น `EXP...` จาก `payments.lines.sourceDocNo`
- ถ้า row เป็น `PMA voided` ที่ไม่มี PMT, modal/print ต้องใช้ heading ว่า `รายละเอียดอนุมัติจ่าย / PMA` หรือ `ใบยกเลิกรายการอนุมัติจ่าย` ไม่ใช้คำว่า Payment Voucher
- downstream accounting/report/bank posting ต้องใช้เฉพาะ `PMT จ่ายแล้ว`; print ของ `ยกเลิก` เป็น audit copy ไม่ใช่ posted cash-out

## Implementation Order

1. `SB` บิลขาย / ใบส่งของ: print รายใบ implemented แล้ว; follow-up คือ harden line-level `PO Sell`/`Spot Sale` allocation display หลัง sync write flow `WTO -> SB` แยก allocation facts ครบ
2. `PMT` payment history print: daily report implemented; follow-up คือ per-voucher print รายใบจาก history
3. `PMA` approval sheet: ทำจาก `payment_approvals` snapshot สำหรับส่ง Cashier/approval record
4. `RV` hardening: ปรับ receipt voucher print ให้ใช้ Company Profile และ snapshot fields ครบ
5. `RCP` customer receipt print: ทำจาก sales receipt history หลัง receipt สำเร็จ
