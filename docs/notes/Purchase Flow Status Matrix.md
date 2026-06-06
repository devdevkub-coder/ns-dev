---
title: Purchase Flow Status Matrix
aliases:
  - Purchase Status Matrix
  - Purchase Step Status Matrix
  - Matrix สถานะ Flow ซื้อ
tags:
  - ns-scrap-erp
  - purchase
  - payment
  - status-matrix
  - business-flow
status: draft
created: 2026-06-06
updated: 2026-06-06
---

# Purchase Flow Status Matrix / Matrix สถานะ Flow ซื้อ

เอกสารนี้เป็น acceptance matrix สำหรับสถานะเอกสารใน flow ซื้อ ใช้คู่กับ [[Purchase Flow]] และ [[Payment Flow]]

หมายเหตุ ownership:

- [[Purchase Flow]] เป็นเจ้าของ `POB`, `WTI`, `PB`, stock effect, allocation, และ `PB/payable handoff`
- [[Payment Flow]] เป็นเจ้าของ `PMA`, `PMT`, approval queue, payment queue, payment history, void PMA, และ cancel PMT
- matrix นี้ใช้เช็ค end-to-end status ข้าม flow เท่านั้น ไม่ได้ย้ายรายละเอียด PMA/PMT กลับเข้า Purchase Flow

กติกากลาง:

- `ยังไม่อนุมัติ` คือ source queue จาก `PB / ADV / EXP` ยังไม่ใช่ `PMA`
- `PMA` เกิดตอนกด approve เท่านั้น และเก็บเฉพาะยอดที่อนุมัติจริง
- `PMT` ต้องจ่ายเต็ม PMA ที่เลือก ถ้าต้องจ่ายบางส่วนต้อง split ตั้งแต่ชั้น approve เป็น PMA ยอดย่อย
- เมื่อมี `PMA approved` อย่างน้อย 1 รายการ source document ต้อง lock field การเงินทั้งใบ
- void PMA ก่อนออก PMT หรือ cancel PMT ต้องส่งยอดกลับไป source pending candidate และต้องสร้าง PMA ใหม่ก่อนจ่ายใหม่
- Stock PB ที่เลือก WTI/summary เข้า draft แล้วต้องจัดสรรยอด remaining ของ WTI/summary ที่เลือกให้ครบก่อน save; ถ้า PO ไม่ครอบคลุมยอดที่เหลือต้องเป็น `Spot Buy` line ชัดเจน

## Use Case Matrix

| Use Case | สถานะ PO/WTI | สถานะ PB/source payable | สถานะ PMA | สถานะ PMT/Payment |
|---|---|---|---|---|
| `UC-PUR-01` Stock + PO | `POB` เริ่ม `เปิดอยู่`, หลัง WTI/PB allocation เป็น `ออกบิลบางส่วน` หรือ `ออกบิลแล้ว`; `WTI` เป็น `รับของแล้ว` -> `ออกบิลแล้วบางส่วน` หรือ `เสร็จสิ้น` | `PB` หลัง save เป็น source `ยังไม่อนุมัติ` ตามยอดสุทธิหลังหัก ADV | เมื่อ approve เกิด `PMA approved` ตามยอด split จริง; ยอด PB ที่เหลือยังเป็น source `ยังไม่อนุมัติ` | `PMT` จ่ายเต็ม PMA ที่เลือกแล้วเป็น `เสร็จสิ้น`; ถ้า cancel PMT ยอดกลับไป source `ยังไม่อนุมัติ` |
| `UC-PUR-02` Stock + Spot / No PO | ไม่มี PO; `WTI` เป็น `รับของแล้ว` -> `ออกบิลแล้วบางส่วน` หรือ `เสร็จสิ้น` | `PB` เป็น source `ยังไม่อนุมัติ` ตามยอดสุทธิ | `PMA approved` ตามยอดที่อนุมัติจริง | `PMT เสร็จสิ้น` หรือ `PMT ยกเลิกแล้ว` แล้วกลับไปรออนุมัติใหม่ |
| `UC-PUR-03` Trading + PO | `POB` เริ่ม `เปิดอยู่`, หลัง PB trading allocation เป็น `ออกบิลบางส่วน` หรือ `ออกบิลแล้ว`; ไม่มี WTI | `PB` trading เป็น source `ยังไม่อนุมัติ` | `PMA approved` ตามยอด split | `PMT` ต้องจ่ายเต็ม PMA ที่เลือก |
| `UC-PUR-04` Trading + Spot | ไม่มี PO และไม่มี WTI | `PB` trading spot เป็น source `ยังไม่อนุมัติ` | `PMA approved` ตามยอด split | `PMT` ต้องจ่ายเต็ม PMA ที่เลือก |
| `UC-PUR-05` ปิด PO ส่งของไม่ครบ | `POB` จาก `เปิดอยู่/ออกบิลบางส่วน` เป็น `ปิดรับไม่ครบ`; WTI/PB ที่เกิดแล้วไม่ถูกแก้ย้อนหลัง | PB ที่เกิดก่อนปิด short คงสถานะจ่ายตามจริง; ยอด PO ที่ปิดไม่เข้า payable | ไม่มี PMA ใหม่จากยอด PO ที่ปิด short | ไม่มี PMT จากยอดที่ถูก short close |
| `UC-PUR-06` WTI 1 ใบตัดหลาย PO | WTI เดียวเป็น `รับของแล้ว` แล้วเปลี่ยนตามยอดที่ถูกออกบิล; PO แต่ละใบเป็น `ออกบิลบางส่วน/ออกบิลแล้ว` ตาม allocation | PB ที่รวม allocation เป็น source `ยังไม่อนุมัติ` | PMA เกิดตามยอด PB ที่ approve จริง | PMT จ่ายเต็ม PMA ที่เลือก |
| `UC-PUR-07` PO 1 ใบถูกตัดจากหลาย WTI | PO ค้าง `เปิดอยู่/ออกบิลบางส่วน` จน WTI/PB allocation ครบจึงเป็น `ออกบิลแล้ว` | แต่ละ PB เป็น source payable ของตัวเอง | แต่ละรอบ approve สร้าง PMA ของยอดที่อนุมัติจริง | PMT จ่ายเต็ม PMA; หลาย PMA รวมจ่ายได้ถ้า supplier เดียวกัน |
| `UC-PUR-08` WTI เดียวมี PO + Spot | WTI สถานะตามยอดรวมที่ถูกออกบิล; PO portion ตัด PO, Spot portion ไม่แตะ PO | PB source เป็น `ยังไม่อนุมัติ` หลัง save | PMA split ได้ตามยอดสุทธิของ PB | PMT จ่ายเต็ม PMA ที่เลือก |
| `UC-PUR-09` เปลี่ยน WTI/สาขา/ผู้ขายกลางทาง | ก่อน save เป็น draft ไม่มีสถานะเอกสาร; หลัง save WTI/PB ใช้สถานะตาม flow จริง | ถ้า PB ยังไม่มี PMA approved แก้ source ได้; ถ้ามี PMA approved แล้ว lock field การเงินทั้งใบ | ไม่มี PMA จนกว่าจะ approve | ไม่มี PMT จนกว่าจะ approve และทำจ่าย |
| `UC-PUR-10` ดึงราคา PO อัตโนมัติ | PO ยัง `เปิดอยู่/ออกบิลบางส่วน` จน PB save ตัดยอด | PB source ใช้ราคา PO ที่ล็อกไว้ใน line; หลัง save เป็น `ยังไม่อนุมัติ` | PMA snapshot ใช้ยอดที่ approve จริงจาก PB ปัจจุบัน | PMT จ่ายเต็ม PMA |
| `UC-PUR-11` ส่วนลดท้ายบิลเท่านั้น | PO/WTI สถานะตาม allocation; ส่วนลดไม่เปลี่ยนยอดรับจริง | PB source ยอดสุทธิหลังส่วนลดท้ายบิลเข้า queue `ยังไม่อนุมัติ` | PMA approved จากยอดสุทธิที่อนุมัติ | PMT จ่ายเต็ม PMA; ส่วนลดไม่ลด WAC/Cost Pool |
| `UC-PUR-12` Stock purchase ลง stock ledger | WTI/PB allocation สำเร็จแล้ว stock ledger ถูกบันทึก | PB source เข้า queue `ยังไม่อนุมัติ`; stock movement เป็นผลของ PB stock ไม่ใช่ผลของ PMA | PMA ไม่กระทบ stock ledger | PMT กระทบเงินจ่ายเท่านั้น ไม่กระทบ stock ledger |
| `UC-PUR-13` Trading purchase ไม่ลง stock | PO ถ้ามีถูกตัดตาม PB trading; ไม่มี WTI/stock ledger | PB trading เป็น source `ยังไม่อนุมัติ` | PMA approved ตามยอด split | PMT จ่ายเต็ม PMA |
| `UC-PUR-14` อนุมัติและจ่ายเงินจริง | source ที่มียอดค้างอยู่ `ยังไม่อนุมัติ` | ยอดที่ยังไม่อนุมัติคงอยู่กับ source | approve 1 ครั้งสร้าง PMA 1..n rows ตามยอด split; source balance ที่เหลือยัง pending | PMT รวมหลาย PMA ของ supplier เดียวกันได้ แต่ต้องจ่ายเต็มทุก PMA line |

## Step Pattern Matrix

| Step pattern | ใช้กับ use case | สถานะ PO/WTI | สถานะ source payable | สถานะ PMA | สถานะ PMT |
|---|---|---|---|---|---|
| สร้าง PO Buy | `UC-PUR-01`, `UC-PUR-03`, `UC-PUR-05`, `UC-PUR-06`, `UC-PUR-07`, `UC-PUR-08`, `UC-PUR-10`, `UC-PUR-11`, `UC-PUR-12`, `UC-PUR-13` | `POB = เปิดอยู่` | ไม่มี source payable | ไม่มี | ไม่มี |
| ปิด PO ส่งของไม่ครบ | `UC-PUR-05` | `POB = ปิดรับไม่ครบ`; WTI/PB ที่เกิดแล้วคงสถานะเดิม | ไม่สร้างยอด payable จากส่วนที่ short close | ไม่มี PMA ใหม่จากยอด short close | ไม่มี PMT จากยอด short close |
| บันทึก WTI | `UC-PUR-01`, `UC-PUR-02`, `UC-PUR-06`, `UC-PUR-07`, `UC-PUR-08`, `UC-PUR-09`, `UC-PUR-12` | `WTI = รับของแล้ว`; PO ยังไม่ถูกตัดจนกว่า PB save | ไม่มี source payable จาก WTI อย่างเดียว | ไม่มี | ไม่มี |
| บันทึก ADV | use case ที่มีมัดจำก่อน PB | PO ถ้ามีคงสถานะเดิม | `ADV = source ยังไม่อนุมัติ` | ไม่มีจนกว่าจะ approve | ไม่มี |
| อนุมัติ ADV | use case ที่มีมัดจำก่อน PB | PO ถ้ามีคงสถานะเดิม | ADV locked ตามยอดที่อนุมัติ; ยอด ADV ที่ยังไม่ approve ยังเป็น source pending | `PMA approved` ตาม split amount | ไม่มี |
| จ่าย ADV | use case ที่มีมัดจำก่อน PB | PO ถ้ามีคงสถานะเดิม | ADV ถูก settle ตาม PMA ที่จ่าย; ถ้ามียอดเหลือต้องกลับไป approve ใหม่ | PMA ที่เลือกถูก consumed/paid | `PMT = เสร็จสิ้น` และต้องจ่ายเต็ม PMA |
| บันทึก PB Stock/Trading | `UC-PUR-01`..`UC-PUR-14` ที่ออก PB | PO/WTI ถูกตัดตาม allocation; WTI ที่เลือกครบในบิลใหม่เป็น `เสร็จสิ้น`, หรือยังเป็น `ออกบิลแล้วบางส่วน` เฉพาะกรณีมี active usage เดิมที่ยังเหลือ; PO เป็น `ออกบิลบางส่วน` หรือ `ออกบิลแล้ว` | `PB = เปิดอยู่`; payment status = `ยังไม่อนุมัติ` ถ้ายอดสุทธิหลังหัก ADV > 0, หรือ `เสร็จสิ้น` ถ้า ADV ตัดเต็ม | ไม่มีสำหรับยอด PB จนกว่าจะ approve | ไม่มี |
| แก้ source ก่อนอนุมัติ | `PB / ADV / EXP` ทุกแบบ | PO/WTI recalc ตาม write path ที่ถูกต้อง | แก้ได้เฉพาะเมื่อยังไม่มี `PMA approved` หรือ `PMT active`; pending queue อ่าน source ล่าสุด | ไม่มี | ไม่มี |
| ยกเลิก source ก่อนอนุมัติ | `PB / ADV / EXP` ทุกแบบ | PO/WTI/stock/ADV allocation ต้อง reverse ตาม source type | source = `ยกเลิก`; หายจาก pending queue | ไม่มี | ไม่มี |
| อนุมัติ source บางส่วน | `UC-PUR-14` และทุก source ที่จ่ายบางส่วน | PO/WTI ไม่เปลี่ยนจากการ approve | source ยังมี pending balance แต่ financial fields ถูก lock ทั้งใบ | `PMA approved` 1..n rows ตามยอด split ที่ approve | ไม่มี |
| อนุมัติ source เต็มยอด | `UC-PUR-14` และทุก source ที่อนุมัติเต็ม | PO/WTI ไม่เปลี่ยนจากการ approve | source ไม่มี remaining approval balance แต่ยังไม่ใช่ payment เสร็จ | `PMA approved` ครอบคลุมยอด payable | ไม่มี |
| Void PMA ก่อนออก PMT | PMA approved ที่ยังไม่ถูกจ่าย | PO/WTI ไม่เปลี่ยน | ยอด PMA ที่ void กลับไปเป็น source `ยังไม่อนุมัติ`; source ยังใช้ข้อมูลปัจจุบันสำหรับ approve รอบใหม่ | PMA เดิม = `voided`/audit เท่านั้น ไม่ reuse | ไม่มี |
| ทำจ่าย PMA | PMA approved ทุกแบบ | PO/WTI ไม่เปลี่ยนจากการจ่าย | source ลด payable balance ตาม PMA ที่จ่าย; ถ้ายอด source ยังเหลือให้แสดง `ชำระบางส่วน`, ถ้าครบให้ `เสร็จสิ้น` | PMA ที่เลือกถูก consumed/paid | `PMT = เสร็จสิ้น`; ต้องจ่ายเต็มทุก PMA ที่เลือก |
| ยกเลิก PMT | PMT ที่จ่ายจริงแล้ว | PO/WTI ไม่เปลี่ยนจากการ cancel PMT | ยอดที่ reverse กลับไป source `ยังไม่อนุมัติ`; ถ้าจะจ่ายใหม่ต้อง approve ใหม่ | PMA เดิมจบ cycle เป็น audit/history ห้าม reuse | `PMT = ยกเลิกแล้ว` |

## ADV Before PB

| ขั้นตอน | สถานะ ADV/source | สถานะ PMA | สถานะ PMT | สถานะ PB ที่เกี่ยวข้อง | หมายเหตุ |
|---|---|---|---|---|---|
| บันทึก ADV | `ADV = ยังไม่อนุมัติ` ใน source pending queue | ไม่มี | ไม่มี | ยังไม่มี PB หรือ PB ยังไม่ถูก allocate ADV | pending tab แสดง `ADV` เป็นเลขหลัก |
| อนุมัติ ADV บางส่วน | ADV ยังมี pending balance ถ้าอนุมัติไม่ครบ | `PMA approved` ตามยอด split | ไม่มี | ยังไม่กระทบ PB จนกว่าจะจ่ายและ allocate | source financial fields ของ ADV ถูก lock ตาม rule PMA approved |
| อนุมัติ ADV เต็มยอด | ADV ไม่มี remaining approval balance | `PMA approved` ครอบคลุมยอด ADV | ไม่มี | ยังไม่กระทบ PB จนกว่าจะจ่ายและ allocate | approved tab แสดง `PMA` เป็นเลขหลักและ `ADV` เป็น reference |
| จ่าย ADV | ADV ถูก settle ตาม PMA ที่จ่าย | PMA ถูก consumed/paid | `PMT = เสร็จสิ้น` | ยังไม่มี PB หรือรอ allocate เข้า PB ภายหลัง | PMT ต้องจ่ายเต็ม PMA ที่เลือก |
| Allocate ADV เข้า PB | ADV available balance ลดลงตาม allocation | ไม่เปลี่ยน | ไม่เปลี่ยน | PB ยอดสุทธิลดลง; ถ้าหักเต็มให้ PB payment status = `เสร็จสิ้น`, ถ้ายังเหลือให้ `ยังไม่อนุมัติ` | ห้าม allocate ADV เกินยอดจ่ายจริงที่ยัง available |
| Void PMA ก่อน PMT | ยอด PMA กลับไปเป็น ADV source pending | PMA เดิมเป็น audit/history | ไม่มี | ไม่กระทบ PB | ต้อง approve ใหม่เพื่อสร้าง PMA ใหม่ |
| Cancel PMT ของ ADV | ยอดที่ reverse กลับเป็น ADV source pending | PMA เดิมจบ cycle ห้าม reuse | `PMT = ยกเลิกแล้ว` | ถ้า ADV ถูก allocate เข้า PB แล้วต้อง reverse allocation ตาม policy ก่อนใช้ใหม่ | ต้อง approve ADV ใหม่ก่อนจ่ายใหม่ |

## Flow Stock + PO

| Step | POB | WTI | ADV | PB/source payable | PMA / PMT |
|---|---|---|---|---|---|
| 1 สร้าง PO | `เปิดอยู่` | ไม่มี | ไม่มี | ไม่มี | ไม่มี |
| 2 บันทึก ADV optional | `เปิดอยู่` | ไม่มี | `ยังไม่อนุมัติ` ใน source queue | ไม่มี | ไม่มีจนกว่า approve ADV |
| 3 Supplier ส่งของ | `เปิดอยู่` | ไม่มี | ตาม ADV lifecycle ถ้ามี | ไม่มี | ไม่มี |
| 4 บันทึก WTI | `เปิดอยู่` | `รับของแล้ว` | ตาม ADV lifecycle ถ้ามี | ไม่มี | ไม่มี |
| 5 สร้าง Draft PB | `เปิดอยู่` | `รับของแล้ว` | ตาม ADV lifecycle ถ้ามี | Draft เท่านั้น | ไม่มี |
| 6 Lock context ใน Draft | `เปิดอยู่` | `รับของแล้ว` | ตาม ADV lifecycle ถ้ามี | Draft locked context | ไม่มี |
| 7 Allocate WTI เข้า PO/Spot | ยังไม่ตัดจนกว่าจะ save PB | ยังไม่ตัดจนกว่าจะ save PB | ตาม ADV lifecycle ถ้ามี | Draft allocation ต้องครบยอด WTI/summary ที่เลือก; residual หลัง PO ต้องเป็น Spot Buy | ไม่มี |
| 8 ดึงราคา PO | `เปิดอยู่` | `รับของแล้ว` | ตาม ADV lifecycle ถ้ามี | Draft line ใช้ราคา PO/Spot | ไม่มี |
| 9 เลือก ADV หักบิล | `เปิดอยู่` | `รับของแล้ว` | ADV available ถูกจองใน draft เท่านั้น | Draft payable net ถูกคำนวณ | ไม่มี |
| 10 Save PB | รอ recalc จาก allocation | รอ recalc จาก allocation | ADV allocation บันทึกจริงถ้ามี | `เปิดอยู่` หรือ payment status `เสร็จสิ้น` ถ้า ADV ตัดเต็ม | ไม่มีสำหรับยอด PB ที่ยังไม่ approve |
| 11 Recalc WTI | ไม่เปลี่ยนใน step นี้ | `เสร็จสิ้น` สำหรับ WTI/summary ที่เลือกครบใน PB ใหม่นี้; `ออกบิลแล้วบางส่วน` เหลือใช้กับ active usage เดิม/ข้อมูลก่อน rule ใหม่ | ไม่เปลี่ยน | `เปิดอยู่` หรือ `เสร็จสิ้น` | ไม่มี |
| 12 Recalc PO | `ออกบิลบางส่วน` หรือ `ออกบิลแล้ว` | ตาม step 11 | ไม่เปลี่ยน | `เปิดอยู่` หรือ `เสร็จสิ้น` | ไม่มี |
| 13 Stock ledger | ตาม step 12 | ตาม step 11 | ไม่เปลี่ยน | `เปิดอยู่` หรือ `เสร็จสิ้น` | ไม่มี |
| 14 Approve PB payable | ไม่เปลี่ยน | ไม่เปลี่ยน | ไม่เปลี่ยน | financial fields locked; source balance ที่เหลือยัง `ยังไม่อนุมัติ` | `PMA approved` ตาม split amount |
| 15 ทำจ่าย | ไม่เปลี่ยน | ไม่เปลี่ยน | ไม่เปลี่ยน | payable balance รอ recalc | `PMT = เสร็จสิ้น`; PMA ถูก consumed/paid |
| 16 Recalc PB payment | ไม่เปลี่ยน | ไม่เปลี่ยน | ไม่เปลี่ยน | `ชำระบางส่วน` หรือ `เสร็จสิ้น` | PMT อยู่ใน history เป็น `เสร็จสิ้น` |
| 17 Cancel PB ถ้า guard ผ่าน | PO/WTI recalc จาก active PB ที่เหลือ | PO/WTI recalc จาก active PB ที่เหลือ | ADV allocation ถูกคืนตาม policy | `ยกเลิก` | ต้องไม่มี active PMA/PMT cycle |

## Flow Stock + Spot

| Step | WTI | PB/source payable | PMA | PMT | หมายเหตุ |
|---|---|---|---|---|---|
| 1 Supplier ส่งของ | ไม่มี | ไม่มี | ไม่มี | ไม่มี | เริ่มจากหน้างาน ไม่มี PO |
| 2 บันทึก WTI | `รับของแล้ว` | ไม่มี | ไม่มี | ไม่มี | WTI เป็น source ของน้ำหนักเข้า stock |
| 3 Save PB จาก WTI | รอ recalc | `PB = เปิดอยู่`; payment status = `ยังไม่อนุมัติ` | ไม่มี | ไม่มี | ตั้ง AP จากยอด WTI ที่ออกบิล |
| 4 Recalc WTI | `เสร็จสิ้น` สำหรับ WTI ที่เลือกครบในบิลนี้ | `เปิดอยู่` / `ยังไม่อนุมัติ` | ไม่มี | ไม่มี | บิลใหม่ห้าม save ถ้า WTI/summary ที่เลือกยังจัดสรรไม่ครบ |
| 5 Stock ledger | ไม่เปลี่ยน | ไม่เปลี่ยน | ไม่มี | ไม่มี | stock movement เกิดจาก PB stock ไม่ใช่ PMA/PMT |
| 6 Approve PB | ไม่เปลี่ยน | source financial fields locked; source balance ที่เหลือยัง `ยังไม่อนุมัติ` | `PMA approved` ตาม split amount | ไม่มี | ถ้า approve บางส่วน PB ยังมี pending balance |
| 7 ทำจ่าย | ไม่เปลี่ยน | payable balance รอ recalc | PMA ถูก consumed/paid | `PMT = เสร็จสิ้น` | PMT ต้องจ่ายเต็ม PMA ที่เลือก |
| 8 Recalc PB payment | ไม่เปลี่ยน | `ชำระบางส่วน` หรือ `เสร็จสิ้น` | ตาม PMA consumed/paid | PMT อยู่ใน history | ยอดที่ยังไม่อนุมัติกลับไป pending source queue |

## Flow Trading + PO

| Step | POB | WTI | ADV | PB/source payable | PMA / PMT |
|---|---|---|---|---|---|
| 1 สร้าง PO Trading | `เปิดอยู่` | ไม่มี | ไม่มี | ไม่มี | ไม่มี |
| 2 บันทึก ADV optional | `เปิดอยู่` | ไม่มี | `ยังไม่อนุมัติ` ใน source queue | ไม่มี | ไม่มีจนกว่า approve ADV |
| 3 ระบุ Trading + PO | `เปิดอยู่` | ไม่มี | ตาม ADV lifecycle ถ้ามี | ไม่มี | ไม่มี |
| 4 Save PB Trading | `ออกบิลบางส่วน` หรือ `ออกบิลแล้ว` ตาม allocation | ไม่มี | ADV allocation บันทึกจริงถ้ามี | `PB = เปิดอยู่`; payment status = `ยังไม่อนุมัติ` หรือ `เสร็จสิ้น` ถ้า ADV ตัดเต็ม | ไม่มีสำหรับยอด PB ที่ยังไม่ approve |
| 5 No stock movement | ไม่เปลี่ยน | ไม่มี | ไม่เปลี่ยน | ไม่เปลี่ยน | ไม่มี |
| 6 Ready for matching | ไม่เปลี่ยน | ไม่มี | ไม่เปลี่ยน | PB พร้อมจับคู่ Trading | ไม่มี |
| 7 Approve PB payable | ไม่เปลี่ยน | ไม่มี | ไม่เปลี่ยน | financial fields locked; source balance ที่เหลือยัง `ยังไม่อนุมัติ` | `PMA approved` ตาม split amount |
| 8 ทำจ่าย | ไม่เปลี่ยน | ไม่มี | ไม่เปลี่ยน | payable balance รอ recalc | `PMT = เสร็จสิ้น`; PMA ถูก consumed/paid |
| 9 Recalc PB payment | ไม่เปลี่ยน | ไม่มี | ไม่เปลี่ยน | `ชำระบางส่วน` หรือ `เสร็จสิ้น` | PMT อยู่ใน history เป็น `เสร็จสิ้น` |

## Flow Trading + Spot

| Step | PO | WTI | PB/source payable | PMA | PMT |
|---|---|---|---|---|---|
| 1 ระบุ Trading + Spot | ไม่มี | ไม่มี | ไม่มี | ไม่มี | ไม่มี |
| 2 Save PB Trading Spot | ไม่มี | ไม่มี | `PB = เปิดอยู่`; payment status = `ยังไม่อนุมัติ` | ไม่มี | ไม่มี |
| 3 No stock movement | ไม่มี | ไม่มี | ไม่เปลี่ยน | ไม่มี | ไม่มี |
| 4 Ready for matching | ไม่มี | ไม่มี | PB พร้อมจับคู่ Trading | ไม่มี | ไม่มี |
| 5 Approve PB | ไม่มี | ไม่มี | financial fields locked; source balance ที่เหลือยัง `ยังไม่อนุมัติ` | `PMA approved` ตาม split amount | ไม่มี |
| 6 ทำจ่าย | ไม่มี | ไม่มี | payable balance รอ recalc | PMA ถูก consumed/paid | `PMT = เสร็จสิ้น` |
| 7 Recalc PB payment | ไม่มี | ไม่มี | `ชำระบางส่วน` หรือ `เสร็จสิ้น` | ตาม PMA consumed/paid | PMT อยู่ใน history |

## Exception Matrix

| เหตุการณ์ | Source document | PMA | PMT | Queue/page ที่ต้องเห็น | Rule |
|---|---|---|---|---|---|
| source ถูกแก้ก่อน approve | source current state เปลี่ยน | ไม่มี | ไม่มี | `/daily/payment-approval` pending ต้องสะท้อน source ล่าสุด | อนุญาตเฉพาะก่อนมี PMA approved |
| source ถูก cancel ก่อน approve | source = `ยกเลิก` | ไม่มี | ไม่มี | หายจาก pending queue | ต้อง reverse source effects ตาม type |
| source มี PMA approved แล้ว | source financial fields locked | `approved` | ไม่มีหรือมี | approved tab และ `/purchase/payments` | ห้ามแก้ field ที่กระทบยอด/คู่ค้า/ภาษี/allocation |
| void PMA ก่อน PMT | ยอดกลับไป source pending candidate | PMA เดิมเป็น audit/history | ไม่มี | pending tab เห็น source balance ใหม่ | ห้าม reuse PMA เดิม |
| cancel PMT | ยอด reverse กลับ source pending candidate | PMA เดิมจบ cycle | `PMT = ยกเลิกแล้ว` | history เห็น PMT cancelled, pending tab เห็น source balance | ต้อง approve ใหม่ก่อนจ่ายใหม่ |
| PMT จ่ายไม่เต็ม PMA | ไม่อนุญาต | ไม่อนุญาตให้ consumed/paid | ห้ามสร้าง PMT | ต้องแสดง validation error | partial payment ต้องเกิดจาก PMA split เท่านั้น |
