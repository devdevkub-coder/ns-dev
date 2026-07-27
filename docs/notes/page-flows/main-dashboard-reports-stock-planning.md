# Stock Planning vs PO Sell Flow

## What is what

- `Stock พร้อมส่ง` คือยอดสต๊อกปัจจุบันที่พร้อมจ่ายออกจาก Stock Balance
- `PO Buy` คือปริมาณที่กำลังเข้าตามวันกำหนดส่ง และช่วยเพิ่มยอดที่มีใช้ได้ในไทม์ไลน์
- `PO Sell` คือ commitment ที่ต้องส่งให้ลูกค้า จึงเป็นตัวตั้งของการวางแผน
- `Shortage` คือจำนวนที่ไม่พอ ณ ลำดับ PO Sell นั้น ๆ ไม่ใช่ยอดติดลบสุดท้ายเพียงอย่างเดียว

## Why it has to be like this

หน้าวางแผนต้องเรียง PO ตามวันส่งและจำลองยอดแบบ FIFO: `Stock พร้อมส่ง + PO Buy ที่เข้าก่อน/ระหว่างไทม์ไลน์ - PO Sell ก่อนหน้า` เพื่อให้เห็นว่าสินค้าใดเริ่มขาดและต้องซื้อเพิ่มกี่กิโลกรัมจริง ๆ

กล่อง `ต้องซื้อสินค้าเพิ่มด่วน` แสดงรายการจากชุดคำนวณเดียวกับตารางหลัก โดยแต่ละแถวแสดงสินค้า, shortage, PO Sell แรกที่ขาด, วันส่ง และลูกค้า จึงไม่เป็นเพียงตัวเลขรวมที่ผู้ใช้ต้องไล่หาเองในตารางด้านล่าง

## Runtime surfaces

- `/stock/planning` — Table view สำหรับสรุปสินค้าและขยายดู PO Sell รายใบ
- `/stock/planning` — Calendar view สำหรับดู PO Sell ตามวันส่งและ drill-down รายวัน
- Source of truth: `GET /api/stock/balance` และ `GET /api/po-reports/outstanding`; stock/PO/report facts ไม่ถูก cache ใน browser

## UI presentation contract

- KPI ด้านบนเป็นภาพรวมจากผลคำนวณชุดเดียวกัน: PO Sell ค้างส่ง, พร้อมส่ง, ขาด และยอดที่ต้องซื้อเพิ่ม
- `ตาราง` กับ `ปฏิทิน` เป็นคนละ data surface จึงใช้ shared line tabs ไม่ใช้ปุ่มสลับมุมมองเฉพาะหน้า
- Desktop ใช้ filter card สองแถวตาม Design: ค้นหาสินค้าและหมวดอยู่แถวบน ส่วนตัวเลือกสินค้าที่ไม่มี PO, รีเฟรช และ `ส่งออก Excel` อยู่แถวล่าง
- Mobile ย่อเป็น search, `ตัวกรอง`, รีเฟรช และ `ส่งออก Excel`; ตัวเลือกเพิ่มเติมอยู่ใน shared `MobileFilterSheet`
- ตารางหนักเปลี่ยนเป็น dense cards บน mobile ส่วน Desktop คงหัวตารางบรรทัดเดียว, จัด identifiers/status กึ่งกลาง และตัวเลขชิดขวาด้วย tabular numerals
- ตารางหลักมี pagination และ shared `PageSizeDropdown`; การขยาย PO Sell ใช้ native button พร้อม `aria-expanded` และ `aria-controls`
- Calendar เก็บตารางเดือนที่กว้างไว้ใน local horizontal scroll โดยไม่ทำให้ทั้ง document ล้น และแสดงรายการวันเลือกเป็น cards บน mobile
- Export สร้าง workbook `.xlsx` จริงจากผลหลังกรอง ไม่ใช้ไฟล์ CSV ที่เปลี่ยนเพียงนามสกุล

## Why the UI has to be like this

ผู้ใช้ต้องเห็นความเสี่ยงที่ต้องซื้อเพิ่มก่อน แล้วจึงลงรายละเอียดตามงานที่กำลังทำโดยไม่ต้องเทียบหลายรูปแบบใน surface เดียวกัน. Desktop ใช้พื้นที่เพื่อสแกนตารางและตัวเลขได้เร็ว ส่วน mobile ลดตารางกว้างเป็น card ที่ยังคงลำดับข้อมูลทางธุรกิจ. Filter sheet และปุ่มขยายแบบ native ทำให้การใช้งานด้วย touch, keyboard และ assistive technology สอดคล้องกับ component กลางของระบบ.

การปรับ presentation นี้ไม่เปลี่ยน FIFO, shortage, margin, API, database, permission, cache contract หรือ source of truth เดิม.

## Validation checkpoint — 2026-07-27

- Focused design-contract Vitest ผ่าน `3/3`; targeted ESLint ผ่าน
- Workspace lint ผ่านด้วย `0 errors` และมี warnings เดิมนอก scope `6` จุด; workspace type-check ผ่าน
- Production build ผ่านและสร้าง routes ครบ `326/326`
- Browser QA ผ่านที่ Desktop `1280x720` และ Mobile `390x844`: ไม่มี document overflow, Desktop แสดง table/ซ่อน mobile cards, Mobile ซ่อน table/แสดง cards, numeric headers ตรงกับ numeric cells, filter sheet มี dialog semantics และคืน focus, Calendar ใช้ local overflow และแสดง drill-down cards; Light/Dark surfaces ยังรักษาลำดับชั้นและ contrast
- แท็บ browser ใหม่ไม่มี console warning/error หลังจบ flow
