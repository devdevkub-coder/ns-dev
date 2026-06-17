# บันทึกความคืบหน้าการทำงาน (17 มิถุนายน 2026)

การทำงานในวันนี้มุ่งเน้นการปรับปรุงระบบอินเตอร์เฟส (UI Rehabilitation) ให้ตรงตามมาตรฐาน **AcexPOS UI Standard** ใน [Peach.md](file:///c:/new-ns-scrap-erp/Peach.md) และแนวทางการออกแบบหลักใน [design.md](file:///c:/new-ns-scrap-erp/docs/design.md) โดยดำเนินการครอบคลุมทุกหน้าจอของระบบ Next.js (`apps/next/`) และผ่านการคอมไพล์และบิลด์ 100%

## งานที่ดำเนินการสำเร็จแล้วในวันนี้

### 1. การปรับปรุงขนาดและสัดส่วนตารางแบบยืดหดได้ (Table Resizing and Colgroup Standardization)
* **ลบเงื่อนไข Bypass ในตารางทั้งหมด (13 ไฟล์ 16 ตาราง)**: แก้ไขตารางที่ใช้ระบบ Resizable คอลัมน์ (`useResizableColumns`) โดยเอาเงื่อนไขการข้ามสไตล์ (`if index === last` หรือ `column.key === ...`) ใน `<colgroup>` ออกทั้งหมด ทำให้เบราว์เซอร์คำนวณและกระจายขนาดคอลัมน์ได้อย่างสมดุล (Proportional Resize / Auto-fit) ไม่เกิดช่องว่างสีขาวขนาดใหญ่ทางด้านขวาบนหน้าจอเดสก์ท็อป
* **เพิ่มการลากปรับขนาดคอลัมน์และการจัดเรียง (Client-side Sorting) ในหน้าภาษี (Tax / VAT / WHT)**: ปรับปรุงตารางภาษีหลักทั้ง 4 ตาราง (VAT ขาย, VAT ซื้อ, WHT เราหักไว้, WHT ลูกค้าหักจากเรา) และตารางภาพรวมปฏิทินภาษีย้อนหลัง 6 เดือน ให้รองรับการปรับขยายคอลัมน์ มีปุ่มคืนค่าเดิมตาราง และสามารถคลิกหัวตารางเพื่อเรียงลำดับข้อมูลภาษาไทยและตัวเลขได้อย่างถูกต้อง
* **เพิ่มการจัดเรียงในหน้าใบสั่งจองขาย (PO Sell)**: ปรับปรุงตารางจองขายหลัก ให้หัวตารางแต่ละคอลัมน์รองรับฟังก์ชันการเรียงลำดับ (Sorting) ข้อมูลภาษาไทย ตัวเลข และวันที่ได้แบบเรียลไทม์
* **เพิ่มคอลัมน์ "ลำดับ" (No.)**: เพิ่มคอลัมน์ลำดับเป็นคอลัมน์แรกสุด พร้อมตัวลากปรับขนาดคอลัมน์ในตารางหลัก เช่น หน้าใบชั่งน้ำหนัก (`WeightTicketListPageClient`), หน้าโอนเงินระหว่างบัญชี (`DailyTransferPageClient`), และตารางใบสั่งผลิต (`ProductionOrdersPageClient`)
* **แก้ไขแถวยืดสูงผิดปกติ**: แก้ไขบั๊กใน `globals.css` ที่แท็ก `table, th, td` ได้รับผลกระทบจากความสูง `min-height: 100vh` ทำให้แถวตารางยืดตัวสูงผิดธรรมชาติ โดยแยกให้ทำงานเฉพาะส่วนของ `body` เท่านั้น

### 2. การแก้ไขข้อผิดพลาด Type check (TypeScript compilation error hotfix)
* **แก้ไข Prisma types ในส่วนดึงยอดใบรับเงิน (api/sales/receipts)**: แก้ไขปัญหา compile error ของ tsc เรื่องชนิดข้อมูล `readonly` array ในคำสั่ง `orderBy` ของ Prisma โดยการลบคลาส `as const` จาก `salesBillSelect` และแคสต์ชนิดข้อมูลให้รองรับการทำงานของ Prisma Client ได้อย่างถูกต้อง สมบูรณ์แบบ 100%

### 2. การจัดระเบียบโครงสร้างหน้าและการนำทาง (Navigation & Menu Relocation)
* **จัดหมวดหมู่เมนูการเงินใหม่**: อัปเดตการแสดงผลเมนูการนำทาง ย้ายเมนู *อนุมัติจ่ายเงิน, เงินล่วงหน้า, จ่ายเงิน, รับเงิน, และ โอนเงินระหว่างบัญชี* ไปรวมไว้ในกลุ่ม "การเงิน & หนี้" (`finance-debt`) เพื่อความสอดคล้องทางธุรกิจ
* **จัดหมวดหมู่รายงานและตาราง Trading**: ย้ายหน้า Trading Dashboard และรายงาน PO ซื้อ/ขายคงเหลือ ไปไว้ในหมวด "รายงาน" (`reports`) และย้ายหน้า Trading Matching ไปที่หมวด "รายการประจำวัน" (`daily`)

### 3. การปรับปรุงดีไซน์โมดอลและแปลข้อความภาษาไทย (Translation & Modal Layout Polish)
* **แปลสถานะใบสั่งผลิตเป็นภาษาไทย**: แปลงป้ายสถานะและปุ่มตัวกรองทั้งหมดในหน้ารายการใบสั่งผลิตและหน้าโมเดลแสดงรายละเอียดให้แสดงเป็นภาษาไทย
* **ปรับคำศัพท์คลังสินค้า**: เปลี่ยนจาก "คลังต้นทาง" เป็น "คลังวัตถุดิบ" และเปลี่ยนจาก "คลังรับ" เป็น "คลังรับผลผลิต"
* **โมดอลสร้างใบสั่งผลิต (Create Modal Layout)**: 
  - จัดเรียงกลุ่มข้อมูลออกเป็น 3 หมวดหมู่หลัก: ข้อมูลพื้นฐาน, เครื่องจักรและไลน์ผลิต, และข้อมูลเพิ่มเติม
  - นำกล่องครอบพื้นหลังขาวซ้ำซ้อน (Outer Wrapper Card) ออก และใช้ดีไซน์กล่องย่อยแบบมีกรอบเบา `border-slate-200 shadow-sm` แทนเพื่อลดความเทอะทะของ UI
  - ปรับปรุงให้ช่องเลือกวันที่ (DatePicker) ยืดเต็มความกว้าง (`w-full`) เสมอกับฟิลด์รับข้อมูลอื่นๆ

### 4. การกวาดล้างสไตล์และมาตรฐานฟอนต์ทั่วไป (Universal Font & Style Compliance)
* **ทำความสะอาดฟอนต์**: ลบคลาส `font-sans` ออกจากโค้ด UI ในหน้าจอทั้งหมด 100% ทำให้ตัวหนังสือ ปุ่มกด และฟอร์มรับข้อมูลทั้งหมดสลับมาแสดงผลด้วยฟอนต์เริ่มต้นหลัก `Noto Sans Thai` จากทาง Global CSS
* **ปรับปรุงสไตล์ Lined Table ทั่วระบบ (31 ไฟล์)**: สแกนและอัปเดตสไตล์ของเส้นขอบ (จาก `border-slate-200` เป็น `border-slate-100` หรือ `border-slate-200/60` ในตาราง), อัปเดตสีเส้นคั่นตารางเป็น `divide-slate-100`, และหัวตารางเป็น `bg-slate-50 border-b border-slate-100 text-slate-500`

---

## ไฟล์และหน้าจอหลักที่มีการแก้ไขและผ่านการทดสอบ UAT แล้ว
1. **Stock Ledger** -> [http://localhost:3000/stock/ledger](http://localhost:3000/stock/ledger)
2. **PO ซื้อ (PO Buy)** -> [http://localhost:3000/purchase/po-buy](http://localhost:3000/purchase/po-buy)
3. **มัดจำ/เงินล่วงหน้า** -> [http://localhost:3000/purchase/advance-payments](http://localhost:3000/purchase/advance-payments)
4. **อนุมัติจ่ายเงิน (Payment Approval)** -> [http://localhost:3000/daily/payment-approval](http://localhost:3000/daily/payment-approval)
5. **เงินสำรองจ่าย (Petty Advance)** -> [http://localhost:3000/daily/petty-advance](http://localhost:3000/daily/petty-advance)
6. **โอนเงินระหว่างบัญชี (Daily Transfer)** -> [http://localhost:3000/daily/transfer](http://localhost:3000/daily/transfer)
7. **บันทึกรายจ่าย (Daily Expense)** -> [http://localhost:3000/daily/expense](http://localhost:3000/daily/expense)
8. **ใบชั่งน้ำหนัก (Weight Ticket List)** -> [http://localhost:3000/daily/weight-ticket-list](http://localhost:3000/daily/weight-ticket-list)
9. **บิลรับซื้อ (Purchase Bills)** -> [http://localhost:3000/purchase/bills](http://localhost:3000/purchase/bills)
10. **ทำจ่าย / รับเงิน** -> [http://localhost:3000/purchase/payments](http://localhost:3000/purchase/payments) และ [http://localhost:3000/sales/receipts](http://localhost:3000/sales/receipts)
11. **ใบสำคัญรับเงิน** -> [http://localhost:3000/purchase/receipt-vouchers](http://localhost:3000/purchase/receipt-vouchers)
12. **บิลขาย / ใบส่งของ** -> [http://localhost:3000/sales/bills](http://localhost:3000/sales/bills) และ [http://localhost:3000/sales/stock-issue](http://localhost:3000/sales/stock-issue)
13. **โอนย้ายสต๊อก** -> [http://localhost:3000/stock/transfer](http://localhost:3000/stock/transfer)
14. **ใบสั่งผลิต (Production Orders)** -> [http://localhost:3000/production/orders](http://localhost:3000/production/orders)

---

## ผลการตรวจสอบคุณภาพ (Verification Results)
* **TypeScript type-check**: `tsc --noEmit` ผ่านสำเร็จ 100% ไม่มีข้อผิดพลาด
* **ESLint check**: ผ่านสำเร็จ 100% ไม่มีข้อผิดพลาดระดับ Error
* **Production Build**: ผ่านการคอมไพล์และสร้าง Bundles สำหรับ Production สำเร็จครบถ้วน 100%
