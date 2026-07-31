# Receive Payment From The Customer Via Their FCD Account

Implementation checklist: [[FCD Foreign Receipt Implementation Task List]]

## ภาพรวม
กรณี `บิลขายออกเป็น THB` แต่ `ลูกค้าจ่ายมาเป็น USD` ในระบบควรแยกเป็น `3 เหตุการณ์บัญชี` อย่างชัดเจน

1. `รับเงินเพื่อปิดบิล`
2. `ตีมูลค่าเงินคงเหลือใน FCD สิ้นงวด`
3. `แลก USD จาก FCD เป็น THB จริง`

นี่คือแกนหลักของ flow ทั้งหมด และห้ามนำผลต่าง FX ไปแก้ยอดบิลขายเดิม

## หลักการสำคัญที่สุด
- `ปิดบิล` ใช้ `rate วันรับเงิน`
- `FCD คงเหลือปลายงวด` ใช้ `rate วันสิ้นเดือน`
- `แลกเงินจริง` ใช้ `rate` และ `amount` ที่เกิดขึ้นจริงวันแลก
- ต้องแยก `settlement`, `revaluation`, และ `conversion` ออกจากกันเสมอ
- FX ต้องไม่ย้อนกลับไปแก้ `ยอดบิลขายเดิม`

## การแยกประเภท FX เพื่อให้ audit ง่าย
ควรแยกบัญชีหรืออย่างน้อยแยก `transaction type` เป็น 3 แบบ

1. `FX gain/loss - AR settlement`
2. `FX gain/loss - FCD revaluation`
3. `FX gain/loss - FCD conversion`

## เหตุการณ์ที่ 1: รับเงินเพื่อปิดบิล

### แนวคิด
ตอนลูกค้าจ่ายเงินเข้ามา แม้เงินจะยังอยู่ในบัญชี `USD` และยังไม่ได้แลกเป็น `THB`
ระบบก็ควร `ปิดบิล ณ วันรับเงิน` ทันที

สรุปคือ ปิดบิลตอนรับเงินเลย ไม่ต้องรอให้มีการแลก USD เป็น THB จริงก่อน

### สิ่งที่ต้องเก็บ
- `บิลอ้างอิง`
- `สกุลเงินบิล`
- `สกุลเงินที่รับจริง`
- `ยอดที่ลูกค้าโอน` เช่น `100 USD`
- `อัตราแลกเปลี่ยนวันที่รับเงิน`
- `มูลค่าเงินบาทที่ใช้ปิดบิล`
- `ส่วนต่างจากบิล`
- `เหตุผลของส่วนต่าง`

### Logic
- ระบบต้องแปลงเงินรับเป็น `THB` ก่อน
- แล้วค่อยเทียบกับ `ยอดบิล`
- ถ้า `เท่าบิล` = `ปิดครบ`
- ถ้า `น้อยกว่า` = `ขาด`
- ถ้า `มากกว่า` = `เกิน`

### การจำแนกส่วนต่าง
- กรณีขาด/เกินจาก `rate`
  - ลง `FX gain/loss - AR settlement`
- กรณีขาดเพราะ `bank fee`
  - ลง `ค่าธรรมเนียมธนาคาร`
- กรณีเกินจริงเพราะ `ลูกค้าจ่ายเกิน`
  - ลง `เงินรับเกิน / รับล่วงหน้า`
- กรณีเป็น `ลดหนี้ / ส่วนลดหลังการขาย`
  - ลง `credit note / discount` แยก
  - ไม่ปนกับ `FX`

### สรุปของเหตุการณ์ที่ 1
- ปิดบิลตอนรับเงินเลย
- ใช้ `rate วันรับเงิน`
- เงินที่รับแต่ยังไม่แลก ให้เข้า `FCD`
- ไม่ต้องรอการแลกเงินจริง

## Approved RCP Form Flow

ลำดับฟอร์มที่อนุมัติสำหรับ `/sales/receipts` คือ:

1. เลือกวันที่รับเงิน
2. เลือกประเภทเอกสารต้นทางก่อน: `SB` หรือ `CADV`
3. เลือกสาขาและลูกค้า แล้วเลือกเอกสารต้นทางตามประเภทที่เลือก
4. เลือกสกุลเงินที่รับจริง โดยหนึ่ง `RCP` รับได้เพียงหนึ่งสกุลเงิน
5. เลือกวิธีรับเงินและบัญชีรับเงิน แล้วกรอกยอดที่ลูกค้าโอนในช่องจำนวนเงินหลังบัญชีรับ; ถ้าแบ่งรับหลายบัญชี ผลรวมทุกแถวคือยอดที่ลูกค้าโอน
6. ฟอร์มต้องไม่มีช่องยอดที่ลูกค้าโอนซ้ำด้านบน; native amount ของ RCP อ่านจากผลรวมบัญชีรับเพียงแหล่งเดียว
7. ถ้าไม่ใช่ `THB` ให้ระบบดึง `USD/THB` ล่าสุดจาก Google Finance เมื่อวันที่รับเงินเป็นวันปัจจุบัน, แสดงเวลา quote ใต้ช่อง rate และให้ผู้ใช้แก้ไขหรือกรอกเองได้เสมอ; วันที่อื่นหรือดึงไม่ได้ให้กรอก rate เอง
8. กรอก `Bank Fee (THB)` แยกจากยอดเงินต่างประเทศ
9. ตรวจ summary แล้วบันทึก

กฎของบัญชีรับเงิน:

- สกุล functional เลือกวิธีรับเงินจาก Payment Method Master ที่ active: `เงินสด` หรือ `เงินโอน`; จากนั้นเลือกบัญชี active ที่รองรับสกุลนั้นตามชนิดของวิธีรับเงิน
- สกุลต่างประเทศเลือกได้เฉพาะ `เงินโอน`; จากนั้นเลือกได้เฉพาะบัญชี `FCD` ที่รองรับสกุลนั้น
- สกุลต่างประเทศใช้ section บัญชีรับเงินเดียวกับสกุล functional แต่ส่ง option บัญชีเข้า component เฉพาะ FCD และส่งวิธีรับเงินกลุ่ม `bank` จาก master; service ตรวจซ้ำว่า foreign receipt ใช้วิธีรับเงินประเภทธนาคาร
- การกรองบัญชีใช้ `accounts.account_group` (`cash` หรือ `bank`) เป็น contract เดียวกันทั้ง UI และ server; `accounts.type` เป็นข้อความที่ legacy data อาจใช้แสดง เช่น `เงินสด (Cash)` จึงห้ามใช้ตัดสินชนิดบัญชี
- ห้ามแบ่ง RCP สกุลต่างประเทศไปบัญชีปกติ; ถ้ามีหลาย split ทุกบัญชีต้องเป็น FCD และใช้สกุลเดียวกับ RCP
- เมื่อแก้ไข RCP ต่างประเทศ ระบบต้อง cancel-and-reissue โดยใช้ currency, native split, rate และ rate date ที่เก็บใน RCP เดิมเป็นฐานของฟอร์มใหม่ ห้ามอ่าน `Bank Statement.amount_in` ซึ่งเป็น THB book amount มาใช้เป็นยอด native และห้ามใช้ current rate แทน snapshot เดิม
- การเปลี่ยนวันที่, ประเภทเอกสาร, ลูกค้า, สกุลเงิน หรือบัญชี ต้องล้าง dependent state และโหลด rate/options ใหม่จาก source จริง

Layout ของ foreign receipt รวม `สกุลเงินที่รับจริง`, `rate`, วิธีรับเงิน, บัญชี FCD, ยอดในแต่ละ split และ Bank Fee ไว้ใน section `บัญชี FCD ที่รับเงิน` เดียวกัน. `ยอดที่ลูกค้าโอน` ไม่มีช่องกรอกแยก แต่คำนวณจากผลรวมยอดหลังบัญชี FCD ทุกแถว เพื่อไม่ให้มี native amount สองแหล่ง. ถัดจากช่องยอด foreign ของแต่ละบัญชีแสดงมูลค่า functional currency จาก `ยอดแถวนั้น x rate` ในรูป `≈ 33,390.00 THB` โดยเป็นข้อมูลอ่านอย่างเดียว; ใช้ `≈` เพราะมีการแปลงสกุลเงินและปัดทศนิยม. Footer ของ section แสดงเฉพาะยอดเข้า FCD, ยอดตัดลูกหนี้, ยอดลูกหนี้คงเหลือพร้อมสถานะ และมูลค่าตามบัญชี FCD; แสดงกำไร FX เฉพาะเมื่อมากกว่า 0. ไม่แสดงยอดลูกค้าโอน/ผลต่าง reconciliation ซ้ำ เพราะ native amount มาจากผลรวม split แหล่งเดียว. สำหรับ Sales Bill กำไร FX คือส่วนบวกของ `Settlement THB - เงินสดที่ใช้ปิดบิล`; ไม่ใช่ยอดเงินรับล่วงหน้าอัตโนมัติและห้ามนำส่วนลดไปหักซ้ำในสูตร FX.

ส่วนลดของ Sales Bill กรอกครั้งเดียวที่ section บัญชีรับเงินทั้งสกุล functional และ foreign; ไม่แสดงช่องส่วนลดซ้ำในแต่ละบิลขาย. ก่อนบันทึก client กระจายยอดส่วนลดรวมไปยังบิลตามลำดับรายการและลด `ยอดเงินสดที่ต้องรับ` ของแต่ละบิลก่อน โดย `ยอดตัดลูกหนี้ = เงินสดที่ใช้ปิดบิล + ส่วนลด + ภาษีหัก ณ ที่จ่าย`. ถ้า Settlement THB ต่ำกว่ายอดเงินสดที่ต้องรับ ให้ตัดลูกหนี้เท่าที่รับได้และเหลือยอดลูกหนี้คงเหลือ; ส่วนขาดไม่ใช่ FX loss.

ความหมายของยอดที่ต้องไม่ปนกัน:

| Field | Currency | Meaning |
|---|---|---|
| ยอดที่ลูกค้าโอน | receipt currency | ผลรวมยอดในแถวบัญชี FCD ที่รับ เป็น canonical native amount เพียงแหล่งเดียวของ RCP และยอด native ที่เข้า FCD |
| Settlement THB | THB | `ยอดที่ลูกค้าโอน x rate วันรับเงิน` |
| เงินสดที่ใช้ปิดบิล | THB | ไม่เกินยอดเงินสดที่ต้องรับหลังใช้ส่วนลด; ถ้ารับไม่ครบใช้ Settlement THB เท่าที่มี |
| ยอดตัดลูกหนี้ | THB | `เงินสดที่ใช้ปิดบิล + ส่วนลด + ภาษีหัก ณ ที่จ่าย` |
| กำไร FX จากการปิดบิล | THB | `max(0, Settlement THB - เงินสดที่ใช้ปิดบิล)` |
| Bank Fee | THB | ค่าใช้จ่ายธนาคาร แยกจาก FX |
| ยอดที่บันทึกเข้า FCD | receipt currency | native amount ที่เพิ่มใน FCD subledger เช่น `1,000.00 USD` |
| Carrying THB | THB | `Settlement THB - Bank Fee`; มูลค่าตามบัญชีของยอด native ใน FCD ไม่ใช่ยอดเงินที่บันทึกแทน USD |

สำหรับ `SB` ให้คำนวณ `FX gain - AR settlement` จาก Settlement THB เทียบเงินสดที่ใช้ปิดบิล โดยไม่รวมส่วนลด, ภาษีหัก ณ ที่จ่าย หรือ Bank Fee เป็น FX. ถ้า Settlement THB ต่ำกว่าเงินสดที่ต้องรับ ให้เป็น partial receipt และไม่สร้าง FX loss. สำหรับ `CADV` ไม่มี AR settlement; ให้บันทึกยอด CADV เป็น THB และเก็บ native/rate/carrying facts ของเงินที่เข้า FCD แยกกัน.

## Live Rate API

- `GET /api/finance/foreign/live-fx-rate?currency=USD&date=YYYY-MM-DD` เป็น API กลางสำหรับ quote ล่าสุดจาก Google Finance ใน scope ปัจจุบัน
- API ไม่มี default rate และไม่มี provider สำรอง: เมื่อ Google Finance อ่านไม่ได้ หรือวันที่รับเงินไม่ใช่วันปัจจุบัน จะตอบ `manual_required` เพื่อให้ผู้ใช้กรอก rate เอง
- API ตอบ `quotedAt` เมื่อ Google Finance ส่งเวลา quote มา; ฟอร์มแสดงเวลานี้ใต้ช่อง rate แต่ rate ที่บันทึกเป็น transaction snapshot ของ RCP เสมอ
- Sale Plan ยังใช้ implementation เดิมใน batch นี้; จะย้ายมาเรียก API/service กลางภายหลังโดยไม่เปลี่ยน flow ของ RCP

หลังบันทึก ระบบธุรกิจหลักยังอ่านยอด THB เดิมของ Receipt และ Bank Statement (`amount_in/out`) ตาม contract เดิม โดย foreign receipt แปลง USD เป็น THB จาก rate snapshot ก่อนเขียนข้อมูล. `Settlement THB` ใช้ปิดบิล ส่วน `Carrying THB` หลังหัก Bank Fee เป็นยอดที่เขียนเข้าบัญชี FCD/BST เพียงครั้งเดียว. ข้อมูล USD และ rate ไม่ใช่ยอดที่นำไปบวกใน AR, Cash Position หรือรายงานรวม แต่ต้องเก็บเป็น FCD subledger/audit เพื่อทราบ native balance และ carrying THB ตอนแลกเงินจริง. `book_amount_*` เป็น mirror/check ของยอด THB สำหรับ write path ใหม่ ไม่ใช่เหตุให้ consumer เดิมต้องเปลี่ยน field. การแลกเงินใช้ยอดรวมแบบ moving weighted average ของบัญชี+สกุลเงิน จึงไม่ต้องให้ผู้ใช้เลือกว่ากำลังแลกเงินจากบิลใด.

## การวัดต้นทุน FCD ที่อนุมัติ

- functional currency ของบริษัทคือ `THB` และต้องอ่านจาก `finance_currency_policies` ที่อ้างอิง Currency Master ไม่ hardcode ใน transaction
- หน่วยต้นทุนคือ `FCD account + currency` เช่น บัญชี FCD A + USD ไม่ปนกับบัญชีอื่นหรือสกุลอื่น
- เมื่อรับเงินต่างประเทศ: เพิ่ม native amount และ carrying THB ของยอดเข้าจริงเข้า pool เดียวกัน แล้วคำนวณ weighted carrying rate ใหม่
- เมื่อแลกเงิน: ตัด carrying THB ออกเท่ากับ native amount ที่ถอน x weighted carrying rate ก่อนรายการ; เปรียบเทียบกับ THB จริงที่ได้รับเพื่อหา FX conversion gain/loss
- เมื่อ revalue สิ้นงวด: native balance ไม่เปลี่ยน แต่ carrying THB และ weighted carrying rate ของยอดคงเหลือถูกปรับจาก rate สิ้นงวด
- ยอดเงินและ FX rate ของ Customer Receipt คำนวณ/เก็บ/แสดง 2 ตำแหน่ง; DB decimal เดิมรองรับได้มากกว่าโดยไม่ต้องเปลี่ยน schema แต่ write path ของ RCP รับไม่เกิน 2 ตำแหน่ง

กฎนี้มีผลเฉพาะการถือ/แลกเงินใน FCD และไม่ย้อนกลับไปเปลี่ยน settlement FX หรือยอด Sales Bill ที่ปิดไปแล้ว.

## Current Code Boundary

ณ 2026-07-30 schema และ write path หลักของ flow ข้างต้นมีแล้ว แต่ consumer ที่เป็น list/print/notification ยังอยู่ระหว่างปรับ:

- Foreign `SB` receipt service เขียน RCP, AR allocation, Bank Statement และ FCD ledger ใน transaction เดียวแล้ว โดยคำนวณ settlement/carrying/bank fee แยกกัน
- Foreign `CADV` receipt service เขียน RCP, CADV allocation, Bank Statement และ FCD ledger ใน transaction เดียวกัน โดย settlement THB ต้องเท่ากับยอดตัด CADV และไม่สร้าง AR settlement FX หรือ overpayment อัตโนมัติ
- Conversion ใช้หน้า `/finance/foreign/fcd-conversions`: เลือก FCD account+currency, ยอด native, บัญชี functional-currency ปลายทาง, ยอดเข้าจริงหลัง fee และ bank reference; preview อ่าน native/carrying จาก FCD ledger ก่อน post. Service เขียน FCD out, destination in, conversion line และ internal-transfer marker ใน transaction เดียว; reversal จะ append counter-movements และคง original ledger ไว้
- Revaluation ใช้หน้า `/finance/foreign/fcd-revaluations`: เลือกงวด/สาขา/account+currency/rate type แล้วระบบค้นหา rate เฉพาะวันสิ้นงวด; ผู้ใช้แก้หรือกรอกเองได้พร้อมเหตุผล. Preview เป็น read-only จนกด post. Service post adjustment เฉพาะ carrying THB, ไม่เปลี่ยน native balance, และป้องกัน post ย้อนงวดเมื่อมี movement งวดถัดไปแล้ว
- `/finance/foreign/fcd-ledger` แสดง native, carrying THB และ daily valuation view จากวันที่/rate type ที่ผู้ใช้เลือก; ไม่พบ rate จะแสดงว่าไม่มีข้อมูลและไม่ใช้ latest/fallback rate
- `/finance/foreign/fx-gain-loss-report` รวม `AR settlement`, `FCD Conversion` และ `FCD Revaluation` เป็น transaction type แยกกัน. Conversion เป็น realized FX และ revaluation เป็น unrealized FX; การกรองประเภทไม่รวมสองชนิดโดยปริยาย
- ฟอร์ม create และ detail แสดง foreign audit ที่ persist แล้ว โดยแยก SB settlement FX ออกจาก CADV อย่างชัดเจน. History/print/LINE notification ยังใช้ field `amount`, `fee`, `net_amount` แบบ THB เดิม จึงต้องเปลี่ยนเป็น named book-amount contract ตาม [[FCD Foreign Receipt Implementation Task List]] ก่อนเปิด foreign receipt ให้ผู้ใช้
- ยังไม่มี GL posting engine; service เก็บ FX classification/fact ที่ต้องใช้ต่อ แต่ไม่สร้าง GL journal. คำว่า “post” ในสองหน้านี้หมายถึง post เข้า FCD subledger/Bank Statement ไม่ใช่ GL

## Downstream Impact

| Area | Impact |
|---|---|
| `/sales/receipts` create | กระทบตรง: เพิ่ม currency, native amount, rate snapshot, FCD account validation และ THB settlement summary |
| Receipt history/detail/print/LINE | กระทบตรง: list/KPI ใช้ THB; native amount และ rate แสดงเฉพาะ foreign audit detail |
| `/finance/bank` | กระทบตรง: statement ใช้ book THB เป็นยอดหลัก และเก็บ native/currency/rate เป็น audit/subledger |
| FCD ledger/dashboard | กระทบตรง: รับ native inflow และ carrying THB จาก RCP |
| `/finance/ar` | ตาราง/KPI/export หลักยังเป็น THB; detail ของ RCP foreign ต้องแสดง native/rate/settlement FX เพิ่ม |
| `/finance/ap` | ไม่กระทบจาก Customer Receipt โดยตรง; AP ยังคงเป็น THB |
| `/finance/cash-position` | กระทบตรง: ใช้ carrying THB ในตาราง/KPI; native balance ไปดูใน FCD ledger/หน้าแลกเงิน |
| dashboards/reports | ต้อง audit ทุก consumer ของ `customer_receipts`, `receipts`, `bank_statement` และ account balance ไม่ให้ตี native amount เป็น THB |

## เหตุการณ์ที่ 2: เงิน USD ที่ค้างอยู่ใน FCD

### แนวคิด
หลังจากรับเงินและปิดบิลแล้ว เงิน `USD` จะกลายเป็นสินทรัพย์คงเหลือในบัญชี `FCD`

ระบบควรแยกมุมมองออกเป็น 2 ชั้น

1. `2A ระหว่างเดือน / รายวัน`
2. `2B สิ้นเดือน`

## 2A ระหว่างเดือน / รายวัน

### สิ่งที่ระบบควรแสดงแบบ realtime
- `คงเหลือกี่ USD`
- `ถ้าใช้ rate ของวันนั้น จะคิดเป็นกี่ THB`
- `เพิ่ม/ลดจาก carrying amount เท่าไหร่`

### ความหมายทางบัญชี
- ส่วนนี้เป็น `valuation view / dashboard`
- ยัง `ไม่จำเป็นต้องลง GL ทุกวัน`

### สรุปของ 2A
- รายวัน = `ดูมูลค่าได้`
- เป็นการแสดงผลเพื่อการติดตาม
- ยังไม่ใช่การ post บัญชีจริง

## 2B สิ้นเดือน: FCD Revaluation

### แนวคิด
ตอนสิ้นเดือนต้องทำให้ `GL` สะท้อนมูลค่าเงินบาทของ `FCD` ตาม `rate สิ้นเดือน`

### ตัวอย่าง
- คงเหลือ `10,000 USD`
- rate สิ้นเดือน `36.50`
- GL ต้องแสดง `365,000 THB`
- ถ้า carrying amount เดิมอยู่ `362,000 THB`
- ต้องลงส่วนต่าง `3,000 THB` เป็น
  - `Unrealized FX Gain`
  - หรือ `Unrealized FX Loss`

### สรุปของ 2B
- รายวัน = ดูมูลค่าได้
- สิ้นเดือน = ค่อย `post GL` จริง

## เหตุการณ์ที่ 3: แลก USD จาก FCD เป็น THB จริง

### แนวคิด
นี่คืออีกเหตุการณ์หนึ่ง ไม่ใช่การปิดบิล

เกิดเมื่อ
- ถอน `USD` ออกจาก `FCD`
- แลกเป็น `THB`
- เงินเข้า `บัญชีธนาคารบาท`

### Logic
ต้องเปรียบเทียบ
- `มูลค่าตามบัญชีของ USD ที่ถอนออกจาก FCD`
- กับ `THB ที่ได้จริงจากการแลกในวันนั้น`

ส่วนต่างคือ
- `Realized FX Gain/Loss - FCD Conversion`

### สรุป
- นี่คือเหตุการณ์ `conversion`
- เป็นคนละเรื่องกับ `การปิด AR`
- และคนละเรื่องกับ `revaluation สิ้นเดือน`

## สิ่งที่ควรเป็นในระบบ
- ปิดบิลเมื่อรับ `USD` ได้เลย ณ วันรับเงิน
- เงินที่รับแต่ยังไม่แลก ให้เข้า `FCD`
- มูลค่า `FCD` ระหว่างเดือนแสดง realtime ได้
- ลง `GL` ของ FCD จริงตอน `สิ้นเดือน`
- ตอนแลกเงินจริง ค่อยลง `realized FX` อีกชุดหนึ่ง
- `ไม่ควรแก้บิลขายเดิมเพราะ FX`

## หน้าจอที่ควรมี

### 1. รับชำระต่างประเทศ
ใช้สำหรับ
- ปิดบิล
- รับเงินเข้าบัญชี `FCD`
- คำนวณ FX ตอน `settlement`

### 2. FCD Dashboard
ใช้ดู
- ยอด `USD` คงเหลือ
- `carrying THB`
- `THB` ตาม rate วันนี้
- `unrealized diff`
- ประวัติการเคลื่อนไหว

### 3. ปิดงวด FCD
ใช้สำหรับ
- post `revaluation` สิ้นเดือน
- บันทึก `unrealized FX` เข้า `GL`

### 4. แลกเงินต่างประเทศ
ใช้สำหรับ
- ถอนจาก `FCD`
- เลือกบัญชี `THB` ปลายทาง
- บันทึก `realized FX` จาก `conversion`

## แนวทางลดความซับซ้อนสำหรับผู้ใช้
ถ้าต้องการให้ user ใช้งานง่าย

user ใช้งานหลักแค่ `2 หน้า`

1. `รับเงินต่างประเทศ`
2. `แลกเงินต่างประเทศ`

ส่วนที่เหลือ
- `FCD Dashboard` เป็นหน้าแสดงผล
- `ปิดงวด FCD` เป็น batch รายเดือน

แบบนี้ใช้งานง่ายและบัญชียังถูกต้อง

## รายละเอียดเชิงระบบต่อเหตุการณ์

### เหตุการณ์ที่ 1: AR Settlement
สิ่งที่ระบบต้องทำ
- รับ reference ของบิล
- รับ `currency bill` และ `currency received`
- รับ `received amount`
- รับ `receipt date rate`
- แปลงเป็น `THB settlement amount`
- คำนวณส่วนต่างจากบิล
- บังคับเลือก `reason` ของส่วนต่าง

ผลลัพธ์ทางบัญชี
- ปิดลูกหนี้
- เกิด `FX gain/loss - AR settlement` ถ้าส่วนต่างมาจาก rate
- หรือเกิด posting ประเภทอื่นตาม reason

### เหตุการณ์ที่ 2: FCD Revaluation
สิ่งที่ระบบต้องทำ
- เก็บ `USD balance`
- เก็บ `carrying amount THB`
- ดึง `month-end rate`
- คำนวณ `revalued THB`
- คำนวณ `unrealized diff`

ผลลัพธ์ทางบัญชี
- ระหว่างเดือนแสดงบน dashboard ได้
- สิ้นเดือน post เข้า `GL` เป็น
  - `FX gain/loss - FCD revaluation`

### เหตุการณ์ที่ 3: FCD Conversion
สิ่งที่ระบบต้องทำ
- เลือกบัญชี `FCD ต้นทาง`
- เลือก `USD amount` ที่จะถอน
- รับ `rate / THB actual` วันที่แลก
- เลือกบัญชี `THB ปลายทาง`
- คำนวณส่วนต่างจาก carrying amount ของ USD ที่ถอน

ผลลัพธ์ทางบัญชี
- ลด `USD` ใน FCD
- เพิ่ม `THB` ในบัญชีปลายทาง
- บันทึก `FX gain/loss - FCD conversion`

## Rule สำคัญที่สุด
- `ปิดบิล` ใช้ `rate วันรับเงิน`
- `FCD คงเหลือปลายงวด` ใช้ `rate วันสิ้นเดือน`
- `แลกเงินจริง` ใช้ `rate / amount ที่เกิดขึ้นจริงวันแลก`

## ข้อสรุปสุดท้าย
ระบบควรทำงานแบบนี้

1. รับเงินต่างประเทศแล้ว `ปิดบิลทันที`
2. เงินที่รับเข้าไปเก็บใน `FCD`
3. ระบบแสดงมูลค่า `FCD` รายวันได้จาก `rate table`
4. สิ้นเดือนค่อย `revalue FCD` ลง `GL`
5. ตอนแลกเงินจริงค่อยบันทึก `conversion` และ `realized FX` อีกครั้ง
6. ห้ามเอา `FX` ไปแก้ยอดบิลขายเดิม
7. ต้องแยก `settlement / revaluation / conversion` ออกจากกันเสมอ
