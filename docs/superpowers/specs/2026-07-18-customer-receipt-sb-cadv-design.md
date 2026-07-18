# Customer Receipt: SB และ CADV Design

**สถานะ:** อนุมัติสำหรับแตก implementation task
**วันที่:** 2026-07-18
**หน้าหลัก:** `/sales/receipts`

## เป้าหมาย

ปรับหน้า รับเงินลูกค้าให้รับเงินได้จากเอกสารต้นทาง 2 ประเภท คือ `SB` บิลขาย และ `CADV` รับเงินล่วงหน้าลูกค้า โดยใช้เลขเอกสาร `RCP` ร่วมกัน แต่แยก allocation และผลกระทบทางการเงินอย่างชัดเจน ไม่ใช้ fallback หรือเดาประเภทจากข้อมูลเก่า

## หลักการที่ยืนยันแล้ว

| หัวข้อ | ข้อสรุป |
|---|---|
| ประเภทต้นทาง | เลือก `SB` หรือ `CADV` ก่อนกรอกรายการ |
| จำนวนรายการ | RCP หนึ่งใบเลือกได้หลายรายการของประเภทเดียวกัน |
| การผสมเอกสาร | ห้ามผสม SB และ CADV ใน RCP เดียว |
| เลขเอกสาร | RCP ใช้เลขชุดเดิมทั้งสองประเภท |
| SB | ลด `sales_bills.receivable_balance` และเพิ่ม `received_amount` |
| CADV | เพิ่ม `customer_advances.received_amount` และ `available_amount` |
| AR | RCP จาก CADV ไม่ลด AR ของ SB |
| Bank | ทั้ง SB และ CADV สร้าง `bank_statement` ด้วย `ref_type = RCP` |
| Cancel | reverse allocation, bank statement และยอดเอกสารต้นทางใน transaction เดียว |
| Fallback | ไม่มี fallback จาก `billId`, JSON snapshot, allocation คนละประเภท หรือ ref type ที่ไม่ตรง |

## ขอบเขตหน้าจอ

Modal รับเงินลูกค้าประกอบด้วย:

1. **ข้อมูลใบรับเงิน**
   - วันที่รับเงิน
   - ลูกค้า
   - dropdown `ประเภทเอกสารรับเงิน`: `บิลขาย (SB)` หรือ `รับเงินล่วงหน้า (CADV)`

2. **เอกสารที่รับเงิน**
   - SB: เลือกบิลขายที่มียอด AR ค้างรับ
   - CADV: เลือก CADV ที่มียอดรับได้คงเหลือ
   - เพิ่มได้หลายบรรทัด
   - แสดงเลขเอกสาร, ยอดเอกสาร, รับแล้ว, คงเหลือ และยอดที่จะรับ
   - ไม่ให้เลือกเอกสารซ้ำ

3. **ยอดสรุป**
   - SB: ยอดรับ, WHT, ส่วนลด, ยอดตัด AR
   - CADV: ยอดรับ CADV, ยอดสุทธิรับเข้า; ไม่ใช้ label `ตัดหนี้ AR`

4. **บัญชีรับเงิน**
   - วิธีรับเงิน
   - บัญชีรับเงิน
   - จำนวนเงินแยกตามบัญชี
   - ส่วนลด/ค่าธรรมเนียมตามฟอร์มเดิม
   - ยอด split ต้องตรงกับ `net_cash_in`

5. **หมายเหตุ**

ฟอร์มร่วมใช้ field เดิมเท่าที่ความหมายเหมือนกัน ส่วน source line และ summary ต้องเปลี่ยนตาม `sourceType` อย่าง explicit

## Contract ของ payload

เพิ่ม field ระดับ form/API:

```ts
type CustomerReceiptSourceType = 'SB' | 'CADV'
```

รูปแบบ SB:

```ts
{
  sourceType: 'SB',
  salesBillLines: [{
    salesBillDocNo: string,
    receiptAmount: number,
    withholdingTaxAmount: number,
    discountAmount: number
  }],
  customerAdvanceLines: []
}
```

รูปแบบ CADV:

```ts
{
  sourceType: 'CADV',
  salesBillLines: [],
  customerAdvanceLines: [{
    customerAdvanceDocNo: string,
    receiptAmount: number
  }]
}
```

API ต้อง reject payload ที่:

- ไม่มี `sourceType`
- sourceType ไม่ใช่ `SB` หรือ `CADV`
- `SB` แต่มี CADV line หรือไม่มี SB line
- `CADV` แต่มี SB line หรือไม่มี CADV line
- line ซ้ำ, ยอดไม่เป็นบวก, หรือมี field ที่ไม่อยู่ใน contract

## Data model

คง `customer_receipt_allocations` สำหรับ SB และเพิ่ม `customer_receipt_advance_allocations` สำหรับ CADV:

| Field | หน้าที่ |
|---|---|
| `id` | internal primary key |
| `receipt_id` | FK ไป `customer_receipts.id` |
| `customer_advance_id` | FK ไป `customer_advances.id` |
| `line_no` | ลำดับบรรทัดใน RCP |
| `customer_advance_doc_no_snapshot` | เลข CADV ณ เวลารับเงิน |
| `customer_code_snapshot` | รหัสลูกค้า ณ เวลารับเงิน |
| `receipt_amount` | ยอดรับของบรรทัด |
| `received_before` | received ก่อน transaction |
| `received_after` | received หลัง transaction |
| `available_before` | available ก่อน transaction |
| `available_after` | available หลัง transaction |
| `status` | `active` หรือ `cancelled` |
| audit fields | created/updated actor และเวลา |

ตารางใหม่ต้องมี FK, unique `(receipt_id, line_no)`, index ที่ `receipt_id`, `customer_advance_id` และ active status

## Business transaction

### Create RCP จาก SB

1. lock ขอบเขตเลข RCP และเอกสาร SB ที่เลือก
2. ตรวจ Customer, branch, status และ AR balance
3. คำนวณ gross/discount/WHT/net cash ตาม contract เดิม
4. สร้าง `customer_receipts`
5. สร้าง bank statement split ด้วย `ref_type = RCP`
6. สร้าง `customer_receipt_allocations`
7. อัปเดต SB received/AR/status
8. สร้าง status log และ legacy receipt line ตาม contract เดิม

### Create RCP จาก CADV

1. lock ขอบเขตเลข RCP และ CADV ที่เลือก
2. ตรวจ Customer, branch, status และยอดรับได้ของ CADV
3. คำนวณ gross/net cash โดยไม่มี WHT/ส่วนลดแบบ SB ใน line CADV
4. สร้าง `customer_receipts`
5. สร้าง bank statement split ด้วย `ref_type = RCP`
6. สร้าง `customer_receipt_advance_allocations`
7. อัปเดต CADV `received_amount`, `available_amount`, `status_id`
8. สร้าง CADV status log และ receipt status log
9. ไม่ update `sales_bills`

### Cancel/Reissue

- โหลด allocation ตาม source type ที่ถูกบันทึกไว้เท่านั้น
- reverse bank statement ด้วย `RCP-CANCEL`
- SB: คืน AR และสถานะ SB
- CADV: ลด received/available กลับตาม snapshot allocation และคำนวณสถานะ CADV ใหม่
- mark allocation เป็น cancelled แบบ audit ไม่ลบ fact
- reissue ใช้ flow cancel เดิมแล้วสร้าง RCP ใหม่ใน transaction เดียว

## CADV status rule

สถานะที่อ่านจาก master/status helper ต้องสอดคล้องกับยอด:

- `pending_receipt`: ยังไม่รับเงิน
- `partially_received`: รับแล้วบางส่วน แต่ยังมี available/target เหลือ
- `received`: รับครบตาม target
- `partially_allocated`: รับครบ/บางส่วนและถูกนำไปหัก SB บางส่วน
- `allocated`: available ถูกใช้หมด
- `cancelled`: ยกเลิกเอกสาร

การเปลี่ยนสถานะต้องใช้ helper กลางที่คำนวณจากยอดจริง ไม่ hardcode label ในหน้า modal

## Error handling

ตรวจ client เพื่อ UX และ server เพื่อความถูกต้อง:

- ห้ามบันทึกโดยไม่เลือก source type
- ห้ามเลือกหลาย source type ใน RCP เดียว
- ห้ามเลือก Customer ไม่ตรงกับเอกสาร
- ห้ามรับเอกสาร cancelled หรือยอดคงเหลือเป็นศูนย์
- ห้ามรับเกินยอดคงเหลือ
- ห้ามบันทึก split ไม่ตรง net cash in
- concurrent update ต้อง reject เมื่อ version/balance เปลี่ยนก่อน commit
- error ต้องระบุเลขเอกสารและสาเหตุที่แก้ไขได้

## API read model

`GET /api/sales/receipts` ต้องคืนข้อมูลแยกชื่อชัดเจน:

- `bills`: SB queue เดิม
- `customerAdvances`: CADV queue สำหรับ Customer ที่ยังรับได้
- `rows`: history RCP พร้อม `sourceType`, `billDocNos`, `customerAdvanceDocNos`, และ line details
- `paymentMethods`, `accounts`, `customers` ตามของเดิม

ห้ามรวม SB/CADV เป็น object เดียวที่ไม่มี source type เพราะจะทำให้ client เดาประเภทเอง

## Testing contract

ต้องมี unit/API tests สำหรับ:

- SB create เดิมยังผ่าน
- CADV create แบบรายการเดียวและหลายรายการ
- CADV partial/full status transition
- CADV RCP ไม่ลด SB AR
- cancel CADV RCP คืน received/available
- cancel SB RCP คืน AR
- reject mixed source type
- reject over-allocation, duplicate line และ customer mismatch
- reject stale/concurrent balance
- GET แยก queue/history ตาม source type

ก่อนจบ batch ต้องผ่าน `git diff --check`, targeted Vitest, workspace lint, type-check และ build ตามความเสี่ยงของไฟล์ที่เปลี่ยน

## ผลลัพธ์ที่ถือว่าเสร็จ

ผู้ใช้เปิด `/sales/receipts`, เลือก `SB` หรือ `CADV`, เลือกหลายรายการของประเภทนั้น, บันทึก RCP, เห็นผลกระทบถูกต้องในเอกสารต้นทางและ bank statement และสามารถยกเลิก/reissue ได้โดยไม่ทำให้ AR หรือยอด CADV เพี้ยน
