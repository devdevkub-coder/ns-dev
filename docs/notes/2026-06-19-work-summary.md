# บันทึกความคืบหน้าการทำงาน (19 มิถุนายน 2026)

การทำงานในวันนี้มุ่งเน้นการพัฒนาระบบวงเงินเบิกเกินบัญชี (Overdraft หรือ OD) สำหรับบัญชีกระแสรายวันของบริษัท (Company Accounts) ทั้งในส่วนของการจัดการข้อมูลหลัก (Master Data), หน้ากรอกฟอร์มการจ่ายเงินสะสม (Money Movement Splits), และการบังคับใช้ลอจิกการคำนวณและตรวจสอบยอดเงินคงเหลือจริงรวมกับวงเงิน OD ทั้งในระดับ Client-side และ Backend API พร้อมกับปรับปรุงสไตล์การแสดงผลของแถวข้อมูลสถานะถูกยกเลิก (Cancelled)

---

## งานที่ดำเนินการสำเร็จแล้วในวันนี้

### 1. ระบบวงเงิน OD สำหรับบัญชีกระแสรายวันของบริษัท (Company Account Overdraft Support)
* **การปรับปรุงฐานข้อมูลและการเปลี่ยนผ่าน (Database Migration)**:
  - สร้างไฟล์ Migration SQL `20260619113000_convert_od_accounts_to_current.sql` เพื่อทำการแปลงบัญชีประเภท `subtype = 'od'` ในอดีตให้กลายเป็นประเภท `subtype = 'current'` (กระแสรายวัน) เพื่อรักษาข้อมูลเดิมของระบบและป้องกันปัญหาความเข้ากันได้
  - รันคำสั่งแปลงข้อมูลบนฐานข้อมูล production สำเร็จเรียบร้อย
* **การจัดการข้อมูลหลัก (Master Data Accounts)**:
  - อนุญาตให้กำหนดวงเงิน OD (`od_limit`) เฉพาะบัญชีบริษัทที่มีประเภท `subtype = 'current'` (กระแสรายวัน) เท่านั้น หากเป็นประเภทอื่นจะเคลียร์วงเงินเป็น `null` โดยอัตโนมัติ
  - แสดงรายละเอียดแบบสดในหน้าฟอร์ม: ยอดคงเหลือจริงจาก Bank Statement, วงเงิน OD, วงเงิน OD ที่ใช้ไป, วงเงิน OD คงเหลือ และ ยอดจ่ายได้จริง (`Available to Pay = ยอดคงเหลือจริง + วงเงิน OD`)
  - คอลัมน์ยอดคงเหลือในหน้าตาราง List View จะแสดงยอดคงเหลือจริงที่อัปเกรดจากข้อมูล Bank Statement เสมอ
* **ฟอร์มเลือกบัญชีจ่ายใน Splits และการคำนวณแบบสด (Live Balance Display in Payment Splits)**:
  - อัปเดต Dropdown รายชื่อบัญชีธนาคารให้แสดงในรูปแบบ `ชื่อบัญชี (ยอดคงเหลือจริง + OD)`
  - เพิ่มแผงรายละเอียดกล่องยอดเงินคงเหลือ 4 ช่องใต้ Split แต่ละช่องที่มีการเลือกบัญชีกระแสรายวัน เพื่อให้ผู้กรอกเห็นข้อมูล ยอดเงินจริง, วงเงิน OD ทั้งหมด, OD ที่ใช้ไป และ OD ที่ใช้ได้จริง ณ ขณะนั้น
  - เพิ่มการ์ดสรุปการใช้เงินภาพรวมและ OD ของเอกสารทั้งใบ (Combined OD Summary Card) ไว้ด้านล่างสุดของฟอร์ม Splits
* **การตรวจสอบความถูกต้องของยอดเงินจ่าย (Validation Rules)**:
  - **Client-side**: เพิ่มการตรวจสอบ in `MoneyMovementPageClient.tsx` เมื่อกดบันทึก หากยอดจ่ายใน Split ใดเกินกว่ายอดที่จ่ายได้จริง (`ยอดคงเหลือจริง + วงเงิน OD`) ระบบจะระงับการเซฟและแสดงข้อความแจ้งเตือนสีแดงขัดขวางทันที: `"ยอดจ่ายเกินยอดเงินคงเหลือและวงเงิน OD ที่ใช้ได้ กรุณาลดจำนวนหรือเพิ่มบัญชีจ่าย"`
  - **Backend API**: เพิ่มการตรวจสอบในระดับ Backend `/api/purchase/payments` ป้องกันการส่ง Payload ยอดเงินติดลบหรือยอดเงินรวมสูงเกินสิทธิ์ที่จ่ายได้จริงของบัญชีนั้นๆ โดยจะส่งกลับ HTTP 400 หากเงื่อนไขไม่ผ่าน

### 2. การปรับปรุงสไตล์และโครงสร้าง (UI Parity & Syntax Fixes)
* **แก้ไข Syntax Error ในใบชั่งน้ำหนัก**:
  - แก้ไขจุดผิดพลาดทางไวยากรณ์ (Syntax Error) ใน `WeightTicketListPageClient.tsx` ในส่วนของการเรนเดอร์โครงสร้างแถว `TableRow` ที่มีวงเล็บซ้อนทับกัน ทำให้ตัวคอมไพเลอร์ Next.js/Typescript สามารถบิลด์ผ่านได้เป็นปกติ
* **การปรับสีพื้นหลังแถวข้อมูลสถานะ Cancelled**:
  - ปรับการระบายแถวรายการในโหมดตาราง Desktop และการ์ดรายการโหมด Mobile ของหน้าจอต่างๆ เมื่อ `row.status === 'cancelled'` ให้แสดงเป็นสีแดงอ่อนและจางลง (`bg-red-100/60 hover:bg-red-200/60 text-slate-400`) เพื่อให้ผู้ใช้แยกแยะรายการที่ยกเลิกออกจากรายการปกติได้อย่างชัดเจน
  - หน้าจอที่ได้รับผลการปรับปรุง:
    1. หน้าข้อมูลความเคลื่อนไความเงิน: `/daily/expense` (และบิลรับเงินใน [MoneyMovementPageClient.tsx](file:///c:/new-ns-scrap-erp/apps/next/src/components/daily/MoneyMovementPageClient.tsx))
    2. หน้าจัดการใบสำคัญรับเงิน: `/daily/receipt-vouchers` ([ReceiptVouchersPageClient.tsx](file:///c:/new-ns-scrap-erp/apps/next/src/components/daily/ReceiptVouchersPageClient.tsx))
    3. หน้าจัดการรายการบิล: `/daily/transaction-bills` ([TransactionBillsPageClient.tsx](file:///c:/new-ns-scrap-erp/apps/next/src/components/daily/TransactionBillsPageClient.tsx))
    4. หน้าจัดการใบชั่งน้ำหนัก: `/daily/weight-ticket-list` ([WeightTicketListPageClient.tsx](file:///c:/new-ns-scrap-erp/apps/next/src/components/daily/WeightTicketListPageClient.tsx))

---

## ผลการตรวจสอบคุณภาพ (Verification Results)
* **TypeScript type-check**: `tsc --noEmit` ผ่านการทดสอบเรียบร้อย 100% ไม่มีข้อผิดพลาด
* **ESLint check**: ผ่านการตรวจสอบเรียบร้อย 100%
* **Next.js Production Build**: รันคำสั่ง `npm run build` สำเร็จลุล่วง ไม่มีปัญหาเรื่อง Dynamic Routing หรือ Route Dynamic/Static mismatch แต่อย่างใด

---

## สรุปข้อมูลการทำ Git Branch และ Commit
* ได้ดำเนินการ Commit ข้อมูลลงสู่ Local Branch `dev` เรียบร้อยแล้ว
* ไฟล์ที่จะถูก Push ไปยังรีโมต `new-origin dev` และ `new-origin uat` ได้แก่:
  - [supabase/migrations/20260619113000_convert_od_accounts_to_current.sql](file:///c:/new-ns-scrap-erp/supabase/migrations/20260619113000_convert_od_accounts_to_current.sql)
  - [apps/next/src/app/api/purchase/payments/route.ts](file:///c:/new-ns-scrap-erp/apps/next/src/app/api/purchase/payments/route.ts)
  - [apps/next/src/components/daily/MoneyMovementPageClient.tsx](file:///c:/new-ns-scrap-erp/apps/next/src/components/daily/MoneyMovementPageClient.tsx)
  - [apps/next/src/components/daily/ReceiptVouchersPageClient.tsx](file:///c:/new-ns-scrap-erp/apps/next/src/components/daily/ReceiptVouchersPageClient.tsx)
  - [apps/next/src/components/daily/TransactionBillsPageClient.tsx](file:///c:/new-ns-scrap-erp/apps/next/src/components/daily/TransactionBillsPageClient.tsx)
  - [apps/next/src/components/daily/WeightTicketListPageClient.tsx](file:///c:/new-ns-scrap-erp/apps/next/src/components/daily/WeightTicketListPageClient.tsx)
