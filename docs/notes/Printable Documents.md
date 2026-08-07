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
updated: 2026-08-07
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
| P0 | `POB` PO Buy / ใบสั่งซื้อ | `/purchase/po-buy` | Implemented | Legacy PO Buy อยู่ใน flow จองซื้อ/สั่งซื้อก่อนรับของ; active target ใช้เลข `POB...` เป็นเอกสารซื้อหลักก่อน PB | ใช้ corporate A4 portrait ที่อ้างอิง design บิลซื้อ, Company Profile header, พิมพ์จาก list/detail modal, แสดง Supplier พร้อมที่อยู่, รายการสินค้าครบพร้อมหน่วยจริง, ยอดสั่งซื้อ/คงเหลือ, หมายเหตุ, ช่องลงนาม และลายน้ำเฉพาะกรณียกเลิก; ตารางแบ่งหน้าละ 15 รายการและเพิ่มหน้าได้ต่อเนื่อง |
| P0 | `PB` บิลรับซื้อ / ใบรับสินค้า | `/purchase/bills` | Implemented | `erp.printDocument('receipt', row.raw.id)` ที่ `old-apps/legacy/index.html:15119`, helper ที่ `old-apps/legacy/index.html:6449` | ใช้ corporate A4 portrait, Company Profile header, พิมพ์จาก list/detail/direct detail, รองรับหลายหน้าแบบไม่จำกัดที่ 2 หน้า โดยแบ่งหน้าละ 15 รายการ |
| P0 | `SB` บิลขาย / ใบส่งของ | `/sales/bills` | Implemented print, allocation hardening follow-up | `erp.printDocument('delivery', b.id)` ที่ `old-apps/legacy/index.html:20390`, helper เดียวกับ PB ที่ `old-apps/legacy/index.html:6449` | ใช้ flow `WTO -> SB` ตาม [[Sales Bills Page Flow]], A4 portrait/N-page/totals baseline เดียวกับ PB, Company Profile ตามสาขา, แสดง Customer, WTO trace, VAT, หักมัดจำ Customer, และยอดลูกหนี้สุทธิ; follow-up คือแสดง `PO Sell`/`Spot Sale` จาก line-level allocation facts เมื่อ write flow แยก allocation ครบ |
| P0 | `WTI/WTO` ใบรับของ/ใบส่งของจากงานชั่ง | `/daily/weight-ticket-list` | Implemented print, share/audit follow-up | `printWeighingTicket(ticket)` และปุ่ม `ใบชั่ง` ที่ `old-apps/legacy/index.html:52560` ถึง `old-apps/legacy/index.html:52985` | Active helper รองรับ WTI/WTO แล้ว; PDF ต้องให้หน้าแรกเป็นใบพิมพ์ A4 ที่ตรงกับตัวพิมพ์และจบใน 1 หน้าเมื่อเป็นเอกสารความหนาแน่นปกติ โดยเน้นน้ำหนัก/สิ่งเจือปน/ทะเบียนรถ/ลายเซ็น จากนั้นต่อหน้า 2+ เป็นหน้าอัลบั้มรูปหลักฐานจากรูปรถและรูปสินค้า |
| P1 | `PMA` ใบอนุมัติจ่ายเงิน / ส่ง Cashier | `/daily/payment-approval`, `/purchase/payments` | Required follow-up | `printApprovalSheet` และปุ่ม `พิมพ์ใบอนุมัติส่ง Cashier` ที่ `old-apps/legacy/index.html:27680` ถึง `old-apps/legacy/index.html:27773` | ต้องพิมพ์จาก approval snapshot หลังเกิด PMA แล้ว ไม่พิมพ์จาก pending source live row |
| P1 | `PMT` Payment Voucher / ใบสำคัญจ่าย | `/purchase/payments?tab=history` | Partial: daily report implemented, per-voucher print follow-up | Legacy payment-history evidence ไม่ชัดเท่า PB/SB/PMA แต่ active UI มี shell `ดู/พิมพ์` ใน history | ต้องอยู่ในแท็บประวัติเท่านั้น เพราะ PMT เป็นเอกสารหลังจ่ายจริงหรือหลังยกเลิก |
| P1 | `RV` ใบสำคัญรับเงิน Supplier | `/purchase/receipt-vouchers` | Partial: manual create/edit/print implemented, cancel/status follow-up | legacy `view-receiptVoucher` ที่ `old-apps/legacy/index.html:42799` ถึง `old-apps/legacy/index.html:43240` | ใช้ให้ Supplier/ผู้รับเงินเซ็นรับเงินสดจากบริษัทเท่านั้น active modal เลือก Supplier เพื่อเติมข้อมูลผู้รับเงิน และเลือก PB optional เพื่อเติมรายการ/ยอดอัตโนมัติ ไม่ใช่ payment posting owner และไม่ใช้กับโอนเงิน/เช็ค; active print ใช้ compact A4 template ที่ใกล้ legacy print density พร้อม Company Profile header, receiver/company text blocks, item table, unit-separated quantity summary, amount text, signer blocks; ยังต้อง harden signer/payment method policy และ status/cancel watermark |
| P2 | `RCP` Receipt Voucher / ใบรับเงิน Customer | `/sales/receipts` | Required follow-up | legacy customer receipt component อยู่ใน flow `รับเงิน Customer` และรองรับหลายบิลต่อ voucher | แยกจาก `RV`; ควรใช้หลักเดียวกับ PMT คือพิมพ์จาก receipt history หลังเกิด receipt แล้ว และผูก bank statement/AR settlement |

## 2026-08-07 Unlimited Corporate Pagination Contract

- เอกสารตารางแบบ corporate ที่ปรับใน batch นี้ ได้แก่ `POB`, `PB`, `SB`, `PO Sell`, `ADV` และ `RV` ใช้กติกากลางหน้าละ 15 รายการ และสร้างหน้า `1..N` ตามจำนวนข้อมูลจริงโดยไม่จำกัดสูงสุดไว้ที่ 2 หน้า
- ตัวอย่าง boundary: 15 รายการ = 1 หน้า, 16 รายการ = 2 หน้า, 31 รายการ = 3 หน้า และ 46 รายการ = 4 หน้า; ทุกหน้าต้องมีแถวตารางรวม 15 ช่องและเลขหน้า `หน้า X / N`
- หน้า `1..N-1` แสดงยอด/หมายเหตุเป็น `-`, มีข้อความ `Continued on Page X` และไม่มีช่องลงนาม เพื่อไม่ให้ยอดระหว่างทางถูกเข้าใจว่าเป็นยอดเอกสารฉบับสมบูรณ์
- หน้า `N` เท่านั้นที่แสดงยอดจริง หมายเหตุ และช่องลงนาม โดยยังคง Company Profile, document snapshot, cancelled watermark, table header และข้อมูลเอกสารบนทุกหน้า
- การพิมพ์ยังเป็น read-only: การแบ่งหน้าไม่สร้างหรือแก้เอกสาร, payment, stock, allocation, cache, API, DB หรือ Storage
- `WTI/WTO` เป็นข้อยกเว้นด้านความจุ เพราะหน้าแรกเป็นแบบฟอร์มชั่งและหน้า 2+ เป็นอัลบั้มหลักฐาน; helper เดิมรองรับจำนวนหน้าอัตโนมัติอยู่แล้วและไม่ถูกบังคับเป็น 15 รูป/รายการต่อหน้า

## Payment History Print Status

เอกสารใน `/purchase/payments?tab=history` ต้องพิมพ์จากสถานะ snapshot ที่จบเหตุการณ์แล้วเท่านั้น

| แถวในประวัติ | เอกสารที่พิมพ์ | พิมพ์ได้หรือไม่ | เหตุผล |
|---|---|---|---|
| `PMT` status `จ่ายแล้ว` | Payment Voucher / ใบสำคัญจ่าย | ได้ | มีการจ่ายจริงแล้ว มี `PMT`, bank/payment split, และ payment timeline |
| `PMT` status `ยกเลิก` | Payment Voucher ฉบับยกเลิก / สำเนาการยกเลิกการจ่าย | ได้ | ต้องใช้เป็นหลักฐาน audit ว่าเคยจ่ายแล้วถูก cancel/reverse; เอกสารต้องมีลายน้ำ/สถานะ `ยกเลิก` |
| `PMA` voided ที่ยังไม่มี `PMT` | ห้ามพิมพ์ | ไม่ได้ | อัปเดตการตัดสินใจ (2026-06-20): รายการอนุมัติที่ถูกยกเลิกแล้ว (voided) ในหน้าอนุมัติจ่ายเงิน ทั้ง 4 หมวด จะต้องไม่สามารถสั่งพิมพ์ได้ในทุกกรณีเพื่อป้องกันความเสี่ยงทางการเงิน |
| `PMA` status `รอจ่าย` ใน queue | ไม่มีเอกสาร PMT | ไม่ได้จาก history | ยังอยู่ในแท็บ `จ่ายเงิน Supplier`; ถ้าต้องพิมพ์ให้ใช้เอกสาร PMA approval sheet ไม่ใช่ PMT |
| `PB/ADV/EXP` pending source | ไม่มีเอกสารจ่าย | ไม่ได้ | ยังไม่อนุมัติและยังไม่เกิด snapshot PMA/PMT |

กติกา UI:

- ปุ่ม `ดู/พิมพ์` ของ payment history ควรอยู่ในแท็บ `ประวัติ` ของ `/purchase/payments`
- Implemented 2026-06-09: แท็บ `ประวัติ` มี action `พิมพ์รายงานประจำวัน` เพื่อออกเอกสารรวมรายการจ่ายประจำวันสำหรับฝ่ายบัญชี/การเงิน
- เอกสารพิมพ์ประจำวันต้องใช้ date filter ของ history เป็น source หลัก; แท็บประวัติการจ่ายเงินต้อง default filter วันที่เป็นวันที่ปัจจุบันของ timezone ระบบ/ผู้ใช้ตอนเปิดหน้า/เข้าแท็บ แต่ปุ่มล้าง filter ต้องล้างเป็นทุกวัน
- Per user clarification on 2026-06-09, daily print ข้าม `PMA` ไปก่อนและรวมเฉพาะ PMT ในช่วงวันที่นั้น ได้แก่ `PMT จ่ายแล้ว` และ `PMT ยกเลิก`
- เอกสารพิมพ์ประจำวันต้องมีหัวบริษัท, วันที่รายงาน, เวลาพิมพ์, summary จำนวน `PMT ทั้งหมด`, จำนวน `จ่ายแล้ว`, จำนวน `ยกเลิก`, ยอดเงินออกสุทธิ, และตารางรายการ PMT/source/ผู้รับเงิน/บัญชี/ยอดเงิน/สถานะ
- ยอดรวมสำหรับ downstream cash-out must count only `PMT จ่ายแล้ว`; `PMT ยกเลิก` แสดงเพื่อ audit แต่ไม่รวมเป็นยอดเงินออกสุทธิ
- row click ยังคงเปิด detail modal ได้; ปุ่มพิมพ์ต้องไม่เปิด route แยก `/purchase/payments/{id}`
- ถ้า row เป็น direct `EXP -> PMT` ที่ไม่มี `PMA`, เอกสาร PMT ต้องแสดง source เป็น `EXP...` จาก `payments.lines.sourceDocNo`
- ถ้า row เป็น `PMA voided` ที่ไม่มี PMT: อัปเดตการตัดสินใจ (2026-06-20) ไม่อนุญาตให้สั่งพิมพ์ใบอนุมัติสำหรับรายการที่ยกเลิกแล้ว (voided) ในหน้าอนุมัติจ่ายเงิน
- downstream accounting/report/bank posting ต้องใช้เฉพาะ `PMT จ่ายแล้ว`; print ของ `ยกเลิก` เป็น audit copy ไม่ใช่ posted cash-out

## Implementation Order

1. `SB` บิลขาย / ใบส่งของ: print รายใบ implemented แล้ว; follow-up คือ harden line-level `PO Sell`/`Spot Sale` allocation display หลัง sync write flow `WTO -> SB` แยก allocation facts ครบ
2. `PMT` payment history print: daily report implemented; follow-up คือ per-voucher print รายใบจาก history
3. `PMA` approval sheet: ทำจาก `payment_approvals` snapshot สำหรับส่ง Cashier/approval record
4. `RV` hardening: ปรับ receipt voucher print ให้ใช้ Company Profile และ snapshot fields ครบ พร้อมคง boundary ว่า RV เฉพาะเงินสดและไม่สร้าง PMT/BST/stock ledger
5. `RCP` customer receipt print: ทำจาก sales receipt history หลัง receipt สำเร็จ

## 2026-07-03 RV Print Table Baseline

- `RV` ใบสำคัญรับเงินต้องยึดตารางจากปุ่มพิมพ์ `/daily/weight-ticket-list` เป็น visual baseline สำหรับเอกสารพิมพ์: soft lined table, header เทา, body border อ่อน, แถวว่างเติมพื้นที่, และแถว `รวมทั้งสิ้น` ในท้ายตาราง
- เหตุผล: RV เป็นเอกสารให้คู่ค้าเซ็นรับเงิน จึงต้องดูเป็นฟอร์มพิมพ์ A4 จริง ไม่ใช่ตารางรายการสั้นลอยอยู่กลางหน้า

## 2026-07-03 Print Table Baseline Follow-up

- Business document print tables must use `/daily/weight-ticket-list` print output as the table baseline: fixed layout, soft grey header, light cell borders, dense padding, blank filler rows where the document is form-like, and an in-table total/footer row where the table represents money or quantity lines.
- Checked and aligned the active print-table templates for WTI/WTO, RV, PB, SB, PO Buy, PO Sell, Advance Payment allocation history, Payment Approval summary, Expense, and Money Movement PMT/RCP daily/customer receipt prints.
- Browser page/dashboard print actions that print the current screen are not treated as corporate business-document templates unless the flow later promotes them to formal printable documents.

## 2026-07-03 WTI/WTO PDF Blank-Page Fix

- WTI/WTO PDF share output must keep the first page as a true A4 print form and place photo evidence on page 2+ without an empty page between them.
- The `WTI012607-0006` regression case reproduced a blank page 2 because the final print-form content overflowed the A4 height by a small amount before the album page. The fix keeps normal A4 pagination and tightens only the print-form vertical spacing, especially page padding and signature spacing.
- Verification target: real `WTI012607-0006` renders as 2 A4 pages, page 1 print form and page 2 album, while the fixture harness still asserts 1 print page + 1 album page.
