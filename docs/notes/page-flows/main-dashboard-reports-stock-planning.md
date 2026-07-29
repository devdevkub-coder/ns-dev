# Stock Planning vs PO Sell Flow

## What is what

- `Stock พร้อมส่ง` คือยอดสต๊อกปัจจุบันที่พร้อมจ่ายออกจาก Stock Balance
- `PO Buy` คือปริมาณที่กำลังเข้าตามวันกำหนดส่ง และช่วยเพิ่มยอดที่มีใช้ได้ในไทม์ไลน์
- `PO Sell` คือ commitment ที่ต้องส่งให้ลูกค้า จึงเป็นตัวตั้งของการวางแผน
- `Shortage` คือจำนวนที่ไม่พอ ณ ลำดับ PO Sell นั้น ๆ ไม่ใช่ยอดติดลบสุดท้ายเพียงอย่างเดียว

## Why it has to be like this

หน้าวางแผนต้องเรียง PO ตามวันส่งและจำลองยอดแบบ FIFO: `Stock พร้อมส่ง + PO Buy ที่เข้าก่อน/ระหว่างไทม์ไลน์ - PO Sell ก่อนหน้า` เพื่อให้เห็นว่าสินค้าใดเริ่มขาดและต้องซื้อเพิ่มกี่กิโลกรัมจริง ๆ

แท็บ `ต้องซื้อเพิ่ม` แสดงรายการจากชุดคำนวณเดียวกับภาพรวม โดยแต่ละแถวแสดงสินค้า, shortage, งบประมาณซื้อ, กำไรที่คาด และ PO Sell แรกที่ขาด จึงเป็นพื้นที่ตัดสินใจเฉพาะงานจัดซื้อโดยไม่ซ้อนกับตารางภาพรวม

## Runtime surfaces

- `/stock/planning` — `ภาพรวมสต๊อก` สำหรับสรุปสินค้าและขยายดู PO Sell รายใบ
- `/stock/planning` — `ต้องซื้อเพิ่ม` สำหรับเรียงสินค้าที่เกิด shortage พร้อมงบประมาณและกำไรที่คาด
- `/stock/planning` — `ปฏิทิน` สำหรับดู PO Sell ตามวันส่งและ drill-down รายวัน
- Source of truth: `GET /api/stock/balance` และ `GET /api/po-reports/outstanding`; stock/PO/report facts ไม่ถูก cache ใน browser

## UI presentation contract

- KPI ด้านบนเป็นภาพรวมจากผลคำนวณชุดเดียวกัน: PO Sell ค้างส่ง, พร้อมส่ง, ขาด และยอดที่ต้องซื้อเพิ่ม
- เนื้อหาหน้าเริ่มที่ KPI โดยไม่แสดงชื่อหน้าซ้ำกับ AppShell
- `ภาพรวมสต๊อก`, `ต้องซื้อเพิ่ม` และ `ปฏิทิน` เป็นคนละ data surface จึงใช้ shared line tabs และหนึ่งแท็บแสดงพื้นที่ข้อมูลหลักเพียงชุดเดียว
- Desktop ใช้ filter card ตาม Design: ค้นหาสินค้า, หมวด และล้างตัวกรองอยู่แถวบน; ในแท็บภาพรวมมี shared segmented `การแสดงผล` อยู่ซ้ายของแถวล่าง และ action จริง `ส่งออก Excel` อยู่ขวา
- Mobile ย่อเป็น search และ `ตัวกรอง`; แท็บภาพรวมแสดง `ส่งออก Excel` ในแถว action ส่วนตัวเลือกเพิ่มเติมอยู่ใน shared `MobileFilterSheet`
- ไม่มีปุ่มรีเฟรชถาวรใน toolbar เพราะไม่ใช่ page action ตาม Design; หน้าจะโหลดข้อมูลใหม่เมื่อกลับมา active และป้องกัน request ซ้อน ส่วนกรณีโหลดผิดพลาดจะแสดง `ลองใหม่` โดยไม่แสดงศูนย์หรือ empty state ที่อาจทำให้เข้าใจผิดว่าเป็นข้อมูลจริง
- ตารางหนักเปลี่ยนเป็น dense cards บน mobile ส่วน Desktop คงหัวตารางบรรทัดเดียว, จัด identifiers/status กึ่งกลาง และตัวเลขชิดขวาด้วย tabular numerals
- ตารางภาพรวมและตารางต้องซื้อเพิ่มใช้ pagination กับ shared `PageSizeDropdown` ชุดเดียวกันตามแท็บที่เปิด; การขยาย PO Sell ใช้ native button พร้อม `aria-expanded` และ `aria-controls`
- ตาราง Desktop ทั้งภาพรวม, ต้องซื้อเพิ่ม, PO Sell ที่ขยาย และรายการรายวันใช้ shared `ResizableTableHead`, ความกว้างรายคอลัมน์ และ local horizontal scroll เดียวกับ `/stock/convert`; pagination ไม่มีกล่องครอบซ้ำและแสดงปุ่ม `คืนค่าเดิมตาราง` เมื่อผู้ใช้ปรับความกว้าง
- ตารางสรุป `ภาพรวมสต๊อก` ทั้ง 9 คอลัมน์และ `ต้องซื้อเพิ่ม` ทั้ง 6 คอลัมน์เรียงข้อมูลได้จากหัวตาราง โดยเรียงผลทั้งหมดก่อน pagination; เมื่อยังไม่เลือกหัวคอลัมน์ ระบบคงลำดับความเร่งด่วน/ลำดับธุรกิจเดิม และ mobile cards ใช้ลำดับเดียวกับผลที่เรียงแล้ว
- ตาราง PO Sell ที่ขยายและรายการรายวันในปฏิทินปรับความกว้างได้แต่ไม่เปิด sort เพราะลำดับวันที่/FIFO เป็นส่วนหนึ่งของการอธิบายยอดคงเหลือและจุดเริ่ม shortage; การสลับแถวในสองตารางนี้จะทำให้ผู้ใช้อ่านลำดับคำนวณผิด
- ตารางต้องซื้อเพิ่มรวม `หมวด` ไว้ใต้สินค้า, `ต้นทุนเฉลี่ย` ไว้ใต้งบประมาณซื้อ และ `ราคาขาย PO` ไว้ใต้กำไรที่คาด เพื่อเหลือ 6 คอลัมน์ที่เปรียบเทียบได้โดยไม่ทิ้งข้อมูล
- Calendar ใช้ toolbar แบบไม่มีกล่อง พื้นหลัง หรือเงาครอบซ้ำ โดยวางข้อความ `เลือกวันที่เพื่อดู PO Sell` ทางซ้ายและชุดเลื่อน/เลือกเดือนทางขวาบน Desktop; ตารางเดือนที่กว้างอยู่ใน local horizontal scroll โดยไม่ทำให้ทั้ง document ล้น และรายการวันเลือกแสดงเป็น cards บน mobile
- Export แสดงเฉพาะแท็บภาพรวมซึ่งมี schema ตรงกับ workbook และสร้าง `.xlsx` จริงจากผลหลังกรอง ไม่ใช้ไฟล์ CSV ที่เปลี่ยนเพียงนามสกุล

- Surface ตัวกรองบน Desktop, Mobile และตัวเลือกเดือนต้องประกาศ `data-ns-field-scope="filter"` เพื่อรับ yellow-field contract จาก Design โดยตรง ไม่พึ่ง global fallback
- สี semantic ใช้เฉพาะสถานะหรือความเสี่ยงจริง: ตัวเลขทั่วไปใช้ slate, ค่าติดลบหรือ shortage ใช้สีแดง และกำไร/ขาดทุนกับ urgency ใช้สีตามความหมายทางธุรกิจ; ตารางต้องซื้อเพิ่มใช้ table shell กลางโดยไม่มีกรอบแดงครอบทั้งพื้นที่

## Why the UI has to be like this

ผู้ใช้ต้องเลือกบริบทงานก่อนแล้วจึงอ่านตารางเดียวที่ตรงกับงานนั้น: ตรวจสมดุลใน `ภาพรวมสต๊อก`, ตัดสินใจซื้อใน `ต้องซื้อเพิ่ม` หรือไล่กำหนดส่งใน `ปฏิทิน`. การแยกแท็บลดการสแกนข้อมูลซ้ำและป้องกันตารางสองชุดต่อกันเป็นหน้าแนวยาว. Desktop ใช้พื้นที่เพื่อเทียบตัวเลขได้เร็ว ส่วน mobile ลดตารางกว้างเป็น card ที่ยังคงลำดับข้อมูลทางธุรกิจ. Filter sheet และปุ่มขยายแบบ native ทำให้การใช้งานด้วย touch, keyboard และ assistive technology สอดคล้องกับ component กลางของระบบ. การอัปเดตเมื่อกลับเข้าแท็บรักษาความสดของ stock/PO โดยไม่เพิ่มปุ่มที่ทำงานซ้ำกับการโหลดข้อมูลลงใน toolbar.

การปรับ presentation นี้ไม่เปลี่ยน FIFO, shortage, margin, API, database, permission, cache contract หรือ source of truth เดิม.

## Validation checkpoint — 2026-07-28

- Focused sort + design-contract Vitest ผ่าน `12/12`; targeted ESLint ผ่าน
- Shared sortable header ตรงตาม Design: คอลัมน์ตัวเลขชิดขวาวาง caret ก่อน label เพื่อให้ขอบข้อความตรงกับค่าตัวเลขใน body โดยคงลำดับ label ก่อน caret สำหรับคอลัมน์ซ้าย/กลาง
- Workspace lint ผ่านด้วย `0 errors` และมี warnings เดิมนอก scope `6` จุด; workspace type-check ผ่าน
- Production Webpack build ผ่านด้วย Node heap `4 GB` และสร้าง static pages ครบ `325/325`; default Turbopack ใน temporary worktree ใช้ไม่ได้เพราะ `apps/next/node_modules` เป็น junction ออกนอก filesystem root ของ worktree ไม่ใช่ compile/type error ของโค้ด
- Browser inspection หลังแก้รอบสุดท้ายผ่านบน Desktop `1280px`: ตารางภาพรวมมี sortable headers `9/9`, ตารางต้องซื้อเพิ่ม `6/6`, `aria-sort` เปลี่ยน `none -> ascending -> descending` และลำดับตัวเลขเปลี่ยนถูกต้อง; ลากคอลัมน์สินค้าจาก `250px` เป็น `300px` โดยไม่ trigger sort, reload แล้วยังจำ `300px` และ `คืนค่าเดิมตาราง` กลับ `250px`
- Runtime geometry ยืนยันว่าหัวตัวเลขชิดขวาวาง caret ก่อน label ทั้งลำดับ DOM และตำแหน่งที่มองเห็นจริง; reload รอบตรวจเครือข่ายได้ `/api/auth/me`, `/api/activity`, `/api/po-reports/outstanding` และ `/api/stock/balance` เป็น HTTP `200` โดยไม่มี failed request หรือ console warning/error
- ตาราง PO Sell ที่ขยายมี fixed-order headers `8/8` และรายการรายวันมี `7/7`: ทุกคอลัมน์มี Resize แต่ไม่มี sort button/`aria-sort`; แถวยังคงลำดับวันที่/FIFO สำหรับอ่าน available stock และ shortage ต่อเนื่อง
- Mobile `390x844` ไม่มี document overflow, ไม่มีตาราง Desktop ที่มองเห็น และ cards ใช้ลำดับเดียวกับ Desktop หลัง Sort; ปฏิทินและรายการวันเลือกเปลี่ยนเป็น cards ตาม Design และไม่พบ console warning/error
- Focused contract ยืนยัน Sort เกิดก่อน pagination, Desktop table ทั้ง 4 ชุดใช้ shared resizable headers/colgroup, ไม่มี raw `<th>` เหลือ, mobile card branch มี empty state สำหรับสินค้าที่ไม่มี PO และไม่เปลี่ยน FIFO/shortage/margin/API
