---
title: Receipt Voucher Page Flow
aliases:
  - ใบสำคัญรับเงิน
  - Supplier Receipt Voucher
  - RV
tags:
  - ns-scrap-erp
  - purchase
  - payment
  - print
  - page-flow
status: draft
created: 2026-06-12
updated: 2026-06-12
---

# Receipt Voucher Page Flow / Flow ใบสำคัญรับเงิน Supplier

## Scope

- Route: `/purchase/receipt-vouchers`
- Current API: `GET/POST/PATCH /api/purchase/receipt-vouchers`
- Owner: Purchase + Finance
- Document prefix: `RV`
- Legacy source: `old-apps/legacy/index.html` component `view-receiptVoucher`
- Related but separate flow: `/sales/receipts` uses `RCP` for receiving money from Customer

หน้านี้คือเอกสาร `ใบสำคัญรับเงิน` ฝั่ง Supplier สำหรับกรณี `Supplier รับเงินสดเท่านั้น` ใช้ให้ Supplier บุคคลธรรมดา/ผู้รับเงินเซ็นรับเงินในกรณีไม่มีใบเสร็จจาก Supplier โดยผู้ใช้เลือก `Supplier` หนึ่งจุดด้านบน แล้วเลือก `PB` ของ Supplier นั้นเพื่อเติมข้อมูลผู้รับเงิน รายการสินค้า ยอด และข้อมูลอ้างอิงจาก Supplier/PB snapshot ก่อนบันทึกและพิมพ์

## Naming Boundary

คำว่า `Receipt Voucher` ใน legacy ถูกใช้ 2 ความหมาย ต้องแยกให้ชัดในระบบใหม่:

| Code | Route | Meaning | Money direction |
|---|---|---|---|
| `RV` | `/purchase/receipt-vouchers` | ใบสำคัญรับเงินที่ Supplier เซ็นให้บริษัทหลังรับเงินสดจากบริษัท | cash-out evidence / supplier signed cash receipt |
| `RCP` | `/sales/receipts` | เอกสารรับเงินจาก Customer เพื่อตัดลูกหนี้ SB | money in / customer receipt |

ดังนั้นเอกสารนี้พูดถึง `RV` เท่านั้น ไม่ใช่การรับเงิน Customer

## Legacy Finding

Legacy มี component `view-receiptVoucher` สำหรับ Supplier receipt voucher โดยตรง:

- สร้างเลข `RV` ด้วย `erp.nextDocNo('RV')`
- มีปุ่ม `+ สร้างใบสำคัญรับเงิน`
- เลือก `บิลซื้อ` เพื่อ pre-fill ข้อมูล แต่ไม่บังคับ
- เมื่อเลือก PB ระบบดึง `purchaseBillId`, `purchaseBillDocNo`, date, Supplier name/tax id/address/phone, license plate, salesperson, receiver signer name, items, และ note
- รายการใน voucher เป็น free-edit lines: `description`, `qty`, `price`, `amount`
- ระบบคำนวณ `totalQty`, `totalAmount`, และ `amountInWords`
- ผู้ใช้แก้ `amountInWords` ได้เอง
- save เขียนลง `db.receiptVouchers`
- edit เขียนทับเอกสารเดิม
- delete ลบ row ออกจาก `db.receiptVouchers`
- print preview ใช้หัวบริษัทจาก `db.companyProfile`

Legacy ไม่ได้เป็น payment posting owner และควรตีความเป็นเอกสารเงินสดเท่านั้นใน target:

- ไม่สร้าง `PMA`
- ไม่สร้าง `PMT`
- ไม่เขียน `bankStatement`
- ไม่แก้ยอดจ่าย PB โดยตรง
- ไม่เขียน stock ledger
- ไม่ใช้แทนหลักฐานโอนเงิน/เช็ค/รายการธนาคาร

Target decision ล่าสุดของ active Next คือ modal ต้องเริ่มจาก Supplier selector เพียงจุดเดียวด้านบน และเมื่อเลือก PB ให้เติมชื่อ เลขภาษี ที่อยู่ โทรศัพท์ sale contact และชื่อผู้รับเงินจาก PB supplier snapshot (`purchase_bills.supplier_*_snapshot`) โดยตรง จากนั้นเติมรายการสินค้า/จำนวน/หน่วย/ราคา/ยอด/ทะเบียน/หมายเหตุจาก PB ให้เป็น snapshot อัตโนมัติ โดย section รายการสินค้าเป็น read-only ใน modal

ข้อมูล Supplier ที่เติมจาก PB ต้องไม่มี fallback:

- ที่อยู่ใช้ `purchase_bills.supplier_address_snapshot` เท่านั้น
- เบอร์โทรใช้ `purchase_bills.supplier_phone_snapshot` เท่านั้น
- เลขประจำตัวผู้เสียภาษีใช้ `purchase_bills.supplier_tax_id_snapshot` เท่านั้น
- ช่องทางติดต่อ Sale ใช้ `purchase_bills.supplier_sales_rep_snapshot` เท่านั้น
- ชื่อผู้รับเงินใช้ `purchase_bills.supplier_name_snapshot` เท่านั้น
- ห้าม fallback ไป `purchase_bills.contact_name`, address-line fields, structured address fields, หรือค่าที่ค้างในฟอร์มเดิม
- ห้าม fallback ไป live `suppliers` master ระหว่างสร้าง/พิมพ์ RV; supplier master ใช้สำหรับเลือก/กรอง Supplier เท่านั้น ส่วนเอกสารอ้างอิงใช้ PB snapshot
- modal ไม่แสดงช่อง `ผู้รับเงิน (ลายเซ็น)`; ลายเซ็นผู้รับเงินใน print ใช้ `ผู้รับเงิน` snapshot (`seller_name`) โดยตรง
- `ผู้จ่ายเงิน (ลายเซ็น)` เป็น read-only จากคนสร้างเอกสาร; client ห้ามส่งค่า override และ server ต้องบันทึกจาก current actor/created_by

## Current Next Implementation Snapshot

ตรวจ ณ 2026-06-12:

- `/purchase/receipt-vouchers` ใช้ `ReceiptVouchersPageClient`
- `GET /api/purchase/receipt-vouchers` อ่านจาก `receipt_vouchers`
- `GET /api/purchase/receipt-vouchers` ส่ง Company Profile snapshot, active Supplier options, และ active PB options พร้อม item snapshot สำหรับ create/edit modal มาพร้อม list เพื่อไม่ต้องใช้สิทธิ์ admin/master แยกตอนพิมพ์
- permission: `finance.cash.view`
- list รองรับ search/date filter/pagination/print preview
- ปุ่ม `+ สร้างใบสำคัญรับเงิน` เปิดใช้งานแล้ว
- ปุ่ม `แก้ไข` เปิดใช้งานแล้วสำหรับแก้ snapshot/manual printable fields
- ปุ่ม `ยกเลิก` เปิดใช้งานแล้วสำหรับเอกสารสถานะ `active`; ต้องกรอกเหตุผลและจะ mark เอกสารเป็น `cancelled` พร้อม timeline
- print preview ใช้ redesigned A4 template แบบ compact ที่อิงโครง legacy: company header จาก Company Profile, ชื่อเอกสารกลาง, วันที่/เลขเอกสาร, ข้อมูลผู้รับเงินแบบบรรทัดข้อความ, block `ได้รับเงินจาก` บริษัท, ตารางรายการ, summary แยกหน่วย, จำนวนเงินตัวอักษร, ลายเซ็นผู้จ่าย/ผู้รับ, และหมายเหตุแนบสำเนาบัตรประชาชน
- API มี `GET`, `POST`, `PATCH save`, และ `PATCH action=cancel`; ไม่มี hard delete
- Runtime RV contract ถือว่า complete สำหรับ batch นี้: create/edit/cancel/detail/timeline/print/no-fallback behavior มีใน code แล้ว และ migration status log ถูก apply/backfill บน dev-target แล้ว
- สิ่งที่เหลือก่อนส่งขึ้น remote คือ delivery step เท่านั้น: rerun validation ซ้ำหลัง worktree สงบ และ stage/push เฉพาะไฟล์ RV เพราะ worktree ปัจจุบันมีงาน stock/production/sales อื่นปนอยู่
- DB/API optimization checkpoint: `GET` ยังเป็น one-call page bootstrap เหมือนเดิม แต่ server เลือกเฉพาะ timeline fields ที่ต้องส่ง, Supplier options เรียง `code/name` เพื่อใช้ active Supplier index, และการออกเลข RV ใช้ monthly advisory lock แล้วอ่านเฉพาะ `doc_no` ล่าสุดของ prefix นั้น

## Current API Specification

### `GET /api/purchase/receipt-vouchers`

Purpose: โหลดข้อมูลทั้งหมดที่หน้า RV ต้องใช้ในครั้งเดียว ได้แก่ list, Company Profile สำหรับพิมพ์, Supplier options, PB options, และชื่อผู้ใช้งานปัจจุบัน

Permission: `finance.cash.view`

Response shape:

| Field | Type | Source | Notes |
|---|---|---|---|
| `companyProfile` | object \| null | `company_profiles.findFirst(order by branch_code, created_at)` | ใช้สำหรับ print header เท่านั้น |
| `companyProfile.name` | string | `company_profiles.name` | ชื่อบริษัท |
| `companyProfile.nameEn` | string | `company_profiles.name_en` | ชื่ออังกฤษ ถ้าไม่มีส่ง `''` |
| `companyProfile.address` | string | `company_profiles.address` | ที่อยู่บริษัท |
| `companyProfile.phone` | string | `company_profiles.phone` | เบอร์บริษัท |
| `companyProfile.taxId` | string | `company_profiles.tax_id` | เลขผู้เสียภาษีบริษัท ถ้าไม่มีส่ง `''` |
| `companyProfile.logoUrl` | string | `company_profiles.logo_url` | logo สำหรับเอกสารพิมพ์ ถ้าไม่มีส่ง `''` |
| `currentActor` | string | auth context | ใช้แสดงผู้จ่ายเงิน/ผู้สร้างเอกสาร |
| `suppliers[]` | array | active `suppliers` | ใช้เฉพาะ selector/filter ก่อนเลือก PB |
| `purchaseBills[]` | array | active `purchase_bills` + `purchase_bill_items` | ใช้เลือก PB และเติม snapshot ลง form |
| `rows[]` | array | `receipt_vouchers` + `receipt_voucher_status_logs` | list + print snapshot + status/timeline ของ RV ที่บันทึกแล้ว |

`suppliers[]` item:

| Field | Source | Notes |
|---|---|---|
| `id` | `suppliers.code` | frontend ใช้เป็น combobox value |
| `code` | `suppliers.code` | รหัส Supplier |
| `name` | `suppliers.name` | ชื่อ Supplier |
| `taxId` | `suppliers.tax_id` | แสดง read-only หลังเลือก Supplier; ไม่ใช่ source หลักของ PB-backed RV |
| `address` | `suppliers.address` | แสดง read-only หลังเลือก Supplier; ไม่ fallback ตอนเลือก PB |
| `phone` | `suppliers.phone` | แสดง read-only หลังเลือก Supplier; ไม่ fallback ตอนเลือก PB |

`purchaseBills[]` item:

| Field | Source | Notes |
|---|---|---|
| `id` / `docNo` | `purchase_bills.doc_no` | value สำหรับ PB combobox |
| `date` | `purchase_bills.date` | เติม `วันที่ออกเอกสาร` ของ RV |
| `sellerCode` | joined `suppliers.code` | ใช้กรอง PB ตาม Supplier ที่เลือก |
| `sellerName` | `purchase_bills.supplier_name_snapshot` | source หลักของผู้รับเงินเมื่อเลือก PB |
| `sellerTaxId` | `purchase_bills.supplier_tax_id_snapshot` | ห้าม fallback |
| `sellerAddress` | `purchase_bills.supplier_address_snapshot` | ห้าม fallback |
| `sellerPhone` | `purchase_bills.supplier_phone_snapshot` | ห้าม fallback |
| `salesPerson` | `purchase_bills.supplier_sales_rep_snapshot` | ห้าม fallback |
| `licensePlate` | `purchase_bills.license_plate` | แสดง/พิมพ์เป็น snapshot จาก PB; modal ไม่ให้แก้ |
| `note` | `purchase_bills.note ?? purchase_bills.notes` | เติมหมายเหตุ RV |
| `totalAmount` | `purchase_bills.total_amount` | ใช้แสดงยอดอ้างอิง |
| `items[]` | `purchase_bill_items` | เติม section รายการสินค้าแบบ read-only |

`purchaseBills[].items[]` item:

| Field | Source | Notes |
|---|---|---|
| `id` | `${PB doc_no}-${line_no}` | frontend key |
| `description` | `display_name` หรือ `product_code + product_name` | ถ้าไม่มีชื่อใช้ `รายการสินค้า` |
| `qty` | `purchase_bill_items.qty` | จำนวน/น้ำหนัก |
| `unit` | `purchase_bill_items.unit ?? 'กก.'` | ต้องเก็บหน่วยจริงของเอกสาร |
| `price` | `purchase_bill_items.price` | ราคา/หน่วย |
| `amount` | `purchase_bill_items.amount` | ยอดบรรทัด |

`rows[]` item:

| Field | Source | Notes |
|---|---|---|
| `id` / `docNo` | `receipt_vouchers.doc_no` | list id และเลขเอกสาร |
| `date` | `receipt_vouchers.date` | วันที่ออกเอกสาร |
| `purchaseBillDocNo` | `receipt_vouchers.purchase_bill_doc_no` | เลข PB อ้างอิง |
| `sellerName`, `sellerTaxId`, `sellerAddress`, `sellerPhone`, `salesPerson` | `receipt_vouchers.*` | snapshot ที่บันทึกไว้ใน RV แล้ว |
| `licensePlate` | `receipt_vouchers.license_plate` | snapshot จาก PB ตอนสร้าง/แก้ |
| `items` | `receipt_vouchers.items` | JSON snapshot สำหรับ print |
| `totalQty`, `totalAmount` | `receipt_vouchers.total_qty`, `total_amount` | server คำนวณจาก items ตอน save |
| `amountInWords` | `receipt_vouchers.amount_in_words` | ถ้า client ไม่ส่ง server คำนวณจากยอดรวม |
| `paymentMethod` | `receipt_vouchers.payment_method` | ต้องเป็น `รับเงินสด` |
| `payerSignerName` | `receipt_vouchers.payer_signer_name ?? created_by` | ผู้จ่ายเงินจากคนสร้างเอกสาร |
| `status` | `receipt_vouchers.status` | `active` หรือ `cancelled` |
| `cancelNote`, `cancelledAt`, `cancelledBy` | `receipt_vouchers.cancel_*` | แสดงใน detail/print watermark เมื่อยกเลิก |
| `timeline[]` | `receipt_voucher_status_logs` | create/edit/cancel audit ของ RV |
| `createdAt`, `createdBy`, `updatedAt`, `updatedBy` | audit columns | แสดง/ตรวจสอบประวัติ |

### `POST /api/purchase/receipt-vouchers`

Purpose: สร้าง RV manual cash-only จาก Supplier/PB snapshot

Permission: `finance.cash.view`

Request body:

| Field | Type | Required | Rule |
|---|---|---:|---|
| `date` | `YYYY-MM-DD` | yes | วันที่ออกเอกสาร |
| `purchaseBillDocNo` | string | no, target should be yes for PB-backed RV | ถ้าส่ง ต้องมี PB active และต้องตรงกับ Supplier ที่เลือก |
| `supplierCode` | string | no | ใช้ validate ว่า PB belongs to Supplier |
| `sellerName` | string | required only when no PB | ignored for PB-backed RV; server copies from `purchase_bills.supplier_name_snapshot` |
| `sellerTaxId` | string | no | ignored for PB-backed RV; server copies from `purchase_bills.supplier_tax_id_snapshot` |
| `sellerAddress` | string | no | ignored for PB-backed RV; server copies from `purchase_bills.supplier_address_snapshot` |
| `sellerPhone` | string | no | ignored for PB-backed RV; server copies from `purchase_bills.supplier_phone_snapshot` |
| `salesPerson` | string | no | ignored for PB-backed RV; server copies from `purchase_bills.supplier_sales_rep_snapshot` |
| `licensePlate` | string | no | ignored for PB-backed RV; server copies from `purchase_bills.license_plate` |
| `items[]` | array | required only when no PB | ignored for PB-backed RV; server copies from `purchase_bill_items` |
| `items[].description` | string | yes when no PB | รายการสินค้า |
| `items[].qty` | number | yes when no PB | ต้องไม่ติดลบ |
| `items[].unit` | string | no | ถ้าไม่ส่ง server ใช้ `กก.` |
| `items[].price` | number | yes when no PB | ต้องไม่ติดลบ |
| `amountInWords` | string | no | ถ้าไม่ส่ง server คำนวณภาษาไทย |
| `note` | string | no | หมายเหตุเอกสาร |
| `paymentMethod` | string | no | client อาจส่ง แต่ server บังคับเก็บเป็น `รับเงินสด` |
| `docNo` | string | no | create ไม่ใช้ค่า client; server generate ใหม่ |

Server behavior:

- generate เลข `RVYYMM-NNNN` จาก `date`
- normalize item amount = `qty * price`
- calculate `total_qty` and `total_amount`
- set `payment_method = 'รับเงินสด'`
- set `payer_signer_name = current actor`
- if `purchaseBillDocNo` exists, re-read PB inside the transaction and copy supplier fields, license plate, and item rows from PB snapshots/tables on the server
- PB-backed save must ignore client-submitted `seller*`, `salesPerson`, `licensePlate`, and `items` values; this is enforcement of PB snapshot, not fallback
- if PB snapshot fields are blank, RV fields remain blank; server must not fallback to live Supplier master or alternate PB fields
- set `receiver_signer_name = seller_name` after PB/manual source resolution
- validate selected PB exists and is not mismatched with `supplierCode`
- write only `receipt_vouchers`; no PMA/PMT/BST/AP/stock side effect

Response:

```json
{ "docNo": "RV2606-0001", "id": "RV2606-0001" }
```

### `PATCH /api/purchase/receipt-vouchers`

Purpose: แก้ไข RV printable snapshot ที่มีอยู่

Permission: `finance.cash.view`

Request body: same as `POST` plus required `docNo`

Server behavior:

- find existing `receipt_vouchers.doc_no`
- preserve payer signer from original `created_by` when available
- re-read PB snapshot/items on the server when `purchaseBillDocNo` is present, then recompute items, totals, amount text, and cash payment method the same as create
- update only `receipt_vouchers`
- no payment reversal, no bank statement, no stock ledger mutation

Response:

```json
{ "docNo": "RV2606-0001", "id": "RV2606-0001" }
```

### `PATCH /api/purchase/receipt-vouchers` with `action=cancel`

Purpose: ยกเลิก RV โดยไม่ reverse payment/stock/AP

Permission: `finance.cash.view`

Request body:

| Field | Type | Required | Rule |
|---|---|---:|---|
| `action` | string | yes | must be `cancel` |
| `docNo` | string | yes | existing RV doc no |
| `note` | string | yes | เหตุผลการยกเลิก |

Server behavior:

- find existing `receipt_vouchers.doc_no`
- reject if already `cancelled`
- update `status = cancelled`, `cancel_note`, `cancelled_at`, `cancelled_by`, `updated_at`, `updated_by`
- append `receipt_voucher_status_logs.action = cancelled`
- no PMA/PMT/BST/AP/stock mutation

### Not Implemented Yet

| API | Status | Reason |
|---|---|---|
| `DELETE /api/purchase/receipt-vouchers` | not implemented | target should be cancel, not hard delete |
| `GET /api/purchase/receipt-vouchers/[docNo]` | not implemented | current page loads list/detail/print snapshot from collection endpoint |

## Target Decision

`RV` เป็นเอกสารหลักฐาน/printable document สำหรับ `จ่ายเงินสดให้ Supplier` ที่ผูกกับ purchase/payment facts แต่ไม่ควรเป็น owner ของการจ่ายเงิน

Target ที่เหมาะสม:

- `RV` เป็น manual printable document: ผู้ใช้กดสร้างจากหน้า RV, เลือก `Supplier` เพื่อกรอง PB, เลือก `PB` เพื่อ pre-fill ข้อมูลผู้รับเงินและรายการสินค้า/ยอด แล้วแก้ได้เฉพาะ field printable ที่เปิดให้แก้ก่อนพิมพ์
- `PMT` ไม่ auto-generate `RV`; ถ้าต้องออกหลักฐาน Supplier เซ็นรับเงินสด ผู้ใช้ต้องสร้าง RV เองจากหน้า `/purchase/receipt-vouchers`
- เลข `RV` ใช้ running ของตัวเองตาม legacy (`RVYYMM-NNNN`) ไม่ derive จากเลข `PMT`
- สร้าง/แก้ `RV` ได้เฉพาะเพื่อหลักฐานเงินสดให้ Supplier กรณีไม่มีใบเสร็จจาก Supplier
- ถ้าเลือก PB เอกสาร RV ยังเป็นหลักฐานพิมพ์/เตรียมเอกสารเท่านั้น ไม่ใช่ตัวบันทึกการจ่าย
- ถ้าเป็นโอนเงิน/เช็ค/ช่องทางธนาคาร ให้ใช้ `PMT` payment voucher หรือหลักฐานธนาคาร ไม่ออก `RV`
- print ต้องใช้ snapshot ของ RV และ Company Profile ณ ตอนพิมพ์/บันทึก ไม่ resolve master data แบบทำให้เอกสารเก่าเปลี่ยน
- ยกเลิก/แก้ไข RV ต้องไม่ reverse payment; ถ้าต้อง reverse เงิน ให้ไปทำใน PMT/payment flow

## Target Flow

| Step | User action | System result | Side effect |
|---|---|---|---|
| 1 | เปิดหน้า RV | โหลดรายการ `receipt_vouchers` | none |
| 2 | กดสร้าง RV | เปิด modal สร้างเอกสาร เลข `RV` auto | none |
| 3 | เลือก Supplier ใน section ข้อมูลหลักด้านบน | filter PB options; show Supplier info from master as read-only | none |
| 4 | เลือก PB | pre-fill receiver fields directly from PB supplier snapshot plus purchase bill ref, date, vehicle, items, amount, note | none |
| 5 | แก้ field ที่ขาด | user edits allowed printable fields only; supplier info, payer/receiver signature names, payment method, and item/amount rows remain read-only from PB/Supplier snapshot | none |
| 6 | บันทึก RV | insert/update `receipt_vouchers` + timeline/audit | no bank/stock/AP mutation |
| 7 | พิมพ์ | render A4 from RV snapshot + Company Profile | no mutation |
| 8 | ยกเลิก RV | mark cancelled with reason/timeline | no payment reversal |

### Payment Boundary

`PMT` ยังเป็น owner ของ payment facts, AP settlement, payment allocations, and `bank_statement`.

`RV` ไม่สร้าง PMT, ไม่สร้าง PMA, ไม่เขียน BST, และไม่ตัด payable balance. Runtime payment route must not create/update/delete RV automatically.

## Print Template Contract

Template อิง legacy `view-receiptVoucher`:

- Company header: ชื่อบริษัท, ชื่ออังกฤษ, ที่อยู่, โทรศัพท์, เลขประจำตัวผู้เสียภาษี จาก Company Profile
- Document title: `ใบสำคัญรับเงิน`
- Header: วันที่ออกเอกสาร
- Supplier block: `ข้าพเจ้า`, เลขประจำตัวผู้เสียภาษี/บัตรประชาชน, ที่อยู่, โทร, ทะเบียน, Sale
- Company receipt block: `ได้รับเงินจาก`, ที่อยู่บริษัท, เลขประจำตัวผู้เสียภาษีบริษัท
- Items table: ลำดับ, รายการ, จำนวน/หน่วย, ราคา/บาท, จำนวนเงิน, รวม
- Amount text: จำนวนเงินตัวอักษร
- Signature: ผู้จ่ายเงิน, ผู้รับเงิน
- Footer: วิธีรับเงินต้องเป็นเงินสด และข้อความแนบสำเนาบัตรประชาชนผู้รับเงิน

Active Next print layout can be redesigned from legacy as long as these data blocks remain visible. Current target layout follows the corporate A4 portrait pattern from Purchase Bill print: Company Profile logo/name/address header, document meta cards on the right, two panels for Supplier receiver and company payer, dense item table, bottom note/amount-in-words area, compact cash total card, and two signature blocks. It uses system doc no, real unit summary, and snapshot-driven data.

## Data Contract

### Header

| Field | Source / rule |
|---|---|
| `doc_no` | generated `RV...`, read-only in UI |
| `date` | วันที่ออกเอกสาร; default today; editable; separate from system `created_at` |
| `purchase_bill_doc_no` | required source PB reference selected after Supplier for item pre-fill |
| `seller_name` | read-only from selected Supplier before PB; PB-backed RV overwrites from `purchase_bills.supplier_name_snapshot` |
| `seller_tax_id` | read-only from selected Supplier before PB; PB-backed RV overwrites from `purchase_bills.supplier_tax_id_snapshot` |
| `seller_address` | read-only from selected Supplier before PB; PB-backed RV overwrites from `purchase_bills.supplier_address_snapshot` |
| `seller_phone` | read-only from selected Supplier before PB; PB-backed RV overwrites from `purchase_bills.supplier_phone_snapshot` |
| `license_plate` | PB snapshot if selected; not editable in RV modal |
| `sales_person` | read-only from selected Supplier before PB; PB-backed RV overwrites from `purchase_bills.supplier_sales_rep_snapshot` |
| `payment_method` | fixed `รับเงินสด`; not editable in modal; not transfer/check/payment posting instruction |
| `payer_signer_name` | server-owned signer from document creator/current actor |
| `receiver_signer_name` | server-owned copy of `seller_name`; modal does not expose a separate receiver signer field |
| `status` | default `active`; `cancelled` after cancel action |
| `cancel_note`, `cancelled_at`, `cancelled_by` | populated only by cancel action |

### Items

`items` is a read-only snapshot array from selected PB in the modal:

| Field | Meaning |
|---|---|
| `description` | product/line description printed on RV |
| `qty` | quantity/weight shown on RV |
| `unit` | target required when source product unit exists; legacy assumed kg |
| `price` | price per unit/weight |
| `amount` | line amount |

Target must preserve unit display from the PB/RV item snapshot. Legacy showed `จำนวน/กก.` only, but active target supports both `กก.` and `ลัง`, so new runtime must not hardcode kg for all products.

## Validation / Status Rules

- `seller_name` required
- at least 1 valid item required
- `amountInWords` auto-calc but editable
- `doc_no` must be unique
- selected Supplier should come from active supplier options when the user uses the selector; seller fields remain saved as RV snapshot
- selected PB must exist, belong to the selected Supplier when Supplier is selected, and must not be cancelled
- item rows in the RV modal are not manually editable; update the source PB if item/qty/price is wrong
- payment method must be cash only; create/edit write path stores `รับเงินสด`
- print as payment evidence should remain a Supplier cash receipt document, not proof of bank transfer/payment posting
- cancelled RV cannot be edited; can still be printed as cancelled copy if target enables it
- RV cancellation does not cancel PB/PMA/PMT

## Status Model

| Status | Meaning | Edit | Print |
|---|---|---:|---:|
| `active` | printable RV evidence | yes | yes |
| `cancelled` | cancelled RV document | no | yes, cancelled watermark |

Current Next exposes `active/cancelled` only. `draft/issued` is intentionally not used in this runtime batch because RV has no approval/payment ownership.

## Side Effects

Allowed:

- write `receipt_vouchers`
- append RV timeline/status/audit
- read PB/supplier/company profile snapshots

Not allowed:

- create or approve PMA
- create PMT
- write `bank_statement`
- update PB paid/payable balance
- write stock ledger
- mutate supplier master data from RV edits
- issue RV for transfer/check/non-cash payment methods

## Print Contract

Print document must include:

- Company Profile header, tax id, address, phone
- document title `ใบสำคัญรับเงิน`
- RV date and document number
- seller name, tax id, address, phone
- license plate and salesperson if available
- source PB reference if selected
- line items with quantity, unit, price, amount
- total quantity summary by unit, total amount, and amount in Thai words
- note
- payer signer and receiver signer
- cash payment method text snapshot
- attachment note for ID card where applicable
- cancelled/draft watermark when status requires it

## Implementation Gaps

- [x] Add source-aware create modal for `RV`
- [x] Use Supplier selector as primary pre-fill source in RV modal
- [x] Keep only one Supplier selector at the top of the RV modal; supplier details are auto-filled read-only display
- [x] Add optional PB selector to auto-fill RV item snapshot
- [x] Add `POST /api/purchase/receipt-vouchers`
- [x] Add edit route for RV snapshot fields
- [x] Remove PMT auto-generate RV from payment write path
- [x] Add cancel route with status log/audit
- [x] Enforce cash-only payment method in create/edit write path
- [x] Replace print placeholder header with Company Profile payload
- [x] Preserve item unit snapshot; do not assume every line is kg
- [x] Add RV timeline/status log per document timeline policy
- [x] Keep `/sales/receipts` / `RCP` docs and UI separate from `/purchase/receipt-vouchers` / `RV`

## Delivery Status

Status ณ 2026-06-12:

- Runtime implementation: complete for current RV scope
- Dev-target migration: applied and existing RV create log backfilled
- DB/API optimization: migration `20260612224500_optimize_receipt_voucher_queries.sql` applied to dev-target; it adds indexes for RV list ordering, RV doc-number prefix lookup, RV timeline ordering, active PB options, and active Supplier selector ordering
- Query-plan result: active Supplier selector changed from seq scan + sort around 190ms on 1,870 active rows to `idx_suppliers_active_code_name` index scan around 5.5ms on dev-target; RV/PB tables are currently small so Postgres may still choose seq scan, but the target indexes are present for growth
- Browser smoke: passed for list load, detail/timeline modal, cancel dialog open/close, and print preview
- Validation: Prisma generate passed after the optimization migration/schema update, targeted ESLint passed for RV route/Prisma guard, full lint passed earlier with one unrelated existing `<img>` warning in Products, `git diff --check` passed, type-check passed once before final Prisma stale-guard update; later reruns after optimization exited `143` with no TypeScript diagnostic output
- Push: not done in this checkpoint because worktree contains unrelated dirty files; push should stage only the RV migration/schema/API/UI/doc/prisma guard files
- Data note: RV/PB rows created before PB supplier snapshot may legitimately show blank supplier fields under the no-fallback rule; do not add runtime fallback for old rows

## Related Notes

- [[Printable Documents]]
- [[Payment Flow]]
- [[Purchase Flow]]
- [[P0 Transaction Stock Payment Current Code Baseline]]
