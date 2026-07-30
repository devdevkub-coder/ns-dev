---
title: FCD Foreign Receipt Implementation Task List
aliases:
  - FCD implementation plan
  - แผนงานรับเงินต่างประเทศและ FCD
tags:
  - ns-scrap-erp
  - finance
  - fcd
  - fx
  - task-list
status: in-progress
created: 2026-07-30
updated: 2026-07-30
---

# FCD Foreign Receipt Implementation Task List

## Objective

ทำให้ระบบรองรับบิลขายสกุล THB ที่ลูกค้าชำระเป็นสกุลต่างประเทศเข้าบัญชี FCD โดยแยกเหตุการณ์ทางบัญชีและข้อมูลออกเป็น 3 ชุด:

1. AR settlement เมื่อรับเงินและปิดบิล
2. FCD revaluation เมื่อปิดงวด
3. FCD conversion เมื่อแลกเงินจริงเข้าบัญชี THB

เอกสารหลักด้าน business flow: [[Receive Payment From The Customer Via Their FCD Account]]

## Locked Design Decisions

- บิลขายเดิมและ AR ยังคงเป็น THB
- Flow และรายงาน THB เดิมใช้ field THB เดิมของระบบต่อไป (`amount_in/out`, ยอดรับ, ยอดตัด AR); foreign receipt แปลง USD เป็น THB ณ วันรับเงินก่อนเขียน field เหล่านี้ จึงไม่ต้องเปลี่ยน consumer เดิม
- รับเงินจริงต้องเก็บสกุลเงิน จำนวนเงิน และ rate ณ วันรับเงินเป็น snapshot
- การปิดบิลใช้มูลค่า THB ณ วันรับเงิน ไม่รอวันแลกเงินจริง
- เงินต่างประเทศที่รับแล้วเป็นยอดคงเหลือของ `account + currency` ใน FCD
- การแลกเงินไม่ย้อนกลับไปเลือกบิลต้นทาง เพราะเงินในบัญชีเดียวกันเป็นยอดรวมแล้ว
- การแลกเงินใช้ carrying amount ของยอดรวมใน `account + currency`; วิธีคำนวณเป้าหมายคือ moving weighted-average carrying rate
- settlement FX, revaluation FX และ conversion FX ต้องเป็น transaction type แยกกัน
- Bank Statement เป็น ledger ของ movement ที่เกิดจริง ไม่สร้างแถว opening balance จาก Account Master
- Bank Statement คง `amount_in/out` เป็นยอด THB ที่ระบบเดิมอ่านอยู่; `book_amount_*` เป็น canonical mirror ของยอด THB สำหรับ write path ใหม่เท่านั้น ส่วน native amount, currency และ rate เป็น transaction metadata/subledger สำหรับ audit และ FCD conversion
- Bank Statement และ FCD ledger ของ RCP เดียวกันเป็นสอง representation ของ economic event เดียว ต้อง link ด้วย source event key และห้าม read model นำมาบวกรวมกัน
- Account Master ระบุว่าสกุลใดใช้ได้กับบัญชี แต่ไม่ถือยอดคงเหลือและไม่ถือยอดตั้งต้น
- Currency option และ rate ต้องอ่านจาก master/transaction snapshot ที่มีอยู่จริง ห้าม fallback เป็น THB/USD หรือ rate ใดใน runtime
- ระบบใช้งาน THB และ USD เป็นหลักในปัจจุบัน แต่ schema และ validation ต้องรองรับ currency master โดยไม่ hardcode รายชื่อสกุลเงิน
- Customer Receipt ต้องเลือก source type `SB` หรือ `CADV` ก่อนแสดงรายละเอียดรายการและก่อนเลือกบัญชีรับเงิน
- Customer Receipt หนึ่งใบรับได้หนึ่งสกุลเงิน; ทุก account split ต้องเป็นสกุลเดียวกับ receipt
- เมื่อรับสกุลต่างประเทศ บัญชีรับเงินทุก split ต้องเป็น FCD ที่รองรับสกุลนั้น; ห้ามแบ่งเข้าบัญชี THB ปกติ
- FX rate ใช้วันที่รับเงิน ดึงจาก rate source ที่กำหนด และแก้ไขหรือกรอกเองได้พร้อมเก็บ provenance และเหตุผล
- Bank fee ของ Customer Receipt บันทึกเป็น THB และแยกจาก settlement FX; ส่วนลดอยู่ที่รายการ SB และไม่แสดงซ้ำในส่วนบัญชีรับเงิน
- FCD แบบกระแสรายวันสามารถมี OD ได้; OD เป็นวงเงินแยกจากยอดเงินและแยกต่อกฎสกุลเงินที่ธนาคารอนุมัติ
- การ reverse ต้องสร้าง reversal event ที่อ้างอิงรายการเดิม ห้ามแก้หรือลบ ledger ที่ post แล้ว

## Target Event Flow

```text
Sales Bill (THB)
  -> Customer Receipt รับเงินจริง (เช่น USD)
  -> AR Settlement Allocation (THB + settlement FX)
  -> FCD Ledger In (USD + carrying THB)
  -> Bank Statement In (USD movement + THB book value)

FCD balance at period end
  -> Revaluation Batch
  -> Unrealized FX entry
  -> New carrying THB for account + currency

FCD conversion
  -> FCD Ledger Out (USD + carrying THB out)
  -> THB Bank Statement In (THB actual)
  -> Realized FX conversion entry
```

## Phase 0: Contract And Accounting Sign-off

- [x] `FCD-000` ตั้ง functional currency ของบริษัทเป็น `THB` จาก Currency Master ใน singleton `finance_currency_policies` ทั้ง dev-target และ SIT; runtime ห้ามสมมติจาก account currency
- [x] `FCD-001` ใช้ moving weighted-average carrying rate ต่อ `FCD account + currency`: receipt เพิ่ม native/carrying THB เข้า pool, conversion ตัด carrying THB ตาม native ที่ถอน x weighted rate, และ revaluation ที่ post แล้วปรับ carrying rate ของยอดคงเหลือโดยไม่เปลี่ยน native balance
- [x] `FCD-002` ยอดเงิน native และ book amount คำนวณ/เก็บ/แสดงที่ 2 ตำแหน่ง; FX rate ใช้ 3 ตำแหน่ง. คอลัมน์ `fx_rates.rate` เดิมยังเป็น `numeric(18,6)` เพื่อไม่ทำ migration ปัดข้อมูลเดิม แต่ write path ใหม่รับ rate ได้ไม่เกิน 3 ตำแหน่ง และปัดยอดเงินครั้งเดียวเมื่อสร้างรายการ
- [x] `FCD-003` Customer Receipt ขอ suggested rate จาก API ตามวันรับเงิน; ผู้ใช้แก้ rate ได้ก่อนบันทึกและระบบเก็บ rate ที่ใช้จริงเป็น snapshot โดยไม่เพิ่ม global rate policy ใน batch นี้
- [x] `FCD-004` หาก API ไม่มี rate ผู้ใช้กรอกเองได้; ห้าม fallback ไปใช้ rate ล่าสุดหรือ rate จาก account master
- [ ] `FCD-005` กำหนด GL account mapping สำหรับ AR settlement gain/loss, revaluation gain/loss, conversion gain/loss, bank fee และ customer overpayment
- [ ] `FCD-006` กำหนด approval/post/reverse permissions ของ conversion และ revaluation เมื่อเปิด batch นั้น
- [x] `FCD-007` Customer Receipt คงสถานะเดิม `pending`/`active`/`cancelled`; ไม่สร้าง `draft`/`posted`/`reversed` ใน batch รับเงินต่างประเทศนี้
- [x] `FCD-008` FCD OD เป็นวงเงินต่อบัญชี
- [ ] `FCD-009` ย้ายตัวอย่าง Debit/Credit ไป batch GL เมื่อระบบมี GL posting engine

## Open Items Before Their Respective Phase

- `FCD-005` GL account mapping ยังไม่มีในระบบ และไม่ block receipt/BST/FCD ledger batch นี้ เพราะยังไม่สร้าง GL posting engine
- `FCD-006` สิทธิ์ approve/post/reverse สำหรับ conversion และ revaluation จะกำหนดเมื่อเริ่มสอง flow นั้น; ไม่กระทบ Customer Receipt ที่ใช้สถานะเดิม
- `FCD-101` ถึง `FCD-144` เป็น schema/reconciliation batch ถัดไป และต้องเสร็จก่อนเปิด foreign receipt write path
- `FCD-201` ถึง `FCD-211` เป็น service/lock/Decimal batch ถัดไป และต้องเสร็จก่อนเปิด foreign receipt write path

## Phase 1: Database Schema

### 1.1 Bank Statement currency contract

- [x] `FCD-101` เพิ่ม currency FK ของ movement ใน `bank_statement`
- [x] `FCD-102` เพิ่ม native amount in/out สำหรับจำนวนเงินจริงตามสกุลของ movement
- [x] `FCD-103` เพิ่ม book amount THB in/out สำหรับตรวจ contract ของ write path ใหม่ โดยต้อง mirror กับ `amount_in/out` (THB) เพื่อไม่กระทบ consumer เดิม
- [x] `FCD-104` เพิ่ม book FX rate snapshot และ rate reference เมื่อรายการไม่ใช่ functional currency
- [x] `FCD-105` เพิ่ม source event type ให้แยก receipt, fee, conversion source, conversion destination, revaluation และ reversal
- [x] `FCD-106` เพิ่ม reversal relation/idempotency key เพื่อป้องกัน post ซ้ำและ trace รายการกลับ
- [x] `FCD-107` ทำ currency, native amount และ THB amount ให้เป็น required สำหรับ write path ใหม่หลัง backfill/transaction reset ผ่านแล้ว
- [x] `FCD-108` เพิ่ม check constraints: ห้าม in/out พร้อมกัน, amount ห้ามติดลบ, foreign movement ต้องมี rate/book amount ครบ
- [x] `FCD-109` เพิ่ม indexes สำหรับ `account_id + currency + date + id`, source reference และ reversal lookup

### 1.2 FCD ledger and carrying balance

- [x] `FCD-110` สร้าง append-only `fcd_ledger_entries` โดยมี account, currency, native in/out, carrying THB in/out, rate snapshot, source และ reversal reference
- [x] `FCD-111` กำหนด unique source event key เพื่อให้ retry แล้วไม่เกิด ledger ซ้ำ
- [x] `FCD-112` สร้าง balance projection/read model ต่อ `account + currency` สำหรับ native balance, carrying THB และ weighted carrying rate
- [x] `FCD-113` Runtime account/FCD flow หยุดอ่าน `account_currency_balances.opening_balance` แล้ว และการแก้ account จะป้องกันการเอาสกุลที่มี FCD ledger ออก. Migration `20260730180000_retire_account_currency_opening_balances.sql` applied/recorded in Dev/SIT on 2026-07-30 after the test-data decision: the legacy master amount was retired with its column, not reset or copied into a ledger. Account currency rows now declare supported currencies only.
- [x] `FCD-114` เพิ่ม DB guard ให้ ledger FCD อ้างอิงเฉพาะ currency ที่ active อยู่ใน `account_currency_balances`
- [x] `FCD-115` เพิ่ม DB guard ป้องกันยอด native ติดลบ เว้นแต่ account มี OD ตาม `FCD-008` อนุญาต

### 1.3 Customer receipt settlement

- [x] `FCD-120` เพิ่ม receipt currency, received native amount, settlement rate, settlement THB และ rate reference ใน receipt header/split ที่เป็นเจ้าของข้อมูลจริง
- [x] `FCD-121` เพิ่ม allocation snapshot ต่อบิล: AR THB before, settled THB, native amount allocated, settlement FX difference และ difference reason
- [ ] `FCD-122` แยก bank fee, customer overpayment, discount/credit note และ FX difference เป็นคนละ field/type
- [x] `FCD-123` บังคับผลรวม allocation THB + classified differences ให้ reconcile กับ receipt settlement THB
- [x] `FCD-124` เก็บ link จาก receipt split ไป Bank Statement และ FCD ledger entry แบบ FK ที่ตรวจย้อนกลับได้
- [x] `FCD-125` แยกยอดที่ลูกค้าโอนแบบ native currency ออกจากยอด native ที่เข้าบัญชีจริง เพื่อรองรับค่าธรรมเนียมที่ถูกหักก่อนเข้าบัญชีและให้ FCD ledger ตรงกับ Bank Statement
- [x] `FCD-126` เพิ่ม suggested rate, settlement rate ที่ใช้จริง, rate date, rate source, rate reference, override flag และ override reason เป็น transaction snapshot
- [x] `FCD-127` เพิ่ม receipt currency ที่ header และ DB guard ให้ทุก split/allocation ของ RCP ใช้ currency เดียวกัน
- [x] `FCD-128` เพิ่ม source-type guard ให้ `SB` และ `CADV` เก็บ allocation คนละชนิดและห้ามเกิดพร้อมกันใน receipt เดียว

### 1.4 Revaluation and conversion documents

- [x] `FCD-130` สร้าง revaluation batch header ตาม period, branch, account/currency scope, rate reference, status และ audit fields
- [x] `FCD-131` สร้าง revaluation lines เก็บ native balance, carrying THB before, closing rate, revalued THB และ unrealized difference
- [x] `FCD-132` บังคับหนึ่ง posted revaluation ต่อ account+currency+period และรองรับ reversal/repost
- [x] `FCD-133` สร้าง conversion header/lines เก็บ FCD source, currency, native amount, carrying THB out, actual THB received, destination account, fee และ realized difference
- [x] `FCD-134` เพิ่ม unique business `doc_no` และ branch-scoped numbering โดยไม่มี fallback branch code
- [x] `FCD-135` เพิ่ม status logs สำหรับ receipt foreign settlement, revaluation และ conversion
- [x] `FCD-136` กำหนด conversion source/destination เป็น internal transfer เดียวกัน เพื่อไม่ให้รายงานนับ FCD out และ THB in เป็นรายจ่าย/รายรับใหม่ของบริษัท

### 1.5 Migration safety

- [x] `FCD-140` เขียน preflight ตรวจ row ปัจจุบันก่อนเพิ่ม NOT NULL/constraints; ถ้ามีข้อมูลต้องรายงาน ไม่เดาสกุลเงินจากชื่อบัญชี
- [x] `FCD-141` ใช้ additive migration: nullable columns/tables -> deploy writers -> reconcile -> enforce constraints
- [x] `FCD-142` ไม่ backfill currency/rate ด้วย THB, USD, account master หรือ latest rate โดยอัตโนมัติ
- [x] `FCD-143` สร้าง reconciliation SQL เปรียบเทียบ receipt, statement, FCD ledger, allocation และ FX entry
- [x] `FCD-144` ทดสอบ migration บน dev-target ก่อน และบันทึก migration history ผ่านกระบวนการมาตรฐาน

## Phase 2: Domain Services And Posting Engine

- [x] `FCD-201` สร้าง money/FX value objects ที่ใช้ Decimal และตรวจ currency/precision จาก master
- [x] `FCD-202` สร้าง rate snapshot resolver ที่ fail closed เมื่อไม่พบ rate ตาม contract `FCD-003/004`
- [x] `FCD-203` สร้าง FCD balance lock ระดับ account+currency ภายใน transaction
- [x] `FCD-204` สร้าง moving weighted-average carrying calculation พร้อม unit tests
- [x] `FCD-205` สร้าง foreign receipt posting service ที่เขียน receipt, allocation, BST, FCD ledger และ FX settlement ใน transaction เดียว
- [x] `FCD-206` สร้าง conversion posting service ที่ตัด native balance/ carrying THB และเพิ่ม THB ปลายทางใน transaction เดียว
- [x] `FCD-207` สร้าง revaluation posting service ที่ snapshot balance/rate และ post unrealized difference แบบ idempotent
- [x] `FCD-208` สร้าง reversal service ต่อ event type โดยสร้างรายการกลับทิศและห้ามแก้ posted rows
- [ ] `FCD-209` เพิ่ม concurrent/race-condition tests สำหรับ receipt, conversion และ revaluation account เดียวกัน
- [ ] `FCD-210` เพิ่ม reconciliation invariant หลัง post ทุก service
- [ ] `FCD-211` เพิ่ม anti-double-count invariant: RCP/BST/FCD ledger/FX event ที่ใช้ source event เดียวกันต้องถูกนับเป็น cash asset เพียงครั้งเดียวใน Bank, Cash Position และ dashboard read models

## Phase 3: Customer Receipt API And Form

- [x] `FCD-301` ขยาย account options ให้ส่ง `isFcd` และ supported currencies จาก account master contract จริง
- [x] `FCD-302` เพิ่ม receipt-level currency dropdown จาก Currency Master ก่อน account selection; default เป็น functional currency ที่ resolve จาก source จริง แต่ผู้ใช้เปลี่ยนได้และห้าม hardcode `THB`
- [x] `FCD-303` แสดงยอดรับจริงและ rate เพื่อคำนวณก่อนบันทึก แต่ใช้มูลค่า THB และยอดปิดบิล THB เป็นผลลัพธ์ทางบัญชีหลัก
- [x] `FCD-304` รองรับแบ่งยอด native/THB ไปหลาย Sales Bills พร้อม reconciliation ระดับบรรทัด
- [ ] `FCD-305` บังคับเลือก reason เมื่อมีส่วนต่าง และแสดง field เฉพาะ reason ที่เลือก
- [ ] `FCD-306` แยก bank fee, overpayment, discount/credit note และ settlement FX ใน request/response
- [x] `FCD-307` POST/PATCH ต้อง ignore/reject calculated values จาก client และคำนวณใหม่จาก persisted bill/rate/account data
- [x] `FCD-308` บันทึก foreign receipt แล้วปิด/partial Sales Bill, post Bank Statement และ FCD ledger ใน transaction เดียว
- [x] `FCD-309` cancel/reverse ต้องคืน AR และ reverse BST/FCD/FX โดยไม่ลบรายการเดิม
- [x] `FCD-310` เพิ่ม detail/timeline แสดง book amount THB เป็นหลัก และแสดง native amount/rate/FX classification เป็น audit detail เฉพาะ foreign receipt
- [x] `FCD-311` คง flow THB เดิมและเพิ่ม regression tests ไม่ให้ behavior เดิมเปลี่ยน: schema test ยืนยัน RCP สกุล functional currency (THB ใน policy ปัจจุบัน) ยังใช้ flow เดิมโดยไม่ต้องส่ง native/rate fields (2026-07-30)

### 3.1 Customer Receipt form flow and fields

- [x] `FCD-312` จัดลำดับส่วนข้อมูลใบรับเงินเป็น วันที่ -> ประเภทเอกสารรับเงิน (`SB`/`CADV`) -> สาขาบริษัท -> ลูกค้า โดย source type ต้องถูกเลือกก่อน section รายละเอียดและบัญชีรับเงิน
- [x] `FCD-313` คง conditional source section: `SB` แสดงบิลขายที่รับเงิน ส่วน `CADV` แสดงเอกสารรับเงินล่วงหน้า และห้ามแสดงสอง section พร้อมกัน
- [x] `FCD-314` ปรับ label ตาราง SB เป็น `ค้างรับ (THB)`, `ยอดตัด AR (THB)`, `ภาษีหัก ณ ที่จ่าย (THB)` และ `ส่วนลด (THB)` โดยยอดเอกสารยังเป็น THB เสมอ
- [x] `FCD-315` ปรับ label ตาราง CADV เป็น `ยอดเอกสาร (THB)`, `รับแล้ว (THB)`, `คงเหลือรับ (THB)` และ `ยอดตัด CADV (THB)`
- [x] `FCD-316` วาง receipt currency ไว้ต้น section บัญชีรับเงิน และใช้ค่าเดียวกับทุก account split; เมื่อเปลี่ยน currency ต้องล้าง account/rate/amount ที่ไม่อยู่ใน contract ใหม่แทนการคงค่าข้ามสกุล
- [x] `FCD-317` กรองบัญชีจาก supported currency จริง: THB แสดงบัญชีที่รองรับ THB ส่วน foreign currency แสดงเฉพาะ FCD ที่ active และรองรับสกุลนั้น; ห้าม fallback จากชื่อบัญชีหรือ primary currency
- [x] `FCD-318` ปรับ amount ใน account split ให้แสดงหน่วยตาม receipt currency และใช้ความหมาย `ยอดเข้าบัญชีจริง`; เพิ่ม `ยอดที่ลูกค้าโอน` ระดับ receipt เพื่อแยก gross transfer ออกจากยอด credit จริง
- [x] `FCD-319` สำหรับ foreign receipt แสดง FX panel หลังเลือก currency/date: คู่สกุลเงิน, rate date, suggested rate, editable settlement rate, source และมูลค่า THB ก่อน fee
- [x] `FCD-320` หากไม่พบ suggested rate ให้กรอก settlement rate เองได้; หากแก้ suggested rate ต้องระบุเหตุผล และ payload ต้องส่ง rate provenance ครบ
- [x] `FCD-321` คง `Bank Fee (THB)` เป็น field ระดับ receipt ในส่วนรับเงิน และเอา `Discount` ที่ซ้ำออกจากส่วนบัญชี; discount ของ SB ต้องมาจากบรรทัด SB เท่านั้นและ CADV ไม่มี discount
- [x] `FCD-322` ปรับ summary ของ SB ให้เน้นยอดตัด AR, settlement THB, settlement FX, bank fee และ carrying THB; native amount/rate เป็นข้อมูลประกอบก่อนบันทึกและทุกค่าต้องระบุหน่วย
- [x] `FCD-323` ปรับ summary ของ CADV ให้แสดงยอดตัด CADV, ยอดที่ลูกค้าโอน, settlement THB, bank fee และ carrying THB เข้า FCD โดยไม่สร้าง `AR settlement FX`
- [x] `FCD-324` คำนวณ SB settlement FX จาก settlement THB ก่อน fee เทียบกับยอดตัด AR ตาม accounting contract และลง bank fee แยก; ห้ามนำ fee ไปรวมเป็น FX difference
- [x] `FCD-325` บังคับ CADV foreign receipt ให้ settlement THB reconcile กับยอดตัด CADV ตาม contract; ถ้าเกินยอดคงเหลือให้ reject และห้ามสร้าง overpayment/FX classification โดยอัตโนมัติ
- [x] `FCD-326` รองรับหลายบัญชีรับเฉพาะเมื่อทุก split ใช้ currency เดียวกัน; foreign receipt ทุก split ต้องเป็น FCD และผลรวมยอด native ที่เข้าจริงต้อง reconcile กับ receipt
- [x] `FCD-327` เมื่อวันที่, source type, customer, currency หรือ receiving account เปลี่ยน ต้อง invalidate dependent selections และ rate result อย่างชัดเจน แล้วโหลดข้อมูลใหม่จาก source ที่ถูกต้อง: form ล้าง foreign settlement fields ที่ขึ้นกับ source/branch/customer/currency, reset rate lookup และ refetch จาก receipt rate API ตาม request context; มี contract test คุมทุก transition (2026-07-30)
- [x] `FCD-328` API ต้อง validate source type, currency, FCD capability, native totals, THB allocations, fee และ rate provenance ซ้ำฝั่ง server และคำนวณ derived THB/FX ใหม่ก่อนบันทึก
- [x] `FCD-329` ปรับ detail, edit/replacement และ printable receipt ให้ใช้ label/หน่วยเดียวกับ create form และอ่าน transaction snapshot เดิม ไม่ดึง current rate มาคำนวณเอกสารเก่า
- [x] `FCD-330` เพิ่ม focused tests สำหรับ field visibility ตาม `SB/CADV`, THB/USD account filtering, currency reset, missing/manual/override rate, fee separation, multiple FCD splits และ CADV ที่เกินยอดคงเหลือ: component/service contract tests คุม conditional source sections, FCD+supported-currency filter, reset transitions, exact-rate lookup/manual override, fee/settlement FX separation, split reconciliation และ CADV settlement guard (2026-07-30)

### 3.2 Customer Receipt list, detail, print and notification

- [x] `FCD-331` ปรับ history API/row contract ให้ส่ง book amount THB เป็นค่าหลัก พร้อม source type และ foreign audit snapshot เมื่อมี; ห้ามใช้ field `amount/netAmount` แบบไม่ระบุหน่วย
- [x] `FCD-332` ปรับตารางประวัติ RCP ให้แสดงยอด THB เป็นหลัก; ใช้ตัวบ่งชี้ foreign/FCD และเปิด native amount/rate ใน detail แทนการเพิ่มคอลัมน์ยอดหลายสกุลในตารางหลัก
- [x] `FCD-333` เพิ่ม filter ประวัติ RCP ตาม source type, receipt currency และ receiving account โดย account filter ค้นทุก split และใช้ account/currency contract จริง
- [x] `FCD-334` ปรับ RCP detail ให้แสดง THB settlement/allocation/FX/bank fee/carrying เป็นยอดหลัก และแสดง native transfer/credit, rate และ provenance เป็น foreign audit section; field ที่ไม่มีข้อมูลไม่ต้องแสดง
- [x] `FCD-335` ปรับตารางบรรทัดใน RCP detail: SB ใช้ `ยอดตัด AR (THB)` ส่วน CADV ใช้ `ยอดตัด CADV (THB)` และห้ามใช้หัวข้อ `บิลขายที่รับเงิน` กับ CADV
- [x] `FCD-336` ปรับ printable RCP, batch print และรายงานประจำวันให้รวมและแสดงยอดหลักเป็น THB; native/rate แสดงเป็นข้อมูลอ้างอิงเฉพาะ foreign RCP และห้ามนำ native ไปบวก total
- [x] `FCD-337` ปรับ KPI ประวัติ RCP ให้รวมเฉพาะ THB book values ที่มี contract เดียวกัน; native totals ไม่อยู่ใน KPI หน้าหลัก
- [x] `FCD-338` ปรับ LINE Flex RCP ให้แสดง settlement THB เป็นยอดหลัก และแสดง receipt currency/native/rate แบบย่อเฉพาะ foreign receipt โดยไม่เปิดเผยเลขบัญชีเต็ม พร้อมรักษากฎ explicit routing เดิม
- [ ] `FCD-339` ปรับ cancel-and-reissue ให้ reverse/recreate receipt, allocation, BST, FCD ledger, FX และ rate snapshot ครบ โดยห้ามใช้ current rate แทน snapshot เดิม
- [x] `FCD-340` ปรับ search/sort/export/detail adapters ให้แยก named book THB fields ออกจาก optional native audit fields; list/KPI/export ธุรกิจหลักใช้ THB เท่านั้น
- [ ] `FCD-341` เพิ่ม compatibility/read migration plan สำหรับ consumer เก่าของ `receipts.amount/net_amount` โดยให้ค่า THB book amount มีชื่อชัดเจนและไม่เก็บ native USD ลง field THB เดิม
- [ ] `FCD-342` เพิ่ม tests ครอบคลุม history table, filters, detail, single/batch print, daily report, LINE payload, cancel และ replacement ของ THB/USD ทั้ง SB และ CADV

## Phase 4: Bank Statement

- [x] `FCD-401` API ส่ง currency, native in/out, book THB in/out, rate และ source event จาก persisted row เท่านั้น
- [x] `FCD-402` Bank running balance หลักคำนวณ book THB ต่อบัญชี; native running balance คำนวณแยก account+currency ใน FCD projection และห้ามรวม USD กับ THB
- [x] `FCD-403` account summary ใช้ book balance THB เป็นยอดหลัก; native balance แยกอ่านจาก FCD subledger และไม่รวมข้ามสกุล
- [x] `FCD-404` KPI/ตาราง/chart ของ Bank Statement รวมด้วยยอด THB เท่านั้นและระบุหน่วย THB ชัดเจน; legacy consumer อ่าน `amount_in/out` ต่อไป ส่วน FCD detail จึงอ่าน native/rate เพิ่มตามต้องการ
- [x] `FCD-405` สำหรับ FCD แสดง native amount/currency/rate ใน row detail หรือ FCD drilldown ขณะที่ running balance หลักเป็น carrying THB
- [x] `FCD-406` OD summary ใช้เฉพาะ contract ที่อนุมัติจาก `FCD-008`; ห้ามนำ THB OD ไปหัก USD โดยไม่มี conversion rule
- [x] `FCD-407` export Excel ใช้ book THB เป็นคอลัมน์หลัก และมี currency/native/rate เป็น audit columns สำหรับ foreign rows พร้อม source type/reversal reference
- [x] `FCD-408` detail modal แสดงเฉพาะ field ที่ persisted; field ไม่มีข้อมูลไม่ต้องแสดง
- [x] `FCD-409` ตัด consumer ของ `accounts.opening_balance` และ synthetic opening rows ออกจาก BST/FCD pages ทั้งหมด

### 4.1 Cash Position currency impact

- [x] `FCD-410` เปลี่ยน `/api/finance/cash-position` ให้อ่าน book balance THB จาก ledger/BST projection และหยุดอ่าน `accounts.opening_balance`; account+currency projection ยังคงอยู่หลังบ้านสำหรับ FCD
- [x] `FCD-411` ตัด fallback `account.currency ?? THB` และห้ามใช้ชื่อ/type บัญชีเดาว่าเป็น FCD; account classification ต้องอ่าน `account_group`, `is_fcd` และ supported currencies จริง
- [x] `FCD-412` ห้ามรวม native USD/CNY/สกุลอื่นเข้ากับ THB โดยตรง; KPI สภาพคล่องรวมใช้ book/carrying THB เท่านั้น
- [x] `FCD-413` Cash Position แสดง FCD ด้วย carrying THB เป็นหลักและ link ไป FCD ledger/หน้าแลกเงินเพื่อดู native balance; daily valuation/unrealized ไม่อยู่ในหน้าหลักนี้
- [x] `FCD-414` เพิ่ม `asOf`, branch และ account group filters ให้ Cash Position API/UI โดยคง branch permission scope และใช้ transaction facts ณ cutoff จริง; ไม่เพิ่ม currency filter ในหน้ารวม THB
- [x] `FCD-415` ปรับตาราง Cash Position ให้แสดงยอดคงเหลือทางบัญชี THB ต่อบัญชี พร้อม FCD indicator และ OD; native/rate/valuation detail ไม่เพิ่มเป็นคอลัมน์หลัก
- [x] `FCD-416` AR/AP exposure และ net exposure ใน Cash Position เป็น THB จาก `sales_bills.receivable_balance` และ `purchase_bills.payable_balance` โดยตรง ภายใต้ branch scope เดียวกับบัญชีเงิน; ไม่ derive ซ้ำจาก legacy receipts/payments
- [x] `FCD-417` ปรับ Top Accounts, composition chart และ net liquidity formula ให้จัดอันดับ/รวมด้วย carrying THB เท่านั้น
- [x] `FCD-418` ปรับ Cash Position export ให้เป็นยอด THB และเพิ่ม source links ไป Bank/FCD Ledger/AR/AP; native/rate อยู่ใน FCD drilldown ไม่ใช่ aggregate export
- [x] `FCD-419` แยกสถานะ OD used/available ออกจากยอดหลัก และคำนวณตาม account+currency contract ที่อนุมัติจาก `FCD-008`
- [ ] `FCD-420` เพิ่ม reconciliation tests ให้ Cash Position THB totals ตรงกับ Bank/FCD projection และ AR/AP source snapshots ณ as-of เดียวกัน

## Phase 5: FCD Dashboard And Ledger

- [x] `FCD-501` เปลี่ยน FCD Ledger จาก placeholder ให้ใช้อ่าน `fcd_ledger_entries` จริง
- [x] `FCD-502` selector ใช้ account+currency และรองรับหนึ่งบัญชีหลายสกุลเงิน
- [x] `FCD-503` แสดง native balance, carrying THB, weighted carrying rate, latest valuation rate, current THB value และ unrealized difference
- [x] `FCD-504` แสดง settlement/revaluation/conversion/reversal เป็น transaction type ที่แยกกัน
- [x] `FCD-505` daily valuation เป็น read-only calculation และไม่ post GL
- [x] `FCD-506` เมื่อไม่พบ rate ต้องแสดงสถานะไม่มีข้อมูลและไม่แสดงมูลค่าคำนวณจาก fallback
- [x] `FCD-507` export ต้อง reconcile กับ balance projection และ ledger entries

## Phase 6: FCD Conversion

- [x] `FCD-601` สร้างหน้า/route รายการแลกเงินต่างประเทศ
- [x] `FCD-602` เลือก FCD source account+currency, native amount และบัญชี THB ปลายทาง
- [x] `FCD-603` แสดง native balance/carrying rate/carrying THB ก่อนบันทึก
- [x] `FCD-604` รับ actual THB, conversion rate, fee และ bank reference เป็นข้อมูลจริง
- [x] `FCD-605` คำนวณ realized FX = actual THB net ตาม contract - carrying THB out
- [x] `FCD-606` post FCD out และ THB destination in เป็น statement คนละฝั่งที่ link conversion document เดียวกัน
- [x] `FCD-607` ป้องกัน native balance เกินยอดที่ใช้ได้ด้วย account+currency lock
- [x] `FCD-608` reverse conversion ด้วย reversal rows และคืน carrying balance ตาม event เดิม
- [x] `FCD-609` ทดสอบว่า conversion pair ถูก exclude/net เป็น internal transfer ใน cash-in/cash-out report และรับรู้เฉพาะ conversion FX difference เป็นผลกำไร/ขาดทุน

## Phase 7: Month-end Revaluation

- [x] `FCD-701` สร้างหน้า batch ปิดงวด FCD ตาม period/branch/account+currency
- [x] `FCD-702` preview native balance, carrying THB, closing rate, revalued THB และ difference ก่อน post
- [x] `FCD-703` rate ต้องมาจาก rate record ที่ผู้ใช้เลือก/contract อนุมัติและเก็บ reference
- [x] `FCD-704` post unrealized FX และปรับ carrying THB โดยไม่เปลี่ยน native balance
- [x] `FCD-705` ป้องกัน post ซ้ำและรองรับ reverse/repost พร้อม audit trail
- [x] `FCD-706` period lock ต้องป้องกัน receipt/conversion ย้อนวันที่ที่ทำให้ revaluation ที่ post แล้วเปลี่ยน

## Phase 8: FX Reporting And GL Integration

- [x] `FCD-801` ปรับ FX report ให้แยก AR settlement, FCD revaluation และ FCD conversion
- [x] `FCD-802` แสดง realized กับ unrealized แยกกันและรวมเฉพาะเมื่อผู้ใช้เลือก
- [x] `FCD-803` ทุกแถวต้อง drill down ไป source document และ ledger rows ได้
- [ ] `FCD-804` เพิ่ม posting rule/GL mapping โดยใช้ master/configuration ไม่ hardcode account code
- [ ] `FCD-805` reconcile GL กับ FX event tables และ carrying THB ของ FCD
- [x] `FCD-806` ปรับ Cash Position/Financial Dashboard ให้ไม่รวม native foreign units เข้ากับ THB โดยตรง
- [x] `FCD-807` audit `finance-accounting-cash-position` และ Financial Dashboard ให้ใช้ projection ใหม่ แทน `accounts.opening_balance` และการจำแนก FCD จากชื่อ/type/currency fallback
- [x] `FCD-808` audit Cash Flow Analysis/Forecast ที่รวม `customer_receipts.net_cash_in` ให้ใช้ THB book cash-in ที่ persist ชัดเจน ไม่ใช้ native foreign amount
- [x] `FCD-809` audit Main Dashboard, Owner Daily Dashboard และ Daily Report ให้คงอ่านยอด THB เดิมจาก `bank_statement.amount_in/out`; foreign write path ต้องรับรองว่า mirror กับ `book_amount_*` เสมอ และ native amount ใช้เฉพาะ FCD-specific detail/report ที่ระบุหน่วย
- [x] `FCD-810` audit Cash Flow Statement, Working Capital, Cash & Others anomaly และ transaction ledger ให้ไม่รวม foreign native movement เป็น THB
- [x] `FCD-811` ปรับ AR detail drilldown ให้ RCP foreign settlement แสดง receipt currency/native/rate/settlement FX ประกอบ แต่ AR table/KPI/export หลักยังเป็น THB และไม่เพิ่ม currency column ให้ Sales Bill
- [x] `FCD-812` ยืนยันว่า AP table/detail/API ไม่เปลี่ยนจาก Customer Receipt; AP ยังคง THB และมีผลเฉพาะเป็น THB exposure input ของ Cash Position
- [x] `FCD-813` audit foreign placeholder APIs/pages (`overseas-receipt`, `fcd-ledger`, `bank-reconciliation`, `fx-gain-loss-report`) ให้ใช้ posting/read contract กลางเดียวกันและ retire endpoint ที่ซ้ำเมื่อ consumer ย้ายครบ
- [x] `FCD-814` เพิ่ม consumer inventory gate สำหรับ direct และ relational reader ของ `customer_receipts`, legacy `receipts`, `bank_statement` และ `account_currency_balances`; reader ใหม่ต้องประกาศว่าเป็น THB projection, foreign audit, account/reference หรือ transactional contract ก่อน test ผ่าน. Customer/Supplier Advance อ่าน `movement_currency_code`, native amount และ `book_fx_rate` ที่ persist แล้ว; ไม่มี fallback currency/rate
- [x] `FCD-815` อัปเดต OpenAPI/data dictionary/page-flow docs ของ RCP, AR, AP, Bank, Cash Position, dashboards และ reports ก่อน promote: ระบุ THB/native/rate ownership, persisted FCD ledger, as-of Cash Position และ foreign audit boundary; retire legacy foreign endpoint จาก OpenAPI และ validate YAML
- [x] `FCD-816` สร้าง financial balance projection/service กลางจาก persisted THB movements (`bank_statement.amount_in/out`) แล้ว migrate เฉพาะ reader ที่ยังตั้งต้นจาก cached `accounts.opening_balance`; ห้ามเปลี่ยน legacy reader ให้ต้องอ่าน `book_amount_*` เพื่อรองรับ USD
- [x] `FCD-817` กำหนด source-event classification กลางสำหรับ FCD RCP, fee, transfer, conversion source/destination, revaluation และ reversal; conversion pair ใหม่ต้อง classify เป็น internal transfer จาก event type จริง แต่คง legacy classifier ของ THB rows ที่มีอยู่
- [x] `FCD-818` Foreign receipt write path ต้องเขียน THB ที่คำนวณแล้วลง `bank_statement.amount_in/out` และ mirror `book_amount_*` ใน transaction เดียว; dashboard/report เดิมจึงใช้ source THB เดิมได้โดยไม่ fallback/coalesce กับ receipt mirror
- [x] `FCD-819` audit Main Dashboard, Daily Report และ Owner Daily ว่ายังคง aggregate จาก `bank_statement.amount_in/out` และ exclude internal transfer; ต้องไม่มี `todayBankCashIn || receiptCashIn` หรือ logic ที่นำ receipt mirror มาบวกซ้ำกับ BST
- [x] `FCD-820` ปรับ Finance Tax ให้ WHT/Bank Fee ของ foreign RCP อ่าน THB settlement/withholding fields ที่ระบุชื่อชัดและเลือก active receipt source เดียว; ห้าม derive ภาษีหรือ fee จาก native amount/rate และห้ามนับ legacy receipt mirror ซ้ำ
- [x] `FCD-821` replace/retire foreign placeholder readers: FCD Ledger, FX Gain/Loss Report และ Bank Reconciliation ต้องอ่าน persisted FCD/BST/FX event snapshots เท่านั้น; ห้ามสร้าง synthetic opening row, fallback currency THB, derive foreign amount เป็นศูนย์ หรือ lookup current/historical rate เพื่อแทน transaction snapshot ที่หายไป
- [ ] `FCD-822` กำหนด period/reversal contract สำหรับ cancel-and-reissue, conversion และ revaluation: รายการในงวดปิดแล้วต้อง reverse ในงวดเปิดหรือ reopen/repost ด้วย approval; ห้ามแก้ carrying THB/native balance ในงวดปิดย้อนหลังโดยเงียบ

## Phase 9: Test And Release Gates

- [x] `FCD-901` unit tests สำหรับ Decimal, weighted carrying rate, settlement FX, conversion FX และ revaluation
- [ ] `FCD-902` API tests สำหรับ validation, permission, idempotency, reversal และ malformed/missing rate
- [ ] `FCD-903` integration tests สำหรับ THB receipt เดิม, USD receipt, partial receipt, multiple bills, fee, overpayment และ cancellation
- [ ] `FCD-904` concurrency tests ยืนยันว่า balance ไม่ติดลบ/ไม่ใช้ OD เกิน contract
- [ ] `FCD-905` reconciliation fixtures ครอบคลุม receipt -> revaluation -> conversion -> reversal
- [ ] `FCD-906` migration preflight/postflight บน dev-target โดยไม่แก้ legacy-prod-source
- [x] `FCD-907` lint, type-check, build, focused tests และ `git diff --check` ผ่านเมื่อ 2026-07-30: lint ไม่มี error (warnings เดิม 7 รายการนอกขอบเขต FCD), type-check และ production build ผ่าน; เพิ่ม `Suspense` wrapper ให้ FCD Ledger/Revaluation/Conversion ซึ่งอ่าน query string เพื่อแก้ production prerender failure. Focused FCD/UI contract tests 22/22 ผ่าน
- [ ] `FCD-908` browser UAT เฉพาะเมื่อร้องขอ ครอบคลุม desktop/mobile และทุก event flow
- [ ] `FCD-909` promote ตามลำดับ feature branch -> dev -> SIT/UAT หลัง reconciliation ผ่าน

## Recommended Implementation Batches

| Batch | Scope | Exit criteria |
|---|---|---|
| A | `FCD-000` ถึง `FCD-009` | accounting contract และตัวอย่าง posting ได้รับการยืนยัน |
| B | `FCD-101` ถึง `FCD-144` | additive schema/migration และ reconciliation SQL ผ่าน dev-target |
| C | `FCD-201` ถึง `FCD-211` | posting engine, concurrency และ anti-double-count tests ผ่าน |
| D | `FCD-301` ถึง `FCD-342` | Customer Receipt เลือก SB/CADV ก่อนบัญชี รับ USD ผ่าน FCD และ list/detail/print/notification/reverse ใช้ snapshot ถูกต้อง |
| E | `FCD-401` ถึง `FCD-507` | BST/Cash Position ใช้ book THB เป็นหลัก และ FCD Ledger เก็บ native+carrying facts สำหรับ drilldown/conversion โดย reconcile กันได้ |
| F | `FCD-601` ถึง `FCD-609` | conversion post/reverse, internal-transfer exclusion และ realized FX reconcile |
| G | `FCD-701` ถึง `FCD-706` | month-end revaluation post/reverse และ period lock ผ่าน |
| H | `FCD-801` ถึง `FCD-909` | reporting/GL/release validation ครบ รวม financial-book projection, internal-transfer และ foreign-reader cutover |

## Explicit Non-goals For The First Implementation Batch

- ไม่สร้าง generic receipt ที่ไม่อ้างอิง Customer Receipt หรือ source document ที่อนุมัติ
- ไม่แก้ยอดหรือสกุลเงินของ Sales Bill เดิมเพราะ FX
- ไม่ผูก conversion กลับไปยัง Sales Bill รายใบ
- ไม่คำนวณ foreign amount ย้อนหลังจาก THB statement และ current FX rate
- ไม่ใช้ชื่อบัญชี, subtype, currency หลัก หรือ latest rate เพื่อเดาข้อมูล transaction ที่ขาด
- ไม่เก็บยอดตั้งต้นใน Account Master
- ไม่ post revaluation รายวัน
- ไม่แก้ posted ledger row โดยตรง
