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

## Quantity And Unit Display

- สินค้ารองรับหน่วย `กก.` และ `ลัง` จาก master data สินค้า/product unit
- ค่า quantity ของสินค้าต่างหน่วยต้องไม่ถูกรวมเป็นเลขเดียวใน UI/เอกสาร ถ้าไม่มี conversion rule ที่ตั้งใจใช้และอนุมัติไว้ชัดเจน
- Default ใหม่คือแยกหน่วยให้ชัดเจนทุกที่ที่ทำได้ โดยเฉพาะรายการสินค้า, detail modal, print preview, export, บิลซื้อ, บิลขาย, ใบเสร็จ, ใบสำคัญรับเงิน, และเอกสารที่คนนอกเห็น
- รายการสินค้าแต่ละบรรทัดต้องแสดง `จำนวน + หน่วยจริง` จาก snapshot ของเอกสารหรือ master data สินค้า เช่น `100 กก.` หรือ `8 ลัง`
- Summary/KPI ที่มีสินค้าหลายหน่วยควรแสดงแยกตามหน่วย เช่น `รวม 1,250 กก. / 32 ลัง` แทนการรวมเป็น `1,282`
- ฟอร์มกรอกข้อมูลที่รับได้ทั้งสองหน่วยใช้ label กลางได้ เช่น `จำนวน (กก./ลัง)` หรือ `ราคา/หน่วย`; ห้ามใช้ `กก.` อย่างเดียวถ้า field นั้นอาจใช้กับสินค้า unit `ลัง`
- Field/column ที่เป็นราคา unit-price ให้ใช้คำกลาง `ราคา/หน่วย` เว้นแต่ flow นั้นยืนยันว่าเป็นน้ำหนักกิโลกรัมเท่านั้น

## Typography

- user-facing baseline font ของ active Next app คือ `Noto Sans Thai`
- form controls (`button`, `input`, `select`, `textarea`) ต้องใช้ baseline เดียวกับ body
- print/preview templates ของ active app ต้องใช้ `Noto Sans Thai` เช่นกัน เว้นแต่มีเอกสาร legacy override ที่อนุมัติไว้ชัดเจน

## Print Document Baseline

- เอกสารพิมพ์ที่เป็นเอกสารบริษัท เช่น ใบรับของ, ใบส่งของ, บิลรับซื้อ, ใบเสร็จ, ใบสำคัญรับ/จ่าย ต้องใช้ `ข้อมูลบริษัท (สำหรับใบพิมพ์)` จากเมนูระบบเป็น source ของหัวกระดาษ
- ห้าม hardcode ชื่อบริษัท, ที่อยู่, เลขผู้เสียภาษี, หรือ footer note ใน template ของเอกสารธุรกิจ
- โลโก้บริษัทต้องมาจาก Company Profile เท่านั้น; ถ้ายังไม่มี logo หรือข้อมูลบริษัทของสาขานั้น ให้แสดง `ไม่มีข้อมูล` ในตำแหน่งข้อมูลนั้น ห้ามใช้ default/fallback company logo หรือข้อมูลบริษัทจากแหล่งอื่น
- print preview ควรเป็น A4/browser-print friendly และรองรับ Save as PDF จาก browser print
- template ต้องแยกข้อมูลที่เป็น snapshot ของเอกสาร เช่น คู่ค้า, รายการสินค้า, ราคา, VAT, และเลขอ้างอิง ออกจาก master data ปัจจุบัน เพื่อไม่ให้เอกสารเก่าเปลี่ยนความหมายเมื่อ master data ถูกแก้
- ถ้ามีรูปตัวอย่างจากลูกค้า ให้ใช้รูปนั้นยืนยันข้อมูลที่ต้องแสดงและข้อจำกัดธุรกิจก่อน ส่วนการลอก layout หรือ redesign ให้เป็น corporate template ต้องระบุใน flow document ของเอกสารนั้น

## Sizing Tokens

อ้างอิง baseline จาก:
- `/purchase/bills`
- `apps/next/src/components/daily/TransactionBillsPageClient.tsx`

ให้ใช้ค่าพวกนี้เป็น default ก่อนเสมอ ถ้าหน้าใหม่ไม่มีเหตุผลชัดเจนพอที่จะ override

### Filter Row

- filter shell wrapper: `rounded-md bg-white p-3 shadow`
- filter row gap: `gap-2`
- search field:
  - min width: `min-w-[260px]`
  - height target: `h-9`
- date range controls:
  - height target: `h-9`
  - ใช้คู่ `from -> to` ในแถวเดียวกัน
- clear filter button:
  - height target: `h-9`
  - ใช้ขนาด visual เดียวกับ control row อื่น
- page action button ใน filter row เช่น `+ สร้างรายการ`, `ส่งออก Excel`:
  - height target: `h-9`

### Segmented Filter

- label เช่น `ประเภท:` / `สถานะ:` ใช้ `text-xs text-slate-500`
- segmented button baseline:
  - `rounded-md border px-3 py-1 text-xs font-medium`
- active:
  - `border-slate-700 bg-slate-700 text-white`
- inactive:
  - `border-slate-300 bg-white hover:bg-slate-50`
- segmented filter row gap: `gap-2`

### Pagination Row

- pagination summary row: `flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600`
- page size selector:
  - explicit class baseline: `h-9 w-auto px-2 py-1`
- pagination buttons `ก่อนหน้า` / `ถัดไป`:
  - rendered height must equal page size selector height
  - baseline target: `h-9`
- page indicator:
  - use `หน้า X / Y`
  - horizontal padding baseline: `px-1`

### Table

- table container: `overflow-x-auto rounded-md bg-white shadow`
- table text size baseline: `text-sm`
- table header background: `bg-slate-100`
- header cell padding baseline: `p-2`
- body cell padding baseline: `p-2`
- empty/loading state cell padding baseline: `p-8`

### KPI / Summary Cards Above Table

- **AcexPOS Style (Card-based with Icons)**:
  - **Outer wrapper (กรอบภายนอก)**: [ยกเลิกการใช้งาน / นำออก] ในดีไซน์ล่าสุดให้นำกรอบพื้นหลังสีเทาอ่อน, เส้นขอบ, และเงาด้านหลังออกทั้งหมดเพื่อลดการทับซ้อนของขอบ โดยใช้เพียง Grid Layout เปล่าๆ ในการจัดวางการ์ดโดยตรง เช่น `grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-5 text-sm`
  - **Inner item card (การ์ดสถิติย่อยสีขาว)**: พื้นหลังสีขาวลอยตัว `bg-white p-3 sm:p-5 border border-slate-200 rounded-xl shadow-sm flex items-center gap-2.5 sm:gap-4`
  - **Circular Icon (วงกลมสัญลักษณ์ฝั่งซ้าย)**: `w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-[color] flex items-center justify-center text-xl shrink-0` ใช้สัญลักษณ์ Emoji ด้านในเพื่อความพรีเมียม
  - **Typography (ขนาดฟอนต์ของข้อความ)**:
    - **ป้ายกำกับ (Label)**: ใช้ขนาด `text-xs` และใช้สีสัญลักษณ์ตามประเภทข้อมูล เช่น `text-blue-600`, `text-emerald-600`
    - **ตัวเลขข้อมูล (Value)**: ใช้ขนาดตัวหนังสือปกติร่วมกับคลาสตัวหนา `font-bold` (ไม่เพิ่มขนาดเป็น `text-2xl` หรือใช้ระยะห่างเพิ่มเติม เพื่อความสะอาดตาและประหยัดพื้นที่หน้าจอ)
  - **Responsive Mobile Grid (การจัดวางหน้าจอมือถือ)**:
    - บนหน้าจอมือถือ/แท็บเล็ตขนาดเล็ก ต้องจัดวางเป็น **2 คอลัมน์ เสมอ** (`grid-cols-2 lg:grid-cols-5`) เพื่อประหยัดพื้นที่แนวตั้ง ไม่ให้การ์ดเรียงซ้อนกันเป็นแถวเดี่ยวแนวตั้งยาวเกินไป
    - หากการ์ดสถิติมี 5 ใบ การ์ดที่ 5 จะต้องกำหนดให้ยืดเต็มความกว้าง (`col-span-2 lg:col-span-1`) เพื่อความสมมาตรและสมดุลของสายตา

### Form Surface

- form container baseline: `rounded-md bg-white p-4 shadow`
- side summary panel baseline: `rounded-md border border-slate-200 bg-slate-50 p-4`
- form grid gap baseline: `gap-3`
- section spacing baseline: `space-y-4`
- field label baseline: `mb-1 text-xs font-medium text-slate-600`

### Validation Error Pattern

ใช้เป็น baseline กลางของ active Next app สำหรับทุก form ที่มี validation ตอนกด `บันทึก` / `ตกลง` / `ยืนยัน`

Rules:
- field ที่เป็น required หรือ field ที่ schema/API boundary ตัดสินว่า invalid ต้องแสดง error ที่ตัว field นั้นโดยตรง ไม่ไปกองเป็นข้อความรวมด้านบนอย่างเดียว
- field ที่ invalid ต้องมี `กรอบสีแดง` และ `พื้นหลังแดงอ่อน` ทันทีในรอบ submit เดียวกัน
- ต้องมี `ข้อความ error ใต้ field` เป็นภาษาที่ผู้ใช้ทำงานต่อได้ทันที
- เมื่อ submit ไม่ผ่าน ระบบต้อง `scroll` ไปหา field แรกที่ invalid และ `focus` field นั้นอัตโนมัติ
- ถ้าเป็น list/line item form เช่น `items.N.price` หรือ `items.N.productId` ต้องชี้ error กลับไปที่ row และช่องจริงนั้น ไม่ชี้รวมที่ section `items` เว้นแต่เป็น error ระดับทั้งกลุ่มจริง ๆ
- helper/component กลางของ form เช่น `Input`, `textarea`, `select`, searchable combobox, date picker, required select และ branch/supplier/product pickers ต้องรองรับ pattern นี้เหมือนกัน
- required marker `*` อย่างเดียวไม่พอ; หลัง submit ไม่ผ่าน user ต้องเห็นทั้ง visual error state และ focus jump

Reference baseline:
- `/purchase/bills`
- `apps/next/src/lib/form-errors.ts`
- `apps/next/src/components/daily/TransactionBillsPageClient.tsx`

## List Page Pattern

ใช้กับหน้ากลุ่ม transaction และ report list เป็นหลัก โดยยึดหน้าจอ `/sales/po-sell` ([PoSellPageClient.tsx](file:///c:/new-ns-scrap-erp/apps/next/src/components/sales/PoSellPageClient.tsx)) เป็นรูปแบบมาตรฐานสูงสุด (Baseline) สำหรับการออกแบบและจัดวาง ทั้งบนเดสก์ท็อปและมือถือเพื่อให้ทุกหน้าจอดูเป็นระเบียบ เรียบร้อย และใช้งานง่ายในแนวทางเดียวกัน

### 1. โครงสร้าง Layout หลัก (Page Structure)

ประกอบด้วยส่วนหลักๆ เรียงลำดับจากบนลงล่างดังนี้:
1. **KPI / Summary Cards**: วงกลมสัญลักษณ์ฝั่งซ้าย + ตัวเลขหนาและป้ายกำกับขนาดเล็ก (ยึดตามรูปแบบ AcexPOS Style ในหัวข้อถัดไป)
2. **แถวค้นหาและตัวกรอง (Filter Section)**: ทำหน้าที่ควบคุมเงื่อนไขการค้นหา แยกการจัดวางระหว่าง Desktop และ Mobile
3. **แถว Pagination และสรุปจำนวน (Pagination Row)**: แสดงจำนวนรายการทั้งหมดและตัวเลือกการแบ่งหน้า
4. **พื้นที่แสดงข้อมูล (Data Area)**: ใช้ **Table** บน Desktop และสลับเป็น **Dense Card-based List** บน Mobile
5. **Floating Action Button (FAB)**: ปุ่มลอยสำหรับกดสร้างรายการด่วนบนมือถือ

---

### 2. รูปแบบสำหรับหน้าจอคอมพิวเตอร์ (Desktop Layout)

- **Filter Row**: วางเป็นบรรทัดเดียวกัน ประกอบด้วย ช่องค้นหาหลัก (`min-w-[260px]`), Date Picker (จาก -> ถึง), และปุ่มล้างตัวกรอง (แสดงเมื่อมีการเลือกตัวกรอง)
- **Desktop Page Action Buttons**: ปุ่มแอ็กชันหลัก เช่น **`ส่งออก Excel` (ปุ่มสีเขียว)** และ **`+ [ชื่อรายการ] ใหม่` (ปุ่มสีเข้ม slate-900)** ให้จัดวางไว้ขวาสุดในแถวตัวกรองเดียวกัน โดยใช้คลาส `ml-auto` เพื่อความกระชับและไม่เพิ่มความสูงของแถวโดยไม่จำเป็น
- **Status Segmented Filter**: ปุ่มตัวเลือกสถานะย่อย (เช่น สถานะเอกสาร, สถานะการจับคู่) จัดเป็นปุ่มขอบมนสีทึบ/สีอ่อนสลับกันตามสถานะการเลือก โดยวางแยกประเภทละหนึ่งบรรทัดอยู่ใต้แถวค้นหาหลัก
- **Pagination & Table**: ใช้ Resizable Columns (Opt-in) ตารางมีเส้นคั่นแถวบางเบา (`divide-slate-100`) และ row action อยู่คอลัมน์ขวาสุด

---

### 3. รูปแบบสำหรับหน้าจอมือถือ (Mobile Layout)

- **Minimalist Search Bar**: แสดงเพียงช่องค้นหาหลัก (`flex-1 h-9`) และปุ่ม **`ตัวกรอง`** (พร้อมป้ายระบุสถานะ "(มี)" หากมีฟิลเตอร์ที่ใช้งานอยู่) อยู่เคียงคู่กันเพื่อประหยัดพื้นที่
- **ตัวกรองแบบสไลด์ขึ้นจากด้านล่าง (Filter Bottom Sheet)**:
  - เมื่อคลิกปุ่ม "ตัวกรอง" จะมีแผงเมนูเลื่อนขึ้นมาจากขอบล่าง (`Dialog` หรือ `Bottom Sheet`) กำหนดความสูงไม่เกิน `80vh` และสามารถเลื่อนดูได้
  - หัวข้อระบุ "ตัวกรองรายการ..." และมีปุ่มปิดกากบาท `&times;` ที่มุมบนขวา
  - ภายในเป็นช่องกรอกวันที่ (จัดวางเคียงคู่กัน 2 คอลัมน์) และปุ่ม Segmented Filter ขนาดเล็กสำหรับสถานะต่างๆ
  - ด้านล่างสุดมีปุ่ม **`ล้างตัวกรอง` (outline)** และ **`ใช้ตัวกรอง` (สีน้ำเงิน)** วางเคียงคู่กันแบ่งครึ่งพื้นที่สมมาตร
- **ตารางข้อมูลแบบการ์ดย่อย (Dense Card-based List)**:
  - บนมือถือให้ซ่อนตารางเดสก์ท็อป และเปลี่ยนมาแสดงรายการด้วยการ์ดแทน
  - การ์ดแต่ละใบมีขอบมนและเงานุ่มนวล: `rounded-md border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50`
  - **ส่วนหัวการ์ด**: เลขที่เอกสาร (ตัวหนาเข้ม) อยู่ฝั่งซ้าย และวันที่เอกสาร (สีเทา) อยู่ฝั่งขวา
  - **เนื้อหาการ์ด**: แสดงข้อมูลคู่ค้าและสินค้าสำคัญแยกบรรทัดให้อ่านง่าย
  - **เส้นคั่นการ์ด**: มีเส้นคั่นบางเบาระหว่างส่วนเนื้อหาและส่วนสรุปท้าย
  - **ส่วนท้ายการ์ด**: แสดงป้ายสถานะ (Status Pills) ทั้งหมดอยู่ฝั่งซ้าย และแสดงผลสรุปยอดตัวเลขหลัก (เช่น น้ำหนักรวม/มูลค่า) อยู่ฝั่งขวา
  - การ์ดทั้งใบเป็นปุ่ม Clickable เพื่อเปิด Detail Modal
- **ปุ่มสร้างลอยตัว (Floating Action Button - FAB)**:
  - แสดงปุ่มวงกลมขนาดใหญ่สีน้ำเงินหลัก (`h-14 w-14 rounded-full bg-blue-600 text-white shadow-lg fixed bottom-6 right-6 z-40`) พร้อมไอคอนเครื่องหมายบวก (`Plus`) สำหรับสร้างเอกสารได้สะดวกในคลิกเดียว

Reference pages:
- `/sales/po-sell` ([PoSellPageClient.tsx](file:///c:/new-ns-scrap-erp/apps/next/src/components/sales/PoSellPageClient.tsx))
- `/purchase/bills`
- `/sales/bills`

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

### Status Segmented Filter

filter `สถานะ` ของ list page ต้องใช้ segmented filter เป็น baseline กลางของระบบ ไม่ใช้ `select` dropdown หรือปุ่ม custom หลายหน้าแบบคนละ style เว้นแต่มี page-specific override ที่บันทึกไว้ชัดเจน

reference baseline:
- `/purchase/bills`

rules:
- วาง label `สถานะ:` นำหน้าชุด segmented filter
- ใช้ปุ่ม segmented style เดียวกันทุกหน้า:
  - active: `border-slate-700 bg-slate-700 text-white`
  - inactive: `border-slate-300 bg-white hover:bg-slate-50`
  - shape/spacing baseline: `rounded-md border px-3 py-1 text-xs font-medium`
- ถ้ามีตัวเลือก `ทั้งหมด` หรือ `ทุกสถานะ` ให้เป็น segment แรกเสมอ
- สำหรับ transaction list และ approval queue ให้ถือ `multi-select segmented filter` เป็น default กลางของ status filter
- behavior ของ multi-select:
  - กดแต่ละสถานะเพื่อ toggle เข้า/ออกจากชุด filter
  - `ทั้งหมด` / `ทุกสถานะ` ทำหน้าที่ reset กลับเป็นไม่เลือกสถานะเฉพาะใด ๆ
  - ใช้ interaction pattern เดียวกับ `/purchase/bills`
- ถ้าหน้านั้นมีเหตุผลชัดเจนว่าต้องเลือกได้ทีละ 1 สถานะเท่านั้น ค่อยใช้ single-select segmented filter และต้องมีเหตุผลจาก flow/page behavior รองรับ
- ห้ามใช้สีคนละชุดหรือขนาดคนละ scale สำหรับ status segmented filter โดยไม่มีเหตุผลจาก legacy/design note

## Table Pattern

ตารางใน active app ต้องอ้างอิงมาตรฐานกลางจาก section นี้ ไม่อ้างอิง `/purchase/bills` หรือหน้าใดหน้าหนึ่งเป็น baseline แบบ implicit

### Shared Base

- container: white background, rounded corners, shadow
- table body font: transaction list หลักใช้ scale/weight เดียวกับคอลัมน์สถานะเป็น baseline (`text-xs font-semibold`) เพื่อให้ทุกคอลัมน์ดูเป็นชุดเดียวกัน; ใช้สีเพื่อสื่อความหมายได้ เช่นยอดคงเหลือ `text-amber-700` แต่ไม่เปลี่ยน font family/weight เองทีละคอลัมน์
- header: `bg-slate-100` เป็น default เว้นแต่หน้ามี legacy header pattern เฉพาะ
- row height: compact, อ่านง่าย, spacing ต้องนิ่งข้ามหน้า
- sorting: กดที่ header โดยตรง
- sort header baseline: ใช้ปุ่มเต็มพื้นที่หัวคอลัมน์แบบ `/purchase/advance-payments` (`p-2 text-xs font-semibold text-slate-700`, hover `bg-slate-200`, ลูกศรสี `text-slate-400`) ไม่ใช้กรอบมนหรือ active สีเข้มที่ดึงสายตาเกินไป
- empty state: ใช้ข้อความสั้นตรงไปตรงมา เช่น `ยังไม่มีรายการ`
- loading state: ใช้ข้อความ `กำลังโหลดข้อมูล`
- action column อยู่ขวาสุดเสมอ
- legacy-style action text/link ในตารางให้คงโทนที่ผู้ใช้คุ้นเคย เว้นแต่มีปุ่ม page-specific ที่ชัดกว่า
- status cell ใช้ pattern `dot + สีข้อความ` เป็น baseline กลาง; ใช้ `text-xs font-semibold` และ dot เล็ก (`size-1.5`) เพื่อไม่ดึงสายตาเกิน cell อื่น; หลีกเลี่ยง badge background ถ้าไม่จำเป็นตาม legacy/page override

### Created Date Column

ทุกหน้า list/detail ที่แสดง record หรือเอกสารจากระบบต้องมี `วันที่สร้างรายการ` จาก `created_at` / system-created timestamp ให้ user เห็นเพื่อ audit

Rules:

- `วันที่สร้างรายการ` ต้องแยกจากวันที่ธุรกิจ เช่น `วันที่เอกสาร`, `วันที่จ่าย`, `วันที่รับเงิน`, `วันที่ครบกำหนด`, `วันที่รับของ`, หรือ `วันที่ส่งของ`
- label ต้องระบุชัดว่าเป็น created date ห้ามใช้คำกว้างว่า `วันที่` เฉย ๆ
- transaction list ควรแสดงเป็น column; detail/modal/print preview ควรแสดงใน metadata block ของเอกสาร
- ถ้าตารางรองรับ sort วันที่อยู่แล้ว ให้ `วันที่สร้างรายการ` sortable ได้ แต่ไม่จำเป็นต้องเป็น default sort เว้นแต่ flow นั้นต้องดูรายการล่าสุดตามเวลาที่บันทึก
- ห้ามใช้ `created_at` เป็น default business aging/date filter แทน business date ยกเว้นหน้า audit/process latency ที่ระบุไว้ชัดเจน

### Multi-Item Summary Columns

ใช้กับ table column ที่ต้องสรุปรายการย่อยหลายรายการในแถวเดียว เช่น `รายการสินค้า`, source documents, linked bills, allocations, หรือรายการจ่าย/รับที่มีหลายบรรทัด

Rules:

- ห้าม render รายการย่อยทั้งหมดเป็น comma-joined string ยาวใน cell เดียว เพราะทำให้แถวสูงเกินและ scan ยาก
- ต้องกำหนดความกว้าง column หรือ min/max width ชัดเจนตามบริบทหน้า ก่อนปล่อยให้ข้อความตัดบรรทัด
- ค่า default สำหรับ list table คือแสดงรายการแรกไม่เกิน `3` บรรทัดใน cell แล้วสรุปส่วนที่ซ่อน
- ถ้าซ่อนรายการไม่เกิน `10` รายการ ให้แสดง `และอีก N รายการ`
- ถ้าซ่อนมากกว่า `10` รายการ ให้แสดง `และอีกมากกว่า 10 รายการ`
- cell ต้องมีทางดูรายการเต็มโดยไม่เปลี่ยนหน้า เช่น tooltip/popover หรือ row detail modal; ถ้าเปิด row detail ได้อยู่แล้ว tooltip ยังควรช่วยดูแบบเร็วในตาราง
- สำหรับ `รายการสินค้า` แต่ละบรรทัดที่แสดงใน cell/tooltip/detail ต้องคง `จำนวน + หน่วยจริง` ตาม rule `Quantity And Unit Display` เมื่อข้อมูลมีอยู่
- sorting/filter/search ต้องใช้ข้อมูลเต็มของ row ไม่ใช่เฉพาะรายการที่ถูกแสดง 3 บรรทัดแรก
- export/print/detail ไม่อยู่ภายใต้ข้อจำกัด 3 บรรทัดของ list table และต้องแสดงรายการครบตามบริบทเอกสาร

### Table Row Actions

- row action ปุ่มแก้ไข/ยกเลิกใช้ขนาดเล็ก `text-xs` และอยู่ในคอลัมน์ขวาสุด
- ปุ่ม `แก้ไข` ใน row table ใช้ neutral outline แบบเบาเป็น baseline ตาม `/daily/expense`: `rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50`
- ปุ่ม `ยกเลิก` ใน row table ใช้ destructive outline แบบเบาเป็น baseline ตาม `/daily/expense`: `rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50`
- ห้ามใช้ปุ่มแดงทึบใน row table เว้นแต่เป็น confirmation dialog หรือ action หลักหลังยืนยันแล้ว
- ปุ่ม action ใน row ต้อง `stopPropagation()` ถ้า row ทั้งแถว clickable

### Resizable Columns

- ใช้เป็น opt-in สำหรับตารางข้อมูลแน่นหรือกว้างมากเท่านั้น เช่น report/history/ledger ที่ user ต้องเทียบหลายคอลัมน์
- implementation กลางใช้ `useResizableColumns(tableKey, columns)` และเก็บค่าด้วย `localStorage` key ต่อหน้า/ต่อตาราง เพื่อให้ browser/user เดิมจำความกว้างหลัง refresh
- ต้องกำหนด `defaultWidth` และ `minWidth` ทุกคอลัมน์ ห้ามให้ user ลากจนข้อมูลหลักหรือ action column ยุบใช้งานไม่ได้
- table ที่เปิด resizable ต้องใช้ `table-layout: fixed`, `colgroup`, และคง horizontal overflow wrapper ไว้สำหรับจอแคบ
- default table width ต้องเต็ม container เสมอ แม้ผลรวม default/custom column width จะน้อยกว่าความกว้าง container; ให้ใช้ `useResizableColumns().tableMinWidth` ซึ่งคำนวณเป็น `max(<column-sum>px, 100%)` เพื่อกันตารางแหว่ง แต่ยัง scroll แนวนอนได้เมื่อ column sum กว้างกว่า container
- header resize handle อยู่ที่ขอบขวาของหัวคอลัมน์, hit area เล็กและไม่ดึงสายตา, ไม่มีเส้นแบ่งท้ายหัวตารางที่เห็นชัด แต่ยังต้องมี focus outline/accessibility label สำหรับ keyboard user
- ต้องมีทาง reset กลับ default เมื่อมี custom width แล้ว โดยใช้ปุ่ม label `Set col to default` ใน toolbar/pagination row
- ถ้า header มี sort/click action อยู่แล้ว resize handle ต้อง `stopPropagation()` เพื่อไม่ trigger sort หรือ row action

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
- `/purchase/advance-payments`
- `/purchase/payments`
- `/purchase/payments` แท็บ `ประวัติ`
- `/sales/receipts` แท็บ `ประวัติ`
- `/daily/payment-approval`
- `/daily/transfer`
- `/daily/expense`
- `/daily/expense-dashboard`
- `/daily/petty-advance`
- `/daily/weight-ticket-list`
- `/purchase/receipt-vouchers`
- `/stock/transfer`
- `/purchase/bills` แท็บ `ประวัติเปลี่ยนบิล Supplier`
- `/purchase/po-buy`

Rules:

- ใช้ slate row separators ใน `tbody` ด้วย `divide-y divide-slate-100` เป็น baseline
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

### Pagination Control Sizing

reference baseline:
- `/purchase/bills`

rules:
- ปุ่ม `ก่อนหน้า` และ `ถัดไป` ต้องสูงเท่ากับ dropdown `X / หน้า`
- baseline ของ page size selector คือ `h-9`
- ดังนั้นปุ่ม pagination ในแถวเดียวกันต้องใช้ขนาดที่ render ออกมาเท่ากันกับ selector ไม่ดูเตี้ยหรือสูงกว่า
- ให้ตรวจความสูงจริงใน browser ไม่อิงแค่ชื่อ `size` ของ component เพราะบางปุ่มอาจมี padding/line-height ต่างกัน
- ถ้าหน้าใดมี pagination row แบบเดียวกัน ต้องยึดสัดส่วนเดียวกับ `/purchase/bills` เป็นค่า default

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
- field บังคับใช้ `*` เสมอ
- `*` ของ field บังคับต้องเป็น `สีแดง` และแยกจากข้อความ label ให้มองออกทันทีว่าเป็น required field
- ห้าม render `*` เป็นสีเดียวกับ label ปกติ
- read-only field ต้องดูออกว่าแก้ไม่ได้
- branch dropdown แสดงชื่อ branch only เว้นแต่หน้า branch master/document numbering
- account/bank field ต้องแสดงข้อมูลตาม pattern ที่ผู้ใช้คุ้นเคย
  - ถ้าเป็น field `บัญชีที่จ่าย`, `บัญชีรับเงิน`, `บัญชีโอน`, หรือ account selector ที่ใช้ตัดสินใจจ่ายเงินจริง:
  - option label ต้องแสดง `ชื่อบัญชี` และ `ยอดเงินคงเหลือ`
  - ใช้ wording `คงเหลือ {จำนวนเงิน}` เป็น baseline กลาง
  - baseline กลางของ option label คือ `ชื่อบัญชี (คงเหลือ x,xxx.xx)` และห้ามมี `code` หรือ `type` หลงใน control นี้ เว้นแต่มี override ที่บันทึกไว้ชัดเจน
  - ถ้ามี field `วิธีจ่าย` อยู่ก่อนใน flow เดียวกัน ต้องกรองรายการบัญชีให้เหลือเฉพาะบัญชีที่รองรับวิธีจ่ายนั้น
  - การกรองต้องอิง `accounts.type` จาก master data `บัญชีเงินบริษัท` เท่านั้น ไม่อิง `payment methods` และไม่ hardcode จากชื่อที่หน้า form
  - baseline กลาง:
    - ถ้าเลือก `ประเภท = cash` -> แสดงเฉพาะบัญชีเงินสด
    - ถ้าเลือก `ประเภท = bank` -> แสดงเฉพาะบัญชีเงินโอน/ธนาคาร
  - ถ้าเปลี่ยนวิธีจ่ายแล้วบัญชีเดิมไม่เข้ากติกา ต้องล้างค่าบัญชีที่เลือกไว้
- ใช้ section grouping เฉพาะเมื่อช่วยให้ form อ่านง่ายขึ้นจริง

### List / Form Navigation Pattern

ใช้กับหน้าที่มี `หน้าหลักรายการ` และมี `หน้าเพิ่ม/สร้าง/แก้ไข` อยู่ใน route เดียวกันหรือเป็น flow ต่อเนื่องกัน

Rules:
- ถ้า user อยู่ในหน้า `create`, `edit`, หรือ `detail-form` ที่มาจากหน้ารายการ:
  - ต้องมีปุ่ม `กลับไปหน้ารายการ` อยู่ `มุมบนซ้ายเสมอ`
  - ตำแหน่งคือ `ใต้ breadcrumb` และ `เหนือ card/form surface`
  - ห้ามวางปุ่มกลับไว้ใน card header เป็น default
- icon ของปุ่มกลับให้ใช้ `ลูกศรย้อนกลับ` ไม่ใช้ `X`
- ปุ่มนี้มีหน้าที่เป็น navigation back to list ไม่ใช่ close modal:
  - label กลางคือ `กลับไปหน้ารายการ`
  - ใช้ `outline button`
- ปุ่ม `ปิด` หรือ `ยกเลิก` ภายใน form card ยังมีได้ แต่ถือเป็น action ของ form surface ไม่ใช่ตัวแทนปุ่มกลับหลัก
- ถ้าหน้านั้นไม่มี list ต้นทางจริง หรือเป็น modal flow ให้ถือเป็น page-specific override

### Select Field Pattern

ใช้กับ `select` และ `required select` ใน form

Rules:
- ถ้า field เป็น required และยังไม่มีค่าที่เลือก:
  - placeholder เช่น `เลือกสาขา`, `เลือกบัญชี`, `เลือกวิธีจ่าย` แสดงได้
  - แต่ placeholder ต้องเป็น `disabled option`
  - placeholder ต้องไม่เป็นค่าที่ผู้ใช้เลือก submit ได้
  - ตัว control ตอนอยู่ที่ placeholder ใช้โทนสีอ่อน เช่น `text-slate-400`
- required select ให้เริ่มต้นที่ placeholder ก่อนเป็น default กลาง และให้ user กดเลือกค่าจริงเอง
- เมื่อเลือกค่าแล้ว ตัว text กลับเป็นสีปกติของ form control
- optional select ใช้ empty option ได้เมื่อ flow ต้องการค่า `ไม่ระบุ` หรือ `ทั้งหมด`
- ถ้า select เป็น branch field:
  - แสดง `ชื่อสาขา` อย่างเดียวเป็น default
  - ไม่แสดง `code · name` เว้นแต่เป็นหน้า document numbering / branch master
- ถ้าหน้าใดต้อง preselect ค่าให้ผู้ใช้ทันที ถือเป็น page-specific override และต้องมีเหตุผลจาก flow บันทึกไว้ชัดเจน

### Product Field Pattern

ใช้กับ field `ชื่อสินค้า`, `สินค้า`, `product`, และ field ที่ผู้ใช้ต้องเลือกสินค้าจาก master data

Rules:
- ให้ใช้ `searchable combobox` เป็น default กลาง ไม่ใช้ plain `select` เมื่อ user ต้องค้นหาสินค้าจากรายการ master
- ช่องต้องเปิดมาว่างก่อน แล้วให้ผู้ใช้พิมพ์ค้นหาหรือเลือกเอง เว้นแต่ flow นั้นมีเหตุผลชัดเจนว่าต้อง prefill
- placeholder กลางคือ `พิมพ์รหัส/ชื่อสินค้า...`
- source of truth ต้องมาจาก master `สินค้า`
- label ที่แสดงในรายการใช้ pattern `CODE - NAME` เมื่อมีรหัสสินค้า และใช้ `NAME` อย่างเดียวเมื่อไม่มีรหัส
- search text ต้องค้นได้อย่างน้อยจาก:
  - รหัสสินค้า
  - ชื่อสินค้า
- dropdown list ควรแสดงรายการให้เห็นได้ประมาณ 5 รายการก่อนค่อย scroll
- ต้องรองรับ keyboard interaction เป็น baseline:
  - `ArrowDown` / `ArrowUp` สำหรับเลื่อนรายการ
  - `Enter` สำหรับเลือกรายการที่ focus อยู่
- ถ้า combobox อยู่ใน modal, dialog, table row, หรือ section ที่มี `overflow`:
  - panel ต้องไม่ถูกตัดโดย container
  - panel ต้องยัง click เลือกรายการได้จริง
  - panel ควรเปิดชิดกับช่องที่เรียกใช้งาน ไม่ลอยไปคนละตำแหน่ง
- ถ้าหน้าใดมี product option น้อยมากและมีเหตุผลเรื่อง workflow จนไม่ต้องค้นหา ค่อยใช้ plain `select` เป็น page-specific override

### Remark / Note Field Pattern

ใช้กับ field `หมายเหตุ`, `เหตุผล`, `รายละเอียดเพิ่มเติม`, `note`, `remark`

Rules:
- ใช้ `textarea` เป็น default กลางเสมอ ไม่ใช้ single-line input
- ค่าเริ่มต้นเป็นความสูงที่พิมพ์ได้จริงอย่างน้อย 2 บรรทัด
- ถ้าหน้านั้นเป็น note สั้นมากก็ยังคงใช้ `textarea` เว้นแต่มีเหตุผลเฉพาะจาก flow
- placeholder หรือ helper text ควรบอกบริบทของสิ่งที่ต้องการให้กรอก ไม่ใช้ข้อความกว้างเกินไป

### Money Input Pattern

ใช้กับช่องกรอก `จำนวนเงิน`, `ยอดจ่าย`, `ยอดรับ`, `ราคา`, `ต้นทุน`, `VAT`, `WHT`, และ field เงิน/มูลค่าที่แก้ไขได้

Rules:
- ใช้ `type="text"` ร่วมกับ `inputMode="decimal"` เป็น baseline ถ้าหน้านั้นต้องการ format ตอน blur
- ต้องกัน input ที่ไม่ใช่ตัวเลขเองใน component/page layer:
  - อนุญาตเฉพาะตัวเลข `0-9`
  - อนุญาต `.` ได้ 1 ตัว
  - จำกัดทศนิยมไม่เกิน 2 ตำแหน่ง เว้นแต่ business rule ของ field นั้นระบุอย่างอื่น
- ตอน `focus`:
  - แสดงค่าแบบ draft ที่แก้ไขง่าย
  - ไม่ต้องใส่ comma คั่นหลักพัน
- ตอน `blur`:
  - format เป็นเลขคั่นหลักพัน
  - บังคับแสดง `2 ตำแหน่ง` สำหรับ field เงินทั่วไป เช่น `1,234.00`
- ถ้าฟิลด์นั้นต้องห้ามกรอกตัวอักษรและไม่ต้องการ comma หลัง blur สามารถใช้ `type="number"` ได้เป็น page-specific exception
- ถ้าใช้ `type="number"`:
  - ซ่อน spinner controls เป็น default
  - ระบุ `step` ให้ชัด เช่น `0.01`
- ช่องเงินต้องชิดขวาเสมอ
- summary/read-only amount field ใช้ `formatMoney(...)` หรือ formatter กลางเดียวกันทั้งหน้า
- ช่อง `ราคา`, `ราคา/หน่วย`, `ราคา/กก.`, และ field unit-price อื่นใช้ pattern นี้เป็น default กลาง

### Field Input Decision Matrix

ใช้ matrix นี้เป็นตัวตัดสินกลางก่อนเลือกว่าจะทำ field เป็น `text`, `number`, หรือ `money pattern`

| ประเภทข้อมูล | default input pattern | ใช้เมื่อ | หมายเหตุ |
| --- | --- | --- | --- |
| ยอดเงิน / ราคา / มูลค่า / VAT / WHT / ยอดจ่าย / ยอดรับ | `money input pattern` | field นั้นเป็นจำนวนเงินหรือราคาที่ผู้ใช้คาดว่าจะเห็น comma และทศนิยมแบบการเงิน | baseline กลางของระบบ |
| จำนวน / น้ำหนัก / qty / volume / percent ที่ไม่ต้อง format เป็นเงิน | `number exception` | field เป็นค่าตัวเลขเชิงปริมาณ และไม่ต้องแสดง comma + 2 ตำแหน่งตอน blur แบบเงิน | ต้องซ่อน spinner และระบุ `step` |
| รหัสเอกสาร / เลขที่อ้างอิง / ทะเบียน / เลข PO / เลขใบชั่ง | `text` | แม้จะมีตัวเลข แต่ความหมายคือ identifier ไม่ใช่ quantity/value | ห้ามใช้ `type="number"` |
| ชื่อ / หมายเหตุ / คำอธิบาย / ข้อความธุรกิจทั่วไป | `text` | ข้อมูลเป็นข้อความที่ผู้ใช้ต้องพิมพ์หรือแก้ไขโดยตรง | ใช้ validation ตาม business/domain |
| เบอร์โทร / เลขภาษี / เลขบัญชี / เลขที่มีศูนย์นำหน้า | `text` | เป็นเลขเชิงรหัสหรือเลขระบุตัวตน ไม่ใช่ค่าคำนวณ | ห้ามใช้ `type="number"` เพราะจะทำให้รูปแบบเพี้ยน |

Decision rules:
- ถ้า field มีความหมายเป็น “มูลค่าเงิน” ให้เลือก `money input pattern` ก่อนเสมอ
- ถ้า field มีความหมายเป็น “ปริมาณ” หรือ “น้ำหนัก” ให้ใช้ `number exception` ได้
- ถ้า field `จำนวน` / `น้ำหนัก` อยู่ในตาราง edit row และ `type="number"` ทำให้ลบค่า, พิมพ์แก้, หรือคุม cursor ยาก:
  - อนุญาตให้ใช้ `type="text" + inputMode="decimal"` แบบ text-entry sanitization ได้
  - แต่ยังต้องถือ contract เดิมของ `number exception`
  - ห้าม format comma + 2 ตำแหน่งแบบช่องเงินตอน blur
  - ห้ามเด้งกลับ `0` ระหว่างที่ผู้ใช้กำลังลบหรือแก้ไขค่า
- ถ้า field นั้นแม้จะมีแต่ตัวเลข แต่ไม่ใช่ค่าคำนวณ ให้ใช้ `text`
- ถ้า page ใดจะ override matrix นี้ ต้องบันทึกเหตุผลไว้ใน `docs/migration/00-current-work.md`

ตัวอย่างที่ใช้บ่อย:
- `สินค้า` -> `searchable combobox`
- `ยอดมัดจำ` -> `money input pattern`
- `ส่วนลดท้ายบิล` -> `money input pattern`
- `ราคา/หน่วย` -> `money input pattern`
- `ราคา/กก.` -> `money input pattern`
- `จำนวน (กก.)` -> `number exception`
- `น้ำหนักเข้า`, `น้ำหนักออก`, `น้ำหนักสุทธิ` -> `number exception`
- `เลขที่ใบชั่งใหญ่` -> `text`
- `ทะเบียนรถ` -> `text`

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

## Branch-Scoped Selectors

เมื่อ form มีทั้ง `สาขา` และ field ลูกที่ขึ้นกับสาขา เช่น `คลัง`:

- field ลูกต้อง disabled หรือแสดง placeholder ให้เลือกสาขาก่อน
- option ของ field ลูกต้อง filter เฉพาะข้อมูล active ในสาขาที่เลือก
- เมื่อเปลี่ยนสาขา ต้องล้างค่า field ลูกที่เคยเลือกไว้
- backend ต้อง validate ซ้ำว่า field ลูกอยู่ในสาขาเดียวกับเอกสารก่อนบันทึก
- ห้ามใช้ fallback หรือ auto-pick จากชื่อ/code/type/hint เพื่อเลือก field ลูกแทนผู้ใช้

ตัวอย่างปัจจุบัน:
- `/purchase/bills` Stock ต้องเลือก `คลัง` จาก dropdown ที่ filter ตาม `สาขา`; API ต้อง reject ถ้าไม่พบคลัง active หรือคลังอยู่คนละสาขา

## Page-Specific Overrides

- `ข้อมูลบริษัท (สำหรับใบพิมพ์)` อยู่ในหมวด `ตั้งค่าระบบ` ไม่ใช่ `ข้อมูลหลัก`
- เมนู `ตั้งค่าระบบ` ควรรวมอย่างน้อย `VAT / WHT` และ `ข้อมูลบริษัท (สำหรับใบพิมพ์)` ใต้กลุ่มเดียวกัน
- หน้า `/admin/system-settings` ใช้ layout เฉพาะของระบบ config: VAT เป็น primary rate card เดียว ส่วน WHT เป็นตาราง compact ที่แสดงทุกอัตราและมี percent input + ปุ่มบันทึกรายแถว
- ช่องแก้ `อัตรา %` ใน VAT/WHT ใช้ `number exception` ตาม Field Input Decision Matrix ไม่ใช่ money pattern เพราะเป็นเปอร์เซ็นต์ ไม่ใช่มูลค่าเงิน

อนุญาตให้ต่างจาก baseline ได้ เมื่อ:

- legacy page มีสีหัวตารางเฉพาะที่เป็นส่วนหนึ่งของการสื่อความหมาย
- หน้าเป็น dashboard/report hero ที่ต้องมี KPI cards
- หน้าเป็น finance/accounting surface ที่มี color language เฉพาะ

Override ต้อง:
- ระบุหน้า
- ระบุสิ่งที่ต่าง
- มีเหตุผลเชิง business หรือ legacy parity

## Modal and Detail Popup Pattern

ใช้กับหน้าต่างป๊อปอัปแสดงรายละเอียด (Detail Modal / Dialog) และฟอร์มสร้าง/แก้ไขแบบ Modal ทั้งหมดในระบบ

### Shared Base & Structure (AcexPOS Dark Header Style)

- **Dialog Content Layout**: ใช้โครงสร้าง **Sticky Header & Scrollable Body Layout** เพื่อไม่ให้หัวข้อและปุ่มด้านล่างเลื่อนหายไปตอน scroll
- **Modal Radius (บังคับใช้เสมอ)**: `DialogContent` ของ Modal/Dialog ทุกตัวต้องใช้ `rounded-md` เป็น baseline เสมอ และ `DialogHeader` ที่เป็นหัวสีเข้มต้องใช้ `rounded-t-md` ให้เข้าคู่กัน ห้ามใช้ `rounded-lg`, `rounded-xl`, หรือ `rounded-2xl` กับ Modal/Dialog เพราะจะทำให้ความโค้ง drift ระหว่างหน้า; ยกเว้นเฉพาะ mobile bottom sheet ที่เป็นแผงเลื่อนจากขอบล่างซึ่งระบุไว้ในหัวข้อ mobile เท่านั้น
- **Header**: ใช้สไตล์ **Dark Header** ด้วย `bg-slate-900 text-white shrink-0` มีกฎเฉพาะสำหรับการแสดงรายละเอียดเอกสาร (Detail Modal):
  - **หัวข้อหลัก (Title)**: ให้ระบุรหัสเอกสารโดยตรงในหัวข้อหลักเสมอ เช่น `รายละเอียด {row.docNo}` (ใช้ `<DialogTitle className="text-white">`)
  - **คำอธิบายย่อย (Subtitle)**: ให้ระบุชื่อคู่ค้าหลัก (ชื่อลูกค้าหรือผู้ขาย) เป็นคำอธิบายใต้หัวข้อหลักเสมอ เช่น `{row.customerName}` หรือ `{row.supplierName}` (ใช้ `<DialogDescription className="text-slate-300">`)
  - **ซ่อนปุ่มปิดที่มุมขวาบน**: ให้ตั้งค่า **`hideClose`** บน `DialogContent` เพื่อซ่อนปุ่ม `X` ที่มุมขวาบนของแถบหัวข้อ เพื่อความสะอาดและป้องกันปุ่มทับซ้อนกับเนื้อหา และให้ใช้ปุ่ม **"ปิด"** ในแถบ Footer ด้านล่างแทนเป็นทางหลักในการปิด Modal
- **Body Wrapper**: ใช้ `flex-1 overflow-y-auto bg-slate-50 p-4 sm:p-5 space-y-4 text-sm` โดยกำหนดให้มี Padding รอบข้าง (`p-4` หรือ `p-4 sm:p-5`) ครอบคลุมส่วนการ์ดฟิลด์กรอกข้อมูลและรายละเอียดเสมอเมื่อเป็น Modal/Dialog เพื่อไม่ให้ขอบการ์ดชิดสนิทติดขอบหน้าต่างของ Modal
- **Footer**: ใช้ `DialogFooter` หรือ Sticky container ติดอยู่ด้านล่างสุดโดยตรึงไว้เพื่อไม่ให้เลื่อนหลุดสายตา โดยมีกฎเกณฑ์ดังนี้:
  - **ปุ่มหลัก (Save Button)**: ต้องใช้สไตล์สีน้ำเงินเข้ม/เดียวกับ Sidebar ของระบบเสมอ (`bg-slate-900 hover:bg-slate-800 text-white font-normal`) เพื่อความเป็นอันหนึ่งอันเดียวกัน ไม่ว่าจะบันทึกเอกสารประเภทใด และให้ใช้ข้อความสั้นๆ ว่า **"บันทึก"** เท่านั้น
  - **ปุ่มยกเลิก/ปิด (Cancel Button)**: ให้ใช้สไตล์ `variant="outline"` และข้อความ "ยกเลิก" หรือ "ปิด"
  - **การจัดวางข้อมูลสรุปใน Footer บนหน้าจอเล็ก**: หากมีส่วนสรุปตัวเลข (Metrics) ในแถบ Footer เมื่อแสดงผลบนหน้าจอแคบ/แนวตั้ง (เช่น โหมดมือถือ หรือกล่องบีบตัว) ให้จัดวางข้อมูลสรุปนั้นเรียงต่อกันเป็นบรรทัดเดียวในแนวนอน (Horizontal Flex Row) กึ่งกลางหน้าจอ (Center alignment) ด้วยระยะห่างพอเหมาะ (`gap-x-5 gap-y-2`) เสมอเพื่อความสมดุลและประหยัดพื้นที่แนวตั้ง
  - **ตำแหน่งปุ่ม**: จัดวางปุ่มปิด/ยกเลิก และปุ่มบันทึกชิดขวา (ในหน้าจอ Desktop) และจัดอยู่กึ่งกลางหรือขวาอย่างเหมาะสมบนหน้าจอมือถือ

### การป้องกันขอบสีขาวและรอยรั่วซึม (No Border Leakage)

- **No White Borders**: ต้องกำหนดคลาส **`!p-0 overflow-hidden flex flex-col bg-slate-900 border-0`** บน `DialogContent` ทุกครั้ง เพื่อไม่ให้มี subpixel padding สีขาวหรือขอบสีเข้มรั่วไหลออกมาที่ขอบมน
- **No Outer Borders / No Black Borders (ห้ามมีเส้นขอบขีดดำ)**: ทั้งภายนอกและภายในของตัว Modal และช่อง `DialogContent` ห้ามมีเส้นขอบสีดำเข้มหรือสีเทาเข้มขีดล้อมรอบเด็ดขาด (ต้องใช้ `border-0` บน `DialogContent` แทน `border-none` เพื่อบังคับลบความกว้างของเส้นขอบเริ่มต้นออกให้เกลี้ยง 100% เนื่องจาก `tailwind-merge` บน Tailwind v4 ในบางสภาวะจะคงความกว้างขอบไว้หากใช้เพียง `border-none` หรือหากเป็นธีมอื่นให้กำหนดสีขอบจางอย่าง `border-slate-800` ในธีมมืด และ `border-slate-200` ในธีมสว่าง)
- **No Focus Outline (ปิดเส้นกรอบตอนโฟกัส)**: เมื่อเปิด Modal ขึ้นมาและ Focus Trap ของบราวเซอร์ทำงาน ตัวกล่อง Modal ห้ามเรนเดอร์เส้นกรอบสีดำล้อมรอบ ให้ปิดด้วยคลาส `outline-none` หรือ `focus:outline-none` เสมอ

### การจัดกลุ่มข้อมูลภายใน (Grouped Cards Layout)

- **ห้ามใช้ Field Cards**: หลีกเลี่ยงการแยกฟิลด์ละหนึ่งกล่องเล็กๆ ในสไตล์ `Detail` ย่อยๆ (กล่องย่อยรายฟิลด์) เพราะทำให้หน้าตาดูแน่นและรกสายตา
- **ใช้ Grouped Cards**: ให้รวบรวมฟิลด์ข้อมูลที่เกี่ยวข้องมาจัดกลุ่มอยู่ในการ์ดเดียวกัน เช่น "ข้อมูลเอกสาร", "สถานะรายการ", หรือ "จำนวนและรายได้"
- **การนำข้อมูลคู่ค้าออกจากการ์ดภายใน**: เนื่องจากระบุชื่อลูกค้า (Customer) หรือผู้ขาย (Supplier) บนแถบ Subtitle ของ Dark Header แล้ว **ห้ามกรอกหรือแสดงข้อมูลชื่อคู่ค้านั้นซ้ำเป็นฟิลด์ในตัวการ์ดภายในอีก** เพื่อลดความซ้ำซ้อนและประหยัดพื้นที่แสดงผล
- **Card Styling**: แต่ละกลุ่มข้อมูลใช้การ์ดขอบโค้งมนมีเงาบางๆ และพื้นหลังขาว: `rounded-lg border border-slate-200 bg-white p-5 shadow-sm`
- **หัวข้อการ์ดภายใน**: ใช้คำระบุกลุ่มข้อมูลที่มีเส้นคั่นใต้ข้อความสีเทาอ่อนและระยะห่างชัดเจน: `h4 className="text-sm font-bold text-slate-800 border-b border-slate-100 pb-2 mb-4"`
- **Grid Layout**: ข้อมูลภายในแต่ละกลุ่มใช้ Grid System (เช่น `grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-5`) ในการจัดวางฟิลด์ให้อ่านง่ายเป็นแถวและคอลัมน์

### การรองรับหน้าจอมือถือ (Mobile Responsive inside Modal)

- **Grid Columns บนจอมือถือ**: เพื่อประหยัดพื้นที่แนวตั้ง (ลดการ Scroll ยืดลงล่างเยอะเกินไป) และใช้ประโยชน์จากพื้นที่ด้านขวา:
  - **ข้อมูลอ่านอย่างเดียว (Read-only Detail Item)**: ให้แสดงผลเป็น **2 คอลัมน์ เสมอ (`grid-cols-2`)** บนหน้าจอมือถือ/แนวตั้ง (เช่น ข้อมูลเอกสาร, ข้อมูลผู้กรอก, ข้อมูลคู่ค้า) แทนการเรียงเดี่ยวเป็น 1 คอลัมน์ที่ยาวเกินไป
  - **ฟิลด์สำหรับกรอกข้อมูล (Input fields)**: ยังคงให้เรียงเดี่ยวเป็น 1 คอลัมน์ตามปกติเพื่อความสะดวกและขนาดช่องที่ใหญ่กดง่าย
- **การ์ด KPI สรุปตัวเลข**: ให้ยึดหลัก **2 คอลัมน์เสมอ (`grid-cols-2`)** บนจอมือถือ/แนวตั้ง หากมีการ์ดที่เป็นเศษ (เช่น การ์ดใบที่ 3 หรือ 5) ให้กำหนดคลาส `col-span-2 md:col-span-1` เพื่อยืดเต็มหน้าจอ ป้องกันการเกิดพื้นที่ว่างเกินจำเป็น
- **ตารางที่มีคอลัมน์หนาแน่น (Heavy Tables)**: บนจอมือถือ (`block md:hidden`) **ห้ามแสดงผลเป็นตารางที่มี scrollbar เลี้ยวขวาเยอะๆ จนบีบอัดตัวหนังสือ** ให้สลับไปเรนเดอร์ในรูปแบบ **"การ์ดรายการย่อย (Dense Card-based List)"** โดยนำข้อมูลสำคัญ (ลำดับ, สินค้า, น้ำหนัก Gross/Deduct/Net) มาจัดกลุ่มไว้ในการ์ดใบเดียวให้อ่านง่าย และซ่อนตารางเดสก์ท็อปแบบเดิม (`hidden md:table`)

### ตัวเลือกรูปภาพสินค้าแบบยุบได้ (Collapsible Product Image Picker)

- **ซ่อน/พับเก็บรูปภาพสินค้าโดยเริ่มต้น**: ในฟอร์มที่มีส่วนการค้นหาและเลือกสินค้าด้วยรูปภาพ (`ProductImagePicker`) ห้ามเรนเดอร์แผงปุ่มภาพทั้งหมดออกมาทันที เพราะจะทำให้ฟอร์มมีความยาวในแนวดิ่งมากและดูรกสายตา
- **ใช้ปุ่ม Accordion Toggle**: ให้แสดงเพียงปุ่มตัวเลือกยุบ/ขยาย (เช่น ปุ่ม "เลือกสินค้าจากรูปภาพ" พร้อมไอคอนบวกหรือลูกศรชี้ลง `ChevronDown`) เมื่อผู้ใช้คลิกจึงจะแสดงแผงเลือกรูปภาพสินค้าด้านล่าง (Toggle state) และสามารถคลิกซ้ำเพื่อปิดซ่อนได้

---

## Table Auto-Stretch Layout Rules

เพื่อป้องกันปัญหาแถบหัวตาราง (Table Header) หรือบอดี้ตารางแสดงผลขาด ยุบตัว หรือแหว่งไม่เต็มขวาในจอ Widescreen:

- **ห้ามกำหนด Width ตายตัวให้แก่คอลัมน์สุดท้าย**: ใน `<colgroup>` ห้ามระบุขนาด `width="..."` บน `<col>` ตัวสุดท้าย เพื่อให้คอลัมน์สุดท้ายทำการยืดขยายรองรับพื้นที่ว่างฝั่งขวา (flex-stretch) ของจอคอมพิวเตอร์กว้างโดยอัตโนมัติ
- **Table Width**: ตัวตาราง (`<table>`) ต้องมีคลาส `w-full` เสมอ
- **คอลัมน์ที่รองรับ Auto-Stretch**: โดยปกติ คอลัมน์ที่อยู่ขวาสุด (เช่น คอลัมน์สถานะ หรือคอลัมน์จัดการ) จะทำหน้าที่เป็นตัวยืดขยายตามธรรมชาติ

---

## Implementation References

reference implementation ที่ใช้อ้างอิงได้ตอนนี้:

- `apps/next/src/components/daily/TransactionBillsPageClient.tsx`
- `apps/next/src/components/daily/MoneyMovementPageClient.tsx`
- `apps/next/src/components/master-data/shared/MasterDataPageClient.tsx`
- `apps/next/src/components/production/ProductionReportPageClient.tsx` (ตัวอย่างการทำ Responsive Table-to-Card ทุกตาราง/Dashboard และระบบ Soft Lined Table Borders ลบขีดสีดำ)

เวลาเริ่มหน้าใหม่ ให้ดู reference ที่ใกล้ domain ที่สุดก่อน

## Change Log

- 2026-06-13: บันทึกแนวทางการทำ Responsive Table-to-Card และ Soft Lined Table Borders (ลบขีดสีดำและ outline สีดำรอบปุ่ม/กล่องรายงาน) พร้อมการปรับขนาดฟอนต์บนหน้าจอมือถือให้อ่านง่ายพอดี (ไม่เล็กเกินไป) โดยใช้หน้าจอรายงานการผลิต (`ProductionReportPageClient.tsx`) เป็นแนวทางมาตรฐานที่ผู้ใช้ชอบ
- 2026-06-13: บันทึกมาตรฐานโครงสร้างและการจัดวางหน้าจอ List Page / Filter (ทั้งแบบเดสก์ท็อปและมือถือ) โดยอิงจากรูปแบบของหน้าจอ PO Sell (จองขาย) เพื่อความเป็นระเบียบและสอดคล้องกันทั่วทั้งระบบ
- 2026-06-13: ปรับปรุงโครงสร้างหัวข้อและสไตล์ป๊อปอัปรายละเอียด (Detail Modal) ตามหน้าจอ PO Sell/PO Buy โดยใช้ Dialog Header เป็นที่แสดงรหัสเอกสารและชื่อคู่ค้า (พร้อมซ่อนปุ่ม X มุมขวาบน), ห้ามแสดงชื่อคู่ค้าซ้ำซ้อนภายในการ์ด และเพิ่มดีไซน์ไกด์ไลน์สำหรับ Modal/Detail Popup อื่นๆ (AcexPOS Dark Header Style, Grouped Cards Layout, Mobile Responsive)
- 2026-05-23: สร้าง `docs/design.md` เพื่อแยก design conventions ออกจาก `docs/migration/00-current-work.md` และใช้เป็น source กลางสำหรับ list/filter/table/pagination/button/wording rules
