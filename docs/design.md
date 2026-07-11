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

## Wording Baseline

- Active table, filter, and detail labels must use one language set within the same surface.
- If the page is Thai-first, do not leave generic English labels in table headers, filters, empty states, or detail-section titles.
- Baseline mappings for active list/report UI: `Code` -> `รหัส`, `Customer` -> `ลูกค้า`, `Supplier` -> `ผู้ขาย`, `Product` -> `สินค้า`, `Search Customer` -> `ค้นหาลูกค้า`, `Select Product` -> `เลือกสินค้า`.
- Official page/module names such as `Customer Tracking 360°` may stay as product names, but the working labels around the table/filter must be Thai.

## Page Description Banners

- Do not render static page-description banners, read-baseline notices, or explanatory subtitles under the page title in active app pages.
- Pages should start with the actual working surface: KPI cards, filters, actions, table/list, dashboard panels, or form content.
- Keep true runtime communication only: API errors, validation messages, empty states, data-derived warnings, and high-risk safety warnings such as backup/restore safeguards.
- Detail modals and form sections may still use short contextual labels/subtitles when they identify the selected record or field group, not when they explain the whole page.

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
- `apps/next/src/components/daily/WeightTicketListPageClient.tsx` (canonical two-row filter toolbar reference: search + date/select/clear on the top row, segmented `สถานะ` on the lower-left row, actions on the lower-right row)
- `apps/next/src/components/daily/TransactionBillsPageClient.tsx` (same list filter mechanics after search row normalization)

Latest accepted filter baseline: use the Weight Ticket list filter layout as the canonical list filter surface. The expected desktop structure is one white `rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm` filter card with a top control row containing the primary search field on the left and date/select/clear controls on the right, followed by a lower row with segmented `ประเภท` / `สถานะ` controls on the left and page actions such as `ส่งออก Excel` / `+ สร้างรายการ` on the right. Do not create page-local colored, full-width-search-only, or split-card filter variants unless an override is documented.

Hard consistency rule: button placement, button color, and button wording must match this design file and the closest accepted reference page. Do not invent page-local action colors, labels, or placement. Placeholder actions such as disabled `CSV` buttons are not part of the design unless the page has a real active export contract and the override is documented.

Visual-first reporting rule: when evaluating or reporting on a specific UI page, inspect the rendered page in the browser first, then inspect the relevant code. The report must be based on both the visible page and the implementation. If browser inspection cannot be completed, state that limitation before making any design judgment.

ให้ใช้ค่าพวกนี้เป็น default ก่อนเสมอ ถ้าหน้าใหม่ไม่มีเหตุผลชัดเจนพอที่จะ override

### Filter Row

- filter shell wrapper: `rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm`
- filter row gap: `gap-2`
- search field:
  - min width: `min-w-[260px]`
  - height target: `h-9`
  - desktop/tablet placement: top row left, flexible width (`min-w-[260px] flex-1`), sharing the row with date/select/clear controls
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
- list/report page ที่มีทั้งเวลาและสถานะ ให้แสดง quick range + segmented status ใน filter card เดียวกัน เช่น `ช่วงเวลา: ทั้งหมด / วันนี้ / 7 วัน / เดือนนี้` และ `สถานะผลิต: ทุกสถานะ / ยังไม่เริ่ม / กำลังผลิต / เสร็จบางส่วน / เสร็จสิ้น / ยกเลิก`
- ถ้าผู้ใช้เลือกวันที่เอง ให้ถือเป็น custom range และไม่ highlight quick range ที่ไม่ตรงกับวันที่จริง

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

### Date Picker Popover

- Shared `DatePickerInput` / `DatePicker` popovers should be wide enough for readable day columns:
  - popover content: `w-[20rem] max-w-[calc(100vw_-_1rem)]`
  - calendar root: `w-[19rem]`
  - calendar cell size: `[--cell-size:2.25rem]`
- Do not use compressed `w-auto` date-picker popovers for list filters; weekday labels and day numbers must not visually crowd together.

### Table

- canonical table container: `overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm`
- horizontal overflow wrapper: `overflow-x-auto`
- table width/text baseline: `min-w-full text-sm`
- table text size baseline: `text-sm`
- table header background: `bg-slate-100`
- header cell padding baseline: `p-2`
- table headers must stay on one line. Use enough column width and horizontal table overflow instead of wrapping header labels to a second line.
- body cell padding baseline: `px-3 py-3`
- empty/loading state cell padding baseline: `p-8`
- implementation class: raw JSX `<table>` in the active app must include `ns-table`; shared `Table` adds it automatically.
- exclude print/PDF/HTML-string document tables only when that document has its own explicit print stylesheet.

### KPI / Summary Cards Above Table

#### KPI Necessity Rule

- ห้ามใส่ KPI cards เพียงเพื่อทำให้หน้าดูเต็ม ถ้าค่าใน card ซ้ำกับข้อความสรุปจำนวนรายการ เช่น `พบทั้งหมด X รายการ` หรือผู้ใช้ต้องตัดสินใจจากตารางเป็นหลัก
- ห้ามทำ summary/KPI card ที่แสดงข้อมูลเดียวกับ table toolbar, pagination summary, tab badge, หรือ column/table total ที่อยู่ในบริบทเดียวกัน เช่น card `รายการ 28` ซ้ำกับ `พบทั้งหมด 28 รายการ`; ให้เก็บค่าซ้ำนั้นไว้จุดเดียวที่ใกล้ data surface ที่สุด
- หน้า list ที่เป็นงานเอกสารแบบตรวจ/พิมพ์/แก้ไขรายการเดียว เช่น Receipt Voucher ให้ table เป็นพื้นที่หลัก และตัด KPI cards ที่ไม่ช่วย workflow ออก
- KPI cards ควรมีเฉพาะเมื่อช่วยตัดสินใจทันที เช่น ยอดค้างชำระที่ต้องไล่เก็บ, ยอดเกินกำหนด, stock available/pending_out, หรือ warning ที่มีผลต่อการทำงาน
- ถ้า KPI เป็นเพียง aggregate ของ filter ปัจจุบัน และไม่ได้ใช้ตัดสินใจ ให้แสดงเป็นข้อความสรุปเล็กใน table toolbar แทน card
- หลีกเลี่ยงการแสดงข้อมูลตัวเลขเดียวกันซ้ำในพื้นที่ติดกัน เช่น KPI กับ toolbar หรือคอลัมน์เงิน 2 ช่องที่ให้ค่าเท่ากันบ่อย ๆ; ถ้าต้องสื่อความเสี่ยงเดียวกัน ให้เปลี่ยนมุมมองเป็นจำนวนรายการ, สถานะ, bucket, อายุ, หรือ badge แทนการแสดงยอดเงินซ้ำ

#### Shared KPI Card Implementation

- KPI/Summary cards ที่อยู่เหนือ list/report/dashboard/detail summary ต้องใช้ component กลาง `apps/next/src/components/ui/KpiCard.tsx` เท่านั้น
- local wrapper เช่น `Metric`, `StatCard`, `SummaryCard`, `KpiCard`, `MetricCard`, `Tile`, หรือ `Kpi` ทำได้แค่ map data/label/tone/note/icon เข้าหา shared component; ห้ามนิยาม markup, padding, font size, border, icon shape, หรือ value size เอง
- baseline card คือ white card + optional meaningful circular icon ฝั่งซ้าย + label `text-xs font-medium` + value `font-mono text-xl font-bold` + optional note `text-xs font-medium text-slate-500`; ห้ามใส่ default dot/marker ถ้า icon นั้นไม่ได้สื่อความหมายจริง
- ห้ามใช้ KPI card แบบ full gradient, hero card, border-left accent card, square-icon card, หรือ page-local `text-2xl`/`text-3xl` value typography สำหรับ KPI/Summary card เว้นแต่มี override ระบุไว้ใน `docs/migration/00-current-work.md`
- ถ้าต้องคงชื่อ wrapper เดิมเพื่อ diff เล็ก ให้ wrapper นั้นต้อง `return <SharedKpiCard ... />` โดยตรง และไม่มี JSX card markup ของตัวเอง
- ห้ามวาง single-value KPI card ใน grid row เดียวกับ ranked-list/breakdown panel ที่สูงกว่า เพราะจะทำให้ KPI card ยืดสูงผิดธรรมชาติ ให้แยก KPI grid ออกจาก analysis/ranked panels
- ขอบเขตของ rule นี้คือ single-value KPI/Summary card เช่น label + value + optional note/icon. Breakdown card ที่มีหลายค่าในใบเดียว, chart panel, ranked-list panel, detail/list row metric, auth/logo card, print/mockup surface ไม่ต้องใช้ `KpiCard` แต่ต้องไม่ตั้งชื่อหรือจัดวางให้ดูเป็น KPI card หลักของหน้า

#### KPI Card Helper Text Alignment

- ถ้า KPI card มี helper/sub metric เช่น `เฉลี่ย ...`, `GP ...`, margin %, หรือ note สั้น ๆ ที่อธิบายค่าหลัก ให้จัดวางเป็น footer/full-width line ของการ์ด เช่น `border-t border-slate-100 pt-2 text-xs` ใต้ grid ตัวเลขหลัก
- ห้ามวาง helper text ใต้คอลัมน์ตัวเลขคอลัมน์เดียว เช่น ใต้ `ยอดเงินรวม` เท่านั้น เพราะจะทำให้ card ดูไม่สมดุลและเหมือนคอลัมน์นั้นมีข้อมูลพิเศษลอยผิดแนว
- ตัวเลขหลักใน KPI card ต้องวาง grid/columns ให้เท่ากันก่อน แล้วค่อยให้ helper text เป็นบรรทัดเสริมด้านล่างที่อ่านต่อจากทั้งการ์ด

#### Ranked / Top List Cards

- การ์ด ranked list เช่น `Top 10` ควรแสดงรายการสำคัญชุดแรกแบบย่อก่อน โดยค่า baseline คือ 5 รายการแรก แล้วให้ผู้ใช้กดขยายเพื่อดูครบ 10 รายการ
- ปุ่มขยาย/ย่อ ranked list เป็น action control ไม่ใช่สถานะของข้อมูล จึงควรใช้สี action ที่แยกจากสี chart/ranking เช่น blue outline/soft fill
- ลำดับต้องคงจาก source เดียวกันเสมอ: collapsed แสดงอันดับ 1-5 และ expanded แสดงอันดับ 1-10 โดยไม่ reset, re-sort, หรือเปลี่ยนเกณฑ์หลังผู้ใช้กดขยาย
- ถ้า ranked list ซ้ำกับ table ด้านล่าง ให้แสดงเฉพาะค่าที่ช่วย scan เร็ว เช่น ชื่อ, quantity, unit cost/WAC, status metadata สั้นๆ, และ value; รายละเอียดเต็มให้อยู่ใน table

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

- form container baseline: `rounded-xl bg-white p-4 shadow`
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

สำหรับ report/list page ที่มีหลาย table surface และใช้ line tabs เช่น `รายการใบสั่งผลิต / WIP คงเหลือ / สรุปตามสินค้า` ให้ใช้ลำดับนี้แทน single-table default:
1. **KPI / Summary Cards** ของภาพรวมทั้งหน้า
2. **Line Tabs** สำหรับเลือก table surface
3. **Filter Section** ของ report นั้น
4. **Tab Filter / Table Toolbar -> Pagination** ของ tab ที่กำลังแสดง
5. **Data Area** ของ tab ที่กำลังแสดง

เหตุผล: tabs เป็นตัวเลือกบริบทของตาราง จึงควรอยู่ใต้ KPI ก่อน filter; filter ต้องอยู่ติดกับ toolbar/pagination และตารางที่ถูกควบคุม ไม่ลอยอยู่เหนือ tabs จนแยกจาก data surface.

หนึ่ง tab ควรเป็นหนึ่ง data surface หลัก ไม่ควรวาง table panels สองชุดใน tab เดียวให้ผู้ใช้เทียบเอง. ถ้าตารางเป็น business verification surface คนละชุด เช่น Table 1/2 ของรายงานเดิม ให้แยกเป็นคนละ line tab แทนการซ่อนไปรวมกันหรือวางคู่ใน tab เดียว.

หัว panel/table ที่ผู้ใช้เห็นไม่ต้องใส่เลขลำดับแบบ `ตาราง 1`, `ตาราง 2`, หรือ `Table 1`. ให้ใช้ชื่อข้อมูลจริง เช่น `ยอดซื้อรวมตามหมวดสินค้า`, `ยอดซื้อที่ได้ค่าคอมตามหมวดสินค้า`, `ผู้ขายในความดูแล`, หรือ `รายการสินค้าละเอียด`; เลขตารางเก็บไว้ได้เฉพาะใน requirement/internal docs เมื่อจำเป็นต้อง trace กับรายงานเดิม.

สำหรับ `/sales-commission` ให้ถือว่า summary table หน้า overview และทุก drilldown tab เป็น table surface ที่ต้องมี pagination row ตาม baseline (`พบทั้งหมด`, page size, `ก่อนหน้า`, `หน้า X / Y`, `ถัดไป`). ภายในแต่ละ table surface ให้เรียง `Toolbar/Filter -> Pagination -> Table` เสมอ; pagination ต้องไม่อยู่เหนือช่องค้นหา/filter ที่ควบคุมตารางเดียวกัน. Filter ของแต่ละ tab ต้องผูกกับคอลัมน์ที่เห็นจริงเท่านั้น: หมวดสินค้าใช้ค้นหาหมวด, ผู้ขายใช้ค้นหาผู้ขาย, รายการสินค้าใช้ค้นหาเลขบิล/ผู้ขาย/สินค้าและ segmented `สถานะค่าคอม`. ปุ่ม `คืนค่าเดิมตาราง` อยู่ใน toolbar/pagination area ไม่แยกเป็นกรอบลอย และ export รายงานใช้คำ/สี baseline `ส่งออก Excel`.

ใน `/sales-commission` drilldown ปุ่ม `กลับหน้าหลัก` เป็น navigation action แยกด้านซ้ายบนของ detail view ไม่อยู่ใน header card เดียวกับข้อมูลพนักงานขายหรือปุ่ม `ส่งออก Excel`. ปุ่ม export เป็น report action และอยู่กับ header/content scope ได้ แต่ปุ่มกลับต้องอ่านเป็นทางออกจาก detail ก่อน.

สำหรับ analysis/dashboard page ที่มีทั้ง summary, chart, ranked list, และ table เช่น Stock Finance ให้ใช้ลำดับการอ่านนี้:
1. **Global Filters** ที่ควบคุมทั้งหน้า เช่น วันที่, สาขา
2. **Primary Overview** เช่น มูลค่ารวม, ยอดรวม, สถานะรวม หรือ donut/status summary
3. **Risk / Breakdown Panels** เช่น aging, overdue, slow/fast movement, top value/risk list
4. **Table Surface Tabs** สำหรับรายการละเอียด
5. **Active Tab Filter -> Pagination / Toolbar -> Table**

เหตุผล: ผู้ใช้ควรเห็นภาพรวมและความเสี่ยงก่อนลงไปทำงานกับตาราง รายละเอียดที่เป็น row-level จึงอยู่ท้าย flow และไม่ควรแทรกการ์ดซ้ำระหว่าง analysis panels กับ table tabs.

Analytics/dashboard table density: if a dashboard has several ranked/detail table surfaces after the primary overview, do not stack every table vertically. Keep the primary overview/chart and one key breakdown visible first, then group row-level detail surfaces into shared line tabs by decision context, for example `คู่ค้า`, `สินค้า`, and `Sale`. Each tab should show only the tables needed for that context so mobile and desktop users do not have to scan a long wall of tables.

Bar/chart labels: ถ้า bar chart ใช้แถบสีแสดงสัดส่วนและมีตัวเลขในแถวเดียวกัน ห้ามผูกตัวเลขไว้ใน fill bar ที่ความกว้างเปลี่ยนตามค่า เพราะค่าที่น้อยจะทำให้ตัวเลขถูกบีบ/อ่านยาก ให้แยก fill bar เป็นพื้นหลัง และวางตัวเลขเป็น label กึ่งกลางของ full track หรือวางนอก bar ในพื้นที่คงที่แทน.

สำหรับ dashboard overview ที่มี global filters จำนวนมาก ให้ desktop แสดงตัวกรองหลักใน card เดียวก่อน KPI/overview เพื่อให้เห็น scope ชัดเจน ส่วน mobile ต้องไม่วาง form filter ยาวเต็มหน้า ให้ใช้แถบ compact สำหรับช่วงเวลา/summary และปุ่ม `ตัวกรอง` ที่เปิด `MobileFilterSheet` แทน. Filter card ควรเป็นพื้นขาว/neutral ไม่ใช้แถบดำหนัก; field ที่เป็น input/select/search ต้องอ่านค่าได้จริงและไม่ดูเหมือนช่องว่าง. ไม่ต้องมี hero/banner แยกถ้าเป็นเพียงชื่อหน้า/คำอธิบายที่ซ้ำกับ app shell หรือ filter scope. KPI cards ควรเป็น white cards พร้อม accent สีเล็กๆ ไม่ใช้ full-gradient ทุกใบ และไม่ใช้ dot/marker ที่ดูเหมือนสถานะ error/success โดยไม่มีความหมาย. Metric section ท้ายหน้าต้องลดค่าที่ซ้ำกับ KPI และเก็บไว้เฉพาะ detail ที่ช่วย drill-down.

### Tracking 360 Pages

สำหรับ `/tracking/customer`, `/tracking/supplier`, และ `/tracking/product` ให้แยกความหมายของ control ให้ชัดเจน: line tabs เลือก data surface / table view (`รายการ`, `Top 10`, `รายปี`, `สรุปตามสินค้า`) ส่วน filter card เก็บเฉพาะ search/date range/master-data filters และ actions เท่านั้น.

- Customer Tracking และ Supplier Tracking ใช้ลำดับ: KPI cards -> line tabs -> global filter card -> pagination/toolbar -> active data area.
- Product Tracking ใช้ลำดับ: KPI cards -> line tabs -> global filter card -> monthly/top overview panels -> pagination/toolbar -> active data area.
- Desktop filter card ใช้ `rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm`, controls สูง `h-9`, search/combobox ต้องแสดง field ที่ query/API รองรับจริง ไม่เก็บ state ที่ไม่มี control ให้ผู้ใช้เลือก.
- Mobile filter ต้องเป็น compact row: search + `ตัวกรอง` + `ส่งออก Excel` แล้วเปิดรายละเอียดด้วย `MobileFilterSheet`; ห้ามเรียง form filter ยาวเต็มหน้า.
- ทุก list/table tab ใน Tracking 360 ต้องมี pagination/toolbar ก่อน data area และใช้ page size baseline `10 / หน้า` กับ `25 / หน้า`.
- Ranked list เช่น Top 10 ต้องแสดง 5 รายการแรกก่อน แล้วให้ผู้ใช้กดขยายเพื่อดูครบ 10 รายการ โดยไม่เปลี่ยนลำดับข้อมูล.
- Supplier Tracking ต้องแยก Supplier list กับ Product breakdown เป็นคนละ line tab ไม่วางสองตารางยาวซ้อนกันในมุมมองเดียว.
- Product Tracking primary table, mobile cards, และ Excel export ห้ามแสดง `Stock` / `WAC`; stock เป็นข้อมูลสนับสนุนที่เข้าได้จาก detail modal ผ่าน `Stock Support` เท่านั้น เพื่อไม่ให้ Product 360 ปนกับ Stock Balance.

---

### 2. รูปแบบสำหรับหน้าจอคอมพิวเตอร์ (Desktop Layout)

- **Filter Top Row**: แถวแรกของ filter card วางช่องค้นหาหลัก (`min-w-[260px] flex-1`) ทางซ้าย แล้ววาง Date Picker (จาก -> ถึง), select/combobox, และปุ่มล้างตัวกรองทางขวาในแถวเดียวกัน
- **Filter Status / Action Row**: แถวถัดมาวาง segmented filter เช่น `ประเภท` / `สถานะ` ทางซ้าย และปุ่มแอ็กชันหลัก เช่น **`ส่งออก Excel` (ปุ่มสีเขียวพร้อม download icon)** และ **`+ [ชื่อรายการ] ใหม่` (ปุ่มสีน้ำเงิน/primary ตาม baseline หน้านั้น)** ทางขวาด้วย `ml-auto`
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
  - การ์ดแต่ละใบมีขอบมนและเงานุ่มนวล: `rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50`
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

### Mobile App Shell / Bottom Navigation

- Mobile bottom navigation is part of the app shell for all non-auth pages below the `lg` breakpoint. Use `lg:hidden`, not `md:hidden`, so responsive/tablet widths such as 957px still keep the mobile navigation.
- Main page content must reserve bottom spacing through the same breakpoint: `pb-20 lg:pb-6` when bottom navigation is active.

### Sidebar Navigation

- Sidebar navigation must use the dark app-shell legacy baseline from the accepted screenshot: raw `navigationItems.icon` icons/emoji rendered directly, then the label.
- Do not wrap sidebar icons in rounded icon boxes and do not replace them with the shared lucide `NavigationIcon` component unless the user explicitly approves a sidebar redesign.
- Sidebar rows stay plain on the dark shell. Active state may use white text, but should not become a large rounded card-style highlight.
- Section and child-menu expand controls use the compact text triangle glyphs (`▾` / `▸`) used by the legacy sidebar.
- The desktop compact rail hides labels only at `lg`, while the mobile full-screen menu keeps labels visible.

## Filter Pattern

filter shell มาตรฐานของ list page:

1. แถวบน:
- search field ทางซ้าย (`min-w-[260px] flex-1`)
- date range, select/combobox filters, และ clear filter ทางขวา

2. แถวถัดมา:
- segmented filters เช่น ประเภท, สถานะ ทางซ้าย
- page actions เช่น `ส่งออก Excel`, `+ สร้างรายการ` ทางขวา

Rules:
- search ต้องมาก่อน filter อื่นและอยู่แถวเดียวกับ date/select/clear controls บน desktop/tablet
- page action buttons ต้องไม่ปนกลางแถว control; วางชิดขวาในแถว segmented/status หรือ action row ถัดมา
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
- ถ้าเป็นสถานะของเอกสาร ให้ใช้ label `สถานะเอกสาร:` เพื่อแยกจากสถานะย่อยประเภทอื่น เช่น สถานะจับคู่หรือสถานะชำระเงิน
- ใช้ปุ่ม segmented style เดียวกันทุกหน้า:
  - active: `border-slate-700 bg-slate-700 text-white`
  - inactive: `border-slate-300 bg-white hover:bg-slate-50`
  - shape/spacing baseline: `rounded-md border px-3 py-1 text-xs font-medium`
- ถ้ามีตัวเลือก `ทั้งหมด` หรือ `ทุกสถานะ` ให้เป็น segment แรกเสมอ
- ชุดสถานะต้องมาจาก flow จริงของหน้านั้น ไม่คัดลอกชุดเดียวกันทุกหน้า เช่น Receipt Voucher ที่มีเฉพาะ `ใช้งาน` และ `ยกเลิก` ให้ใช้ `ทุกสถานะ / ใช้งาน / ยกเลิก` ไม่ต้องเพิ่ม `แบบร่าง`, `รับของแล้ว`, หรือ `เสร็จสิ้น` หาก runtime ไม่มีสถานะเหล่านั้น
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
- primary list/report table reference is `/daily/weight-ticket-list`: desktop table container should use `hidden md:block overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm`, table should use `min-w-full text-sm`, header should use `bg-slate-100` without default vertical header separators, body rows should not rely on visible row divider lines, body cells should use `px-3 py-3`, and numeric cells should use `tabular-nums`.
- As of 2026-07-07, this WTI/WTO table treatment is the single canonical table design for active Next pages. Older `Table / Plain` and `Table / Lined` wording below is historical context only; do not create new lined-table variants or page-local table shells without an approved override.
- column headers must name the business meaning, not only the data type. Avoid vague labels such as `เลขที่` or `วันที่` when the page has a specific document/date meaning. Prefer labels such as `เลขที่ RV`, `วันที่เอกสาร`, `วันที่สร้าง`, `วันที่รับเงิน`, `วันที่จ่าย`, or `วันที่บิลซื้อ` based on the page flow.
- If a list has more than one relevant date, show each date as a separate clearly named column instead of overloading `วันที่`.
- If a page has several table surfaces, use line tabs above the tables instead of stacking all tables vertically. Follow the WTI/WTO tab pattern: `TabsList variant="line"` with compact `TabsTrigger variant="line"` labels.
- Line tabs are a single shared visual pattern. Do not rebuild them as page-local `Tab` buttons, pill tabs, segmented tabs, colored active buttons, card tabs, or `rounded/bg-white/shadow` tab containers. Use the shared `TabsList`/`TabsTrigger` line variant directly unless a documented page-specific override is explicitly approved.
- Keep the main operational table as the first/default tab unless the business flow clearly starts from a summary table. KPI cards that summarize the whole page may stay above the tabs; table-specific summaries should live inside that tab.
- For report/list pages with shared filters and several table tabs, render the line tabs under the page-level KPI cards, then render the shared filter card, then the active tab's toolbar/pagination and table. Do not place the shared filter card above the tabs.
- If each table tab represents a different subset or meaning, each active tab must own its own filter row. Do not reuse a filter that contains fields irrelevant to the active tab.
- Tab-specific filters should only include fields users can see or understand from that tab. If a status is already summarized in a chart and the table does not display a status column, do not add a status filter to that table.
- Every table tab should have at least the useful minimal filter set for that table, normally search plus the strongest grouping dimension such as category/product group. Do not leave one tab filterless while another tab has filters unless the tab is purely a fixed small summary.
- sorting: กดที่ header โดยตรง
- sort header baseline: ใช้ปุ่มเต็มพื้นที่หัวคอลัมน์แบบ `/purchase/advance-payments` (`p-2 text-xs font-semibold text-slate-700`, hover `bg-slate-200`, ลูกศรสี `text-slate-400`) ไม่ใช้กรอบมนหรือ active สีเข้มที่ดึงสายตาเกินไป
- empty state: ใช้ข้อความสั้นตรงไปตรงมา เช่น `ยังไม่มีรายการ`
- loading state: ใช้ข้อความ `กำลังโหลดข้อมูล`
- action column อยู่ขวาสุดเสมอ
- legacy-style action text/link ในตารางให้คงโทนที่ผู้ใช้คุ้นเคย เว้นแต่มีปุ่ม page-specific ที่ชัดกว่า
- ถ้า row action ใช้งานไม่ได้ในสถานะนั้น ให้ซ่อน action นั้นเป็น default แทนการแสดงปุ่ม disabled ที่กดไม่ได้ ยกเว้นกรณีที่ผู้ใช้จำเป็นต้องเห็นว่า action ถูกล็อกและมีข้อความอธิบายเหตุผลชัดเจน
- status cell ใช้ pattern `dot + สีข้อความ` เป็น baseline กลาง; ใช้ `text-xs font-semibold` และ dot เล็ก (`size-1.5`) เพื่อไม่ดึงสายตาเกิน cell อื่น; หลีกเลี่ยง badge background ถ้าไม่จำเป็นตาม legacy/page override
- Do not render a row-level status column or badge when the same status is already represented by a page-level chart/card and the status is not needed for row action decisions. Keep the status in the overview and remove it from the table to reduce visual noise.

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
- colgroup must follow the `/daily/weight-ticket-list` auto-stretch pattern: apply `getColumnStyle()` to normal columns, but do not set a fixed width on the final column; give the final column only its `minWidth` so it can absorb remaining widescreen space.
- header resize handle อยู่ที่ขอบขวาของหัวคอลัมน์, hit area เล็กและไม่ดึงสายตา, ไม่มีเส้นแบ่งท้ายหัวตารางที่เห็นชัด แต่ยังต้องมี focus outline/accessibility label สำหรับ keyboard user
- table header labels must stay readable on one line and must not render as CSS ellipsis (`...`). For `ResizableTableHead`, use `whitespace-nowrap` labels and size `defaultWidth` / `minWidth` so business headers such as `เลขที่ PO ซื้อ`, `วันที่สร้างเอกสาร`, and `วันที่กำหนดส่ง` are visible. Do not shorten a business label just to fit the column.
- ต้องมีทาง reset กลับ default เมื่อมี custom width แล้ว โดยใช้ปุ่ม label `คืนค่าเดิมตาราง` ใน toolbar/pagination row

### Mobile Table Cards

- Heavy/list tables must switch to dense mobile cards like `/daily/weight-ticket-list`.
- Mobile card structure: top row shows document number/title and date, middle section uses a light `bg-slate-50` grouped info box for key descriptors, footer uses `border-t` and right-aligned numeric summaries.
- Avoid generic two-column dumps when a table has a clear document/report meaning; group fields by user task instead.
- ถ้า header มี sort/click action อยู่แล้ว resize handle ต้อง `stopPropagation()` เพื่อไม่ trigger sort หรือ row action

### Deprecated Table / Plain

ใช้กับ transaction list ที่ต้องการความเบา, scan เร็ว, และไม่ต้องพึ่งเส้นคั่นแถว เช่น:

- `/daily/weight-ticket-list`

Rules:

- ไม่มีเส้นคั่นใน `tbody`
- ใช้ `hover:bg-*` และ spacing ช่วยแยกแถวแทนเส้น
- header ยังคงแยกจาก body ได้ด้วย `thead` background
- เหมาะกับหน้าที่มี status/action เด่นและ user กดเข้า detail จากทั้งแถว

### Deprecated Table / Lined

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
- ตารางในหน้าใช้งาน ERP/analysis ไม่ควรแสดงเกิน 25 rows ต่อหน้าเป็นค่า baseline เพื่อให้ผู้ใช้ scan ได้และไม่ต้องเลื่อนยาว
- page size options ค่า default สำหรับ table ที่โหลดข้อมูลมาแล้วควรเป็น `10 / หน้า` และ `25 / หน้า`; เพิ่ม 50/100 ได้เฉพาะเมื่อมีเหตุผลของ flow นั้นและต้องบันทึก override
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

- ข้อความยาวใน body cell ใช้ truncate ได้
- ถ้าตัดเป็น `...` ต้องมี tooltip หรือวิธีอ่านข้อความเต็ม
- กฎนี้ไม่ครอบหัวตาราง: header ต้องอ่าน label เต็มได้ ไม่ใช้ `truncate`, `line-clamp`, หรือ ellipsis เพื่อซ่อนความหมายของคอลัมน์

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
- **Mobile App Dialog CSS**: mobile full-screen dialog ที่ใช้ direct `DialogHeader` + body ต้องไม่ให้ global selector จับ `[data-ns-dialog-header]` เป็น content shell. Header ต้อง `flex-shrink: 0` และ body ที่เป็น direct child เช่น `.bg-slate-50` / `.overflow-y-auto` ต้องได้ `flex: 1`, `min-height: 0`, และ `overflow-y: auto` เพื่อไม่ให้ header ขยายกินทั้งจอที่ความกว้างต่ำกว่า `sm`.
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
- **Card Styling**: แต่ละกลุ่มข้อมูลใช้การ์ดขอบโค้งมนมีเงาบางๆ และพื้นหลังขาว: `rounded-xl border border-slate-200 bg-white p-5 shadow-sm`
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
- `apps/next/src/components/daily/WeightTicketListPageClient.tsx` (primary table/list reference: resizable columns, sortable headers, toolbar pagination, auto-stretch final column, and dense mobile cards)
- `apps/next/src/components/daily/MoneyMovementPageClient.tsx`
- `apps/next/src/components/master-data/shared/MasterDataPageClient.tsx`
- `apps/next/src/components/production/ProductionReportPageClient.tsx` (ตัวอย่างการทำ Responsive Table-to-Card ทุกตาราง/Dashboard และระบบ Soft Lined Table Borders ลบขีดสีดำ)

เวลาเริ่มหน้าใหม่ ให้ดู reference ที่ใกล้ domain ที่สุดก่อน

## Change Log

- 2026-07-10: Added the one-tab/one-primary-table rule from `/sales-commission`: do not render two table panels inside the same line tab. Distinct business verification tables should get separate line tabs so no table disappears and no tab becomes a two-table comparison wall.
- 2026-07-10: Added visible table-title wording rule from `/sales-commission`: visible panel/table titles should use business names, not ordinal prefixes such as `ตาราง 1` or `Table 1`; ordinal table numbers remain internal trace labels only.
- 2026-07-10: Clarified `/sales-commission` table surface order: tab-specific toolbar/filter comes before pagination, and pagination comes before the table. Mobile drilldown entry should start at the detail header so users see the selected salesperson context and back/export actions first.
- 2026-07-10: Clarified `/sales-commission` drilldown action placement: `กลับหน้าหลัก` is a standalone top-left navigation action, not a peer action inside the same card as `ส่งออก Excel`.
- 2026-07-10: Removed default dot/marker from shared KPI cards. KPI cards may show a left circular icon only when the page passes a meaningful icon; decorative `●` markers are not part of the baseline.

- 2026-07-09: Follow-up duplicate-design hardening: table/data-surface switchers must stay on shared line tabs, real segmented filters use the single `rounded-md border px-3 py-1 text-xs font-medium` slate active baseline, card-like surfaces use `rounded-xl border ... shadow-sm`, table shells use `rounded-md border ... shadow-sm`, and form controls/textareas/buttons stay on compact `rounded-md`. Page-local pill tabs, colored status-filter active states, `rounded-full` filter pills, borderless white card shadows, and `rounded-xl` form controls are treated as design drift unless a documented override exists.

- 2026-07-09: Standardized card corner radius: UI surfaces that are cards use `rounded-xl` consistently, including KPI/Summary cards, filter cards, form cards, mobile table cards, grouped detail cards, ranked/list panels, empty/loading cards, and generic content panels. `rounded-md` remains intentional for table containers, modals, inputs, selects, buttons, badges, dropdowns, and popovers.

- 2026-07-09: Corrected the table-header rule from `/stock/status-convert`: runtime table headers must not wrap to two lines. `ResizableTableHead` uses nowrap labels, and dense tables should reserve enough column width with horizontal overflow rather than wrapping labels such as `จำนวน (กก.)`, `ต้นทุน (บาท/กก.)`, or `วันที่สร้างรายการ`.

- 2026-07-08: Added KPI layout separation rule from the full sidebar audit follow-up. Single-value KPI cards must not share the same grid row with taller ranked-list or breakdown panels; keep KPI grids separate from analysis/ranked panels so KPI card size and spacing stay consistent.

- 2026-07-08: Added Thai-first wording baseline for active table/filter/detail labels. Generic English working labels such as `Code`, `Customer`, `Supplier`, `Product`, `Search Customer`, and `Select Product` must map to `รหัส`, `ลูกค้า`, `ผู้ขาย`, `สินค้า`, `ค้นหาลูกค้า`, and `เลือกสินค้า` on Thai-first ERP surfaces, while official module names may remain English.

- 2026-07-08: Added the table-header no-ellipsis rule. Runtime table headers must keep full business labels visible; shared `ResizableTableHead` does not truncate labels, and pages must reserve enough column width for important document/date headers rather than shortening wording only to fit.

- 2026-07-08: Set `apps/next/src/components/ui/KpiCard.tsx` as the single implementation for KPI/Summary cards. Page-local `Metric` / `StatCard` / `SummaryCard` / `KpiCard` / `Tile` wrappers may only map props into the shared component and must not define their own card markup, font sizes, spacing, icon shape, border-left, or gradient treatments.

- 2026-07-08: Added KPI card helper-text alignment rule from `/daily-report`: helper metrics such as average price or GP must render as a full-width KPI card footer, not under only one value column, so paired KPI cards stay visually balanced.

- 2026-07-08: Added dashboard bar/chart label rule from `/analytics-dashboard`: numeric labels must not be constrained by variable fill-bar width; use centered full-track labels or a stable label area for readability. Progress/donate-style bars should place the label directly on the track/fill with enough contrast, not inside a separate white pill unless a specific design override requires it.

- 2026-07-08: Added mobile floating-action placement rule from `/analytics-dashboard`: fixed action buttons must not cover charts, tables, cards, or bottom navigation on mobile/tablet. Keep floating actions for large screens only, or reserve explicit safe spacing; otherwise render the actions in normal content flow.

- 2026-07-08: Added the visual-first reporting rule from user feedback: page-level UI/design reports must be based on the actual rendered page plus code inspection, not code scan alone.

- 2026-07-08: Closed the table/filter/action duplicate-design sweep for active list/report surfaces. Runtime tables stay on the single `ns-table` baseline; remaining untagged `<table>` instances are only print/PDF/HTML-string document tables. Visible page actions must use the single emerald `ส่งออก Excel` treatment for spreadsheet exports, avoid duplicate CSV+Excel actions on the same surface, and remove disabled placeholder CSV/import buttons unless the page has a real documented file contract such as an import template.

- 2026-07-07: Set the `/daily/weight-ticket-list` WTI/WTO table as the single canonical active table design. New/updated tables should use one rounded-md slate-bordered white shell, `bg-slate-100` header without default vertical header separators, `px-3 py-3` body spacing, no separate lined-table variant by default, and dense mobile cards only as the responsive treatment.
- 2026-07-07: Added the global `ns-table` implementation baseline and tagged raw JSX tables in active app screens so table header, cell padding, shell treatment, and dark-mode behavior are normalized from one CSS source. Print/PDF/HTML-string document tables remain controlled by their document stylesheet.

- 2026-07-07: Extended the `/purchase/bills` filter baseline to missed filter-adjacent controls: mobile `ตัวกรอง` buttons use one white/slate `h-9 rounded-md` treatment, dashboard/report date range controls do not use gradient/purple mini panels, and report directory/search filter surfaces do not use page-local `rounded-xl`/`p-5` card variants.
- 2026-07-07: Applied the accepted filter baseline across active list/report filter surfaces: filter shells use `rounded-xl border border-slate-200/60 bg-white p-4 shadow-sm`, controls/buttons use `h-9` and `rounded-md`, and `ตัวกรอง` buttons do not carry page-local search emoji prefixes.
- 2026-07-07: Set `/purchase/bills` (`TransactionBillsPageClient`) as the canonical list filter surface and recorded the shared date-picker popover width baseline (`w-[20rem]`, calendar root `w-[19rem]`, `[--cell-size:2.25rem]`) so filter calendars do not render as narrow compressed popovers.
- 2026-07-07: Hardened the Line Tabs rule as a single shared pattern: table/data-surface tabs must use shared `TabsList variant="line"` / `TabsTrigger variant="line"` directly, with no page-local pill/segmented/color-button/card wrappers or custom tab containers unless an explicit override is approved.
- 2026-07-07: Clarified semantic split: controls that switch between multiple tables/data surfaces must be shared line tabs, not filter-card segmented controls. Tracking 360 and `/daily/weight-ticket-dashboard` therefore use line tabs for view selection, while filter cards keep only real filters and actions.
- 2026-07-08: Tracking 360 filter date baseline: Product/Customer/Supplier Tracking ต้องใช้ date range แบบ reference filter card (`วันที่:` + `DatePickerInput` จาก -> ถึง) ในแถวบน ไม่ใช้ custom `ช่วงเวลา` control หรือ year/month fields ลอยกลาง row; actions เช่น `ส่งออก Excel` อยู่แถวล่างขวา.
- 2026-07-07: บันทึก Tracking 360 page-specific baseline: Customer/Supplier ใช้ KPI -> line tabs -> global filter card -> pagination -> active data, Product ใช้ KPI -> line tabs -> global filter card -> monthly/top overview -> pagination -> active data; mobile filter ต้องเป็น compact row + `MobileFilterSheet`; Top 10 ย่อ 5 ก่อนขยายเป็น 10; Supplier Product breakdown ต้องเป็น line tab แยก; Product Tracking primary table/export ไม่แสดง `Stock`/`WAC` และให้ stock อยู่ใน detail support link เท่านั้น.
- 2026-07-07: บันทึก sidebar navigation rollback: sidebar ต้องกลับเป็นแบบ legacy/raw icon ตาม screenshot ล่าสุด คือใช้ `navigationItems.icon` โดยตรง, ไม่มีกล่อง icon, ไม่มี card-style active row, และใช้ triangle glyph สำหรับ expand/collapse.
- 2026-07-07: บันทึก hard consistency rule จาก feedback ล่าสุด: การจัดวางปุ่ม สีปุ่ม และข้อความปุ่ม/action ต้องเป็นแบบเดียวกันทั้งระบบตาม `docs/design.md` และ reference page ที่ยอมรับแล้ว ห้ามสร้างสี/ข้อความ/ตำแหน่งเฉพาะหน้าเอง และห้ามแสดง placeholder action เช่น disabled `CSV` ถ้า flow นั้นยังไม่มี export contract จริง.

- 2026-07-07: Dashboard Overview ไม่ต้องมี hero/banner แยกถ้าเป็นเพียงชื่อหน้า/คำอธิบายที่ซ้ำกับ app shell หรือ filter scope; ให้เริ่มที่ filter/runtime notice/KPI และเก็บพื้นที่ให้ widgets/tables ที่ช่วยตัดสินใจจริง
- 2026-07-06: บันทึก analysis/dashboard hierarchy จาก Stock Finance และ Dashboard Overview: global filters -> overview/status -> risk/breakdown panels -> table tabs -> active tab filter/pagination/table; table tabs ต้องมี filter ของตัวเอง, ไม่โชว์ status column/filter ถ้าซ้ำกับ chart ด้านบน, ranked list เช่น Top 10 ให้ย่อ 5 รายการก่อนแล้วค่อยกดขยาย, table baseline ไม่ควรแสดงเกิน 25 rows ต่อหน้า, dashboard mobile global filters ต้องย่อเป็น compact strip + `MobileFilterSheet` ไม่เรียง form ยาวบนหน้า, และ KPI ต้องเป็น white/accent cards ไม่ใช่ full-gradient ทุกใบ
- 2026-07-05: บันทึก mobile app shell breakpoint: bottom navigation และ bottom padding ต้องอยู่จนถึงก่อน `lg` (`lg:hidden`, `pb-20 lg:pb-6`) เพื่อให้ responsive/tablet widths เช่น 957px ยังใช้งานเหมือน mobile shell
- 2026-07-05: บันทึก mobile full-screen dialog CSS guard: ห้ามให้ selector ของ app dialog shell จับ `[data-ns-dialog-header]` เป็น flex content shell เพราะจะทำให้ header ขยายเต็มจอและซ่อน body บนจอเล็ก เช่น iPhone 14 Pro Max 430px
- 2026-07-05: บันทึก layout baseline สำหรับ report/list page ที่มีหลาย table surface: KPI cards -> line tabs -> filter card -> toolbar/pagination -> active table โดยยึด `/production/report` เป็นตัวอย่างล่าสุด
- 2026-06-13: บันทึกแนวทางการทำ Responsive Table-to-Card และ Soft Lined Table Borders (ลบขีดสีดำและ outline สีดำรอบปุ่ม/กล่องรายงาน) พร้อมการปรับขนาดฟอนต์บนหน้าจอมือถือให้อ่านง่ายพอดี (ไม่เล็กเกินไป) โดยใช้หน้าจอรายงานการผลิต (`ProductionReportPageClient.tsx`) เป็นแนวทางมาตรฐานที่ผู้ใช้ชอบ
- 2026-06-13: บันทึกมาตรฐานโครงสร้างและการจัดวางหน้าจอ List Page / Filter (ทั้งแบบเดสก์ท็อปและมือถือ) โดยอิงจากรูปแบบของหน้าจอ PO Sell (จองขาย) เพื่อความเป็นระเบียบและสอดคล้องกันทั่วทั้งระบบ
- 2026-06-13: ปรับปรุงโครงสร้างหัวข้อและสไตล์ป๊อปอัปรายละเอียด (Detail Modal) ตามหน้าจอ PO Sell/PO Buy โดยใช้ Dialog Header เป็นที่แสดงรหัสเอกสารและชื่อคู่ค้า (พร้อมซ่อนปุ่ม X มุมขวาบน), ห้ามแสดงชื่อคู่ค้าซ้ำซ้อนภายในการ์ด และเพิ่มดีไซน์ไกด์ไลน์สำหรับ Modal/Detail Popup อื่นๆ (AcexPOS Dark Header Style, Grouped Cards Layout, Mobile Responsive)
- 2026-05-23: สร้าง `docs/design.md` เพื่อแยก design conventions ออกจาก `docs/migration/00-current-work.md` และใช้เป็น source กลางสำหรับ list/filter/table/pagination/button/wording rules
