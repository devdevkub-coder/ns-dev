---
title: ใบสั่งผลิต Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-07-23
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
| 4 | receive output | PO2 output FG/RM/loss |
| 5 | complete | allowed only when WIP = 0 |

## API / Data Contract

### Current API

- `GET /api/production/orders - production order read/list`
- `POST /api/production/orders` - create order as `Open`, no stock ledger
- `PATCH /api/production/orders/[docNo]` - update header/cancel/complete actions
- `POST /api/production/orders/[docNo]/inputs` - create `PI`
- `POST /api/production/orders/[docNo]/inputs/[inputDocNo]/return` - return against the original PI
- `POST /api/production/orders/[docNo]/inputs/return` - return with `inputDocNo` in body; the old reverse endpoint is a compatibility alias and does not create `PI-REV`
- `POST /api/production/orders/[docNo]/outputs` - create `PO2`
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
- WIP-side stock ledger rows must use the production order target product as the WIP product bucket; input/output source and destination stock rows keep their line product
- complete ต้อง WIP = 0
- status MVP: `Open`, `In Production`, `Partially Completed`, `Completed`, `Cancelled`

## Side Effects

- target writes stock ledger refs `PI`/`PO2` และ WIP/yield facts
- current read baseline ไม่มี write side effect
- input return writes append-only `PI-RETURN` rows against the original PI; output reverse remains `PO2-REV`. Neither flow hard-deletes or rewrites the original ledger.

## List View / Filter Semantics

- `/daily/weight-ticket-list` เป็น visual reference ของ list-page shell: filter card, search, pagination, desktop table, mobile cards, export และ mobile FAB.
- หน้าใบสั่งผลิตคง production-specific facts ได้แก่ input, WIP, output, yield, status และ action เปิดรายละเอียด; ไม่ลอก field/action ของ Weight Ticket ที่ไม่เกี่ยวกับ production lifecycle.
- `production_orders.date` คือ **วันที่ใบสั่งผลิต** และใช้กับช่วงวันที่/การเรียงหลัก ส่วน `production_orders.created_at` คือ **วันที่สร้างรายการ** ต้องแสดงแยกกันใน list, card, detail และ export เพื่อไม่ให้ความหมายปะปนกัน.
- Desktop เรียงข้อมูลจากหัวตารางโดยตรง; Mobile เก็บตัวเลือกเรียงใน filter sheet เฉพาะ field ที่ผู้ใช้เห็น (`date`, `docNo`, `status`) เพื่อลด control ซ้ำ.
- ค่าเริ่มต้นเป็น `ทุกสถานะ` เพื่อไม่ให้หน้าแรกดูเหมือนไม่มีข้อมูล; quick filter เป็น multi-select โดยแต่ละสถานะ toggle แยกกัน และ `ทุกสถานะ` ใช้ reset selections ทั้งหมด ทั้ง list และ Excel ต้องส่ง/ใช้ status set เดียวกัน.
- ตัวกรองสาขาใช้ outward `branchCode` และต้องถูกส่งต่อทั้ง list query และ Excel export เพื่อให้ผลบนจอกับไฟล์ตรงกัน โดยไม่เปิด internal id ที่ UI/API boundary; API ต้อง intersect ทุก query กับสาขาที่ผู้ใช้ได้รับสิทธิ์และคืน branch options เฉพาะขอบเขตเดียวกัน.
- จำนวนรายการแสดงครั้งเดียวใน pagination toolbar ที่เป็นแถวอิสระเหนือ list/table; ปุ่ม `คืนค่าเดิมตาราง` อยู่ในกลุ่มควบคุมด้านขวาก่อน page-size ตาม canonical list pattern และ page-size ที่รองรับใน UI คือ 10 และ 25 รายการต่อหน้า.
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
- Form fields ใน create modal ใช้ความสูงมาตรฐาน `h-10` ร่วมกันระหว่าง date picker, select และ searchable combobox; filter toolbar ใช้ `h-9` แยกตาม sizing contract ใน `docs/design.md`.
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
- `คลังวัตถุดิบ` is selectable only from active warehouses belonging to the selected branch; WIP warehouses are excluded from this list. The create form no longer exposes a WIP field or sends a WIP code. The server resolves exactly one active WIP warehouse for the selected branch; missing or duplicate WIP setup blocks save.
- Selected target product stock preview in the create modal is implemented for explicit `สาขา + สินค้าที่ผลิต + คลังรับผลผลิต`.
- Input and Output modal product fields now use searchable comboboxes over active product master code/name.
- Logged-in browser QA passed on 2026-06-12 for full UI click flow: create -> input round 1 -> input round 2 in the same modal -> output round 1 -> output round 2 with loss/complete -> reverse-block -> reconciliation. Result doc: `PO2606-0021`.
- Stock reconciliation follow-up on 2026-06-12 repaired the WIP-side product dimension for active production ledger rows and hardened runtime WIP-side PI/PO2 writes to use `production_orders.product_id`; source/destination rows remain line-product specific.
- Legacy parity confirmed: input/output are multi-round by repeated one-document modal saves from the order detail, not an in-modal editable multi-line grid.
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
- Create modal validation requires every user-entered field except `หมายเหตุ`: วันที่, สาขา, สินค้าที่ผลิต, เครื่องจักร/ไม่มีเครื่องจักร, ไลน์ผลิต/ไม่มีไลน์ผลิต, กะการผลิต, and source/destination warehouses. Machine and line choices are scoped by the server when real values are supplied; explicit no-machine/no-line options are stored as null. `กะการผลิต` and branch-scoped `คลังวัตถุดิบ` are grouped under `ข้อมูลพื้นฐาน`, while the optional notes are grouped into the `เครื่องจักรและไลน์ผลิต` card.
- Movement forms use `น้ำหนักรวม (กก.)` for net quantity and render `หมายเหตุ` as a multiline textarea in both input and output flows.
- The current-stock preview is labeled `ข้อมูล Stock ปัจจุบันของสินค้าที่จะเบิก`; location/status cells are centered, while quantity and average price columns are right-aligned. The preview does not show a separate total-value column.
- The movement input field is labeled `คลังวัตถุดิบที่เบิก` and is scoped to the production order's branch; active WIP warehouses are excluded from the selectable list.
- In the input movement form, the current-stock preview follows the selected `สินค้า` and `คลังวัตถุดิบที่เบิก`; it does not reuse the production-order target product.
- Input correction is a business action named `คืนวัตถุดิบ`, not `ย้อนรายการ`: it keeps the original PI document number, records a return row, and writes paired return ledger rows with the original input category and original unit cost.
- Stock categories are stored as `RM`/`FG` snapshots on the input row and displayed as `RM (วัตถุดิบ)` / `FG (สินค้าสำเร็จรูป)`; returned input rows remain visible with status `คืนครบแล้ว` but are excluded from active input, WIP, and production-cost totals.
- Mobile cards use the same Thai labels and no longer expose the English `Locked` state text. Filters, exports, modal behavior, production lifecycle, API contracts, permissions, database schema, and business data did not change.

## 2026-07-23 API serialization checkpoint

- The list API keeps branch database identifiers as internal `bigint` values only. The JSON filter contract exposes `code`, `id` (the branch code as a string), and `name`, because the UI filters by `branchCode` and JSON cannot serialize `bigint`.
- This keeps the API boundary aligned with the business key used by list and Excel queries, while preventing the branch option payload from turning a successful production-order query into a 500 response.
