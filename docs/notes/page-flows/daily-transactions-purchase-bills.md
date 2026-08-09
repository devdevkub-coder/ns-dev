---
title: บิลรับซื้อ Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-08-09
route: /purchase/bills
---

# บิลรับซื้อ Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Daily Transactions |
| Route | `/purchase/bills` |
| Page | บิลรับซื้อ |
| Current Next | accepted code baseline |

## Canonical References

[[Purchase Bills Page Flow]], [[Purchase Flow]], [[Payment Flow]], [[Stock Ledger and Stock Balance]]

## Flow Baseline

PB เป็นจุดตั้งเจ้าหนี้และเป็น owner ของ stock-in สำหรับ Stock purchase

## Page Responsibilities

- สร้าง `PB` จาก WTI สำหรับ Stock purchase หรือกรอกเองสำหรับ Trading
- รองรับบิลเดียวที่ line มีทั้ง PO allocation และ Spot Buy
- สำหรับ Stock: ใช้ WTI 1 ใบต่อ PB 1 ใบ และต้องตัด WTI ครบใน PB เดียว
- สำหรับ Stock: auto/use active RM warehouse ของ branch และเขียน stock-in ledger ตอนบันทึก PB
- สำหรับ Trading: ไม่เลือก WTI/warehouse, ไม่เขียน stock ledger, กรอกสินค้าได้หลายรายการพร้อม Gross, หัก, น้ำหนักสุทธิ, PO Buy optional, ราคา/กก., จำนวนตัดบิล, ราคาหน้าใบ, และยอดรวม
- คำนวณ subtotal/discount/VAT/ADV allocation/payable balance และส่ง source payable เข้า Payment Flow
- แสดง detail/timeline/source allocation/print PB และ lock เมื่อมี PMA/PMT active
- Print PB เป็นเอกสารยืนยันการรับซื้อและยอดตามเอกสาร จึงแสดง subtotal/ส่วนลด/VAT/ยอดสุทธิ/ADV แต่ไม่แสดงแถว `ชำระแล้ว` หรือ `ค้างชำระ`; สองค่านี้เป็น payment progress ที่ยังคงอยู่ใน list/detail และ API/Payment Flow ตามเดิม
- Print PB ใช้ตัวจัดหน้าตามความสูงจริง: 15 เป็นจำนวนรายการสูงสุดต่อหน้า, หน้าสุดท้ายสงวนพื้นที่ลายเซ็น 30 มม., และปุ่มพิมพ์เปิดเมื่อยืนยัน Noto Sans Thai Regular/Bold พร้อม logo และตรวจว่า logical A4 ทุกหน้าไม่ overflow แล้วเท่านั้น. REMARK หลายข้อเรียง `1.`, `2.`, `3.` คนละบรรทัด; ถ้าต้องแบ่งรายการเดียวจะแบ่งเฉพาะระหว่างข้อและไม่ทำค่าน้ำหนัก/ราคา/ยอดซ้ำใน segment ต่อ.
- ตาราง detail ของ PB แยกตัวเลขน้ำหนัก/จำนวนออกจากคอลัมน์ `หน่วย` เช่นเดียวกับเอกสารใบรับส่ง และ normalize หน่วยกิโลกรัมทุก alias เป็น `กก.` เฉพาะตอนแสดงผล; snapshot และ business calculation ไม่เปลี่ยน.
- ใน PB Timeline รายการที่ทำจ่ายต้องแสดง `วันที่จ่ายตามเอกสาร PMT`, `ธนาคารบริษัทที่จ่ายออก` และเลขที่บัญชีบริษัทที่จ่ายออกจาก snapshot ของ PMT เพื่อให้ผู้ตรวจสอบรู้ว่าเงินออกเมื่อไรและออกจากบัญชีใด; ห้ามใช้ Voucher UUID เป็นข้อมูลหลักที่ผู้ใช้ต้องตีความ.
- เมนู `จัดการ` ใช้ ellipsis/shared dropdown เดียวกันทั้ง Desktop และ Mobile โดยรวมคำสั่งที่ทำได้ของแถวนั้นไว้ในเมนู; แถวที่สถานะ `cancelled` ไม่แสดง trigger และ Modal รายละเอียดต้องแสดง `แก้ไข`/`ยกเลิก` เมื่อเอกสารยังอนุญาต. PMT History เป็น read-only และแก้โดยยกเลิกแล้วทำจ่ายใหม่ เพื่อรักษา audit trail.

## Non-Responsibilities

- ไม่อนุมัติจ่ายและไม่ทำจ่ายเงินเอง
- ไม่รับ WTI ที่ถูกใช้แล้วหรือถูกยกเลิก
- ไม่ให้เลือกคลังเองสำหรับ PB Stock; คลัง derive จาก active RM warehouse ของสาขา
- ไม่เปลี่ยน supplier แล้วทำให้ source PO/WTI กลายเป็น Spot โดยไม่มี release/audit

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET list/filter และ option source |
| 2 | เลือก Stock/Trading | Stock ใช้ WTI; Trading กรอก/เลือก source PB trading ตาม rule |
| 3 | allocate line | เลือก PO ต่อ line หรือ Spot; validate product match ด้วย internal product id |
| 4 | บันทึก PB | POST/PATCH สร้าง PB, allocation, ADV allocation, stock ledger เฉพาะ Stock, payable source |
| 5 | แก้/ยกเลิก | ถ้ายังไม่มี PMA/PMT active ให้ rebuild/reverse allocation + ledger แบบ transaction-safe |
| 6 | ส่งต่อจ่ายเงิน | payable balance > 0 เข้า `/daily/payment-approval` |

## API / Data Contract

### Current API

- `GET /api/purchase/bills - list/filter/source data`
- `POST /api/purchase/bills - create PB`
- `PATCH /api/purchase/bills - update/cancel/supplier-swap action`
- `GET /api/purchase/bills/[id] - detail/read model/print source`
- `GET /api/daily/bill-swap-history - supplier swap history tab`

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- modal Purchase Bill ต้องบังคับเลือก `สาขา` ก่อน `ผู้ขาย`; Supplier selector ต้อง disabled จนกว่าจะเลือกสาขา
- supplier options ต้องกรองตามสาขาเอกสารจาก active `supplier_branches`; Stock PB ที่มาจาก WTI ต้องใช้ supplier/branch จาก WTI และ validate ว่า mapping ยัง active ก่อนบันทึก, Trading PB ต้องกรอง supplier ตาม branch ที่เลือก
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ

## Validation / Status Rules

- WTI Stock source ต้อง active, same branch, not cancelled, not used by other PB และต้อง allocate ครบใน PB เดียว
- supplier ต้อง active และมี active `supplier_branches` กับ branch ของ PB; API ต้อง reject ถ้าไม่ตรง mapping และห้าม fallback เป็นทุกสาขา
- PO line allocation ต้อง product เดียวกันกับ PB/WTI line โดยใช้ internal product id
- POB remaining ห้ามติดลบ; ส่วนเกินเป็น Spot Buy ต่อ line ได้
- Trading PB line ต้องคำนวณ `net weight = gross - deduct` และ `line total = net weight x price/kg`
- Trading + PO ตัด PO Buy remaining ได้ แต่ห้ามตัดเกิน remaining; Trading + Spot ไม่ตัด PO Buy
- `ราคาหน้าใบ` ต้องเก็บระดับ line เพื่อใช้ Sale Tracking/commission และไม่ใช่ราคาต้นทุนซื้อ
- ADV allocation ใช้ได้เฉพาะ ADV ที่จ่ายแล้วและ available amount พอ
- lock edit/cancel เมื่อมี PMA approved หรือ payment cycle active
- money/qty ใช้ text+pattern และ server validation ซ้ำ

## Side Effects

- Stock PB เขียน `stock_ledger.ref_type = PB` เป็น stock-in
- Stock PB ทำให้ qty/value เข้า stock และ WAC ปัจจุบันเปลี่ยนตามราคาซื้อของบิลนั้น
- Trading PB ไม่เขียน stock ledger และไม่กระทบ Stock On Hand/WAC
- Stock PB ที่มาจาก WTI ต้องตั้งต้นด้วย `น้ำหนักหลัก` ซึ่งเท่ากับน้ำหนักรวมหลังหักภาชนะแล้ว, แสดง `หัก` เฉพาะสิ่งเจือปน, และแสดง `น้ำหนักสุทธิ` ตาม WTI; เช่น gross 970 หักภาชนะ 36 และหักสินค้า/สิ่งเจือปน 37 จะแสดงน้ำหนักหลัก 934, หัก 37, และสุทธิ 897. เมื่อ WTI ถูกออกบิลบางส่วน ระบบต้องกระจายทั้งน้ำหนักหลักและหักสิ่งเจือปนตามสัดส่วนของน้ำหนักสุทธิคงเหลือ. การเปลี่ยนนี้เป็น display contract ของ Stock PB; qty ที่จัดสรร, stock และ ledger ยังคงยึดน้ำหนักสุทธิ และ allocation ยังคงเก็บน้ำหนักชั่งรวมต้นทางเพื่อ audit.
- เมื่อเปิดแก้ไข Stock PB ระบบต้องอ่าน PB detail แบบ `no-store` และใช้ `allocationRows.grossWeight` ซึ่งคำนวณจากน้ำหนักชั่งรวมลบหักภาชนะแล้วสำหรับค่า `น้ำหนักหลัก` ในฟอร์ม. ห้ามใช้ `purchase_bill_items.gross_weight` ตรง ๆ ในการแสดง เพราะค่านั้นเก็บน้ำหนักชั่งรวมดิบเพื่อ audit; การแยกนี้ทำให้หน้า detail และ edit แสดง contract เดียวกันโดยไม่เปลี่ยน stock, ledger หรือข้อมูลต้นทาง.
- Stock PB remark ต่อรายการต้องมาจากข้อมูลหักสิ่งเจือปนของ WTI product summary เดียวกัน เช่น `- 1. ฝุ่น 12 กก.` และถ้าสิ่งเจือปนนั้นซื้อกลับเป็นสินค้าอื่นต้องต่อท้าย `ซื้อเป็น <ชื่อสินค้า>`; ถ้ามีหมายเหตุรายเต๋าให้แสดงต่อท้ายเป็นลำดับถัดไปหลังรายการสิ่งเจือปน
- edit/cancel/supplier swap ของ Stock PB ใช้ append-only reversal (`PB-EDIT-REV` หรือ `PB-CANCEL`) และไม่ delete/rebuild ledger เดิม
- cancel ของ Stock PB ต้อง reverse ด้วย unit cost/value เดิมของ PB แล้วให้ WAC ปัจจุบันคำนวณใหม่จาก ledger ที่เหลือ; ถ้า stock พร้อมใช้ไม่พอสำหรับ reverse ต้อง block หรือใช้ correction/approval flow แยก
- อัปเดต WTI usage/status เป็นออกบิลแล้ว
- อัปเดต POB remaining/status ตาม allocation
- สร้าง/ปรับ PB payable status สำหรับ Payment Flow
- `purchase_bills.status` รับได้เฉพาะ `unpaid`, `partial`, `paid`, `cancelled`, และ `cancelled_supplier_swap`; ทุก writer ใช้ contract กลาง และ reader ต้อง reject ค่า status ที่ว่างหรือไม่อยู่ในชุดนี้ ห้าม default หรือ map ค่าเก่า เช่น `open` เป็นสถานะใหม่
- cancel/supplier swap ต้อง reverse/release allocation, ADV, WTI usage และ stock ledger ตาม append/reversal policy

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

- PB stock ledger append/reversal hardening ทำแล้วสำหรับ create/edit/cancel/supplier swap
- durable allocation/status/timeline ยังต้องพิสูจน์กับ legacy ทุกกรณี โดยเฉพาะ supplier swap กับ payment lock
- browser QA สำหรับ edit/cancel/supplier swap หลัง migration index ยังต้องรันใน logged-in session

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [ ] Verify legacy behavior for any gap before implementing runtime change
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [ ] Filter/validate Supplier selector by `supplier_branches` for Purchase Bill create/edit/source selection
- [ ] Update this file and canonical reference if contract changes

## 2026-07-12 Table consistency checkpoint

`/purchase/bills` now right-aligns the `ยอดรวม`, `ค้างชำระ`, and `จัดการ` headers with their right-aligned body content. What is what: these columns remain monetary/action facts on the existing Purchase Bill list. Why it stays this way: header and body geometry should communicate the same column meaning without changing bill calculations, ADV behavior, filters, API behavior, permissions, database schema, or DB state.

## 2026-07-19 Party alignment checkpoint

The `/purchase/bills` list now left-aligns the `ผู้ขาย` header to match its left-aligned body. What is what: this is the existing Supplier name column. Why it has to be like this: party names scan as text and the header must follow the same geometry as its values; numeric, status, and action columns remain unchanged, with no effect on bill calculations, APIs, permissions, database schema, or DB state.

## 2026-07-31 WTI open-bill freshness checkpoint

When a user chooses `เปิดบิลซื้อ` from a WTI row, `/purchase/bills?new=1&wti=<docNo>` reads the purchase-bill options directly from the server and does not use the browser option cache. WTI create/edit, confirm, and cancel also invalidate the Purchase Bill option cache after their writes succeed. What is what: the WTI option list determines whether the linked document can populate the Stock PB form. WTI eligibility, status, and remaining allocation are L5 business facts; their source of truth is the database through `/api/purchase/bills/options`, and they must not be served from cache for the WTI-to-PB transition. Why it has to be like this: a newly confirmed WTI is a current transaction fact, so a five-minute cached option list could incorrectly report that the WTI was missing or already billed. Normal Purchase Bill option loading may still use its scoped short-lived client cache; only the WTI-to-PB transition requires a fresh read.

## 2026-07-23 Purchase list center-alignment checkpoint

The `/purchase/bills` desktop list now centers every visible header/body column except `ยอดรวม` and `ค้างชำระ`, which stay right-aligned as monetary facts. What is what: this changes only the Purchase Bill list table geometry; `ยอดรวม` remains the bill total and `ค้างชำระ` remains the payable balance used by Payment Flow. Why it has to be like this: the requested office scanning pattern groups document identifiers, dates, supplier, status, source docs, payment docs, updater, and actions around the column center while preserving right alignment for money comparison. This does not change calculations, filters, APIs, permissions, database schema, or DB state.

## 2026-08-08 PB print measured-pagination checkpoint

What is what: `purchase-bill-print-layout.ts` owns only REMARK normalization and the pure PB page plan; `purchase-bill-print.ts` owns the two-pass browser measurement, A4 HTML, preview/print fit gate and rendering from the existing PB detail snapshot. Why it has to be like this: a fixed row count cannot predict Thai REMARK wrapping, so Browser previously pushed totals/signatures onto an unintended physical page. Measuring the exact print width and reserving the final signature zone keeps all data visible without changing purchase, stock, payable, API or database behavior.

## 2026-07-31 VAT form presentation checkpoint

- What is what: the existing `hasVat` decision uses compact `คิด VAT <rate>%` wording in the left workflow column, with the total summary in a neutral side panel. On mobile, these areas stack in reading order.
- Why it has to be like this: the calculation choice must remain close to discount/ADV decisions and the payable summary without changing the Stock-source lock, `vatType`, VAT/ADV calculation, API payload, supplier/payment flow, or ledger side effects.

## 2026-08-04 Trading item single-row checkpoint

- What is what: รายการสินค้าในบิลรับซื้อประเภท Trading แสดงสินค้า, ชื่อบนบิล, PO, น้ำหนักรวม, หัก, สุทธิ, ราคา/กก., ราคาหน้าใบ, ยอดรวม และปุ่มลบเป็นหนึ่งแถวต่อรายการบน Desktop; บน Mobile ใช้การ์ดสองคอลัมน์ โดยสินค้า ชื่อบนบิล และ PO กว้างเต็มแถวเพื่อให้กรอกได้จริงโดยไม่ต้องเลื่อนแนวนอน.
- Why it has to be like this: ผู้ใช้ต้องเปรียบเทียบข้อมูลของรายการเดียวกันตามแนวนอนได้โดยไม่เสียพื้นที่กับโครงสร้างสองแถว ขณะที่หน้าจอแคบยังต้องอ่านและแตะช่องกรอกได้สะดวก การเปลี่ยนนี้คงสูตร `สุทธิ = น้ำหนักรวม - หัก`, `ยอดรวม = สุทธิ x ราคา/กก.`, validation, PO allocation, API payload, Stock/Payment contract, database schema และข้อมูลเดิมทั้งหมด.
- Modal fit: ฟอร์มบิลรับซื้อใช้ความกว้างสูงสุด `1480px`, body padding ตาม baseline `p-4 sm:p-5` และคอลัมน์ลบกว้าง `64px` พร้อมข้อความบรรทัดเดียว เพื่อให้รายการ Desktop ทั้งแถวอยู่ในพื้นที่ใช้งานโดยไม่บีบ action; Mobile ยังคงถูกจำกัดด้วยความกว้าง viewport และใช้ card layout เดิม.
