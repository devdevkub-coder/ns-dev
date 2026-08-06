# Profit & Cost Analysis Performance Design

Date: 2026-07-19
Status: Implemented locally and applied to production; pending promotion
Route: `/profit-cost-analysis`

## 1. Objective

ปรับ Profit & Cost Analysis จากรายงานที่อ่าน transaction จำนวนมากแล้ว aggregate ใน Node.js ทุกครั้ง ให้เป็นรายงานที่อ่านจาก reporting fact ซึ่งอัปเดตตาม lifecycle ของเอกสาร พร้อม daily rollup สำหรับการสรุปผลช่วงวันที่

เป้าหมายหลัก:

- warm API response ของ summary และ active tab อยู่ในช่วง 200-300 ms ที่ application layer เมื่อฐานข้อมูลและ network อยู่ในภาวะปกติ
- หน้าแรกแสดง KPI และ Top 5 ได้ก่อน โดยไม่รอข้อมูลทุก tab
- เปลี่ยน filter แล้วผลลัพธ์ที่แสดงต้องตรงกับ filter ชุดเดียวกันทั้งหมด
- transaction ที่ยืนยันหรือยกเลิกแล้วต้องสะท้อนในรายงานทันทีหลัง DB transaction สำเร็จ
- ไม่มี hardcode, runtime fallback, skip-row หรือ silent coercion เพื่อกลบข้อมูลต้นทางที่ไม่ครบ
- Database เป็น source of truth และ report fact เป็น DB read model; ไม่ cache financial/report facts ใน Redis หรือ persistent browser storage

## 2. Current Problems

| # | Problem found | Severity | Recommended action |
|---|---|---|---|
| 1 | API เดียวอ่าน PB, SB และ stock ledger หลายหมื่นรายการและ aggregate ใน JavaScript ทุกครั้ง | สูง | สร้าง incremental fact ledger และ daily rollup ใน PostgreSQL |
| 2 | response เดียวส่งข้อมูลครบทุก tab แม้ผู้ใช้เปิดดูเพียง tab เดียว | สูง | แยก summary, rankings และ tab APIs |
| 3 | ตารางแบ่งหน้าและ sort ใน client หลังโหลดข้อมูลทั้งหมด | สูง | ทำ server-side pagination และ sort |
| 4 | filter เปลี่ยนแล้ว request ทันทีหลายครั้ง และ request เก่ายังทำงานต่อ | กลาง | ใช้ draft/applied filters และ AbortController |
| 5 | purchase channel ถูกส่งเป็นรายการว่าง และ sales channel มีความเสี่ยงใช้ identifier คนละ contract | สูง | ใช้ dimension ID จาก source transaction เท่านั้นและ validate contract ใน DB/API |
| 6 | COGS และ product identity มี fallback จากข้อมูลระดับหัวเอกสารหรือ JSON | สูง | ตัด fallback; source line ที่ไม่ครบต้องเข้า reconciliation issue และไม่ถูก project แบบเดา |
| 7 | target margin 8% ถูก hardcode ใน service | กลาง | อ่านจาก configuration/master ที่มี owner และ validation ชัดเจน |
| 8 | เงินและน้ำหนัก aggregate ผ่าน JavaScript `number` | สูง | คำนวณใน PostgreSQL `numeric` และ serialize เป็น decimal string ที่ API boundary |
| 9 | HTTP request ปัจจุบันมี auth/proxy overhead ประมาณ 350-580 ms | กลาง | วัดและปรับ auth/proxy แยกจาก report query เพื่อให้เป้าหมาย end-to-end เป็นจริง |

## 3. Chosen Architecture

ใช้ **incremental Profit/Cost Fact Ledger + Daily Rollup + Nightly Reconciliation**

ไม่เลือก Materialized View อย่างเดียว เพราะการ refresh เป็นช่วงทำให้รายงานล่าช้าและ refresh ทั้งก้อนมีต้นทุนสูงเมื่อ transaction โตขึ้น ไม่เลือก code-only optimization เป็นเป้าหมายสุดท้าย เพราะยังต้องอ่านและ aggregate transaction จำนวนมากทุก request

### 3.1 Source of Truth

- Purchase Bill และรายการย่อย เป็น source ของ purchase quantity/amount
- Sales Bill และรายการย่อย เป็น source ของ sales quantity/revenue
- source cost/allocation ที่ระบบรับรอง เป็น source ของ COGS
- Stock ledger เป็น source ของ stock movement และ stock value movement
- master data เป็น source ของ branch, product, supplier, customer และ channel identifiers
- report fact เป็น derived read model เท่านั้น ไม่รับ direct business write จาก UI

### 3.2 Reporting Tables

#### `report_profit_cost_facts`

เก็บ fact ระดับ source line และ event ที่เกิดขึ้นจริง

คอลัมน์หลัก:

- `id bigint generated always as identity`
- `source_type text`
- `source_doc_no text`
- `source_line_no integer`
- `source_event_key text`
- `event_date date`
- `branch_id bigint`
- `product_id bigint`
- `supplier_id bigint null`
- `customer_id bigint null`
- `purchase_channel_id bigint null`
- `sales_channel_id bigint null`
- `fact_type text`
- `quantity numeric(18,3)`
- `purchase_amount numeric(18,2)`
- `revenue_amount numeric(18,2)`
- `cogs_amount numeric(18,2)`
- `stock_quantity_delta numeric(18,3)`
- `stock_value_delta numeric(18,2)`
- `projected_at timestamptz`
- `source_updated_at timestamptz`

Unique contract:

```text
(source_type, source_doc_no, source_line_no, source_event_key, fact_type)
```

ค่าที่ไม่เกี่ยวข้องกับ fact type ต้องเป็นศูนย์ ไม่ใช้ `null` แทนความหมายเชิงจำนวน ส่วน dimension ที่ไม่มีตามชนิดเอกสารใช้ `null` ได้ตาม constraint

#### `report_profit_cost_daily`

เก็บผลรวมรายวันตาม dimension ที่ใช้ filter จริง:

- `event_date`
- `branch_id`
- `product_id`
- `supplier_id`
- `customer_id`
- `purchase_channel_id`
- `sales_channel_id`
- quantity และ amount columns ชุดเดียวกับ fact table
- `refreshed_at`

Primary/unique key ต้องครอบ dimension ทั้งหมดด้วย null-safe key strategy ที่กำหนดใน migration ไม่ใช้ string sentinel ใน runtime code

#### `report_profit_cost_reconciliation_issues`

เป็น view หรือ table สำหรับตรวจ source ที่ project ไม่ได้ เช่น:

- product ID หาย
- branch ID หาย
- source line cost หาย
- channel ID ไม่ตรง master contract
- header total ไม่ตรงกับผลรวม lines
- fact total ไม่ตรงกับ source total

Issue ต้องมี source document reference, issue code, detected value และเวลาตรวจ เพื่อแก้ที่ source/migration โดยไม่เติม fallback ใน report service

### 3.3 Numeric Contract

- เงินใช้ `numeric(18,2)`
- น้ำหนัก/จำนวนที่เป็นน้ำหนักใช้ `numeric(18,3)`
- GP คำนวณเป็น `revenue_amount - cogs_amount`
- GP% คำนวณเมื่อ revenue ไม่เป็นศูนย์เท่านั้น
- average price คำนวณเมื่อ quantity ไม่เป็นศูนย์เท่านั้น
- API ส่ง decimal เป็น string และ client format เพื่อแสดงผล; ห้ามใช้ floating-point สำหรับการรวมยอด

## 4. Projection Lifecycle

### 4.1 Document Confirmation

เมื่อ PB, SB หรือ stock event ถูกยืนยัน:

1. business transaction สำเร็จใน DB
2. projector upsert facts ด้วย unique source key ใน transaction เดียวกันหรือผ่าน durable DB function ที่ถูกเรียกใน transaction เดียวกัน
3. projector ปรับ daily rollup เฉพาะวันที่และ dimensions ที่เปลี่ยน
4. transaction commit แล้ว API รายงานครั้งถัดไปเห็นข้อมูลใหม่ทันที

Draft ไม่สร้าง report fact

### 4.2 Edit, Cancel And Reversal

- เอกสารที่แก้ก่อนยืนยันไม่กระทบ fact
- การแก้เอกสารที่ยืนยันแล้วต้อง reverse fact ชุดเดิมและสร้าง fact ชุดใหม่ตาม lifecycle ที่ระบบอนุญาต
- การยกเลิก/reversal ต้องสร้างการกลับรายการที่ trace กลับ source ได้ ไม่ delete audit history แบบไร้ร่องรอย
- projector ต้อง idempotent; เรียกซ้ำแล้วผลรวมไม่เพิ่มซ้ำ

### 4.3 Backfill

เพิ่มคำสั่ง backfill แบบแบ่งช่วงวันที่และ restart ได้:

1. preflight ตรวจ source contract
2. project facts ตาม source lifecycle ที่อนุมัติ
3. rebuild daily rollup
4. compare source totals กับ fact totals
5. หยุด cutover หากมี blocking reconciliation issue

ไม่แก้ข้อมูล production อัตโนมัติจาก report migration; ข้อมูลผิดต้องมี migration/data-fix แยกและตรวจผลได้

### 4.4 Reconciliation

- nightly job ตรวจ source-to-fact และ fact-to-rollup
- มีคำสั่ง manual reconcile ตาม date range/document
- mismatch ต้องสร้าง issue และ alert ฝ่ายดูแล ไม่ใช้การคำนวณสำรองใน API

## 5. API Design

ทุก endpoint ต้องผ่าน auth/permission contract เดิม ใช้ `private, no-store` และไม่เขียน report response ลง Redis/browser persistent cache

| Endpoint | Responsibility |
|---|---|
| `GET /api/profit-cost-analysis/summary` | KPI รวมและ filter options ที่จำเป็นต่อหน้าแรก |
| `GET /api/profit-cost-analysis/rankings` | Top 5/Top 10 ตาม metric ที่ระบุ |
| `GET /api/profit-cost-analysis/products` | Product table แบบ server pagination/sort |
| `GET /api/profit-cost-analysis/suppliers` | Supplier analysis แบบ server pagination/sort |
| `GET /api/profit-cost-analysis/customers` | Customer analysis แบบ server pagination/sort |
| `GET /api/profit-cost-analysis/channels` | Purchase/Sales channel analysis |
| `GET /api/profit-cost-analysis/trend` | Time-series ตามช่วงวันที่และ granularity |
| `GET /api/profit-cost-analysis/alerts` | Reconciliation/business alerts ที่ผู้ใช้มีสิทธิ์เห็น |

Common query contract:

- `from`, `to`
- `branchId`
- `productId`
- `supplierId`
- `customerId`
- `purchaseChannelId`
- `salesChannelId`
- endpoint ตารางเพิ่ม `page`, `pageSize`, `sortBy`, `sortDirection`

ข้อกำหนด:

- IDs เป็น internal DB IDs ตาม schema เท่านั้น
- query ที่ไม่ถูกต้องตอบ validation error ไม่ใช้ default/fallback เงียบ ๆ
- sort field ใช้ allowlist ต่อ endpoint
- page size ใช้ค่าจาก design contract กลาง
- response มี `generatedAt` และ applied filter echo สำหรับ stale-response verification
- เพิ่ม `Server-Timing` อย่างน้อย `auth`, `query`, `serialize`, `total`

## 6. Frontend Design

### 6.1 Loading Sequence

1. โหลด summary และ rankings พร้อมกัน
2. โหลด active tab เท่านั้น
3. เปลี่ยน tab จึงโหลด endpoint ของ tab นั้น
4. table pagination/sort เรียก server เฉพาะข้อมูลหน้าที่ต้องแสดง

### 6.2 Filter Behavior

- form เก็บ `draftFilters` แยกจาก `appliedFilters`
- user กด Apply จึงเปลี่ยน query ชุดรายงาน
- Reset คืนค่าตาม default range contract และต้องกด Apply หรือทำเป็นคำสั่ง Apply+Reset เดียวที่ระบุชัด
- request ใหม่ abort request เดิมด้วย AbortController
- response ต้องตรงกับ request ID/applied filter ก่อน update UI

### 6.3 Loading And Error States

- summary, rankings และ active table มี skeleton/error boundary แยกกัน
- tab หนึ่งล้มเหลวไม่ทำให้ KPI หาย
- reconciliation/blocking data issue แสดงข้อความที่ trace ไป source ได้ตาม permission
- ไม่แสดงค่าศูนย์แทนข้อมูลที่โหลดไม่สำเร็จ

### 6.4 Existing Visual Contract

คงโครง UI และ design system ปัจจุบัน เว้นแต่ส่วนที่จำเป็นต่อ performance:

- Top panel แสดง 5 รายการเริ่มต้นและขยายเป็น 10
- pagination อยู่หัวตารางตาม design กลาง
- shared filter/dropdown/table components เดิม
- dark/light mode และ Sarabun ตาม `docs/design.md`

## 7. Configuration And No-Fallback Rules

- target margin ต้องมาจาก configuration ที่มี schema, owner และ effective value ชัดเจน
- ห้าม fallback COGS จาก header total เมื่อ line cost หาย
- ห้ามสร้าง product identity จากชื่อหรือ JSON payload
- ห้ามแปลง channel business code เป็น internal ID ด้วยการเดา
- ห้ามรวม draft/cancelled transaction; status inclusion ต้องกำหนดเป็น DB/query contract ต่อ source type
- record ที่ contract ผิดเข้า reconciliation issue และต้องแก้ที่ source/data migration

## 8. Migration And Cutover

แบ่งเป็น batch ที่ review และ rollback ได้:

1. **Instrumentation baseline**: เก็บ query plan, row count, auth/query/serialization timings และ response size
2. **Schema**: สร้าง fact, daily rollup, reconciliation objects, constraints และ indexes
3. **Backfill**: project historical data ใน production และเปรียบยอดรายวัน/รายเดือนกับ source
4. **Projectors**: ผูก lifecycle PB, SB และ stock พร้อม idempotency tests
5. **Read APIs**: เพิ่ม split endpoints, decimal serialization และ server pagination
6. **Frontend**: lazy-load active tab, Apply filters, AbortController และ independent states
7. **Shadow parity**: รัน old/new calculations เทียบกันโดยไม่เปิดให้ผู้ใช้
8. **Cutover**: เปลี่ยนหน้าไปใช้ APIs ใหม่เมื่อ parity ผ่าน
9. **Cleanup**: ลบ old aggregate service หลังช่วงสังเกตการณ์และไม่มี consumer

Rollback ระหว่าง shadow period ทำได้โดยสลับ reader กลับ API เดิม; ห้าม drop source columns/tables ใน batch นี้

## 9. Index Strategy

ขั้นต่ำต้องมี indexes สำหรับ:

- facts: `(event_date, branch_id, product_id)`
- facts: `(source_type, source_doc_no)`
- facts: supplier/customer/channel dimensions ตาม query plan จริง
- daily: `(event_date, branch_id)`
- daily: `(product_id, event_date)`
- daily: supplier/customer/channel + date ตาม endpoint

ไม่สร้าง index ทุก permutation ล่วงหน้า ต้องยืนยันด้วย `EXPLAIN (ANALYZE, BUFFERS)` และ production-like data volume

## 10. Validation

### Database

- migration up/down safety ตาม project migration policy
- unique/idempotency constraints
- status/party/dimension constraints
- source-to-fact and fact-to-rollup reconciliation
- backfill restartability
- `EXPLAIN (ANALYZE, BUFFERS)` สำหรับ query สำคัญ

### Service/API

- filter combinations และ branch permission scope
- decimal precision
- server pagination/sort allowlist
- malformed query rejection
- cancelled/reversed exclusion
- no fallback when source malformed
- `private, no-store` headers และ `Server-Timing`

### Frontend

- initial page requests only summary, rankings and active tab
- tab switch lazy-loads only selected dataset
- Apply/Reset behavior
- abort stale requests
- table pagination and sorting
- independent loading/error states

### Performance Acceptance

- warm summary API application time: p95 <= 300 ms
- warm tab API application time: p95 <= 300 ms สำหรับ page size มาตรฐาน
- initial report payload ไม่รวมข้อมูลของ inactive tabs
- filter action ไม่สร้าง report requests มากกว่าหนึ่งชุดต่อ Apply
- parity ของ monetary totals ต้องตรงทุกบาทและ weight ต้องตรงตาม scale 3 ตำแหน่ง

End-to-end target ต้องรายงานแยก auth/proxy จาก query เพราะ proxy overhead ปัจจุบันอาจทำให้ browser duration เกิน 300 ms แม้ report query ผ่านเกณฑ์

## 11. Cache Contract

- Classification: L5 business/report fact
- Source of truth: transaction tables + stock ledger; reporting tables เป็น derived DB read model
- HTTP: `private, no-store`
- Redis: ไม่ใช้กับ summary, ranking, tab result, balance, cost, GP หรือ stock facts
- Browser: ไม่ใช้ persistent cache; component state เก็บเฉพาะ response ปัจจุบัน
- Master option cache ใช้ได้เฉพาะ shared reference-cache contract เดิมและต้องไม่รวมราคา/ต้นทุน/stock/report value

## 12. Scope Boundaries

Included:

- Profit & Cost Analysis reporting schema, projection, reconciliation, APIs และ frontend data loading
- target-margin configuration ที่รายงานนี้ใช้
- auth/proxy instrumentation ที่จำเป็นต่อการวัดผล

Excluded:

- เปลี่ยนสูตรบัญชีหรือ business definition ของ PB/SB/stock โดยไม่มี parity decision แยก
- cache financial facts ใน Redis
- redesign หน้าอื่น
- ลบ transaction source หรือเปลี่ยน lifecycle เอกสารนอกจุดที่ใช้ project facts

## 13. Final Decisions

| Topic | Decision |
|---|---|
| Freshness | อัปเดตทันทีหลังเอกสารยืนยัน/ยกเลิก commit สำเร็จ |
| Architecture | Incremental fact ledger + daily rollup |
| Integrity | Nightly reconciliation และ manual rebuild |
| Numeric | PostgreSQL numeric; API decimal string |
| Loading | Summary/rankings ก่อน, active tab แบบ lazy load |
| Table | Server pagination and sort |
| Cache | L5, DB current read model, private/no-store, no Redis fact cache |
| Bad source data | Fail/reconcile and fix source; no runtime fallback |
| Cutover | Shadow parity ก่อนสลับ reader และเก็บ old path ชั่วคราวเพื่อ rollback |
