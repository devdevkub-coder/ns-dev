# Purchase Bills Data Dictionary

Purpose: อธิบายตาราง `public.purchase_bills` และ `public.purchase_bill_items` ให้ developer อ่านร่วมกันได้ โดยแยกความหมาย business, การใช้งานใน Next app, และข้อควรระวังของ schema ปัจจุบัน

Current source of truth:

- Prisma model: `apps/next/prisma/schema.prisma` models `purchase_bills`, `purchase_bill_items`
- Active page: `/purchase/bills`
- Active API: `/api/purchase/bills`
- Supplier payment API: `/api/purchase/payments`
- DB environment for development: dev-target Supabase
- Latest local dev-target schema-only dump: `reports/db_audit/dev_target_schema_20260522.sql`
- Canonical purchase flow requirement: `docs/notes/Purchase Flow.md`

## Table Summary

`purchase_bills` คือ header table ของบิลรับซื้อ เก็บข้อมูลระดับหัวบิล เช่น เลขเอกสาร วันที่ ผู้ขาย สาขา ยอดเงิน VAT และสถานะจ่าย

`purchase_bill_items` คือ line table ของรายการสินค้าในบิลรับซื้อหนึ่งใบ ใช้เป็น source หลักสำหรับ product/PO join, report, reconciliation และ audit รายแถว

`purchase_bills.items` ถูกแยกออกแล้ว ไม่ใช่ column ที่ใช้งานใน target schema ใหม่

## Key Rule

- `id` ไม่ใช่เลขรันเอกสาร ใช้เป็น primary key ภายใน
- `doc_no` คือเลขเอกสารที่ผู้ใช้เห็นและเป็น running document number
- `date` คือวันที่เอกสาร/วันที่บิล
- `created_at` คือเวลาที่สร้าง record จริง ใช้ audit
- รายการสินค้าให้ดูที่ `purchase_bill_items` เป็นหลัก
- การเกิดบิลซื้อไม่ได้สร้าง row ใน `payments` ทันที แต่ทำให้บิลมี `payable_balance > 0` เพื่อขึ้นคิวในหน้า `/purchase/payments`
- การจ่ายเงินจริงเกิดจาก `payments`; หลังบันทึก payment แล้ว API จะ refresh `purchase_bills.paid_amount`, `payable_balance`, และ `status` จากผลรวม `payments` ที่ไม่ cancel
- ฟอร์มปัจจุบันไม่ให้กรอก `ref_no`, `contact_phone`, `purchase_source`, `channel_id`, และ `sales_id` โดยตรงแล้ว แต่ column ยังอยู่เพื่อรองรับข้อมูลเดิมและ flow ที่ยังไม่ reconcile
- Target purchase flow ต้องแยก 2 มิติ: `purchase_flow` = `Stock`/`Trading` และ `purchase_source` = `PO`/`Spot`
- `purchase_flow` คุมผลต่อ stock: `Stock` ใช้ใบรับของและสร้าง stock ledger, `Trading` ไม่เข้า stock; `purchase_source` คุมการอ้าง PO: `PO` ตัด PO, `Spot` ไม่ตัด PO
- `Spot Buy` ในบิล Trading หมายถึงไม่มี PO ให้ตัดเท่านั้น ไม่ได้หมายความว่าเข้า stock; ทั้ง `Trading + PO` และ `Trading + Spot` ต้องไม่สร้าง stock ledger
- Target UI/API ต้องให้เลือก source `PO`/`Spot Buy` ได้ระดับรายการสินค้า แล้ว derive header `purchase_source` เป็น `SPOT_BUY`, `PO_RECEIPT`, หรือ `MIXED`
- Stock purchase bill ต้องมาจาก `ใบรับของ / Weight Ticket In` (`WTI{branchCode}{YYMM}-NNNN`) และสร้าง stock ledger เฉพาะเมื่อเป็น Stock
- `รายการใบรับ-ส่งของ` เป็นหน้า list/search กลางของ WTI/WTO; บิลรับซื้อ Stock ต้องเลือกได้เฉพาะ WTI ที่ตรงสาขา/ผู้ขายและยังออกบิลไม่ครบ
- Stock purchase bill flow: office เลือกสาขาและผู้ขายก่อน แล้วเลือกใบรับของ; ระบบแสดงสินค้า/น้ำหนักจากใบรับของ และผู้ใช้ allocate น้ำหนักรายบรรทัดไปตัด PO หรือ `Spot Buy`
- ถ้าใบรับของมียอดเกิน PO ที่เลือก ผู้ใช้ต้องเพิ่มบรรทัดจากใบรับของเดิมและเลือก `Spot Buy` หรือ PO อื่น เพื่อให้ยอดที่นำมาออกบิลครบตามใบรับของ
- Section รายการสินค้าในบิลรับซื้อต้องมี field `ราคาหน้าใบ` ต่อบรรทัด เก็บที่ `purchase_bill_items.sales_price` เพื่อใช้ต่อใน Sale Tracking / commission calculation
- Target purchase bill มีส่วนลดได้เฉพาะ `ส่วนลดท้ายใบ` ระดับหัวบิลเท่านั้น ห้ามมีส่วนลดรายสินค้า
- `ส่วนลดท้ายใบ` ต้องบันทึกเป็นค่าใช้จ่าย/รายการแยก และต้องไม่ลดต้นทุนสินค้า, stock ledger cost, WAC, หรือ Cost Pool
- Trading purchase bill ไม่ใช้ `ใบรับของ`, ต้องกรอกสินค้า จำนวน/น้ำหนักในบิลรับซื้อ, ไม่สร้าง stock ledger, และตัด PO เฉพาะกรณี Trading + PO
- Cost Pool รับเฉพาะ `PO Buy` และ `Stock Spot Buy / No PO purchase bill` ที่อยู่ในกลุ่มทองแดง/ทองเหลือง (`ทองแดง`, `ทองเหลือง`, `copper`, `brass`); PB line ที่อ้าง PO ไม่สร้าง Cost Pool source เพิ่ม
- ถ้า PO Buy ถูกปิดแบบ `ปิดรับไม่ครบ` ต้องไม่เหลือยอด PO คงเหลือที่ยังไม่ได้รับอยู่ใน Cost Pool candidate; ห้ามลบยอดที่รับ/ออกบิล/ลง stock ไปแล้ว
- Schema ปัจจุบันยังใช้ `transaction_mode`, `purchase_source`, `po_buy_id`, และ `purchase_bill_items.po_buy_id` เป็น compatibility ระหว่างรอ normalize allocation tables

## `purchase_bills` Columns

| Column | Type | Required | Meaning | Current UI/API Notes |
|---|---:|---:|---|---|
| `id` | text | yes | Primary key ภายในของบิล | สร้างเป็น string id ไม่ใช่ running number |
| `doc_no` | text | yes | เลขที่บิลรับซื้อ | ระบบออกเลขให้ตอน save ใช้แสดงในตารางและรายละเอียด |
| `date` | date | yes | วันที่เอกสาร/วันที่บิล | บิลใหม่ derive จากเวลาสร้างตาม Bangkok date |
| `ref_no` | text | no | เลขอ้างอิง supplier/legacy invoice ref | ซ่อนจากฟอร์ม create/edit แล้ว แต่ยังแสดง/เก็บข้อมูลเก่าได้ |
| `tax_invoice_no` | text | no | field legacy สำหรับเลขใบกำกับภาษี | ใช้ `vat_invoice_no` เป็นหลักใน flow ปัจจุบัน |
| `supplier_id` | text | no | ผู้ขาย | ฟอร์มบังคับเลือกผ่าน supplier search |
| `branch_id` | text | no | สาขา | ฟอร์มบังคับเลือกเป็น `สาขา/คลัง` |
| `channel_id` | text | no | ช่องทางซื้อ | ซ่อนจากฟอร์มแล้ว |
| `warehouse_id` | text | no | คลัง | ปัจจุบัน derive/ผูกกับ branch flow ที่ใช้งาน |
| `transaction_mode` | text | no | ประเภทบิล เช่น `STOCK`, `TRADING` | compatibility field สำหรับแยก Stock/Trading; target ควร normalize เป็น `purchase_flow` |
| `vat_type` | text | no | วิธีคิด VAT เช่น `NONE`, `EXCLUDE`, `INCLUDE` | checkbox VAT ตอนติ๊กตั้งเป็น `EXCLUDE`, ตอนปิดตั้งเป็น `NONE` |
| `subtotal` | numeric | no | ยอดรวมรายการก่อนส่วนลดท้ายใบ | คำนวณจากรายการสินค้าโดยไม่หักส่วนลดรายสินค้า |
| `discount` | numeric | no | ส่วนลด field เก่า/compatibility | Target ให้ใช้ `discount_total` เป็นส่วนลดท้ายใบเท่านั้น |
| `vat_amount` | numeric | no | ยอด VAT | คำนวณจาก active VAT config/rate ที่ใช้กับบิล |
| `total_amount` | numeric | yes | ยอดสุทธิ | ใช้ในตาราง, AP, ยอดค้าง |
| `paid_amount` | numeric | no | ยอดที่จ่ายแล้ว | คำนวณจาก payments ที่ไม่ cancel |
| `payable_balance` | numeric | no | ยอดค้างจ่าย | `total_amount - paid_amount` |
| `status` | text | no | สถานะบิล เช่น `open`, `partial`, `paid` | derive จากยอดจ่าย |
| `notes` | text | no | หมายเหตุ legacy | ปัจจุบันใช้ควบคู่/compatibility กับ `note` |
| `created_by` | text | no | ผู้สร้าง | actor จาก auth context |
| `created_at` | timestamptz | no | เวลาสร้าง record | ใช้ audit และ derive วันที่บิลใหม่ |
| `updated_at` | timestamptz | no | เวลาแก้ล่าสุด | ใช้ audit |
| `sales_id` | text | no | เซลที่ดูแล | ฟอร์มไม่ให้กรอกเองแล้ว derive จาก supplier master |
| `license_plate` | text | no | ทะเบียนรถ | ฟอร์ม/API ปัจจุบันบังคับกรอก แต่ DB ยัง nullable เพื่อรองรับข้อมูลเก่า |
| `contact_phone` | text | no | เบอร์โทร | ซ่อนจากฟอร์มแล้ว |
| `contact_name` | text | no | ชื่อผู้ติดต่อ | legacy/unused ในฟอร์มปัจจุบัน |
| `vat_invoice_received` | boolean | no | ได้รับใบกำกับภาษีแล้วหรือยัง | ใช้ใน VAT tracking UI |
| `vat_invoice_no` | text | no | เลขใบกำกับภาษี | บังคับเมื่อ user ติ๊กว่าได้รับใบกำกับแล้ว |
| `vat_invoice_date` | date | no | วันที่ใบกำกับภาษี | บังคับเมื่อ user ติ๊กว่าได้รับใบกำกับแล้ว |
| `vat_invoice_received_at` | timestamptz | no | เวลาที่บันทึกการได้รับใบกำกับ | ตั้งเมื่อ received เป็น true |
| `purchase_source` | text | no | ที่มาบิล เช่น `SPOT_BUY`, `PO_RECEIPT`, `MIXED` | legacy/compatibility field; target ต้องเหลือ source ชัดเจนเป็น `PO` หรือ `Spot` |
| `po_buy_id` | text | no | PO Buy ระดับหัวบิล/legacy link | ไม่พอสำหรับ many-to-many; รายการ/ allocation table ต้องเป็น source สำหรับการตัด PO |
| `purchase_type` | text | no | field legacy/สำรอง | ยังไม่ใช่ source of truth ในฟอร์มปัจจุบัน |
| `discount_total` | numeric | no | ส่วนลดท้ายใบ | เป็นส่วนลดเดียวที่ผู้ใช้กรอกได้ใน target flow; บันทึกเป็นค่าใช้จ่าย/รายการแยก ไม่ปันกลับเข้าต้นทุนสินค้า |
| `has_vat` | boolean | no | บิลมี VAT หรือไม่ | checkbox VAT |
| `note` | text | no | หมายเหตุปัจจุบัน | ฟอร์มหมายเหตุเขียนลง `note` และ `notes` เพื่อ compatibility |
| `updated_by` | text | no | ผู้แก้ล่าสุด | actor จาก auth context |
| `has_wht` | boolean | no | มี WHT หรือไม่ | ยังไม่เปิดใช้เต็มใน purchase bill totals |
| `wht_amount` | numeric | no | ยอด WHT | config WHT มีแล้ว แต่ purchase bill ยังไม่ apply เต็ม flow |
| `total_cost` | numeric | no | ต้นทุนรวม | ใช้กับ flow costing/trading บางส่วน |
| `swap_history` | jsonb | no | ประวัติการ swap/แก้ supplier หรือรายการบางแบบ | ใช้ใน report/history เฉพาะทาง |
| `total_commission` | numeric | no | ค่าคอมรวม | ใช้กับ commission flow |
| `commission_pct` | numeric | no | เปอร์เซ็นต์คอม | ใช้กับ commission flow |
| `deduction_qty` | numeric | no | น้ำหนักหักรวม | compatibility/summary field |
| `deduction_amount` | numeric | no | มูลค่าหักรวม | compatibility/summary field |
| `version` | integer | no | version ของ record | เตรียมสำหรับ audit/locking/compatibility |
| `vat_rate_percent` | numeric | yes | VAT percent ที่ใช้กับบิลนั้น | default 7.00; บิลใหม่อ่านจาก `vat_settings` แล้วบันทึก rate ที่ใช้ |

## AP / Supplier Payment Flow

บิลรับซื้อสร้างภาระเจ้าหนี้โดยตรงผ่าน `purchase_bills.payable_balance`:

1. สร้างบิลซื้อที่ `/api/purchase/bills`
   - `paid_amount` รวมยอด PMT ที่ไม่ cancelled และ ADV allocation ที่ active
   - `payable_balance = total_amount - paid_amount`
   - `status = unpaid / partial / paid / cancelled`
   - ถ้าเป็น `STOCK` จะเขียน `stock_ledger`; ถ้าเป็น `TRADING` ไม่เข้า stock
   - target flow: `STOCK` ต้องอ้างใบรับของและ allocate receipt line ไป PO/Spot ในบิล ส่วน `TRADING` ต้องกรอกจำนวน/น้ำหนักในบิลเอง
2. หน้า `/daily/payment-approval` โหลด PB ที่ `payable_balance > 0` และยังไม่ cancelled เป็น source `ยังไม่อนุมัติ`
   - การอนุมัติสร้าง snapshot ใน `payment_approvals` ด้วยเลข `PMA...`
   - `payment_approvals.status in ('approved','paid')` ถือเป็น active/locked PMA สำหรับ source PB
   - PB ที่มี PMA active ต้อง lock field การเงิน, คู่ค้า, สาขา, VAT/ส่วนลด, WTI/PO/ADV allocation และ action แก้ไข/ยกเลิก
3. หน้า `/purchase/payments` โหลดเฉพาะ PMA ที่ `status = approved`
   - ผู้ใช้ทำจ่ายจาก PMA ไม่ใช่จาก PB โดยตรง
   - `payments` ยังไม่มี row จนกว่าผู้ใช้กดบันทึก Payment Voucher จาก PMA
4. เมื่อบันทึกจ่ายผู้รับเงินที่ `POST /api/purchase/payments`
   - สร้าง row ใน `payments`; ถ้า voucher มีหลาย PMA จะสร้าง 1 row ต่อ PMA/source โดยใช้ `doc_no` และ `voucher_id` เดียวกัน
   - สร้าง `bank_statement` เงินออก `ref_type = PMT`; ถ้าแยกหลายบัญชีจะสร้าง 1 row ต่อบัญชีจ่าย โดยใช้ `ref_id` เดียวกัน
   - refresh บิลซื้อที่เกี่ยวข้องใน transaction เดียวกัน โดยรวมยอดจาก `payments` ที่ `status != cancelled`
   - `lines`, `accountId`, `amount`, `method`, และ `splits` ต้องมีค่าใน API payload; `billId`/`supplierId` top-level ยังใช้เป็น compatibility ของบรรทัดแรก
   - `lines` คือรายการบิลที่จะจ่าย เช่น `{ billId, supplierId, amount, withholdingTax, discount, fee }`
   - `splits` คือบัญชีจ่ายจริงแบบ legacy split payment; ผลรวม `splits.amount` ต้องเท่ากับ `net_amount`
   - `/purchase/payments` modal ต้องแสดง validation error ใน modal เองเมื่อยังไม่เลือก `บัญชีจ่าย` หรือยอด split ไม่เท่ากับ `net_amount`; ห้ามปล่อยให้ browser-native validation ทำให้ปุ่มบันทึกดูเหมือนไม่ตอบสนอง
   - ผู้ใช้กรอกเฉพาะ `amount` เป็นยอดเงินสดที่จะทำจ่าย; `withholding_tax` คำนวณจาก active default row ใน `wht_settings` ตามวันที่จ่าย
   - `wht_settings` เป็น master/config หลายอัตรา และ `/admin/system-settings` ต้องแสดง WHT ทุก row ให้แก้เปอร์เซ็นต์ได้รายแถว
   - สูตร WHT ปัจจุบันใช้ cash amount เป็นฐาน: `withholding_tax = amount * rate / (100 - rate)` เพื่อให้ `amount + withholding_tax` ตัดยอดค้างได้ตรงกับยอด gross ของบิล
   - สูตรยอดตัดบิล: `amount + withholding_tax + discount`
   - ถ้า payment เดิมถูกแก้แล้วย้าย `bill_id` จะ refresh ทั้งบิลเก่าและบิลใหม่
   - ถ้ายอดจ่ายรวมเกิน `purchase_bills.total_amount` เกิน 0.01 ระบบ reject และ rollback

หน้า `/purchase/bills` ไม่ใช้ `purchase_bills.status` ดิบเป็น filter หลักแล้ว แต่ derive read model จาก Payment Flow:

| สถานะหน้า PB | Runtime derive |
|---|---|
| `ยังไม่อนุมัติ` | ไม่ cancelled, `payable_balance > 0`, ไม่มี PMA active และไม่มี PMT active; partial ADV allocation ที่ยังมียอดค้างยังอยู่สถานะนี้ |
| `รอจ่าย` | มี `payment_approvals.status in ('approved','paid')` ของ PB |
| `ชำระบางส่วน` | มี PMT/payment activity จริงและ `payable_balance > 0` |
| `เสร็จสิ้น` | `payable_balance <= 0` หรือ PB settlement status เป็น `paid` |
| `ยกเลิก` | PB ถูก cancelled |

`แก้ไข` / `ยกเลิก` ใน `/purchase/bills` ต้อง disabled และ PATCH ต้อง reject เมื่อมี PMA active หรือ PMT active (`payments.status != cancelled`) เพื่อกันการแก้ source ระหว่าง payment cycle

ผลลัพธ์ของสถานะบิลหลัง refresh:

| Condition | `purchase_bills.status` |
|---|---|
| `paid_amount <= 0` | `open` |
| `payable_balance <= 0.01` | `paid` |
| อื่น ๆ | `partial` |

`purchase_bills.paid_amount` และ `purchase_bills.payable_balance` เป็น denormalized balance fields เพื่อให้หน้ารายการ, AP, dashboard และ report อ่านเร็วขึ้น แต่ source การชำระเงินจริงคือ `payments` ที่ผูกด้วย `payments.bill_id`

## `payments` Columns Used By Purchase Bills

ตาราง `payments` เป็น Payment Voucher / รายการจ่าย Supplier จริง ไม่ใช่ queue เจ้าหนี้

| Column | Type | Required | Meaning | Current UI/API Notes |
|---|---:|---:|---|---|
| `id` | text | yes | Primary key ภายในของ payment row | สร้างเป็น `PMT-*` ถ้า caller ไม่ส่ง id |
| `doc_no` | text | yes | เลขที่ Payment Voucher | ระบบออกเลข `PMT{branchCode}{YYMM}-NNNN` เมื่อ save เช่น `PMT012605-0271`; running นับต่อจากเลขเดิมทั้ง `PMT2605-*` และ `PMT012605-*` ในเดือนเดียวกัน |
| `date` | date | yes | วันที่จ่าย | ระบบส่งจากวันที่ปัจจุบันของฟอร์ม ใช้ทั้ง payment และ bank statement |
| `bill_id` | text | yes | บิลซื้อที่ตัดชำระ | API บังคับเลือก; ถ้าเปิดจาก row `ทำจ่าย` UI จะล็อกบิลเป็น read-only |
| `supplier_id` | text | yes | ผู้ขายที่รับเงิน | auto-fill จากบิล |
| `account_id` | text | yes | บัญชีจ่ายหลัก | เก็บบัญชีแรกจาก `splits` เพื่อ compatibility/filter; เงินออกจริงดูจาก `bank_statement` |
| `branch_id` | text | no | สาขาของ Payment Voucher | API ดึงจาก `purchase_bills.branch_id` ก่อน ถ้าไม่มีบิลจึง fallback จาก `accounts.branch_id`; ต้องมีสาขาเพื่อออกเลขเอกสาร |
| `amount` | numeric | yes | ยอดเงินสดที่จะทำจ่าย | ผู้ใช้กรอกช่องนี้ช่องเดียวในรายการจ่าย; นับเป็นส่วนหนึ่งของยอดตัดบิล |
| `withholding_tax` | numeric | no | WHT | UI แสดงอ่านอย่างเดียว; API คำนวณจาก `wht_settings` active rate และไม่เชื่อค่าจาก client |
| `discount` | numeric | no | ส่วนลด | นับเป็นยอดตัดบิล |
| `fee` / `bank_fee` | numeric | no | ค่าธรรมเนียม | เพิ่ม cash out แต่ไม่ตัดยอดบิลซื้อ |
| `net_amount` | numeric | no | เงินออกสุทธิ | `amount + fee` |
| `method` | text | yes | วิธีจ่าย | UI บังคับเลือกใน section บัญชีจ่าย |
| `status` | text | no | สถานะ payment | `cancelled` จะไม่ถูกนำไปรวมยอดจ่ายของบิล |
| `voucher_id` | text | no | group voucher id | ใช้รวมหลาย `payments` row ที่มาจาก Payment Voucher เดียวกัน; single-row voucher ใช้ค่าเดียวกับ `id` |

## Payment Lines

หน้า `/purchase/payments` ใช้รูปแบบ legacy multi-line voucher ใน section `รายการจ่าย`:

- ผู้ใช้กด `+ เพิ่มบรรทัด` เพื่อเลือกบิลซื้อค้างจ่ายได้มากกว่า 1 ใบใน voucher เดียว
- UI ส่ง `lines: [{ billId, supplierId, amount, withholdingTax, discount, fee }]`
- API recompute WHT ต่อบรรทัดจาก active default row ใน `wht_settings` และใช้ `amount + withholding_tax + discount` เพื่อตัดยอดบิลแต่ละใบ
- ทุกบรรทัดที่บันทึกสำเร็จใช้ `doc_no` เดียวกัน และมี `voucher_id` ชี้กลับไปที่ voucher เดียวกัน

## Payment Account Splits

หน้า `/purchase/payments` ใช้รูปแบบ legacy split payment:

- ใน modal ผู้ใช้เลือกบัญชีจ่ายได้มากกว่า 1 บัญชี
- UI ส่ง `splits: [{ accountId, amount }]` ไปที่ `POST /api/purchase/payments`
- API validate ว่าทุกบัญชี active และยอดรวม split เท่ากับ `net_amount`
- `payments.account_id` เก็บบัญชีแรกไว้เพื่อ compatibility กับ table/filter เดิม
- `bank_statement` คือ source ของเงินออกตามบัญชีจริง โดยสร้าง row แยกต่อบัญชี เช่น `BS-PMT-{paymentId}-0`, `BS-PMT-{paymentId}-1`

## `purchase_bill_items` Columns

| Column | Type | Required | Meaning | Current UI/API Notes |
|---|---:|---:|---|---|
| `id` | text | yes | Primary key ภายในของรายการ | สร้างจาก bill id + line number |
| `purchase_bill_id` | text | yes | อ้างอิงหัวบิล `purchase_bills.id` | delete header แล้วลบรายการตาม `ON DELETE CASCADE` |
| `line_no` | integer | yes | ลำดับแถวในบิล | เริ่มที่ 1 และ unique ภายในบิลเดียวกัน |
| `product_id` | text | no | สินค้า master data | FK ไป `products.id` ถ้ามีข้อมูลอ้างอิงถูกต้อง |
| `product_code` | text | no | snapshot รหัสสินค้า ณ วันที่บันทึก | ใช้แสดง/report แม้ master data เปลี่ยนชื่อภายหลัง |
| `product_name` | text | no | snapshot ชื่อสินค้า master | ใช้คู่กับ `display_name` |
| `display_name` | text | no | ชื่อสินค้าแบบแก้หน้าใบ | ว่างได้ ถ้าว่างให้แสดงชื่อ master |
| `unit` | text | no | หน่วย | ปัจจุบัน default เป็น `กก.` |
| `lot_no` | text | no | Lot/หมายเหตุ lot | ใช้กับ stock ledger |
| `po_buy_id` | text | no | PO Buy รายแถว | null = Spot Buy |
| `gross_weight` | numeric | yes | น้ำหนัก Gross | ต้องไม่ติดลบ |
| `deduct_weight` | numeric | yes | น้ำหนักหัก | ต้องไม่ติดลบ และไม่เกิน gross เมื่อ gross มากกว่า 0 |
| `qty` | numeric | yes | น้ำหนักสุทธิ | ใช้เทียบกับ PO remaining qty |
| `price` | numeric | yes | ราคา/กก. | ใช้คำนวณยอดแถว |
| `sales_price` | numeric | yes | ราคาหน้าใบใน section รายการสินค้า | ใช้เป็นฐานข้อมูลให้ Sale Tracking / Sales Commission คำนวณ commission ต่อ; ไม่ใช่ราคาต้นทุนซื้อ |
| `discount` | numeric | yes | ส่วนลดรายแถว legacy/compatibility | Target UI/API ต้องไม่ให้กรอกส่วนลดรายสินค้า; ค่าใหม่ควรเป็น 0 หรือ ignore เพื่อ compatibility |
| `amount` | numeric | yes | ยอดแถวก่อนส่วนลดท้ายใบ | Target คำนวณจาก `qty * price`; ไม่หักส่วนลดรายสินค้าและไม่รับผลจากส่วนลดท้ายใบ |
| `note` | text | no | หมายเหตุรายแถว | ใช้ร่วมกับ stock ledger note |
| `source_snapshot` | jsonb | no | snapshot แถวตอน backfill/บันทึก | ใช้ audit/trace รายการ |
| `created_at` | timestamptz | yes | เวลาสร้างรายการ | backfill ใช้เวลาจากหัวบิล |
| `updated_at` | timestamptz | yes | เวลาแก้ล่าสุด | trigger `app_set_updated_at()` |

### Purchase Bill Weight Display Rule

- ค่า `purchase_bill_items.gross_weight` และ `purchase_bill_receipt_allocations.allocated_gross_weight` เก็บน้ำหนัก gross จากใบรับ/summary เพื่อ audit source
- สำหรับ read model, detail และ print ของ Stock PB ที่มาจาก WTI ช่อง `นน.ก่อนหัก` ต้องแสดงน้ำหนักหลังหักภาชนะแล้ว ไม่ใช่ gross ดิบ
- สูตรแสดงผลคือ `allocated gross weight - (WTI container_deduction_weight * allocated_qty / WTI net_weight)` เมื่อเป็น partial allocation; ถ้าเป็น full allocation จะเท่ากับ `gross_weight - container_deduction_weight`
- ช่อง `นน.หัก` ใช้ `allocated_deduct_weight` และช่อง `นน.สุทธิ` ใช้ `allocated_qty`; สูตรตัวอย่าง 970 - 36 = 934 แล้ว 934 - 37 = 897

## Form Behavior Notes

- Section `ข้อมูลบิล` แสดงเฉพาะ field ที่ user ต้องกรอกจริง เช่น สาขา/คลัง, ผู้ขาย, ทะเบียนรถ
- `ทะเบียนรถ` required ที่ Zod/API แล้ว แต่ยังไม่ required ใน DB constraint
- Target Stock flow ต้องเลือก `สาขา/คลัง` และ `ผู้ขาย` ก่อนเลือกใบรับของ (`WTI...`) เพื่อกรองใบรับของที่ยังไม่ออกบิลครบ
- ตัวเลือกใบรับของในบิลรับซื้อ Stock ต้องอ้างข้อมูลจาก `รายการใบรับ-ส่งของ` แต่ filter ให้เหลือเฉพาะเอกสารประเภท `WTI ใบรับของ`
- Target Stock flow เมื่อเลือกใบรับของแล้ว section `รายการสินค้า` ต้องเติมจาก receipt lines และแสดงสินค้า/Gross/หัก/Net/ยอดยังไม่ออกบิลจากใบรับของ
- Target Stock flow ใช้ปุ่ม `เพิ่มสินค้า`/เพิ่มบรรทัดเพื่อเลือกใบรับของเดิมซ้ำได้ เมื่อจำเป็นต้องแยกยอดใบรับของไป PO และ Spot Buy
- Section `รายการสินค้า` ต้องแสดง/รับค่า `ราคาหน้าใบ` ต่อรายการ และ API ต้อง validate ว่าไม่ติดลบ เพราะ Sale Tracking ใช้ค่านี้คำนวณ commission
- Section `รายการสินค้า` ต้องไม่มีช่องส่วนลดรายสินค้าใน target flow; ส่วนลดมีเฉพาะ `ส่วนลดท้ายใบ` ที่หัวบิล
- API target ต้องบันทึกส่วนลดท้ายใบแยกจาก line cost และห้ามนำไปลด `purchase_bill_items.amount`, stock ledger cost, WAC, หรือ Cost Pool
- Section `รายการสินค้า` ใน current compatibility UI ยังใช้ searchable product combobox จนกว่าจะเปลี่ยนเป็น receipt-line driven สำหรับ Stock
- Row-level PO dropdown:
  - `Spot Buy` หมายถึงไม่เลือก PO (`poBuyId = null`)
  - ถ้าเลือก PO จะแสดงผลต่างจาก `po_buys.remaining_qty` เทียบกับช่อง `สุทธิ`
  - ข้อความ `เกิน/ขาด` เป็น display-only ยังไม่ block save
  - target flow ต้องแยก behavior: Stock + PO เลือก PO ในบิลเพื่อ allocate จาก receipt line; ถ้า receipt เกิน PO ต้องเพิ่มบรรทัดจากใบรับของเดิมและเลือก `Spot Buy` หรือ PO อื่นสำหรับส่วนเกิน ส่วน Trading + PO เลือก PO และกรอกน้ำหนักในบิลโดยตรง

## Follow-Up Candidates

- ตัดสินใจว่าจะ keep หรือ deprecate `ref_no`, `contact_phone`, `purchase_source`, `purchase_type`, `tax_invoice_no`
- เพิ่มหรือ normalize field `purchase_flow`/`purchase_source` และ allocation tables สำหรับ `บิลรับซื้อ Stock -> ใบรับของ`, `บิลรับซื้อ -> PO`, และ `Spot Buy` line source
- ยืนยันสูตร commission ใน Sale Tracking ว่าใช้ `purchase_bill_items.sales_price` ร่วมกับน้ำหนัก/ยอดขายอย่างไร และต้อง snapshot ค่าใดเพิ่ม
- ออกแบบ posting ของ `ส่วนลดท้ายใบ` เป็นค่าใช้จ่าย/รายการแยก โดยไม่กระทบต้นทุนสินค้า
- เพิ่มข้อมูล/flag สำหรับ PO short close (`ปิดรับไม่ครบ`) และการคำนวณ Cost Pool เฉพาะ copper/brass eligible products
- ถ้าต้องการ enforce ทะเบียนรถระดับ DB ต้อง backfill ข้อมูลเก่าก่อน แล้วค่อยเพิ่ม `NOT NULL`
- ถ้ามี report/API ใหม่ ห้ามอ่านรายการสินค้าจากหัวบิล ให้ join หรือ include `purchase_bill_items`
- ถ้าจะต่อยอด voucher edit/cancel ระดับกลุ่ม ต้องเพิ่มหน้ารวมตาม `voucher_id` และ policy การ reverse bank statement ทั้งชุด
