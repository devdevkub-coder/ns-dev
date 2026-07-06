---
title: Dashboard ใบรับ-ส่งของ Page Flow
tags:
  - page-flow
  - menu
  - dashboard
status: accepted-baseline
updated: 2026-07-06
route: /daily/weight-ticket-dashboard
---

# Dashboard ใบรับ-ส่งของ Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Daily Transactions |
| Route | `/daily/weight-ticket-dashboard` |
| Page | Dashboard ใบรับ-ส่งของ |
| Current Next | accepted code baseline |

## Canonical References

[[WTI-WTO Flow]], [[Purchase Flow]], [[Sales Flow]], [[Stock Ledger and Stock Balance]]

## Responsibilities

- แสดงภาพรวม read-only ของ WTI/WTO ในช่วงวันที่ที่เลือก
- ให้ผู้ใช้เห็นงานค้างหลัก: `WTI` ที่ยังมี `remaining_weight` รอเปิด Purchase Bill และ `WTO` ที่ยังมี active `stock_holds.status = active` เป็น pending out
- สรุปตามสถานะ, สาขา, สินค้า และเอกสารที่ต้องตามต่อ
- เป็น entry point ในหมวดเดียวกับ `/daily/weight-ticket-list` เพื่อกดต่อไปหน้ารายการหรือหน้า detail ได้

## Non-Responsibilities

- ไม่สร้าง/แก้ไข/ยกเลิก WTI/WTO
- ไม่ยืนยัน WTO, ไม่ตัด stock, ไม่ consume pending out, และไม่เขียน stock ledger
- ไม่แสดง cost/COGS/pending_out value เพราะ dashboard นี้เป็นหน้าสแกนงานปฏิบัติการทั่วไป ส่วน cost ยังอยู่ใน detail/report ที่มีขอบสิทธิ์เฉพาะ
- ไม่แทนที่ `/daily/weight-ticket-list`; list/detail ยังเป็นหน้าทำงานหลักสำหรับค้นหา เปิดเอกสาร พิมพ์ แชร์ และเข้า edit

## Lifecycle / Read Flow

1. ผู้ใช้เข้า `/daily/weight-ticket-dashboard` จากหมวด Daily Transactions
2. หน้าเริ่มด้วยช่วงวันที่ 30 วันล่าสุด และ filter `ทุกสาขา + WTI/WTO ทั้งหมด`
3. Client เรียก `GET /api/daily/weight-ticket-dashboard?dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&branchId={code}&type=WTI|WTO`
4. API ใช้สิทธิ์ `daily.weight_tickets.view` และ branch scope เดียวกับหน้า WTI/WTO เดิม
5. API อ่าน `weight_tickets`, `weight_ticket_product_summaries`, และ active `stock_holds`
6. UI แสดง KPI, สรุปสถานะ, สรุปสาขา, top products และรายการเอกสารที่ต้องตามต่อ
7. ผู้ใช้กดเลขเอกสารเพื่อเปิด detail route ของ `/daily/weight-ticket-list/{docNo}` หรือกดไปหน้ารายการ/สร้าง WTI/WTO

## API / Data Contract

Current API:

```http
GET /api/daily/weight-ticket-dashboard
```

Query params:

| Param | Meaning |
|---|---|
| `dateFrom` | วันที่เริ่มต้น; ถ้าไม่ส่ง ใช้ 30 วันล่าสุด |
| `dateTo` | วันที่สิ้นสุด; ถ้าไม่ส่ง ใช้วันนี้ |
| `branchId` | branch code หรือ `all` |
| `type` | `WTI`, `WTO`, หรือไม่ส่งเพื่อดูทั้งหมด |

Response sections:

- `summary`: จำนวนเอกสาร active, WTI/WTO net weight, WTI รอ PB, WTO pending out, จำนวนยกเลิก
- `byStatus`: count/net weight ตาม `doc_type + status`
- `byBranch`: WTI/WTO count/net weight, WTI waiting bill weight, WTO pending out weight ตามสาขา
- `topProducts`: product aggregate จาก summary rows และ active holds
- `attentionRows`: WTI remaining rows และ WTO active pending_out rows พร้อม link ไป detail

## Validation / Status Rules

- Cancelled documents ไม่นับใน KPI active weight แต่ยังแสดงจำนวนยกเลิกใน summary
- `WTI รอเปิด PB` ใช้ผลรวม `weight_ticket_product_summaries.remaining_weight > 0` ของเอกสารที่ยังไม่ `billed/cancelled`
- `WTO pending out` ใช้ active `stock_holds.qty` ของ WTO เท่านั้น
- Branch filter ต้องผ่าน branch scope ของผู้ใช้เสมอ
- Type filter ยอมรับเฉพาะ `WTI` หรือ `WTO`; ค่าอื่นถือเป็น all/default

## Side Effects

ไม่มี side effect ต่อเอกสาร, stock hold, stock ledger, purchase bill, sales bill, LINE, print, หรือ database write path อื่น

## Current Gaps

- ยังไม่มี export ของ dashboard นี้
- ยังไม่มี aging bucket แยกจำนวนวันค้าง PB/SB
- ยังไม่มี drilldown ใน dashboard ตามสินค้า/สาขาแบบ modal; ใช้ link ไป detail/list ก่อน

## UI Checkpoint 2026-07-06

- ปรับหน้าให้ตาม `docs/design.md` สำหรับ report/list dashboard: KPI cards อยู่บนสุด, ต่อด้วย line tabs, filter card, แล้วจึงแสดง data surface ที่เลือก
- Filter desktop รวมวันที่, สาขา, quick range, ประเภทเอกสาร, ปุ่มรีเฟรช และ action ไปหน้ารายการ/สร้างเอกสารใน card เดียว
- Filter mobile ใช้ toolbar สั้นพร้อมปุ่ม `ตัวกรอง` และ `MobileFilterSheet`; ไม่แสดง filter block ยาวบนหน้าจอเล็ก
- `ประเภทเอกสาร` ใช้ segmented filter (`WTI/WTO ทั้งหมด`, `ใบรับของ WTI`, `ใบส่งของ WTO`) แทน dropdown เพื่อให้ตรง status/filter baseline
- ตาราง `สรุปตามสินค้า` และ `เอกสารที่ต้องตามต่อ` แยกด้วย line tabs และยังคง mobile dense cards แทนตารางแนวนอน
- ห้ามแสดงข้อมูลซ้ำบทบาทใน viewport เดียวกัน: KPI ใช้เป็นภาพรวม, tabs/panels ใช้เป็น breakdown/detail, filter card ไม่ต้องแสดง summary text ที่ซ้ำกับช่อง filter ที่เห็นอยู่แล้ว
- Tab badge ใช้เฉพาะ tab ที่เป็นรายการจริง เช่น `สรุปสินค้า` และ `เอกสารที่ต้องตามต่อ`; ไม่ใส่ตัวเลขใน `ภาพรวม` เพราะจะซ้ำหรือกำกวมกับ KPI cards
- Mobile tabs ใช้ป้ายสั้น `สินค้า` / `ตามต่อ` แต่เก็บชื่อเต็มไว้ใน `aria-label` เพื่อไม่ให้แท็บดัน viewport กว้างเกินจอ
- KPI card บนมือถือห้ามตัดเลขน้ำหนักด้วย ellipsis; ให้ตัวเลข/หน่วยขึ้นบรรทัดตามพื้นที่เพื่อคงความหมายครบ
- การเปลี่ยนแปลงนี้เป็น presentation-only; ไม่เปลี่ยน API, permission, source calculation, หรือ read-only boundary

## Implementation Checklist

- [x] Add active menu item under Daily Transactions next to `/daily/weight-ticket-list`
- [x] Add exact permission mapping to `daily.weight_tickets.view`
- [x] Add read-only dashboard API
- [x] Add responsive dashboard UI with KPI/filter/table/mobile card states
- [x] Document route/API/read-only boundary
- [ ] Add export or aging buckets only when the business asks for it
