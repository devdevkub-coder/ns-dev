# LINE Weight Ticket Send Diagnosis Plan

## อาการที่พบ

- ปุ่มทดสอบข้อความที่หน้า `/admin/line-settings` ส่งเข้า LINE ได้
- ปุ่มแชร์จากหน้า `/daily/weight-ticket-list` แจ้งว่า "ส่ง LINE พร้อม PDF เรียบร้อยแล้ว" แต่ผู้ใช้ไม่เห็นข้อความเข้า LINE
- สร้างหรือแก้ไขใบรับ-ส่งของแล้วบันทึก ยังไม่เห็นข้อความเข้า LINE

## สิ่งที่ตรวจพบจากโค้ดและหน้าจอ

1. หน้า settings แสดง `LINE Default Target ID` เป็นค่า prefix `U...`
   - `U...` คือ userId
   - groupId ของ LINE โดยปกติควรขึ้นต้นด้วย `C...`
   - ถ้าต้องการให้เข้ากลุ่ม LINE ต้องตั้ง default target เป็น `C...` หรือให้ระบบบันทึกกลุ่มไว้ใน `line_groups`

2. ตาราง `LINE Group Routing` ในหน้าจอยังว่าง
   - แปลว่ายังไม่มี group ที่ webhook บันทึกเข้าระบบ หรือ migration/data ยังไม่พร้อม
   - ถ้าไม่มี default target ที่เป็น group และไม่มี routing group ระบบจะไม่รู้ว่าจะส่งเข้ากลุ่มไหน

3. โค้ดเดิมนับ `skipped` เป็น success
   - ถ้าเอกสารเคยมี log `sent` แล้ว ระบบจะข้ามการส่งซ้ำ
   - แต่ก่อนแก้ ระบบยังตอบกลับ `SENT` ทำให้ UI แจ้งว่าส่งแล้ว ทั้งที่รอบนั้นไม่ได้เรียก LINE Push API จริง

4. Manual share ควรส่งซ้ำได้
   - ปุ่ม "ส่งเข้ากลุ่มหลัก" เป็นคำสั่งจากผู้ใช้โดยตรง ควรใช้ `force: true`
   - Auto-send หลังบันทึกควรใช้ `force: false` เพื่อกันส่งซ้ำ

## สิ่งที่แก้ในโค้ดแล้ว

1. ปุ่ม manual share endpoint:
   - ไฟล์ `apps/next/src/app/api/daily/weight-tickets/[id]/notify-line/route.ts`
   - เพิ่ม `force: true` เพื่อให้กดแชร์แล้วส่งจริง แม้เอกสารเคยส่งแล้ว

2. ตัวส่ง LINE:
   - ไฟล์ `apps/next/src/lib/server/weight-ticket-line-notification.ts`
   - เปลี่ยน logic ให้ success เฉพาะเมื่อมี target ที่ status เป็น `sent`
   - ถ้าทั้งหมดเป็น `skipped` จะคืน `ALREADY_SENT` พร้อม HTTP 409
   - ถ้าทั้งหมด failed จะคืน `LINE_PUSH_FAILED` พร้อม HTTP 502

## แผนตรวจหลัง deploy

1. ตรวจ default target
   - ถ้าต้องการส่งเข้ากลุ่ม ให้ใช้ groupId ที่ขึ้นต้นด้วย `C`
   - ถ้าใส่ `U...` ระบบจะส่งหา user นั้น ไม่ใช่กลุ่ม

2. ให้ bot เข้า group และสร้าง event ให้ webhook บันทึก
   - เชิญ bot เข้า group LINE ปลายทาง
   - ส่งข้อความใด ๆ ในกลุ่ม 1 ครั้ง
   - เปิด `/admin/line-settings` แล้วดูว่า `LINE Group Routing` มี row ของกลุ่มขึ้นหรือไม่

3. ตั้งค่า routing
   - เปิดใช้งาน group
   - ติ๊ก `แจ้ง WTI` และ/หรือ `แจ้ง WTO`
   - เลือกสาขา หรือปล่อยเป็นทุกสาขา
   - ตั้งกลุ่มนั้นเป็น default target ถ้าต้องการให้ทุกเคสส่งเข้ากลุ่มเดียว

4. ทดสอบจริง
   - กดแชร์เอกสารจาก `/daily/weight-ticket-list`
   - ต้องเห็นข้อความเข้า LINE และใน DB ต้องมี `line_request_id`
   - สร้าง WTI ใหม่หลังเปิด Auto-Send WTI ต้องส่งเข้า LINE
   - แก้ไข WTI แล้วบันทึก ถ้ายังไม่เคยส่งเอกสารนั้นไป target นั้น ต้องส่งเข้า LINE

## หมายเหตุ

- การทดสอบปุ่มที่หน้า settings ยังไม่เท่ากับการส่งใบชั่งจริง เพราะปุ่มนั้นไม่ผ่าน flow สร้าง PDF และไม่ได้ยืนยันว่า target เป็น group ที่ต้องการ
- หาก local script query DB ไม่ได้เพราะ credential local หมดอายุ ให้ตรวจจากหน้า log ในระบบหรือ query บน server/dev env โดยตรง
