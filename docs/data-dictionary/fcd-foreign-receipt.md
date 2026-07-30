# FCD Foreign Receipt Data Dictionary

## Scope

เอกสารนี้กำหนดข้อมูลที่ใช้เมื่อ Sales Bill เป็น THB แต่รับเงินเป็นสกุลต่างประเทศเข้า FCD. ยอดเงินเก็บและแสดง 2 ตำแหน่ง; FX rate เก็บและแสดง 3 ตำแหน่ง. Functional currency อ่านจาก `finance_currency_policies` ที่อ้างอิง Currency Master เท่านั้น.

## Fact Ownership

| Entity | Source of truth | Role |
|---|---|---|
| `customer_receipts` | Receipt header | เก็บ source type, native receipt, rate snapshot, settlement THB, bank fee และ FX settlement |
| `customer_receipt_allocations` | Receipt allocation | ตัด AR ของ SB เป็น THB; CADV ใช้ advance allocation แยก |
| `bank_statement` | THB cash/bank projection | `amount_in/out` คือยอด THB ที่ list/dashboard/report ใช้; `book_amount_*` เป็น mirror/check ของ write path ใหม่ |
| `fcd_ledger_entries` | FCD subledger | native movement และ carrying THB ต่อ `account + currency`; ใช้ดูยอด FCD, revalue และ conversion |
| `fx_gain_loss` | FX event report | แยก `AR settlement`, `FCD revaluation`, `FCD conversion` เพื่อ audit |
| `account_currency_balances` | Account capability master | ระบุสกุลที่บัญชีรองรับ ไม่ใช่ยอดคงเหลือหรือยอดยกมา |

## Customer Receipt Foreign Snapshot

| Field | Currency | Meaning |
|---|---|---|
| `receipt_currency_code` | code | สกุลที่ RCP รับจริง; RCP หนึ่งใบมีหนึ่งสกุล |
| `received_native_amount` | receipt currency | ยอดที่ลูกค้าโอนก่อน fee |
| `customer_transferred_native_amount` | receipt currency | ยอด native ที่ยืนยันจากลูกค้า/ธนาคารตาม receipt contract |
| `fx_rate`, `fx_rate_date`, `fx_rate_type`, `fx_rate_source` | rate/date/text | rate snapshot วันรับเงิน; lookup จาก API แล้วแก้/กรอกเองได้พร้อมเหตุผล |
| `settlement_book_amount` | THB | มูลค่าที่ใช้ปิด SB หรือรับ CADV ณ rate snapshot |
| `settlement_fx_difference` | THB | FX gain/loss ของ AR settlement เท่านั้น; CADV ต้องไม่สร้างค่าอัตโนมัติ |
| `bank_fee_total` | THB | bank fee แยกจาก settlement FX |
| `carrying_thb_amount` | THB | carrying value ของ native ที่เข้า FCD |

## Bank Statement Foreign Fields

| Field | Meaning |
|---|---|
| `amount_in`, `amount_out` | persisted THB projection ที่ Finance Bank, Cash Position และ report consumer ใช้ |
| `movement_currency_code` | สกุล native ของ movement |
| `native_amount_in`, `native_amount_out` | movement native เพื่อ audit เท่านั้น; ห้ามรวมเข้ายอด THB |
| `book_amount_in`, `book_amount_out` | THB mirror ของ write path; ไม่ใช่ field ที่ legacy THB reader ต้องย้ายไปใช้ |
| `book_fx_rate`, `fx_rate_id` | rate snapshot ที่ใช้ book movement |
| `source_event_type`, `source_event_key`, `reversal_of_id`, `idempotency_key` | identity/reversal/idempotency ของ event |

## FCD Ledger Fields

`fcd_ledger_entries` เป็น append-only subledger ต่อ `account_id + currency_code`.

| Field | Meaning |
|---|---|
| `native_amount_in`, `native_amount_out` | ยอด foreign เข้า/ออก |
| `carrying_thb_in`, `carrying_thb_out` | carrying THB ของ native movement |
| `fx_rate`, `fx_rate_id` | rate snapshot ของ event เมื่อมี |
| `source_event_type`, `source_event_key` | event identity ที่ unique ร่วมกัน |
| `reversal_of_id` | link ไป original entry; reversal append counter-entry ไม่แก้ original |
| `bank_statement_id` | link กับ THB cash/bank projection เมื่อ event มี BST |

## Reader Contract

- AR table/KPI/export และ AP table/KPI/export อ่าน THB source document balances เท่านั้น.
- AR detail แสดง foreign audit snapshot ได้ แต่ไม่เปลี่ยนยอด SB จาก THB.
- Finance Bank/Cash Position/dashboard/report aggregate จาก `bank_statement.amount_in/out` และ carrying THB ที่ persist แล้วเท่านั้น.
- FCD Ledger, FX Gain/Loss และ Bank Reconciliation เป็น foreign audit/drilldown reader; native amount ไม่ถูกนำไป aggregate เป็น THB.
- ไม่มี reader ใดใช้ `accounts.opening_balance` หรือ `account_currency_balances` เป็นยอดเงินจริง.

## Legacy `receipts` Read Compatibility

`receipts` เป็น compatibility line fact สำหรับ Sales Bill ที่ระบบเดิมยังอ่านอยู่ ไม่ใช่เจ้าของ foreign receipt. จึงใช้ contract นี้ระหว่างย้าย consumer:

| Legacy field | ความหมายที่คงไว้ | Foreign receipt write rule |
|---|---|---|
| `receipts.amount` | ยอดรับของ allocation เป็น THB | เขียนจาก `customer_receipt_allocations.receipt_amount`; ห้ามเขียน native USD ลง field นี้ |
| `receipts.net_amount` | ยอดรับสุทธิของ allocation เป็น THB | เขียนเป็น THB ของบรรทัดเดิม; ห้ามใช้เป็น FCD carrying balance |
| `receipts.discount`, `withholding_tax`, `bank_fee` | adjustment ของ allocation เป็น THB | อ่าน/เขียนเฉพาะความหมายเดิม; bank fee ระดับ foreign RCP อยู่ที่ `customer_receipts.bank_fee_total` |

Consumer ใหม่ต้องใช้ named fields จาก `customer_receipts` และ allocation (`settlement_book_amount`, `carrying_thb_amount`, `receipt_currency_code`, native amount, rate snapshot) ตามหน้าที่ ไม่ตีความ `amount` หรือ `net_amount` เป็น native amount. Consumer เก่าที่ต้องการยอดธุรกิจหลักอ่าน compatibility THB ต่อได้จนย้ายเสร็จ; list/KPI/export หลักห้ามนำ header RCP มาบวกซ้ำกับ compatibility line หรือ Bank Statement.

## Event Boundaries

1. Receipt: ปิด SB เป็น THB ณ rate วันรับ; native/carrying เข้า FCD.
2. Revaluation: ปรับ carrying THB สิ้นงวด; native balance ไม่เปลี่ยน.
3. Conversion: ถอน native จาก FCD เข้าบัญชี THB; realized FX เปรียบเทียบ THB จริงกับ carrying THB ที่ตัดออก.

ห้ามแก้ Sales Bill เดิมเพื่อสะท้อน revaluation หรือ conversion และห้ามใช้ current/latest rate แทน transaction snapshot ที่หายไป.
