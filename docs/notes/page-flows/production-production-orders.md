---
title: ใบสั่งผลิต Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-07-24
route: /production/orders
---

# ใบสั่งผลิต Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Production |
| Route | `/production/orders` |
| Page | ใบสั่งผลิต |
| Current Next | accepted code baseline |

## Canonical References

[[Production Flow]], [[Production Order DB API Design]], [[Stock Ledger and Stock Balance]]

## Flow Baseline

production order เป็น owner ของ input/WIP/output lifecycle target. MVP write flow ไม่ใช้ approval/process cost/cost allocation/customer return.

## Page Responsibilities

- แสดง/target สร้าง production order
- กำหนด branch, source warehouse, WIP warehouse, destination warehouse, target/intended product, machine/line optional
- target issue input เป็น PI และ receive output เป็น PO2
- แสดง status, WIP, yield/loss, RM cost และ timeline

## Cost Policy

- การเบิกวัตถุดิบเข้า WIP เป็นขั้นตอนก่อนเริ่มผลิตจริง และเก็บต้นทุน snapshot จาก WAC ของคลังต้นทางไว้ใน `production_inputs.unit_cost` / `wac_unit_cost` / `total_cost` เพื่อใช้คำนวณต้นทุนการผลิตและต้นทุนเฉลี่ยของ WIP.
- การรับผลผลิตหรือ RM เข้า stock ปลายทางใช้ WAC ปัจจุบันของคลังปลายทาง ณ เวลารับ ไม่ใช้ต้นทุน snapshot ของ WIP แทน. ค่า production cost และ stock receipt cost จึงถูกเก็บแยกใน `production_outputs` พร้อม `cost_variance`.
- การคืนวัตถุดิบออกจาก WIP เป็นการ reverse มูลค่าจาก Pool WIP ที่ post แล้ว ไม่ใช่การระบุคืนล็อตเดิม. เมื่อเบิกเข้ามาหลายรอบด้วยต้นทุนต่างกัน ระบบต้องรวมเป็นมูลค่า/ปริมาณของ Pool เดียวกันตาม `สินค้า + ประเภท RM/FG + คลังต้นทาง` แล้วคำนวณ WAC ของ WIP ณ เวลาคืน (`มูลค่า WIP คงเหลือ / ปริมาณ WIP คงเหลือ`). จำนวนคืนคูณ WAC นี้ใช้เป็นต้นทุน WIP ออกและ stock เข้า เพื่อไม่สร้างหรือทำลายมูลค่ารวม; WAC ของคลังปลายทางจะถูกคำนวณใหม่จากยอดเดิมของคลังนั้น.
- ก่อนเกิดผลผลิต ตาราง WIP จะแสดงเฉพาะยอดเบิกสุทธิและต้นทุนเฉลี่ย WIP; `ใช้ไปผลิตแล้ว` เป็นศูนย์. การคืนบางส่วนต้องถูกหักออกจากยอด WIP ทุก read/write path.
- reconciliation แยกตรวจ production value ที่ไหลออกจาก WIP และ stock receipt value ที่เข้า stock เพื่อไม่ตีความส่วนต่างระหว่างสองฐานต้นทุนเป็น ledger error.

## Non-Responsibilities

- ไม่ใช้ stock convert แทน production order
- ไม่รับซื้อ/ขาย/จ่ายเงิน
- ไม่เขียน stock โดยไม่มี production transaction
- ไม่ทำ approval flow ใน MVP
- ไม่ทำ process cost/cost allocation ใน MVP
- ไม่รับ customer return ผ่าน production output ใน MVP

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิดหน้า | GET order list/read model |
| 2 | สร้าง order target | status `Open`, no stock side effect |
| 3 | issue input | PI stock-out/input to WIP |
| 4 | receive output | PO2 output FG/RM/loss; บันทึกแล้วรับเข้าคลังทันทีใน transaction เดียว และสร้างรายการใหม่ได้เมื่อ WIP ยังเหลือ |
| 5 | void output | ยกเลิกรายการผลผลิตเดิมได้เมื่อ stock ปลายทางยังไม่ถูกใช้ต่อ ระบบคืน WIP และตัด stock ปลายทางกลับ พร้อมเก็บ audit |
| 6 | complete | กดแยกจากการรับผลผลิต; ถ้า WIP เหลือ ต้องยืนยันให้คืนกลับคลังต้นทางก่อนปิดงาน |

## API / Data Contract

### Current API

- `GET /api/production/orders - production order read/list`
- `POST /api/production/orders` - create order as `Open`, no stock ledger
- `PATCH /api/production/orders/[docNo]` - update header/cancel/complete actions
- `POST /api/production/orders/[docNo]/inputs` - create `PI`
- `POST /api/production/orders/[docNo]/inputs/[inputDocNo]/return` - return against the original PI
- `POST /api/production/orders/[docNo]/inputs/return` - return with `inputDocNo` in body; the old reverse endpoint is a compatibility alias and does not create `PI-REV`
- `POST /api/production/orders/[docNo]/outputs` - create `PO2`
- `POST /api/production/orders/[docNo]/outputs/[outputDocNo]/void` - void ผลผลิตที่รับเข้าคลังแล้ว โดยใช้สิทธิ์ควบคุมรายการเดิมและไม่แก้ข้อมูลเดิมตรง ๆ
- `POST /api/production/orders/[docNo]/outputs/[outputDocNo]/reverse` - create `PO2-REV`
- `POST /api/production/orders/[docNo]/outputs/reverse` - create `PO2-REV` with `outputDocNo` in body
- `GET /api/production/orders/options` - create/input/output form reference data
- `GET /api/production/orders/product-stock` - selected target product stock preview source
- `GET /api/production/orders/[docNo]/wip` - active WIP summary
- `GET /api/production/reconciliation` - production document/ledger mismatch report

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ
- ห้าม fallback จาก business code/doc no ไป internal id ที่ UI/API boundary

## Validation / Status Rules

- input/output product active
- create order WIP warehouse must be active, belong to the selected branch, and have warehouse type `WIP`
- create modal locks WIP warehouse when the selected branch has exactly one active WIP warehouse; otherwise it blocks missing setup or requires explicit WIP selection
- issue qty ไม่เกิน available
- missing WAC ต้อง reject ไม่ fallback เป็น 0
- output/yield/loss ต้อง reconcile กับ active input/WIP
- ผลผลิตเป็นศูนย์ได้เมื่อสูญเสียทั้งหมด: ถ้า `lines=[]` และ `lossQty` เท่ากับ WIP ที่เลือกใช้ ระบบบันทึก loss อย่างเดียว ไม่ต้องเลือกคลังรับผลผลิต และยังต้องกดจบงานแยกเมื่อ WIP เหลือศูนย์
- WIP-side stock ledger rows must use the production order target product as the WIP product bucket; input/output source and destination stock rows keep their line product
- output ทุกครั้งเป็น posted movement และมีผลต่อ stock/WIP ทันทีหลัง transaction สำเร็จ; ไม่ใช้ Draft ปะปนในตาราง movement
- ผลผลิตเพิ่มให้บันทึกเป็น PO2 movement ใหม่ ไม่แก้ยอดของ PO2 เดิม
- void ตรวจ stock ปลายทางและ cost-pool downstream ก่อนคืน WIP; ถ้าผลผลิตถูกใช้ต่อแล้วให้ reject
- complete ทำผ่าน action แยกจาก output; ถ้า WIP เหลือ ต้องยืนยันก่อน แล้วระบบคืน WIP ที่เหลือกลับคลังต้นทางด้วย `PI-RETURN` ใน transaction เดียวกันก่อนเปลี่ยนเป็น `Completed`
- status MVP: `Open`, `In Production`, `Partially Completed`, `Completed`, `Cancelled`

## Side Effects

- target writes stock ledger refs `PI`/`PO2` และ WIP/yield facts
- output write รับผลผลิตเข้าคลังทันที; การแก้ยอด เช่น 2 เป็น 3 ต้องใช้ void รายการเดิมแล้วสร้างผลผลิตใหม่ หรือเพิ่มผลผลิตใหม่เฉพาะส่วนต่างเมื่อเป็นการผลิตเพิ่มจริง
- current read baseline ไม่มี write side effect
- input return writes append-only `PI-RETURN` rows against the original PI; output reverse remains `PO2-REV`. Neither flow hard-deletes or rewrites the original ledger.

## List View / Filter Semantics

- `/daily/weight-ticket-list` เป็น visual reference ของ list-page shell: filter card, search, pagination, desktop table, mobile cards, export และ mobile FAB.
- หน้าใบสั่งผลิตคง production-specific facts ได้แก่ input, WIP, output, yield, status และ action เปิดรายละเอียด; ไม่ลอก field/action ของ Weight Ticket ที่ไม่เกี่ยวกับ production lifecycle.
- ตอนสร้างใบสั่งผลิต ผู้ใช้ไม่ต้องเลือกวันที่ ระบบกำหนด `production_orders.date` และเลขเอกสารจากวันที่กรุงเทพฯ ณ เวลากดบันทึก ส่วน `production_orders.created_at` เก็บ timestamp ของการสร้างรายการ. วันที่ที่แสดงในคอลัมน์หลักของ list/card/detail คือ `startDate` จากวันที่ที่ผู้ใช้เลือกในผลผลิตรายการแรก (`production_outputs`) และจะแสดง `-` หากยังไม่มีผลผลิต; ห้าม fallback ไปใช้วันที่สร้างหรือวันที่เบิกวัตถุดิบ.
- Desktop เรียงข้อมูลจากหัวตารางโดยตรง; Mobile เก็บตัวเลือกเรียงใน filter sheet จากชุดเดียวกัน ได้แก่ `startDate`, `createdAt`, `docNo`, `inputQty`, `wipQty`, `outputQty`, `yield` และ `status`. ช่วงวันที่ของ filter ใช้วันสร้างรายการของใบสั่งผลิต ส่วน `startDate` ใช้วัน movement จริงและมีค่าเป็น `null` ก่อนเริ่มผลิต.
- การ sort `inputQty`, `wipQty`, `outputQty`, `yield` และ `status` ต้องคำนวณจาก active facts และยอดคืนก่อนเรียงและแบ่งหน้า; สถานะเรียงตามลำดับธุรกิจ `Open` → `In Production` → `Partially Completed` → `Completed` → `Cancelled` ไม่ใช่เรียงตามตัวอักษร.
- ค่าเริ่มต้นเป็น `ทุกสถานะ` เพื่อไม่ให้หน้าแรกดูเหมือนไม่มีข้อมูล; quick filter เป็น multi-select โดยแต่ละสถานะ toggle แยกกัน และ `ทุกสถานะ` ใช้ reset selections ทั้งหมด ทั้ง list และ Excel ต้องส่ง/ใช้ status set เดียวกัน.
- ตัวกรองสาขาใช้ outward `branchCode` และต้องถูกส่งต่อทั้ง list query และ Excel export เพื่อให้ผลบนจอกับไฟล์ตรงกัน โดยไม่เปิด internal id ที่ UI/API boundary; API ต้อง intersect ทุก query กับสาขาที่ผู้ใช้ได้รับสิทธิ์และคืน branch options เฉพาะขอบเขตเดียวกัน.
- จำนวนรายการแสดงครั้งเดียวใน pagination toolbar ที่เป็นแถวอิสระเหนือ list/table; ปุ่ม `คืนค่าเดิมตาราง` อยู่ในกลุ่มควบคุมด้านขวาก่อน page-size ตาม canonical list pattern และ page-size ที่รองรับใน UI คือ 10 และ 25 รายการต่อหน้า.
- หน้า list แสดง KPI `WIP คงเหลือ (กก.)` จากผลรวมของรายการในหน้าปัจจุบัน และกำกับว่าเป็น page-level summary ตาม contract pagination ไม่ใช่ยอดรวมทุกหน้าที่ไม่ได้โหลด.
- ตาราง desktop ใช้ alignment ตาม business type: เลขที่/วันที่/สาขา/สินค้า/เครื่องจักร/คลัง/สถานะ/จัดการอยู่กึ่งกลาง ส่วนปริมาณเบิก, WIP, ปริมาณผลิต และค่าตัวเลข น้ำหนัก ราคา หรือต้นทุนอยู่ชิดขวาพร้อม `tabular-nums` เพื่อให้เทียบตัวเลขเป็นแนวเดียวกัน.
- Desktop ใช้สถานะแบบ compact dot + text และมี action `เปิด` ที่คอลัมน์ขวาสุด โดยล็อกช่วงความกว้างของ `สถานะผลิต` และ `จัดการ` ไม่ให้คอลัมน์ท้ายดูดพื้นที่ว่างทั้งหมดบนจอกว้าง; Mobile ใช้ outer card ชั้นเดียวที่กดหรือใช้ Enter/Space ได้ทั้งใบเพื่อเปิดรายละเอียด พร้อม status pill และจัดสินค้า, เบิก, WIP, ผลิต และ Yield ด้วย divider/typography เพื่อคง production metrics โดยลดความหนาแน่นของกรอบซ้อนและไม่เพิ่มปุ่ม action ซ้ำในการ์ด.
- Dark Mode บน Mobile ใช้ neutral slate surface เดียวกันทุกสถานะ ไม่ย้อมสีพื้นทั้งการ์ด; สี semantic จำกัดอยู่ที่ status, metric value และ Yield ส่วน product/metadata ใช้ลำดับ primary/secondary text. Selected segmented filters ใช้ blue accent ที่เห็นชัด และรายการต้องเว้นพื้นที่ด้านล่างให้พ้น FAB กับ bottom navigation.
- Mobile toolbar เหลือ search + filter trigger และ empty state ที่เกิดจากตัวกรองมีข้อความตามสาเหตุพร้อมปุ่มล้างตัวกรอง; ค่าใน filter sheet เป็น draft จนกด `ใช้ตัวกรอง` จึงเปลี่ยน list query ส่วน backdrop/Escape ต้องปิดโดยทิ้ง draft. Shared sheet สูงไม่เกิน `80dvh` และใช้ dark scrim ที่ไม่ถูก theme remap เพื่อคง backdrop แบบเดียวกันทั้ง Light/Dark.
- Excel export ใช้ authorization/filter contract เดียวกับ list และจำกัดผลสูงสุด 10,000 รายการ โดย UI ต้องแจ้งขีดจำกัดนี้ที่ action.
- การปรับ list view เป็น read-only presentation/query change และไม่เปลี่ยนกฎ create/input/output/reverse/complete หรือ stock side effect.

## Modal UX / Theme Baseline

- Detail และ create modal ใช้ `DialogHeader` เป็น semantic header ของ shared dialog shell เพื่อให้ mobile app-shell CSS แยก header ออกจาก scrollable body ได้ถูกต้อง; header ต้องไม่ถูกยืดเป็น content panel และต้องเว้น safe-area ด้านบนตาม shared dialog behavior.
- Desktop ใช้ modal กว้างสูงสุด `max-w-5xl` และสูงไม่เกิน `90vh`; Mobile ใช้ full viewport shell โดย header เป็นส่วนคงที่และ body เป็น internal vertical scroller เพียงชั้นเดียว.
- Light และ Dark ใช้ header surface เดียวกันคือ slate-900 (`#0f172a` ใน Dark Mode) พร้อมข้อความขาว; body/cards/controls ใช้ global theme mappings ห้ามเกิด light surface รั่วหรือ white-on-white contrast.
- ปุ่มออกจาก create/detail modal ใช้ shared action เดียวกันคือ `ปิด` สีแดง เพื่อไม่ให้มี wording และ implementation ซ้ำกันระหว่าง `ยกเลิก` กับ `ปิดหน้าต่าง`; action ที่เปลี่ยนสถานะธุรกิจยังต้องใช้ wording เต็มและชัดเจน เช่น `จบงาน` และ `ยกเลิกใบสั่งผลิต`.
- Detail tabs ใช้ภาษาไทย `ข้อมูลทั่วไป`, `วัตถุดิบเบิก`, `ผลผลิต`, มี touch target อย่างน้อย 44px และ selected state ที่เห็นชัดทั้ง Light/Dark.
- Detail metadata เป็น read-only label/value rows ไม่ทำให้ดูเหมือน editable input; create form แสดงคำอธิบาย `*` สำหรับช่องจำเป็น และใช้ textarea สำหรับหมายเหตุ.
- Form fields ใน create modal ใช้ความสูงมาตรฐาน `h-10` ร่วมกันระหว่าง select และ searchable combobox; ไม่มี date picker สำหรับวันที่ใบสั่งผลิต เพราะระบบกำหนดวันสร้างจากเวลาบันทึก. Filter toolbar ใช้ `h-9` แยกตาม sizing contract ใน `docs/design.md`.
- Create modal แสดงชื่อ `ใบสั่งผลิตใหม่` โดยไม่ใส่ status badge หรือคำอธิบายสถานะใน title area; `เครื่องจักร` และ `ไลน์ผลิต` เป็น required choice โดยเลือกได้ทั้งรายการจริงหรือ `ไม่มีเครื่องจักร` / `ไม่มีไลน์ผลิต`.
- KPI และ field labels ใน modal ใช้คำไทยพร้อมหน่วย (`กก.`, `บาท`, `%`) เพื่อแยก quantity, money และอัตราผลได้โดยไม่ต้องเดาจากตัวเลข; KPI card ใช้คำว่า `วัตถุดิบระหว่างผลิต (กก.)` เพื่อสื่อความหมายของยอด WIP ให้ตรงกับผู้ใช้งาน.
- Browser regression ต้องตรวจ detail/create แบบ read-only ครบ Desktop `1440×1000` และ Mobile `430×932` ใน Light/Dark โดยห้ามกดบันทึก, จบงาน, ยกเลิกใบสั่งผลิต, reverse movement หรือเปลี่ยน business data.

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P1 proof baseline as of 2026-06-11.
- This page belongs to the finance/production/report baseline group and must keep source facts traceable before formula or write-flow changes.
- Transaction side effects are limited to the current API contract documented above; report pages remain read-model surfaces.
- Future changes should reconcile source table, cutoff, status, and downstream side-effect details here before changing runtime behavior.

## Current Gap

## Production Orders Review Task List 2026-07-23

### P0/P1 Correctness and Authorization

- [x] `PO-REV-01` Fix inclusive date filtering so `dateTo` includes the full business day.
- [x] `PO-REV-02` Apply the authenticated branch scope to detail, WIP, product-stock, and all production movement endpoints, not only the list endpoint.
- [x] `PO-REV-03` Define and implement action-level permissions for create, input, output, reverse, complete, cancel, and export. The route checks and role grants are in `20260723140000_production_orders_action_permissions.sql`.
- [ ] `PO-REV-04` Add a database-enforced unique constraint for `production_orders.doc_no` after duplicate-data audit. The Prisma contract and guarded migration are authored, but application is blocked until the dev-target duplicate audit can run.

### P1 Query and Contract

- [x] `PO-REV-05` Separate list projection/aggregates from detail movement payloads.
- [x] `PO-REV-06` Make displayed values and sort values use the same active-fact source. Numeric aggregate sorts now sort the active-fact projection before pagination; the current UI still exposes only the supported date/document/status sort controls.
- [x] `PO-REV-07` Define whether summary is page-level or filter-scope-level and expose the contract explicitly.
- [x] `PO-REV-08` Add product-code search and keep UI wording aligned with the API query.
- [x] `PO-REV-09` Replace product-stock warehouse/status loops with one grouped `stock_ledger` query while preserving the original saleability and lot scope.
- [x] `PO-REV-10` Scope branch/warehouse options and branch-owned machines/lines to the authenticated branch intersection; global master lists remain cache-backed.

### UI and Validation

- [x] `PO-REV-11` Reduce the desktop filter surface to one toolbar without nested card treatment.
- [x] `PO-REV-12` Keep production table horizontal scrolling without compressing typography; align numeric columns consistently.
- [x] `PO-REV-13` Normalize production status colors to neutral/blue/amber/green/red semantic roles.
- [x] `PO-REV-14` Add focused tests for date boundary, branch isolation, search, list/detail payload shape, and summary contract.

### Batch Decision

This implementation batch completes `PO-REV-01`, `PO-REV-02`, `PO-REV-03`, `PO-REV-05`, `PO-REV-06`, `PO-REV-07`, `PO-REV-08`, `PO-REV-09`, `PO-REV-10`, `PO-REV-11`, `PO-REV-12`, `PO-REV-13`, and `PO-REV-14`. The list API now returns header/aggregate rows by default and accepts `include=detail` for movement rows; the UI requests detail only when opening an order. The `summaryScope` response field explicitly identifies current-page summaries. `PO-REV-04` remains pending deployment after duplicate audit. Database access to dev-target was unavailable during this batch, so migrations were authored but not applied.

- create/input/output/reverse write services and APIs are implemented for MVP.
- ใบสั่งผลิตใหม่ modal now uses explicit required placeholders; `สินค้าที่ผลิต` uses the shared searchable combobox and searches by product code/name.
- `คลังวัตถุดิบที่เบิก` is selectable only from active warehouses belonging to the selected branch; WIP warehouses are excluded from this list. It is selected when posting an input movement, not while creating the production order. The create form only selects the output warehouse; the server resolves exactly one active WIP warehouse for the selected branch, and missing or duplicate WIP setup blocks save.
- The create modal does not load a target-product stock preview. Stock preview is limited to the input-movement form after the user selects the product and source warehouse.
- Input and Output modal product fields now use searchable comboboxes over active product master code/name.
- Logged-in browser QA passed on 2026-06-12 for full UI click flow: create -> input round 1 -> input round 2 in the same modal -> output round 1 -> output round 2 with loss/complete -> reverse-block -> reconciliation. Result doc: `PO2606-0021`.
- Stock reconciliation follow-up on 2026-06-12 repaired the WIP-side product dimension for active production ledger rows and hardened runtime WIP-side PI/PO2 writes to use `production_orders.product_id`; source/destination rows remain line-product specific.
- Input posting supports multiple raw-material lines in one save: users can add product, source warehouse, stock category, and quantity rows before submitting. The API keeps the existing `lines[]` transaction contract, while each line is validated and stock-costed independently. Separate saves remain available for additional rounds.
- Production reconciliation is now surfaced in `/production/reconciliation` as a read-only report over active `PI/PO2` facts and stock ledger checks.
- Production order cards/detail metrics now read active input/output/WIP facts from `/api/production/orders`, including `lossQty`, `consumedWipQty`, `wipQty`, `wipValue`, and `yieldPct`.
- Production report/reconciliation read models now reconcile WIP from active `PI`/`PO2` stock ledger refs and surface `ledgerMismatchQty` when production facts and ledger rows diverge; standalone `/production/wip-report` is retired.

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [x] Verify legacy behavior for simplified MVP write flow before implementing runtime change
- [x] Follow [[Production Order DB API Design]] before enabling write APIs
- [x] Add/adjust tests or browser QA checklist before claiming end-to-end production write completion
- [x] Update this file and canonical reference if contract changes

## 2026-07-23 Table consistency checkpoint

- The desktop table keeps a single-line header with horizontal table-only overflow.
- Removed the non-business `ลำดับ` column. `เลขที่ใบสั่งผลิต` is now the first column and the default API/UI sort is descending `docNo`, so the latest production order number appears first. The remaining business columns keep their existing alignment rules.
- The desktop and mobile filter surfaces follow the purchase-bill reference: one neutral white filter card contains the controls, with slate active segmented buttons and neutral transparent inactive buttons.
- Create modal validation requires every user-entered field except `หมายเหตุ`: วันที่, สาขา, สินค้าที่ผลิต, เครื่องจักร/ไม่มีเครื่องจักร, ไลน์ผลิต/ไม่มีไลน์ผลิต, กะการผลิต, and คลังรับผลผลิต. Machine and line choices are scoped by the server when real values are supplied; explicit no-machine/no-line options are stored as null. `กะการผลิต` is grouped under `ข้อมูลพื้นฐาน`, while the optional notes are grouped into the `เครื่องจักรและไลน์ผลิต` card.
- Movement forms use `น้ำหนักรวม (กก.)` for net quantity. Only the output flow retains an optional `หมายเหตุ` textarea; input posting has no movement-level note.
- The input movement form uses a four-column layout at medium screens and above: `สินค้า` spans two columns, while `คลังวัตถุดิบที่เบิก` and required `น้ำหนักรวม (กก.)` each use one column. The weight field is a decimal number input with `0.00` placeholder, `0.01` step, right alignment, and client/server validation; valid values are displayed with two decimal places after leaving the field.
- Input posting date is assigned by the server from the Bangkok calendar date at save time; the input and paired ledger rows share the save timestamp in `created_at`. The input table is titled `รายการวัตถุดิบที่เบิก` and displays `วันที่/เวลาเบิก` from that timestamp instead of accepting a user-entered date.
- In the detail modal's `ข้อมูลทั่วไป`, `วันที่สร้างรายการ` displays the order `created_at` timestamp with date and time. `คลังรับผลผลิต` remains blank until an active production output has a destination warehouse; it then shows unique destination warehouse names on separate lines, without branch codes or receipt-round counts. The planned warehouse on the order is not treated as a completed receipt.
- Movement history titles such as `รายการวัตถุดิบที่เบิก` belong to the table header area, directly above the table columns, while the posting form remains a separate block above the history.
- In the input tab, the existing `รายการวัตถุดิบที่เบิก` table is placed before the posting form so users see movement history before the `ข้อมูล Stock ปัจจุบันของสินค้าที่จะเบิก` preview; the output tab keeps its existing order.
- The input movement panel keeps its card surfaces and applies a direct top margin to the posting card when history is rendered first, so the history table and posting/stock card remain visibly separated even with flex item ordering.
- Input posting has no movement-level `หมายเหตุ`: the field, request schema, and writes to `production_inputs`/`stock_ledger` are removed. The production-order note and output note remain separate fields; the nullable legacy database columns are retained for existing records.
- Product combobox options use one line when the product code is already included in the label; the code is not repeated as a second description line.
- Production order and input document numbers are branch-scoped and use `PO/PI{รหัสสาขา}{YYMM}-{ลำดับ 4 หลัก}`, for example `PO012607-0010` and `PI012607-0005`; the sequence lock and lookup prefix include the branch, and the migration updates historical PO/PI references in their dependent tables together.
- The production-order list shows `วันที่เริ่มผลิต` from the first recorded output date, and shows `วันที่สร้างรายการ` from `createdAt` as two lines (Bangkok date first and time second) in both desktop table and mobile card. Orders without output show `-` for the start date.
- Creating a production order does not select a source raw-material warehouse and does not load the current-stock preview. The source warehouse is selected only when posting an actual input movement; the order stores the destination and WIP warehouses at creation.
- The `ข้อมูล Stock ปัจจุบันของสินค้าที่จะเบิก` preview no longer has an outer card frame; its heading and divider lead into the framed stock table, avoiding a card nested inside the posting card.
- The input posting fields keep product/source warehouse and total weight in the main entry rows, then place the notes textarea on its own full-width row at the bottom.
- Quantity fields in production input/output use the design number exception: `type="number"`, `step="0.01"`, right-aligned tabular numbers, hidden spinners, client filtering for non-numeric input, and finite positive/non-negative server validation as applicable. Editable quantity fields retain the pale-yellow entry surface after a value is entered.
- The stock preview table for input posting displays the warehouse name only in `สาขา / คลัง`; branch and warehouse codes are intentionally omitted in both desktop and mobile views.
- Input posting validation requires `สินค้า`, `คลังวัตถุดิบที่เบิก`, and `น้ำหนักรวม (กก.)`; each field exposes the required marker/ARIA contract and is checked again before the API transaction.
- The stock preview table uses a wider balanced desktop grid so `RM (วัตถุดิบ)` / `FG (สินค้าสำเร็จรูป)` stay on one line without leaving an unnecessarily narrow type column.
- The production-order modal uses a responsive width capped at `max-w-7xl` with viewport margins and a `92vh` height cap; it is wider for table workflows without becoming full-screen.
- Movement tables use compact, even cell padding; date/document/product/warehouse/lot/status/action columns are centered, while weight, unit price, and total value columns are right-aligned with tabular numbers in desktop and mobile presentations.
- The `ผลผลิต` tab is ordered as `ผลลัพธ์จากการผลิต` → `รายการผลผลิตที่เตรียมส่งเข้าคลัง` → `สรุปวัตถุดิบใน WIP` → `ข้อมูลการผลิต`. The production form selects the WIP source from the summary, shows its RM/FG type as read-only, requires the WIP quantity used, and records each output draft as `สินค้าที่ได้ + คลังรับผลผลิต + จำนวนผลผลิตที่ได้ + สูญเสีย`; product selection uses the shared searchable product combobox so multiple output products can be staged. At least output or loss must be greater than zero; loss cannot exceed the WIP quantity used. The API keeps `sourceWipQty` separate from output quantity so WIP consumption and production result are not conflated.
- The WIP source selector displays the compact label `สินค้า - RM/FG`; the separate `ประเภทสินค้า` field is omitted because the category is already visible in the selector. The selected source warehouse remains part of the internal key and server payload even though it is not shown in the compact label.
- Production entry supports multiple WIP source rows before save. Each row records product, RM/FG category, source warehouse, and quantity; `sourceWipLines[]` is validated against the source-specific WIP balance. The output and loss rows persist source allocation snapshots in `production_outputs.source_wip_allocations`, so one production receipt does not duplicate output quantity or stock receipt value when multiple WIP sources are used.
- The production form presents WIP source and quantity as editable rows inside the main table, following the purchase/sales bill pattern: `+ เพิ่มรายการ` is rendered as the next full-width row inside the table, each row can change its source and quantity, and each saved draft row can be removed before posting. The source warehouse is kept in the internal source key/API contract but is not displayed as a table column. The blank entry row can also be removed and restored with `+ เพิ่มรายการ`.
- Each added WIP source row is removed by its stable draft id, so deleting a row remains reliable after several rows have been added or other rows have changed. Removing a row also restores that pool's quantity and value in the client-side WIP preview.
- The next-row WIP dropdown is derived from the current WIP preview and hides pools whose remaining quantity is `0.00`; an existing staged row keeps its selected option visible so it can still be edited or removed.
- The WIP summary also subtracts the quantity currently typed in the visible entry row in real time. This is a client-side preview only; the API validates the final staged lines again when production is saved.
- Both the new entry row and existing staging rows expose the remaining WIP quantity as `max` and validate typed values against that remaining balance. Over-limit and negative values remain visible for correction, show an error, and cannot be added or saved.
- Production output uses the same staging pattern: each row adds `สินค้าที่ได้ + คลังรับผลผลิต + จำนวนผลผลิตที่ได้ + สูญเสีย` to `รายการผลผลิตที่เตรียมส่งเข้าคลัง` before submission. After a WIP-use row is added, the WIP summary preview immediately reduces that Pool's remaining quantity and value; this is client preview only until `บันทึกผลผลิต`. The draft table is client-side only; the save posts all staged output rows together with aggregated WIP usage and loss. Only after that transaction succeeds are `production_outputs`, WIP ledger-out, and destination stock ledger-in created. There is no separate send-to-stock step.
- The production entry controls use the same table layout as WIP input staging. The sections are titled `ตารางรายการวัตถุดิบใน WIP ที่ใช้ผลิต` and `ตารางรายการผลผลิตที่ได้`, with product, receiving warehouse, output quantity, loss quantity, and management columns; the add action is a full-width row inside the table. In the output tab, `รายการผลผลิตที่เตรียมส่งเข้าคลัง` is rendered inside the production form immediately before the output-entry table.
- Production output validation requires the production date, every WIP source row, and every WIP quantity. Output quantity and loss quantity are a cross-field requirement: at least one must be greater than zero; the receiving warehouse is required only when output quantity is entered. Notes remain optional. The form uses a narrow date field, fixed numeric/action table columns, and a helper line for this conditional requirement.
- The `รายการผลผลิตที่เตรียมส่งเข้าคลัง` staging state is persisted as one database draft per production order when rows are added, changed, or removed. Reopening the order reloads the draft; it does not affect WIP, stock, or the ledger. The draft is deleted in the same transaction that posts the real production output.
- The output-result table shows each posted production receipt and exposes `ยกเลิกผลผลิต` only for users with the controlled reversal permission. The action calls the void route, checks downstream stock usage, returns WIP, and records the original movement as reversed; the original output row is never edited or deleted.
- The production-result table groups output and loss rows by production document and shows production date/time, result product/type, WIP used, output quantity, loss quantity, receiving warehouse, note, and the controlled void action. It does not repeat the internal document number or a redundant status column.
- Movement posting timestamps display as two lines in the movement table: Bangkok date on the first line and time on the second line.
- The input movement table's `คลัง` column displays only the warehouse name; the RM/FG stock category remains an internal validation value and is not shown as a bracketed label.
- The production-order contract treats `machine_id IS NULL` and `production_line_id IS NULL` as the explicit selected options `ไม่มีเครื่องจักร` and `ไม่มีไลน์ผลิต`; the API returns those business labels, so the detail UI does not infer them with a component fallback.
- `Lot No.` is omitted from the production movement table in desktop and mobile views because lot tracking is not part of the current input workflow; the underlying API/data field remains available for future use.
- The current-stock preview is labeled `ข้อมูล Stock ปัจจุบันของสินค้าที่จะเบิก`; location/status cells are centered, while quantity and average price columns are right-aligned. The preview does not show a separate total-value column.
- The detail modal's `การผลิตและคลัง` section displays `ไลน์ผลิต` from the production order relation instead of the WIP balance; WIP remains available in the KPI and main production-order table where it is operationally useful.
- The detail modal adds a `ประวัติใบสั่งผลิต` tab backed by `production_order_status_logs`, rendered as a latest-first timeline like `ประวัติ PB`. It shows Bangkok date/time, event, status transition, actor, and note; input/output detail remains in the separate movement tabs. The timeline defaults to latest-first and provides an icon button to reverse the order.
- The production history timeline does not synthesize a current-status event or fill missing actor/note values; it renders only persisted status-log events and shows an empty state when no history exists.
- Notes entered when creating the production order are stored on the `created` status event; notes entered when recording production are stored on the `output_created` / `completed` status event. The Timeline renders both from the persisted event note.
- The input tab summarizes WIP by `สินค้า + ประเภท RM/FG + คลังต้นทาง`; rows with the same origin are combined, while the same product/category from different source warehouses remains separate. The table shows net issued quantity, current `มูลค่าวัตถุดิบใน WIP (บาท)`, and current `ต้นทุนเฉลี่ย WIP/กก.` after production consumption. The `คืนวัตถุดิบ` action opens one quantity-selection modal per WIP pool.
- On mobile, the WIP summary switches from the multi-column table to stacked source rows with a two-column numeric grid and a separate aggregate block; this prevents Thai headers and RM/FG labels from being compressed into vertical text while preserving the same grouping and alignment semantics.
- The movement input field is labeled `คลังวัตถุดิบที่เบิก` and is scoped to the production order's branch; active WIP warehouses are excluded from the selectable list.
- The output field `คลังรับผลผลิต` is also filtered to active non-WIP warehouses in the production order's branch; the API revalidates the same branch scope before writing the receipt.
- In the input movement form, the current-stock preview follows the selected `สินค้า` and `คลังวัตถุดิบที่เบิก`; it does not reuse the production-order target product.
- Input correction is a business action named `คืนวัตถุดิบ`, not `ย้อนรายการ`: the modal selects a return quantity per original `production_input`, allows partial return, keeps the original PI document number, and writes paired return ledger rows into the persisted source warehouse with the original RM/FG category and original input snapshot cost. It never creates a new reversal document number.
- The return modal groups repeated input rows by `สินค้า + ประเภท RM/FG + คลังต้นทาง`, even when their input costs differ. The UI shows the current WIP average cost and estimated return value for each group, then submits one grouped quantity across all input documents in that Pool. The server values the return from the current WIP pool average, not an unidentifiable original input layer; RM and FG remain separate pools. The paired ledger rows use the same WAC, so the return does not change total inventory value.
- The input-return API requires `production.orders.input_return`; `system_admin` is granted this action together with the other production-order write actions so system administrators do not receive a permission-only 403 when returning WIP.
- Production-order history uses the saved status-log metadata as the audit summary: an input event shows the PI number, issued quantity, total issued cost, average cost per kg, and expandable per-line product/category/source-warehouse/cost details. The UI resolves the actor to the app user's first/last name or display name; the audit actor identifier remains stored unchanged.
- Production-order history also renders the persisted `input_returned` event with the returned quantity and production/WIP cost removed, so a return is visible in the timeline rather than only changing the WIP balance. The stock receipt value uses the same original input snapshot cost as the production/WIP reversal.
- Production-order history persists and displays event-specific details without changing the status-log schema: creation shows product, branch, destination warehouse, shift, machine, and production line; output posting shows WIP used, output quantity, loss, production cost, receipt document, and expandable output lines; output void shows the returned WIP quantity, returned production cost, and original output document. Existing input and return summaries remain visible in the same timeline.
- Production output rows are staged before save, but the save itself is a posted movement: the result list contains only successful `PO2` movements, while a new production round is represented by a new PO2 document. All staged rows, WIP consumption, stock receipt, ledger, and timeline event commit atomically. Correction uses void/repost semantics instead of mutating a posted quantity.
- Before posting, the server compares `ผลผลิต + สูญเสีย` with the WIP quantity used. If the quantities differ, the first request stops with a confirmation message showing the difference; only an explicit user confirmation retries with `confirmQuantityVariance=true` and sends the transaction to stock. Cost calculation remains separate from this quantity confirmation.
- Stock categories are stored as `RM`/`FG` snapshots on the input row and displayed as `RM (วัตถุดิบ)` / `FG (สินค้าสำเร็จรูป)`; returned input rows remain visible with status `คืนครบแล้ว` but are excluded from active input, WIP, and production-cost totals. The WIP average cost is calculated separately for each RM/FG pool and is also the valuation basis shown in the return modal.
- Mobile cards use the same Thai labels and no longer expose the English `Locked` state text. Filters, exports, modal behavior, production lifecycle, API contracts, permissions, database schema, and business data did not change.

## 2026-07-23 API serialization checkpoint

- The list API keeps branch database identifiers as internal `bigint` values only. The JSON filter contract exposes `code`, `id` (the branch code as a string), and `name`, because the UI filters by `branchCode` and JSON cannot serialize `bigint`.
- This keeps the API boundary aligned with the business key used by list and Excel queries, while preventing the branch option payload from turning a successful production-order query into a 500 response.

หลังสร้างใบสั่งผลิตสำเร็จ ระบบปิด modal และโหลดรายการหน้า 1 ใหม่ทันที พร้อม reset pagination เป็นหน้า 1 เพื่อให้เอกสารล่าสุดแสดงในตาราง แม้ผู้ใช้จะเปิด modal จากหน้าอื่นอยู่ก็ตาม การ refresh นี้เป็น client-side API request ไม่ต้อง restart tmux หรือ dev server; restart จะจำเป็นเฉพาะกรณีเปลี่ยนโค้ดฝั่ง server แล้วใช้ process แบบ production ที่ไม่ได้ทำ hot reload.

## Production Output Posting And Void Task List 2026-07-24

- [x] `OUT-01` Treat each saved production result as a posted `PO2` movement: consume WIP, write production ledger, and receive output stock atomically.
- [x] `OUT-02` Keep additional production rounds as new output documents; do not mutate an existing posted quantity for a genuine additional production run.
- [x] `OUT-03` Remove `completeOrder` from output posting. Completing the production order remains a separate action; if WIP remains, explicit confirmation triggers an automatic `PI-RETURN` back to each original source warehouse before `Completed`.
- [x] `OUT-04` Add a dedicated `void` API route for a posted output movement, reusing the guarded reversal transaction and controlled permission.
- [x] `OUT-05` Add `ยกเลิกผลผลิต` to the output result table with a reason prompt and refresh after success.
- [x] `OUT-06` Reject duplicate WIP source lines at the server boundary before any stock transaction starts.
- [x] `OUT-07` Document the difference between additional production, correction, and void so users do not edit posted movement facts directly.
- [ ] `OUT-08` Audit and enforce the `production_inputs.doc_no` / `production_outputs.doc_no` document-group uniqueness contract before production deployment.
- [ ] `OUT-09` Run authenticated browser UAT for additional output, void guard after downstream stock use, WIP restoration, ledger reconciliation, and explicit order completion.
- [x] `OUT-10` Add client-side output staging rows and require `+ เพิ่มรายการผลผลิต` before posting a non-loss result.
- [x] `OUT-11` Distribute output-side WIP allocation across multiple staged result rows so WIP is consumed once in total, not once per row.

### Input staging rule

- [x] The live product/warehouse/quantity controls are a staging row. `บันทึกการเบิก` posts only rows already added to the `รายการวัตถุดิบที่เตรียมเบิก` table; an unadded live row is not included in the payload.
- [x] Saving with only an unadded live row shows an explicit instruction to press `+ เพิ่มรายการวัตถุดิบ` first.
