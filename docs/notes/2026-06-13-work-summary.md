# บันทึกความคืบหน้าการทำงาน (13 มิถุนายน 2026)

- **การปรับปรุง Mobile & Font Size**: ปรับตารางรายงานการผลิตเป็น Dense Card View บนหน้าจอมือถือ และเพิ่มขนาดตัวอักษรให้อ่านง่ายพอดี (`ProductionReportPageClient.tsx`)
- **การล้าง Focus Outline สีดำ**: ยกเลิก outline ดำรอบปุ่มและลิงก์ของเบราว์เซอร์ดีฟอลต์ในระบบผ่าน `globals.css`
- **การปรับปรุง Focus Border / Ring**: เปลี่ยนสไตล์การโฟกัสสีดำเข้ม (`focus:border-slate-900` / `focus:ring-slate-900`) ทั้งหมดเป็นสีฟ้าอ่อน (`focus:border-blue-500` / `focus:ring-blue-500`) สำหรับช่อง Input, Select, Checkbox ทั่วระบบ
- **การลบเส้นขอบ Modal**: ตั้งค่า Dialog และ Modal ให้ใช้ `border-0` และ `outline-none` เพื่อเอาเส้นกรอบขีดดำรอบกล่องข้อความออกอย่างสมบูรณ์
- **การอัปเดตคู่มือดีไซน์**: บันทึกแนวทางการสไตลิ่งป๊อปอัปและสไตล์ตารางบนมือถือลงใน `docs/design.md` เพื่อใช้เป็นมาตรฐานกลาง
- **การทดสอบความถูกต้อง**: รันการตรวจสอบ Type-checking และ Next.js Production Build ผ่านครบถ้วน 100%

## หมวดหมู่ระบบที่ตรวจสอบและแก้ไขสไตล์ (Audited & Updated Categories)
- **ข้อมูลหลัก (Master Data)**: ลูกค้า, พนักงานขาย (Sales), ผู้ขาย, สินค้า, รายการสิ่งเจือปน, สาขา, คลัง, บัญชีเงินบริษัท, ชื่อธนาคาร, ค่าใช้จ่าย, พนักงาน/กรรมการ, เครื่องจักร, Production Line, สกุลเงิน, ผู้รับเงินต่างประเทศ, วัตถุประสงค์โอน
- **สินค้า/สต๊อก (Inventory / Stock)**: โอนสินค้าระหว่างสาขา, สต๊อกคงเหลือ, Stock Ledger, Stock Reconciliation, ปรับสถานะสินค้า (RM → FG), ปรับเกรด (Grade Adjustment), นับสต๊อก (Stock Count)
- **การผลิต (Production)**: ใบสั่งผลิต, หมวดหมู่ผลผลิต, Production Dashboard, WIP คงเหลือ, รายงานการผลิต/Yield, Production Cost Report, Production Reconciliation
- **ระบบ (System)**: ตั้งค่าระบบ, Transaction Ledger, Backup / Restore, Audit & Activity Log, Users & Permissions, เปลี่ยนรหัสผ่าน
