---
title: Production Flow
aliases:
  - Flow การผลิต
  - Production Module Flow
  - หมวดการผลิต
tags:
  - ns-scrap-erp
  - production
  - stock
  - business-flow
  - page-flow
status: draft
created: 2026-06-11
updated: 2026-06-13
---

# Production Flow / Flow หมวดการผลิต

## Scope

เอกสารนี้เป็น canonical flow ของหมวด `การผลิต` ใน active Next app

Routes ปัจจุบัน:

| Page | Route | API | Current status |
|---|---|---|---|
| ใบสั่งผลิต | `/production/orders` | `GET /api/production/orders` | read baseline |
| หมวดหมู่ผลผลิต | `/production/output-categories` | `GET/POST /api/production/output-categories`, `PATCH /api/production/output-categories/[id]` | master baseline |
| Production Dashboard | `/production/dashboard` | `GET /api/production/dashboard` | read baseline |
| รายงานการผลิต / Yield | `/production/report` | `GET /api/production/report` | read baseline |

Production menu must expose only the four pages above. Legacy/supporting production report surfaces such as `/production/production-cost-report`, `/production/yield-loss-report`, `/production/machine-utilization`, `/production/reconciliation`, and retired `/production/wip-report` must not be exposed in the Production navigation. Their formulas can be used as source material or internal/supporting APIs where still needed, but they are not user-facing pages in the target Production menu.

## Business Purpose

Production flow ใช้เมื่อเอาวัตถุดิบหรือ stock เดิมเข้าเครื่อง/กระบวนการผลิต แล้วได้ผลลัพธ์เป็น:

- สินค้าสำเร็จรูป `FG`
- วัตถุดิบที่ได้กลับมา `RM`
- สูญเสีย/ของเสีย `LOSS`

หมวดนี้กระทบ stock มากกว่าหน้ารายงานทั่วไป เพราะมีทั้ง:

- ตัดวัตถุดิบออกจากคลังจริง
- ย้ายของเข้า WIP
- ตัด WIP ออกตอนรับผลผลิต
- รับ FG/RM กลับเข้าคลัง
- บันทึก loss/yield

## Production Report / Yield Requirement

`/production/report` ใช้วิเคราะห์ผลผลิตจริงเทียบกับวัตถุดิบที่ใช้ เพื่อวัด efficiency โรงงานและ detect production loss.

สูตรหลัก:

```text
Yield % = Output Qty / Input Qty * 100
```

ตัวอย่าง:

```text
Input 1,000 kg
Output 920 kg
Yield = 920 / 1,000 * 100 = 92%
```

สูตรต้นทุนที่ต้องแยกชื่อให้ชัด:

| Metric | Formula | Meaning |
|---|---|---|
| `RM บาท/กก.` | `RM Cost / Input Qty` | ต้นทุนวัตถุดิบต่อกก. ที่ใช้คิดมูลค่า loss |
| `ต้นทุนผลิต บาท/กก.` | `Total Production Cost / Output Qty` | ต้นทุนผลิตต่อผลผลิตดี |
| `Loss Value (บาท)` | `Loss Qty * RM บาท/กก.` | มูลค่า loss จากน้ำหนัก loss คูณต้นทุนวัตถุดิบต่อกก. |
| `Total Production Cost` | `RM Cost + Process Cost` | ต้นทุนรวมของใบสั่งผลิต |

Requirement จาก legacy และ customer screenshot 2026-06-13:

- KPI ต้องมีใบสั่งผลิต, วัตถุดิบรวม, ผลผลิตรวม, Loss รวม, Yield %, ต้นทุนผลิตรวม, และ `Loss Value (บาท)`
- KPI ไม่ควรมี `บาท/กก. เฉลี่ย` เพราะทำให้สับสนระหว่าง `RM/Input` กับ `Total/Output`
- `WIP คงเหลือ` ยังคงแสดงเป็น section ใน Production Report ได้ แม้ standalone `/production/wip-report` ถูก retire แล้ว
- `ผลผลิตแยกตามสินค้า` ต้องมาจาก actual output product ที่รับเข้า stock ของบริษัท และไม่รวม loss
- ตารางรายละเอียดใบสั่งผลิตเป็น source สำหรับ CSV export
- ถ้า ledger/source facts ไม่ครบ ต้องแสดง reconciliation/audit signal หรือแก้ data/migration/write path; ห้าม fallback เป็นค่า default หรือใช้ stale order total แทน

## Production Dashboard Requirement

`/production/dashboard` ใช้ monitor ภาพรวมการผลิต เช่น output, WIP, yield, loss, abnormal signal, และ machine efficiency. หน้านี้เป็น read-only dashboard และต้องไม่สร้าง/แก้ production transaction หรือ stock ledger.

Requirement ล่าสุดจาก customer screenshot 2026-06-13:

| Dashboard metric | Target meaning |
|---|---|
| `ใบสั่งผลิต` | จำนวน production orders ในช่วง filter |
| `ผลิตได้` | output qty ที่รับเข้า stock จริง ไม่รวม loss |
| `WIP คงเหลือ` | WIP balance จาก PI/PO2 ledger ไม่ใช่ status count |
| `Yield %` | `Output Qty / Input Qty * 100` |
| `Loss %` | `Loss Qty / Input Qty * 100` |
| `Top 10 สินค้าที่ผลิตมากสุด` | group actual output product rows ที่รับเข้า stock ไม่รวม loss |
| `Machine Utilization - รอบที่ใช้` | count active production output receipt rows ไม่รวม loss |
| `Machine Utilization - น้ำหนักผลิต` | sum output qty ของเครื่อง ไม่รวม loss |

สำคัญ: `รอบที่ใช้` บน Production Dashboard ต้องไม่ใช้ count production orders. Legacy มีสองความหมาย:

- `view-productionDashboard` นับ `batches` จาก production output rows; ตรงกับรูป requirement ล่าสุดที่ระบุ count output รับผลผลิต.
- `view-machineUtil` นับ `orderCount` จาก production orders; เป็นรายงาน utilization เต็ม ไม่ใช่ความหมายของ dashboard `รอบที่ใช้`.

ถ้าต้องแสดงทั้งสองค่า ให้แยก field/label:

```text
machineUtil.batches = count active non-loss output receipt rows
machineUtil.orderCount = count distinct production orders
machineUtil.outputQty = sum active non-loss output qty
```

Dashboard source-of-truth ต้องใช้ production facts ที่ reconcile กับ PI/PO2 stock ledger:

- Input จาก active `PI` ledger `WIP_IN`
- Output จาก active `PO2` ledger `PRODUCTION_OUTPUT_IN` และ `PRODUCTION_OUTPUT_RM_IN`
- Loss จาก active `PO2` ledger `PRODUCTION_LOSS`
- WIP จาก `WIP_IN - PRODUCTION_OUTPUT_WIP_OUT - PRODUCTION_LOSS`
- Top product และ machine output summary จาก actual output product rows/receipts ที่ไม่ใช่ loss

## Target Production Lifecycle

| Step | Document/Action | Meaning | Stock ledger |
|---|---|---|---|
| 1 | Create Production Order | เปิดงานผลิต, ระบุ branch, warehouse, target/intended product, machine/line optional | ยังไม่กระทบ stock |
| 2 | Production Input | เบิกวัตถุดิบเข้า WIP | paired movement `PI`: source stock out + WIP in |
| 3 | Production Output | รับผลผลิตเป็น FG/RM หรือบันทึก loss | `PO2`: WIP out + destination in หรือ loss |
| 4 | Partial Complete | มี output แล้วแต่ WIP ยังเหลือ | ไม่มี movement เพิ่มเอง; รอ output เพิ่ม |
| 5 | Complete | จบงานผลิตเมื่อ WIP = 0 | ห้าม complete ถ้า WIP ยังเหลือ |
| 6 | Reverse | แก้เอกสารผิดด้วย reversal | `PI-REV` / `PO2-REV`; ไม่ลบ ledger เดิม |

Status target สำหรับ MVP:

| Status | Meaning |
|---|---|
| `Open` | สร้าง order แล้ว ยังไม่มี input |
| `In Production` | มี active input และมี WIP |
| `Partially Completed` | มี output แล้วแต่ WIP ยังเหลือ |
| `Completed` | WIP = 0 |
| `Cancelled` | ยกเลิกก่อนมี movement หรือหลัง reverse movement ครบ |

ไม่ใช้ `Draft`, `Pending Approval`, `Approved`, `Closed` ใน MVP. `Closed` จะพิจารณาอีกครั้งเมื่อมี accounting/cost lock.

## Production Stock Ledger Model

### Production Input

เมื่อเบิกวัตถุดิบเข้า production:

| Ledger row | ref_type | movement_type | Direction |
|---|---|---|---|
| ตัดจากคลังวัตถุดิบ | `PI` | `PRODUCTION_INPUT_OUT` | `qty_out` |
| รับเข้า WIP | `PI` | `WIP_IN` | `qty_in` |

กติกา:

- ต้อง validate stock พร้อมใช้จาก source warehouse ก่อนเบิก
- source warehouse ควรเป็น RM/FG ตาม policy ที่อนุญาต
- destination WIP warehouse ต้องเป็นคลัง WIP ของ branch นั้น
- `PRODUCTION_INPUT_OUT` ใช้ product ของ input line; `WIP_IN` ใช้ target product ของ production order เพื่อให้ WIP bucket reconcile ตามใบสั่งผลิต
- WAC ต้องเป็น WAC ณ วันที่เบิก; ถ้าหาต้นทุนไม่ได้ต้อง reject ไม่ fallback เป็น 0
- ห้าม stock ติดลบหรือ over-issue ด้วย confirm dialog
- ห้าม edit/delete ledger เดิม; ถ้าผิดต้อง reverse ด้วย `PI-REV`

### Production Output

เมื่อรับผลผลิต:

| Output category | WIP movement | Destination movement | Saleable |
|---|---|---|---|
| `FG` | `PRODUCTION_OUTPUT_WIP_OUT` | `PRODUCTION_OUTPUT_IN` | yes |
| `RM` | `PRODUCTION_OUTPUT_WIP_OUT` | `PRODUCTION_OUTPUT_RM_IN` | yes |
| `LOSS` | `PRODUCTION_LOSS` | none | no |

กติกา:

- ทุก output ต้องตัด WIP ก่อน ยกเว้นกรณีที่เป็น note/report เท่านั้น
- `PRODUCTION_OUTPUT_WIP_OUT`, `PRODUCTION_LOSS`, และ `PRODUCTION_OUTPUT_REVERSE_WIP_IN` ใช้ target product ของ production order เป็น WIP product bucket; destination stock-in/out ใช้ product ของ output line ตามจริง
- `LOSS` ไม่สร้าง stock-in ปลายทาง
- output category MVP รับเฉพาะ `FG`, `RM`, `LOSS`
- output product/grade ต้องเลือกจริงโดย user; ห้าม auto จาก target product
- output ที่ product/grade ต่างจาก input ไม่สร้าง Grade Adjustment อัตโนมัติ; trace อยู่ใน production output เอง
- ถ้าจะ complete ต้องให้ `FG + RM + Loss = WIP balance`
- ห้าม edit/delete ledger เดิม; ถ้าผิดต้อง reverse ด้วย `PO2-REV` และต้อง block ถ้า output stock ถูก downstream ใช้แล้ว

## Output Category Master

หมวดหมู่ผลผลิต target:

| Code | Meaning | stock_effect |
|---|---|---|
| `FG` | สินค้าสำเร็จรูป | `stock_in` |
| `RM` | วัตถุดิบที่ได้กลับมา | `stock_in` |
| `LOSS` | สูญเสีย / ของเสีย | `loss` |

หน้านี้ควรใช้เป็น setup ของ production เท่านั้น ไม่ใช่หน้า stock movement

`CUSTOMER_RETURN` ยังเป็น legacy/seed value ได้ แต่ไม่อยู่ใน MVP production order write flow จนกว่าจะมี business rule และ stock status แยกชัดเจน.

## Current Next Implementation Snapshot

ตรวจ ณ 2026-06-11:

- Prisma มี `production_orders`, `production_inputs`, `production_outputs`, `process_costs`, `production_output_categories`
- `/production/orders` และ `/api/production/orders` เป็น read baseline
- modal ใน `/production/orders` มีปุ่ม create/detail/input/output/cost/allocation แต่ปุ่ม save/action ถูก disabled และขึ้นข้อความว่า batch เขียน production ยังไม่เปิด
- production report APIs อ่านจาก production tables และคำนวณ WIP/Yield/Cost ใน read model
- `/production/output-categories` มี master baseline แล้ว
- ยังไม่มี `POST/PATCH` write flow สำหรับ production order/input/output
- ยังไม่มี runtime write `stock_ledger.ref_type = PI` หรือ `PO2` ใน Next
- legacy มี production stock movement ครบ แต่ต้องใช้เป็น source material เท่านั้น ไม่ copy พฤติกรรม fallback หรือการลบ ledger เงียบ ๆ
- DB/API contract สำหรับ write flow อยู่ที่ [[Production Order DB API Design]]

## Current Gaps

- [ ] Production Order write flow
- [ ] Simplified status flow: `Open -> In Production -> Partially Completed -> Completed`
- [ ] Production Input write + paired `PI` stock ledger
- [ ] Production Output write + `PO2` stock ledger
- [ ] Reverse input/output policy with append-only reversal
- [ ] WIP reconciliation report from ledger vs production tables
- [ ] Lock rules after `Completed`
- [ ] Timeline/status log for production documents
- [ ] Process Cost and cost allocation later phase, not MVP

## Reconciliation Rules

ต้องมี report/check อย่างน้อย:

- `PI` paired rows ต้อง balance: source out = WIP in
- `PO2` WIP out ต้องไม่เกิน active WIP
- WIP balance = sum(`WIP_IN`) - sum(`PRODUCTION_OUTPUT_WIP_OUT`) - sum(`PRODUCTION_LOSS`)
- `production_inputs.qty` ต้อง reconcile กับ `stock_ledger.ref_type = PI`
- `production_outputs.qty` ต้อง reconcile กับ `stock_ledger.ref_type = PO2`
- Completed order ต้องไม่มี WIP คงเหลือ
- `LOSS` ต้องแยกจาก saleable stock และไม่เข้า available stock
- ไม่มี fallback: ถ้า doc no, category, WAC, warehouse, product, stock balance, หรือ status reconcile ไม่ครบ ต้อง reject หรือแก้ data/migration ไม่ใช่ default ค่าแทน

Production report read-model ต้อง reconcile อย่างน้อย:

- `Input Qty/Cost` จาก active `PI` ledger `WIP_IN`
- `Output Qty/Value` จาก active `PO2` ledger `PRODUCTION_OUTPUT_IN` และ `PRODUCTION_OUTPUT_RM_IN`
- `Loss Qty/Value` จาก active `PO2` ledger `PRODUCTION_LOSS`
- `WIP Qty/Value` จาก `WIP_IN - PRODUCTION_OUTPUT_WIP_OUT - PRODUCTION_LOSS`
- `Loss Value (บาท)` จาก `Loss Qty * (RM Cost / Input Qty)`
- `Yield %` จาก `Output Qty / Input Qty * 100`

## Relationship With Stock Docs

Production refs ต้องปรากฏใน `/stock/ledger` เพราะเป็น movement จริง:

- `PI`
- `PI-REV`
- `PO2`
- `PO2-REV`

แต่หน้ารายงาน production เป็น read model เท่านั้น ไม่ควรแก้ ledger โดยตรงจาก report page

## Related Notes

- [[Stock Ledger and Stock Balance]]
- [[Stock Ledger Page Flow]]
- [[Stock Balance Page Flow]]
- [[Stock Convert Page Flow]]
- [[Cost Pool]]
- [[Production Order DB API Design]]
