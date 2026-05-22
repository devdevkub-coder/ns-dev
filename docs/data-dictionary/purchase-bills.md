# Purchase Bills Data Dictionary

Purpose: อธิบายตาราง `public.purchase_bills` และ `public.purchase_bill_items` ให้ developer อ่านร่วมกันได้ โดยแยกความหมาย business, การใช้งานใน Next app, และข้อควรระวังของ schema ปัจจุบัน

Current source of truth:

- Prisma model: `apps/next/prisma/schema.prisma` models `purchase_bills`, `purchase_bill_items`
- Active page: `/purchase/bills`
- Active API: `/api/purchase/bills`
- DB environment for development: dev-target Supabase

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
- ฟอร์มปัจจุบันไม่ให้กรอก `ref_no`, `contact_phone`, `purchase_source`, `channel_id`, และ `sales_id` โดยตรงแล้ว แต่ column ยังอยู่เพื่อรองรับข้อมูลเดิมและ flow ที่ยังไม่ reconcile

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
| `transaction_mode` | text | no | ประเภทบิล เช่น `STOCK`, `TRADING` | ผู้ใช้เลือกใน section ประเภทบิล |
| `vat_type` | text | no | วิธีคิด VAT เช่น `NONE`, `EXCLUDE`, `INCLUDE` | checkbox VAT ตอนติ๊กตั้งเป็น `EXCLUDE`, ตอนปิดตั้งเป็น `NONE` |
| `subtotal` | numeric | no | ยอดรวมรายการก่อนส่วนลดท้ายบิล | คำนวณจากรายการสินค้า |
| `discount` | numeric | no | ส่วนลด field เก่า/compatibility | ปัจจุบันเขียนค่าเดียวกับส่วนลดท้ายบิลในบาง flow |
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
| `purchase_source` | text | no | ที่มาบิล เช่น `SPOT_BUY`, `PO_RECEIPT`, `MIXED` | dropdown ถูกซ่อนจากฟอร์มแล้ว ยังมีเพื่อข้อมูลเดิม |
| `po_buy_id` | text | no | PO Buy ระดับหัวบิล/legacy link | รายการสินค้าใช้ `purchase_bill_items.po_buy_id` เป็นหลักสำหรับ row-level PO |
| `purchase_type` | text | no | field legacy/สำรอง | ยังไม่ใช่ source of truth ในฟอร์มปัจจุบัน |
| `discount_total` | numeric | no | ส่วนลดท้ายบิล | ฟอร์มใช้ field นี้ |
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
| `sales_price` | numeric | yes | ราคาหน้าใบ/ราคาอ้างอิงขาย | ใช้บาง flow |
| `discount` | numeric | yes | ส่วนลดรายแถว | ต้องไม่ติดลบ |
| `amount` | numeric | yes | ยอดแถวหลังส่วนลด | `qty * price - discount` ขั้นต่ำ 0 |
| `note` | text | no | หมายเหตุรายแถว | ใช้ร่วมกับ stock ledger note |
| `source_snapshot` | jsonb | no | snapshot แถวตอน backfill/บันทึก | ใช้ audit/trace รายการ |
| `created_at` | timestamptz | yes | เวลาสร้างรายการ | backfill ใช้เวลาจากหัวบิล |
| `updated_at` | timestamptz | yes | เวลาแก้ล่าสุด | trigger `app_set_updated_at()` |

## Form Behavior Notes

- Section `ข้อมูลบิล` แสดงเฉพาะ field ที่ user ต้องกรอกจริง เช่น สาขา/คลัง, ผู้ขาย, ทะเบียนรถ
- `ทะเบียนรถ` required ที่ Zod/API แล้ว แต่ยังไม่ required ใน DB constraint
- Section `รายการสินค้า` ใช้ searchable product combobox
- Row-level PO dropdown:
  - `Spot Buy` หมายถึงไม่เลือก PO (`poBuyId = null`)
  - ถ้าเลือก PO จะแสดงผลต่างจาก `po_buys.remaining_qty` เทียบกับช่อง `สุทธิ`
  - ข้อความ `เกิน/ขาด` เป็น display-only ยังไม่ block save

## Follow-Up Candidates

- ตัดสินใจว่าจะ keep หรือ deprecate `ref_no`, `contact_phone`, `purchase_source`, `purchase_type`, `tax_invoice_no`
- ถ้าต้องการ enforce ทะเบียนรถระดับ DB ต้อง backfill ข้อมูลเก่าก่อน แล้วค่อยเพิ่ม `NOT NULL`
- ถ้ามี report/API ใหม่ ห้ามอ่านรายการสินค้าจากหัวบิล ให้ join หรือ include `purchase_bill_items`
