---
title: WTI-WTO Flow
aliases:
  - Weight Ticket Flow
  - WTI WTO Flow
  - Flow ใบรับ-ส่งของ
  - Flow ชั่งสินค้า รับ-ส่งของ
tags:
  - ns-scrap-erp
  - weight-ticket
  - daily
  - business-flow
  - decision
status: draft
created: 2026-06-11
updated: 2026-08-15
---

# WTI/WTO Flow / Flow ใบรับ-ส่งของ

## Nested impurity deduction (2026-08-09)

- สิ่งเจือปนระดับแรกเป็นข้อมูลของ **section สินค้า** ไม่ใช่ของเต๋าใดเต๋าหนึ่ง: ปุ่ม `เพิ่มสิ่งเจือปน` ของสินค้าใช้ `parentId` เป็น product line หลัก แม้สินค้านั้นจะมีหลายเต๋า. การเพิ่มเต๋าใช้ line ลูกที่เป็นข้อมูลน้ำหนัก/รูปแยกต่างหาก. เมื่อกด `หักสิ่งเจือปนต่อ` จากสิ่งเจือปน จึงค่อยสร้างรายการย่อยใต้ impurity line นั้นเป็น nested impurity.
- กติกาที่ต่างกันตามประเภทเอกสารยังคงแยก: WTI เลือกผู้ขาย ไม่มีคลังระดับรายการ และรองรับ `สินค้าอื่น`/รูปสิ่งเจือปนตาม contract; WTO เลือกลูกค้า ต้องเลือกคลังและตรวจ stock และไม่รองรับ `สินค้าอื่น`. ความต่างนี้ไม่เปลี่ยน owner ของสิ่งเจือปนระดับแรกที่ยังอยู่ที่ product section เหมือนกัน.
- สิ่งเจือปนทุกแถวสามารถหักสิ่งเจือปนต่อได้จากปุ่ม `หักสิ่งเจือปนต่อ` โดยรายการย่อยจะใช้ `parentId` ของสิ่งเจือปนชั้นก่อนหน้า เช่น สินค้าหลัก 100 กก. หักสิ่งเจือปน 30 กก. แล้วหักสิ่งเจือปนในสิ่งเจือปนต่ออีก 5 กก. ผลสุทธิของสินค้าหลักคือ 65 กก. หากเลือกซื้อสิ่งเจือปน 30 กก. เป็นรายการใหม่ รายการซื้อใหม่นั้นยังหักต่อได้อีกชั้น เช่น 70 + 25 = 95 กก.
- ความสัมพันธ์ใช้ `parentId` สำหรับลำดับรายการย่อย และ `impuritySourceLineId` สำหรับรายการซื้อเพิ่มจากสิ่งเจือปน ทั้งการคำนวณ การลบ การยืนยันการเปลี่ยนแปลง และการแสดงผลต้องเดินความสัมพันธ์แบบ recursive เพื่อไม่ให้เกิด orphan หรือยอดซ้ำ.

What is what: สิ่งเจือปนเป็นรายการย่อยที่ตัดน้ำหนักออกจากรายการแม่ ส่วนรายการซื้อเพิ่มเป็นน้ำหนักใหม่ที่มี source เป็นสิ่งเจือปนและสามารถมีรายการย่อยของตัวเองได้. Why it has to be like this: การแยกสองความสัมพันธ์ทำให้ยอดของสินค้าหลักไม่ถูกหักซ้ำ และทำให้การลบ/แก้ไขล้างทั้งต้นไม้ที่เกี่ยวข้องอย่างปลอดภัย โดยไม่เปลี่ยน API หรือข้อมูลธุรกิจเดิม.

## Strict collaboration baseline (2026-08-15)

- การสร้างเอกสารใหม่ยังใช้ form contract ที่ไม่ต้องมี baseline ได้ แต่ `PUT` ของเอกสารเดิมต้องส่ง `collaborationBaseLineIds`, version ของทุก line, `collaborationBaseHeader`, รายการ `collaborationChangedLineIds`/`collaborationDeletedLineIds`, รายการ header fields ที่ผู้ใช้แก้, `draftLineIds` และ `collaborationBaseUpdatedAt` มาครบจาก client. `PATCH save_changes` และ `PATCH delete_lines` ใช้กติกาเดียวกัน โดยการลบต้องมี version และเวลา baseline ของ line ที่ลบ.
- Server ห้ามเติม baseline จากข้อมูลปัจจุบันในฐานข้อมูล ห้ามแปลงเวลา baseline ที่หายเป็น `null` และห้ามแปลง line version ที่หายเป็น `1`. ถ้า metadata collaboration ไม่ครบ ให้ validation/contract error เพื่อให้ caller โหลด snapshot ล่าสุดแล้วส่งใหม่ ไม่เขียนทับข้อมูลของผู้ใช้อื่นเงียบ ๆ.
- `savedTicket` คือ collaboration baseline ที่ผ่านการ merge เพื่อรักษา local dirty state ส่วน `loadedTicket` คือ snapshot ล่าสุดจาก server; การตรวจ conflict และการสร้าง PATCH ใช้ baseline ที่บันทึกไว้เท่านั้น ไม่ใช้ snapshot ล่าสุดเป็น fallback. Realtime ใช้ persisted line ID (`weight_ticket_lines.id`)/changed fields จาก event แล้ว reload เฉพาะส่วนที่เกี่ยวข้อง.
- `PATCH save_changes` ต้องส่ง `header`, `lines` และ `deletedLineIds` ตาม contract ครบ แม้ค่าจะเป็น object/array ว่าง; server overlay header ที่ไม่ถูกแก้ด้วยค่าปัจจุบันจากแถวที่ lock ใน DB เพื่อคงข้อมูลเดิมของเอกสาร ไม่ใช้ baseline หรือค่า default เป็นแหล่งแทน. Section PATCH ส่งเฉพาะ line record ที่อยู่ใน `collaborationChangedLineIds` และส่ง `sectionLineIds` เป็น metadata ของขอบเขตเต็ม; server อ่าน section ล่าสุดจากแถวที่ lock แล้ว merge sibling ที่ไม่ได้เปลี่ยนก่อน validate/persist.

What is what: baseline คือ snapshot ที่ผู้ใช้เริ่มแก้และ metadata ที่ใช้ระบุขอบเขตการเขียน; current snapshot คือข้อมูลล่าสุดของ server. Why it has to be like this: การแยกสอง snapshot ทำให้ server รับเฉพาะรายการที่ผู้ใช้กำลังส่ง และเก็บรายการอื่นที่ถูกเพิ่มจากผู้ใช้อื่นไว้ได้ โดยไม่เปลี่ยนตัวตนของ line.

### Current draft last-writer-wins policy (2026-08-15)

กติกานี้เป็นกติกาปัจจุบัน และมีผลแทนข้อความออกแบบเก่าด้านล่างที่พูดถึงการชนกันของ line แบบ `409`:

- สำหรับเอกสาร `draft` ทั้ง WTI และ WTO การเพิ่ม/แก้ไข/บันทึกสินค้า, เต๋า และสิ่งเจือปนใช้ PATCH แบบ targeted write set. `collaborationChangedLineIds` และ `collaborationDeletedLineIds` คือรายการที่ request นี้มีสิทธิ์เขียนเท่านั้น; ใช้ persisted line ID (`weight_ticket_lines.id`) เป็น identity ไม่ใช้ `line_no`.
- ถ้าผู้ใช้สองคนแก้ line ID เดียวกัน ให้ transaction ที่ commit ล่าสุดเป็นค่าที่เชื่อถือได้ (last writer wins). ไม่หยุดด้วย version หรือ `updated_at` conflict สำหรับ draft line เดียวกัน. line อื่นที่ request ไม่ได้แก้ รวมถึง line ที่ผู้ใช้อื่นเพิ่มหลังจากเปิดเอกสาร ต้องถูกเก็บไว้.
- การลบ draft line เป็น idempotent: ถ้าอีกคนลบไปแล้วถือว่าสถานะปลายทางตรงกันและไม่แจ้ง conflict; ถ้ายังอยู่จึงลบเฉพาะ ID ที่ request ระบุ และ broadcast เฉพาะ ID ที่ลบได้จริง.
- ถ้า request เก่าพยายามแก้ line ID ที่ผู้ใช้อื่นลบไปแล้ว ให้ถือว่าการลบที่ commit ล่าสุดชนะและจบเป็น no-op; กติกานี้ใช้เฉพาะ ID ที่อยู่ใน baseline เดิม ส่วน client ID ที่ไม่เคยอยู่ใน baseline และ map ไม่ได้ยังต้องหยุดด้วย data-contract error.
- `บันทึกสินค้านี้` และ `เพิ่มเต๋าใหม่` ใช้ pipeline PATCH และการ merge เดียวกัน ต่างกันที่เจตนา: ปุ่มแรกส่ง changed/deleted IDs ของ product section ที่กรอกแล้ว ส่วนปุ่มหลังสร้าง client draft line แล้วส่งการบันทึกเพื่อให้ line ก่อนหน้าคงอยู่และรับ `lineIdMap`/`lot_seq` จาก server.
- หัวเอกสารยังไม่ใช่ LWW แบบ line: ถ้าผู้ใช้แก้ field หัวเดียวกันกับค่าที่เปลี่ยนไปแล้ว server ยังตอบ `409` เฉพาะ field นั้น. การเปลี่ยนสาขายังคงสร้างเลขที่เอกสารใหม่และทำให้เลขที่เดิมถูก supersede ตามกติกาเอกสาร.
- WTO ที่ `delivered` ยังคงใช้ guard แบบเข้มงวด เพราะเกี่ยวข้องกับ stock/pending-out; การยืนยัน/แก้ไขที่กระทบ stock ไม่ใช้ LWW เพื่อเขียนทับธุรกรรมที่ถูกใช้งานแล้ว.
- Realtime `lineIds` และ `deletedLineIds` ต้องมาจาก write set ที่ commit ได้จริงเท่านั้น. การ merge ของ client ต้องติดป้ายเฉพาะ product/lot/impurity ที่อยู่ใน event และไม่ขยายข้อความเตือนไปยัง line อื่น.

## Attachment upload validation and notification (2026-08-04)

- การเพิ่มรูปรถ/รูปสินค้า/รูปสิ่งเจือปนต้องตรวจว่าเป็น JPEG/PNG/WebP จริงและไม่เกินขนาดที่กำหนดใน `system_settings`. Browser ส่ง original ตรงโดยไม่ resize/decode/Canvas จึงไม่ทำให้มือถือหน่วงและไม่ลดคุณภาพต้นฉบับ. จำนวน upload พร้อมกันอ่านจาก config และไม่ lock ข้ามแท็บ/อุปกรณ์
- API upload ตรวจ signature, Sharp metadata และ source-pixel limit ฝั่ง serverก่อนสร้าง reference ที่แนบได้ จากนั้นอัปโหลด original ลง private Storage และสร้างทะเบียน job; การบันทึก WTI/WTO รอเฉพาะ original upload/validation ไม่รอ thumbnail. Server job จะสร้าง thumbnail แยกจาก request ด้วย Sharp, หมุนตาม EXIF, ย่อแบบ `inside` ด้วย Lanczos3, ไม่ขยายรูปเล็ก และ encode WebP ด้วย dimension/quality จาก `system_settings`.
- หลัง upload เดียวกัน job จะสร้าง download derivative เพิ่มสำหรับการดาวน์โหลดรูป: JPEG ด้านยาวสูงสุด `1600px`, quality `100`, รักษา ratio และไม่ขยายรูปเล็ก. การปรับ quality ใช้ migration และ backfill แบบ force กับ derivative เดิม โดยแตะเฉพาะไฟล์ดาวน์โหลด ไม่แตะ original. Download API จะ drain งานของ ticket ต่อเนื่องหลาย batch แล้วโหลด derivative metadata ใหม่ก่อนสร้าง ZIP เพื่อไม่ใช้สถานะเก่าของ worker และแบ่งแต่ละ part ตามข้อมูล derivative รวมไม่เกิน `45MiB` เพื่อเผื่อ ZIP overhead ภายใต้เพดาน Storage `50MiB`; ก่อน upload ยังตรวจขนาด ZIP จริงอีกชั้น. Detail modal เรียก estimate จาก metadata ก่อนเริ่มดาวน์โหลด; ถ้ามี part เดียวจะดาวน์โหลดตรงทันที แต่ถ้ามีหลาย part จะเปิด modal ก่อน แล้วเรียกสร้าง ZIP ราย part ตามลำดับ จึงเปิดปุ่มเฉพาะ part ที่พร้อมได้และไม่ต้องรอ part อื่น. ตอนกดจริง server ยังตรวจสถานะและสร้างไฟล์จากชุดข้อมูลล่าสุดอีกครั้ง. Original ยังคงเป็นหลักฐานต้นฉบับและไม่ถูกเขียนทับ; PDF/LINE ใช้ print derivative 400px ต่อไป.
- สถานะ thumbnail คือ `queued -> processing -> ready` หรือ `failed`; worker claim เป็น lease แบบ atomic. Upload route ใช้ `after()` และ detail/preview/print request เป็นจุด drain งานตาม request ส่วนข้อมูลเดิมหรือแถวที่ยังไม่พร้อมใช้ manual backfill/audit ตาม runbook. งาน print derivative รอบนี้ไม่เพิ่ม cron ใหม่. Detail modal poll ตามช่วงเวลาจาก config และแสดงรูปที่พร้อมทยอยขึ้นมา. ระหว่างรอแสดงสถานะตรงไปตรงมา และห้าม fallback ไปโหลด original ในช่อง thumbnail
- การอัปโหลดหลายรูปใช้ผลสำเร็จและผลล้มเหลวแยกกัน: รูปที่สำเร็จยังถูกเพิ่มในฟอร์ม และรูปที่ไม่สำเร็จต้องแสดง `role="alert"` พร้อมจำนวนและสาเหตุที่อ่านได้ เช่น ไฟล์ใหญ่เกินไปหรือเซิร์ฟเวอร์ตอบกลับผิดพลาด
- สิ่งนี้เป็น validation/feedback ของหลักฐานธุรกรรมระดับ L5 เท่านั้น ไม่เก็บรูปหรือ permission response ใน browser storage และยังใช้ API/Storage เดิมเป็น source of truth; ผู้ใช้ต้องเห็นความล้มเหลวก่อนกดบันทึกเอกสาร

What is what: upload result คือสถานะของไฟล์แนบแต่ละไฟล์ ไม่ใช่สถานะของเอกสาร WTI/WTO. Why it has to be like this: หน้างานต้องรู้ทันทีว่าหลักฐานรูปใดหายไป และไม่ควรเสียรูปที่อัปโหลดสำเร็จเพียงเพราะอีกรูปหนึ่งมีปัญหา.

## WTO downstream integrity review (2026-08-05)

- ร่าง WTO ตรวจน้ำหนัก/สต็อกก่อนบันทึก แต่ยังไม่กันของออกจาก available; `pending_out` จะถูกสร้างเมื่อผู้ใช้กด `ยืนยันส่งของ` เท่านั้น. เหตุผลคือร่างที่ยังไม่ยืนยันไม่ควรทำให้ยอดสต็อกที่รอออกเปลี่ยน และจุดยืนยันเป็น transaction boundary ของการกันของ.
- Sales Bill ยกเลิกหลังมี usage log `returned_from_sales_bill` หรือ `loss_from_sales_bill` ได้โดยเขียน `SB-CANCEL` แบบ append-only เพื่อคืน stock ตาม movement เดิม แต่ต้องไม่ reopen/recreate `pending_out` ซ้ำ.
- WTO ที่ถูกเปิดบิลบางส่วน (`partially_billed`) ยังเป็นตัวเลือกของ Sales Bill ได้ โดยระบบต้องใช้ remaining quantity/weight ของแต่ละบรรทัด ไม่เปิดให้ตัดยอดเดิมซ้ำ.
- การยกเลิก WTO บันทึก audit snapshot เป็น `cancelled` ให้ตรงกับสถานะ hold ที่ถูกยกเลิก. ไฟล์แนบ WTI/WTO ตรวจสิทธิ์ `daily.weight_tickets.update` และคืน signed URL จาก bucket ที่ตั้งค่าไว้ แทน public URL เพื่อไม่เปิดหลักฐานธุรกรรมเป็นสาธารณะ.

What is what: `pending_out` คือ reservation ของ stock ที่ยืนยันแล้ว, usage log คือประวัติการนำ WTO ไปใช้/คืน/สูญเสีย, และ attachment URL คือสิทธิ์อ่านหลักฐานที่มีอายุจำกัด. Why it has to be like this: downstream cancellation ต้องคืน stock ด้วย ledger reversal เสมอ แต่การคืน/สูญเสียก่อนหน้าไม่ควรทำให้ reservation ถูกสร้างซ้ำ และรูปภายในต้องไม่เผยแพร่ผ่าน URL สาธารณะ.

## Attachment chooser scroll stability and weight-field alignment (2026-08-03)

- ตัวเลือกแหล่งรูปของรูปรถ รูปสินค้า/เต๋า และรูปสิ่งเจือปนใน WTI/WTO ต้องเปิดทับฟอร์มโดยไม่เลื่อนเนื้อหาด้านหลัง: ก่อนเปิดให้เก็บตำแหน่งของ scroll container ที่ครอบ tile รูป ล็อก container เหล่านั้นตลอดช่วงเปิดและ animation ปิด 400ms ใช้ focus แบบ `preventScroll` และคืนทั้งตำแหน่งกับ focus เดิมเมื่อปิดด้วยปุ่ม `ยกเลิก`, backdrop หรือ `Escape`.
- กฎนี้แก้เฉพาะ interaction ของ chooser; การถ่ายรูป กล้องหลัง แกลเลอรีหลายรูป validation ตลอดจน API, Database, Storage และ cache contract เดิมต้องไม่เปลี่ยน.
- บนมือถือ label ของ `น้ำหนักรวม (กก. / ลัง)`, `หักภาชนะ (กก.)` และ `น้ำหนักหลังหักภาชนะ` ต้องจองความสูงสองบรรทัดเท่ากัน เพื่อให้ช่อง `h-10` ทั้งสามเริ่มบนแนวเดียวกัน; ช่องน้ำหนักหลังหักภาชนะยังเป็นค่าคำนวณ read-only ตามสูตรเดิม.

## Form exit safety (2026-07-30)

- ฟอร์ม WTI/WTO ใช้ saved-baseline snapshot แทนการเดาว่ามีข้อมูลจาก field ใด field หนึ่ง: ฟอร์มใหม่ที่ยังไม่เปลี่ยนค่าปิดได้ทันที แต่ฟอร์มที่เปลี่ยนจาก baseline ต้องยืนยันก่อนปิดหรือเปลี่ยนหน้า.
- ทางออกจากฟอร์ม (ปุ่มปิด/กลับ, navigation หลัก, refresh และปิด tab) ใช้ [[Form Safety and Confirmation Policy]]; เลือก `แก้ไขต่อ` ต้องคงข้อมูลเดิมไว้ และเลือก `ละทิ้งการแก้ไข` จึงออกจากฟอร์ม.
- การยกเลิก WTI/WTO ที่บันทึกแล้วต้องกรอกหมายเหตุและยืนยันอีกครั้งก่อนเรียก API. สถานะเอกสารเปลี่ยนเป็นยกเลิกโดยคงประวัติไว้ ไม่ใช่ลบเอกสารจริง.

เอกสารนี้เป็น canonical flow สำหรับหน้ากลุ่ม `ชั่งสินค้า / รับ-ส่งของ` ในระบบ Next app:

- route สร้าง/แก้ไข: `/daily/weight-tickets`
- route list/detail entry: `/daily/weight-ticket-list`
- route dashboard/read-model: `/daily/weight-ticket-dashboard`

จุดประสงค์ของเอกสารนี้คือแยกกติกาของ `WTI` และ `WTO` ออกจาก [[Purchase Flow]] และ [[Sales Flow]] ให้ชัด โดยหน้า WTI/WTO เป็นเจ้าของ flow เรื่อง:

- การสร้างเอกสารรับของ/ส่งของ
- กติกาหน้าฟอร์ม create/edit
- list/detail/timeline/print/share
- รูปสินค้า/รูปรถ
- สถานะเอกสารก่อนและหลังถูกนำไปใช้ downstream
- contract API เฉพาะหน้าสำหรับ option/product loading

ส่วน flow ซื้อและขายปลายทางให้ถือว่า:

- [[Purchase Flow]] เป็น owner ของ `WTI -> Purchase Bill`
- [[Sales Flow]] เป็น owner ของ `WTO -> Sales Bill`

## หลักการหลักของเอกสาร WTI/WTO

- ระบบ target ไม่ใช้เลข `WT` เดี่ยว
- ขาเข้าต้องใช้ `WTI{branchCode}{YYMM}-NNNN`
- ขาออกต้องใช้ `WTO{branchCode}{YYMM}-NNNN`
- เมื่อกดบันทึก ให้ถือว่าออกเอกสารจริงและมีผลต่อ usage/timeline ทันที แต่ยังไม่เขียน stock ledger
- เลขเอกสาร, วันที่เอกสาร, เวลา, และผู้บันทึก เป็น system-generated หลัง save เท่านั้น
- ผู้ใช้ต้องกรอกข้อมูลธุรกิจและน้ำหนักจริงก่อน ไม่ preview เลขเอกสารล่วงหน้า
- WTI อนุญาตให้บันทึกเอกสารโดยยังไม่มีรายการสินค้าได้ เพื่อเก็บการมาถึงของรถ/ผู้ขายก่อนชั่งหรือคัดสินค้า; ก่อนบันทึกต้องมี `สาขา`, `ผู้ขาย`, และ `ทะเบียนรถ` เสมอ ส่วน `โกดัง` ที่หัวเอกสารเป็นข้อมูลเสริมและไม่บังคับ. WTI ที่ยังไม่มีรายการไม่สร้าง product summary, stock ledger หรือ side effect สต็อก; เพิ่มสินค้าและน้ำหนักภายหลังได้ตาม flow เดิม. WTO ยังต้องมีรายการสินค้าและคลังระดับรายการตามกฎขาออกเดิม
- WTI create/edit modal ต้องแสดง elapsed timer ใต้ title bar เพื่อบอกเวลาตั้งแต่เริ่มสร้างรายการจนถึงสถานะ `received` / `รับของแล้ว`; timer และจำนวนรายการต้องอยู่ใน surface เดียวกันทั้ง desktop/mobile โดยเริ่มต้นเป็นแบบย่อ แสดงเฉพาะเวลาและจำนวนรายการ และให้ผู้ใช้กดแสดง/ซ่อนรายละเอียดเอง ส่วนยอดน้ำหนักของแต่ละรายการยังแสดงใน section รายการด้านล่าง ไม่แสดงซ้ำใน timer summary เอกสารที่บันทึกแล้วใช้ `weight_tickets.created_at` เป็นเวลาเริ่ม และยังนับต่อหลังบันทึก draft จนกว่าผู้ใช้กดปุ่มยืนยันรับของ ซึ่งเขียน `weight_ticket_status_logs.to_status = received` เป็นเวลาหยุดเท่านั้น ห้าม fallback ไปใช้ `updated_at` เพราะเวลานั้นอาจมาจากการแก้ไขอื่น ส่วน draft ที่ยังไม่บันทึกให้เริ่มนับจากเวลาที่เปิด modal เท่านั้น ไม่เพิ่ม field ใหม่ใน DB
- รูปต่อรายการสินค้าเป็นข้อมูลบังคับของเอกสาร WTI/WTO
- รูปสินค้าที่ใช้เลือกในฟอร์มเป็นเพียง master-data thumbnail เพื่อช่วยเลือกสินค้า ไม่ใช่หลักฐานแทนรูปหน้างาน
- PDF/LINE share ต้องให้หน้าแรกเป็นใบพิมพ์ A4 และต่อหน้า 2+ เป็นอัลบั้มรูปหลักฐานจากรูปรถและรูปสินค้า
- ใน detail/modal ส่วน `รูปภาพประกอบ` มีปุ่ม `ดาวน์โหลดรูปทั้งหมด` สำหรับดาวน์โหลดรูปที่ preview ได้ของรถและทุกรายการสินค้าเป็น ZIP เดียว. API ตรวจ `daily.weight_tickets.view` และ branch scope ก่อนอ่าน storage reference; ไม่เก็บ ZIP หรือรูปลง browser storage และไม่ทำ bucket ให้เป็น public
- history/timeline ของเอกสารต้องเป็น append-only ตาม [[Document Timeline Policy]]
- Header ของ detail modal WTI/WTO ต้องไม่ตัด action บนมือถือ: ชื่อเอกสารอยู่แถวบน และกลุ่มปุ่ม action ต้อง wrap ได้โดยไม่ใช้ vertical-clipping จากแถบ `overflow-x-auto`; Desktop คงตำแหน่งปุ่มเดิม.

## Shared save-progress and WTO line-add flow (2026-08-05)

ฟอร์ม WTI/WTO ใช้ `WeightTicketSaveProgress` เป็นส่วนกลางสำหรับสถานะการบันทึกทุกจุดที่ผู้ใช้ต้องรอผลจาก server โดยไม่ปิดหน้าฟอร์มและไม่ซ่อนข้อผิดพลาด:

- `auto_save`: เมื่อผู้ใช้กด `เพิ่มสินค้า` หรือ `เพิ่มเต๋า` ระบบเพิ่มแถวและเปิดช่องกรอกใน client state ทันที ไม่รอ response จาก server. จากนั้นจึงส่ง draft เป็น background (`saveScope=header` สำหรับการเพิ่มสินค้าครั้งแรก และ `saveScope=document` สำหรับเอกสารที่มีรายการแล้ว) เพื่อเก็บ document id/ข้อมูลเดิม โดยไม่เปิด save stage ซ้ำเมื่อมี request เดิมกำลังทำงานอยู่
- `save`: WTI บันทึกข้อมูลตามปุ่มบันทึกเดิม
- `stock_check`: WTO ตรวจ stock และข้อมูลทุกรายการใหม่ก่อนบันทึกทุกครั้ง
- หลัง transaction หลัก commit สำเร็จ API save จะทำ audit แล้วตอบเฉพาะข้อมูลที่ฟอร์มต้องใช้ต่อทันที โดยไม่ sign URL รูปและไม่ query timeline/pending-out detail ใน response; หน้า detail จะโหลดข้อมูลประกอบและ signed preview URL ผ่าน endpoint แยกเมื่อจำเป็น. เหตุผลคือการบันทึกธุรกรรมต้องรอ DB commit และ audit ให้เสร็จ แต่ไม่ควรบล็อกด้วยข้อมูลประกอบที่ไม่ได้ใช้ต่อในฟอร์ม.
- `confirm`: ยืนยันรับ/ส่งของจากหน้า detail หรือ modal

การแสดงสถานะเป็น `role=status`, `aria-live=polite` และปิดปุ่มที่เรียก operation เดิมระหว่างรอ เพื่อป้องกันการกดซ้ำ. หลัง auto-save สำเร็จ การบันทึกปุ่มสุดท้ายต้อง update ticket เดิมผ่าน `savedTicket.id` ไม่สร้างเอกสารซ้ำ. Server/database ยังคงเป็น source of truth และ UI ไม่ใช้ข้อมูลสำรองแบบ hard-code.

เหตุผล: event การเพิ่มแถวกับ event การ persist ต้องแยกกันเพื่อให้ผู้ใช้กรอกต่อได้ทันที ขณะที่ข้อมูลหัวเอกสารยังถูกเก็บเป็น draft แบบ background. เมื่อ server ตอบกลับแล้วจึงผูก `ticket_id` เดิม และ final save update เอกสารเดียวกัน. WTI ยังคงใช้ contract เดิมที่อนุญาตให้บันทึกโดยไม่มีรายการสินค้า.

## Scoped add performance (2026-08-14)

เมื่อกด `เพิ่มเต๋า`, `เพิ่มสิ่งเจือปน` หรือ `หักสิ่งเจือปนต่อ` ระบบจะ validate และ persist ข้อมูลเดิมของ section ปัจจุบันก่อนเปิดแถวใหม่. PATCH แบบ scoped จะใช้ dirty line เป็น candidate แล้วตรวจ fingerprint กับ baseline ซ้ำอีกชั้น จึงส่งเฉพาะ line ที่เปลี่ยนจริงหรือเป็น line ใหม่ ไม่ส่ง ID ที่ dirty ค้างแต่ค่ากลับมาตรงกับ baseline และไม่ส่งซ้ำทั้ง section ที่ไม่ได้แก้. ระหว่างรอ save จะรอเฉพาะ upload รูปของ line ใน section เดียวกัน ไม่บล็อกด้วย upload ของรถหรือสินค้าอื่น. WTI และ WTO ใช้ boundary เดียวกัน แต่ server ยังคงบังคับความต่างของเอกสาร เช่น WTO ต้องมีคลังและห้าม impurity แบบสินค้าอื่น.

สำหรับ `บันทึกสินค้านี้` dirty set ยึดเฉพาะ line ที่ผู้ใช้แก้จริงหรือ line ใหม่ที่ยังไม่มี `version` จาก server; persisted line ที่เพิ่ง merge จาก realtime ของผู้ใช้อื่นจะไม่ถูกอนุมานเป็น local change แม้ไม่มีอยู่ใน baseline เดิม. การแก้ค่าน้ำหนัก/หักภาชนะ/หมายเหตุ/รูปของเต๋าจะ mark เฉพาะเต๋านั้น ส่วน child จะถูกเพิ่มเข้า write set เฉพาะเมื่อ propagation เปลี่ยน field ของ child จริง.

แต่ละบรรทัดสิ่งเจือปนมีปุ่ม `บันทึกสิ่งเจือปนนี้` ของตัวเอง. การกดปุ่มนี้ใช้ PATCH scope เดิม โดย request จะมี line ของ root section ครบเพื่อให้ server ตรวจโครงสร้าง parent/child ได้ และ `changedLineIds` จะระบุเฉพาะ ID ของ parent chain, สิ่งเจือปนบรรทัดที่กด และบรรทัดลูกที่สัมพันธ์กัน เพื่อบันทึกทั้ง parent และ child ในครั้งเดียวโดยไม่เขียนทับสายอื่น. ไม่ใช้เลขลำดับที่แสดงบนหน้าจอเป็น identity. เหตุผลคือผู้ใช้หลายคนสามารถแก้สิ่งเจือปนคนละสายพร้อมกันได้ โดยการบันทึกหนึ่งสายไม่เขียนทับสายอื่น.

What is what: `persistLineIds` คือขอบเขตข้อมูลที่ operation นี้อนุญาตให้เขียน และ `attachmentOwnerIds` คือขอบเขต upload ที่ต้องรอให้เสร็จก่อน persist. หน้า form สร้าง line index ร่วมหนึ่งชุดต่อ state เพื่อเก็บ `byId`, root lines และ parent/child ในการเดิน array รอบเดียว พร้อมสร้าง product lookup ต่อชุด master data จึงไม่สร้าง map/filter/find ซ้ำทุก product section. เลขสิ่งเจือปนเป็น presentation tree เช่น `1`, `1.1`, `1.1.1`; ความสัมพันธ์จริงยังใช้ `id`/`parentId` และ `line_no` ของ server ไม่ใช้เลขที่แสดงแทน identity. Why it has to be like this: server ยังคงเป็น source of truth และตรวจ validation/version ของ line ที่ส่งมา แต่ payload และเวลารอไม่ขยายไปแตะข้อมูลของ section อื่น จึงลด request body และ latency โดยไม่เปลี่ยนลำดับหรือ contract ของ WTI/WTO.

## Read performance and private image preview boundary (2026-08-06)

- list JSON ใช้ lightweight projection และ batch usage count; detail action ต้องรอ full detail ก่อนเปิด action ที่แก้ไข/ยืนยัน/พิมพ์/แชร์ เพื่อไม่ให้ list row ที่มี `lines` และ timeline ว่างถูกนำไปใช้เป็นรายละเอียดจริง
- list/detail/preview API ที่อ่านข้อมูล WTI/WTO ใช้ `Cache-Control: private, no-store` เพราะมีข้อมูลสาขา สินค้า น้ำหนัก และสถานะธุรกรรม
- preview จะ sign เฉพาะ reference ที่มี `bucket` และ `storageKey` ตรงกับ `WEIGHT_TICKET_IMAGE_BUCKET`; reference ที่เป็น bucket อื่น, URL-only, data URL หรือ filename-only จะถูกตัดออกจาก preview response แบบ fail-closed. การตรวจนี้เป็น read boundary เพิ่มจาก write validation เพื่อไม่เปิด URL ของ artifact bucket หรือข้อมูล legacy
- modal ยกเลิก request detail, preview และ stock-return เมื่อปิดหรือเปลี่ยนเอกสาร เพื่อลดงานที่ค้างและป้องกัน response เก่าชน state ปัจจุบัน

## Detail gallery origin-transfer boundary (2026-08-14)

- หน้า list, detail และ form ใช้ signed thumbnail จาก private Supabase Storage เป็นภาพเริ่มต้นเสมอ; gallery จะไม่โหลด original โดยอัตโนมัติเมื่อผู้ใช้เปิดรูป
- ผู้ใช้ต้องกด `ดูรูปต้นฉบับ` จึงจะ sign และโหลด original สำหรับการซูม/ตรวจหลักฐานละเอียด. ระหว่าง gallery เดียวกัน URL ของภาพที่โหลดแล้วถูกเก็บใน state ของรายการนั้น จึงไม่ยิง original ซ้ำเมื่อสลับกลับมาที่รูปเดิม
- original และ thumbnail ใช้ storage key แบบ immutable และ cache-control ระยะยาวที่ Storage/CDN; API ที่คืน signed URL ยังคง `private, no-store` เพราะเป็นข้อมูลตามสิทธิ์เอกสาร ไม่ cache response ธุรกิจบน Vercel/browser
- เหตุผล: การเปิด detail หรือกดดูรูปทั่วไปไม่ควรดึง binary ต้นฉบับหลาย MB ผ่าน origin; การอ่าน original เป็น explicit action ของผู้ใช้เท่านั้น ส่วน thumbnail เป็น presentation asset สำหรับ gallery/list

## Historical WTI Concurrent Draft / Auto-save Design (2026-07-23)

> ส่วนนี้เป็นแนวคิดเดิมเพื่อเก็บบริบทการออกแบบ ปัจจุบันให้ยึด `Current draft last-writer-wins policy (2026-08-15)` ด้านบนเป็นหลัก โดยเฉพาะกติกา line เดียวกันและการแจ้ง realtime.

### ขอบเขต

รอบนี้ออกแบบและทำเฉพาะ `WTI` ก่อน เพื่อรองรับหน้างานที่มี 2 ตราชั่งและผู้ใช้ 2 คนเปิดเอกสารใบเดียวกันพร้อมกัน ผู้ใช้ทั้งสองคนแก้ไขร่วมกันได้เฉพาะส่วนรายการหน้างาน:

- เพิ่มสินค้าและเพิ่มเต๋า
- แก้ไขหรือลบเต๋า
- แก้ไขข้อมูลสินค้าและน้ำหนัก
- เพิ่ม แก้ไข หรือลบรูปภาพ
- เพิ่ม แก้ไข หรือลบสิ่งเจือปน

ข้อมูลหัวเอกสารและข้อมูลอื่น เช่น ผู้ขาย รถ ทะเบียนรถ วันที่ และหมายเหตุ ยังคงใช้ปุ่ม `บันทึก` แบบเดิม รอบนี้ไม่ทำ auto-save ให้ข้อมูลกลุ่มดังกล่าว

### Revised WTI form flow และ validation gate

หน้าสร้าง WTI ใหม่ต้องซ่อน section `สินค้าและน้ำหนัก` ไว้ก่อน จนกว่าผู้ใช้จะกรอกข้อมูลหัวเอกสารที่จำเป็นครบแล้ว โดยเพิ่มปุ่ม `เพิ่มรายการสินค้า` ใน section หัวเอกสาร:

1. ผู้ใช้กรอกข้อมูลหัวเอกสารให้ครบ
2. กด `เพิ่มรายการสินค้า`
3. Server validate หัวเอกสาร แล้วเปิด section `สินค้าและน้ำหนัก`
4. จังหวะกดปุ่มนี้ยังไม่สร้างเอกสาร draft เพราะยังไม่มีรายการสินค้า
5. เมื่อผู้ใช้เลือกสินค้าและเพิ่มรายการจริง จึงสร้าง WTI และ line แรกเป็น `draft` ใน transaction เดียวกัน

ปุ่ม `เพิ่มรายการสินค้า` ใน section สินค้าและน้ำหนักใช้เพิ่มรายการถัดไปได้ต่อเนื่อง แต่ทุกครั้งก่อนเพิ่มสินค้า/เพิ่มเต๋า ระบบต้อง validate รายการเดิมทั้งหมดตามกฎของเต๋าที่ใช้อยู่แล้ว:

- ถ้ารายการเดิมครบและผ่าน validation จึงเพิ่มรายการใหม่ได้
- ถ้ามีรายการเดิมไม่ครบ ห้ามเพิ่มรายการใหม่
- ระบบต้อง focus/เลื่อนไปยังรายการที่ผิดและแสดงสาเหตุที่ต้องแก้
- รายการที่ยังไม่ครบยังคงอยู่เป็น `draft` ได้ แต่ต้องแก้ให้ผ่าน validation ก่อนจึงเพิ่มรายการถัดไปได้
- เมื่อรายการถูกแก้โดยผู้ใช้คนใดคนหนึ่งและ realtime แจ้งว่าข้อมูลครบแล้ว ให้ตรวจสอบ gate ใหม่โดยไม่ต้อง refresh หน้า

กติกานี้เป็น validation gate สำคัญเพื่อไม่ให้ผู้ใช้สร้างรายการต่อจากข้อมูลที่ยังไม่ครบ และไม่ให้เกิดรายการที่หลุดจาก validation จากการเพิ่มรายการต่อเนื่องหลายรายการ

### หลักการบันทึก

เมื่อมีการเลือกสินค้าและเพิ่มรายการครั้งแรก ระบบสร้างเอกสารเป็น `draft` อัตโนมัติ หลังจากนั้นการเพิ่มสินค้า/เต๋าใหม่ รวมถึงการเพิ่ม/ลบรูปและสิ่งเจือปนที่อยู่ใน section สินค้าและน้ำหนัก ให้บันทึกเป็น operation รายการทันที ส่วนการแก้ไขข้อมูลเดิมต้องรอกด `บันทึก` ไม่ส่งฟอร์มทั้งเอกสารกลับไปเขียนทับ:

```text
add line -> manual update line -> immediate delete line operation
add impurity -> manual update impurity -> delete impurity
add image -> delete image
```

แต่ละเต๋าต้องมี `line_id` เฉพาะของตัวเอง แม้เป็นสินค้าเดียวกันจากคนละตราชั่งก็ต้องเก็บเป็นคนละ line เพื่อไม่ให้การบันทึกของผู้ใช้คนหนึ่งทับของอีกคนหนึ่ง หน้าจอสามารถ group สรุปตามสินค้าได้ แต่ข้อมูลจริงต้องรักษารายการเต๋าแยกกัน

ลำดับของเต๋าแยกเป็น 3 ค่าที่มีหน้าที่ต่างกัน: `line_id`/temporary client id ใช้จับตัวตนระหว่างแก้ไขในหน้าเดียวกัน, `lot_seq` เป็นเลขเต๋าถาวรที่ server ออกให้ตามเวลาที่บันทึกภายใน transaction, และ `line_no` เป็นเพียงลำดับแสดงผลที่ renumber ได้หลังเพิ่มหรือลบ. `lot_seq` ผูกกับเอกสารและไม่ถูกนำกลับมาใช้หลังลบ เพื่อให้การเพิ่มพร้อมกันจากหลายผู้ใช้ไม่ทำให้เลขเต๋าชี้ไปยังข้อมูลคนละรายการ.

เฉพาะ operation ที่ระบุว่า auto-save เท่านั้นที่ถือว่าเป็นข้อมูลใน draft ทันที การแก้ไขข้อมูลเดิม เช่น น้ำหนัก รายละเอียดสินค้า หรือค่าภายในรายการ จะอยู่ใน local dirty state จนกด `บันทึก` ดังนั้นปุ่ม `ยกเลิก` จะไม่ย้อนกลับรายการที่ auto-save ไปแล้ว แต่ถ้ามีข้อมูลแก้ไขย่อยหรือข้อมูลหัวเอกสารที่ยังไม่กด `บันทึก` ต้องถามยืนยันก่อนออกจากฟอร์ม. แถวเต๋าหรือสิ่งเจือปนที่เพิ่งกดเพิ่มและยังไม่มีข้อมูลที่ผู้ใช้กรอกจริงถือเป็น draft skeleton: ปิดฟอร์มหรือลบแถวได้ทันทีโดยไม่ถาม; เมื่อเริ่มกรอกน้ำหนัก เลือกสิ่งเจือปน ใส่หมายเหตุ หรือแนบรูปแล้วจึงเข้าสู่ local dirty state และต้องยืนยันก่อนทิ้ง

### Realtime และ concurrency

เอกสาร draft ต้องมี realtime channel ตาม `weight_ticket_id` เมื่อ Server commit operation สำเร็จจึง broadcast event ไปยังผู้ใช้อื่น:

```text
ตราชั่ง A เพิ่มเต๋า
-> Server commit line ใหม่
-> Server คำนวณ summary ล่าสุด
-> broadcast event ของ line และ summary
-> ตราชั่ง B แสดงข้อมูลใหม่โดยไม่ต้อง refresh
```

กติกาการชนกัน:

- เพิ่มเต๋าพร้อมกัน: อนุญาตทั้งสองรายการและสร้างคนละ `line_id`
- แก้ไขคนละ line: อนุญาตพร้อมกัน
- แก้ไข line เดียวกัน: แนวคิดเดิมเคยตรวจ `version`; ปัจจุบัน draft ใช้ last-writer-wins ตาม persisted line ID (`weight_ticket_lines.id`) ส่วน delivered WTO และ header ยังใช้ guard ตามกติกาปัจจุบันด้านบน
- ลบรูปหรือสิ่งเจือปนซ้ำกัน: Server ต้องตรวจสถานะล่าสุดและทำให้ operation retry ได้โดยไม่สร้างข้อมูลซ้ำ
- เมื่อเอกสารถูก `received` หรือ `cancelled`: broadcast สถานะใหม่และเปลี่ยนอีกเครื่องเป็น read-only

เมื่อเกิด conflict ในขอบเขตที่ยังใช้ guard อยู่ เช่น header หรือ delivered WTO ระบบต้องตอบ `409` และบันทึก audit event `daily.weight-ticket.collaboration-conflict` ลง `app_audit_logs` โดยเก็บเฉพาะข้อมูลวินิจฉัยที่จำเป็น ได้แก่ operation/scope, เลขที่เอกสาร, persisted line ID ที่ชน, line version ฝั่ง baseline และปัจจุบัน, header fields, updated-at และ request id เพื่อวิเคราะห์พฤติกรรมจริงของผู้ใช้โดยไม่เก็บน้ำหนัก รูปภาพ หรือ payload ธุรกิจทั้งก้อน หาก audit sink ขัดข้องต้องคงผลลัพธ์ conflict เดิมไว้ ไม่เปลี่ยนเป็นความสำเร็จหรือ error อื่น. Draft line ที่ใช้ LWW จะไม่สร้าง conflict เพียงเพราะมีผู้ใช้แก้ line เดียวกันภายหลัง

การจับคู่ line ระหว่างผู้ใช้ใช้ persisted `line.id` ที่ Server สร้างเท่านั้น `line_no` ใช้สำหรับลำดับและความสัมพันธ์ parent เท่านั้น ห้ามใช้ `doc_no:line_no` หรือเลขลำดับที่หน้าจอแสดงเป็น fallback identity เพราะอาจทำให้เต๋าคนละรายการถูกมองเป็นรายการเดียวกัน

หน้าจอต้องแสดงสถานะ `กำลังบันทึก`, `บันทึกแล้ว`, `มีการเปลี่ยนแปลงจากตราชั่งอื่น` และ `บันทึกไม่สำเร็จ` รวมถึงต้อง reload ข้อมูลล่าสุดเมื่อ reconnect หลังหลุดการเชื่อมต่อ

### Server ownership และ API boundary

Server เป็นผู้สร้าง `line_id`, ตรวจสิทธิ์/สถานะเอกสาร, validate น้ำหนักและสิ่งเจือปน, ตรวจ validation gate ก่อนเพิ่ม line, คำนวณยอดรวม และ rebuild product summary จาก lines จริง ทุก operation ต้องทำใน transaction เดียวกับการบันทึก event ที่จำเป็น

การ validate แบ่งเป็น 2 ระดับ:

- **ก่อนเพิ่มสินค้า/เต๋า:** ตรวจหัวเอกสาร, สิทธิ์, สถานะ draft และตรวจว่าทุก line เดิมผ่าน validation แล้ว
- **ตอนกดบันทึก/ยืนยันเอกสาร:** ตรวจข้อมูลรายการและเอกสารทั้งหมดจากข้อมูลล่าสุดในฐานข้อมูลอีกครั้ง

การรับ event จากผู้ใช้อื่นต้องไม่ทำให้ validation ถูกข้าม หาก realtime เพิ่มหรือแก้ line จนมีรายการไม่ครบ ปุ่มเพิ่มรายการต้องถูกปิดจนกว่ารายการนั้นจะผ่าน validation

แนว API ที่ต้องเพิ่มหรือปรับสำหรับ WTI:

| Operation | หน้าที่ |
|---|---|
| `POST /api/daily/weight-tickets` | สร้าง WTI draft จาก operation แรก |
| `POST /api/daily/weight-tickets/{id}/lines` | เพิ่มสินค้า/เต๋าแบบ append |
| `PATCH /api/daily/weight-tickets/{id}/lines/{lineId}` | แก้ไข line พร้อมตรวจ version |
| `DELETE /api/daily/weight-tickets/{id}/lines/{lineId}` | ลบ line พร้อมตรวจสถานะล่าสุด |
| line impurity/image operations | เพิ่ม/แก้/ลบสิ่งเจือปนและรูปแบบรายรายการ |
| existing `PUT` | ปรับให้ใช้เฉพาะข้อมูลหัวเอกสารและข้อมูลอื่นที่กด `บันทึก`; ห้าม rebuild หรือเขียนทับ lines ที่ auto-save |

การเปลี่ยนแปลงนี้ต้องแยกจาก flow `confirm` เดิม: WTI draft ยังไม่เขียน stock ledger และการยืนยันรับของยังเป็น action ที่ผู้ใช้กดเอง

### Shared foundation สำหรับ WTO ในอนาคต

ส่วนที่ควรออกแบบเป็น shared module ตั้งแต่ต้นคือ operation API shape, line version/conflict handling, realtime event envelope, reconnect/resync, audit event, summary recalculation และ client save-state handling ส่วน validation ธุรกิจยังแยกตาม type:

- `WTI`: supplier, impurity และ receipt flow
- `WTO`: customer, warehouse, pending-out และ stock validation

ยังไม่รวมการเปิด concurrent edit ของ WTO ในรอบนี้ และยังไม่เปลี่ยนกติกา `WTO draft`/`WTO confirm`

### ลำดับ implementation และ acceptance criteria

1. ทำ shared operation/version/event contract โดยยังเปิดใช้เฉพาะ WTI
2. ทำ WTI line write transaction และ server-side summary
3. ทำ realtime broadcast, client merge และ reconnect resync
4. แยก auto-save เฉพาะการเพิ่มสินค้า/เต๋า และการเพิ่ม/ลบรูป/สิ่งเจือปนออกจาก manual-save fields เช่น น้ำหนักและการแก้ไขข้อมูลเดิม
5. ทดสอบสองตราชั่งเพิ่ม line พร้อมกัน, แก้คนละ line, แก้ line เดียวกัน, ลบรูป/สิ่งเจือปนพร้อมกัน และ offline/reconnect
6. ตรวจว่า confirm/cancel/downstream เดิมยังทำงานตาม contract

เกณฑ์ผ่านหลักคือ เมื่อผู้ใช้สองคนเพิ่มเต๋าพร้อมกัน รายการทั้งสองต้องอยู่ครบ ยอดรวมต้องตรงกับ lines จริง และผู้ใช้ทั้งสองต้องเห็นข้อมูลเดียวกันหลัง Server commit โดยไม่มี full-document overwrite

### WTI Implementation Task List

ลำดับนี้เป็น task list สำหรับ WTI รอบแรก โดย task ที่ระบุว่า shared ต้องออกแบบให้ WTO นำไปใช้ต่อได้ แต่ยังไม่เปิดใช้ concurrent update ใน WTO

#### Phase 0: Contract และ baseline

- [ ] `WTI-00` สรุป field ownership ของฟอร์ม: auto-save เฉพาะการเพิ่มสินค้า/เต๋า และการเพิ่ม/ลบรูป/สิ่งเจือปน; การแก้ไขข้อมูลเดิมรวมถึงน้ำหนักใช้ manual save
- [ ] `WTI-00A` เพิ่ม flow gate: ซ่อน section `สินค้าและน้ำหนัก` จนกด `เพิ่มรายการสินค้า` หลังหัวเอกสารครบ และยังไม่สร้าง draft จากการเปิด section เพียงอย่างเดียว
- [ ] `WTI-01` เก็บ baseline ของ POST/PUT/PATCH เดิม, payload, status transition, summary, audit และ downstream usage เพื่อกัน regression
- [ ] `WTI-02` ระบุ operation contract กลาง: `add`, `update`, `delete`, `image`, `impurity`, `resync` พร้อม actor, client operation id และ document/line id

#### Phase 1: Database และ server write foundation (shared)

- [ ] `WTI-10` ตรวจ schema ปัจจุบันของ `weight_tickets`, `weight_ticket_lines`, impurity/image metadata และ summary bridge ว่ารองรับ line identity, ordering และ retry ได้หรือไม่
- [ ] `WTI-11` เพิ่ม migration เฉพาะที่จำเป็นสำหรับ line/document version, idempotency และ append-only operation/audit event โดยไม่เปลี่ยนข้อมูลธุรกิจเดิม
- [ ] `WTI-12` แยก service สำหรับสร้าง/แก้/ลบ WTI line และ rebuild summary จาก lines จริงใน transaction เดียว
- [ ] `WTI-13` ปรับ `PUT` เดิมให้บันทึกเฉพาะ manual fields; ห้าม delete/recreate lines หรือ summaries ที่ถูก auto-save
- [ ] `WTI-14` เพิ่ม optimistic concurrency check สำหรับการแก้ line เดียวกัน และ error contract สำหรับ `conflict`, `stale`, `document_locked` และ `retryable_failure`
- [ ] `WTI-15` ทำ operation idempotency เพื่อให้ request ที่ retry หลัง network timeout ไม่สร้าง line, รูป หรือสิ่งเจือปนซ้ำ

#### Phase 2: WTI line APIs

- [ ] `WTI-20` เพิ่ม endpoint สร้าง WTI draft จาก operation แรกเมื่อผู้ใช้เพิ่มสินค้า/เต๋า
- [ ] `WTI-21` เพิ่ม endpoint append line สำหรับ `เพิ่มสินค้า` และ `เพิ่มเต๋า` พร้อมตรวจ validation ของทุก line เดิมก่อนอนุญาตให้เพิ่ม
- [ ] `WTI-22` เพิ่ม endpoint update/delete line สำหรับสินค้าและน้ำหนัก
- [ ] `WTI-23` เพิ่ม endpoint เพิ่ม/แก้/ลบสิ่งเจือปนแบบผูกกับ line
- [ ] `WTI-24` ปรับ attachment flow ให้เพิ่ม/ลบรูปแบบผูกกับ line และ retry ได้โดยไม่เกิด duplicate metadata
- [ ] `WTI-25` ให้ทุก response ส่ง line ที่เปลี่ยน, summary ล่าสุด, document version และ event sequence ที่ใช้ resync

#### Phase 3: Realtime และ recovery (shared)

- [ ] `WTI-30` กำหนด realtime channel ต่อ `weight_ticket_id` และ event envelope กลางสำหรับ WTO
- [ ] `WTI-31` broadcast หลัง transaction สำเร็จเท่านั้น; ห้าม broadcast ข้อมูลที่ยัง rollback ได้
- [ ] `WTI-32` ทำ client merge รายการตาม `line_id` โดยไม่ replace state ทั้งเอกสารจาก event ที่มาช้ากว่า
- [ ] `WTI-33` ทำ reconnect/resync จาก Server เมื่อหลุด connection, event sequence ขาด หรือ client reload
- [ ] `WTI-34` แสดงผู้ใช้งาน/ตราชั่งที่กำลังแก้ไขเอกสาร และสถานะ `กำลังบันทึก`, `บันทึกแล้ว`, `มีการเปลี่ยนแปลงจากตราชั่งอื่น`, `บันทึกไม่สำเร็จ`

#### Phase 4: WTI form behavior

- [ ] `WTI-40` เมื่อเพิ่มสินค้า/เต๋าครั้งแรก ให้สร้าง draft และเก็บ `document_id` ไว้ใช้ต่อโดยไม่ออก draft ซ้ำ
- [ ] `WTI-41` auto-save เฉพาะการเพิ่มสินค้า/เต๋า และ operation การเพิ่ม/ลบรูป/สิ่งเจือปน/ลบ line; การแก้ไขข้อมูลเดิมต้องรอกด `บันทึก`
- [ ] `WTI-41A` แสดงสถานะ/ข้อความ validation ของ line ที่ไม่ครบ และปิด `เพิ่มรายการสินค้า`/`เพิ่มเต๋า` จนกว่าทุก line เดิมจะผ่าน validation
- [ ] `WTI-42` ป้องกันการส่ง request ซ้ำจากการกดเร็ว, debounce เฉพาะ field น้ำหนักที่กำลังพิมพ์ และคง stable row/line identity
- [ ] `WTI-43` เมื่อ event จากตราชั่งอื่นเข้ามา ให้ merge รายการและ summary โดยไม่ล้างข้อมูลที่ผู้ใช้กำลังกรอก
- [ ] `WTI-44` แยก dirty state ของ manual fields ออกจาก auto-save state; ถ้ากดยกเลิกขณะ manual fields ยังไม่บันทึก ให้ถามยืนยัน
- [ ] `WTI-45` หลัง WTI ถูก `cancelled` หรือถูกใช้ใน Purchase Bill ให้เปลี่ยนทั้งสองเครื่องเป็น read-only และหยุด auto-save; WTI ที่ `received` แต่ยังไม่มี PB ยังแก้ไขได้ตามสิทธิ์

#### Phase 5: Validation และ rollout

- [ ] `WTI-50` เพิ่ม unit/contract tests สำหรับ operation validation, validation gate, summary, version conflict และ idempotency
- [ ] `WTI-51` เพิ่ม integration tests สำหรับผู้ใช้สองคนเพิ่ม line พร้อมกัน, แก้คนละ line, แก้ line เดียวกัน และลบข้อมูลเดียวกัน
- [ ] `WTI-51A` ทดสอบว่าผู้ใช้ไม่สามารถเพิ่มสินค้า/เต๋าใหม่ได้เมื่อมี line เดิมข้อมูลไม่ครบ รวมถึงกรณี line ไม่ครบจาก realtime
- [ ] `WTI-52` ทดสอบรูป/สิ่งเจือปน, network timeout, retry, reconnect และ event sequence gap
- [ ] `WTI-53` ตรวจ confirm/cancel, Purchase Bill downstream, timeline, print, LINE และ permission ว่ายังอ่านข้อมูลครบจาก line จริง
- [ ] `WTI-54` รัน lint, type-check, build และ focused test suite; browser/UAT ทำเมื่อผู้ใช้ร้องขอโดยตรง
- [ ] `WTI-55` บันทึก flow summary หลัง validation และกำหนด checklist สำหรับเปิดใช้จริงทีละสาขาหรือทีละ environment

#### Out of scope รอบ WTI

- ไม่เปิด concurrent edit สำหรับ WTO ในรอบนี้
- ไม่เปลี่ยนกติกา WTO draft, pending-out หรือ stock reservation
- ไม่ทำ multi-user editing สำหรับข้อมูลหัวเอกสารที่ยังใช้ manual save
- ไม่เปลี่ยนกติกาการยืนยันรับของและ downstream stock flow

## ขอบเขตของ WTI กับ WTO

| เอกสาร | ใช้ทำอะไร | downstream หลัก | สถานะตั้งต้น |
|---|---|---|---|
| `WTI` | รับของเข้าหน้างาน/ยืนยันน้ำหนักขาเข้า | `Purchase Bill Stock` | `แบบร่าง` |
| `WTO` | ส่งของออก/ยืนยันน้ำหนักขาออก | `Sales Bill Stock` | `แบบร่าง` |

กติกาหลัก:

- `WTI` เป็น source document ฝั่งซื้อเข้า stock
- `WTO` เป็น source document ฝั่งส่งของ/ขายออก
- หน้า create/edit ใช้ route เดียวกัน แต่ type ต้องชัดว่าเป็น `WTI` หรือ `WTO`
- list page ต้องรวมทั้ง 2 เอกสาร แต่แยก tab/filter ตาม type
- เมื่อ user กดสร้างจาก list tab `WTO` ต้องเปิด `/daily/weight-tickets?type=WTO` เพื่อให้ฟอร์มเริ่มเป็นใบส่งของ ไม่ default เป็น `WTI`
- เมื่อ user กดสร้างจาก list tab `WTI` หรือ `WTO` ให้ซ่อน tab ของอีกประเภท และหลังสร้างแล้วห้ามเปลี่ยน type; API ต้อง reject การเปลี่ยน `WTI <-> WTO`

## ภาพรวม route และ API

| Surface | Route/API | หน้าที่ |
|---|---|---|
| Create/Edit page | `/daily/weight-tickets` | สร้าง/แก้ไข WTI/WTO |
| Dashboard | `/daily/weight-ticket-dashboard` | read-only dashboard สำหรับติดตาม WTI รอเปิด PB, WTO pending out, สรุปตามสถานะ/สาขา/สินค้า |
| List/Detail entry | `/daily/weight-ticket-list` | ค้นหา กรอง เปิด detail และเข้า edit |
| Dashboard API | `GET /api/daily/weight-ticket-dashboard` | สรุปจาก `weight_tickets`, `weight_ticket_product_summaries`, และ active `stock_holds` โดยไม่แสดง cost |
| Header options API | `GET /api/daily/weight-tickets/options` | โหลดสาขา ผู้ขาย ลูกค้า สิ่งเจือปน |
| Product picker API | `GET /api/daily/weight-tickets/products` | preload รายการสินค้าพร้อม thumbnail |
| WTO stock options API | `GET /api/daily/weight-tickets/stock-options` | API สำหรับคลัง RM/FG และคงเหลือรายสินค้า/สาขา/คลัง |
| Save API | `POST /api/daily/weight-tickets` | สร้างเอกสารใหม่ |
| Read/Update API | `GET/PUT/PATCH /api/daily/weight-tickets/{docNo}` | อ่าน detail แก้ไข และ cancel เอกสาร |

หลักการ loading:

- หน้า `/daily/weight-tickets` ต้องไม่ใช้ `/api/master-data/products?all=1` โดยตรง
- ต้องโหลด header options ผ่าน API page-scoped ก่อน
- หลัง options สำเร็จ ระบบ preload product options ต่อทันทีแบบ background
- product picker ต้องเห็นรูป thumbnail ได้โดยไม่ต้องรอผู้ใช้เลือกสาขาหรือคู่ค้าก่อน
- แต่ก่อน save ยังต้อง validate ว่ามีสาขาและคู่ค้าถูกต้องตาม type และคู่ค้านั้นต้องมี active branch mapping กับสาขาเอกสาร
- เมื่อมี `branchId` แล้ว header options API ต้องส่งเฉพาะ Supplier/Customer ที่ผูกกับสาขานั้นผ่าน active `supplier_branches` / `customer_branches`; ถ้าไม่มี mapping ต้องไม่แสดงเป็น option และห้าม fallback เป็นทุกสาขา
- ถ้า user เปลี่ยนสาขาและ Supplier/Customer เดิมไม่อยู่ใน mapping ของสาขาใหม่ UI ต้อง clear คู่ค้าเดิมทันที
- สำหรับ `WTO` ให้ user เลือกสินค้าใน line ก่อน แล้วค่อยเลือก `คลัง` ของสินค้านั้น เพื่อให้ทำงานสะดวกกว่า
- หลังเลือกสินค้าใน `WTO` แล้ว warehouse selector ของ line นั้นต้องแสดงเฉพาะคลัง `RM` / `FG` ที่ active และอยู่ในสาขาที่เลือก
- stock คงเหลือของ `WTO` จะแสดงได้ครบหลังมี `สาขา + สินค้า + คลัง`
- ฟอร์มต้องแสดง `คงเหลือจริง`, `จองไว้`, และ `พร้อมส่ง`
- `WTO` draft ยังไม่ validate เพื่อจอง stock และยังไม่สร้าง pending_out; ตอนยืนยันต้อง validate จาก `พร้อมส่ง = คงเหลือจริง - รอออก` แล้วสร้าง pending_out ใน transaction เดียวกัน
- final stock movement ยังเกิดตอนบันทึก `SB` โดย consume pending_out ของ WTO
- ไม่มี fallback จาก `WTO` ไป `Pending Sale / PSALE`; ถ้าของออกก่อนเปิดบิล ให้ถือว่า `WTO` เป็น pending_out source โดยตรงเท่านั้น

## หลักการคลังของ WTO

ในระบบนี้ `คลัง` ต้องถือเป็น stock location / stock dimension หลัก ไม่ใช่แค่ label ของสถานที่

stock คงเหลือต้องแยกอย่างน้อยตาม:

```text
สาขา + คลัง + สินค้า + สถานะสินค้า
```

ตัวอย่าง:

- สาขาเดียวกัน สินค้าเดียวกัน แต่คนละคลัง `RM` / `FG` ต้องถือว่าเป็น stock คนละกอง
- ถ้าสาขามีคลัง `RM` มากกว่า 1 คลัง ต้องเลือกคลังจริง ไม่ใช่เลือกแค่ประเภท `RM`
- dropdown ใน WTO ควร label ให้ user เข้าใจทั้งประเภทและชื่อคลัง เช่น `RM - คลังวัตถุดิบหลัก`

กติกา line-level ของ `WTO`:

- เลือก `สินค้า` ก่อน เพื่อให้ user ทำงานเร็วและเห็นรูป/ชื่อสินค้าได้ทันที
- หลังเลือกสินค้าแล้วให้เลือก `คลัง` ของสาขานั้น โดย filter เฉพาะคลัง active ที่ `type in (RM, FG)`
- WTO card หลักต้อง group ตาม `สินค้า + คลัง` เพราะนี่คือ stock bucket ที่ pending_out ใช้กัน stock จริง
- สินค้าเดียวกันแต่ต่างคลังให้มีคนละ card ได้ เพราะต้องกัน stock คนละคลัง
- สินค้าเดียวกันและคลังเดียวกันห้ามมีหลาย parent card; UI ต้องรวมเป็นเต๋า/lot ใหม่ใต้ card เดิม และ API ต้อง validate ซ้ำไม่ให้ payload ที่มี duplicate parent card บันทึกได้
- คงเหลือจะแสดงได้ครบหลังมี `สาขา + สินค้า + คลัง`
- ยอดที่ validate ตอนยืนยันต้องเป็น `พร้อมส่ง` ไม่ใช่ `คงเหลือจริง`; การ save draft เก็บเอกสารเท่านั้น
- `พร้อมส่ง = คงเหลือจริง - จองไว้`
- line ต้องเก็บ intended warehouse เพื่อให้ `SB` ตัด stock ออกจากคลังเดียวกับที่จองไว้

## Current API / Implementation Alignment

กติกาความละเอียดข้อมูล:

- น้ำหนักและจำนวนที่สืบทอดจาก WTI/WTO เก็บเป็น `numeric(18,2)` และ API รับทศนิยมไม่เกิน 2 ตำแหน่ง
- unit cost และ value snapshot ไม่ถูกลดเหลือ 2 ตำแหน่ง เพราะต้องรักษาความแม่นยำของ weighted-average cost
- view `weight_ticket_reconciliation_issues` ใช้ตรวจ header เทียบ product summary และจำนวน line bridge เพื่อไม่ให้ aggregate drift เงียบ ๆ

ตรวจ ณ 2026-06-11:

| ส่วน | Current code | Target gap |
|---|---|---|
| `weight_ticket_lines` | มี `warehouse_id` สำหรับ intended warehouse ของ `WTO` แล้ว | ต้อง harden print/export ถ้าต้องแสดงคลัง |
| `stock_holds` | มี durable hold table และ helper สำหรับ `active/released/cancelled/consumed`; `WTO` source layer เหลือเฉพาะ hold ของ WTO และ `SB` consume/reopen เฉพาะกรณียังไม่มี return-from-WTO/SB เท่านั้น ไม่มี PSALE fallback helper | SB cancel ต้อง append `SB-CANCEL`; คืน hold เฉพาะกรณียังไม่มี return, ถ้า return แล้วต้องคืน stock ตรง |
| `GET /api/daily/weight-tickets/options` | ส่ง `branches`, `suppliers`, `customers`, `impurities` | ถ้ามี branch context ต้องกรอง suppliers/customers จาก branch mapping; ไม่ต้องส่ง warehouse options รวม เพราะขึ้นกับ branch + product |
| `GET /api/daily/weight-tickets/products` | ส่ง product options พร้อม `thumbnailUrl` | ยังไม่ส่ง availability และไม่ควรยัด stock ทุกคลังมากับ product list |
| `GET /api/daily/weight-tickets/stock-options` | ส่งคลัง active `RM/FG` พร้อม `onHandQty/onHoldQty/availableQty` ตาม branch + product | ใช้ใน WTO create/edit แล้ว |
| `POST /api/daily/weight-tickets` | บันทึก WTI/WTO เป็น draft โดยยังไม่จอง stock | ตรง target หลัก |
| `PUT /api/daily/weight-tickets/{docNo}` | reject การเปลี่ยน type, release hold เดิม, validate ใหม่, rebuild hold ใหม่ใน transaction เมื่อยังไม่ถูกใช้ | เหลือ SB edit/cancel reversal/reopen hold |
| `PATCH /api/daily/weight-tickets/{docNo}` | cancel เอกสารและ mark active hold เป็น `cancelled` ใน transaction | ต้องคง lock เมื่อถูกใช้โดย bill |
| `stockBalanceSnapshot()` | aggregate `stock_ledger` ตาม product/branch/warehouse และแสดง `จองไว้ / พร้อมส่ง` จาก active hold | detail drilldown ของ hold ยังต้องเพิ่มถ้าต้องการ trace จาก stock page |

## No-Fallback WTO Source Contract

ตั้งแต่ 2026-06-24 เป็นต้นไป runtime ต้นทางของ `WTO` ต้องยึด contract นี้:

- `POST /api/daily/weight-tickets` เมื่อ `type = WTO` ต้องบันทึก draft โดยยังไม่สร้าง `stock_holds`
- `PUT /api/daily/weight-tickets/{docNo}` เมื่อ WTO ยังเป็น draft ต้องแก้เฉพาะเอกสารและรายการ โดยยังไม่สร้าง `stock_holds`
- `PATCH /api/daily/weight-tickets/{docNo}` action `confirm` ต้องตรวจ stock ล่าสุด สร้าง active hold และ snapshot ต้นทุนใน transaction เดียวกัน
- `PATCH /api/daily/weight-tickets/{docNo}` เมื่อ `WTO` ยังไม่ถูกใช้ ต้องเปลี่ยน active hold เป็น `cancelled`
- `WTO` ห้ามเขียน `stock_ledger` เองทุกกรณี
- `WTO` ห้ามสร้างหรือ consume `PSALE`
- การตัด stock จริงเกิดที่ `Sales Bill` เท่านั้น โดย consume hold แล้วเขียน `stock_ledger.ref_type = SB`
- การยกเลิก `Sales Bill` ต้อง append `stock_ledger.ref_type = SB-CANCEL`; เปิด hold ของ `WTO` กลับมาเป็น `active` เฉพาะกรณียังไม่มี return-from-WTO/SB ถ้า return แล้วห้าม reopen hold ซ้ำ

แนว API target ที่ควรใช้:

```http
GET /api/daily/weight-tickets/stock-options?branchId={branchCode}&productId={productCode}
```

response target:

```json
{
  "warehouses": [
    {
      "id": "WH-RM-01",
      "code": "WH-RM-01",
      "name": "คลังวัตถุดิบหลัก",
      "type": "RM",
      "branchId": "01",
      "onHandQty": 1000,
      "onHoldQty": 120,
      "availableQty": 880
    }
  ]
}
```

เหตุผลที่แยกเป็น API เฉพาะหน้า:

- product list ต้องเบาและโหลดรูป thumbnail ได้เร็ว
- stock availability ขึ้นกับ `branch + product + warehouse`
- hold-aware available qty ต้องคำนวณจาก ledger + active hold ใน server
- server ต้อง validate ซ้ำตอน save เพื่อกัน race condition ระหว่างหลาย user

## ระบบรับซื้อสิ่งเจือปนเป็นสินค้า (Auto-Buy Impurity Product Flow)

เพื่อความสะดวกในกรณีที่ทางโรงงานรับซื้อวัสดุที่มีสิ่งเจือปนปะปนเข้ามา (เช่น ทองแดงปนขยะ) และต้องการแปลงน้ำหนักที่ถูกหักจากสิ่งเจือปนนั้นไปสร้างเป็นรายการรับซื้อตัวใหม่ (เพื่อคิดเงินให้กับผู้ขายแยกต่างหากในเรทของสินค้าสิ่งเจือปนนั้นๆ) ระบบมีฟังก์ชัน **"รับซื้อสิ่งเจือปนเป็นสินค้า"** สำหรับเอกสาร `WTI`:

### 1. ลอจิกการทำงานและประเภทของสินค้า
- **การแยกประเภทสินค้า**: สินค้าจะถูกแยกกลุ่มออกจากกันอย่างเด็ดขาดผ่านฟิลด์ Category (ประเภทสินค้า):
  - สินค้าปกติ (`normalProducts`): สินค้าที่เป็นเนื้อโลหะหลักหรือสินค้าทั่วไปที่แสดงผลในลิสต์และปุ่มเพิ่มสินค้าหลัก
  - สินค้าสิ่งเจือปน (`impurityProducts`): สินค้ากลุ่มสิ่งเจือปน (เช่น ขยะ, กระดาษ, การ์ด) ที่ใช้เฉพาะในธุรกรรมการหัก/การรับซื้อสิ่งเจือปน
- **การเข้าถึงข้อมูล**: ข้อมูลสินค้าสิ่งเจือปนจะถูกแยกไปบริหารจัดการต่างหากผ่านเมนูย่อยและหน้าเพจ `/master-data/impurity-products` เพื่อป้องกันการเลือกสินค้าผิดฝั่ง

### 2. ลำดับขั้นตอนการใช้งาน (User Flow)
1. **เพิ่มแถวรายการสินค้าหลัก**: ผู้ใช้เพิ่มสินค้าปกติ (เช่น ทองแดง) และกรอกน้ำหนักขาเข้า (Gross) และค่าภาชนะตามปกติ
2. **เพิ่มรายการสิ่งเจือปน (Impurity Child Line)**:
   - ที่แถบรายละเอียดล็อตสินค้าด้านขวามือ ให้คลิกปุ่ม `+ เพิ่มเต๋าหักสิ่งเจือปน`
   - เลือกประเภทสิ่งเจือปน (เช่น ขยะ) และกรอกน้ำหนักที่ต้องการหักออก (เช่น หัก 10 กก.)
3. **การสั่งรับซื้อสิ่งเจือปน**:
   - บนแถวสิ่งเจือปนย่อยที่เพิ่มเข้ามา จะมีปุ่ม **"ซื้อ"** สีน้ำเงินแสดงขึ้นมา
   - เมื่อผู้ใช้คลิกปุ่ม **"ซื้อ"** ระบบจะทำงานดังนี้:
     - **ระบบค้นพบคู่แมตช์อัตโนมัติ (Auto-Match)**: หากชื่อประเภทสิ่งเจือปนตรงกับชื่อสินค้าในกลุ่ม "สินค้าสิ่งเจือปน" (เช่น สิ่งเจือปน "การ์ด" ตรงกับสินค้าสิ่งเจือปน "การ์ด") ระบบจะทำการสร้างแถวรายการรับซื้อใหม่ของสินค้าสิ่งเจือปนตัวนั้นเข้าสู่ใบชั่งน้ำหนักฝั่งซ้ายโดยทันทีเพื่อความสะดวกรวดเร็ว
     - **ระบบไม่พบการจับคู่ หรือเลือก "อื่นๆ"**: ระบบจะเปิดหน้าต่าง Dialog คอนเฟิร์มการรับซื้อขึ้นมา ให้ผู้ใช้เลือกค้นหาและระบุสินค้าสิ่งเจือปนที่ต้องการแปลง (แสดงเฉพาะตัวเลือกจากกลุ่ม `impurityProducts`) จากนั้นกด **"ยืนยันการรับซื้อ"**
4. **การเชื่อมโยงข้อมูลและหมายเหตุปลายทาง**:
   - ระบบจะสร้างแถวรายการรับซื้อหลัก (Parent Line) ตัวใหม่ของสินค้าสิ่งเจือปนนั้นๆ เพิ่มเข้าสู่เอกสาร WTI
   - ล็อตนี้จะมีน้ำหนัก Gross เท่ากับน้ำหนักที่หักไปจากรายการแรก (เช่น Gross = 10 กก.)
   - ที่ฟิลด์ **"หมายเหตุรายการ"** ของรายการรับซื้อใหม่ ระบบจะบันทึกข้อความอ้างอิงความเชื่อมโยงโดยอัตโนมัติเพื่อใช้ตรวจสอบย้อนกลับในรูปแบบ:
     `มาจากสิ่งเจือปน ({ชื่อสิ่งเจือปน} {น้ำหนัก} กก.) ของรายการที่ {ลำดับรายการแม่}: {รหัสสินค้าแม่} - {ชื่อสินค้าแม่}`
     (ตัวอย่างเช่น: *มาจากสิ่งเจือปน (อื่นๆ 13 กก.) ของรายการที่ 1: SKU235 - ก้ามเบรคแกะผ้า / เหล็ก*)
5. **การแสดงผลและปรับปรุงข้อมูล**:
   - เมื่อเลือกรายการสิ่งเจือปนนี้ขึ้นมาแก้ไขในแถบรายละเอียดด้านขวา ระบบจะรับทราบว่าเป็นแถวข้อมูลสินค้าสิ่งเจือปนและจะแสดงตัวเลือกตัวคัดกรองใน Dropdown ค้นหาและกล่องสุ่มรูปภาพ (Image Picker) เป็นกลุ่มสินค้าสิ่งเจือปนโดยเฉพาะ เพื่อป้องกันการเลือกข้ามชนิดกัน

## ภาพรวมข้อมูลในเอกสาร

### Header fields

| Field | ใช้กับ | หมายเหตุ |
|---|---|---|
| ประเภทเอกสาร | WTI/WTO | เลือก `WTI` หรือ `WTO` |
| สาขา | ทั้งคู่ | ใช้ทั้งใน business scope และเลขเอกสาร |
| ผู้ขาย | WTI | ใช้เฉพาะขาเข้า |
| ลูกค้า | WTO | ใช้เฉพาะขาออก |
| ทะเบียนรถ | ทั้งคู่ | ข้อมูลหน้างาน |
| รูปภาพรถส่งของ | ทั้งคู่ | แยกจากรูปต่อรายการสินค้า และใช้รูปแบบ upload tile เดียวกับรูปต่อรายการสินค้า |
| หมายเหตุเอกสาร | ทั้งคู่ | ระดับเอกสาร |

### Line fields

| Field | หมายเหตุ |
|---|---|
| สินค้า | เลือกจาก product picker/search combobox |
| คลัง | ใช้กับ WTO; เลือกหลังสินค้าในแต่ละ line และแสดงเฉพาะคลัง `RM` / `FG` ของสาขาเดียวกัน |
| คงเหลือในคลัง | ใช้กับ WTO; แสดงตามสินค้า + คลังที่เลือกใน line นั้น |
| น้ำหนักเข้า/Gross | ค่าหลักของหน้างาน |
| วิธีหักสิ่งเจือปน | `ไม่หัก`, `หัก`, `หัก%` |
| สิ่งเจือปน | ใช้เมื่อ line มีการหัก |
| น้ำหนักหัก | derive ตาม mode/ค่าที่กรอก |
| น้ำหนักสุทธิ | ใช้เป็นยอด operational หลัก downstream |
| รูปต่อรายการสินค้า | บังคับอย่างน้อย 1 รูปต่อ line |
| หมายเหตุต่อรายการ | optional |

## โครงข้อมูล 3 ชั้นของ WTI/WTO

WTI/WTO ไม่ได้มีแค่ header + lines แต่ต้องมองเป็น 3 ชั้น:

1. `weight_tickets`
   - header และยอดรวมทั้งเอกสาร
2. `weight_ticket_lines`
   - lot ชั่งจริง / raw lines
3. `weight_ticket_product_summaries`
   - summary ระดับสินค้าต่อเอกสาร

รายละเอียด design ของชั้น summary อยู่ใน [[WTI Product Summary Design]]

กติกาสำคัญ:

- raw line ห้ามถูกทำลาย
- downstream ฝั่ง office ไม่ควรใช้ raw line เป็น operational source หลัก
- `Purchase Bill` และ `Sales Bill` ควรใช้ summary ระดับสินค้าสำหรับการ allocate เป็นหลัก
- สิ่งเจือปนย่อย (`Impurity Child Line`) ต้องหักจากน้ำหนักรวมของเต๋าจริงทั้งหมดภายใต้สินค้าแม่เดียวกัน ไม่ใช่หักแล้วตัดทิ้งเมื่อเต๋าแรกเหลือน้อยกว่ายอดหัก; ส่วนที่หักไม่หมดจากเต๋าแรกต้องไล่หักจากเต๋าถัดไปของสินค้านั้น
- child line ที่มี `parentId` ต้องมี `productId` ตรงกับ parent เสมอ; create/update ทั้ง WTI และ WTO ต้อง reject payload ที่ผูก child คนละสินค้า และ calculator ต้องแยก child ที่ผิด contract ออกจากกลุ่มสินค้าแม้ถูกเรียกนอก request boundary
- line graph ของ create/update ต้องมี `id` ไม่ซ้ำ และ `parentId` ต้องอ้างถึงรายการอื่นที่มีอยู่จริง; schema ต้อง reject duplicate, orphan, self-parent และวงจรก่อนสร้าง map คำนวณ เพื่อให้ header, persistence, product summary และ print ใช้กราฟรายการเดียวกัน
- ยอดหักของสิ่งเจือปนย่อยต้องถูกจำกัดอยู่ในสินค้าแม่ของตัวเองและห้ามนำ net ของสินค้าอื่นมารับยอดหักแทน; form และ request schema ต้อง reject ยอดหัก raw รวมที่เกิน `gross - หักภาชนะ` ก่อน calculator clamp ห้ามยอมรับแล้วบันทึกยอดที่ถูกตัดเงียบ ๆ
- header total ต้องใช้สูตรเดียวกับผลรวม product summary และ create/edit, detail, HTML print กับ React-PDF ต้องอ่านผลคำนวณชุดเดียวกัน; Weight Info ของใบพิมพ์ใช้ header totals ครบทั้งเอกสารรวมรายการซื้อเพิ่มจากสิ่งเจือปน ส่วนจำนวนรายการยังนับเฉพาะเต๋าจริง
- เอกสารพิมพ์หลายเต๋าต้องแสดงสิ่งเจือปนย่อยในแถวสรุปสินค้าด้านล่างเพียงครั้งเดียว ไม่บวกซ้ำในแถวเต๋า; แถว `ซื้อเพิ่มจากสิ่งเจือปน` ยังคงเป็นรายการสินค้าแยกและถูกรวมเฉพาะใน product summary ของสินค้าที่ซื้อ
- แถวเต๋าใน detail และเอกสารพิมพ์ต้องแสดง raw lot arithmetic ของตัวเอง (`gross - หักภาชนะ - ยอดหักของเต๋า`) ส่วนสิ่งเจือปนย่อยและ final net ให้อยู่ในแถวสรุปสินค้าด้านล่างเพียงจุดเดียว เพื่อให้ทุก surface อ่านเลขชุดเดียวกันโดยไม่ทำให้เลขรายแถวขัดกัน
- ถ้าข้อมูลเก่ามี header/product summary/remaining weight ที่ไม่ตรงกับ raw line contract นี้ ต้องซ่อมด้วย controlled data repair หลังตรวจ dependency แล้ว ห้ามเพิ่ม runtime fallback เพื่อเดาหรือกลบข้อมูลที่บันทึกผิด

## Flow สร้าง WTI

| ขั้นตอน | ผู้ใช้ทำอะไร | ระบบทำอะไร | สถานะที่ได้ |
|---|---|---|---|
| 1 | เลือกประเภท `WTI` | เตรียมฟอร์มขาเข้า | draft ในหน้าจอ |
| 2 | เลือกสาขาและผู้ขาย | validate scope และ active `supplier_branches` | draft |
| 3 | กรอกทะเบียนรถ/รูปรถ | เก็บหลักฐานเอกสารระดับ header | draft |
| 4 | เพิ่มรายการสินค้า | เลือกสินค้า, กรอก gross/deduct/net, แนบรูปต่อรายการ | draft |
| 5 | กดบันทึก | ออกเลข `WTI...`, stamp วันเวลา/ผู้บันทึก, เขียน header/line/summary โดยไม่เขียน stock ledger | `แบบร่าง` |
| 6 | กด `ยืนยันรับของ` | บันทึก timeline การยืนยันและเปิดให้ WTI ใช้ใน Purchase Bill | `รับของแล้ว` |

ผล downstream ของ `WTI`:

- ใช้เป็น source สำหรับ `Purchase Bill` เฉพาะกรณี `Stock`
- เมื่อบันทึก `WTI` สำเร็จ ยังไม่สร้าง stock movement; stock-in จะเกิดตอนบันทึก `Purchase Bill Stock`
- WTI สถานะ `แบบร่าง` ยังนำไปออก Purchase Bill ไม่ได้ เพื่อให้แก้ไข/ตรวจสอบข้อมูลหน้างานก่อนยืนยัน
- หลัง `ยืนยันรับของ` และยังไม่ถูกนำไปออกบิล จะอยู่สถานะ `รับของแล้ว`
- เมื่อถูกนำไปออก `Purchase Bill` ต้องตัดให้ครบทั้งเอกสารในบิลเดียว ห้ามเหลือ partial สำหรับไปออกบิลอีกใบ
- เมื่อถูกใช้แล้วต้องขยับเป็น `เสร็จสิ้น` ทันที

## Flow สร้าง WTO

| ขั้นตอน | ผู้ใช้ทำอะไร | ระบบทำอะไร | สถานะที่ได้ |
|---|---|---|---|
| 1 | เลือกประเภท `WTO` | เตรียมฟอร์มขาออก | draft ในหน้าจอ |
| 2 | เลือกสาขาและลูกค้า | validate scope และ active `customer_branches` | draft |
| 3 | กรอกทะเบียนรถ/รูปรถ | เก็บหลักฐานเอกสารระดับ header | draft |
| 4 | เพิ่มรายการสินค้า | เลือกสินค้าก่อน แล้วเลือกคลัง `RM` / `FG` ใน line นั้นเพื่อดูคงเหลือและ validate stock | draft |
| 5 | กดบันทึก | ออกเลข `WTO...`, stamp วันเวลา/ผู้บันทึก และเขียน header/line/summary พร้อม intended warehouse ต่อ line โดยยังไม่จอง stock | `แบบร่าง` |
| 6 | กด `ยืนยันส่งของ` | ตรวจ stock ล่าสุด สร้าง active pending_out, snapshot ต้นทุน และบันทึก timeline ทั้งหมดใน transaction เดียวกัน | `ส่งของแล้ว` / `รอออก` |

ผล downstream ของ `WTO`:

- `WTO` เป็นเอกสารส่งของ/ชั่งขาออกต้นทาง แต่ไม่ใช่ movement owner ของ stock
- ตอนสร้าง `WTO` ให้เลือกสินค้าใน line ก่อน แล้วเลือก `warehouse` ของ line นั้นภายหลัง
- `warehouse` ของ `WTO` ต้อง active, อยู่ในสาขาเดียวกัน, และเป็นคลัง `RM` หรือ `FG` เท่านั้น
- stock availability ของ `WTO` เป็นราย line ตาม `สินค้า + warehouse`; ถ้ายังไม่เลือก warehouse ให้แสดงว่ายังไม่ทราบคงเหลือ แต่อย่า block การเลือกสินค้า
- ทุก line ของ `WTO` ต้องเก็บ intended warehouse ตั้งแต่ draft แต่สร้าง pending_out หลังยืนยันเท่านั้น เพื่อให้ `Sales Bill` ใช้เป็นคลังต้นทางในการตัด stock
- active pending_out ของ `WTO` หลังยืนยันต้องลด available stock ทันที เพื่อกันการยืนยัน WTO ใบอื่นเกินยอดพร้อมส่ง
- เมื่อบันทึก `WTO` สำเร็จ ยังไม่สร้าง stock movement; stock-out จะเกิดตอนบันทึก `Sales Bill Stock`
- ใช้เป็น source สำหรับ `Sales Bill` ฝั่ง stock sale
- ถ้ายังไม่ถูกนำไปออกบิล จะอยู่สถานะ `ส่งของแล้ว`
- เมื่อถูกนำไปออก `Sales Bill` แล้วอาจออกบิลเต็มจำนวนหรือบางส่วนได้ แต่ `WTO` ใบนั้นยังเป็น source ของ `SB` เดียวเท่านั้น
- ถ้าออกบิลบางส่วน ยอดที่เหลือต้องคงเป็น `pending_out` เพื่อปิดด้วย action `รับของคืน` บน WTO detail; ห้ามนำยอดค้างนั้นไปเปิด `SB` ใบอื่นแบบเงียบ ๆ
- เมื่อถูกใช้ครบต้องขยับเป็น `ออกบิลแล้ว`; ถ้ายังมี active pending_out เหลือหลังออกบิล ให้เป็น `ออกบิลแล้วบางส่วน`

## WTO Two-Loops Model

`WTO` มี 2 loop ที่ต้องแยก owner ให้ชัด:

1. `warehouse / stock loop`
   - owner: หน้า `WTI/WTO` เฉพาะส่วนเก็บ intended warehouse, แสดง stock availability, และสร้าง/release pending_out
   - draft เก็บเอกสารเท่านั้น; pending_out เริ่มตอนยืนยัน และถูก rebuild/release เมื่อแก้ไขหรือยกเลิก WTO ที่ยืนยันแล้ว
   - รับผิดชอบ `product-first line entry`, `warehouse selection per line`, stock availability per product+warehouse, active pending_out, rebuild pending_out, และ release pending_out
2. `billing / usage loop`
   - owner: หน้า `Sales Bill`
   - เกิดตอน `WTO` ถูกนำไปออก `SB`
   - รับผิดชอบ consume hold, final stock validation, stock-out ledger, `weight_ticket_usage_logs`, และสถานะ `ส่งของแล้ว -> ออกบิลแล้วบางส่วน/ออกบิลแล้ว`
   - กรณีออกบิลบางส่วน owner ของปุ่ม `รับของคืน` คือ WTO detail แต่ write endpoint ยังคงผูก audit กลับไปที่ `SB` ที่ consume pending_out นั้น

ข้อห้าม:

- ห้าม `WTO` เขียน stock ledger เอง
- ห้าม `WTO` เป็นแค่ check stock เฉย ๆ โดยไม่กันยอดไว้
- ห้าม `SB` ตัด stock จาก warehouse อื่นโดยไม่มีเหตุผล/audit ถ้า `WTO` ระบุ intended warehouse แล้ว
- ถ้ายังไม่ได้บันทึก `SB` ให้ถือว่ายังไม่เกิด stock-out ในระบบ แม้มี `WTO` แล้วก็ตาม

## List Flow / รายการใบรับ-ส่งของ

route หลัก: `/daily/weight-ticket-list`

หน้าที่ของ page นี้:

- รวมรายการ `WTI` และ `WTO`
- มี tab แยกขาเข้า/ขาออก
- filter ตามสถานะ สาขา คู่ค้า วันที่ ทะเบียนรถ และคำค้น
- row click เปิด detail page/modal ตาม implementation ปัจจุบัน
- row actions รองรับ `พิมพ์`, `แชร์`, `แก้ไข`, `ยกเลิก` ตามสิทธิ์และสถานะ

กติกา UI หลัก:

- row ทั้งแถวต้องคลิกเข้า detail ได้
- row action ต้อง `stopPropagation()`
- status filter ของ WTI และ WTO ต้องแยกชุดกัน เพราะสถานะทางธุรกิจไม่เหมือนกัน
- branch filter ต้องใช้ shared branch combobox ตาม design baseline

## Detail / Timeline Flow

บน mobile ให้แสดง product summary และยอดน้ำหนักที่จำเป็นก่อน โดยซ่อน raw lot, สิ่งเจือปน, รายการซื้อเพิ่ม และยอดอ้างอิงปลายทางไว้ในส่วน `ดูรายละเอียดรายการ` ที่ปิดไว้ตั้งต้น ผู้ใช้กดเปิดดูได้เมื่อจำเป็น; การยุบนี้เปลี่ยนเฉพาะการแสดงผลและไม่เปลี่ยน raw lines, product summary, น้ำหนัก หรือข้อมูลรูปภาพ

detail ของ WTI/WTO ต้องตอบได้ 4 เรื่องพร้อมกัน:

1. ข้อมูลเอกสารปัจจุบัน
2. รายการสินค้า/น้ำหนัก/รูป
3. downstream usage
4. timeline การเปลี่ยนแปลง

timeline ต้องครอบคลุมอย่างน้อย:

- สร้างเอกสาร
- แก้ไขเอกสาร
- ยกเลิกเอกสาร
- ถูกนำไปใช้ downstream
  - `WTI -> PB`
  - `WTO -> SB`

target rule:

- ระยะสั้น detail/timeline อาจยังอ่านจาก audit + usage facts ที่มีอยู่
- ระยะกลาง/ยาวควรแยก dedicated status/usage logs เป็น source of truth ตาม [[Document History Table Design]]

## กติกาแก้ไขและยกเลิก

### WTI

- ถ้า `WTI` ยังไม่ถูกใช้ใน `Purchase Bill` ต้องแก้ไข/ยกเลิกได้ตามสิทธิ์
- ถ้า `WTI` ถูกใช้ใน `Purchase Bill` แล้ว ต้อง lock ทันที เพราะ target flow บังคับตัดครบทั้งเอกสารในบิลเดียว
- การยกเลิกต้องไม่ลบเงียบ ต้องผ่าน status/timeline

### WTO

- ถ้า `WTO` ยังไม่ถูกใช้ใน `Sales Bill` ต้องแก้ไข/ยกเลิกได้ตามสิทธิ์
- การแก้ไข/ยกเลิก `WTO` ไม่ต้อง reverse stock เพราะ `WTO` ไม่ใช่ movement owner
- ถ้า `WTO` ถูกใช้ใน `Sales Bill` แล้ว ต้อง lock edit/cancel ทันที แม้เป็น `ออกบิลแล้วบางส่วน`; ยอด pending_out ที่เหลือต้องปิดด้วย `รับของคืน` ไม่ใช่แก้ WTO เดิม
- การยกเลิกต้องไม่ลบเงียบ ต้องผ่าน status/timeline

### หลักการร่วม

- ใช้ usage facts จริงเป็นตัวตัดสิน lock/edit/cancel
- ไม่ใช้แค่ status string อย่างเดียว
- ถ้า downstream document ถูก cancel/reverse แล้ว ต้อง recalc การ lock ของ WTI/WTO กลับจาก facts ที่ active อยู่จริง

## Mutability / Lock Rules

ให้แยก `document status` ออกจาก `mutability state` ชัดเจน

### Document status

- `WTI`: `แบบร่าง`, `รับของแล้ว`, `เสร็จสิ้น`, `ยกเลิก`
- `WTO`: `แบบร่าง`, `ส่งของแล้ว`, `ออกบิลแล้วบางส่วน`, `ออกบิลแล้ว`, `ยกเลิก`

### Mutability state

- `edit allowed`
- `cancel allowed`
- `edit locked`
- `cancel locked`

กติกา:

- ถ้าเอกสารยังไม่ถูกใช้ downstream:
  - `edit = allowed`
  - `cancel = allowed`
- ถ้าเอกสารถูกใช้ downstream แล้ว:
  - `edit = locked`
  - `cancel = locked`

mapping:

- `WTI` ถูกใช้โดย `PB` -> lock edit/cancel
- `WTO` ถูกใช้โดย `SB` -> lock edit/cancel

ข้อสำคัญ:

- lock state ต้อง derive จาก active usage facts ไม่ใช่ derive จาก status string อย่างเดียว
- ถ้า downstream document ถูก reverse/cancel สำเร็จแล้ว ต้อง recalc mutability state กลับจาก facts ที่ยัง active จริง

## Stock Reverse Rules

หัวข้อนี้อยู่ที่เอกสาร bill เพราะ target กลับมาเป็น bill-driven ตาม legacy

### Edit / Cancel WTI-WTO

- ถ้า `WTI/WTO` ยังไม่ถูกใช้ใน `PB/SB` ให้แก้ไขหรือยกเลิกเอกสารได้ตามสิทธิ์
- การแก้ไขหรือยกเลิก `WTI/WTO` ไม่ต้อง reverse stock ledger เพราะเอกสารนี้ไม่ได้สร้าง movement
- ถ้าแก้ไข `WTO` ที่ยังไม่ถูกใช้ ต้อง rebuild active hold ให้ตรง line ล่าสุดใน transaction เดียวกัน
- ถ้ายกเลิก `WTO` ที่ยังไม่ถูกใช้ ต้อง release active hold ทั้งหมด
- ถ้า `WTI/WTO` ถูกใช้ใน active `PB/SB` แล้ว ต้อง lock edit/cancel

### Edit / Cancel PB-SB ที่อ้าง WTI-WTO

- `PB` ที่อ้าง `WTI` ต้องเป็น owner ของ stock-in ledger
- `SB` ที่อ้าง `WTO` ต้อง consume hold และเป็น owner ของ stock-out ledger
- ถ้าแก้ไข `PB/SB` ต้อง reverse/rebuild movement ของ bill นั้นใน transaction เดียวกัน
- ถ้ายกเลิก `PB/SB` ต้อง reverse movement ของ bill นั้น และ release/recalc usage/status ของ `WTI/WTO`
- ถ้ายกเลิก `SB` ที่ consume hold จาก `WTO` แล้ว และยังไม่มี return-from-WTO/SB ต้อง reopen/recreate hold เพื่อให้ stock ไม่กลับไป available ให้ขายซ้ำก่อนออกบิลใหม่; ถ้า return แล้ว ให้ `SB-CANCEL` คืน stock ตรงและคง return/diff audit เดิมไว้

### Guard rail

- ถ้า `WTO` ถูกใช้ใน `SB` แล้ว ห้าม edit/cancel เพื่อไม่ให้ stock layer กับ billing layer หลุดจากกัน
- การ reverse stock ต้องอิง ledger/source movement เดิมของ `PB/SB` ไม่ใช่คำนวณใหม่แบบ best guess จาก WTI/WTO อย่างเดียว

## รูปสินค้าและรูปรถ

WTI/WTO มีรูป 2 ระดับ:

1. รูปรถระดับเอกสาร
2. รูประดับรายการสินค้า

### รูประดับรายการสินค้า

- บังคับอย่างน้อย 1 รูปต่อ line
- เป็นหลักฐานหน้างาน
- ต้องแยกจาก master product image

### Contract รูปใน detail gallery

- รูปหลักฐานเป็นข้อมูลเอกสารระดับ L5: Database เก็บ attachment metadata/storage key เป็น source of truth และ binary อยู่ใน object storage ตาม bucket/privacy policy
- รูปหลักฐาน WTI/WTO ใช้ bucket private ที่ตั้งค่าผ่าน `WEIGHT_TICKET_IMAGE_BUCKET`; DB เก็บเฉพาะ `bucket`, `storageKey`, `fileName` โดย signed URL สร้างใหม่เฉพาะ response/preview/LINE/PDF ตามสิทธิ์และอายุที่กำหนด ห้ามเก็บ bearer URL ระยะยาวหรือใช้ public URL ของรูปต้นฉบับ. ทุก read/write boundary ต้องตรวจ bucket ให้ตรงและให้ `storageKey` อยู่ใต้ namespace `attachments/` โดย reject absolute path, `\\` และ `..` segment ก่อนอ่านหรือสร้าง signed URL
- PDF ที่สร้างเพื่อส่งออกและรูปอัลบั้มที่สร้างเพื่อ LINE ใช้ bucket public แยกต่างหากผ่าน `WEIGHT_TICKET_PDF_BUCKET`; รูปอัลบั้มเป็น outbound artifact ไม่ใช่ source evidence ของเอกสาร
- ทุก entry point ของ detail gallery ทั้งรูปรถ รูปรายการสินค้า และอัลบั้มรวม รับ preview เฉพาะ canonical reference ที่มี `bucket` + `storageKey` ของ private image bucket และ signed URL thumbnail ที่สร้าง ณ เวลาอ่าน; `data:image`, URL-only, bucket อื่น และ filename-only เป็น legacy metadata ที่ unavailable จึงแสดงได้เพียงจำนวนแจ้งเตือนโดยไม่สร้าง `<img>` หรือ runtime fallback
- หน้า detail โหลด original asset เมื่อผู้ใช้เปิดดู ส่วน list/picker ใช้ thumbnail เท่านั้น; API ใช้ `private, no-store`. signed preview TTL, orphan retention และ maintenance drain batch size อ่านจาก `system_settings` และ bucket ต้องตั้งใน `system_settings` เท่านั้น; cache `31536000` ของ immutable storage key และ WebP effort `5` เป็น technical invariants ที่ตั้งชื่อ/ทดสอบไว้ ไม่ใช่ operational fallback.
- รูปที่ยังไม่ผูก ticket (`attached_ticket_id is null`) มีสิทธิ์ cleanup หลัง retention โดย maintenance drain/approved operator schedule จะ claim lease, ลบ original, thumbnail และ print derivative แล้วจึงลบ ledger row; ถ้าลบ Storage บางส่วนล้มเหลวจะคง row พร้อม error เพื่อ retry และไม่ลบ asset ที่ผูกเอกสารแล้ว. งาน print derivative รอบนี้ไม่มี cron ใหม่. `audit:weight-ticket-image-assets` ต้องผ่านโดยไม่มี malformed/legacy reference, missing original, ready-without-thumbnail หรือ orphan ledger ก่อน SIT rollout.
- รูป legacy ต้องย้ายด้วย migration/backfill ไป object storage ไม่อ่าน base64 ย้อนกลับใน runtime; focused test ครอบ 0/1/many, signed HTTPS และ payload legacy ที่ unavailable
- เพดาน 10 MB ต่อรูปใช้เฉพาะ upload contract; ตอนดาวน์โหลดไม่มีเพดานต่อรูป และรวมก่อนบีบ ZIP มี server-safety guard ไม่เกิน 100 MB เพื่อป้องกัน memory สูงผิดปกติ. ชื่อไฟล์จะ normalize extension เป็นตัวพิมพ์เล็ก เช่น `.JPG` เป็น `.jpg` โดยไม่แปลงชนิด/คุณภาพภาพ
- ตัวดูภาพหลักใช้ `object-contain` ในพื้นที่คงที่เพื่อไม่ตัดรูปแนวตั้ง และ thumbnail ใช้แถวเดียวเลื่อนซ้าย-ขวาเพื่อลดความสูงของ gallery

### Legacy attachment backfill checkpoint (2026-07-19)

- `audit:weight-ticket-image-assets` และ `backfill:weight-ticket-image-assets` ใช้ parser เดียวกันเพื่อแยก raw, pipe และ JSON `data:image` ออกจาก storage/public URL โดยไม่พิมพ์ base64, token หรือ connection string ลง report
- backfill เป็น dry-run โดย default; `--apply` ต้องระบุ rollback manifest แบบ absolute path นอก repo และตรวจว่า project ref ของ Database ตรงกับ Supabase URL ก่อนเสมอ
- รูปที่ย้ายต้องเป็น JPEG/PNG/WebP จริง ขนาด decoded ไม่เกิน 10 MB และใช้ immutable key ที่มี SHA-256 โดย hash document token แทนเลขเอกสารใน public path; Storage upload ใช้ `cacheControl=31536000`, `upsert=false` จากนั้นจึง compare-and-swap ค่า array ใน DB ภายใน transaction โดยไม่เปลี่ยน business `updated_at`/audit timeline
- ถ้า upload ผ่านแต่ DB เปลี่ยนระหว่างทาง ระบบไม่ลบ object หรือ reference เดิม แต่รายงาน CAS conflict/orphan แบบ sanitized เพื่อให้ operator ตรวจและตัดสินใจเอง
- วันที่ 2026-07-19 apply สำเร็จทั้ง dev/SIT: ย้าย JSON data URL 214 รูปไป `weight-ticket-pdfs` และ CAS-remove exact 15-byte `mock image data` 2 รายการต่อ environment โดยไม่มี failure, CAS conflict, missing key หรือ orphan; rollback manifest แยกอยู่นอก repo และไม่เปลี่ยน business `updated_at`/audit timeline
- checkpoint เดิมย้ายรูปไป bucket public ก่อนมีการแยก privacy; migration `20260806120000_split_weight_ticket_image_and_pdf_buckets.sql` จัดเตรียม `weight-ticket-images` แบบ private และคง `weight-ticket-pdfs` แบบ public. ต้องรัน `migrate:weight-ticket-image-bucket --apply --manifest=<absolute path outside repo>` แบบ dry-run/review ก่อน และยังไม่ลบ source object จนกว่าจะตรวจ reference และ rollback manifest ครบ
- post-apply audit ยืนยัน data URL, invalid reference และ known mock เป็น `0`; canonical storage-key เป็น dev `219` / SIT `218`, Storage objects เป็น dev `625` / SIT `631`, ส่วน filename-only ยังคง 23 รายการต่อ environment เพราะไม่มี binary/source mapping ให้ย้าย จึงแสดง unavailable ตาม contract โดยไม่เดา path
- WTI/WTO attachment ใน #151 เป็น L5 original ที่โหลดเฉพาะ detail/preview; batch ปัจจุบันเพิ่ม ledger/thumbnail worker แยกและ migration จะ mark `ready` เฉพาะเมื่อพบ thumbnail object จริง ส่วน original ที่มีแต่ thumbnail หายจะเป็น `queued` เพื่อ regenerate และ malformed/legacy/missing-original จะ block rollout พร้อม audit report

### รูปสินค้าใน product picker

- มาจาก `products.image_storage_key` และ `products.image_thumbnail_storage_key`
- โหลดผ่าน `/api/daily/weight-tickets/products`
- ใช้ thumbnail เพื่อให้ picker เบาและ render เร็ว
- ไม่ต้องรอเลือกสาขาหรือคู่ค้าก่อนจึงเห็นรูปสินค้า

## Print และ Share

### Print

- `WTI` และ `WTO` ต้องพิมพ์ได้จากหน้า list และ detail
- เอกสารสถานะ `แบบร่าง` พิมพ์ได้ทั้ง WTI และ WTO แม้ยังไม่มีรายการสินค้า/เต๋า เพื่อใช้เป็นเอกสารตรวจทานภายใน; การพิมพ์ไม่ถือเป็นการยืนยันรับ/ส่งของ และไม่บังคับรูปแบบข้อความสถานะบนใบพิมพ์
- ใช้ข้อมูลบริษัทจาก `ข้อมูลบริษัท (สำหรับใบพิมพ์)`
- HTML print popup ต้องใช้ `Noto Sans Thai` จาก `/fonts/` ของแอปและ system fallback เท่านั้น ไม่โหลด stylesheet หรือ font จากภายนอก เพื่อให้ผ่าน CSP เดียวกับแอปโดยไม่เปลี่ยน layout หรือสูตรน้ำหนักของใบพิมพ์
- ใช้ wording แยกตามทิศทางเอกสาร
  - `WTI` = ใบรับสินค้า / ผู้ขาย / ผู้รับของ
  - `WTO` = ใบส่งของ / ลูกค้า / ผู้ส่งของ / ผู้รับของ

### WTO print subtotal rule (2026-08-05)

- `WTO` ที่มีรายละเอียดสินค้าจริงเพียง 1 แถว ให้แสดงแถวนั้นโดยตรงและไม่สร้างแถบสีเขียว `product-total`; ถ้าสินค้ากลุ่มเดียวกันมีมากกว่า 1 แถว ให้คงแถบสรุปสีเขียวไว้
- แถว `รวมทั้งสิ้น` ของเอกสารยังต้องแสดงเสมอ และพฤติกรรมการพิมพ์ของ `WTI` ไม่เปลี่ยนแปลง

What is what: raw detail row คือรายการน้ำหนักจริงของสินค้า ส่วน `product-total` คือแถวสรุปของกลุ่มสินค้า. Why it has to be like this: กลุ่มที่มีข้อมูลเดียวไม่ต้องมีแถวซ้ำให้ผู้ใช้อ่าน แต่กลุ่มที่มีหลายรายการยังต้องมีแถบสรุปเพื่อเห็นยอดรวมของสินค้าอย่างชัดเจน.

### Share

- list page ต้องมี action `แชร์`
- current share message ใช้ข้อความสั้นเพื่อส่งต่อ เช่น เลขเอกสาร คู่ค้า สาขา วันเวลา น้ำหนักสุทธิ และลิงก์ detail
- share เป็น convenience action ไม่เปลี่ยนสถานะเอกสาร

รายละเอียดเรื่อง printable contract ระดับระบบดูที่ [[Printable Documents]]

## จุดตัดกับ Purchase Flow

`WTI` ใช้ใน Purchase Flow เฉพาะกรณี `Stock`

handoff rule:

- `WTI` เป็น source document ของ `Purchase Bill Stock`
- `Purchase Bill` ต้องดึงจาก product summary เป็นหลัก
- target ใหม่เป็น `WTI 1 ใบ -> PB 1 ใบ`
- `WTI` ต้องถูกใช้ครบใน `PB` เดียว ห้าม split ไปหลาย `PB`
- `PB` แบบ Stock ใน flow นี้ต้องเลือก `WTI` ได้ 1 ใบเป็น source หลัก แต่ภายใน PB เดียวยัง split allocation ระดับสินค้าไปหลาย `PO Buy` หรือ `Spot Buy` ได้
- `PB` เป็น movement owner: เมื่อ save `PB Stock` ต้องเขียน stock-in ledger โดยอ้าง `WTI`
- หลัง save/cancel `PB` ระบบต้อง recalc usage และ status ของ `WTI`

รายละเอียดเชิงซื้อให้ดู [[Purchase Flow]] และ [[Purchase Bills Page Flow]]

## จุดตัดกับ Sales Flow

`WTO` ใช้ใน Sales Flow สำหรับ stock delivery / stock sale

handoff rule:

- `WTO` เป็น source document ของ `Sales Bill`
- `Sales Bill` ต้อง allocate usage ต่อสินค้า/summary ให้ครบตามกติกาหน้าขาย
- target ใหม่เป็น `WTO 1 ใบ -> SB 1 ใบ`
- `WTO` ต้องไม่ split ไปหลาย `SB`; ถ้า `SB` ขายไม่ครบ น้ำหนักที่เหลือต้องคงเป็น active `pending_out` และปิดด้วย `รับของคืน` / loss จาก WTO detail
- `SB` เป็น movement owner: เมื่อ save `SB Stock` ต้อง consume hold และเขียน stock-out ledger โดยอ้าง intended warehouse จาก `WTO`
- หลัง save/cancel `SB` ระบบต้อง recalc usage และ status ของ `WTO`

รายละเอียดเชิงขายให้ดู [[Sales Flow]] และ [[Sales Bills Page Flow]]

## ประวัติการแก้ไขและผลกระทบ stock

WTI/WTO ใช้ timeline ระดับเอกสารร่วมกัน แต่ผลกระทบ stock ไม่เหมือนกัน:

| ส่วน | WTI / ใบรับของ | WTO / ใบส่งของ |
|---|---|---|
| บันทึกเอกสาร | เก็บหลักฐานรับของ น้ำหนัก รูป และ summary เพื่อใช้เปิด Purchase Bill | เก็บหลักฐานส่งของ น้ำหนัก รูป และ summary เพื่อใช้เปิด Sales Bill |
| ผลต่อ stock ตอนบันทึก | ไม่เขียน stock ledger และไม่กัน stock | สร้าง/ปรับ `pending_out` ใน `stock_holds` เพื่อกันของเป็น `รอออก` |
| ราคาต้นทุนเฉลี่ย | ไม่ snapshot cost ในเอกสาร WTI | snapshot ราคาต้นทุนเฉลี่ยของ pending_out ตอน confirm หรือเมื่อมีส่วนเพิ่ม/เต๋าใหม่หลัง confirm |
| ประวัติ field ที่แก้ | เก็บใน `weight_ticket_status_logs.meta.changes` | เก็บใน `weight_ticket_status_logs.meta.changes` เหมือนกัน |
| ประวัติ pending_out/cost | ไม่มี เพราะ WTI ไม่กัน stock | เก็บ immutable audit ใน `weight_ticket_pending_out_events` แยกจาก `stock_holds` |
| downstream หลัก | Purchase Bill เป็น owner ของ stock-in ledger | Sales Bill เป็น owner ของ stock-out ledger โดย consume pending_out |

รายละเอียดที่ถูกเก็บใน `weight_ticket_status_logs.meta.changes` เป็น before/after ของการแก้ไขเอกสาร ไม่ใช่ stock movement และไม่ใช่ตัวเลข current stock:

- ระดับเอกสาร: เลขที่เอกสาร, สาขา, ผู้ขาย/ลูกค้า, ทะเบียนรถ, หมายเหตุ, รูปเอกสาร, น้ำหนักรวม, หักภาชนะ, หักสิ่งเจือปน, น้ำหนักสุทธิ
- ระดับรายการ/เต๋า: เพิ่มรายการ, ลบรายการ, สินค้า, คลัง, น้ำหนักรวม, หักภาชนะ, ประเภทการหัก, ค่าหัก, หักสิ่งเจือปน, น้ำหนักสุทธิ, สิ่งเจือปน, รูปสินค้า, หมายเหตุรายการ

การแสดงผลใน detail/timeline:

- timeline หลักยังเป็น `weight_ticket_status_logs`
- ถ้าเป็น WTI หรือ event ที่ไม่มี pending_out/cost ให้แสดง timeline ระดับเอกสารตามปกติ
- ถ้าเป็น WTO และ event นั้นมี pending_out/cost audit ให้แสดงปุ่ม `ดูรายการเปลี่ยนแปลง`; เมื่อขยายจะแสดงตารางเดียวที่รวม pending_out/cost row และสรุป field change ที่เกี่ยวข้องในคอลัมน์ `รายการเปลี่ยนแปลง`
- ไม่ต้องมีตาราง field-detail แยกด้านล่าง เพราะคอลัมน์ `รายการเปลี่ยนแปลง` ในตารางเดียวกันต้องบอกให้ชัดอยู่แล้ว เช่น `เปลี่ยนคลัง: FG สมุทรสาคร -> RM สมุทรสาคร` หรือ `เปลี่ยนน้ำหนักสุทธิ: 30.00 กก. -> 25.00 กก.`
- ห้าม fallback เพื่อเดาว่ามีอะไรเปลี่ยนจากข้อมูลปัจจุบัน ถ้าต้องแสดงประวัติ ต้องมาจาก `weight_ticket_status_logs.meta.changes` หรือ `weight_ticket_pending_out_events` ที่ถูกเขียนใน transaction นั้น

Implementation separation checkpoint 2026-06-30:

- route/API ยังเป็น URL เดิมเพื่อไม่กระทบ list/detail/create/edit เดิม
- field-level edit audit ถูกแยกเป็น `apps/next/src/lib/server/weight-ticket-write/edit-audit.ts`
- API URL ยังไม่แยกเป็น `/wti` และ `/wto`; route เดิม delegate internal write decisions ไปที่ `apps/next/src/lib/server/weight-ticket-write/handlers.ts`
- `handlers.ts` แยก decision กลางที่ route เคย branch เอง เช่น party snapshot, warehouse resolution, stock validation, และ pending_out create/edit side effect
- WTI-specific write guard อยู่ใน `apps/next/src/lib/server/weight-ticket-write/wti.ts` เช่น supplier eligibility
- WTO-specific write guard อยู่ใน `apps/next/src/lib/server/weight-ticket-write/wto.ts` เช่น customer eligibility และ WTO-only impurity restriction
- WTO delivered edit ใช้ release/rebuild pending_out ทั้งชุดใน transaction เดียว: route เก็บ hold เดิมเพื่อเขียน `edit_release` event หลัง release, แล้วสร้าง hold ใหม่ด้วยต้นทุนเฉลี่ยปัจจุบันและเขียน `edit_rebuild` event. ไม่ preserve cost เดิมและไม่ใช้ Delta; policy นี้อยู่ใน route/stock-holds write path และต้อง lock เมื่อมี Sales Bill usage
- `apps/next/src/lib/server/weight-ticket-write/type-guards.ts` เป็นตัวประสานตาม `values.type` เพื่อให้ route ไม่ต้องมี WTI/WTO guard กระจายหลายจุด
- stock/cost side effect ของ WTO ยังอยู่ใน `stock-holds.ts` และ `weight-ticket-pending-out-events.ts`; WTI ไม่เรียก path เหล่านี้

## สถานะเป้าหมายของ WTI/WTO

สถานะของ WTI/WTO ต้องแยกจากสถานะของเอกสาร downstream:

| เอกสาร | ชุดสถานะ user-facing | ไม่ใช้สถานะนี้ใน target |
|---|---|---|
| `WTI` | `แบบร่าง`, `รับของแล้ว`, `เสร็จสิ้น`, `ยกเลิก` | `รับบางส่วน`, `ออกบิลบางส่วน` |
| `WTO` | `แบบร่าง`, `ส่งของแล้ว`, `ออกบิลแล้วบางส่วน`, `ออกบิลแล้ว`, `ยกเลิก` | `ส่งบางส่วน` |

หลักการ:

- `draft` เป็นสถานะเอกสารที่บันทึกจริงสำหรับ WTI/WTO และยังใช้สร้างบิลปลายทางไม่ได้
- WTI เปลี่ยน `draft -> received` เมื่อกด `ยืนยันรับของ`; WTO เปลี่ยน `draft -> delivered` เมื่อกด `ยืนยันส่งของ`
- `WTI` เป็น all-or-nothing document ใน target write path: 1 ใบต้องถูกใช้ครบใน downstream PB เดียว
- `WTO` เป็น one-SB source: 1 ใบใช้กับ `SB` เดียว แต่ `SB` อาจขายบางส่วนได้; partial ของ WTO หมายถึงยังมี active `pending_out` รอรับคืน/บันทึก loss ไม่ใช่ยอดรอออกบิลใบถัดไป
- สถานะ partial ใช้ได้กับ `POB/POS` และใช้กับ `WTO` เฉพาะกรณี `ออกบิลแล้วบางส่วน`; `WTI` ไม่มี partial target status
- lock edit/cancel ต้อง derive จาก active usage facts (`WTI -> PB`, `WTO -> SB`) ไม่ใช่ derive จาก status string อย่างเดียว

### WTI

| raw status | label ที่ user เห็น | ความหมาย |
|---|---|---|
| `draft` | `แบบร่าง` | บันทึกแล้วแต่ยังไม่ยืนยันรับของ และยังใช้ใน PB ไม่ได้ |
| `received` | `รับของแล้ว` | ยังไม่ถูกใช้ใน PB |
| `billed` | `เสร็จสิ้น` | ถูกใช้ใน PB ครบแล้ว |
| `cancelled` | `ยกเลิก` | เอกสารถูกยกเลิก |

### WTO

| raw status | label ที่ user เห็น | ความหมาย |
|---|---|---|
| `draft` | `แบบร่าง` | บันทึกแล้วแต่ยังไม่ยืนยันส่งของ และยังใช้ใน SB ไม่ได้ |
| `delivered` หรือ equivalent | `ส่งของแล้ว` | ยังไม่ถูกใช้ใน SB |
| `partially_billed` | `ออกบิลแล้วบางส่วน` | ถูกใช้ใน SB แล้วบางส่วนและยังมี active pending_out รอรับคืน/บันทึก loss |
| `billed` | `ออกบิลแล้ว` | ถูกใช้ใน SB ครบแล้ว |
| `cancelled` | `ยกเลิก` | เอกสารถูกยกเลิก |

## ตารางสถานะและปุ่มที่แสดงบน WTI/WTO

ปุ่ม `รายละเอียด` มีทุกสถานะ และเปิด read-only detail/modal. ปุ่มที่เหลือขึ้นกับสถานะร่วมกับสิทธิ์ผู้ใช้และข้อเท็จจริงว่าเอกสารถูกใช้กับ PB/SB แล้วหรือยัง ดังนั้นคำว่า `มีสิทธิ์` ในตารางหมายถึงต้องผ่านทั้งสองเงื่อนไขนั้นด้วย.

| ประเภท/สถานะ | ปุ่มที่ควรเห็น | ปุ่มที่ไม่ควรเห็น |
|---|---|---|
| WTI/WTO `draft` | `รายละเอียด`, `พิมพ์`, `ยืนยันรับของ`/`ยืนยันส่งของ` เมื่อมีรายการครบ, `แก้ไข`, `ยกเลิก` | `แชร์`, `เปิดบิล`, `รับของคืน` |
| WTI `received` | `รายละเอียด`, `พิมพ์`, `แชร์`, `แก้ไข` (ถ้ามีสิทธิ์และยังไม่มี PB), `เปิดบิลซื้อ` (ถ้ามีสิทธิ์), `ยกเลิก` (ถ้ามีสิทธิ์) | `ยืนยันรับของ`, `รับของคืน` |
| WTI `billed` | `รายละเอียด`, `พิมพ์`, `แชร์` | `แก้ไข`, `ยกเลิก`, `เปิดบิลซื้อ`, `รับของคืน` |
| WTI `cancelled` | `รายละเอียด` | `พิมพ์`, `แชร์`, `แก้ไข`, `ยกเลิก`, `เปิดบิลซื้อ`, `รับของคืน` |
| WTO `delivered` | `รายละเอียด`, `พิมพ์`, `แชร์`, `แก้ไข` (ถ้ามีสิทธิ์และยังไม่มี SB), `เปิดบิลขาย` (ถ้ามีสิทธิ์), `ยกเลิก` (ถ้ามีสิทธิ์) | `ยืนยันส่งของ` |
| WTO `partially_billed` | `รายละเอียด`, `พิมพ์`, `แชร์`, `รับของคืน` (เมื่อยังมีน้ำหนัก/รายการคงเหลือ) | `แก้ไข`, `ยกเลิก`, `เปิดบิลขาย` |
| WTO `billed` | `รายละเอียด`, `พิมพ์`, `แชร์` | `แก้ไข`, `ยกเลิก`, `เปิดบิลขาย`, `รับของคืน` |
| WTO `cancelled` | `รายละเอียด` | `พิมพ์`, `แชร์`, `แก้ไข`, `ยกเลิก`, `เปิดบิลขาย`, `รับของคืน` |

`WTI` ไม่มี `partially_billed`; สถานะนี้เป็นของ WTO เท่านั้น. `แชร์` หมายถึงการเปิด dialog เพื่อ `แชร์เองผ่าน LINE` หรือ `ส่งเข้ากลุ่มหลัก` และห้ามแสดง/รับคำขอสำหรับ `draft` และ `cancelled`.

## Use Case Map

| Use Case | ชื่อกรณี | ครอบคลุมในเอกสารนี้ | สถานะ |
|---|---|---|---|
| `UC-WT-01` | สร้าง WTI เพื่อรับของเข้า | ใช่ | ครบระดับ business flow |
| `UC-WT-02` | สร้าง WTO เพื่อส่งของออก | ใช่ | ครบระดับ business flow |
| `UC-WT-03` | ค้นหา/กรอง WTI/WTO ใน list page | ใช่ | ครบระดับ page flow |
| `UC-WT-04` | เปิด detail และดู timeline | ใช่ | ครบระดับ page flow |
| `UC-WT-05` | ใช้ WTI ไปออก PB แล้ว recalc status | ใช่ | handoff covered |
| `UC-WT-06` | ใช้ WTO ไปออก SB แล้ว recalc status | ใช่ | handoff covered |
| `UC-WT-07` | พิมพ์ WTI/WTO | ใช่ | ครบระดับ page flow |
| `UC-WT-08` | แชร์ WTI/WTO | ใช่ | ครบระดับ page flow |

## เรื่องที่ยังเป็น follow-up

| เรื่อง | เหตุผล |
|---|---|
| dedicated `weight_ticket_status_logs` / `weight_ticket_usage_logs` | ให้ timeline/read model แยกจาก audit log รวม |
| policy รายละเอียดของ partial unlock หลัง downstream cancel/reversal | ต้อง finalize จาก usage facts ของ PB/SB ทุกกรณี |
| image cleanup/orphan policy ของรูปหน้างาน | ต้องกำหนด lifecycle ตอน edit/cancel/replace ให้ชัด และตรวจ source object เก่าหลังแยก private image bucket |
| report/reconciliation และ aging เอกสาร WTI/WTO แยกหน้า | flow หลักมีแล้ว แต่รายงานตรวจสอบและ aging ต้องอิง [[Document Aging Policy]] เพิ่ม |

## Remaining Implementation Gaps

หลัง normalize สถานะ WTI/WTO แล้ว งานที่ยังต้องตาม implementation มี 5 กลุ่ม:

| กลุ่มงาน | ต้องทำอะไร | เหตุผล |
|---|---|---|
| `SB edit/cancel reversal` | เมื่อมี write path edit/cancel ของ `SB` ต้อง reverse ledger และ reopen/release hold/usage facts ให้ถูกตาม return state | create path consume hold แล้ว; cancel ก่อน return ต้อง reopen hold แต่ cancel หลัง return ต้องคืน stock ตรงด้วย `SB-CANCEL` |
| `Stock balance drilldown` | เพิ่ม drilldown ให้เห็นว่า `on hold` มาจาก `WTO` ใบไหน line ไหน | ให้ผู้ใช้ตรวจที่มาของยอดจองได้จากหน้าสต็อก |
| `Usage / timeline QA` | พิสูจน์ detail/timeline ว่าเห็น downstream usage ของ `WTI -> PB` / `WTO -> SB` ครบทุกกรณี | ใช้ lock/edit/cancel และ audit จาก facts จริง |
| `Status labels` | ตรวจ list/detail/filter/print/downstream reference ให้ใช้ status canonical: WTI ไม่มี partial, WTO มี `ออกบิลแล้วบางส่วน` เฉพาะ active pending_out หลัง partial SB และต้องปิดด้วย `รับของคืน` | ป้องกัน UI กลับไปใช้ legacy wording |
| `Reports` | ทำ aging/reconciliation สำหรับ WTI/WTO ค้างออกบิล, legacy partial-billed debt, และ status ไม่ตรง usage | ใช้ตรวจข้อมูลเก่าและ migration debt |

## Backlog ที่ควรทำต่อ

- [x] เพิ่มปุ่ม `กลับไปหน้ารายการ` บนหน้า create/edit
- [x] เพิ่มปุ่ม `กลับไปหน้ารายการ` ใน footer fixed action bar ข้างปุ่มบันทึก
- [x] ปรับ UX/API ของ `WTO` ให้เลือกสินค้าใน line ก่อน แล้วเลือกคลัง `RM/FG` ต่อ line พร้อมแสดงคงเหลือและ validate stock จาก `สินค้า + คลัง`
- [x] เพิ่ม pending_out/reservation สำหรับ `WTO`: create/rebuild/release pending_out และแสดง `คงเหลือจริง / รอออก / พร้อมส่ง`
- [x] เติม `SB Stock` ให้ consume pending_out แล้วเขียน stock-out ledger โดยอ้าง `WTO` และ intended warehouse ตาม bill-driven target ใน create path
- [x] เติม downstream trace baseline ใน detail ให้เห็นว่า `WTI/WTO` ถูกใช้กับ `PB/SB` ไหน ใช้ไปเท่าไร และเหลือเท่าไร
- [x] แยก `weight_ticket_status_logs` และ `weight_ticket_usage_logs` ออกจาก generic audit log
- [x] ล็อก type บนหน้า create/edit และ API ไม่ให้เปลี่ยน `WTI <-> WTO`
- [ ] ปิดกติกา lock/edit/cancel ทุก edge case โดยอิง usage facts จริง ไม่อิง status string อย่างเดียว โดยเฉพาะ downstream edit/cancel/reversal
- [ ] ตรวจและ unify label/status ทุก surface: detail, print, export, และ downstream references
- [ ] กำหนด lifecycle ของรูปรถและรูปรายการสินค้า: replace, remove, cancel, orphan cleanup
- [ ] ตรวจ branch-scope และ permission ของ WTI/WTO APIs และ read models ให้ครบ
- [ ] ทำ reconciliation/report สำหรับ `WTI/WTO ค้างออกบิล`, aging bucket, legacy partial-billed debt, และ `status ไม่ตรง usage`
- [ ] harden print/share wording, signature labels, และ header company info
- [ ] ทำ browser QA จริงทั้ง desktop/mobile ครบ flow create/edit/cancel/detail/print/share และ handoff ไป `PB/SB`
## การจัดเรียงและการแสดงผลตามมาตรฐาน AcexPOS (Sorting & Table Styling)

หน้าจอรายการใบรับ-ส่งของ (`/daily/weight-ticket-list`) ได้รับการปรับปรุงตามมาตรฐาน AcexPOS UI:
1. **การเรียงลำดับข้อมูล (Sorting)**:
   - **ความจำเป็นทางธุรกิจ**: ผู้ใช้จำเป็นต้องสามารถจัดเรียงลำดับใบรับ-ส่งสินค้าจำนวนมากตามมิติต่างๆ เช่น วันที่, เลขที่เอกสาร, น้ำหนัก, คู่ค้า หรือสถานะ เพื่อให้ค้นหา ตรวจสอบ และจับคู่บิลได้สะดวกรวดเร็ว
   - **การทำงานร่วมกันระหว่าง Client และ Server**:
     - ฝั่ง Client (ใน `WeightTicketListPageClient.tsx`): ใช้คอมโพเนนต์ `<SortHeader>` ครบถ้วนทุกคอลัมน์หลักบน Desktop พร้อมส่งคำขอ `sortBy` และ `sortDir` ไปยัง API
     - ฝั่ง Server (ใน `src/lib/server/weight-tickets.ts`): ฟังก์ชัน `weightTicketOrderBy` จะแปลงฟิลด์เรียงลำดับที่มาจาก Client ไปเป็นคิวรีเรียงลำดับระดับฐานข้อมูลผ่าน Prisma โดยตรง (เช่น จัดเรียงตาม `doc_no`, `party_name`, `net_weight`, `container_deduction_weight`, `deduct_weight`, `branches.name` ฯลฯ)
2. **การแสดงผลแบบตารางและขอบตาราง (Table Borders)**:
   - ใช้ขอบตารางบางเบา `border-slate-200` ครอบรอบตาราง Desktop และแบ่งแถวด้วย `divide-y divide-slate-100` ร่วมกับเอฟเฟกต์โฮเวอร์ `hover:bg-slate-50` เพื่อความสวยงามและสบายตาตามข้อกำหนด AcexPOS (หลีกเลี่ยงขอบเส้นสีดำเข้มหรือสีเด่นชัด)
   - หน้าจอเดสก์ท็อปรองรับคอลัมน์แบบยืดหดได้ (Resizable Columns) และแสดงผลปุ่ม "คืนค่าเดิมตาราง" (Reset Widths) เมื่อผู้ใช้เริ่มลากเส้นปรับแต่งขนาด

## เมนูที่ใช้ใน flow นี้

| Step | เมนู | Route |
|---|---|---|
| สร้าง/แก้ไขใบรับ-ส่งของ | `รายการประจำวัน > ชั่งสินค้า / รับ-ส่งของ` | `/daily/weight-tickets` |
| ค้นหารายการใบรับ-ส่งของ | `รายการประจำวัน > รายการใบรับ-ส่งของ` | `/daily/weight-ticket-list` |
| ออกบิลรับซื้อจาก WTI | `รายการประจำวัน > บิลรับซื้อ` | `/purchase/bills` |
| ออกบิลขายจาก WTO | รายการประจำวัน > บิลขาย | /sales/bills |

## การปรับปรุงและบำบัดระบบ WTI/WTO (มิถุนายน 2026)

ในการปรับปรุงรอบนี้ ได้มีการแก้ไขและอัปเกรดระบบ WTI/WTO ใน 5 ประเด็นสำคัญตาม Backlog เพื่อแก้ไขความสับสนและอำนวยความสะดวกให้ผู้ใช้งานหน้างาน:

1. **การแสดงจำนวนเต๋าแทนจำนวนรูปภาพในหน้าฟอร์ม (NSERP-84)**:
   - **แนวคิดการออกแบบ**: แต่เดิมในแถบรายการสินค้าด้านซ้ายของ Modal ใบรับ-ส่งของแสดงคำว่า "X รูป" ซึ่งทำให้ผู้ใช้งานสับสน เนื่องจากผู้ใช้งานหน้างานสนใจนับจำนวนรอบชั่งสินค้า/กองสินค้า ("เต๋า" หรือ Lot) มากกว่าจำนวนไฟล์รูปภาพหลักฐาน
   - **การแก้ไข**: เปลี่ยนการแสดงผลในแถบรายการด้านซ้ายจาก `{getLineEvidenceImages(line).length} รูป` ไปเป็นจำนวนเต๋าชั่งจริงผ่านฟังก์ชันคำนวณจำนวน Lot `{calculateRealLotSummary(line, form.lines).lotCount} เต๋า`

2. **การรวมรายการสินค้าที่มี 1 เต๋าเป็นบรรทัดสีเขียวบรรทัดเดียวในหน้าเอกสาร PDF ของ WTI (NSERP-83)**:
   - **แนวคิดการออกแบบ**: สำหรับรายการสินค้าที่มีการชั่งน้ำหนักเพียงเต๋าเดียว (1 Lot) การแสดงผลในหน้าเอกสาร PDF ไม่จำเป็นต้องแยกแถวรายการสินค้ากับแถวประวัติเต๋า เพราะทำให้เอกสารยาวโดยไม่จำเป็น ควรยุบข้อมูลขึ้นไปแสดงในบรรทัด Highlight สรุป (บรรทัดสีเขียว) เป็นบรรทัดเดียวได้เลย และนำข้อมูลสิ่งเจือปน/โน้ตไปรวบแสดงในคอลัมน์รายละเอียด (Description)
   - **การแก้ไข**: ปรับตรรกะในฟังก์ชัน `buildPrintWeightRows` โดยตรวจสอบว่ารายการสินค้ามีจำนวน Lot จริงเพียง 1 รายการ (`realLotLines.length === 1`) หรือไม่ หากใช่ จะทำการข้ามแถวเต๋าย่อยและยุบยอดน้ำหนักทั้งหมดขึ้นไปที่แถวสินค้าหลัก (`product-total` class ซึ่งจะแสดงพื้นหลังสีเขียวพรีเมียม) พร้อมนำรายการสิ่งเจือปนและโน้ตมาต่อข้อความแสดงในคอลัมน์รายละเอียด
   - **ขอบเขตปัจจุบัน**: กติกาแถบสีเขียวนี้เป็นของ `WTI` เท่านั้น; `WTO` จะแสดงแถวข้อมูลเดิมเมื่อกลุ่มสินค้ามีรายละเอียดเดียว และแสดงแถวสรุปเมื่อมีหลายรายละเอียดตามกติกา WTO print subtotal rule ด้านบน

3. **การเรียงลำดับสินค้าตามลำดับการชั่งน้ำหนักจริง (NSERP-82)**:
   - **แนวคิดการออกแบบ**: เอกสารใบรับ-ส่งของหน้ารายละเอียด และหน้าเอกสาร PDF พิมพ์ใบรับสินค้า ควรแสดงรายการสินค้าเรียงตามลำดับที่ผู้ใช้ชั่งน้ำหนักจริง (Weighing/Insertion Order) เพื่อให้ง่ายต่อการตรวจสอบย้อนกลับและเทียบกับใบชั่งรถกระดาษ ไม่ควรจัดเรียงลำดับสินค้าตามตัวอักษรโดยอัตโนมัติ
   - **การแก้ไข**: นำตรรกะการเรียงลำดับตามชื่อตัวอักษรออกในขั้นตอนการประมวลผลข้อมูล (ในไฟล์ `weight-tickets.ts` ฝั่งเซิร์ฟเวอร์) และกำหนดให้กลุ่มข้อมูลของคีย์สินค้าเรียงลำดับตามเวลา/ลำดับที่ชั่งน้ำหนักจริงในระบบแทน

4. **การค้นหาฟิลด์สิ่งเจือปนผ่านการพิมพ์ข้อความ (NSERP-81)**:
   - **แนวคิดการออกแบบ**: รายการสิ่งเจือปนมีจำนวนมาก ทำให้การคลิกหาจาก Dropdown ทั่วไปไม่สะดวก ฟิลด์นี้จึงต้องเป็น Search Combobox ที่พิมพ์ค้นหาได้ ทว่าระบบเดิมมีบั๊กเมื่อผู้ใช้พิมพ์ตัวอักษรค้นหาแล้วบิล/ฟอร์มถูกเรนเดอร์ใหม่ ค่าที่พิมพ์อยู่จะถูกล้าง (Reset) ทันทีเพราะ parent เคลียร์ค่าค้นหา
   - **การแก้ไข**: ปรับปรุงคอมโพเนนต์ `SearchCombobox` ให้มีการใช้ `lastEmittedValueRef` เพื่อจดจำค่าล่าสุดที่เลือก/พิมพ์ และตรวจสอบก่อนเคลียร์ค่า ทำให้ผู้ใช้สามารถพิมพ์ค้นหาชื่อสิ่งเจือปนและเลือกได้อย่างถูกต้องราบรื่น

5. **การแยกโกดังออกจากคลังอย่างชัดเจน**:
   - **แนวคิดการออกแบบ**: ทั้งใบรับของ WTI และใบส่งของ WTO ต้องระบุโกดังหน้างานที่หัวเอกสาร ส่วน WTO ต้องเลือกคลัง stock `RM/FG` เพิ่มเติมในแต่ละ line เพื่อใช้จองและตัด stock
   - **การแก้ไข**: ใช้ `godownName`/`weight_tickets.godown_name` เป็นข้อมูลบังคับของหัว WTI/WTO และใช้ `warehouseId`/`weight_ticket_lines.warehouse_id` เฉพาะคลัง stock ของ WTO ห้ามผูกโกดังกับ `warehouses` master

## การส่งแจ้งเตือน LINE ของใบรับ-ส่งของ (LINE Notification Workflow)

เอกสารนี้สรุป **สถานะจริงของระบบ** ณ มิถุนายน 2026 หลังจาก implement เสร็จ
(implementation plan เดิมอยู่ที่ [[WTI-WTO LINE Notification Implementation Plan]])

### เป้าหมาย

เมื่อผู้ใช้ยืนยัน `WTI` หรือ `WTO` แล้ว ระบบจึงส่งสรุปเข้า LINE group ที่ตั้งค่าไว้

ลิงก์ PDF และรูปอัลบั้มใน LINE ใช้ public URL จาก `WEIGHT_TICKET_PDF_BUCKET` ซึ่งเป็น outbound artifact bucket แยกจาก source evidence image bucket. Flex Message แสดงปุ่ม `ดู PDF` สำหรับเปิดอ่าน และ `ดาวน์โหลด PDF` สำหรับดาวน์โหลดไฟล์โดยตรง; ปุ่ม `เปิดในระบบ` ยังเป็นลิงก์ที่ต้อง login ตามสิทธิ์เดิม. รูปหลักฐานต้นฉบับยังอยู่ใน private `WEIGHT_TICKET_IMAGE_BUCKET` และใช้ signed URL ชั่วคราวเฉพาะตอนสร้าง PDF/ส่ง LINE เท่านั้น.
พร้อม Flex Message ที่มี:

- ข้อมูลหัวเอกสาร (เลขที่, ผู้ขาย/ลูกค้า, สาขา, น้ำหนักสุทธิ)
- ปุ่ม `เปิด PDF + รูป` โดย PDF ต้องให้หน้าแรกเป็นใบพิมพ์ WTI/WTO แบบ A4 ที่ตรงกับตัวพิมพ์และจบใน 1 หน้าเมื่อเป็นเอกสารความหนาแน่นปกติ จากนั้นต่อหน้า 2+ เป็นอัลบั้มรูปหลักฐาน; LINE ยังส่ง album/image attachment แยกได้เพื่อให้เห็นรูปในแชททันที
- ปุ่ม `เปิดในระบบ`

ใช้ **LINE Messaging API + Flex Message** (ไม่ใช้ LINE Notify ที่ปิดบริการแล้ว)

### ขอบเขต Google Sheets

WTI และ WTO ไม่ sync ไป Google Sheets แล้ว ทั้ง header-only auto-save, การบันทึก draft,
การแก้ไข, การยืนยัน, การยกเลิก และการอัปเดตหลังสร้าง PDF สำหรับ LINE จะไม่เรียก webhook
Google Sheets. ระบบยังคงบันทึกข้อมูลในฐานข้อมูล ส่ง LINE และเก็บ audit/timeline ตาม flow
ปกติ โดยไม่มี Google Sheets เป็น downstream side effect.

### Trigger Points ทั้ง 3 ทาง

| ทาง | เงื่อนไข | สถานะจริง | ไฟล์ |
|---|---|---|---|
| **Manual** ปุ่ม `แชร์ → ส่งเข้ากลุ่มหลัก` | ผู้ใช้กดเองหลังยืนยันเอกสารแล้ว | ✅ ทำงาน (force=true, execute ทันที); UI/API ปฏิเสธ `draft` และ `cancelled` | `api/daily/weight-tickets/[id]/notify-line/route.ts` |
| **Auto-send หลังยืนยัน** | `LINE_AUTO_SEND_WTI`/`LINE_AUTO_SEND_WTO = 'true'` | ✅ ทำงานหลัง `draft -> received/delivered` เท่านั้น | `api/daily/weight-tickets/[id]/route.ts` |
| **Worker drain** | กดปุ่ม `⚙️ เรียกใช้งาน Worker` ในหน้า admin/line-settings | ✅ ใช้สำหรับ retry/pending jobs ที่ execute ล้มเหลว | `api/admin/line-jobs/route.ts` action=process |

### สถานะที่พิมพ์และส่ง LINE ได้

| ประเภท | สถานะ | พิมพ์/PDF | แชร์/ส่ง LINE เอง | Auto-send หลังยืนยัน |
|---|---|---|---|---|
| WTI | `draft` | ไม่ได้ | ไม่ได้ | ไม่ได้ |
| WTI | `received` | ได้ | ได้ | ได้ เมื่อ `LINE_AUTO_SEND_WTI=true` ตอนเปลี่ยนจาก draft |
| WTI | `billed` | ได้ | ได้ | ไม่ยิงซ้ำจากการเปิด PB |
| WTI | `cancelled` | ไม่ได้ | ไม่ได้ | ไม่ได้ |
| WTO | `draft` | ไม่ได้ | ไม่ได้ | ไม่ได้ |
| WTO | `delivered` | ได้ | ได้ | ได้ เมื่อ `LINE_AUTO_SEND_WTO=true` ตอนเปลี่ยนจาก draft |
| WTO | `partially_billed` | ได้ | ได้ | ไม่ยิงซ้ำจากการออก SB/คืนของ |
| WTO | `billed` | ได้ | ได้ | ไม่ยิงซ้ำจากการออก SB |
| WTO | `cancelled` | ไม่ได้ | ไม่ได้ | ไม่ได้ |

การพิมพ์และการส่ง LINE ใช้ PDF เอกสารเดียวกัน: หน้าแรกเป็นใบพิมพ์ A4 และหน้าถัดไปเป็นอัลบั้มรูปหลักฐาน. ถ้าการ resolve รูป private, สร้าง PDF หรืออัปโหลด PDF/อัลบั้มล้มเหลว job ต้องเป็น `failed` และไม่ส่งข้อความ LINE ที่ขาดหลักฐาน; การสร้าง/แก้ไขเอกสารหลักยังไม่ rollback เพราะ notification เป็นงานหลัง transaction.

### ⚠️ ข้อจำกัดสำคัญที่ต้องเข้าใจ

#### 0. PDF ใน LINE/Storage คือใบพิมพ์พร้อมหน้าอัลบั้มรูป

PDF ที่ `notifyWeightTicketLine` สร้างและอัปโหลดขึ้น Storage ต้องเริ่มด้วยเอกสารธุรกิจสำหรับพิมพ์: header บริษัท, ข้อมูลคู่ค้า, รายการน้ำหนัก, สรุป, ลายเซ็น และ footer ต้องอยู่ใน A4 ตาม template ใบพิมพ์เดียวกับระบบหน้า list/detail. ส่วนใบพิมพ์หลักสร้างหน้า `1..N` ตามจำนวนรายการจริง: หน้าต่อเนื่องใช้พื้นที่ที่เคยเป็นกรอบล่างเพิ่มรายการในตารางให้ได้สูงสุด 20 แถว มี footer ตารางว่างเท่าที่เหลือ และแสดงเฉพาะ `( มีต่อหน้า X / Continued on Page X ➔ )` แทนลายเซ็น โดยไม่ใส่ยอดหรือกรอบสรุปจริงระหว่างทาง; หน้าหลักสุดท้ายเท่านั้นมีสรุป หมายเหตุ และลายเซ็นจริง. หลังจากหน้าหลักทั้งหมดจึงต่อ photo album จากรูปหลักฐานของเอกสารเดียวกัน เพื่อให้ไฟล์ PDF เดียวเปิดดูได้ครบทั้งใบชั่งและรูปหน้างาน. LINE ยังสามารถส่ง album/image path แยกได้เพื่อให้คนในแชทเห็นรูปทันที.

ไฟล์ PDF และภาพ album ใน bucket นี้เป็น outbound derivatives ที่สร้างเพื่อการแจ้งเตือนและการดาวน์โหลด โดย `weight_ticket_notification_logs.pdf_storage_bucket/pdf_storage_key/pdf_url` และ `artifact_storage_keys` เป็น audit reference ของ artifact ที่ส่งสำเร็จ หรือ artifact ที่ cleanup ล้มเหลวและต้องกู้คืน. Log ของ target ที่ fail/409 และ cleanup สำเร็จจะไม่เก็บ key ของไฟล์ที่ถูกลบแล้ว. ถ้าไม่มี target ใดยืนยันการรับข้อความ ระบบลบเฉพาะ artifact ที่สร้างใน request นั้นแบบ request-scoped; ถ้าลบไม่ได้จะคืน `LINE_ARTIFACT_CLEANUP_FAILED` พร้อมเก็บ key สำหรับ manual recovery. Artifact ที่ส่งสำเร็จแล้วไม่ถูกลบจาก flow นี้จนกว่าจะมี retention policy/cleanup job ที่อนุมัติชัดเจน และทุก cleanup ต้องลบเฉพาะไฟล์ outbound ที่ไม่ถูกอ้างอิง ห้ามลบ private source evidence หรือ audit log ตามอายุไฟล์โดยตรง.

#### 0.1 ลำดับรูปในเอกสารพิมพ์และ PDF

หน้าพิมพ์, PDF ใน LINE และภาพอัลบั้มต้องใช้ลำดับรูปจาก contract เดียวกัน: `vehicle_image_names` (รูปรถ) มาก่อนรายการรวมใน `image_names` และต้อง deduplicate ด้วย bucket/storage key เดียวกัน. ดังนั้นรูปรถจะแสดงเป็นรูปที่ 1 ใต้หัวข้อ `ใบรับสินค้า (รูปถ่ายแนบ)` หรือ `ใบส่งของ (รูปถ่ายแนบ)` เมื่อมีรูป โดยไม่แสดงซ้ำแม้ read model จะมีรูปรถอยู่ทั้งสองรายการ.

กรอบรูปอัลบั้มใช้สัดส่วน 4:3 และต้องแสดง source image แบบ `contain` เพื่อรักษาอัตราส่วนเดิม ไม่ยืดหรือ crop รูปแนวตั้ง/แนวนอน; พื้นที่ว่างในกรอบเป็นผลที่ยอมรับได้เพื่อให้เห็นหลักฐานเต็มรูป. เอกสาร A4 แบ่ง 6 รูปต่อหน้าเป็นตาราง 2 คอลัมน์ × 3 แถวสำหรับพื้นที่อ่านและเลขหน้าที่ถูกต้อง ส่วนภาพ album ที่ส่งแยกใน LINE ยังใช้ chunk 8 รูปได้เพราะไม่ถูกจำกัดด้วยพื้นที่กระดาษ A4.

#### 1. Auto-send ทำงานทันทีหลังยืนยัน

ระบบจะ **enqueue แล้ว execute ทันที** หลังยืนยันเอกสาร (ไม่รอ worker) แต่จะไม่ส่งตอนสร้างหรือแก้ไข Draft:

```ts
// api/daily/weight-tickets/[id]/route.ts (PATCH confirm)
if (autoSendConfig?.value === 'true') {
  const enqueueResult = await enqueueNotificationJob(mapped.documentNo, { requestedBy, force: false })
  for (const job of enqueueResult.jobs) {
    try {
      await executeNotificationJob(job.id, { force: false })  // ✅ ส่งออกจริงทันที
    } catch (err) {
      console.error('[weight-ticket-auto-send] failed to execute job:', job.id, err)
    }
  }
}
```

ผลทางธุรกิจ:
- เปิด `LINE_AUTO_SEND_WTI=true` → แจ้งเตือนเข้า LINE หลังผู้ใช้กด `ยืนยันรับของ`
- Draft ยังแก้ไขได้ ไม่เข้าคิว LINE และปุ่มแชร์จะยังไม่แสดง
- ถ้า execute ล้มเหลว job จะกลายเป็น `status='failed'` และสามารถ retry ผ่าน
  Worker ในหน้า admin/line-settings หรือปุ่ม `🔄 ยิงใหม่` ในแท็บ Outbox
- การสร้างเอกสาร **ไม่ rollback** ถ้าแจ้งเตือนล้มเหลว (error ถูก catch เท่านั้น)
- Worker drain ยังมีประโยชน์สำหรับ retry งานที่ execute ล้มเหลว หรือส่งเข้าคิวจาก
  แหล่งอื่น (เช่น webhook bot command `/retry`)

#### 2. `line_groups` เป็น dead code ใน jobs path

ระบบมี routing engine 2 ตัวซ้อนทับกัน:

| Engine | อ่านตาราง | ใช้จริงไหม |
|---|---|---|
| `resolveLineTargetsForWeightTicket` (ใหม่) | `line_targets` + `line_notification_rules` | ✅ **ใช้จริง** ทุก path (auto + manual routing) |
| `notifyWeightTicketLine` inline logic (เก่า) | `line_groups` | ❌ **dead code** — จะถูกเรียกก็ต่อเมื่อ `targetId` ว่าง แต่ jobs layer ส่ง `targetId` มาเสมอ |

ผล: การแก้ไข routing ควรแก้ที่ `line_targets` + `line_notification_rules` เท่านั้น
การแก้ `line_groups` จะไม่มีผลกับการส่งจริง

### Workflow การส่งจริง (เรียงตามลำดับ)

```mermaid
flowchart TD
  A["ผู้ใช้บันทึก WTI/WTO เป็น Draft"] --> A2["ผู้ใช้ตรวจสอบและยืนยันรับของ/ส่งของ"]
  A2 --> B{auto-send เปิดอยู่ไหม}
  B -- "ใช่ (LINE_AUTO_SEND=true)" --> C["enqueueNotificationJob<br/>resolveLineTargetsForWeightTicket<br/>→ targets จาก line_targets + rules"]
  B -- "ไม่" --> D["รอผู้ใช้กด แชร์ → ส่งเข้ากลุ่มหลัก"]
  C --> F["executeNotificationJob ทันที<br/>(ไม่รอ worker ตามแนวทาง A)"]
  D --> F2["enqueueNotificationJob force=true<br/>+ executeNotificationJob ทันที"]
  F --> I["notifyWeightTicketLine<br/>generate PDF → upload Storage<br/>→ sendLinePush Flex Message"]
  F2 --> I
  F -- "execute ล้มเหลว" --> R["job status=failed<br/>พร้อม retry ผ่าน Worker หรือปุ่มยิงใหม่"]
  I --> J{ส่งสำเร็จไหม}
  J -- "สำเร็จ" --> K["job status=sent<br/>line_request_id บันทึก<br/>+ weight_ticket_notification_logs audit"]
  J -- "ล้มเหลว" --> L["job status=failed<br/>attempt_count +1<br/>มี retry ได้ตาม max_attempts"]
```

### หลักการสำคัญ (Fail-Safe)

- **การสร้างเอกสาร WTI/WTO ต้องไม่ rollback** เพียงเพราะ LINE/PDF fail
  (auto-send error ถูก catch และ log เท่านั้น ไม่ทำลาย transaction เอกสาร)
- การส่งซ้ำกันได้ด้วย `X-Line-Retry-Key` (dedup ฝั่ง LINE)
- มี `line_notification_attempts` เก็บประวัติ attempt ทุกครั้ง
- มี `weight_ticket_notification_logs` เป็น audit ระดับเอกสาร

### การตั้งค่าที่เกี่ยวข้อง

ตั้งในหน้า `/admin/line-settings` แท็บ Credentials:

| Setting key | หน้าที่ |
|---|---|
| `LINE_CHANNEL_ACCESS_TOKEN` | token ส่งบอท (DB-first, env-fallback) |
| `LINE_CHANNEL_SECRET` | verify webhook signature |
| `LINE_DEFAULT_TARGET_ID` | target สำรองกรณีไม่มี rule ตรง |
| `LINE_AUTO_SEND_WTI` | เปิด auto-send สำหรับ WTI (enqueue เท่านั้น) |
| `LINE_AUTO_SEND_WTO` | เปิด auto-send สำหรับ WTO (enqueue เท่านั้น) |
| `LINE_NOTIFY_TEXT_TEMPLATE_WTI/WTO` | text message template (ใช้จริง ไม่ใช่ Flex template) |
| `GOOGLE_SHEETS_WEBHOOK_URL` | Google Apps Script Webhook สำหรับซิงก์ WTI/WTO; เว้นว่างเพื่อปิดการเชื่อมต่อ |

Google Sheets เป็นตัวเชื่อมต่อเสริม ไม่ใช่ source of truth ของเอกสาร:

- row ใน DB เป็นค่าหลัก: บันทึก URL ว่างเป็น `null` เพื่อปิด connector; ใช้ environment fallback เฉพาะระบบที่ยังไม่เคยมี row นี้
- ส่งข้อมูลเมื่อสร้าง แก้ไข ยืนยัน หรือยกเลิก WTI/WTO
- action ที่ส่งคือ `create` ตอนสร้าง, `update` ตอนแก้ไข/ยืนยัน และหลังส่ง LINE สำเร็จ, `cancel` ตอนยกเลิก
- เมื่อส่ง LINE สำเร็จอย่างน้อยหนึ่งเป้าหมาย ระบบซิงก์อีกครั้งพร้อม PDF URL ล่าสุด
- เป็น synchronous best-effort timeout 5 วินาที ไม่มี retry อัตโนมัติ; หากล้มเหลวจะเขียน server log แต่ไม่ rollback เอกสาร ERP และไม่ทำให้การส่ง LINE ที่สำเร็จแล้วล้มเหลวตาม

หมายเหตุ: text template ทำงานจริง แต่ Flex Message Template ในแท็บ Templates
ถูกซ่อนชั่วคราวเพราะยังไม่เชื่อมกับ flow ส่งจริง (ดู [[LINE Notification Control Center Ultimate Plan]])

### การจัดการกลุ่ม/เป้าหมาย

ดูรายละเอียดเต็มที่ [[LINE Notification Control Center Ultimate Plan]] หัวข้อ Target Auto-Sync Flow

สรุปสั้น:
- กลุ่มใหม่เข้าระบบทาง **webhook** (`/api/line/webhook`) เมื่อบอทถูกเชิญ/ได้รับข้อความ
- เปลี่ยน token → **auto-sync** รีเฟรชชื่อ/รูป/สถานะกลุ่มเดิมทันที
- กดปุ่ม `🔄 ซิงค์กลุ่มจาก LINE` ในแท็บ Targets เพื่อ sync ด้วยมือ
- LINE API ไม่มี endpoint "list ทุกกลุ่ม" → กลุ่มที่บอทยังไม่เคยได้รับ event ดึงมาไม่ได้

### Follow-up ที่ควรทำต่อ (ตามสถานะจริง)

| เรื่อง | เหตุผล |
|---|---|
| ทำความสะอาด `line_groups` dead code | เลิกใช้ใน jobs path แล้ว ควร migrate routing ที่เหลือไป `line_targets` แล้วลบตาราง/โค้ดเก่า |
| เชื่อม Flex Message Template เข้า flow ส่งจริง | ตอนนี้ `buildFlexMessage` แบบ hardcoded ไม่ได้ดึงจาก `line_message_templates` |
| เพิ่ม webhook handler `memberJoined`/`follow` | ตอนนี้รับแค่ `join`/`message`/`leave` |
| พิจารณา cron/queue สำหรับงานที่เยอะมาก | auto-send แนว A execute ทันทีใน request — เหมาะกับโหลดปกติ แต่ถ้ามีการบันทึกเอกสารเป็นจำนวนมากพร้อมกันอาจต้องใช้ queue จริง |

## Form architecture checkpoint (2026-07-12)

ฟอร์มสร้าง/แก้ไข WTI และ WTO ใช้ข้อมูลหัวเอกสาร รายการเต๋า น้ำหนัก
สิ่งเจือปน รูปภาพ และหมายเหตุร่วมกัน แต่มี source field ต่างกันดังนี้:

| ประเภท | ส่วนเฉพาะของฟอร์ม | เหตุผล |
|---|---|---|
| WTI | เลือกสินค้า โดยไม่เลือกคลัง stock-out | WTI เป็นการรับสินค้าเข้า ยังไม่กัน `pending_out` จากคลัง |
| WTO | เลือกสินค้าและคลัง พร้อมแสดง on hand / hold / available | WTO ต้องระบุ stock source ที่ใช้กัน `pending_out` |

โครงสร้างหน้าแยกเป็น:

```text
WeightTicketsPageClient (tab router)
├── WeightTicketWtiForm
│   └── WeightTicketFormCore(type=WTI, locked)
└── WeightTicketWtoForm
    └── WeightTicketFormCore(type=WTO, locked)
```

`WeightTicketWtiForm` และ `WeightTicketWtoForm` เป็น entry point แยกของแต่ละ flow
ส่วน `WeightTicketFormCore` เก็บ implementation ที่เหมือนกันจริง ได้แก่ state lifecycle,
รายการเต๋า, สูตรน้ำหนัก, attachment state, validation และ save orchestration เพื่อไม่ให้
business rule ถูกทำสำเนาแล้วเปลี่ยนไม่พร้อมกัน

การลบรูปหลักฐานใช้ `WeightTicketAttachmentGrid` ร่วมกันทุกตำแหน่ง (รูปรถ, รูปเต๋า,
และรูปสิ่งเจือปน) จึงต้องเปิด confirmation กลางก่อนเปลี่ยน attachment state. เมื่อกด
`ไม่ลบ` state และรูปที่เห็นต้องคงเดิม; เมื่อกด `ลบรูปภาพ` จึงตัดรูปออกจาก payload ที่จะ
ถูกบันทึกภายหลัง. การยืนยันนี้ไม่เปลี่ยน API, permission, หรือ contract การบันทึกเอกสาร.

การเปลี่ยนสาขา, สินค้า, สิ่งเจือปน, สินค้าที่ปนมา หรือประเภทการหักที่ทำให้คลัง, เต๋า,
รายการซื้อเพิ่ม หรือค่าหักที่กรอกแล้วถูกล้าง ต้องเปิด confirmation กลางก่อนเช่นกัน. ถ้ายัง
ไม่มีข้อมูลย่อยที่ต้องทิ้ง ระบบเปลี่ยนค่าได้ทันที; ถ้ากด `ไม่เปลี่ยน` state เดิมต้องคงอยู่ และ
ถ้ากดยืนยันจึงเรียก mutation เดิมเพียงครั้งเดียว. กติกานี้ป้องกัน draft สูญหายโดยไม่เปลี่ยน
payload, permission, timeline หรือ ledger ของ WTI/WTO.

ตัวเลือกของ WTI/WTO ใช้ presentation ตามจำนวนข้อมูลจริง: ถ้ามีไม่เกิน 4 รายการให้คง
dropdown รูปแบบเดิม แต่ถ้ามากกว่า 4 รายการให้เปิด option-picker dialog ซ้อนอยู่ใน form
dialog. กติกานี้ใช้กับสาขา ผู้ขาย/ลูกค้า สินค้า คลัง สิ่งเจือปน สินค้าที่ปนมา และประเภท
การหัก โดยไม่ผูกกับชื่อ field หรือจำนวนข้อมูลที่ hardcode ไว้ล่วงหน้า.

บนมือถือ picker เป็น bottom sheet สูงไม่เกิน viewport และบน desktop เป็น modal กึ่งกลาง
ขนาดจำกัด; พื้นที่รายการเป็น scroll container ของ picker โดยตรง จึงใช้ wheel, trackpad และ
touch drag ได้โดยไม่ชน scroll lock ของ form dialog. เมื่อเลือกหรือปิด picker ต้องคืน focus
ไปยัง field เดิมโดยไม่เปิด picker ซ้ำ. การเปลี่ยนนี้ไม่เปลี่ยน options API, payload,
permission, save scope หรือ source of truth ของข้อมูล.

ภายใน product source ยังแยก presentation เป็น `WeightTicketWtiFormSection` และ
`WeightTicketWtoFormSection`; WTO section เพิ่ม warehouse และ stock availability
ส่วน WTI ไม่มี stock-out source การสลับ tab จะ mount form คนละตัว และถ้ามีข้อมูลที่ยัง
ไม่บันทึกจะต้องยืนยันก่อนล้างข้อมูล

รอบนี้เป็น structural refactor เท่านั้น ไม่มีการเปลี่ยน business rule, สูตรน้ำหนัก,
stock validation หรือ API contract

ลำดับ refactor ถัดไปคือแยก vehicle attachments, line attachments และ preview dialog
ออกจาก container โดยใช้ attachment state contract เดิม

## บันทึกก่อนเพิ่มสินค้า/เต๋า (2026-08-05)

เมื่อผู้ใช้กด `เพิ่มสินค้า` ครั้งแรก ระบบจะแยก event เป็นสองส่วน: เพิ่มแถวว่างใน client
state ทันที และส่ง header-only draft แบบ background ด้วย `saveScope=header` เพื่อให้ได้
document id โดยไม่ต้องรอ response ก่อนเปิดช่องกรอกสินค้า. การส่ง header-only ห้ามส่ง line
และห้ามตรวจหรือสร้าง `pending_out`.

เมื่อมีรายการเดิมที่กรอกครบแล้วและผู้ใช้กด `เพิ่มเต๋า` ระบบจะเพิ่มแถวใหม่ใน client state
ทันที แล้วส่งข้อมูล draft ของส่วนที่มีอยู่เป็น background event (`saveScope=document`)
เพื่อคงข้อมูลก่อนหน้า. ถ้า background save กำลังทำงานอยู่ event เพิ่มสินค้า/เพิ่มเต๋ายังคง
แสดงผลได้ แต่จะไม่เปิด save stage ซ้ำ; การกด action เดิมถี่ภายในช่วง debounce เดียวกัน
จะไม่สร้างแถวซ้ำ. การแก้ไขข้อมูลใน line ใหม่ยังอยู่ใน local dirty state จนกดบันทึกตาม
validation gate ของฟอร์ม.

ทั้ง WTI และ WTO draft จึงเป็นเพียงเอกสารที่บันทึกแล้ว ยังไม่ยืนยันการรับ/ส่งของและไม่
สร้างการจอง `pending_out`. การบันทึก/แก้ไข/ยืนยัน/ยกเลิก WTI และ WTO ไม่ส่งข้อมูลไป
Google Sheets อีกต่อไป; ข้อมูลหลักอยู่ในฐานข้อมูลและ audit/timeline ของระบบ. เฉพาะการกด
`ยืนยันส่งของ` ของ WTO เท่านั้นที่ตรวจ stock และสร้าง reservation/pending-out ใน transaction
เดียวกัน.

## การแก้ไขร่วมกันหลายผู้ใช้ใน draft (2026-08-07)

เมื่อมีผู้ใช้หลายคนเปิดใบ WTI/WTO เดียวกัน realtime จะ broadcast หลัง server persist ทั้งการเพิ่ม/แก้/ลบเต๋า โดยใช้ `deleted_lines` แยกสำหรับการลบ แล้วดึงข้อมูลล่าสุดมา merge โดยคง
ข้อมูลที่ผู้ใช้ปัจจุบันกำลังแก้ไว้. baseline สำหรับการตรวจ conflict จึงต้องแยกเป็นรายเต๋า:

Realtime event ต้องส่งขอบเขตการเปลี่ยนแปลงจาก server แยกเป็น `lineIds` ของรายการที่ยังมีอยู่และถูกสร้าง/แก้จริง, `deletedLineIds` ของรายการที่ถูกลบ และ `changedHeaderFields` ของหัวเอกสารที่เปลี่ยนจริง. หน้าฟอร์มจะแสดงป้าย "มีข้อมูลใหม่จากผู้ใช้อื่น" เฉพาะ `id` ของรายการที่อยู่ใน response ล่าสุดเท่านั้น: เต๋าแสดงที่เต๋า สิ่งเจือปนแสดงที่ child และรายการสินค้าแสดงที่ product line โดยไม่อนุมานแจ้งเตือนขึ้นไปยัง parent หรือแสดงข้อความรวมซ้ำ. การเปลี่ยนสถานะยืนยัน/ยกเลิกไม่มี `changedHeaderFields` จึงไม่ถูกตีความเป็น conflict ของหัวเอกสาร.

- เต๋าที่ผู้ใช้ปัจจุบันแก้หรือลบ คง baseline และ version เดิมไว้ เพื่อให้การแก้เต๋าเดียวกัน
  ถูกตรวจและตอบ `409 Conflict` อย่างถูกต้อง
- เต๋าที่ผู้ใช้นี้ไม่ได้แก้ ใช้ข้อมูลล่าสุดจาก server เป็น baseline ใหม่ รวมถึงกรณี remote
  เพิ่ม แก้ หรือลบเต๋า เพื่อไม่ให้การบันทึกคนละเต๋ากลายเป็น conflict ปลอม
- header ที่ผู้ใช้กำลังแก้คง baseline เดิม ส่วน header ที่ไม่ได้แก้รับค่าล่าสุดจาก server

ผลคือผู้ใช้สองคนสามารถทำงานคนละเต๋าและบันทึกได้โดยไม่ทับกัน และถ้าแก้ persisted line เดียวกัน
ผู้ที่ commit ล่าสุดเป็นค่าที่เชื่อถือได้ตาม LWW. การยืนยัน WTO ที่มีผลต่อ stock และการแก้ WTO
ที่ `delivered` ยังคงใช้ transaction และ guard เดิม ไม่ใช้ realtime เป็นแหล่งยืนยัน stock.

ตั้งแต่ 2026-08-15 การส่ง `save_changes` ต้องมี baseline ของ line ที่เป็น persisted identity
ครบทั้ง `collaborationBaseLineIds` และ `collaborationBaseLineVersions` และ key ของสองชุด
ต้องตรงกัน. หากข้อมูล baseline ไม่ครบ หรือเป็น section แต่ไม่ระบุ `sectionLineIds` server
จะตอบ `400` และไม่ใช้การลบแล้วสร้าง line ใหม่แทน เพราะการทำเช่นนั้นจะทำลาย persisted line ID ที่ผู้ใช้อื่นกำลังอ้างถึง.
ก่อนส่ง realtime notice client จะเทียบ fingerprint ของ line กับ baseline แล้ว
ส่งเฉพาะ line ที่เปลี่ยนจริงหรือถูกลบจริง; event ที่เข้าระหว่าง save/reload จะถูกรวมไว้และ
ประมวลผลหลังงานปัจจุบันเสร็จ เพื่อไม่ทิ้งการเปลี่ยนแปลงหรือแจ้งรายการที่ไม่เกี่ยวข้อง.

ทุก existing update/delete ต้อง lock และอ่านแถวปัจจุบันใน transaction เดียวกันเสมอ. สำหรับ
draft line การตรวจ baseline ใช้ระบุ write set เท่านั้น แล้ว commit ล่าสุดชนะและลบแบบ idempotent;
ไม่ตอบ `409` เพียงเพราะ version หรือ `updated_at` ของ line เปลี่ยน. สำหรับ header และ WTO ที่
`delivered` ยังคงตรวจ `collaborationBaseUpdatedAt`/`version` และตอบ `409` ก่อนเขียนเมื่อข้อมูล
ที่มี guard เปลี่ยนแล้ว. ข้อมูลหัวเอกสารและคู่ค้าที่อ่านจากแถวที่ล็อกต้องมีค่าตาม contract และ
audit ต้องใช้ค่าชุดเดียวกับที่กำลังเขียนจริง หาก source เดิมขาดข้อมูลบังคับให้ fail closed ไม่
เติมค่าจาก request เก่า, snapshot อื่น หรือค่าเดา.

ตั้งแต่ 2026-08-16 line ที่ถูกสร้างจากฟอร์มจะเก็บ `client_line_id` ซึ่งเป็น UUID จาก client
ไว้คู่กับ persisted line เพื่อรองรับกรณี PATCH สำเร็จแต่ response หายหรือถูก retry. ก่อน merge
ทุก update/delete server จะอ่าน mapping นี้จากแถวที่ล็อก แล้วแปลง UUID เป็น `weight_ticket_lines.id`
จริง โดยไม่ใช้เลขเต๋าที่แสดงบนหน้าจอเป็น identity. ดังนั้นการลบซ้ำจึงเป็น idempotent และถ้า line
ถูกผู้ใช้อื่นลบไปก่อนแล้วจะไม่ถูกสร้างกลับจากฟอร์มเก่า. Migration ของคอลัมน์และ unique index
ต้อง apply ก่อนเปิดใช้ code batch นี้ใน environment ใด.

## การ submit แยกตาม section (2026-08-07)

หนึ่ง section หมายถึงสินค้าแม่หนึ่งรายการพร้อมเต๋าลูก สิ่งเจือปน และรายการซื้อเพิ่มที่อยู่
ใต้สินค้าเดียวกัน. ปุ่ม `บันทึกสินค้านี้` และ `บันทึกสิ่งเจือปนนี้` ส่งเฉพาะ line record
ที่เปลี่ยน/เพิ่มจริงด้วย `saveScope=section`, `sectionLineIds` และ changed/deleted write set;
contract จะ reject write set ที่อยู่นอก section หรือระบุ changed line แต่ไม่ส่ง line/deletion
ของรายการนั้น. server ตรวจว่าไม่ข้ามสินค้า อ่าน section ล่าสุดจากแถวที่ lock แล้ว merge line
ที่ไม่ได้เปลี่ยนก่อน validate/persist. รายการของผู้ใช้อื่นที่อยู่นอก section จะถูกเก็บไว้และ
สรุปน้ำหนัก/stock ของเอกสารยังคำนวณจากข้อมูลทั้งใบ. จึงให้คนหนึ่ง submit เต๋าสินค้า A
ขณะที่อีกคนแก้เต๋าสินค้า B ได้ โดยไม่ใช้ response ของ section A มาแทนที่ draft ของ B.

สำหรับเอกสารใหม่ response ของ header-only save ต้องคืน `id`/`documentNo` และ UI แสดง
เลขเอกสารทันที. ค่า ticket ที่ server คืนนี้เป็น identity สำหรับ section save ถัดไป แม้
หน้าเดิมจะเปิดมาโดยยังไม่มี `ticketId`. เมื่อ section มี line ID ชั่วคราว server ต้องคืน
`lineIdMap` ที่ระบุ client line ID ไปยัง persisted DB line ID โดยตรง แล้ว client remap
line, parent/impurity relation, validation state และ dirty state ก่อน merge response.
ทั้ง server และ client ต้องแทน section ณ ตำแหน่งเดิมของเอกสาร ห้ามย้ายสินค้าที่บันทึกไป
ต้นหรือท้ายรายการ และ section save ห้ามลบ line ของสินค้าอื่นที่ไม่ได้อยู่ใน request.
เหตุผลคืออีกอุปกรณ์ต้อง GET แล้วเห็นสินค้าได้ทันทีหลัง `บันทึกสินค้านี้` และการตอบกลับของ
server ต้องไม่ทำให้ line ที่กำลังแก้หายหรือถูกสร้างซ้ำ.

ปุ่มบันทึกทั้งเอกสารยังคงไว้สำหรับ final save และ header เพราะใช้เป็น safety net สำหรับ
การตรวจข้อมูลรวมทั้งใบ; section save เป็นทางเลือกสำหรับการทำงานร่วมกันระหว่างกรอก draft.
WTO ที่ยืนยันส่งของแล้วไม่อนุญาต section save เพราะต้องคำนวณและตรวจ stock ทั้งใบใน
transaction เดียวกัน.

บน mobile เมื่อผู้ใช้เปิดรายละเอียดเต๋าอยู่แล้วกด `บันทึกสินค้านี้` และ server บันทึกสำเร็จ
โดยไม่มีการแก้ไขเพิ่มระหว่าง request ระบบจะยุบเฉพาะเต๋าที่กำลังเปิดและกลับไปมุมมองสินค้า
โดยไม่ปิดหน้าสินค้าทั้งชุด. Desktop และการบันทึกจากมุมมองสินค้าโดยตรงยังคง behavior เดิม.

## Transaction query contract ของการสร้างและแก้ไข (2026-08-20)

Transaction ของ WTI/WTO ใช้ PostgreSQL connection เดียว ดังนั้น relation read ที่อยู่ภายใน
interactive transaction ต้องอ่านเป็น query ที่ `await` ต่อเนื่อง ห้ามใช้ relation `include`
ที่อาจ fan-out query หรือ `Promise.all` กับ `Prisma.TransactionClient`. Create, edit, delete,
confirm และ cancel ใช้ `readWeightTicketInTransaction()` ร่วมกันเพื่ออ่าน header, คู่ค้า,
summary, lines, stock holds, products และ warehouses ตามลำดับ และตรวจข้อมูลที่ relation
หายแบบ fail-closed.

เหตุผลคือการอ่านข้อมูลให้ครบก่อนคืน response ต้องยังอยู่ใน transaction เดียวกับการเขียน
และต้องไม่ทำให้ `pg@9` รับ query ซ้อนบน connection เดียว. ส่วน read หลัง transaction ที่ใช้
`PrismaClient` แบบ pool เช่น usage counts ยังขนานได้ตามปกติ. Realtime `created` เป็น
invalidation event จึงไม่ใช้ `lineIds` เป็นจำนวนรายการในฐานข้อมูล; client จะโหลดข้อมูลล่าสุด
จาก API อีกครั้ง.
