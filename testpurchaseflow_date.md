# Purchase Bill Flow Test Report 2026-06-06

## Scope

รอบนี้จำกัด scope ที่ `PO Buy -> WTI -> Purchase Bill -> payable handoff` ของ active Next app (`apps/next`) เท่านั้น

ไม่รวมการจ่ายเงินจริง (`/purchase/payments`) และ payment history เพราะเป็น Payment Flow แยกต่างหากตามเอกสารล่าสุด

## Environment

- App: `apps/next`
- Date: `2026-06-06`
- Auth user: `watcharathat@gmail.com`
- Auth method: Supabase session cookie
- Data source: `dev-target`
- Smoke script: [tmp/test_purchase_flow.mjs](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/tmp/test_purchase_flow.mjs)
- Result file: [tmp/test_purchase_flow_result.json](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/tmp/test_purchase_flow_result.json)

## Execution Summary

เอกสารที่สร้างได้จริงในรอบล่าสุด:

- `PO Buy`: `POB012606-0010`
- `WTI`: `WTI012606-0007`
- `Purchase Bill 1`: `PB012606-0005`
- `Purchase Bill 2`: `PB012606-0006`

ผลใน scope บิลรับซื้อ:

- ผ่านจริง: `9`
- ติด blocker ใน scope บิลรับซื้อ: `0`
- นอก scope รอบนี้: `Payment Flow / PMT save`

## Use Case Results

| Use Case | Status | Result |
|---|---|---|
| `UC-PUR-02A` สร้าง PO Buy | `PASS` | สร้าง `POB012606-0010` ได้สำเร็จ |
| `UC-PUR-02B` สร้าง WTI จาก PO path | `PASS` | สร้าง `WTI012606-0007` ได้สำเร็จ |
| `UC-PUR-03` PO รับของบางส่วน | `PASS` | สร้าง `PB012606-0005` จำนวน `70` และ PO เปลี่ยนเป็น `Partially Received` |
| `UC-PUR-04` PO ใช้ครบ | `PASS` | สร้าง `PB012606-0006` จำนวน `30` และ PO เปลี่ยนเป็น `Received` |
| `UC-PUR-07` WTI 1 ใบแตกหลายบิลซื้อ | `PASS` | `WTI012606-0007` ถูกใช้ใน PB สองใบ และสถานะเป็น `billed` |
| `UC-PUR-09` PB ไปโผล่คิวอนุมัติ | `PASS` | `PB012606-0005` และ `PB012606-0006` ไปแสดงใน approval queue |
| `UC-PUR-10` อนุมัติจ่ายจาก PB | `PASS` | อนุมัติ PB ทั้งสองใบได้สำเร็จใน runtime ปัจจุบัน |

## Fix Applied

แก้ contract ของ [apps/next/src/app/api/purchase/bills/route.ts](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/apps/next/src/app/api/purchase/bills/route.ts) ให้ `item.productId` เป็น outward `products.code` ทางเดียว

รายละเอียด:

- `validateStockReceiptSelection()` รับ `productByRef` ที่ resolve จาก `products.code`
- เทียบสินค้าใน receipt summary ด้วย internal `product.id` ที่ resolve แล้ว
- ไม่ parse `item.productId` เป็น internal bigint ซ้ำ
- `POST` และ `PATCH` ของ `/api/purchase/bills` ใช้ map เดียวกันระหว่าง missing-product validation, receipt validation, และ `buildBillItems()`

แก้เพิ่มเติมจาก user-reported UI save bug: หน้า `/purchase/bills` เลือกใบรับของแล้วกดบันทึก แต่ API ยังตอบเหมือนยังไม่ได้เลือกใบรับของ

รายละเอียด:

- `receiptTicketId` ใน payload ใช้ `weight_tickets.doc_no` ตาม options/UI contract
- `receiptSummaryId` ใช้ `${doc_no}:${productCode}:${lineCount}` ตาม outward summary key
- `receiptLineId` / `receiptLineIds` ใช้ `${doc_no}:${line_no}` ตาม outward line key
- API resolve outward keys เหล่านี้กลับเป็น internal bigint ids ก่อนเขียน `purchase_bill_receipt_allocations`
- ไม่มี compatibility fallback ไป parse WTI/summary/line key เป็น internal bigint จาก client

## Data Backfill

ตรวจพบ dev-target test data เก่าที่ถูกสร้างก่อนแก้ contract จำนวน `4` แถว (`PB012606-0001` ถึง `PB012606-0004`) ยังเก็บ `source_snapshot` ของ receipt เป็น internal ids

ดำเนินการ backfill ข้อมูลแทนการเพิ่ม fallback ใน code:

- `receiptTicketId` ถูกแปลงเป็น `WTI doc_no`
- `receiptSummaryId` ถูกแปลงเป็น `${doc_no}:${productCode}:${lineCount}`
- `receiptLineId` / `receiptLineIds` ถูกแปลงเป็น `${doc_no}:${line_no}`

ผลตรวจหลัง backfill: จำนวน `purchase_bill_items.source_snapshot.receiptTicketId` ที่ยังเป็น numeric internal id = `0`

## WTI Cancel / Reuse Cleanup

เคสตรวจซ้ำ: `WTI012605-0004` ถูกใช้สร้างบิลแล้วบิลถูกยกเลิก จากนั้นต้องกลับมาเลือกสร้างบิลใหม่ได้

Root cause ที่พบใน dev-target:

- ยังมี `purchase_bill_receipt_allocations` ของบิลที่ `status = cancelled` จำนวน `5` rows
- ยังมี `purchase_bill_po_allocations` ของบิลที่ `status = cancelled` จำนวน `5` rows
- `PB012605-0414` ที่ cancelled ยังเหลือ receipt allocation ไปที่ `WTI012605-0004` จำนวน `70`
- `PB012606-0007` ที่ user สร้างแล้ว cancel เป็น cancelled จริง และไม่มี active allocation ค้างกับ `WTI012605-0004`

ดำเนินการแก้ที่ข้อมูลและ schema migration ไม่เพิ่ม fallback ใน runtime code:

- เพิ่ม migration [20260606080820_cleanup_cancelled_purchase_bill_allocations.sql](/Users/watcharathatsrithanesiganon/Documents/GitHub/ns-scrap-erp/supabase/migrations/20260606080820_cleanup_cancelled_purchase_bill_allocations.sql)
- migration ลบ allocation facts ที่ผูกกับ cancelled PB เพราะ allocation tables คือ active consumption เท่านั้น
- migration refresh `weight_ticket_product_summaries.billed_weight/remaining_weight`
- migration refresh `weight_tickets.status` จาก active allocations

ผล apply migration บน dev-target:

- `DELETE 5` จาก `purchase_bill_receipt_allocations`
- `DELETE 5` จาก `purchase_bill_po_allocations`
- `UPDATE 4` rows ใน `weight_ticket_product_summaries`
- `UPDATE 2` rows ใน `weight_tickets`

Post-check:

- cancelled receipt allocation count = `0`
- cancelled PO allocation count = `0`
- `WTI012605-0004` status = `received`
- `WTI012605-0004` `billed_weight = 0`, `remaining_weight = 70`, `net_weight = 70`
- authenticated `/api/daily/weight-tickets?search=WTI012605-0004&type=WTI` returns `usedInPurchaseBillCount = 0`, `canEdit = true`, `canCancel = true`
- authenticated `/api/purchase/bills` receipt options include `WTI012605-0004` with summary `WTI012605-0004:SKU001:2`, `billedWeight = 0`, `remainingWeight = 70`

UI wording cleanup:

- เปลี่ยน badge ใน modal จาก `จัดสรรครบแล้ว` เป็น `จัดสรรในบิลนี้ครบแล้ว`
- จุดประสงค์คือแยกความหมายให้ชัดว่าเป็น draft allocation ของบิลปัจจุบัน ไม่ใช่สถานะว่า WTI ถูกใช้หมดในฐานข้อมูล

## Out Of Scope Finding

หลัง PB และ approval ผ่านแล้ว smoke ต่อไปล้มที่ `/api/purchase/payments`:

```json
{
  "code": "DATABASE_ERROR",
  "error": "บันทึกจ่ายเงิน Supplier ไม่ได้"
}
```

probe แยกพบว่า one-line PMT ก็ล้มเพราะ Prisma interactive transaction timeout ระหว่างบันทึก `bank_statement` ไม่ใช่ปัญหาการสร้าง Purchase Bill

จุดนี้ต้องแก้ใน Payment Flow แยก ไม่ควรปนกับ scope บิลรับซื้อ

## Validation Evidence

- `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false` ผ่านหลังแก้ route
- `npx tsx tmp/test_purchase_flow.mjs` ผ่าน scope บิลรับซื้อถึง `PB012606-0005` / `PB012606-0006`
- WTI cancel/reuse post-check ผ่าน: cancelled allocation counts = `0`, `WTI012605-0004` อยู่ใน receipt options ของ `/api/purchase/bills` ด้วย `remainingWeight = 70`
- รอบล่าสุดหลัง migration/UI wording: `npm run type-check --workspace @ns-scrap-erp/next -- --pretty false`, `npm run lint --workspace @ns-scrap-erp/next`, `npm run build --workspace @ns-scrap-erp/next`, และ `git diff --check` ผ่านทั้งหมด
