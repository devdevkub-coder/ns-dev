# NS Scrap ERP Design Conventions

## Purpose

ไฟล์นี้เป็น source of truth สำหรับ UI conventions ของ active Next app (`apps/next/`) ในส่วนที่ต้องใช้ตัดสินใจซ้ำข้ามหลายหน้า เช่น list page, filter, table, pagination, button, wording, และ column behavior

ใช้ไฟล์นี้เมื่อ:
- สร้างหน้าใหม่ที่เป็น list/detail/form ของ ERP
- ปรับหน้าที่มี pattern ซ้ำกับ `purchase`, `sales`, `payments`, `master-data`
- ต้องตัดสินใจว่าหน้าใหม่ควรเหมือนหน้ามาตรฐานไหน

ถ้าหน้าใดต้องต่างจาก baseline นี้ ให้บันทึก override แบบระบุหน้าและเหตุผลไว้ใน `docs/migration/00-current-work.md`

## Core Principles

- Legacy-first: ถ้า legacy/Vue มี pattern ชัด ให้เริ่มจาก pattern เดิมก่อน
- ถ้า Vue clone ถูก simplify หรือมี column/layout drift ให้ใช้ `old-apps/legacy/` เป็น visual baseline ที่แรงกว่า
- ERP-first: เน้นความหนาแน่น, ความชัด, การ scan ข้อมูล และ workflow ที่ใช้ซ้ำทุกวัน
- Consistency over novelty: หน้าใกล้เคียงกันควรใช้ interaction และ wording ชุดเดียวกัน
- Dense but readable: ข้อมูลแน่นได้ แต่ spacing, alignment, และ hierarchy ต้องนิ่ง
- One source of wording: คำเรียกเอกสาร, สถานะ, สาขา/คลัง, payment terms ต้องไม่สลับไปมา

## Typography

- user-facing baseline font ของ active Next app คือ `Noto Sans Thai`
- form controls (`button`, `input`, `select`, `textarea`) ต้องใช้ baseline เดียวกับ body
- print/preview templates ของ active app ต้องใช้ `Noto Sans Thai` เช่นกัน เว้นแต่มีเอกสาร legacy override ที่อนุมัติไว้ชัดเจน

## List Page Pattern

ใช้กับหน้ากลุ่ม transaction และ report list เป็นหลัก

- topbar อธิบายหน้าที่ของหน้าได้ แต่ไม่ควรมี info card/banner ซ้ำในตัวหน้า ถ้าไม่ได้เพิ่มข้อมูลใหม่
- filter section อยู่เหนือ table เสมอ
- count, page size, และ pagination อยู่แถวเดียวกันเหนือ table
- table เป็นศูนย์กลางของหน้า ไม่ใช้ card ซ้อน card
- row action อยู่คอลัมน์ขวาสุด
- ถ้ากดแถวเพื่อเปิด detail ได้ ให้ทั้งแถว clickable และปุ่มย่อยต้อง `stopPropagation()`

Reference pages:
- `/purchase/bills`
- `/sales/bills`
- `/purchase/payments`
- `/purchase/payment-history`

## Filter Pattern

filter shell มาตรฐานของ list page:

1. แถวบน:
- search field
- date range
- clear filter
- page actions เช่น `ส่งออก Excel`, `+ สร้างรายการ`

2. แถวถัดมา:
- segmented filters เช่น ประเภท, สถานะ

Rules:
- search ต้องมาก่อน filter อื่น
- date range ใช้รูปแบบ from -> to
- clear filter แสดงเมื่อมี active filter เท่านั้น
- ถ้า filter อยู่ในบริบทเดียวกัน ให้รวมอยู่ card/block เดียว
- หลีกเลี่ยง dropdown ที่ไม่จำเป็น ถ้า segmented control ชัดกว่า

## Table Pattern

ตารางใน active app ต้องอ้างอิงมาตรฐานกลางจาก section นี้ ไม่อ้างอิง `/purchase/bills` หรือหน้าใดหน้าหนึ่งเป็น baseline แบบ implicit

### Shared Base

- container: white background, rounded corners, shadow
- header: `bg-slate-100` เป็น default เว้นแต่หน้ามี legacy header pattern เฉพาะ
- row height: compact, อ่านง่าย, spacing ต้องนิ่งข้ามหน้า
- sorting: กดที่ header โดยตรง
- empty state: ใช้ข้อความสั้นตรงไปตรงมา เช่น `ยังไม่มีรายการ`
- loading state: ใช้ข้อความ `กำลังโหลดข้อมูล`
- action column อยู่ขวาสุดเสมอ
- legacy-style action text/link ในตารางให้คงโทนที่ผู้ใช้คุ้นเคย เว้นแต่มีปุ่ม page-specific ที่ชัดกว่า
- status cell ใช้ pattern `dot + สีข้อความ` เป็น baseline กลาง; หลีกเลี่ยง badge background ถ้าไม่จำเป็นตาม legacy/page override

### Table / Plain

ใช้กับ transaction list ที่ต้องการความเบา, scan เร็ว, และไม่ต้องพึ่งเส้นคั่นแถว เช่น:

- `/daily/weight-ticket-list`

Rules:

- ไม่มีเส้นคั่นใน `tbody`
- ใช้ `hover:bg-*` และ spacing ช่วยแยกแถวแทนเส้น
- header ยังคงแยกจาก body ได้ด้วย `thead` background
- เหมาะกับหน้าที่มี status/action เด่นและ user กดเข้า detail จากทั้งแถว

### Table / Lined

ใช้กับหน้าที่ข้อมูลแน่น, มีตัวเลขหลายคอลัมน์, หรือผู้ใช้ต้องไล่แถวเทียบกันแบบ ledger/listing เช่น:

- `/purchase/bills`
- `/sales/bills`
- `/purchase/po-buy`

Rules:

- ใช้ slate row separators ใน `tbody`
- divider ต้องเบา (`divide-slate-100` หรือใกล้เคียง) ไม่หนักเกินจนรบกวนสายตา
- คง hover state ได้ แต่ไม่ใช้เส้นเข้มซ้อนหลายชั้น

### Overrides

ถ้าหน้าใดมี legacy header color เฉพาะ เช่น AP/AR/finance table ให้ถือว่าเป็น page-specific override และบันทึกไว้ใน `docs/migration/00-current-work.md`

## Pagination Pattern

ใช้แถวสรุปเหนือ table:

- ซ้าย: `พบทั้งหมด X รายการ`
- ขวา:
  - page size selector
  - `ก่อนหน้า`
  - `หน้า X / Y`
  - `ถัดไป`

Rules:
- อย่าแสดง summary card ซ้ำกับ count bar ถ้าไม่ได้มี metric ใหม่
- ใช้คำว่า `หน้า X / Y` สำหรับ pagination state
- transaction/large data ให้ใช้ server-side pagination/filter/sort เป็น default
- small/medium master data สามารถใช้ frontend pagination หลัง load ครั้งเดียวได้

## Column Rules

### Numeric

- ชิดขวาเสมอ
- ใช้ `tabular-nums`
- ใช้ `whitespace-nowrap`
- ความกว้างมาตรฐาน:
  - numeric default: `w-40`
  - numeric sortable / header แน่น: `w-44`
- รองรับอย่างน้อยหลัก `100,000,000.00` ถ้าเป็นคอลัมน์มูลค่า

### Document Number

- ใช้ font mono
- ไม่ตัดบรรทัด
- ถ้าต้อง lock width ให้พอสำหรับเลขเอกสารจริงของ flow นั้น

### Date

- ใช้ format เดียวกันภายในหน้าเดียว
- ถ้าเป็น header ต้องระบุให้ชัดว่าเป็นวันอะไร เช่น `วันที่สร้างรายการ`, `วันที่กำหนดส่ง`

### Long Text

- ข้อความยาวใช้ truncate ได้
- ถ้าตัดเป็น `...` ต้องมี tooltip หรือวิธีอ่านข้อความเต็ม

### Multi-value Cell

- ถ้าหนึ่ง row มีหลายค่า เช่น หลาย `PMT`, หลายบัญชี, หลายธนาคาร ให้แสดงหลายบรรทัดใน cell เดียว
- อย่าบีบรวมจนอ่านไม่ออก

## Button Pattern

### Primary

- ใช้สำหรับ action หลักของหน้า เช่น `+ บิลขายใหม่`
- ขนาดมาตรฐาน `text-sm`
- font ปกติ

### Secondary

- ใช้กับ action รอง, filter reset, view/detail

### Destructive

- ใช้กับ cancel/delete/reverse ตาม flow ที่เปิดใช้งานจริง

### Export

baseline ปุ่ม export สำหรับ transaction list:

- สีเขียว
- icon download
- ข้อความ `ส่งออก Excel`
- `text-sm`
- font ปกติ
- วางใน filter/action row ด้านขวา

ถ้าจะใช้ component ใหม่หรือหน้าใหม่ ให้ยึด baseline นี้ก่อน เว้นแต่หน้านั้นมี legacy override ชัดเจน

## Form Pattern

- label ชัด, ไม่ใช้คำย่อที่กำกวม
- field บังคับใช้ `*`
- read-only field ต้องดูออกว่าแก้ไม่ได้
- branch dropdown แสดงชื่อ branch only เว้นแต่หน้า branch master/document numbering
- account/bank field ต้องแสดงข้อมูลตาม pattern ที่ผู้ใช้คุ้นเคย
- ใช้ section grouping เฉพาะเมื่อช่วยให้ form อ่านง่ายขึ้นจริง

## Status and Badge Rules

status wording ต้องนิ่งใน flow เดียวกัน เช่น purchase bills:

- `ยังไม่จ่าย`
- `จ่ายบางส่วน`
- `เสร็จสิ้น`
- `ยกเลิก`

Rules:
- อย่าใช้ status technical/raw จาก DB ตรง ๆ ถ้ามี business wording ที่ชัดกว่า
- badge color ต้องใช้ซ้ำได้และไม่สลับความหมายข้ามหน้า

## Wording Conventions

ใช้คำต่อไปนี้เป็น baseline จนกว่าจะมีการเปลี่ยนอย่างเป็นทางการ:

- `สาขา/คลัง`
- `เลขที่บิลซื้อ`
- `เลขที่การชำระเงิน`
- `วันที่สร้างรายการ`
- `บัญชีที่ใช้ทำจ่าย`
- `ส่งออก Excel`

ถ้ามีการเปลี่ยน wording ที่ใช้ซ้ำหลายหน้า ให้บันทึกในไฟล์นี้ ไม่ใช่แค่ใน current work

## Page-Specific Overrides

- `ข้อมูลบริษัท (สำหรับใบพิมพ์)` อยู่ในหมวด `ตั้งค่าระบบ` ไม่ใช่ `ข้อมูลหลัก`
- เมนู `ตั้งค่าระบบ` ควรรวมอย่างน้อย `VAT / WHT` และ `ข้อมูลบริษัท (สำหรับใบพิมพ์)` ใต้กลุ่มเดียวกัน

อนุญาตให้ต่างจาก baseline ได้ เมื่อ:

- legacy page มีสีหัวตารางเฉพาะที่เป็นส่วนหนึ่งของการสื่อความหมาย
- หน้าเป็น dashboard/report hero ที่ต้องมี KPI cards
- หน้าเป็น finance/accounting surface ที่มี color language เฉพาะ

Override ต้อง:
- ระบุหน้า
- ระบุสิ่งที่ต่าง
- มีเหตุผลเชิง business หรือ legacy parity

## Implementation References

reference implementation ที่ใช้อ้างอิงได้ตอนนี้:

- `apps/next/src/components/daily/TransactionBillsPageClient.tsx`
- `apps/next/src/components/daily/MoneyMovementPageClient.tsx`
- `apps/next/src/components/master-data/shared/MasterDataPageClient.tsx`

เวลาเริ่มหน้าใหม่ ให้ดู reference ที่ใกล้ domain ที่สุดก่อน

## Change Log

- 2026-05-23: สร้าง `docs/design.md` เพื่อแยก design conventions ออกจาก `docs/migration/00-current-work.md` และใช้เป็น source กลางสำหรับ list/filter/table/pagination/button/wording rules
