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
updated: 2026-08-11
---

# Printable Documents / เอกสารที่ต้องพิมพ์

เอกสารนี้เป็น source of truth กลางสำหรับรายการเอกสารธุรกิจที่ต้องมี print/Save as PDF ใน active Next app โดยอิงจาก legacy `old-apps/legacy/index.html` และ flow target ปัจจุบัน

หลักทั่วไป:

- เอกสารธุรกิจทุกชนิดใช้ measured A4 layout กลาง (`corporate-print-layout`) หลังโหลด font/logo แล้ว. ความสูงจริงเป็นตัวตัดสินการแบ่งหน้า; 15 รายการเป็นจำนวนสูงสุดต่อหน้า ไม่ใช่จำนวนที่ต้องยัดให้ครบ. หน้าต่อเนื่องมีหัวข้อ placeholder และ `( มีต่อหน้า X / Continued on Page X ➔ )`, ส่วนยอดจริง/หมายเหตุจริง/ลายเซ็นอยู่หน้าสุดท้ายเท่านั้น.
- ข้อยกเว้นที่ต้องคงตัวจัดหน้าเฉพาะเอกสาร: PB (วัดสองรอบและแบ่ง REMARK ตามข้อ), WTI/WTO (form capacity และ attachment album แยก), และรายงาน PMT/RCP ประจำวัน (งบหน้าแรก 8 แถว). PMA ใช้ A4 landscape ผ่านตัวจัดหน้ากลาง.

- เอกสารพิมพ์ต้องใช้ข้อมูลหัวกระดาษจาก `/admin/company-profile` หรือ `ข้อมูลบริษัท (สำหรับใบพิมพ์)` เป็นหลัก
- เอกสารพิมพ์ต้องเป็น snapshot/read-model ของเอกสารนั้น ห้ามกดพิมพ์แล้วเกิด side effect เช่น สร้าง `PMA`, `PMT`, `BST`, stock ledger, หรือแก้สถานะ
- เอกสารที่ถูกยกเลิกแล้วยังพิมพ์สำเนาได้ แต่ต้องแสดงสถานะ/ลายน้ำยกเลิกให้ชัด
- รายการสินค้า/เงินต้องแสดงหน่วยจริงและยอด snapshot ของเอกสาร ไม่ resolve จาก master data ปัจจุบันถ้าทำให้ประวัติเปลี่ยน
- รายงาน/dashboard ที่ใช้ `window.print()` เพื่อพิมพ์หน้าจอ ไม่ถือเป็นเอกสารธุรกิจใน backlog นี้

## รายการเอกสารพิมพ์

| Priority | เอกสาร | Route หลัก | สถานะ Next | Legacy evidence | หมายเหตุ |
|---|---|---|---|---|---|
| P0 | `POB` PO Buy / ใบสั่งซื้อ | `/purchase/po-buy` | Implemented | Legacy PO Buy อยู่ใน flow จองซื้อ/สั่งซื้อก่อนรับของ; active target ใช้เลข `POB...` เป็นเอกสารซื้อหลักก่อน PB | ใช้ corporate A4 portrait ที่อ้างอิง design บิลซื้อ, Company Profile header, พิมพ์จาก list/detail modal, แสดง Supplier พร้อมที่อยู่, รายการสินค้าครบพร้อมหน่วยจริง, ยอดสั่งซื้อ/คงเหลือ, หมายเหตุ, ช่องลงนาม และลายน้ำเฉพาะกรณียกเลิก; ตารางแบ่งหน้าละ 15 รายการและเพิ่มหน้าได้ต่อเนื่อง |
| P0 | `PO Sell` ใบสั่งขาย | `/sales/po-sell` | Implemented | Active Next มีปุ่มพิมพ์จาก PO Sell detail และใช้ Company Profile ตามสาขา | ใช้ corporate A4 portrait, Customer และรายการขายจาก snapshot, ยอดรวม/หมายเหตุ/ช่องลงนามเฉพาะหน้าสุดท้าย รองรับหลายหน้าแบบไม่จำกัดและลายน้ำกรณียกเลิก |
| P0 | `PB` บิลรับซื้อ / ใบรับสินค้า | `/purchase/bills` | Implemented | `erp.printDocument('receipt', row.raw.id)` ที่ `old-apps/legacy/index.html:15119`, helper ที่ `old-apps/legacy/index.html:6449` | ใช้ corporate A4 portrait, Company Profile header, พิมพ์จาก list/detail/direct detail, รองรับหลายหน้าไม่จำกัด; 15 เป็นจำนวนสูงสุดต่อหน้าและตัวจัดหน้าวัดความสูงจริงเพื่อสงวนกรอบล่างกับลายเซ็น |
| P0 | `SB` บิลขาย / ใบส่งของ | `/sales/bills` | Implemented print, allocation hardening follow-up | `erp.printDocument('delivery', b.id)` ที่ `old-apps/legacy/index.html:20390`, helper เดียวกับ PB ที่ `old-apps/legacy/index.html:6449` | ใช้ flow `WTO -> SB` ตาม [[Sales Bills Page Flow]], A4 portrait/N-page/totals baseline เดียวกับ PB, Company Profile ตามสาขา, แสดง Customer, WTO trace, VAT, หักมัดจำ Customer, และยอดลูกหนี้สุทธิ; follow-up คือแสดง `PO Sell`/`Spot Sale` จาก line-level allocation facts เมื่อ write flow แยก allocation ครบ |
| P0 | `WTI/WTO` ใบรับของ/ใบส่งของจากงานชั่ง | `/daily/weight-ticket-list` | Implemented print, share/audit follow-up | `printWeighingTicket(ticket)` และปุ่ม `ใบชั่ง` ที่ `old-apps/legacy/index.html:52560` ถึง `old-apps/legacy/index.html:52985` | Active helper รองรับ WTI/WTO แล้ว; ส่วนใบพิมพ์หลักสร้างหน้า A4 `1..N` ตามจำนวนรายการ โดยหน้าก่อนสุดท้ายใช้กรอบสรุป 3 กรอบที่มีหัวข้อ `สรุปตามหมวดสินค้า`, `หมายเหตุ`, `ข้อมูลน้ำหนัก / Weight Info` และค่า placeholder `-` พร้อมข้อความมีต่อหน้า ส่วนยอด/หมายเหตุจริง/ลายเซ็นอยู่หน้าสุดท้ายของใบพิมพ์หลัก จากนั้นจึงต่อด้วยหน้าอัลบั้มรูปหลักฐานจากรูปรถและรูปสินค้า |
| P1 | `PMA` ใบอนุมัติจ่ายเงิน / ส่ง Cashier | `/daily/payment-approval`, `/purchase/payments` | Implemented: selected approval sheet | `printApprovalSheet` และปุ่ม `พิมพ์ใบอนุมัติส่ง Cashier` ที่ `old-apps/legacy/index.html:27680` ถึง `old-apps/legacy/index.html:27773` | พิมพ์จาก approval snapshot หลังเกิด PMA แล้ว ไม่พิมพ์จาก pending source live row; รองรับหลายหน้าแบบไม่จำกัด โดยคง group total ตามผู้รับเงิน/ปลายทาง และแสดงยอดรวม/ลายเซ็นเฉพาะหน้าสุดท้าย |
| P1 | `EXP` ใบสำคัญจ่ายค่าใช้จ่าย | `/daily/expense` | Implemented | Active Next มีปุ่มพิมพ์จาก EXP detail และใช้ Company Profile ตามสาขา | พิมพ์จาก EXP snapshot แบบ read-only; แสดงรายการค่าใช้จ่าย, VAT, WHT, ยอดสุทธิ, หมายเหตุ และช่องลงนาม รองรับหลายหน้าแบบไม่จำกัด |
| P1 | `ADV` ใบเงินล่วงหน้า/มัดจำ Supplier | `/purchase/advance-payments` | Implemented | Active Next มีปุ่มพิมพ์จาก ADV detail และใช้ Company Profile ตามสาขา | พิมพ์จาก ADV snapshot แบบ read-only แสดง Supplier, ประเภท ADV, Invoice, รายการอ้างอิง, ยอด/หมายเหตุ/ช่องลงนามเฉพาะหน้าสุดท้าย และรองรับหลายหน้าแบบไม่จำกัด |
| P1 | `PMT` Payment Voucher / ใบสำคัญจ่าย | `/purchase/payments?tab=history` | Implemented: per-voucher + daily report | Legacy payment-history evidence ไม่ชัดเท่า PB/SB/PMA แต่ active UI มี history snapshot | พิมพ์รายใบจาก detail ในแท็บประวัติเท่านั้น ใช้ Company Profile ตามสาขา แสดง PMA/เอกสารต้นทางและบัญชีจ่าย รองรับหลายหน้าแบบไม่จำกัด และพิมพ์รายการยกเลิกเป็น audit copy พร้อมลายน้ำ; PMA voided ที่ยังไม่มี PMT ไม่มีปุ่มพิมพ์ |
| P1 | `RV` ใบสำคัญรับเงิน Supplier | `/purchase/receipt-vouchers` | Partial: manual create/edit/print + cancel watermark implemented | legacy `view-receiptVoucher` ที่ `old-apps/legacy/index.html:42799` ถึง `old-apps/legacy/index.html:43240` | ใช้ให้ Supplier/ผู้รับเงินเซ็นรับเงินสดจากบริษัทเท่านั้น active modal เลือก Supplier เพื่อเติมข้อมูลผู้รับเงิน และเลือก PB optional เพื่อเติมรายการ/ยอดอัตโนมัติ ไม่ใช่ payment posting owner และไม่ใช้กับโอนเงิน/เช็ค; active print ใช้ corporate A4 หลายหน้า, Company Profile header, receiver/company text blocks, item table, unit-separated quantity summary, amount text, signer blocks และลายน้ำยกเลิก; follow-up เหลือ signer/payment method policy |
| P2 | `RCP` Receipt Voucher / ใบรับเงิน Customer | `/sales/receipts` | Implemented: individual + batch + daily report | legacy customer receipt component อยู่ใน flow `รับเงิน Customer` และรองรับหลายบิลต่อ voucher | แยกจาก `RV`; พิมพ์จาก receipt history หลังเกิด receipt แล้ว ใช้ Company Profile ตามสาขา รองรับ SB/CADV, foreign receipt audit, รายการยกเลิกพร้อมลายน้ำ และหลายหน้าแบบไม่จำกัด; batch deduplicate การโหลด Company Profile ต่อสาขา |

## 2026-08-07 Unlimited Corporate Pagination Contract

- เอกสารธุรกรรมแบบ corporate ที่ปรับใน batch นี้ ได้แก่ `POB`, `PB`, `SB`, `PO Sell`, `ADV`, `PMA`, `EXP`, `RV`, `PMT` และ `RCP` ใช้กติกากลางหน้าละ 15 แถวรายการ และสร้างหน้า `1..N` ตามจำนวนข้อมูลจริงโดยไม่จำกัดสูงสุดไว้ที่ 2 หน้า; สำหรับ PMA แถวรวมตามผู้รับเงิน/ปลายทางนับเป็นหนึ่งแถวตารางเพื่อรักษาความสูง A4 ให้คงที่
- ตัวอย่าง boundary: 15 รายการ = 1 หน้า, 16 รายการ = 2 หน้า, 31 รายการ = 3 หน้า และ 46 รายการ = 4 หน้า; ทุกหน้าต้องมีแถวตารางรวม 15 ช่องและเลขหน้า `หน้า X / N`
- หน้า `1..N-1` ต้องมี footer ตารางว่างและกรอบสรุป placeholder ตาม template ของเอกสาร โดยไม่แสดงยอดหรือหมายเหตุธุรกิจจริง พร้อมข้อความ `Continued on Page X` แทนช่องลงนาม เพื่อไม่ให้ยอดระหว่างทางถูกเข้าใจว่าเป็นยอดเอกสารฉบับสมบูรณ์
- หน้า `N` เท่านั้นที่แสดงยอดจริง หมายเหตุ และช่องลงนาม โดยยังคง Company Profile, document snapshot, cancelled watermark, table header และข้อมูลเอกสารบนทุกหน้า
- คำว่า `หมายเหตุ` ในกติกา final-page-only หมายถึงหมายเหตุธุรกิจของรายการ; หมายเหตุทางกฎหมาย/ข้อความบังคับของแบบฟอร์มยังคงแสดงทุกหน้าตาม `docs/design.md`
- การพิมพ์ยังเป็น read-only: การแบ่งหน้าไม่สร้างหรือแก้เอกสาร, payment, stock, allocation, cache, API, DB หรือ Storage
- `WTI/WTO` ใช้แบบฟอร์มชั่งแบบตาราง 20 ช่องทุกหน้า รวมหน้าสุดท้ายที่มียอดรวม/กรอบสรุป/ลายเซ็น: ต้องเติมแถวว่างให้ครบ 20 ช่องเสมอ แม้ข้อมูลจริงจะมีน้อย เพื่อให้เส้นตารางและพื้นที่แบบฟอร์มต่อเนื่องกัน (ข้อมูลจริงสูงตามเนื้อหา แถวว่างแบ่งพื้นที่ที่เหลือของตารางอย่างเท่ากัน); หน้าหลัก `1..N-1` มี footer ตารางว่าง กรอบสรุป 3 กรอบพร้อมหัวข้อ `สรุปตามหมวดสินค้า`, `หมายเหตุ`, `ข้อมูลน้ำหนัก / Weight Info` และค่า `-` เป็น placeholder พร้อมข้อความมีต่อหน้า; หน้าหลัก `N` เท่านั้นมีสรุป/หมายเหตุ/ลายเซ็นจริง จากนั้นจึงต่ออัลบั้มหลักฐาน 6 รูปต่อหน้า
- รายงานรวม เช่น Payment/Receipt daily report ยังคงเป็น report-style print และใช้การแบ่งหน้าตามตารางรายงาน ไม่บังคับกรอบสรุป/ลายเซ็นแบบ transaction pagination ข้างต้น โดยหน้าแรกจองพื้นที่หัวรายงานและ summary cards จึงใช้ไม่เกิน 8 แถว ส่วนหน้าต่อเนื่องใช้ 15 แถว เพื่อไม่ให้ตารางล้นไปเป็นหน้ากระดาษที่ไม่มี template
- Receipt Voucher Queue เป็น operational queue preview, Company Profile เป็น configuration sample preview และ dashboard/report ที่พิมพ์หน้าจอเป็น report-style print; ทั้งสามประเภทไม่ใช่ corporate transaction snapshot ใน inventory นี้

## 2026-08-08 Continuation Placeholder Panel Contract

WTI/WTO tables always render the full 20-row form on every page; empty rows fill the remaining slots so a short ticket still shows a complete 20-cell grid, without changing the signature block position; signatures remain anchored at the bottom of the A4 form.

Every formal multi-page document keeps its real totals, business notes and signatures on the final page only. Pages `1..N-1` keep the continuation marker and titled placeholder panels instead of blank frames:

- WTI/WTO: `สรุปตามหมวดสินค้า`, `หมายเหตุ`, `ข้อมูลน้ำหนัก / Weight Info`
- POB, PB, SB, PO Sell: `สรุปตามหมวดสินค้า`, `หมายเหตุ`
- ADV, EXP, PMA: document-specific summary title, `หมายเหตุ`
- RV/RCP: `รายละเอียดการรับเงิน`, `หมายเหตุ`
- PMT: `รายละเอียดการจ่ายเงิน`, `หมายเหตุ`

Each placeholder panel contains `-` as the explicit empty value. The contract applies to both the direct browser print builders and the PMT/RCP builders embedded in `MoneyMovementPageClient`; it does not change report-style screen printing or any document data, totals, signatures or persistence behavior.

## 2026-08-08 PB Measured Pagination Contract

- `PB` แยกจาก shared count paginator: runtime render รอบวัดที่ความกว้าง `194 มม.` บังคับโหลดและยืนยัน Noto Sans Thai ทั้ง Regular/Bold พร้อม logo แล้ววัดหัวเอกสาร, ข้อมูลผู้ขาย, หัวตาราง, candidate row/REMARK segment, footer ตาราง, กรอบล่าง และพื้นที่ลายเซ็นก่อนสร้าง page plan.
- 15 เป็นเพดานรายการต่อหน้า. แถวถัดไปที่ชนพื้นที่สงวนต้องย้ายทั้งแถวไปหน้าถัดไป; ถ้าแถวเดียวสูงเกินหน้าและมี REMARK หลายข้อ จึงแบ่งเฉพาะระหว่างข้อ โดยคงเลขรายการเดิม, ใส่ชื่อสินค้า `(ต่อ)`, เลขข้อเดินต่อ และไม่ทำยอดซ้ำ.
- REMARK รูปแบบ `- 1. ... - 2. ...` แสดงเป็น `1. ...`, `2. ...` คนละบรรทัดด้วย hanging indent; หมายเหตุธรรมดายังคงเป็นข้อความธรรมดา. คอลัมน์ `#` กว้าง 8 มม. และยอดหลายหน่วยแสดงหนึ่งหน่วยต่อหนึ่งบรรทัด.
- PB print normalizes equivalent kilogram labels (`กก.`, `กิโลกรัม`, `kg`) to `กก.` at the presentation boundary, merges those aliases into the same weight total line, and keeps the value inside its quantity column; true other units such as `ลัง` remain separate.
- หน้าสุดท้ายสงวน signature zone 30 มม. และแสดงยอด/หมายเหตุ/ลายเซ็นจริง; หน้า `1..N-1` แสดง placeholder กับข้อความมีต่อหน้า. แถวว่างคำนวณจากพื้นที่คงเหลือจริงแทนการบังคับ 15 ช่องเท่ากันทุกกรณี.
- Preview และ Print ใช้ content geometry เดียวกัน (`210 × 297 มม.` พร้อม padding 8 มม. เทียบกับ print content `194 × 281 มม.`). ปุ่มพิมพ์เปิดหลังตรวจทุก logical page ว่าไม่ overflow เท่านั้น; การวัดล้มเหลวต้อง fail closed และไม่เรียก `window.print()`.
- Safety guard จำกัดเฉพาะ candidate ที่เพิ่มจากการลองแบ่ง REMARK หลายข้อ เพื่อกัน DOM โตแบบกำลังสอง; จำนวนแถว PB ปกติและจำนวนหน้ารวมยังไม่ถูกจำกัดโดย guard นี้.
- ขอบเขตนี้เป็น presentation/read-only เท่านั้น ไม่เปลี่ยน API, DB, Storage, Cache, document snapshot, total calculation หรือเอกสารชนิดอื่น.

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

- ปุ่มพิมพ์ PMT อยู่ใน detail modal ของแถว `PMT` ในแท็บ `ประวัติ` ของ `/purchase/payments`; แถว PMA approval/voided ที่ยังไม่เกิด PMT ไม่มีปุ่มพิมพ์
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
2. `PMT` payment history print: per-voucher และ daily report implemented แล้ว
3. `PMA` approval sheet: implemented จาก `payment_approvals` snapshot สำหรับส่ง Cashier/approval record พร้อม unlimited pagination และ final-page-only totals/signatures
4. `RV` hardening: ปรับ receipt voucher print ให้ใช้ Company Profile และ snapshot fields ครบ พร้อมคง boundary ว่า RV เฉพาะเงินสดและไม่สร้าง PMT/BST/stock ledger
5. `RCP` customer receipt print: individual, batch และ daily report จาก sales receipt history implemented แล้ว

## 2026-07-03 RV Print Table Baseline

- `RV` ใบสำคัญรับเงินต้องยึดตารางจากปุ่มพิมพ์ `/daily/weight-ticket-list` เป็น visual baseline สำหรับเอกสารพิมพ์: soft lined table, header เทา, body border อ่อน, แถวว่างเติมพื้นที่, และแถว `รวมทั้งสิ้น` ในท้ายตาราง
- เหตุผล: RV เป็นเอกสารให้คู่ค้าเซ็นรับเงิน จึงต้องดูเป็นฟอร์มพิมพ์ A4 จริง ไม่ใช่ตารางรายการสั้นลอยอยู่กลางหน้า

## 2026-07-03 Print Table Baseline Follow-up

- Business document print tables must use `/daily/weight-ticket-list` print output as the table baseline: fixed layout, soft grey header, light cell borders, dense padding, blank filler rows where the document is form-like, and an in-table total/footer row where the table represents money or quantity lines.
- Checked and aligned the active print-table templates for WTI/WTO, RV, PB, SB, PO Buy, PO Sell, Advance Payment allocation history, Payment Approval summary, Expense, and Money Movement PMT/RCP daily/customer receipt prints.
- Browser page/dashboard print actions that print the current screen are not treated as corporate business-document templates unless the flow later promotes them to formal printable documents.

## 2026-08-11 Preview/Print A4 Contract

- `RV` Preview and browser Print now use the same A4 `border-box` page contract: `210 × 297 mm` on screen with `8 mm` page padding, and `194 × 281 mm` print content inside the `@page` `8 mm` margin. The shared corporate layout also preserves document background colors during print. What is what: the preview is the same document page shown on a slate work surface, while Print removes only the work-surface chrome and shadow. Why it has to be like this: changing the page geometry or dropping table/summary colors in `@media print` makes the signed receipt look like a different document and can move content relative to the signature area.

## 2026-08-11 WTI/WTO 20-Row Form Capacity

- WTI/WTO form pages use a dedicated 20-row logical ceiling. The browser remeasures the actual DOM after the Thai font and logo are ready, while server PDF uses the same ordered source-row plan with conservative height budgeting. A long row moves as a complete row; it is never truncated, silently dropped, or split across pages.
- The final form page intentionally reserves the summary, totals, and signature area, so it may contain fewer than 20 rows. Intermediate form pages retain the three titled placeholder panels and `Continued on Page X`; attachment-album pages are separate from the form-row capacity. This is presentation-only and preserves the WTI/WTO snapshot, totals, API, DB, Storage, and notification contracts.
- Final-page geometry is a fixed visual contract: `bottom-zone` anchors the `bottom-grid` three-panel summary directly above the four-column `signatures` row. Keep the approved 28px Preview / 24px Print separation (and the existing 16px / 12px signature-line inset); the table must reflow or paginate before this footer is widened, narrowed, or moved.
- Browser Preview/Print table rows share the page's row slots equally: data rows and empty filler rows use the same height allocation. Do not shrink blank rows into spacers that make one populated row visually absorb the entire remaining table height; long content still expands its own row and is reflowed to the next A4 form page when necessary.

## 2026-08-11 WTI/WTO PDF (React-PDF) Form Contract

- The server PDF (`weight-ticket-document.tsx`) must render the same 20-row form as the browser on every page, including the final page that carries totals, the three summary panels and signatures: the table container gets `flexGrow: 1` so it fills the full A4 content height, and the empty filler rows inside share the leftover space equally (mirroring the browser `gridTemplateRows: repeat(capacity, 1fr)`). Short tickets therefore still show the complete 20-cell grid and the signature block stays anchored at the bottom.
- React-PDF quirk (must be preserved): a unitless `lineHeight` on the `Page` is resolved once to a fixed point value (12.4pt) and inherited by every `Text`, so a filler cell with tiny `fontSize` is still 12.4pt tall unless it sets its own `lineHeight`. Every filler row must declare its own small `lineHeight`; otherwise twenty empty rows overflow A4.
- Do not reserve the bottom-zone space with `marginBottom` on the growing table container: Yoga grows that container first and consumes the whole page, pushing the bottom-zone off the page edge. The flex growth must live inside the rows, and the bottom-zone must be a sibling pinned to the bottom.
- Final-page spacing matches the browser contract: `signatures` keeps `marginTop: 18pt` (≈ 24px print) so the `bottom-grid` three-panel summary never touches the four-column signature row; the table must reflow or paginate before this footer is widened, narrowed, or moved.
- Pagination parity with HTML: the PDF uses the same ordered source-row plan, so 20 short rows render as one A4 form page and 21+ rows spill to a continuation page with the three titled placeholder panels; a row that does not fit moves whole. Dense styling applies only above 14 items; the former WTI 12 / WTO 14 final-page reserve is removed.
- Enforced by `weight-ticket-print.test.ts`: HTML/React-PDF page-count alignment for 0/1/15/16/20/21/30/31 rows, long-row movement, dense-height parity, the continuation-to-final handoff, and final-page 20-cell geometry; the focused suite passes 41/41.

## 2026-07-03 WTI/WTO PDF Blank-Page Fix

- WTI/WTO PDF share output must keep the first page as a true A4 print form and place photo evidence on page 2+ without an empty page between them.
- The `WTI012607-0006` regression case reproduced a blank page 2 because the final print-form content overflowed the A4 height by a small amount before the album page. The fix keeps normal A4 pagination and tightens only the print-form vertical spacing, especially page padding and signature spacing.
- Verification target: real `WTI012607-0006` renders as 2 A4 pages, page 1 print form and page 2 album, while the fixture harness still asserts 1 print page + 1 album page.

## 2026-08-12 Print Asset Prefetch & Batched Signed URLs

Why: the browser print popup calls `prepareCorporatePrintLayout`, which waits for Noto Sans Thai Regular+Bold webfonts and every company logo / attachment image before paginating. On the first print of a session, or when the popup's HTTP cache is cold, this added hundreds of milliseconds of latency that the user perceived as a frozen preview. This change is pure optimization: visual output, contracts, and error paths are unchanged — only the latency of the asset fetch improves.

What changed:

- `apps/next/src/lib/print-asset-prefetch.ts` (new) centralizes three responsibilities: `prefetchPrintFonts()` warms the two Noto Sans Thai webfont faces via `document.fonts.load()` (idempotent per tab), `fetchCompanyProfileForPrint(branchId?)` reads `/api/admin/company-profile` and caches the payload in module memory for 30s with in-flight dedup, and `prefetchPrintAssets(branchId?)` warms fonts + profile + logo (`new Image()` preload) for use in hover/focus handlers. Failures are swallowed by the prefetch path so a font or profile issue never breaks the host page; the print flow still refetches and surfaces the real error.
- All 9 print modules (`weight-ticket-print.ts`, `sales-bill-print.ts`, `purchase-bill-print.ts`, `receipt-voucher-print.ts`, `expense-print.ts`, `advance-payment-print.ts`, `payment-approval-print.ts`, `po-buy-print.ts`, `po-sell-print.ts`) now read the profile via `fetchCompanyProfileForPrint` instead of a direct `fetch` + per-module `zod` schema. The duplicated local `companyProfilePayloadSchema` is removed; the canonical schema now lives in `print-asset-prefetch.ts` and matches the previous shape exactly.
- `WeightTicketListPageClient.tsx` prefetches fonts on mount and warms the profile in parallel with the ticket detail fetch inside `handlePrintTicket`. `SalesBillPrintButton` and `PurchaseBillPrintButton` add `onMouseEnter`/`onFocus` prefetch of fonts + profile + logo.
- `weight-ticket-storage.ts` `attachWeightTicketImagePreviewUrls` now batches all ready-thumbnail signed URLs into a single `createSignedUrls` call instead of N parallel `createSignedUrl` calls. The per-image `resolve` step is a pure map lookup, with a single-key `createSignedUrl` fallback only for paths that the batch missed (e.g. a storage-side per-path failure).

Cache & image delivery notes (per AGENTS.md rules):

1. Data level & source of truth — Font and logo preloads are L0 static asset warming (no business state). The company-profile payload cache is read-only header data used to render print forms; source of truth remains `/api/admin/company-profile`. No financial, stock, permission, or transaction status is cached.
2. Key/URL scope, TTL, headers, invalidation — The profile cache is a single in-memory entry per tab (no scope key beyond `branchId` on the URL), TTL 30s, and is invalidated by TTL only plus an explicit `invalidateCompanyProfileForPrintCache()` hook for future use after profile edits. Signed URLs come from Supabase storage with their existing `WEIGHT_TICKET_IMAGE_PREVIEW_TTL_SECONDS` expiry; the batch does not extend or shorten their lifetime.
3. What is not cached and why — Per-row business facts, transaction status, stock, balances, and report data are never cached; only the public company header used by print builders. The prefetch never writes to `localStorage`/`sessionStorage`/persistent cache.
4. Image original/thumbnail & privacy — Logo preload uses the existing public company logo URL only; no new signed URL is minted. Thumbnail signed URLs for ticket attachments are still generated server-side and consumed by the popup; only the request count to Supabase storage changed (N → 1), not the privacy contract or thumbnail/original split.
5. Tests — `weight-ticket-storage.test.ts` extended with a `createSignedUrls` mock and an explicit batch-failure + single-fallback failure case; `weight-ticket-print.test.ts`, `corporate-print-layout.test.ts`, `document-print-contract.test.ts`, and `purchase-bill-print.test.ts` continue to assert unchanged HTML/contract behavior (120/120 related tests pass). The font/profile prefetch path is best-effort by design and falls back to the existing per-popup loader, so no separate failure test is required for the swallow path; the happy path is covered indirectly by every passing print test that renders with the cached profile.

