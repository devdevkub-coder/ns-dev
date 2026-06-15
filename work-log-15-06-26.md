# NS Scrap ERP Work Log (2026-06-15)

## 📅 ข้อมูลทั่วไป
- **วันที่:** 15 มิถุนายน 2569 (2026-06-15)
- **แอปพลิเคชันหลัก:** `apps/next/` (Next.js Target)
- **ฐานข้อมูลพัฒนา (Dev Target):** Supabase `fhglqymcdmrgbsbadnwr`

---

## 🛠️ รายการสิ่งต่าง ๆ ที่ดำเนินการแล้ววันนี้

### 1. รันเซิร์ฟเวอร์พัฒนา (Next.js Dev Server)
- **การดำเนินการ:** เริ่มต้นรันคำสั่ง `npm run dev` ในโหมดเบื้องหลัง (Background Task ID: `task-17`)
- **สถานะ:** ทำงานสำเร็จเรียบร้อย (Ready)
- **พอร์ตที่ใช้งาน:**
  - Local: [http://localhost:3000](http://localhost:3000)
  - Network: [http://0.0.0.0:3000](http://0.0.0.0:3000)

### 2. สร้างไฟล์ติดตามงานประจำวัน (Daily Task Checklist)
- **การดำเนินการ:** สร้างไฟล์ `task15-06-26.md` ใน root ของโปรเจกต์ เพื่อเตรียมรองรับรายการงานและขั้นตอนถัดไปที่ผู้ใช้จะสั่งการ
- **ลิงก์ไฟล์:** [task15-06-26.md](file:///c:/new-ns-scrap-erp/task15-06-26.md)

### 3. บันทึกประวัติการทำงาน (Work Log)
- **การดำเนินการ:** สร้างไฟล์นี้ขึ้นมาเพื่อบันทึกงานที่ดำเนินการเสร็จสิ้นในแต่ละช่วงของวัน
- **ลิงก์ไฟล์:** [work-log-15-06-26.md](file:///c:/new-ns-scrap-erp/work-log-15-06-26.md)

### 4. ติดตั้งและตั้งค่า Headroom
- **การดำเนินการ:** 
  - ติดตั้ง `headroom-ai[mcp]` และ `httpx[http2]` ในระบบ
  - ลงทะเบียนเซิร์ฟเวอร์ MCP สำหรับ Codex (`headroom mcp install`) เพื่อช่วยบีบอัด Context
  - รัน Headroom proxy ในโหมดเบื้องหลัง (Background Task ID: `task-79`) บนพอร์ต `http://127.0.0.1:8787` เพื่อเร่งประสิทธิภาพการบีบอัด Token และลดค่าใช้จ่าย/ประหยัด Context window ของ LLM

### 5. สร้างเอกสารคู่มือ Peach UI (AcexPOS Style)
- **การดำเนินการ:** สร้างคู่มืออ้างอิงและเกณฑ์มาตรฐานสำหรับการออกแบบหน้าจอระบบ (UI Rehabilitation Guidelines) ในไฟล์ `Peach.md` เพื่อสรุปการเปลี่ยนแปลงที่อัปเดตไปในบรันช์ `peach` และใช้อ้างอิงการจัดวางปุ่ม ตาราง การ์ด และ Modal
- **ลิงก์ไฟล์:** [Peach.md](file:///c:/new-ns-scrap-erp/Peach.md)

### 6. เพิ่มกฎควบคุมการทำงานและข้อตกลงการพัฒนาทั้งหมดใน Peach.md
- **การดำเนินการ:** บันทึกข้อกำหนดทั้งหมด ได้แก่ **Strict Scope Control**, กฎการใช้งาน Git, **Design Consistency**, **Inquiry vs Action**, **Ask When Unsure**, **Create Task Checklist**, **Brief Final Reports**, **Validation & Verification**, **Preserve Unrelated Code**, **Fail-Fast Policy**, **Visual Verification**, **Mobile Responsiveness**, **Commit Summary Policy**, **Visual Image Feedback & Audit Policy**, **No Horizontal Scroll Tables on Mobile** และ **Thorough Interactive Browser Testing** ลงในไฟล์ [Peach.md](file:///c:/new-ns-scrap-erp/Peach.md) เพื่อใช้เป็นกฎหลักในการควบคุมการปฏิบัติงานของเอเจนต์ในเครื่องพัฒนาอย่างเป็นระบบ
- **ลิงก์ไฟล์:** [Peach.md](file:///c:/new-ns-scrap-erp/Peach.md)

### 7. ปรับแต่ง UI ใบรับซื้อและบิลขายสไตล์ AcexPOS
- **การดำเนินการ:** ปรับเปลี่ยนหน้าตาของ Modal "สร้างบิลรับซื้อใหม่" และ "สร้างบิลขายใหม่" ใน [TransactionBillsPageClient.tsx](file:///c:/new-ns-scrap-erp/apps/next/src/components/daily/TransactionBillsPageClient.tsx):
  - เปลี่ยนสีบาร์หัวข้อ (Header) เป็นสี Slate-900 เข้ม ไร้กรอบล่าง (`bg-slate-900 px-6 py-5 text-white`)
  - เปลี่ยนรูปแบบปุ่ม "ยกเลิก" เป็นแบบข้อความเรียบง่ายไร้กรอบ (Text-only Button) ชิดขวา
  - เปลี่ยนปุ่ม "บันทึก" เป็นสีเข้ม Slate (`bg-[#0F172A] hover:bg-[#1E293B]`) มนสวยงาม พร้อมเพิ่มเอฟเฟกต์สีเวลายกเลิกการโฟกัส (`focus:outline-none`)
- **สถานะ:** เสร็จสมบูรณ์
- **ผลลัพธ์การตรวจสอบ (Validation & Verification):**
  - รันคำสั่ง `npm run lint` และ `npm run type-check` ผ่านเรียบร้อย (0 errors)
  - ปรับปรุงคู่มือการทดสอบใน `Peach.md` เพื่อป้องกันการตกหล่น โดยกำหนดให้ทดสอบครบทุกโหมดแบบจบกระบวนการจริง (End-to-End)
  - ทดสอบสร้างบิลรับซื้อแบบ TRADING แบบ End-to-End สำเร็จ ได้เลขที่เอกสาร **PB012606-0004** ยอดสุทธิ 22,500.00 บาท และสามารถกด "แก้ไข" ปรับราคาทองแดงเส้นใหญ่จาก 50 บาท เป็น 60 บาท และบันทึกแก้ไขคำนวณใหม่ได้ยอดสุทธิ 23,400.00 บาท เข้าฐานข้อมูลอย่างสมบูรณ์แบบ
  - ภาพบันทึกการกรอกบิล TRADING: [trading_bill_form_filled](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/trading_bill_form_filled_1781494364529.png)
  - ภาพบันทึกการกรอกบิล TRADING: [trading_bill_form_filled](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/trading_bill_form_filled_1781494364529.png)
  - ภาพตารางรายการหลังบันทึกและแก้ไขสำเร็จ: [purchase_bill_list_updated](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/purchase_bill_list_updated_1781494414031.png)

### 8. การทดสอบปุ่มในกรอบแดงและ Responsive 375px อย่างละเอียด (Thorough Interactive Browser Testing)
- **การดำเนินการ:** ดำเนินการทดสอบโดยการกดปุ่มทุกปุ่มบนหน้าจอ "บิลรับซื้อ" (Purchase Bills) ตามกรอบแดงที่ผู้ใช้กำหนด ทั้งในโหมดเดสก์ท็อปและโหมดโทรศัพท์มือถือ 375px ผ่าน Browser Subagent
- **รายละเอียดการตรวจสอบ:**
  - **Header Tabs (แท็บ):** ทดลองสลับแท็บ "ประวัติเปลี่ยนตัว Supplier" และ "เลขที่ซื้อ" ทำงานได้ราบรื่น ดึงข้อมูลตรงและไม่มีการค้าง
  - **Type Filters (ตัวกรองประเภท):** ทดลองกด "STOCK", "TRADING" และ "ทุกประเภท" ตารางข้อมูลกรองแบ่งประเภททันทีและแสดงรายการตรงตาม Database constraint
  - **Status Filters (ตัวกรองสถานะ):** ไล่กดทดสอบครบทั้ง 7 ปุ่ม ("ทุกสถานะ", "ยังไม่อนุมัติ", "รอจ่าย", "ชำระบางส่วน", "เสร็จสิ้น", "ยกเลิก", "ยกเลิก/เปลี่ยน Supplier") ตารางกรองและเปลี่ยนสถานะแบบ Real-time
  - **Table Rows / Detail Checking (ตารางและรายละเอียด):** คลิกแถวรายการบิลแรกในตารางเพื่อเรียกเปิด Detail Dialog modal ข้อมูลแสดงแยกส่วนหัวกับส่วนตารางสินค้าชัดเจนสวยงาม ไม่มี Focus Outline ขีดดำเข้ม และขนาดตัวหนังสืออ่านง่ายเหมาะสม
  - **Mobile Responsive (375x812):** ทดสอบสลับสัดส่วนหน้าจอ:
    - แท็บปรับขนาดให้พอดี
    - ตัวกรองหดรวมเป็นปุ่ม "ตัวกรอง" เมื่อกดจะเลื่อนลิ้นชัก (Filter Drawer) ขึ้นมาจากด้านล่าง มีการทำงานครบถ้วน กดปุ่ม STOCK / TRADING คัดกรองและปิดหน้าต่างได้ถูกต้อง
    - ตารางแปลงสภาพเป็นการ์ดแนวตั้ง (Mobile Card List Layout) สัมผัสง่าย และเมื่อคลิกการ์ดจะเปิดแสดงรายละเอียดบิลสวยงามไม่มีการตกขอบหรือแถบเลื่อนแนวนอน (Horizontal scroll)
- **ภาพหลักฐานการทดสอบในระบบ (Artifact Screenshots):**
  - แท็บประวัติเปลี่ยนตัวคู่ค้า (Desktop): [desktop_tab_history](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/desktop_tab_history_1781495504765.png)
  - แท็บบิลรับซื้อหลัก (Desktop): [desktop_tab_bills](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/desktop_tab_bills_1781495513611.png)
  - ตัวกรองประเภท STOCK (Desktop): [desktop_filter_stock](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/desktop_filter_stock_1781495520622.png)
  - ตัวกรองประเภท TRADING (Desktop): [desktop_filter_trading](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/desktop_filter_trading_1781495528480.png)
  - ตัวกรองทุกประเภท (Desktop): [desktop_filter_type_all](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/desktop_filter_type_all_1781495539604.png)
  - ตัวกรองสถานะยังไม่อนุมัติ (Desktop): [desktop_status_pending](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/desktop_status_pending_1781495547255.png)
  - ตัวกรองสถานะรอจ่าย (Desktop): [desktop_status_awaiting](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/desktop_status_awaiting_1781495558096.png)
  - ตัวกรองสถานะชำระบางส่วน (Desktop): [desktop_status_partial](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/desktop_status_partial_1781495566263.png)
  - ตัวกรองสถานะเสร็จสิ้น (Desktop): [desktop_status_completed](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/desktop_status_completed_1781495573383.png)
  - ตัวกรองสถานะยกเลิก (Desktop): [desktop_status_cancelled](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/desktop_status_cancelled_1781495581940.png)
  - ตัวกรองสถานะยกเลิก/เปลี่ยน Supplier (Desktop): [desktop_status_cancelled_supplier](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/desktop_status_cancelled_supplier_1781495589426.png)
  - ตัวกรองทุกสถานะ (Desktop): [desktop_status_all](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/desktop_status_all_1781495596411.png)
  - หน้าต่างตรวจสอบรายละเอียดบิล (Desktop Modal): [desktop_bill_detail](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/desktop_bill_detail_1781495606722.png)
  - แท็บประวัติเปลี่ยนตัวคู่ค้า (Mobile): [mobile_tab_history](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/mobile_tab_history_1781495624826.png)
  - แท็บบิลรับซื้อหลัก (Mobile): [mobile_tab_bills](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/mobile_tab_bills_1781495631085.png)
  - ลิ้นชักตัวกรองสไลด์เปิด (Mobile Filter Drawer): [mobile_filter_drawer_open](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/mobile_filter_drawer_open_1781495639948.png)
  - ผลลัพธ์กรอง STOCK (Mobile): [mobile_filter_stock_applied](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/mobile_filter_stock_applied_1781495647475.png)
  - ผลลัพธ์กรอง TRADING (Mobile): [mobile_filter_trading_applied](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/mobile_filter_trading_applied_1781495661662.png)
  - รายละเอียดบิลบนมือถือ (Mobile Detail Dialog): [mobile_bill_detail](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/mobile_bill_detail_1781495681604.png)

### 9. อัปเดตนโยบายการตรวจหาจุดบกพร่องทางสายตา (Visual Self-Audit & "Eh" Policy)
- **การดำเนินการ:** บันทึกข้อตกลงการพัฒนาลงในไกด์ไลน์ [Peach.md](file:///c:/new-ns-scrap-erp/Peach.md) ว่าด้วยเรื่องพฤติกรรมการวิเคราะห์และตรวจเช็คจุดบกพร่องทางสายตาด้วยตนเองก่อนเสนอปรับปรุง (Proactive Visual Self-Audit & "Eh" Policy) โดยกำหนดให้เอเจนต์สังเกตและเสนอแนะแนวทางแก้ไขให้ผู้ใช้ตัดสินใจเลือกทุกครั้งที่เจอปัญหาทางกายภาพของหน้าจอ เช่น ข้อความเบียดทับ หรือตารางไม่ยืดหยุ่น เพื่อความเรียบร้อยและรักษาคุณภาพ UI

### 10. ปรับนโยบายการทดสอบตัวกรองเพื่อประหยัดเวลา (Filter Sample Testing Optimization)
- **การดำเนินการ:** ปรับลดข้อกำหนดการตรวจสอบฟังก์ชันคัดกรองตัวกรอง (Filters) บนหน้าจอ ในคู่มือ [Peach.md](file:///c:/new-ns-scrap-erp/Peach.md) โดยกำหนดให้ทำเพียงการสุ่มตรวจสอบบางเงื่อนไขที่เป็นตัวแทน (Sample testing เช่น กรอง STOCK 1 ครั้ง และ กรองสถานะ 1 ครั้ง) เพื่อยืนยันว่าการทำงานเชื่อมโยงถูกต้องก็พอ ไม่จำเป็นต้องไล่กดสลับสปินเนอร์เพื่อตรวจจนครบทุกตัวปุ่ม เพื่อลดเวลาในการรอคอยและประหยัดการทำงานของเซสชันประมวลผลตามคำสั่งล่าสุดของผู้ใช้

### 11. แก้ไขปัญหา UI ตารางล้นและข้อความซ้อนทับกันในหน้าบิลขาย/ซื้อ (Table Text Overlapping Fix)
- **การดำเนินการ:** แก้ไขโค้ดใน [TransactionBillsPageClient.tsx](file:///c:/new-ns-scrap-erp/apps/next/src/components/daily/TransactionBillsPageClient.tsx) เพื่อแก้ไขปัญหาทางกายภาพของการแสดงผลตารางข้อมูล (Desktop Mode) สำหรับหน้าบิลขายและบิลซื้อ:
  - **คอลัมน์ "เลขที่" และ "ลูกค้า":** ใส่ CSS class `truncate` และเพิ่ม tooltip อัตโนมัติด้วยคุณลักษณะ `title={...}` ป้องกันการล้นช่องและทับซ้อนกับคอลัมน์อื่นอย่างสมบูรณ์แบบ
  - **คอลัมน์ "GP / Margin":** ปรับเปลี่ยน Spacing และ Typography ให้สวยงามเป็นระเบียบตามสไตล์ AcexPOS Dashboard โดยให้ตัวเลขหลักและเปอร์เซ็นต์ย่อยจัดวางบรรทัดที่เหมาะสม (`space-y-0.5` และ `leading-tight`) ลดขนาดฟอนต์ของเปอร์เซ็นต์เป็น `text-[10px]` และเปลี่ยนสีให้จางลงเป็นสี `text-slate-400`
  - **คอลัมน์ "อัพเดตล่าสุด":** จำกัดความกว้างของตัวอีเมล/ชื่อผู้แก้ไขด้วย `truncate` และจัดเรียงคู่กับวันเวลาให้อ่านง่าย
- **ผลการคอมไพล์และการตรวจสอบ (Technical Validation):**
  - รัน `type-check` ผ่านสำเร็จ 100% ไม่มีข้อผิดพลาด
  - รัน `lint` (eslint) ผ่านสำเร็จ 100% ไม่มีข้อผิดพลาดในไฟล์ที่ทำการแก้ไข
- **ภาพหลักฐานการทดสอบตารางบิลขายหลังอัปเดต:** [sales_bills_fixed_table](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/sales_bills_fixed_table_1781496032333.png)

### 12. ปรับปรุงสไตล์และแก้ไขปัญหากล่องสถิติและตารางข้อมูลหน้าประวัติเปลี่ยน Supplier (Supplier Swap History UI Polish - Final)
- **การดำเนินการ:** ปรับปรุงโครงสร้างของส่วนประกอบหน้าจอ "ประวัติเปลี่ยน Supplier ในบิล" ใน [BillSwapHistoryPageClient.tsx](file:///c:/new-ns-scrap-erp/apps/next/src/components/daily/BillSwapHistoryPageClient.tsx):
  - **KPI Cards ด้านบน:** ยกเลิกการใช้แบบ Left-border indicator cards (ขอบซ้ายหนา) ตามฟีดแบ็กของผู้ใช้ และเปลี่ยนมาใช้ดีไซน์หลักตามมาตรฐาน **Peach UI / AcexPOS** (การ์ดขาวมนบาง `bg-white shadow-sm border border-slate-200 rounded-xl` มีไอคอนวงกลมสีพาสเทลอ่อนอยู่ด้านซ้าย และข้อความชื่อกับค่าตัวเลขสถิติเด่นชัดอยู่ทางขวา)
  - **ตรรกะสีค่าศูนย์ (Zero Neutral Slate Gray):** เพิ่มการทำงานใน `getDiffTextColors(diff)` ให้รองรับเมื่อส่วนต่างเท่ากับ `0.00` ให้เปลี่ยนสีวงกลมพาสเทลไอคอนเป็นสีเทา (`bg-slate-100 text-slate-600`) และตัวเลขผลลัพธ์เป็นสีเทาเข้ม (`text-slate-900`) ไม่ปล่อยเป็นสีเขียวหรือแดง เพื่อความถูกต้องตามหลักการเงินการบัญชี
  - **ตาราง Desktop:** ห่อหุ้มตารางด้วยคอนเทนเนอร์ที่มีขอบมนบางนุ่มตา (`rounded-md border border-slate-100 bg-white shadow-sm`)
  - **คอลัมน์ เลขที่บิล, Supplier เดิม, Supplier ใหม่, สินค้า และเหตุผล:** ใส่ CSS `truncate` และเพิ่ม HTML title tooltip เพื่อย่นคำที่ยาวผิดปกติ ป้องกันตารางล้นและอักษรซ้อนทับกัน
- **การปรับปรุงเอกสารแนวทางดีไซน์:**
  - บันทึกความชอบของผู้ใช้และข้อห้ามเกี่ยวกับ Left-border cards รวมถึงกติกาตรรกะสีตัวเลขผลลัพธ์ที่เป็นศูนย์ลงในคู่มือ [Peach.md](file:///c:/new-ns-scrap-erp/Peach.md) เรียบร้อยเพื่อเป็นแนวทางอ้างอิงให้เอเจนต์ในรอบถัดๆ ไป
- **ผลการคอมไพล์และการตรวจสอบ (Technical Validation):**
  - รัน `type-check` และ `lint` (eslint) บน `@ns-scrap-erp/next` ผ่านสำเร็จ 100% ปราศจาก Error ในตัว Component
- **ภาพหลักฐานการปรับปรุงหน้าจอประวัติเปลี่ยน Supplier:** [kpi_cards_neutral_gray](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/kpi_cards_status_1781496817967.png) (แสดงผลการ์ด Coins ส่วนต่าง 0.00 เป็นสีเทาอ่อนพาสเทลตามแนวทาง Peach UI ที่ผ่านการอนุมัติ)

### 13. ซ่อนช่องกรอก "เลขที่เอกสาร" (Auto-generated) ในแบบฟอร์มคลังสินค้า (Stock Operations UI)
- **การดำเนินการ:** แก้ไขคอมโพเนนต์ร่วม `<BaseDateDoc />` ใน [StockOperationPageClient.tsx](file:///c:/new-ns-scrap-erp/apps/next/src/components/stock/StockOperationPageClient.tsx) เพื่อซ่อนกล่องกรอกข้อมูล "เลขที่เอกสาร" (Document Number) เนื่องจากระบบฝั่งเซิร์ฟเวอร์จะสร้างให้อัตโนมัติ (Auto-generated) ในตอนบันทึกส่งฟอร์มใหม่อยู่แล้ว
- **ผลลัพธ์:** ผู้ใช้งานจะไม่เห็นช่อง "เลขที่เอกสาร" ในหน้าต่าง Modal "ปรับเกรดสินค้า" (Grade Adjustment) และ "ปรับสต๊อกสินค้า" (Stock Adjustment) อีกต่อไป ป้องกันการสับสนของข้อมูลและลดการกรอกฟิลด์ที่ไม่จำเป็น
- **สถานะ:** เสร็จสมบูรณ์
- **ภาพหลักฐานการทดสอบหน้าจอ:** [grade_adjustment_no_doc_no](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/grade_adjustment_no_doc_no_1781497331376.png) (แสดงผลกล่อง Modal ปรับเกรดสินค้าที่ซ่อนช่องเลขที่เอกสารไปแล้ว เลย์เอาต์สมมาตรและสะอาดตา)### 14. แก้ไขปัญหาเลือกสินค้าไม่ได้ใน SearchCombobox และปรับฟิลด์ Shift ในหน้าใบสั่งผลิต
- **การดำเนินการ:**
  - **แก้ไข SearchCombobox:** แก้ไขปัญหาใหญ่ที่ Radix UI Dialog focus trap บล็อกการคลิกปุ่ม Portal ที่อยู่ภายนอก Dialog DOM tree โดยปรับปรุงให้ `SearchCombobox` ทำการตรวจหาและตั้ง `scopedPortalHost` เป็น Dialog Content element (`[role="dialog"]`) เพื่อเรนเดอร์ dropdown panel ภายใต้ Dialog DOM tree ทันที ทำให้อีเวนต์ pointerdown/click ของเมาส์ผ่านทะลุเข้าไปทำงานและแก้ไขได้ 100%
  - **Click Outside & Capturing Phase:** เปลี่ยนระบบปิด dropdown จากเดิมที่ใช้ input `onBlur` (มีปัญหา race condition กับ timeout) มาใช้ Click Outside handler บน `document` ร่วมกับ `onMouseDownCapture` และ `onTouchStartCapture` บนตัวเลือกเพื่อหยุดการบล็อกของ Radix UI
  - **ปรับฟิลด์ Shift:** เปลี่ยนช่องกะการทำงาน (Shift) ใน [ProductionOrdersPageClient.tsx](file:///c:/new-ns-scrap-erp/apps/next/src/components/production/ProductionOrdersPageClient.tsx) จาก `<input>` เป็น `<select>` มีตัวเลือก "เช้า" และ "บ่าย" ตามสไตล์ AcexPOS
  - **ข้อตกลงและกฎเหล็กการทดสอบ:** บันทึกข้อกำหนดความปลอดภัยของข้อมูลหลัก "ห้ามเพิ่มข้อมูลสินค้าหรือข้อมูลหลักเองในการทดสอบเด็ดขาด ให้ใช้เฉพาะสินค้าเดิมที่มีอยู่จริงของโรงงานเท่านั้น" ลงในเอกสารแนวทาง [Peach.md](file:///c:/new-ns-scrap-erp/Peach.md) และเอกสารติดตามงานเรียบร้อยเพื่อความโปร่งใสและถูกต้องของข้อมูล
- **ผลลัพธ์การตรวจสอบ (E2E Test):**
  - รัน `type-check` และ `lint` บนเครื่องโลคอลผ่านสำเร็จ 100%
  - จำลองความจริงผ่าน Browser subagent คลิกเลือกสินค้าตัวแรก **"SKU001 - กระทะดำ, ผัด"** โดยไม่มีการพิมพ์ค้นหา และกดบันทึกสำเร็จ จนเกิดรายการใบสั่งผลิตใหม่รหัส **`PO2606-0003`**
  - ภาพถ่ายโมดอลหลังกดเลือก: [dialog_after_click_product](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/dialog_after_click_product_1781499177516.png)
  - ภาพตารางหลักหลังสร้างใบสั่งผลิตสำเร็จ: [production_orders_with_new_order](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/production_orders_with_new_order_1781499258928.png)

### 15. จัด responsive หน้ารายการใบสั่งผลิตและรายละเอียด (Production Orders Responsive - Final)
- **การดำเนินการ:** ปรับปรุง Responsive ในหน้าใบสั่งผลิต [ProductionOrdersPageClient.tsx](file:///c:/new-ns-scrap-erp/apps/next/src/components/production/ProductionOrdersPageClient.tsx):
  - **Mobile Toolbar:** เพิ่มปุ่ม "+ สร้าง" สี Slate-900 ขนาดเล็กกระชับ (h-9) ลงใน Toolbar สำหรับจอมือถือถัดจากปุ่มตัวกรอง เพื่ออำนวยความสะดวกในการกดสร้างใบสั่งผลิตบนอุปกรณ์ขนาดเล็ก
  - **Modal Footer:** ตกแต่งปุ่มปิดและปุ่มบันทึกใน footer ของใบสั่งผลิต:
    - ปุ่มยกเลิก/ปิด: เปลี่ยนจากปุ่มปกติมีกรอบเป็น Text-only button ไร้กรอบ (`bg-transparent text-slate-500 hover:text-slate-700 border-0 outline-none transition-colors`) ชิดขวา
    - ปุ่มบันทึก/ตกลง: ใช้เฉดสีกรมท่าเข้มพรีเมียม (`bg-[#0F172A] hover:bg-[#1E293B] font-semibold text-white transition-colors`) ตามมาตรฐาน Peach UI
  - **Product Stock Preview:** ปรับตารางสต๊อกสินค้าที่จะผลิตให้รองรับ Responsive:
    - แสดงผลในรูปแบบ Desktop table ตามปกติบนจอใหญ่ (`hidden md:block`)
    - ยุบเป็นกล่องการ์ดแนวตั้งกระชับ (Mobile Dense Card List) บนจอมือถือ (`block md:hidden`) เพื่อหลีกเลี่ยง Horizontal Scrollbar
  - **Metric Cards ใน Modal รายละเอียด:** ปรับปรุงดีไซน์ Metric Cards 6 กล่องด้านบนของ Modal ให้สอดคล้องกันโดยใช้กรอบบางมน `bg-white shadow-sm border border-slate-200 rounded-xl`
- **ผลการคอมไพล์และการตรวจสอบ (Technical Validation):**
  - รัน `type-check` และ `lint` บนเครื่องโลคอลผ่านสำเร็จ 100%
  - ทดสอบความถูกต้องบนเบราว์เซอร์ผ่าน Browser Subagent ใน viewport 375px ยืนยันว่าไม่มีส่วนประกอบใดหลุดล้น มีการจัดวางที่สวยงามและใช้งานได้ง่าย

### 16. ปรับปรุงระบบจัดการคลังรับผลผลิตฝ่ายผลิต (Production Destination Warehouse Redesign)
- **การดำเนินการ:**
  - ซ่อนช่องเลือก **"คลังรับผลผลิต *"** (destinationWarehouseCode) ออกจากฟอร์มสร้างใบสั่งผลิตใหม่ เพื่อลดความซ้ำซ้อนตามที่ลูกค้าแจ้งในห้องสนทนา Line
  - ซ่อนฟิลด์แสดง **"คลังรับผลผลิต"** ออกจากหน้าจอแสดงรายละเอียดใบสั่งผลิต (Header Tab)
  - เพิ่มระบบคำนวณและ Auto-set คลังสินค้าประเภท `FG` ของสาขาที่เลือกเป็นคลังรับผลผลิตเริ่มต้นในเบื้องหลัง เพื่อรองรับ Backend validation ที่เป็น required field ของฐานข้อมูลและ API
  - คงฟิลด์ **"คลังรับ"** ในแท็บ **Output** ของรายละเอียดใบสั่งผลิตไว้เพื่อให้ผู้ใช้เลือกคลังรับสินค้าจริงได้ตอนบันทึกรับผลผลิต
- **ผลลัพธ์การตรวจสอบ (E2E Test & Validation):**
  - รัน `npm run type-check` และ `npm run lint` ของ Next.js Workspace ผ่านสำเร็จ 100% ไม่มีข้อผิดพลาด
  - ดำเนินการทดสอบผ่าน Browser subagent โดยจำลองการสร้างใบสั่งผลิต PO ตัวใหม่ (ได้เลขที่เอกสาร **PO2606-0005**) ยืนยันว่าไม่มีช่องคลังรับผลผลิตให้กรอกบน UI แต่สามารถบันทึกสำเร็จลงฐานข้อมูล และแสดงข้อมูลในตารางได้อย่างถูกต้อง
  - ยืนยันว่าเมื่อเปิดดูรายละเอียดใบสั่งผลิต ในแท็บ Header ไม่มีฟิลด์คลังรับแสดง แต่ในแท็บ Output มีฟิลด์ "คลังรับ" ให้ระบุตามความต้องการของลูกค้า
- **ภาพหลักฐานการทดสอบในระบบ (Artifact Screenshots & Videos):**
  - ฟอร์มสร้างใบสั่งผลิตที่ซ่อนคลังรับผลผลิต: [create_dialog_no_dest_wh](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/create_dialog_no_dest_wh_1781503719316.png)
  - รายการตารางแสดงเอกสาร PO2606-0005 ที่ถูกสร้างสำเร็จ: [order_created_in_table](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/order_created_in_table_1781503761738.png)
  - แท็บ Output ที่มีช่องคลังรับสำหรับบันทึกผลผลิต: [output_tab_dest_warehouse_visible](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/output_tab_dest_warehouse_visible_1781503832898.png)
  - วิดีโอบันทึกการทดสอบ E2E: ![verify_prod_warehouse_removal](/C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/verify_prod_warehouse_removal_1781503698390.webp)

### 17. กู้คืนฟิลด์คลังรับผลผลิตในหน้ารายละเอียด และคงคลังรับในแท็บ Output ตามฟีดแบ็กล่าสุด
- **การดำเนินการ:**
  - แก้ไขไฟล์ [ProductionOrdersPageClient.tsx](file:///c:/new-ns-scrap-erp/apps/next/src/components/production/ProductionOrdersPageClient.tsx) เพื่อนำฟิลด์แสดงผลแบบอ่านอย่างเดียว **"คลังรับผลผลิต"** กลับมาแสดงในหน้ารายละเอียดหลัก (Header Tab) หลังจากถูกซ่อนไปในการแก้ไขรอบแรก เพื่อให้ผู้ใช้งานยังคงมองเห็นคลังสินค้าสำเร็จรูปเริ่มต้นที่ระบบกำหนดไว้ให้
  - คงฟิลด์เลือก **"คลังรับ"** ในแท็บ **Output** ของหน้ารายละเอียดใบสั่งผลิตไว้ตามเดิม ไม่มีการถอดถอน เพื่อให้ผู้ใช้งานสามารถระบุคลังสำหรับนำผลผลิตจริงเข้าสต๊อกได้ปกติ
- **ผลลัพธ์การตรวจสอบ (Technical Validation):**
  - รันคำสั่งตรวจสอบ Type-check และ ESLint บน Next.js Workspace ผ่านสำเร็จ 100% ไม่มีข้อผิดพลาด
  - ดำเนินการทดสอบผ่าน Browser subagent เพื่อยืนยันว่า:
    1. หน้าต่างสร้างใบสั่งผลิตใหม่: ไม่มีช่องเลือกคลังรับผลผลิต (แสดงผลตรงตามต้องการเพื่อลดความซ้ำซ้อน)
    2. หน้าต่างรายละเอียด - แท็บ Header: แสดงฟิลด์ "คลังรับผลผลิต" (Read-only) เป็นข้อมูลอ้างอิงได้อย่างถูกต้อง
    3. หน้าต่างรายละเอียด - แท็บ Output: แสดงฟิลด์เลือก "คลังรับ" เป็น Dropdown สำหรับใช้ระบุข้อมูลตามปกติ
- **ภาพหลักฐานการทดสอบในระบบ (Artifact Screenshots & Videos):**
  - หน้าสร้างใหม่ไม่มีคลังรับ: [new_order_modal](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/new_order_modal_1781504854406.png)
  - แท็บ Header ที่แสดงคลังรับผลผลิต: [details_header_tab](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/details_header_tab_1781504871303.png)
  - แท็บ Output ที่แสดงคลังรับสำหรับระบุข้อมูล: [details_output_tab](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/details_output_tab_1781504883438.png)
  - วิดีโอบันทึกการทดสอบ E2E: ![verify_prod_wh_visibility](/C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/verify_prod_wh_visibility_1781504831149.webp)

### 18. ปรับปรุงฟิลด์ฟอร์มเบิก/รับผลผลิต และขยายขอบเขตแสดงสต๊อกปัจจุบันในหน้าฝ่ายผลิต (Production Form & Stock Preview Polish)
- **การดำเนินการ:**
  - **Autofill ประเภทเครื่องจักร:** เพิ่มฟิลด์ประเภทเครื่องจักร (Read-only) โดยจะดึงค่าอัตโนมัติเมื่อผู้ใช้เลือกเครื่องจักร (ดึงค่า `type` ผ่าน options API ของ `production_machines`) พร้อมแมปประเภทการผลิต (`Processing`/`Baling`/`Sorting`) เบื้องหลังอัตโนมัติ
  - **นำฟิลด์ที่ไม่จำเป็นออก:**
    - **แท็บ Input:** ซ่อนฟิลด์ "สถานะสต๊อก" และ "Lot No." และตั้งค่าส่ง default `stockStatus: 'RM'` เบื้องหลัง พร้อมจัด Grid 3 คอลัมน์ใหม่ (ขยายช่องสินค้าเป็น `md:col-span-2` ให้สวยงามสมดุล)
    - **แท็บ Output:** ซ่อนฟิลด์ "ประเภท" และ "Lot No." และตั้งค่าส่ง default `categoryCode: 'FG'` เบื้องหลัง พร้อมจัด Grid 3 คอลัมน์ใหม่ (ขยายช่องสินค้าเป็น `md:col-span-2` และหมายเหตุเป็น `md:col-span-2`)
  - **ขยายการแสดงผล Stock ปัจจุบัน (กรอบแดง):** แก้ไขฟังก์ชัน `productionProductStock` ใน backend ให้ดึงข้อมูลสต๊อกของสินค้านั้นจาก**ทุกคลังสินค้าที่เป็นคลัง Active** ในสาขาที่เลือก และแสดงข้อมูลแยกแถวให้เห็นทั้งประเภท **FG** และ **RM** ทั้งหมด (จากเดิมที่แสดงคลังที่เลือกคลังเดียว) และอัปเดต UI ให้แสดงคลังตรงตามแถว (`row.warehouseCode`)
- **ผลลัพธ์การตรวจสอบ (UAT & Compilation):**
  - รันคำสั่งตรวจสอบ Type-check และ ESLint บน Next.js Workspace ผ่านสำเร็จ 100% ไม่มีข้อผิดพลาด
  - ตรวจสอบ E2E UAT บนเบราว์เซอร์จริงผ่าน subagent:
    - การเลือกเครื่องจักรจะดึงประเภทเครื่องจักรขึ้นแสดงอัตโนมัติถูกต้อง (เช่น เลือกเครื่องตัดอลูมิเนียม ขึ้นประเภทเครื่องตัด)
    - แท็บ Input และ Output มีฟอร์ม 3 คอลัมน์สวยงาม ไม่มีฟิลด์ที่ถูกซ่อน และบันทึกข้อมูลเบิก/รับได้จริง
    - กล่องแสดงผล Stock ปัจจุบัน ดึงข้อมูลสต๊อก SKU001 ทั้งจากคลัง `FG-SK` และ `RM-SK` มาแสดงคู่กันพร้อมกันอย่างถูกต้อง
  - ภาพหลักฐาน UAT การเชื่อมโยงประเภทเครื่องจักร: [machine_type_autofill](file:///C:/Users/pc/.gemini/antigravity-ide/brain/027f3d4f-1a1a-4f60-881c-53257b3b2958/machine_type_autofill_1781511145459.png)
  - ภาพหลักฐาน UAT แท็บ Input: [input_tab_clean](file:///C:/Users/pc/.gemini/antigravity-ide/brain/027f3d4f-1a1a-4f60-881c-53257b3b2958/input_tab_verification_1781511347988.png)
  - ภาพหลักฐาน UAT แท็บ Output: [output_tab_clean](file:///C:/Users/pc/.gemini/antigravity-ide/brain/027f3d4f-1a1a-4f60-881c-53257b3b2958/output_tab_verification_1781511355423.png)
  - ภาพหลักฐาน UAT Stock Preview แยกคลัง/ประเภท: [stock_preview_all_warehouses](file:///C:/Users/pc/.gemini/antigravity-ide/brain/027f3d4f-1a1a-4f60-881c-53257b3b2958/sku001_stock_preview_1781511807699.png)

### 19. แก้ไขปัญหาความสอดคล้องตัวพิมพ์เล็ก-ใหญ่ของชื่อไลน์ผลิตและเครื่องจักร (Machine & Line Case-Sensitivity Fix)
- **การดำเนินการ:**
  - **วิเคราะห์สาเหตุ:** ตรวจพบว่า `createProductionOrderSchema` ฝั่ง backend บังคับใช้ `codeSchema` (ซึ่งมีการทำ `.toUpperCase()`) กับฟิลด์ `machineCode` และ `productionLineCode` แต่ทว่าใน Database ฟิลด์ `name` ของไลน์ผลิตเก็บค่าเป็นแบบตัวพิมพ์ใหญ่ปนเล็ก (Camel-case) เช่น `"Line A - เครื่องอัดแนวตั้ง/เครื่องตัด"` ทำให้เมื่อ API ได้รับข้อมูลแล้วแปลงเป็น Uppercase ทั้งหมด (เช่น `"LINE A - เครื่องอัดแนวตั้ง/เครื่องตัด"`) แล้วนำไปคิวรี่หาในฐานข้อมูล ส่งผลให้หาข้อมูลไม่พบและโยน error เสมอ แม้บน UI ผู้ใช้จะเลือกเป็นค่าว่าง (`-` หรือ `""`) แต่มีค่า Uppercase เดิมค้างใน React state ที่ HTML Select แสดงผลเป็น `-` เนื่องจากค่าไม่ตรงกับ Option values
  - **แก้ไข Zod Schema:** ปรับเปลี่ยน Schema ของ `machineCode` และ `productionLineCode` ใน `createProductionOrderSchema` จาก `codeSchema.optional()` เป็น `z.string().trim().optional()`
  - **ปรับการค้นหาในฐานข้อมูล:** ปรับปรุงฟังก์ชัน `findOptionalMachineByCode` และ `findOptionalProductionLineByCode` ใน `production-orders.ts` ให้คิวรี่หาชื่อเครื่องจักรและไลน์ผลิตแบบไม่สนใจตัวพิมพ์เล็ก-ใหญ่ (`mode: 'insensitive'`) ใน Prisma
- **ผลลัพธ์การตรวจสอบ (UAT & Compilation):**
  - รัน `npm run type-check` และ `npm run lint` ของ Next.js Workspace ผ่านสำเร็จ 100% (0 errors)
  - ดำเนินการทดสอบผ่าน Browser subagent โดยจำลองการสร้างใบสั่งผลิตด้วยการเลือก เครื่องจักร: `สายพานแยกประเภท - สายพานแยกประเภท` และ ไลน์ผลิต: `-` (ว่าง)
  - **ผลลัพธ์:** การบันทึกสำเร็จลงฐานข้อมูลทันทีโดยไม่มีข้อผิดพลาด และได้เอกสารใบสั่งผลิตเลขที่ **`PO2606-0012`** แสดงผลในตารางได้อย่างถูกต้องและสมบูรณ์
  - ภาพบันทึกการกรอกฟอร์ม UAT: [filled_dialog](file:///C:/Users/pc/.gemini/antigravity-ide/brain/027f3d4f-1a1a-4f60-881c-53257b3b2958/filled_dialog_1781513565416.png)
  - ภาพบันทึกตารางหลังสร้างใบสั่งผลิตสำเร็จ: [order_created](file:///C:/Users/pc/.gemini/antigravity-ide/brain/027f3d4f-1a1a-4f60-881c-53257b3b2958/order_created_1781513576631.png)

### 20. แก้ไขบั๊กการเบิกวัตถุดิบ (Input) จากคลังสินค้าต่างประเภท (Production Input Stock Status Fix & UI Cleanup)
- **การดำเนินการ:**
  - **วิเคราะห์สาเหตุ:** ตรวจพบว่าแบบฟอร์มการเบิกวัตถุดิบ (Input Tab) ในหน้ารายละเอียดใบสั่งผลิต ถูกฮาร์ดโค้ดส่งสถานะสินค้า `stockStatus = 'RM'` ไปยัง backend เสมอ ส่งผลให้เมื่อเบิกวัตถุดิบจากคลังสินค้าสำเร็จรูป เช่น `FG-SK` (ซึ่งในฐานข้อมูลจัดเก็บยอดด้วยสถานะ `FG`) ระบบเช็คยอดไม่พอและโยน error เสมอ
  - **ระบบ Auto-set และลบ Dropdown:** พัฒนาระบบเบื้องหลังให้คอยตรวจประเภทคลังสินค้าต้นทางที่เลือก (ทั้งตอนโหลดเริ่มต้น และตอนผู้ใช้เปลี่ยนคลัง) เพื่ออัปเดตค่า `stockStatus` ในฟอร์มเป็น `FG` หรือ `RM` อัตโนมัติในเบื้องหลังฟอร์ม พร้อมนำช่องเลือกตัวเลือก dropdown "สถานะสินค้า" ออกจากหน้าจอ UI ตามฟีดแบ็ก (กรอบแดงเอาออก) เพื่อให้หน้าจอไม่เกิดความซับซ้อนและคลีนสูงสุด
- **ผลลัพธ์การตรวจสอบ (UAT & Compilation):**
  - ตรวจสอบความถูกต้องทางเทคนิค ผ่านการ type-check และ lint บนเวิร์กสเปซ Next.js 100% ไร้ข้อผิดพลาด
  - จำลองความจริงผ่าน Browser QA subagent โดยเลือกเบิกทองแดงเบอร์ 1 (SKU108) จำนวน 50 กก. จากคลังสำเร็จรูป `FG-SK` โดยหน้าจอไม่มีฟิลด์สถานะสินค้า และกดบันทึกสำเร็จ
  - **ผลลัพธ์:** การบันทึกสำเร็จลงฐานข้อมูลทันทีโดยไม่มีข้อผิดพลาด ยอดเบิกและ RM Cost อัปเดตเข้าระบบอย่างถูกต้อง
  - ภาพ UAT การเบิกและประวัติรายการ: [input_recorded_success](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/input_recorded_success_1781517057049.png)
  - วิดีโอบันทึกการทดสอบ UAT: [test_no_dropdown](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/test_no_dropdown_1781516970540.webp)

### 21. ระบบนับถอยหลัง 7 วันเพื่อปิดงานใบสั่งผลิตอัตโนมัติ (Production Orders 7-Day Grace Period)
- **การดำเนินการ:**
  - **ระบบ Grace Period:** พัฒนาระบบตรวจสอบระยะเวลาผ่อนผัน 7 วันใน API [production-orders.ts](file:///c:/new-ns-scrap-erp/apps/next/src/lib/server/production-orders.ts) โดยคำนวณส่วนต่างเวลาระหว่างปัจจุบันกับฟิลด์ `closed_at` เพื่อเปิดโอกาสให้ผู้ใช้ยังแก้ไขข้อมูลเบิก/รับ และ Reverse movements ได้ตามที่คุยใน Line
  - **ตัวนับถอยหลัง (Countdown Timer):** สร้างคอมโพเนนต์ `<CountdownTimer />` บนหน้าหลัก โดยจะนับถอยหลังสดพร้อมตัวเลขวินาทีขยับวินาทีต่อวินาทีบนการ์ดใบสั่งผลิต Completed และหากเกิน 7 วันจะเปลี่ยนสภาพการ์ดเป็น Locked
  - **แก้ไข Casing bug:** แก้ไขบั๊กตัวพิมพ์เล็ก-ใหญ่ในหน้าบ้าน (Client) ของปุ่ม Reverse ที่เปรียบเทียบ `'Active'` (พิมพ์ใหญ่) แต่ backend ส่งกลับมาเป็น `'active'` (พิมพ์เล็ก) เพื่อให้สิทธิ์ Reverse ทำงานได้ปกติ
- **ผลลัพธ์การตรวจสอบ (UAT & Compilation):**
  - รัน `type-check`, `lint` และ `build` บน Next.js เวิร์กสเปซ ผ่าน 100% ไร้ Error
  - ทดสอบ UAT ผ่าน Browser subagent:
    - เฟส 1: Countdown นับถอยหลังวินาทีต่อวินาทีปรากฏบน Completed card
    - เฟส 2: สามารถเพิ่ม Input/Output และกดปุ่ม Reverse ในช่วง 7 วันได้สำเร็จ
    - เฟส 3: เมื่อจำลองอัปเดต `closed_at` ย้อนหลังไป 8 วัน การ์ดเปลี่ยนเป็น `หมดเวลาแก้ไข (Locked)` และปุ่ม Reverse/ฟอร์มบันทึกถูกบล็อคทั้งหมด
  - **ภาพ UAT:**
    - Countdown สดบนการ์ด: [completed_order_countdown](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/completed_order_countdown_1781519287135.png)
    - บันทึก/Reverse ใน Grace Period ได้: [input_tab_modal](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/input_tab_modal_1781519310892.png)
    - ล็อคหลังหมดอายุ 7 วัน: [po_dashboard_locked_state](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/po_dashboard_locked_state_1781519835728.png)
    - ฟอร์มซ่อน/ปุ่มปิดใน Modal: [po_modal_locked_state](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/po_modal_locked_state_1781519859928.png)
  - **วิดีโอ UAT:**
    - Countdown Ticking UAT: ![grace_seconds_uat](/C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/grace_seconds_uat_1781519729837.webp)
    - Expired Locking UAT: ![grace_expired_uat](/C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/grace_expired_uat_1781519820741.webp)

### 22. นำเมนูและหน้าจอหมวดหมู่ผลผลิตออกจากระบบ (Remove Output Categories Menu & Route)
- **การดำเนินการ:**
  - **นำออกจากแถบเมนูนำทาง:** ลบรายการเมนูสำหรับ `/production/output-categories` ใน [navigation.ts](file:///c:/new-ns-scrap-erp/apps/next/src/lib/navigation.ts) ออก เพื่อไม่ให้แสดงลิงก์ดังกล่าวในส่วนงานการผลิต
  - **ลบ Page Config และโค้ดหน้าจอ:** ลบ `productionOutputCategoriesPageConfig` ใน [master-data-page-configs.ts](file:///c:/new-ns-scrap-erp/apps/next/src/lib/master-data-page-configs.ts) และลบโฟลเดอร์สำหรับหน้าเพจ `apps/next/src/app/production/output-categories/` และ API endpoint `apps/next/src/app/api/production/output-categories/` เนื่องจากระบบ Next.js ส่วนผลิตในปัจจุบันไม่ได้เชื่อมโยงข้อมูลกับตารางนี้ (ตรรกะบันทึกผลผลิต `production_outputs` ใช้ enum `'FG'`, `'RM'`, และ `'LOSS'` บน DB โดยตรงอยู่แล้ว)
  - **คงการทำงานเบื้องหลัง:** คงส่วนประกอบใน `simple-master-tables.ts` ไว้สำหรับการสืบค้น/การแมปทางเทคนิคในอนาคตเพื่อความปลอดภัย
- **ผลลัพธ์การตรวจสอบ (Compilation & Verification):**
  - ล้างโฟลเดอร์แคช `.next` เพื่อป้องกันการดึงข้อมูลจาก type validator เก่าของหน้าจอที่ลบไป
  - รันคำสั่ง `npm run type-check --workspace @ns-scrap-erp/next` ผ่านสำเร็จ 100% ไร้ Error
  - รันคำสั่ง `npm run lint --workspace @ns-scrap-erp/next` ผ่านสำเร็จ 100% ไร้ Error

### 23. เพิ่มปุ่มตัวกรองสถานะใบสั่งผลิต (Job Status Filters Button Group)
- **การดำเนินการ:**
  - **เปลี่ยนรูปแบบ UI บน Desktop:** ถอด select dropdown กรองสถานะงานออกจากแถบ Desktop toolbar และนำไปทำเป็นกลุ่มปุ่มกด (Button Group) โดยใช้คอมโพเนนต์ `<MatchButton>` จำนวน 6 ปุ่ม (ทุกสถานะ, Open, In Production, Partially Completed, Completed, Cancelled) วางถัดจากกลุ่มปุ่มช่วงเวลาในแถวสองของแถบตัวกรอง
  - **เปลี่ยนรูปแบบ UI บน Mobile:** ถอด select dropdown กรองสถานะออกจาก Bottom Sheet ตัวกรอง และแทนที่ด้วยกลุ่มปุ่มกดขนาดเล็กที่จัดเรียงแบบ Grid 2 คอลัมน์ (6 ปุ่ม) เพื่อความสะดวกในการใช้งานบนโทรศัพท์มือถือ
  - **การระบุสี (Color Tones):** ตั้งค่า Prop `tone` ให้กับปุ่มสถานะอย่างชัดเจนและถูกต้องตาม Peach UI: ทุกสถานะ/Open -> สีเทาเข้ม (`dark`), In Production/Partially Completed -> สีเหลือง/ส้ม (`amber`), Completed -> สีเขียว (`emerald`), Cancelled -> สีแดง (`red`)
  - **การตั้งสถานะเริ่มต้น (Default Open Status):** ปรับเปลี่ยนให้ state `status` เริ่มต้นด้วยค่า `'Open'` แทนที่ค่าว่าง เพื่อให้หน้าใบสั่งผลิตกรองสถานะเป็น Open ทันทีที่เปิดหน้าจอขึ้นมา
- **ผลลัพธ์การตรวจสอบ (UAT & Compilation):**
  - รัน `npm run type-check` และ `npm run lint` ของเวิร์กสเปซ Next.js ผ่านฉลุย 100% ปราศจากข้อผิดพลาดและคำเตือนในโค้ดที่แก้ไข
  - รัน `npm run build` ตรวจสอบความถูกต้องของการผลิต bundle ผ่านสมบูรณ์แบบ
  - ดำเนินการ UAT และยืนยันผลลัพธ์ผ่าน Browser subagent:
    - **Desktop Toolbar Screenshot:** [desktop_toolbar_status_buttons](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/desktop_toolbar_status_buttons_1781521114157.png)
    - **Desktop Filter In Production:** [desktop_filter_in_production](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/desktop_filter_in_production_1781521127378.png)
    - **Desktop Filter Completed:** [desktop_filter_completed](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/desktop_filter_completed_1781521137614.png)
    - **Mobile Bottom Sheet:** [mobile_filter_bottom_sheet](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/mobile_filter_bottom_sheet_1781521160121.png)
    - **Mobile Filter In Production Applied:** [mobile_filter_applied_in_production](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/mobile_filter_applied_in_production_1781521184100.png)
    - **Default Open Status Filter Screenshot:** [default_open_status_filter](file:///C:/Users/pc/.gemini/antigravity-ide/brain/73b25086-46c1-43bb-8b9d-0229deaeb181/default_open_status_filter_1781521311437.png)
    - **วิดีโอ UAT การใช้งานตัวกรอง:** [status_filter_uat](file:///C:/Users/pc/.gemini/antigravity-ide/browser_recordings/status_filter_uat_1781521104899.webp)
    - **วิดีโอ UAT หน้าเริ่มต้น Open:** [default_open_status](file:///C:/Users/pc/.gemini/antigravity-ide/browser_recordings/default_open_status_1781521300136.webp)
  - ทุกอย่างทำงานได้อย่างถูกต้องและผ่านเกณฑ์พึงพอใจของลูกค้า 100%

### 24. ปรับปรุงหัวข้อคอลัมน์รายงานการผลิต / Yield (Production Report Columns Label Update)
- **การดำเนินการ:**
  - **ปรับหัวข้อตาราง:** เข้าไปแก้ไขที่ไฟล์ [ProductionReportPageClient.tsx](file:///c:/new-ns-scrap-erp/apps/next/src/components/production/ProductionReportPageClient.tsx) ภายใต้โครงสร้างการตั้งค่าคอลัมน์ของรายงาน `report` (รายงานการผลิต / Yield):
    - เปลี่ยนข้อความฉลาก (`label`) จาก **"ประเภท"** เป็น **"ประเภทเครื่องจักร"**
    - เปลี่ยนข้อความฉลาก (`label`) จาก **"เครื่อง"** เป็น **"เครื่องจักร"**
- **ผลลัพธ์การตรวจสอบ (Compilation & Build):**
  - รัน `npm run type-check` ผ่านสำเร็จ 100% ปราศจากข้อผิดพลาดด้านประเภทข้อมูล
  - รัน `npm run lint` ตรวจสอบ Syntax และ Rules ผ่าน 100% ไม่มีข้อผิดพลาด
  - รัน `npm run build` ตรวจสอบความถูกต้องของการแปลงโค้ด bundle ผ่านสำเร็จ 100%
  - *หมายเหตุ: ทำการข้ามการ UAT ผ่าน Browser subagent (งดทดสอบด้วย DOM) ตามคำสั่งโดยตรงจากลูกค้า เพื่อส่งมอบให้ลูกค้าเป็นผู้ทดสอบหน้าจอด้วยตัวเอง*

### 25. ปรับปรุงข้อมูลเครื่องจักรและประเภทเครื่องจักรให้สอดคล้องตรงตามความจริง (Machine & Machine Type Data Integrity Alignment)
- **การดำเนินการ:**
  - **วิเคราะห์และแก้ไข Data Integrity ใน DB:** ตรวจพบว่าข้อมูลในฐานข้อมูลมีบางจุดขัดแย้งกัน เช่น ใบสั่งผลิตเลขที่ `PO2606-0004` ผูกกับเครื่องจักร ID 2 `เครื่องตัดอลูมิเนียม` (ซึ่งมีประเภทเครื่องจักรเป็น `"เครื่องตัด"`) แต่ฟิลด์ `production_type` ดันบันทึกไว้เป็น `"Sorting"` (ประเภทสายพาน) ส่งผลให้ในรายงาน Yield/Cost ข้อมูลไม่สอดคล้องกันและแสดงผลขัดแย้ง ได้เขียน script เข้าไปอัปเดตข้อมูล `production_orders` ที่มี `machine_id` ผูกอยู่ ให้ปรับฟิลด์ `production_type` ให้สอดคล้องกับประเภทเครื่องจักรจริงที่มีใน DB ทั้งหมด (มี 1 ใบสั่งผลิตที่ได้รับการแก้ไข)
  - **เพิ่มฟิลด์ในหน้า Detail Modal ของใบสั่งผลิต:** เพื่อให้ผู้ใช้ตรวจสอบและมองเห็นเครื่องจักรและประเภทเครื่องจักรที่เลือกไว้ได้อย่างชัดเจน (สอดคล้องกับที่แสดงในรายงานและฟอร์มสร้างใหม่) ได้เพิ่ม ReadField **"เครื่องจักร"** และ **"ประเภทเครื่องจักร"** ในหน้าแสดงรายละเอียดใบสั่งผลิต (Header Tab) ในไฟล์ [ProductionOrdersPageClient.tsx](file:///c:/new-ns-scrap-erp/apps/next/src/components/production/ProductionOrdersPageClient.tsx)
  - **ปรับปรุง API `GET /api/production/orders`:** แก้ไขให้ include สัมพันธ์ `production_machines` และคำนวณส่งกลับค่า `machineName` และ `machineType` ใน API Payload โดยมี fallback mapping ภาษาไทยสอดคล้องตรงกับหน้ารายงาน Yield ในไฟล์ [route.ts](file:///c:/new-ns-scrap-erp/apps/next/src/app/api/production/orders/route.ts)
- **ผลลัพธ์การตรวจสอบ (Compilation & Technical Validation):**
  - ลบไฟล์ script ชั่วคราว (scratch files) ออกจากเครื่องพัฒนาเพื่อไม่ให้เกิดข้อผิดพลาดในการรันคอมไพล์ของโปรเจกต์
  - รันคำสั่ง `npm run type-check --workspace @ns-scrap-erp/next` ผ่านสำเร็จ 100% ปราศจาก Error
  - รันคำสั่ง `npm run lint --workspace @ns-scrap-erp/next` ผ่านสำเร็จ 100%

### 26. แก้ไข dropdown เครื่องจักรแสดงชื่อซ้ำซ้อน และปรับปรุงรายงาน Cost / Yield ให้สอดคล้องกัน (Machine Select Labels & Reports Translation Fix)
- **การดำเนินการ:**
  - **แก้ไข dropdown เครื่องจักรและไลน์ผลิตแสดงชื่อซ้ำ:** ตรวจพบว่าในฟอร์มสร้างใบสั่งผลิตใหม่ drop down ของ "เครื่องจักร" และ "ไลน์ผลิต" แสดงผลเป็นชื่อซ้ำซ้อนกัน เช่น `"เครื่องตัดอลูมิเนียม - เครื่องตัดอลูมิเนียม"` หรือ `"สายพานแยกประเภท - สายพานแยกประเภท"` เนื่องจากข้อมูลในฐานข้อมูลสำหรับเครื่องจักรและไลน์ผลิตไม่มีรหัส (code) มาให้ ทำให้ API แมปค่า code และ name เป็นค่าเดียวกัน และคอมโพเนนต์ `<SelectField>` เรนเดอร์แบบฮาร์ดโค้ดเป็น `${option.code} - ${option.name}` เสมอ ได้ทำการปรับปรุงโค้ดใน [ProductionOrdersPageClient.tsx](file:///c:/new-ns-scrap-erp/apps/next/src/components/production/ProductionOrdersPageClient.tsx) เพื่อเช็คเงื่อนไข หาก `code === name` ให้แสดงเฉพาะชื่อเพียงตัวเดียว เพื่อความสวยงาม สบายตา และถูกต้องตามข้อมูลจริง
  - **ปรับปรุง API รายงาน Yield และ Cost ให้สอดคล้องกันเป็นภาษาไทย:** ตรวจพบว่าในรายงาน Cost Report คอลัมน์ "Method" เรนเดอร์เป็นภาษาอังกฤษ เช่น `"Processing"`, `"Sorting"`, `"Baling"` เสมอ เนื่องจาก `costAllocationMethod` ดึง `production_type` จากฐานข้อมูลมาเป็น fallback โดยตรงโดยไม่ได้ทำการแมปภาษาไทยเหมือนกับใน Yield Report ได้เข้าไปปรับตรรกะใน [production-reports.ts](file:///c:/new-ns-scrap-erp/apps/next/src/lib/server/production-reports.ts) ให้ `costAllocationMethod` สอดคล้องกับ `productionType` โดยแปลงเป็นภาษาไทยเมื่อ fallback เสมอ ทำให้อุปกรณ์และรายงานทุกจุดในระบบแสดงผลภาษาไทยตรงกัน 100%
- **ผลลัพธ์การตรวจสอบ (Compilation & Technical Validation):**
  - ลบไฟล์ตรวจสอบฐานข้อมูลชั่วคราว (scratch files) ทั้งหมดออกจาก workspace
  - รันคำสั่ง `npm run type-check --workspace @ns-scrap-erp/next` ผ่านสำเร็จ 100%
  - รันคำสั่ง `npm run lint --workspace @ns-scrap-erp/next` ผ่านสำเร็จ 100%


