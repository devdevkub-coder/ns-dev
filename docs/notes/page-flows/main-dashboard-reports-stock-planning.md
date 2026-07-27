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
