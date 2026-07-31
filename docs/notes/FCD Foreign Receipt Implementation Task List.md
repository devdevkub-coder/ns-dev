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
updated: 2026-07-31
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

## Master Data Checkpoint 2026-07-31

- `ACC01-002` เป็นบัญชีธนาคาร FCD ที่ active ทั้ง Dev และ SIT (`is_fcd = true`) และรองรับสกุลเงิน `THB` กับ `USD` ตาม `account_currency_balances`.
- ไม่ต้องเพิ่ม migration หรือแก้ runtime fallback สำหรับบัญชีนี้; หลังตรวจฐานข้อมูลได้ invalidate account reference cache ของ Dev/SIT แล้ว เพื่อให้หน้า FCD อ่าน master data ปัจจุบัน.

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
- [x] `FCD-002` ยอดเงิน native และ book amount คำนวณ/เก็บ/แสดงที่ 2 ตำแหน่ง; FX rate ของ Customer Receipt ใช้ 2 ตำแหน่ง. คอลัมน์ rate เดิมคง precision ที่รองรับข้อมูลประเภทอื่นโดยไม่ทำ migration ปัดข้อมูลเดิม แต่ RCP write path รับ rate ได้ไม่เกิน 2 ตำแหน่งและปัดยอดเงินครั้งเดียวเมื่อสร้างรายการ
- [x] `FCD-003` Customer Receipt ขอ suggested rate จาก API ตามวันรับเงิน; ผู้ใช้แก้ rate ได้ก่อนบันทึกและระบบเก็บ rate ที่ใช้จริงเป็น snapshot โดยไม่เพิ่ม global rate policy ใน batch นี้
- [x] `FCD-004` หาก API ไม่มี rate ผู้ใช้กรอกเองได้; ห้าม fallback ไปใช้ rate ล่าสุดหรือ rate จาก account master
- [x] `FCD-005` ปิดออกจาก active FCD scope: ระบบปัจจุบันไม่มี GL journal engine หรือ requirement ให้ทำ chart-of-account posting; ทบทวนได้เมื่อมีงาน GL แยกต่างหาก
- [x] `FCD-006` กำหนดสิทธิ์ action ของ conversion และ revaluation: แยก `view`/`post`/`reverse` ต่อ event type และ route บังคับใช้ตาม HTTP action; ไม่มี `approve` เพราะสอง flow post แบบ atomic และไม่มี approval state ใน batch นี้. Migration copy grant/override เดิมจาก `finance.cash.view` เพื่อไม่ตัดสิทธิ์ตอน rollout แล้วจึงถอนเป็นราย action ได้; apply+record Dev/SIT แล้วและตรวจ permission ครบ 6 รายการ (2026-07-30)
- [x] `FCD-007` Customer Receipt คงสถานะเดิม `pending`/`active`/`cancelled`; ไม่สร้าง `draft`/`posted`/`reversed` ใน batch รับเงินต่างประเทศนี้
- [x] `FCD-008` FCD OD เป็นวงเงินต่อบัญชี
- [x] `FCD-009` ปิดออกจาก active FCD scope: ไม่เพิ่ม GL posting เป็น requirement แฝงของ FCD

## Open Items Before Their Respective Phase

- GL account mapping ไม่อยู่ใน FCD scope นี้ เพราะระบบยังไม่มี GL posting engine และยังไม่มี requirement ให้สร้าง; ไม่ใช่ blocker ของ receipt/BST/FCD ledger
- `FCD-006` ไม่มี approval state สำหรับ conversion/revaluation ใน batch นี้; ใช้สิทธิ์ `view`/`post`/`reverse` แยกต่อ flow เพราะการ post เป็น transaction เดียว. ไม่กระทบ Customer Receipt ที่ใช้สถานะเดิม
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
- [x] `FCD-122` แยก bank fee, customer overpayment, discount/credit note และ FX difference เป็นคนละ field/type: Bank Fee อยู่ receipt header, discount อยู่ SB allocation, AR settlement FX เป็น snapshot ของ allocation; RCP ปฏิเสธยอดเกินและให้ customer advance/credit document เป็น owner ของ overpayment/credit note แทนการสร้าง field อัตโนมัติ (2026-07-30)
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
- [x] `FCD-209` เพิ่ม concurrent/race-condition tests สำหรับ receipt, conversion และ revaluation account เดียวกัน: DB verifier สร้าง/ลบ FCD account fixture เองและตรวจ advisory lock ด้วย 2 concurrent transactions; source contract บังคับให้ writer ทั้ง 3 เรียก lock เดียวกัน. รันผ่าน Dev/SIT เมื่อ 2026-07-30 และ postflight ยืนยัน fixture cleanup เหลือ 0 แถวทั้งสอง environment
- [x] `FCD-210` เพิ่ม reconciliation invariant หลัง post ทุก service: Receipt, Conversion และ Revaluation อ่าน BST/FCD ledger/split/line ที่ persist แล้วตรวจ account, currency, native amount และ carrying THB ใน transaction เดียว; mismatch throw เพื่อ rollback ทั้ง transaction. Focused tests คุม receipt mismatch, conversion pair และ revaluation ที่ห้ามเปลี่ยน native balance (2026-07-30)
- [x] `FCD-211` เพิ่ม anti-double-count invariant: RCP/BST/FCD ledger/FX event ที่ใช้ source event เดียวกันต้องถูกนับเป็น cash asset เพียงครั้งเดียวใน Bank, Cash Position และ dashboard read models: consumer gate บังคับ dashboard ให้อ่าน cash จาก Bank Statement THB เท่านั้น; Cash Position เก็บ FCD native เป็น audit projection แยกจาก `cashAndBank`; conversion pair ถูก classify เป็น internal transfer (2026-07-30)

## Phase 3: Customer Receipt API And Form

- [x] `FCD-301` ขยาย account options ให้ส่ง `isFcd` และ supported currencies จาก account master contract จริง
- [x] `FCD-302` เพิ่ม receipt-level currency dropdown จาก Currency Master ก่อน account selection; default เป็น functional currency ที่ resolve จาก source จริง แต่ผู้ใช้เปลี่ยนได้และห้าม hardcode `THB`
- [x] `FCD-303` แสดงยอดรับจริงและ rate เพื่อคำนวณก่อนบันทึก แต่ใช้มูลค่า THB และยอดปิดบิล THB เป็นผลลัพธ์ทางบัญชีหลัก
- [x] `FCD-304` รองรับแบ่งยอด native/THB ไปหลาย Sales Bills พร้อม reconciliation ระดับบรรทัด
- [x] `FCD-305` กติกา reason ของ foreign receipt: ผู้ใช้ต้องระบุ reason เฉพาะเมื่อกรอก/แก้ FX rate; ส่วนต่างของ SB ถูก derive เป็น `fx_settlement` เฉพาะเมื่อไม่เป็นศูนย์ และ CADV ต้อง reconcile เป็นศูนย์ จึงไม่เปิดให้ client เลือก reason ของกำไร/ขาดทุนเอง (2026-07-30)
- [x] `FCD-306` แยก bank fee, overpayment, discount/credit note และ settlement FX ใน request/response: Bank Fee เป็น header THB, discount เป็น SB line, FX เป็น server-derived snapshot; RCP reject overpayment แล้วใช้ advance/credit document ที่เป็น owner ของยอดแทน (2026-07-30)
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

### 3.1A Customer Receipt single-amount simplification follow-up

สถานะชุดงาน: `completed locally; migration applied to SIT 2026-07-31`

ชุดงานนี้แทนที่เฉพาะรายละเอียดเดิมใน `FCD-318`, `FCD-320` และส่วนที่เกี่ยวข้องกับ foreign receipt ซึ่งเคยให้ผู้ใช้กรอก native amount สองค่าและบังคับกรอกเหตุผลเมื่อแก้ rate. ไม่เปิด scope ใหม่ไปยัง AP, GL, FCD conversion, FCD revaluation หรือการออกแบบ Cash Position.

กฎบังคับของทุก task ในชุดนี้:

- ห้าม hardcode สกุลเงินหลัก, สกุลเงินรับ, account code/type, payment method, rate type หรือ FX rate
- ห้าม fallback ไป account, currency, rate ล่าสุด, primary currency, ชื่อบัญชี หรือค่า default ที่ไม่ได้มาจาก source of truth
- functional currency ต้องอ่านจาก `finance_currency_policies`; currency/account/payment method ต้องอ่านจาก master ที่ active และ FX rate ต้องมาจาก exact date/type หรือค่าที่ผู้ใช้กรอกในรายการนั้น
- เมื่อ source of truth ไม่มีหรือข้อมูลไม่ผ่าน contract ให้ fail closed พร้อมข้อความที่ชัดเจน ห้ามเดา, skip, coerce หรือบันทึกข้อมูลบางส่วน

- [x] `FCD-RCP-01` ล็อกความหมายยอด foreign receipt ให้มี input ระดับ receipt เพียงค่าเดียว ใช้ label `ยอดที่ลูกค้าโอน (<currency>)` และใช้ค่านี้เป็น canonical native amount ของ RCP; `ยอดเข้าบัญชี FCD จริง` ต้องไม่เป็น independent user input อีกต่อไป
- [x] `FCD-RCP-02` ล็อกกติกา Bank Fee และ Discount ให้ไม่สร้าง field ซ้ำ: `Bank Fee` เป็น THB และอยู่ในส่วนบัญชีรับเงินเดิม, ส่วนลดอยู่ที่บรรทัด SB เดิม, CADV ไม่มีส่วนลด; service ต้องไม่ต้องการ native amount ช่องที่สองเพื่ออธิบาย Bank Fee
- [x] `FCD-RCP-03` จำกัด receiving account options ตาม use case จาก account master contract จริง:
  - receipt สกุล functional currency แสดงเฉพาะบัญชี active กลุ่ม `cash` หรือ `bank` ที่รองรับสกุลนั้น
  - receipt สกุลต่างประเทศแสดงเฉพาะบัญชี active กลุ่ม `bank` ที่เป็น FCD และรองรับสกุลที่เลือก
  - ห้ามแสดงบัญชี virtual, เงินทดรองจ่าย หรือบัญชีธนาคารปกติใน foreign receipt และห้าม fallback จากชื่อบัญชี/subtype
- [x] `FCD-RCP-04` ปรับ section `สกุลเงินและบัญชีรับเงิน` ให้เหลือเฉพาะ field ที่ต้องกรอก: สกุลเงินที่รับจริง, ยอดที่ลูกค้าโอน และ rate ที่แก้ไขได้; ตัด `ยอดเข้าบัญชี FCD จริง`, `ประเภทอัตราแลกเปลี่ยน`, `เหตุผลที่กรอกหรือแก้ไขอัตราแลกเปลี่ยน` และ Bank Fee ที่ซ้ำออกจาก section นี้
- [x] `FCD-RCP-05` ใช้ PaymentSplitsSection เดียวกับ receipt สกุล functional currency: foreign receipt ส่งเฉพาะ active FCD account ที่รองรับ currency และ payment method กลุ่ม bank เข้า component, ซ่อน Discount และยอดคงเหลือ THB ที่ไม่ใช่ native balance; เพิ่ม API กลาง Google Finance USD/THB แบบ no-store เพื่อเติม rate ล่าสุดพร้อมเวลา quote โดยไม่มี default/fallback และแก้ rate ได้ก่อนบันทึก
- [x] `FCD-RCP-05` คง account split เดิมสำหรับกรณีรับเข้าหลายบัญชี แต่บังคับผลรวม split ให้เท่ากับ canonical native amount; foreign split ทุกแถวต้องเป็น FCD สกุลเดียวกับ RCP และ UI ต้องแสดงหน่วยสกุลเงินในทุกยอด
- [x] `FCD-RCP-06` ปรับ client state/reset/validation เมื่อเปลี่ยนวันที่, source type, สาขา, ลูกค้า หรือสกุลเงิน ให้ล้าง account/rate/native amount ที่ขึ้นต่อกัน; ห้ามคง account ที่ไม่ผ่าน filter และห้ามสร้างค่า native/rate fallback
- [x] `FCD-RCP-07` ปรับ request schema และ API contract ให้รับ native amount เพียงค่าเดียวและไม่รับ override reason; server ต้อง reject payload ที่ส่ง account group, FCD capability, supported currency, split total หรือ rate precision ไม่ตรง contract
- [x] `FCD-RCP-08` ปรับ foreign SB/CADV posting service ให้คำนวณ settlement THB, carrying THB, Bank Fee และ split posting จาก canonical native amount เดียว โดยยังใช้ rate snapshot ตามวันที่/rate type และเก็บ source/reference/override flag ที่ตรวจสอบได้; การแก้ rate ไม่ต้องมีเหตุผลข้อความ
- [x] `FCD-RCP-09` ตรวจ schema และ deferred DB guards ของ `customer_receipts`, receipt splits, Bank Statement และ FCD ledger; เพิ่ม migration เฉพาะที่จำเป็นเพื่อให้ single-amount invariant ใช้จริง โดยไม่ hardcode account/currency และไม่ backfill ข้อมูลทดสอบเก่าที่ไม่อยู่ใน scope
- [x] `FCD-RCP-10` ปรับ edit/replacement/cancel ให้ใช้ canonical native snapshot เดิมและ rate snapshot เดิม; ห้าม derive native amount จาก THB ด้วย current rate และ reversal ต้องคืน BST/FCD/AR หรือ CADV ครบหนึ่งครั้ง
- [x] `FCD-RCP-11` ปรับ receipt detail, printable receipt, batch print, daily report, export และ LINE payload ให้แสดง native amount เพียงความหมายเดียว; ตาราง/KPI หลักยังรวม THB book amount เท่านั้นและต้องไม่บวก native amount ซ้ำ
- [x] `FCD-RCP-12` ตรวจผลกระทบตรงโดยไม่เปลี่ยน business flow ของ consumer:
  - AR ยังตัดยอดและรายงานเป็น THB จาก persisted settlement snapshot
  - Bank Statement ยังเก็บ THB book amount หนึ่งครั้งและเชื่อม native FCD audit หนึ่งครั้ง
  - FCD ledger รับ native inflow หนึ่งครั้งต่อ split
  - Cash Position ยังรวม carrying/book THB เท่านั้น
  - AP ไม่เปลี่ยนจาก Customer Receipt
- [x] `FCD-RCP-13` เพิ่ม focused tests ครอบคลุม THB cash/bank filtering, foreign FCD-only filtering, single native field, manual/edited rate ที่ไม่มี reason, split reconciliation, Bank Fee separation, SB/CADV, replacement/cancel และ anti-double-count ระหว่าง RCP/BST/FCD
- [x] `FCD-RCP-14` อัปเดต flow note และ data dictionary ให้ระบุ owner/หน่วยของ canonical native amount, THB settlement, carrying THB, Bank Fee และ rate snapshot พร้อมลบคำอธิบายที่ยังบอกให้ผู้ใช้กรอก native amount สองค่า
- [x] `FCD-RCP-15` รัน focused tests, lint, type-check, build และ `git diff --check` ผ่านเมื่อ 2026-07-31; browser/UAT และ promotion ไป Dev/SIT ทำเฉพาะเมื่อมีคำสั่งแยกหลัง code validation ผ่าน

#### Scope exclusions

- ไม่เพิ่ม GL posting หรือ Chart of Accounts mapping
- ไม่แก้ AP หรือ Supplier Payment
- ไม่เปลี่ยนสูตร conversion, moving weighted-average หรือ revaluation ของ FCD
- ไม่ออกแบบ Cash Position หรือ Bank Statement ใหม่เกินกว่าการป้องกันยอดซ้ำจาก RCP
- ไม่เปลี่ยน Account Master, Currency Master หรือวิธีสร้างบัญชี FCD
- ไม่สร้าง generic receipt ที่ไม่มี SB/CADV
- ไม่เพิ่ม hardcode/fallback สำหรับสกุลเงิน, rate, account หรือ payment method
- ไม่ทำ browser UAT, deploy หรือ push ในขั้น task-list นี้

### 3.1B Foreign Receipt partial settlement and FX presentation follow-up

สถานะชุดงาน: `client calculation and summary implemented locally; downstream implementation and full validation pending`

ชุดงานนี้แทนกติกาเดิมใน `FCD-RCP-02`, `FCD-RCP-08` และส่วนสรุปยอดของ foreign SB receipt เฉพาะประเด็นส่วนลด, การรับชำระบางส่วน และกำไร FX จากการปิดบิล โดยไม่เปลี่ยน source document, ยอดบิลขายเดิม หรือ business flow ของ CADV.

#### Approved calculation contract

| รายการ | กติกา |
|---|---|
| Native receipt | ใช้ `ยอดที่ลูกค้าโอน (<currency>)` ค่าเดียว และผลรวมบัญชีรับต้องเท่ากับยอดนี้ |
| Settlement THB | `native receipt x receipt-date FX rate` ปัดตาม precision ที่ระบบกำหนด |
| ส่วนลดและภาษีหัก ณ ที่จ่าย | เป็นรายการตัด AR แยกจากเงินสดและ FX; ส่วนลดอยู่ใน section บัญชีรับเงิน ไม่อยู่รายบิล |
| รับชำระบางส่วน | เมื่อ Settlement THB ไม่พอปิดยอดเงินสดที่ต้องรับ ให้ตัด AR เท่าที่รับได้และเหลือ AR ค้าง ห้ามตีความส่วนขาดเป็น FX loss |
| กำไร FX จากการปิดบิล | เกิดเฉพาะส่วนบวกของ `Settlement THB - ยอดเงินสดที่นำไปปิดบิล`; ส่วนลบเป็น partial receipt ไม่ใช่ FX loss |
| Bank Fee | เก็บเป็น THB แยกจากส่วนลดและ FX และหักจาก carrying THB ของ FCD |
| P&L | เก็บ FX fact เป็นยอดกำไรบวกเพื่อ audit แต่แสดงเป็นค่าใช้จ่ายดำเนินงานติดลบ (contra operating expense) และต้องไม่แสดงซ้ำในหมวดอื่น |

ตัวอย่างที่ต้องใช้ยืนยันสูตร:

- AR ที่เลือก `28,558.30 THB`, ส่วนลด `100.00 THB`, เงินสดที่ต้องนำไปปิดบิล `28,458.30 THB`
- ลูกค้าโอน `1,000.00 USD` ที่ rate `33.396` เท่ากับ Settlement `33,396.00 THB`
- กำไร FX จากการปิดบิลต้องเป็น `4,937.70 THB`; ห้ามหักส่วนลดซ้ำจนเหลือ `4,837.70 THB`

- [x] `FCD-RCP-FX-00` ล็อก calculation contract และการแสดงกำไร FX ใน P&L ตามตารางข้างต้น; ไม่เพิ่ม GL posting
- [x] `FCD-RCP-FX-01` แก้ state ของบัญชีรับเงิน foreign ให้ split แถวแรกและผลรวมบัญชีรับเริ่มจาก canonical native receipt จริง และแยก derived partial allocation ออกจาก form state เพื่อไม่ให้ rate ชั่วคราวเขียนทับยอดบิลเป็น `33.39` แล้วค้างเมื่อ rate จริงโหลดสำเร็จ
- [x] `FCD-RCP-FX-02` เพิ่มค่าคำนวณอ่านอย่างเดียวถัดจากช่อง rate เพื่อแสดง `ยอดที่ลูกค้าโอน x rate = มูลค่าเงินบาท ณ วันรับเงิน` พร้อมหน่วยและ precision ที่ถูกต้อง
- [x] `FCD-RCP-FX-03` ย้ายส่วนลดออกจากแต่ละบรรทัดบิลไปอยู่ใน section บัญชีรับเงินทั้ง THB และ foreign receipt; คงภาษีหัก ณ ที่จ่ายรายบิลตาม business source เดิม และไม่สร้างช่องส่วนลดซ้ำ
- [x] `FCD-RCP-FX-04` ปรับ client calculation ให้ Settlement THB ที่ต่ำกว่ายอดเงินสดที่ต้องรับเป็น partial receipt: ตัดลูกหนี้ตามเงินรับจริงรวมส่วนลด/ภาษีที่เกี่ยวข้อง แสดง `ยอดลูกหนี้คงเหลือ` และไม่แสดง FX loss จากยอดที่ยังไม่รับ
- [x] `FCD-RCP-FX-05` ปรับการกระจายยอดรับหลายบิลให้ใช้ยอดเงินสดที่รับจริงเป็นฐาน กระจายอย่าง deterministic และ reconcile เศษปัดที่บรรทัดสุดท้าย โดยไม่รวมส่วนลดหรือภาษีซ้ำใน cash allocation
- [x] `FCD-RCP-FX-06` ปรับ summary ใน section บัญชีรับเงินให้แสดงยอด AR ก่อนตัด, ส่วนลด, ภาษีหัก ณ ที่จ่าย, ยอดเงินสดที่ต้องรับ, ยอดตัดลูกหนี้, ยอดลูกหนี้คงเหลือ, Settlement THB, Bank Fee, ยอด native ที่บันทึกเข้า FCD, มูลค่าตามบัญชี FCD เป็น THB และกำไร FX จากการปิดบิลโดยไม่ปนหน่วยหรือซ้ำความหมาย
- [ ] `FCD-RCP-FX-07` ปรับ server-side calculation ให้คำนวณ Settlement THB, cash applied, AR settled, AR remaining, carrying THB, Bank Fee และ FX gain ใหม่จาก persisted inputs; ห้ามเชื่อค่าคำนวณ derived จาก client
- [ ] `FCD-RCP-FX-08` เพิ่ม server guard ให้ผลรวม native split เท่ากับ canonical native receipt และ reject payload ที่หน่วยเงิน/account capability/rate ไม่ตรง contract; Settlement ที่ต่ำกว่า cash required ต้องเข้า partial path ไม่ใช่สร้าง FX loss
- [ ] `FCD-RCP-FX-09` เพิ่ม migration/DB guard ให้ foreign SB receipt reconcile ตาม `cash applied + FX gain = Settlement THB` โดยส่วนลดและภาษีหัก ณ ที่จ่ายอยู่ฝั่ง AR settlement แยกต่างหาก; ห้าม hardcode account, currency หรือ rate
- [ ] `FCD-RCP-FX-10` บันทึก FX fact ประเภท `AR Settlement` หนึ่งครั้งต่อ receipt พร้อม `branch_id`, receipt reference, rate snapshot และยอด THB เพื่อให้ audit และรายงานตามสาขาได้
- [ ] `FCD-RCP-FX-11` ปรับ P&L ให้ FX gain ประเภท `AR Settlement` ลดค่าใช้จ่ายดำเนินงานในฐานะ contra expense และยืนยันว่าไม่ถูกนับซ้ำในรายได้อื่นหรือส่วนสรุป FX อีกตำแหน่ง
- [ ] `FCD-RCP-FX-12` ปรับ FX gain/loss report และ receipt detail ให้แสดงประเภท `AR Settlement`, เอกสารต้นทาง, native amount, rate, Settlement THB, cash applied และกำไร FX ที่ drill down ตรวจสอบได้
- [ ] `FCD-RCP-FX-13` ปรับ cancel/replacement ให้ reverse FX fact, AR settlement, FCD ledger และ Bank Statement ครบหนึ่งครั้งใน transaction เดียว โดยไม่ derive ยอดใหม่จาก current rate
- [ ] `FCD-RCP-FX-14` ตรวจผลกระทบและป้องกันยอดซ้ำใน Sales Bill/AR, Receipt list/detail/print, Bank Statement, FCD ledger, Cash Position และ P&L; AP/Supplier Payment ต้องไม่เปลี่ยน
- [ ] `FCD-RCP-FX-15` เพิ่ม focused tests ครอบคลุม full receipt, partial receipt, discount, withholding tax, Bank Fee, multi-bill allocation, split reconciliation, positive FX gain, cancel/replacement, branch-filtered P&L และ anti-double-count
- [ ] `FCD-RCP-FX-16` อัปเดต flow note และ data dictionary ให้แยก native receipt, Settlement THB, cash applied, AR settled, AR remaining, carrying THB, Bank Fee และ AR Settlement FX พร้อมระบุ owner/หน่วย/สูตรของแต่ละค่า
- [ ] `FCD-RCP-FX-17` รัน focused tests, lint, type-check, build และ `git diff --check`; apply migration และทำ browser/UAT หรือ promotion เฉพาะเมื่อได้รับคำสั่งหลัง code validation ผ่าน

#### Scope exclusions for this follow-up

- ไม่เพิ่ม GL engine หรือ Chart of Accounts mapping
- ไม่แก้ยอดหรือสกุลเงินของ Sales Bill ต้นทาง
- ไม่เปลี่ยน FCD conversion, moving weighted-average หรือ month-end revaluation
- ไม่สร้างเงินเข้า Bank Statement/FCD ซ้ำเพื่อแทนกำไร FX; FX เป็นผลต่างทางบัญชีของ settlement
- ไม่เปลี่ยน CADV, AP หรือ Supplier Payment
- ไม่เพิ่ม fallback, hardcode, silent coercion หรือการเดาค่า account/currency/rate
- ไม่ทำ browser UAT, deploy, push หรือ migration apply ในขั้นบันทึก task list นี้

### 3.2 Customer Receipt list, detail, print and notification

- [x] `FCD-331` ปรับ history API/row contract ให้ส่ง book amount THB เป็นค่าหลัก พร้อม source type และ foreign audit snapshot เมื่อมี; ห้ามใช้ field `amount/netAmount` แบบไม่ระบุหน่วย
- [x] `FCD-332` ปรับตารางประวัติ RCP ให้แสดงยอด THB เป็นหลัก; ใช้ตัวบ่งชี้ foreign/FCD และเปิด native amount/rate ใน detail แทนการเพิ่มคอลัมน์ยอดหลายสกุลในตารางหลัก
- [x] `FCD-333` เพิ่ม filter ประวัติ RCP ตาม source type, receipt currency และ receiving account โดย account filter ค้นทุก split และใช้ account/currency contract จริง
- [x] `FCD-334` ปรับ RCP detail ให้แสดง THB settlement/allocation/FX/bank fee/carrying เป็นยอดหลัก และแสดง native transfer/credit, rate และ provenance เป็น foreign audit section; field ที่ไม่มีข้อมูลไม่ต้องแสดง
- [x] `FCD-335` ปรับตารางบรรทัดใน RCP detail: SB ใช้ `ยอดตัด AR (THB)` ส่วน CADV ใช้ `ยอดตัด CADV (THB)` และห้ามใช้หัวข้อ `บิลขายที่รับเงิน` กับ CADV
- [x] `FCD-336` ปรับ printable RCP, batch print และรายงานประจำวันให้รวมและแสดงยอดหลักเป็น THB; native/rate แสดงเป็นข้อมูลอ้างอิงเฉพาะ foreign RCP และห้ามนำ native ไปบวก total
- [x] `FCD-337` ปรับ KPI ประวัติ RCP ให้รวมเฉพาะ THB book values ที่มี contract เดียวกัน; native totals ไม่อยู่ใน KPI หน้าหลัก
- [x] `FCD-338` ปรับ LINE Flex RCP ให้แสดง settlement THB เป็นยอดหลัก และแสดง receipt currency/native/rate แบบย่อเฉพาะ foreign receipt โดยไม่เปิดเผยเลขบัญชีเต็ม พร้อมรักษากฎ explicit routing เดิม
- [x] `FCD-339` ปรับ cancel-and-reissue ให้ reverse/recreate receipt, allocation, BST, FCD ledger, FX และ rate snapshot ครบ โดยห้ามใช้ current rate แทน snapshot เดิม: cancellation อ่าน receipt split/FCD ledger ต้นทางและสร้าง reversal native/carrying/rate snapshot เดิม; replacement ยกเลิกแล้วสร้างเอกสารใหม่ใน transaction เดียว พร้อม transaction-level test (2026-07-30)
- [x] `FCD-340` ปรับ search/sort/export/detail adapters ให้แยก named book THB fields ออกจาก optional native audit fields; list/KPI/export ธุรกิจหลักใช้ THB เท่านั้น
- [x] `FCD-341` เพิ่ม compatibility/read migration plan สำหรับ consumer เก่าของ `receipts.amount/net_amount` โดยให้ค่า THB book amount มีชื่อชัดเจนและไม่เก็บ native USD ลง field THB เดิม: ระบุ owner/meaning/write rule และ anti-double-count boundary ใน FCD data dictionary (2026-07-30)
- [x] `FCD-342` เพิ่ม tests ครอบคลุม history table, filters, detail, single/batch print, daily report, LINE payload, cancel และ replacement ของ THB/USD ทั้ง SB และ CADV: history/daily report ใช้ source/currency/branch/account-split filter contract เดียวกัน, print ใช้ THB book values เป็นยอดหลักและ foreign audit เฉพาะ FCD, detail/LINE คง source-specific labels และ replacement เลือก writer ของ SB/CADV ตาม receipt currency (2026-07-30)

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
- [x] `FCD-420` เพิ่ม reconciliation tests ให้ Cash Position THB totals ตรงกับ Bank/FCD projection และ AR/AP source snapshots ณ as-of เดียวกัน: route fixture ยืนยัน account THB projection (รวม FCD carrying THB ครั้งเดียว), AR/AP bill balances และ net exposure ใช้ as-of/branch scope เดียวกัน (2026-07-30)

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

## Phase 8: FX Reporting And Release Integration

- [x] `FCD-801` ปรับ FX report ให้แยก AR settlement, FCD revaluation และ FCD conversion
- [x] `FCD-802` แสดง realized กับ unrealized แยกกันและรวมเฉพาะเมื่อผู้ใช้เลือก
- [x] `FCD-803` ทุกแถวต้อง drill down ไป source document และ ledger rows ได้
- [x] `FCD-804` ปิดออกจาก FCD scope: ไม่มี GL posting engine หรือ requirement ที่ยืนยันแล้ว
- [x] `FCD-805` ปิดออกจาก FCD scope: GL reconciliation ทำหลังอนุมัติงาน GL แยกต่างหาก
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
- [x] `FCD-822` กำหนด period/reversal contract สำหรับ cancel-and-reissue, conversion และ revaluation: cancellation/reissue ของ RCP ใช้ `current_date` จาก DB transaction เป็น reversal date แทนวันที่เอกสารต้นทาง, conversion/revaluation reversal รับวันที่ดำเนินการผ่าน schema; period-lock trigger ปฏิเสธ economic event ย้อนเข้าปิดงวด และไม่มี reopen workflow จึง reject หาก action date ถูกปิด. ทุก reversal append-only และใช้ original snapshot (2026-07-30)

## Phase 9: Test And Release Gates

- [x] `FCD-901` unit tests สำหรับ Decimal, weighted carrying rate, settlement FX, conversion FX และ revaluation
- [x] `FCD-902` API tests สำหรับ validation, permission, idempotency, reversal และ malformed/missing rate: route tests คุม permission/parse failure/cancel boundary, schema/rate tests คุม malformed/missing/manual rate, FCD posting test คุม deterministic idempotency/source-event keys และ reversal ใช้ snapshot เดิม (2026-07-30)
- [x] `FCD-903` integration tests สำหรับ THB receipt เดิม, USD receipt, partial receipt, multiple bills, fee, overpayment และ cancellation: เรียก customer receipt service จริงด้วย fixture ชั่วคราว; THB receipt/cancel, USD partial + 2 bills + Bank Fee, settlement FX ที่มากกว่า AR และ foreign cancellation ผ่าน Dev/SIT พร้อม cleanup. แก้ foreign receipt transaction timeout สำหรับ multi-bill และ deferred contract ให้ receipt ที่ cancelled ไม่ต้อง reconcile กับ allocation active (2026-07-30)
- [x] `FCD-904` concurrency tests ยืนยันว่า balance ไม่ติดลบ/ไม่ใช้ OD เกิน contract: integration fixture ตั้ง OD สูงแต่ seed native USD เพียง 100 แล้วแข่งถอน 75 สอง transaction; Dev และ SIT อนุญาตเพียง 1 conversion, native balance เหลือ 25 USD และ postflight fixture cleanup เหลือ 0 แถวใน accounts/FCD ledger/Bank Statement/conversion (2026-07-30)
- [x] `FCD-905` reconciliation fixtures ครอบคลุม receipt -> revaluation -> conversion -> reversal: integration fixture สร้าง Customer/Sales Bill/FCD/THB account ชั่วคราว, post receipt 100 foreign currency ที่ carrying 3,500, revalue เป็น 3,600, convert 50, reverse conversion/revaluation/receipt และตรวจ native กับ carrying balance กลับเป็น 0; ผ่าน Dev/SIT พร้อม cleanup fixture (2026-07-30)
- [x] `FCD-906` migration preflight/postflight บน dev-target โดยไม่แก้ legacy-prod-source: ตรวจ read-only เมื่อ 2026-07-30 ทั้ง dev-target และ SIT หลัง transaction reset; แต่ละ environment มี functional-currency policy 1 แถว, FCD ledger/receipt/Bank Statement เป็น 0 แถว และ `supabase/preflight/reconcile_fcd_foreign_events.sql` คืน 0 issue โดยไม่แตะ legacy-prod-source หรือเขียนข้อมูลใด ๆ
- [x] `FCD-907` lint, type-check, build, focused tests และ `git diff --check` ผ่านเมื่อ 2026-07-30: lint ไม่มี error (warnings เดิม 7 รายการนอกขอบเขต FCD), type-check และ production build ผ่าน; เพิ่ม `Suspense` wrapper ให้ FCD Ledger/Revaluation/Conversion ซึ่งอ่าน query string เพื่อแก้ production prerender failure. Focused FCD/UI contract tests 22/22 ผ่าน
- [x] `FCD-908` browser/API UAT เฉพาะเมื่อร้องขอ ครอบคลุม desktop/mobile และทุก event flow (2026-07-31)
  - SIT ตรวจยืนยัน `ACC01-002|USD` แสดงใน Receipt/FCD Ledger/Revaluation/Conversion options หลัง invalidate account reference cache.
  - Lifecycle จริงผ่าน: รับ `5 USD` ปิดบิล THB ด้วย rate `36.380`, revaluation ที่ `36.500`, conversion ได้ `182.00 THB` และ realized FX `-0.50`, แล้ว reverse conversion/revaluation และ cancel receipt.
  - Post-cleanup ยอด FCD กลับเป็น `0 USD / 0 THB`; เหลือเฉพาะ append-only reversal history ตาม contract. ไม่มี active test transaction ค้าง. UI smoke desktop/mobile และ API responses ผ่านโดยไม่พบ console error.
- [x] `FCD-909` promote ตามลำดับ feature branch -> dev -> SIT/UAT หลัง reconciliation ผ่าน: ทุก FCD checkpoint ถูก commit และ push ไป `new-origin/dev` กับ `sit-origin/main` ตาม target ที่สั่ง; migration `20260730210000`, `20260730220000` apply/record ครบ Dev/SIT. ไม่ promote customer UAT เพราะไม่มีคำสั่ง (2026-07-30)

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
| H | `FCD-801` ถึง `FCD-909` | reporting/release validation ครบ รวม financial-book projection, internal-transfer และ foreign-reader cutover; ไม่รวม GL ที่ยังไม่มี requirement |

## Explicit Non-goals For The First Implementation Batch

- ไม่สร้าง generic receipt ที่ไม่อ้างอิง Customer Receipt หรือ source document ที่อนุมัติ
- ไม่แก้ยอดหรือสกุลเงินของ Sales Bill เดิมเพราะ FX
- ไม่ผูก conversion กลับไปยัง Sales Bill รายใบ
- ไม่คำนวณ foreign amount ย้อนหลังจาก THB statement และ current FX rate
- ไม่ใช้ชื่อบัญชี, subtype, currency หลัก หรือ latest rate เพื่อเดาข้อมูล transaction ที่ขาด
- ไม่เก็บยอดตั้งต้นใน Account Master
- ไม่ post revaluation รายวัน
- ไม่แก้ posted ledger row โดยตรง
