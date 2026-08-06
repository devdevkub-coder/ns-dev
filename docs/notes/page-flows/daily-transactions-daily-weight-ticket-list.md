---
title: รายการใบรับ-ส่งของ Page Flow
tags:
  - page-flow
  - menu
status: accepted-baseline
updated: 2026-08-05
route: /daily/weight-ticket-list
---

# รายการใบรับ-ส่งของ Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Daily Transactions |
| Route | `/daily/weight-ticket-list` |
| Page | รายการใบรับ-ส่งของ |
| Current Next | accepted code baseline |

## Canonical References

[[WTI-WTO Flow]], [[Purchase Flow]], [[Sales Flow]], [[Stock Ledger and Stock Balance]]

## Flow Baseline

list/detail/create link สำหรับ WTI/WTO; WTI/WTO เป็น evidence/usage control ไม่ใช่ stock ledger movement owner

### WTO Pending Out And Average Cost Snapshot Decision

User decision updated on 2026-07-11: WTO draft/save must not reserve stock. The first confirm action validates current availability, creates `pending_out`, locks average cost, and owns the per-scale cost history plus product-level weighted average cost summary used by Sales Bill.

- `Draft` / saved-but-not-confirmed WTO stores document data only. It must not create `pending_out`, appear as `รอออก`, or reduce available stock.
- The first `Confirm` rechecks current available stock and creates active `pending_out` together with its average-cost snapshot in one transaction.
- First `Confirm` locks the current average cost for each scale/line pending_out portion at confirmation time. This snapshot becomes the cost source for later Sales Bill stock-out/COGS.
- After every confirm or edit-save that affects WTO pending_out, WTO recomputes and stores/exposes the product-level weighted average cost summary from all active scale/line portions for that SKU: `sum(active qty x per-scale unit_cost_snapshot) / sum(active qty)`.
- After confirm, edit uses a delta rule:
  - unchanged scale/line keeps the existing pending_out row/portion and existing average-cost snapshot;
  - decreased scale/line releases only the decreased portion from `pending_out` back to on-hand/available stock and keeps the existing average-cost snapshot for the remaining portion;
  - edited scale/line with changed product, warehouse, net qty, or material stock fields closes/releases the old pending_out portion and creates a new portion with the current average cost at save time;
  - increased quantity on an existing scale creates a new or adjusted pending_out portion only for the increase and snapshots the current average cost at that save time, while the unchanged old portion keeps the old snapshot;
  - new scale/SKU creates new pending_out and snapshots the current average cost at that save time;
  - removed scale/SKU releases its remaining pending_out back to on-hand/available stock.
- If one SKU has old confirmed scales, edited scales, and newly added scales, the durable model is multiple pending_out rows/portions so each scale/portion keeps its own average-cost snapshot. Do not overwrite the old snapshot for already-confirmed unchanged quantity.
- WTO must keep enough history to audit each edit: document-level status/audit snapshot plus pending_out event snapshots with `source_line_no`, `weight_ticket_line_id` when available, status, qty, unit cost snapshot, value snapshot, and cost snapshot timestamp/source/note.
- `stock_holds` is the operational stock-side table for current/closed pending_out portions. It is not the document audit trail. WTO document history must be written to and read from `weight_ticket_pending_out_events` so old events are immutable and do not change when a stock hold later gets released, consumed, or rebuilt.
- UI may show one combined average cost for the same SKU by weighted average: `(old active qty x old snapshot cost + edited/new active qty x new snapshot cost) / total active qty`. The audit detail must still preserve the old, edited, and new pending_out portions so the weighted result is traceable.
- Sales Bill must consume the WTO-prepared pending_out portions and cost summary/snapshots and write `stock_ledger.value_out` from those snapshots, not recalculate the old portion from current WAC at SB time.
- No runtime fallback is allowed for cost: if a pending_out portion has no average-cost snapshot, Sales Bill consume, stock return/loss, and any COGS movement must fail and require confirming/fixing the WTO cost snapshot first.

### WTO Cost Snapshot Display

- Main list `/daily/weight-ticket-list` should not show cost by default because it is a fast scanning surface and cost is sensitive.
- WTO detail/modal should show cost snapshot on the product breakdown table for users allowed to see stock/sales cost:
  - product summary row: weighted average cost and pending_out value, labeled to users as `มูลค่ารอส่ง`;
  - line/portion row: cost snapshot used by that confirmed pending_out portion; draft WTO has no pending_out row.
- Runtime detail update: the detail modal from `/daily/weight-ticket-list` shows the current WTO average-cost snapshot in the main product breakdown table at product-summary level and real-scale/line level. There is no separate current pending_out table; audit rows are shown only from timeline expansion and come from `weight_ticket_pending_out_events`, not live `stock_holds`.
- WTO detail modal (opened from the list, including `?detail={docNo}&type=WTO` deep links) must merge pending_out/cost audit into the document timeline:
  - timeline events that changed pending_out or cost snapshot show a collapsed `ดูรายการเปลี่ยนแปลง` control;
  - expanding the event shows source scale/line, product, warehouse, qty, unit cost snapshot, value snapshot, status, snapshot time/source/note, held time, closed/consumed time, and reference document;
  - edit events must label the row-level change as `เพิ่มเต๋า` for new scales or `แก้ไขเต๋าเดิม` for existing scale changes; existing scale changes must show whether the quantity increased or decreased with before/after qty and signed delta, for example `แก้ไขเต๋าเดิม (ลดลง 50.00 -> 40.00 กก., -10.00 กก.)`;
  - active rows explain the current cost summary; released/consumed/cancelled/lost rows appear only under the timeline event that caused the change so stale duplicate rows do not look like current state.
- WTI/WTO edit timeline must store field-level edit details in `weight_ticket_status_logs.meta.changes`. The diff covers document header fields such as branch, customer/supplier, vehicle no, remark, document images, and document totals, plus line fields such as product, warehouse, gross/container/deduction/net weights, impurity, line images, line remark, added lines, and removed lines. This is the document audit trail and is separate from the stock-side pending_out audit.
- Runtime detail update 2026-06-30: field-level edit details are no longer shown as a second separate table under the timeline event. When a timeline event has pending_out/cost rows, the field-level changes that apply to the document or that scale/line are summarized in the same `รายการเปลี่ยนแปลง` column, for example `เปลี่ยนคลัง: FG สมุทรสาคร -> RM สมุทรสาคร` or `เปลี่ยนน้ำหนักสุทธิ: 30.00 กก. -> 25.00 กก.`. This keeps one audit table per event and avoids duplicating the same warehouse/quantity change in a lower table.
- `weight_ticket_pending_out_events` must capture confirm/edit/cancel events from WTO and consume/release/return/loss events from Sales Bill flows. Sales Bill routes should append these audit rows in the same transaction as the `stock_holds` state change.
- WTO edit form should show read-only cost guidance after confirm:
  - existing confirmed quantity and cost snapshot;
  - edited/new/increased quantity that will use current average cost at save time;
  - weighted average result for the same SKU when old and new portions are combined for display.
- Sales Bill detail/create should display the same WTO-prepared weighted average cost only as COGS/GP context for authorized users. Sales Bill must not be the place to edit or recalculate WTO cost snapshots.

## Current UI Behavior Summary

### Mobile filter correction 2026-08-04

- Date range selection remains part of the mobile filter sheet, but its shared calendar popover now renders above the sheet so the calendar can be seen and selected.
- The calendar is rendered through a Radix portal outside the sheet DOM; the shared mobile focus trap treats only a portalled calendar whose trigger belongs to the active sheet as part of that filter surface. Month/day focus stays usable while unrelated external popovers remain outside the modal focus and pointer boundary.
- Mobile document-status controls are shown directly below `ส่งออก Excel` in the list toolbar instead of being hidden inside the filter sheet. The same `status` query values still drive the list and Excel export.
- What is what: the sheet contains lower-frequency scope filters (`วันที่` and `สาขา`), while status is a frequent list-view choice placed beside the export action. Why it has to be like this: users can change the visible document lifecycle without reopening the sheet, and the export link continues to use the same active status/date/branch query contract.

- Customer-approved design decision (2026-07-12): the current rendered `/daily/weight-ticket-list` page is the canonical full-page UX/UI reference for the active Next app, covering page hierarchy, Light/Dark color roles, modal/dialog/mobile-sheet composition, filter layout, table/action/status treatment, pagination, responsive behavior, and spacing. Other pages copy this visual/interaction system while keeping their own business fields, statuses, permissions, labels, and actions.
- ช่องแนบรูปของ WTI/WTO ทุกบริบท—รูปรถ, รูปเต๋า/สินค้า และรูปสินค้าที่ปนมา—ใช้ source chooser เดียวกัน เมื่อกด tile `เพิ่มรูป` ให้เปิดแผงจากด้านล่างและเลือกได้ชัดเจนระหว่าง `ถ่ายรูป` กับ `เลือกจากแกลเลอรี`; กล้องใช้ native file capture ฝั่งหลังครั้งละ 1 รูป ส่วนแกลเลอรีเลือกได้หลายรูป แล้วส่งไฟล์ทั้งสองทางเข้าสู่ upload/preview/save contract เดิม
- source chooser ใช้ transform-only slide 400ms จังหวะเดียวกับ mobile product editor ไม่มี opacity effect มี visible dismiss action เพียง `ยกเลิก`, ปิดด้วย backdrop/Escape ได้ และคืน focus ไป tile เดิม; browser/desktop ที่ไม่รองรับ `capture` อาจ fallback เป็น native file picker โดยต้องไม่ทำให้การแนบรูปหรือ validation เดิมเสีย
- Responsive follow-up 2026-08-03: source chooser ต้องเต็มความกว้างแบบ edge-to-edge เมื่อ viewport ต่ำกว่า `sm` และจำกัดความกว้าง/จัดกึ่งกลางเฉพาะตั้งแต่ `sm` ขึ้นไป เพื่อไม่ให้พื้นเอกสารสีขาวโผล่เป็นขอบข้างจนดูเหมือนแผงลอยหรือยกขึ้นจากหน้า
- Scroll-stability follow-up 2026-08-03: ระหว่าง source chooser เปิดและช่วงสไลด์ปิด ต้องล็อกทั้ง body และ scroll container ของฟอร์มที่ครอบ tile รูป เก็บ/คืนตำแหน่งเดิม และย้าย/คืน focus แบบ `preventScroll`; เนื้อหาด้านหลังต้องไม่ขยับเมื่อเปิดหรือปิดด้วย `ยกเลิก`, backdrop หรือ `Escape`.
- ช่อง `น้ำหนักรวม`, `หักภาชนะ` และ `น้ำหนักหลังหักภาชนะ` ของแต่ละเต๋าต้องอยู่แถวเดียวกันทุก breakpoint; บนมือถือ label ทั้งสามจองพื้นที่สองบรรทัดเท่ากันเพื่อให้ช่องกรอกสูง 40px เริ่มบนแนวเดียวกัน ช่องที่สามยังเป็นค่าคำนวณ read-only และสูตร น้ำหนัก หน่วย validation รวมถึง payload เดิมต้องไม่เปลี่ยน

What is what: source chooser เป็นเพียงทางเลือกนำรูปเข้าสู่ฟอร์ม ไม่ใช่กล้องหรือคลังรูปใหม่ในระบบ และแถวช่องน้ำหนักเป็น presentation ของข้อมูลเต๋าเดิม. Why it has to be like this: ผู้ใช้หน้างานต้องเลือกถ่ายหลักฐานทันทีหรือใช้รูปเดิมได้โดยไม่เดาพฤติกรรม file picker ของแต่ละเครื่อง ขณะที่หลักฐานทั้งหมดต้องยังผ่านสิทธิ์ ชนิดไฟล์ ขนาดไฟล์ storage reference และประวัติเอกสารชุดเดิม; การวางค่าน้ำหนักสามช่องในแถวเดียวช่วยลดพื้นที่แนวตั้งโดยไม่เปลี่ยน business contract
- หน้า list แสดง WTI/WTO และส่ง context ประเภทเอกสารไปหน้า create/edit ให้ถูกต้อง
- Desktop table ใช้ balanced default-width contract รวม `1,660px` ที่ viewport `1440px`: ให้พื้นที่ผู้ขายและ action ตามข้อมูลจริง แต่ลดช่องว่างเกินจำเป็นในวันที่สร้าง, สาขา, ทะเบียนรถ, น้ำหนัก, สถานะ และอัปเดตล่าสุด. คอลัมน์ `จัดการ` ใช้ default/minimum 390px; ความกว้างต้องรองรับ action ที่ขึ้นกับสถานะ/สิทธิ์หลายปุ่ม และตารางยังคง internal horizontal scroll. รายการ action ที่เป็น source of truth อยู่ในหัวข้อ `ตารางสถานะและปุ่มที่แสดงบน WTI/WTO` ของ `docs/notes/WTI-WTO Flow.md`.
- Customer-approved readability follow-up (2026-07-14): ตารางรายการใช้เส้นแนวนอนบาง `1px` สี `--color-scrap-line` ระหว่างแถวจาก global `table.ns-table` rule เพื่อช่วยไล่อ่านรายการที่มีหลายคอลัมน์ โดยไม่เพิ่มเส้นตั้ง ไม่เปลี่ยน row hover และไม่ลดความเด่นของสถานะหรือแถวยกเลิก. สี `slate-100` จากรอบแรกถูกยกเลิกเพราะจางจนผู้ใช้มองไม่เห็นบนพื้นขาว.
- modal create/edit ของใบรับ/ส่งของใช้รายการสินค้าเป็น card หลัก และในแต่ละ card แยกเป็น `เต๋าสินค้า`, `สรุปน้ำหนักเต๋า`, `ซื้อเพิ่มจากสิ่งเจือปน`, `สิ่งเจือปน`, และ summary รวมท้ายรายการ
- UI follow-up 2026-08-05: ปุ่ม `+ เพิ่มสินค้า` ใช้สีเขียวทั้งในรายการและหัวแผงแก้ไขบนมือถือ/แท็บเล็ต ส่วน `+ เพิ่มสิ่งเจือปน` ใช้สีแดงเพื่อแยก action เพิ่มรายการหักออกจาก action เพิ่มสินค้า; แต่ละเต๋าแสดงเป็น section กรอบแยกพร้อมหัวข้อ `รายละเอียดเต๋าที่ ...` และยังยุบ/ขยายได้
- WTI mobile follow-up 2026-08-05: ในหัวข้อเต๋า เมื่อขยายจะแสดงเฉพาะชื่อเต๋าและปุ่ม `ยุบ` โดยซ่อนบรรทัดสรุปน้ำหนัก/จำนวนรูป; เมื่อยุบจึงแสดงบรรทัดสรุปเดิมกลับมา. WTO คงพฤติกรรมเดิมที่แสดงสรุปทั้งตอนยุบและขยาย
- WTI impurity evidence follow-up 2026-08-05: รายการหักสิ่งเจือปนของ WTI มีช่อง `รูปสิ่งเจือปน (ไม่บังคับ)` ที่ใช้ `WeightTicketAttachmentGrid` และ source chooser เดียวกับรูปเต๋า/รถ; ไม่เพิ่ม validation รูปและไม่เปลี่ยน payload หรือ storage contract เดิม. สำหรับ `สินค้าอื่น` ยังคงใช้ label `รูปสินค้าที่ปนมา` และส่งรูปต่อไปยังรายการซื้อเพิ่มเมื่อเลือกซื้อ
What is what: สีปุ่มเป็นตัวแยก intent ของ action และ section เต๋าเป็นขอบเขตข้อมูลน้ำหนัก/รูปของเต๋าแต่ละใบ; รูปสิ่งเจือปนเป็นหลักฐานเสริม ไม่ใช่เงื่อนไขบันทึก. Why it has to be like this: ผู้ใช้หน้างานต้องแยกการเพิ่มสินค้าออกจากการหักสิ่งเจือปนได้ทันทีบนจอแคบ และแนบหลักฐานเฉพาะเมื่อมีประโยชน์โดยไม่ทำให้เอกสาร WTI บันทึกไม่ได้เมื่อไม่มีรูป
- เอกสาร WTI/WTO ใหม่เริ่มด้วย `0 รายการสินค้า`; ผู้ใช้ต้องกด `+ เพิ่มสินค้า` ก่อนจึงสร้าง card/เต๋าสำหรับเลือกสินค้าและกรอกน้ำหนักได้ เพื่อไม่ให้หน้าจอหรือ draft นับบรรทัดว่างเป็นสินค้า 1 รายการ
- หัวเอกสารบนมือถือจัดเป็น 2 คอลัมน์ 2 บรรทัดตามลำดับ `สาขา | ผู้ขาย/ลูกค้า` และ `ทะเบียนรถ | โกดัง` เพื่อลดการเลื่อนก่อนเข้ารายการสินค้า โดยยังใช้ field และ validation เดิมทั้งหมด
- บนมือถือให้รายการสินค้าอยู่ด้านหลังเสมอ: แตะ card หรือกด `+ เพิ่มสินค้า` เพื่อเปิดแผงแก้ไขจากด้านล่างภายใน document modal เดิม (พื้นหลังมืดเฉพาะเพื่อคงบริบท ไม่สร้าง Dialog/Sheet ซ้อน). แผงมี drag handle, ชื่อ `แก้ไขสินค้า`/`เพิ่มสินค้า`, ปุ่ม `X` เป็นทางออกที่มองเห็นได้เพียงจุดเดียว, product context, พื้นที่กรอกแบบเลื่อน และ action bar ด้านล่างสำหรับเพิ่มเต๋า/เพิ่มสิ่งเจือปน/ลบสินค้า; ข้อมูลยังใช้ `form.lines` และกติกา parent/child เดิมทั้งหมด
- card สรุปรายการสินค้าแสดง thumbnail ด้านซ้ายจากรูปหลักฐานของเต๋าจริงรูปแรก; ถ้ามีมากกว่าหนึ่งรูปให้ซ้อน `+N` และถ้ายังไม่มีรูปให้แสดง placeholder เรียบ. รูปนี้เป็นเพียงสรุปเพื่อจำแนกสินค้า ไม่ใช่ช่องอัปโหลดใหม่ และไม่ใช้รูปรถหรือรูปสิ่งเจือปนเป็น fallback.
- เมื่อเปิดแผงแก้ไขสินค้าบนมือถือ backdrop แสดงทันทีและคงอยู่จนแผงเลื่อนลงครบ 400ms แล้วจึงหายพร้อม unmount; แผงต้องเริ่มอยู่นอกจอด้านล่างทั้งแผงก่อนเลื่อนขึ้นใน 400ms ด้วย `cubic-bezier(.32,.72,0,1)` และตอนปิดต้องเลื่อนกลับลงด้วยจังหวะเดียวกันทุกทางออก (X, backdrop, Escape และลบสินค้า) ส่วน desktop คง split-panel แบบ static. ตามคำสั่งผู้ใช้เมื่อ 2026-07-29 แผงนี้ต้องแสดง effect แม้ browser จะรายงาน `prefers-reduced-motion: reduce` เพื่อให้เห็น feedback ของการเปิด/ปิดอย่างชัดเจนใน Codex Browser.
- เมื่อกด `+ เพิ่มสินค้า` ให้สร้างรายการและเปิดแผงกรอกข้อมูลเท่านั้น ห้าม auto-focus ช่อง `เลือกสินค้า` เพราะ dropdown ต้องเปิดเมื่อผู้ใช้แตะช่องเอง; ยกเว้นการกดบันทึกแล้วพบข้อผิดพลาด ซึ่งยังต้อง scroll/focus ไปยังช่องแรกที่ผิดตามกติกา validation เดิม
- ต้องเลือกสินค้าก่อนจึงจะกรอกน้ำหนัก เพิ่มเต๋า แนบรูป หรือเพิ่มสิ่งเจือปนได้
- WTI เปลี่ยนสินค้าใน card หลักได้ใน `draft` หรือ `received` ตราบใดที่ยังไม่มี Purchase Bill ใช้งาน และต้องคงเต๋า น้ำหนัก รูป สิ่งเจือปน และรายการซื้อเพิ่มที่ผูกกับรายการเดิมไว้; WTO draft ใช้กติกาเดียวกัน และตรวจ stock ใหม่เมื่อบันทึก
- แต่ละเต๋ายุบ/ขยายได้ทั้ง WTI และ WTO; ตอนขยายแสดงชื่อเต๋ากับช่องกรอกโดยไม่แสดงข้อมูลสรุปซ้ำ ส่วนตอนยุบยังเห็นน้ำหนักรวม หักภาชนะ น้ำหนักหลังหักภาชนะ และจำนวนรูป
- สิ่งเจือปนปกติบนมือถือเป็น card ที่ยุบ/ขยายได้: ตอนยุบแสดงลำดับ ชื่อสิ่งเจือปน ยอดหัก และสถานะครบ/ไม่ครบ; เพิ่มสิ่งเจือปนใหม่จะยุบ card ปกติเดิมของสินค้านั้นและเปิด card ใหม่ให้กรอกต่อ. ปุ่มลบมีเฉพาะขณะ card ขยาย เพื่อไม่ให้ลบผิดจากหน้าสรุป; `สินค้าอื่น` คงเปิดเต็มเสมอ เพราะมีสินค้า ซื้อ/ไม่ซื้อ คำเตือน และรูปประกอบเพิ่มเติม
- card `สรุปน้ำหนักเต๋า` รวมเฉพาะเต๋าจริง ไม่รวมรายการซื้อเพิ่มจากสิ่งเจือปน
- ถ้ายังไม่มีเต๋าจริงใน card นั้น ต้องเพิ่มสิ่งเจือปนไม่ได้
- สิ่งเจือปนแบบ `%` คำนวณจาก `สรุปน้ำหนักเต๋า > หลังหักภาชนะ` ของเต๋าจริงทั้งหมดในสินค้านั้นเท่านั้น
- `สินค้าอื่น` ในสิ่งเจือปนเป็นตัวเลือกพิเศษของระบบสำหรับ `WTI` เท่านั้น ไม่ใช่ master data; เลือกสินค้าที่ปนมาและเลือก `ซื้อ/ไม่ซื้อ`; ถ้าเลือกซื้อจะสร้าง/รวมรายการซื้อเพิ่มไว้ใน card ของสินค้านั้น ไม่สร้างเป็นเต๋าปลอม
- เมื่อเลือกสิ่งเจือปนเป็น `สินค้าอื่น` ต้องแนบรูปสินค้าที่ปนมาได้ก่อนเลือก `ซื้อ`; ถ้าเลือกซื้อ รูปนั้นต้องติดไปกับรายการซื้อเพิ่มจากสิ่งเจือปนด้วย
- ถ้ายังไม่เลือก `สิ่งเจือปน` ต้องล็อก `ประเภทการหัก`, ช่องค่าหัก, และ dropdown `ซื้อ/ไม่ซื้อ`; เมื่อเลือกสิ่งเจือปนเป็น `สินค้าอื่น` แต่ยังไม่เลือก `สินค้าที่ปนมา` ต้องล็อกช่องเหล่านี้เหมือนกัน
- เปลี่ยน `ซื้อ` กลับเป็น `ไม่ซื้อ` หรือลบแถวสิ่งเจือปน ต้องลบเฉพาะรายการซื้อเพิ่มที่ผูกกับ source นั้น และต้องคง card ปลายทางไว้ถ้ายังมีเต๋าจริงหรือ source ซื้ออื่นอยู่
- หน้ารายละเอียดและ detail modal ต้องรวมตาราง `รายการสินค้าแยกตามเต๋า` กับ `สรุปต่อสินค้า` เป็นตารางเดียวที่เรียงตามสินค้า โดยในแต่ละสินค้าต้องเห็นที่มาจากเต๋าจริง, รายการหักสิ่งเจือปน, รายการซื้อเพิ่มจากสิ่งเจือปน, subtotal ของแต่ละที่มา และ total รวมของสินค้านั้น
- ใบพิมพ์ WTI ต้องเรียงเป็นกลุ่มสินค้าเดียวกับหน้ารายละเอียด โดยแจกแจงราย `เต๋าที่ ...` ก่อนแถว `สรุปรวมจากเต๋า`; แถว `สรุปรวมจากเต๋า` ต้องรวมยอดหักสิ่งเจือปนไว้ในช่อง `หักสิ่งเจือปน` และแสดงรายละเอียดว่าหักอะไร/ซื้อหรือไม่ซื้อในช่องรายการสินค้าโดยไม่ซ้ำชื่อสินค้าหลัก; แถว `ซื้อเพิ่มจากสิ่งเจือปน` แสดงเฉพาะในกลุ่มสินค้าปลายทาง และบอกสั้นๆ ว่ามาจากสินค้าไหนกับสิ่งเจือปนอะไร; ปิดด้วย `รวมสินค้า`; หัวคอลัมน์ต้องใช้คำไทย `น้ำหนักรวม` และ `น้ำหนักสุทธิ`
- รายละเอียดสิ่งเจือปนที่เป็นสินค้าในใบพิมพ์ต้องแสดงในแถว `สรุปรวมจากเต๋า` ของสินค้าต้นทาง โดยแจกแจงเป็นหลายบรรทัด เช่น `1. สินค้าอื่น 10 กก. ซื้อเป็น กระป๋องอลูมิเนียม` และ `2. สินค้าอื่น 20 กก. ไม่ซื้อ`; ไม่ต้องมีแถวสีเหลือง/แถว `หักสิ่งเจือปน` แยก
- PDF/ใบพิมพ์ WTI/WTO ต้องจัดความสูงจากแถวข้อมูลจริงโดยไม่เติมแถวว่างให้ครบโควตา เพื่อให้ตาราง สรุป และลายเซ็นอยู่ใน A4 หน้าหลักเดียวกันเมื่อเนื้อหาพอดี; ส่วนลายเซ็นใช้พื้นที่ว่างที่เหลือเหนือช่วงล่างของหน้ากระดาษเพื่อเว้นพื้นที่เซ็นจริง โดยไม่วาดกรอบเพิ่มและไม่กำหนดช่องว่างตายตัวที่อาจดันเอกสารไปหน้าใหม่; ตัดเส้นประและข้อความท้ายเอกสาร `ขอบคุณที่ใช้บริการค่ะ/ครับ` ที่ไม่มีข้อมูลธุรกิจและอาจสร้างหน้าว่าง ส่วนหน้ารูปถ่ายแนบยังเริ่มหน้าใหม่ตามเดิม
- เมื่อกดแก้ไขเอกสาร ต้องโหลดโครงสร้างกลับมาเหมือนตอนสร้าง: เต๋าจริงต้องยังเป็นเต๋า, รายการซื้อเพิ่มจากสิ่งเจือปนต้องไม่กลายเป็นเต๋าปลอม, และแถว `สินค้าอื่น` ต้องจำ `ซื้อ/ไม่ซื้อ` กับสินค้าที่ปนมาได้
- Runtime update 2026-06-20: `weight_ticket_lines.parent_line_no` และ `weight_ticket_lines.impurity_source_line_no` เป็น source of truth สำหรับโหลดโครงสร้าง edit กลับมา ไม่เดาจากลำดับสินค้า/หมายเหตุเป็นหลักอีกต่อไป
- Multi-user draft editing follow-up 2026-08-06: WTI/WTO draft สามารถเปิดให้หลายคนช่วยกรอกเอกสารเดียวกันได้. แต่ละ save ส่ง `collaborationBaseUpdatedAt` และ `collaborationBaseLineIds` จาก snapshot ล่าสุดของผู้ใช้; server ล็อกเฉพาะ ticket ระหว่างจัดสรร line number, อัปเดต line เดิมแยกกัน, เก็บ line ที่ผู้ใช้อื่นเพิ่มหลัง snapshot และลบเฉพาะ line เดิมที่ผู้ใช้ปัจจุบันลบ. การ save ยังเป็น background และไม่บังคับปิดช่องกรอก.

What is what: `collaborationBase*` คือหลักฐานว่า request เริ่มจากเอกสาร/รายการชุดใด ส่วน `weight_ticket_lines` เป็นข้อมูลรายการปัจจุบันที่ผู้ใช้ทุกคนร่วมกันแก้. Why it has to be like this: การส่งทั้ง snapshot แล้วลบ/สร้าง line ใหม่ทำให้ผู้ใช้คนหลังทับรายการของคนแรก; การ merge ตาม base และล็อก ticket ทำให้การเพิ่มสินค้า/เต๋าพร้อมกันไม่ทำข้อมูลหาย ขณะที่การลบรายการยังคงเป็นเจตนาของผู้ใช้คนที่กดลบเอง

### Detail Image Album

- Detail modal จากรายการแสดง card `รูปภาพประกอบ` หลังกลุ่ม `รายละเอียดสินค้าและที่มา` / `สถานะ` และก่อนประวัติการใช้งานหรือ timeline เพื่อให้ตรวจหลักฐานทั้งหมดก่อนอ่านผลการนำเอกสารไปใช้
- Header ของ card `รูปภาพประกอบ` มีปุ่ม `ดาวน์โหลดรูปทั้งหมด` เมื่อมีรูป preview ได้; ปุ่มเรียก API download ที่ตรวจสิทธิ์และ branch scope แล้วรวมรูปรถกับรูปของทุก line เป็น ZIP เดียว
- `ticket.imageNames` คือ read model ที่รวมรูปรถและรูปของทุก line/เต๋าตามลำดับเดิม จึงไม่เพิ่ม API, query, storage field หรือการประกอบ fallback รายหน้า; ปุ่ม `ดูรูป` ของเต๋าเปิดลำดับรูปของทุกเต๋าตามตาราง โดยเริ่มจากเต๋าที่กดและเลื่อนไปเต๋าถัดไปได้ต่อเนื่อง ส่วนแถวซื้อเพิ่มจากสิ่งเจือปนยังเปิดเฉพาะรูปของแถวนั้น
- รูปที่เปิดได้แสดงเป็น grid 3 คอลัมน์แบบยืดตามพื้นที่ (ตัวอย่าง 6 รูปจึงเป็น 3 x 2 และที่ 390px ยังไม่สร้าง document overflow) กดรูปใดจะเปิด lightbox เดิมที่รูปนั้น และใช้ `รูปก่อนหน้า` / `รูปถัดไป` แบบวนรอบได้; 0 รูปแสดง empty state และ 1 รูปเปิดเป็น gallery หนึ่งรายการโดยไม่แสดง navigation ที่ไม่จำเป็น
- ค่า legacy ที่มีเพียง filename ถูกนับเป็นหลักฐานเดิมแต่ไม่สร้าง `<img>` ที่เสีย ระบบแสดงจำนวนที่ยัง preview ไม่ได้แทน ห้ามเดา URL หรือ fallback ไป legacy binary/base64 ตอน runtime

Image delivery contract ของ album นี้:

1. รูปเป็นหลักฐานเอกสารระดับ L5 และ source of truth คือ metadata ของ WTI/WTO ใน DB ร่วมกับ object URL ที่ API detail ส่งมาใน `ticket.imageNames`; detail API ยังคง `private, no-store`
2. ใช้ URL/storage key และ cache header เดิมของ attachment โดยไม่เพิ่ม cache key, TTL, browser persistence หรือ invalidation path ใหม่ใน batch นี้
3. ห้าม cache binary, transaction response, party data หรือเอกสารลง Redis, `localStorage` หรือ `sessionStorage` เพราะเป็นหลักฐานธุรกรรมที่ต้องตามสิทธิ์และสถานะปัจจุบัน
4. album อยู่บน detail surface จึงใช้ attachment URL ปัจจุบันเป็นรูปหลักและ full preview; ยังไม่เพิ่ม thumbnail derivative เพราะ contract ปัจจุบันมี URL เดียว รูปยังอยู่ภายใต้ privacy policy/bucket เดิมและ batch นี้ไม่เปลี่ยน public/private policy
5. focused tests ครอบ 0/1/6 รูป, การเปิด gallery จาก index ที่กด, previous/next wrap contract, mixed previewable + legacy filename-only, responsive grid และตำแหน่ง component บน detail ทั้งสอง surface

What is what: album เป็นภาพรวมหลักฐานทั้งเอกสาร ส่วน `ดูรูป` ในแถวเต๋าเป็นทางลัดเข้าสู่ลำดับรูปเต๋าต่อเนื่อง และ `ดูรูป` ของแถวซื้อเพิ่มจากสิ่งเจือปนยังเป็นอัลบั้มเฉพาะแถว. Why it has to be like this: ผู้ตรวจเอกสารต้องเห็นรูปรถและรูปสินค้าครบในจุดเดียว และเมื่อตรวจตามเต๋าต้องเลื่อนจากรูปสุดท้ายของเต๋าหนึ่งไปยังรูปแรกของเต๋าถัดไปได้โดยไม่ปิด gallery แต่ยังต้องแยกหลักฐานซื้อเพิ่มจากสิ่งเจือปนและอ่านเอกสารเก่าที่มีเพียงชื่อไฟล์ได้อย่างปลอดภัย

## Page Responsibilities

- แสดง list WTI/WTO พร้อม filter type/status/customer/supplier/date
- เปิด detail/timeline/print/share และ link ไปหน้า create/edit `/daily/weight-tickets`
- ปุ่มสร้างจาก tab `WTO` ต้องส่ง `?type=WTO` ไปหน้า create เพื่อเปิดฟอร์มใบส่งของ ไม่ default กลับเป็น `WTI`
- เมื่อเข้าหน้า create จาก tab `WTI` หรือ `WTO` ต้องล็อกประเภทเอกสารและซ่อน tab ของอีกประเภท; edit เอกสารเดิมก็ต้องล็อกประเภทเช่นกัน
- WTI ใช้เป็น source PB: 1 WTI ต่อ 1 PB และต้องถูกใช้ครบใน PB เดียว
- WTO ใช้เป็น source SB: 1 WTO ต่อ 1 SB; SB สามารถออกบิลบางส่วนได้เมื่อ Customer ซื้อไม่ครบ โดย remaining ต้องคงเป็น `pending_out` และปิดด้วย action `รับของคืน` ไม่ใช่นำไปเปิด SB ใบอื่น
- WTI/WTO create/edit ต้องบังคับเลือก `สาขา` ก่อน `ผู้ขาย/ลูกค้า`; party selector ต้อง disabled จนกว่าจะเลือกสาขา
- WTI supplier selector ต้องกรองจาก active `supplier_branches` ของสาขาเอกสาร และ WTO customer selector ต้องกรองจาก active `customer_branches` ของสาขาเอกสาร; เปลี่ยนสาขาแล้วคู่ค้าที่ไม่ตรง mapping ต้องถูก clear
- WTO customer edit is allowed only while the document is still mutable. Before Sales Bill usage, changing customer updates only the document header (`customer_id` / `party_name`) and does not change stock/pending_out quantities or cost snapshots. After any active SB usage exists, the WTO must be edit-locked.
- WTO เป็น `pending_out` source โดยตรงหลังยืนยัน: draft ยังไม่สร้าง hold และยังไม่แสดงเป็น `รอออก`; แต่ทุกการบันทึก draft รวมถึง autosave ก่อนเพิ่มเต๋า/สินค้า ต้องตรวจ stock ของรายการ WTO ทั้งหมดโดยไม่สร้าง hold. ตอนยืนยันต้องตรวจซ้ำ สร้าง hold และ snapshot ราคาต้นทุนเฉลี่ย ส่วนเพิ่ม/SKU ใหม่หลังยืนยันต้อง rebuild hold ตามกฎแก้ไขเอกสารที่ยืนยันแล้ว
- แสดง product thumbnail, เต๋า/summary, vehicle/image evidence และ downstream usage lock
- WTI create/edit ต้องแยกข้อมูลในแต่ละเต๋าเป็น `ข้อมูลเต๋า` -> `ซื้อเพิ่มจากสิ่งเจือปน` -> `รายการหักสิ่งเจือปน`
- ในแต่ละรายการต้องเลือกสินค้าก่อนกรอกข้อมูลเต๋า/น้ำหนัก/รูป/สิ่งเจือปน. WTI เปลี่ยนสินค้าได้ใน `draft` หรือ `received` ตราบใดที่ยังไม่มี Purchase Bill ใช้งาน และต้องคงข้อมูลเต๋า น้ำหนัก รูป สิ่งเจือปน รายการซื้อเพิ่ม และข้อมูลอื่นของรายการเดิมไว้ โดยเปลี่ยนเฉพาะค่าที่ผู้ใช้แก้. WTO draft เปลี่ยนสินค้า/จำนวน/สิ่งเจือปนได้โดยคงข้อมูลหลักฐานไว้ และตรวจ stock ใหม่ทุกครั้งที่บันทึก. WTO delivered ที่ยังไม่ถูกใช้ใน Sales Bill ต้องปล่อย pending_out เดิมแล้วตรวจและสร้าง pending_out/cost snapshot ชุดใหม่แบบ transaction เดียว; ถ้ามี downstream usage แล้วห้ามแก้
- แต่ละเต๋าต้องแสดงค่าน้ำหนักหลังหักภาชนะจาก `น้ำหนักรวม - หักภาชนะ` เป็นค่าคำนวณอ่านอย่างเดียว
- แต่ละเต๋าต้องยุบ/ขยายได้เพื่อรองรับรายการที่มีข้อมูลและรูปจำนวนมากทั้ง WTI และ WTO; ตอนขยายต้องไม่แสดงข้อมูลสรุปน้ำหนัก/รูปซ้ำกับช่องกรอก ส่วนตอนยุบยังต้องเห็นสรุปน้ำหนักรวม หักภาชนะ น้ำหนักหลังหักภาชนะ และจำนวนรูป
- ถ้ารายการสินค้านั้นยังไม่มีเต๋าจริง ต้องไม่สามารถเพิ่มรายการหักสิ่งเจือปนได้
- รายการหักสิ่งเจือปนต้องรองรับตัวเลือกระบบ `สินค้าอื่น` เฉพาะ `WTI`; ตัวเลือกนี้ต้องไม่มาจาก master impurity และ `WTO` ต้องไม่เห็น/ใช้ตัวเลือกนี้

## Non-Responsibilities

- WTI ไม่เขียน stock-in เอง; PB เป็น owner ของ stock-in
- WTO ไม่เขียน stock-out เอง; target WTO สร้าง `pending_out` และ SB เป็น owner ของ stock-out
- ไม่ตั้ง AP/AR และไม่รับ/จ่ายเงิน

## Lifecycle / Operation Flow

| Step | User action | System result |
|---|---|---|
| 1 | เปิด list | GET weight tickets list |
| 2 | สร้าง/แก้ | ไป `/daily/weight-tickets?type=WTI|WTO` หรือ edit พร้อม type context และใช้ options/products APIs |
| 3 | detail | GET by id/doc no แสดง summary/timeline/images |
| 4 | PB/SB ใช้งาน | update usage/status/lock |
| 5 | cancel/edit | ถ้าถูก bill ใช้แล้วต้อง lock; ถ้ายังไม่ใช้ให้ release/rebuild `pending_out` สำหรับ WTO |

## API / Data Contract

### Current API

- `GET /api/daily/weight-tickets - list`
- `POST /api/daily/weight-tickets - create WTI/WTO`
- `GET /api/daily/weight-tickets/[id] - detail`
- `PUT /api/daily/weight-tickets/[id] - edit`
- `PATCH /api/daily/weight-tickets/[id] - cancel/status action`
- `GET /api/daily/weight-tickets/options - current branches/suppliers/customers/impurities only`
  - suppliers/customers must be eligible for the selected branch through active branch mapping when `branchId` is provided
- `GET /api/daily/weight-tickets/products - product options with thumbnails`
- `GET /api/daily/weight-tickets/stock-options?branchId={branchCode}&productId={productCode}`
  - returns active warehouses in the selected branch where `type in (RM, FG)`
  - returns `onHandQty`, `onHoldQty`, and `availableQty` per warehouse
  - derives `onHandQty` from `stock_ledger`
  - derives `onHoldQty` from active `pending_out`
- `POST /api/daily/weight-tickets`
  - for `WTO`, must require `warehouseId` per line
  - must validate requested qty/net weight against server-side `availableQty`
  - must save the WTO draft without creating `pending_out`
  - must not write `stock_ledger`; ledger stock-out is owned by Sales Bill when it consumes the WTO `pending_out`
- `PUT /api/daily/weight-tickets/[id]`
  - must accept optional `collaborationBaseUpdatedAt` and `collaborationBaseLineIds` from the editor snapshot
  - when the ticket changed after that snapshot, must merge current-user line updates with remote-added lines under a per-ticket transaction lock; it must not delete/recreate the entire line set
  - must append an `edited` timeline row to `weight_ticket_status_logs` with `meta.changes` for field-level before/after detail when submitted data differs from the existing document
  - for editable draft `WTO`, must validate all current lines against current available stock, update document lines only, and leave stock unreserved
  - for confirmed `WTO`, must use the delta rule: release decreases back to on-hand/available stock, preserve existing cost snapshots for unchanged/decreased remaining qty, and snapshot current average cost only for increased qty or new SKU
  - after confirmed `WTO` edits that change pending_out, must append immutable rows to `weight_ticket_pending_out_events` for the changed/new portions and link them to the document timeline event
- `POST/PATCH /api/daily/weight-tickets/[id]/confirm` or equivalent confirm action
  - for first WTO confirm, must validate current stock, create active pending_out rows, and fill their average-cost snapshots in one transaction
  - must be idempotent enough to avoid overwriting existing confirmed cost snapshots
  - must append confirm snapshot rows to `weight_ticket_pending_out_events`
- `PATCH /api/daily/weight-tickets/[id]`
  - for cancel `WTO`, must release active `pending_out`
  - must append release snapshot rows to `weight_ticket_pending_out_events` before/while closing the document so timeline audit remains visible after `stock_holds` changes status

### Data Contract

- UI ใช้ outward business document/code เป็นหลัก และให้ server resolve internal id
- list/detail/print/export ต้องอ่าน source contract เดียวกันเพื่อลด drift
- transaction write ต้องทำใน server transaction และ append timeline/status/audit ตาม document policy
- WTO pending_out current state and document audit are separate contracts: Stock Balance/current cost reads active `stock_holds`; WTO timeline change tables read `weight_ticket_pending_out_events`.
- WTI/WTO field-level edit audit is stored in `weight_ticket_status_logs.meta.changes`. It records changed document fields and changed line/scale fields as before/after values, but it does not own stock quantity, cost snapshot, or pending_out state.
- ถ้า field เป็น money/qty/date/business code ให้ validate ตาม `docs/design.md` และ server-side ซ้ำ
- น้ำหนักสุทธิต้องคำนวณจาก `gross_weight - container_deduction_weight - deduct_weight`; `container_deduction_weight` คือหักภาชนะ ส่วน `deduct_weight` คือหักสิ่งเจือปนเดิม และต้องเก็บแยกทั้ง header/line/product summary
- สิ่งเจือปนปกติ เช่น ทราย/ดิน/พลาสติก เป็นการหักน้ำหนักอย่างเดียว และต้องไม่แสดง action ซื้อ
- การหักสิ่งเจือปนแบบ `%` ต้องคำนวณจากตัวเลขเดียวกับ card `สรุปน้ำหนักเต๋า > หลังหักภาชนะ` ของสินค้านั้น ไม่ใช่น้ำหนักเฉพาะเต๋าที่ผูกแถวสิ่งเจือปน และต้องไม่เอาน้ำหนักสินค้าที่ซื้อเพิ่มจากสิ่งเจือปนมารวมเป็นฐานคำนวณ
- ช่องกรอกค่าหักสิ่งเจือปนต้องกระชับและจำกัดความยาวประมาณ 5 ตัวอักษร; ถ้าเลือกหักแบบ `%` ต้องแสดงช่องอ่านอย่างเดียวสำหรับน้ำหนักที่หักจริงเป็นกิโลกรัม
- `สินค้าอื่น` เป็น system-only special impurity สำหรับ `WTI` กรณีมีสินค้าอีกชนิดปนมากับเต๋านั้น เช่น เต๋ากระทะมีเหล็กปน
- `สินค้าอื่น` ต้องถูกส่งด้วย system id `__OTHER_PRODUCT__`; ห้าม fallback ไปใช้ master impurity id ที่ชื่อ `สินค้าอื่น`, `อื่นๆ`, หรือ `อย่างอื่น`
- Read/write runtime ต้องไม่แปลง master/legacy impurity rows กลุ่มนี้เป็น `__OTHER_PRODUCT__`; ถ้ามีข้อมูลเก่าต้องแก้ด้วย data repair หรือปิด master row ไม่ใช่เพิ่ม fallback ใน runtime
- `WTO` ใช้ได้เฉพาะ master impurity จริง เช่น ดิน/ฝุ่น/พลาสติก และ API ต้อง reject ถ้า payload ส่ง `__OTHER_PRODUCT__` หรือ master impurity กลุ่มสินค้าอื่นเข้ามา
- เมื่อเลือก `สินค้าอื่น` ต้องบันทึกข้อมูลว่าเลือกสินค้าที่ปนมาเป็นสินค้าอะไร และเลือก `ซื้อ` หรือ `ไม่ซื้อ`
- `สินค้าอื่น` ต้องรองรับรูปหลักฐานของสินค้าที่ปนมาได้ตั้งแต่ก่อนเลือก `ซื้อ`; เมื่อซื้อและสร้างรายการซื้อเพิ่ม รูปหลักฐานต้องถูกใช้เป็นรูปของรายการซื้อเพิ่มนั้น
- ถ้ายังไม่เลือกสิ่งเจือปน ต้องยังเลือกประเภทการหัก กรอกค่าหัก และเลือก `ซื้อ/ไม่ซื้อ` ไม่ได้; ถ้าเลือกสิ่งเจือปนเป็น `สินค้าอื่น` แต่ยังไม่เลือกสินค้าที่ปนมา ต้องล็อกเหมือนกัน
- ถ้าเลือก `ไม่ซื้อ`, น้ำหนักรายการนั้นยังเป็น `deduct_weight` ของเต๋าต้นทางเท่านั้น และไม่สร้างรายการสินค้าหลักเพิ่ม
- ถ้าเลือก `ซื้อ`, น้ำหนักรายการนั้นยังต้องถูกหักออกจากเต๋าต้นทาง และต้องสร้าง/รวมรายการซื้อเพิ่มของสินค้าที่เลือกไว้ในเอกสารเดียวกัน
- เมื่อผู้ใช้ลบแถวสิ่งเจือปนที่เป็น source ของรายการซื้อเพิ่ม ต้องลบรายการซื้อเพิ่มที่ผูกกับ source นั้นด้วย; ถ้าสินค้านั้นไม่มีรายการหลัก/เต๋าจริง card ต้องหายไป
- เมื่อเปลี่ยนแถว `สินค้าอื่น` จาก `ซื้อ` เป็น `ไม่ซื้อ` ต้องลบเฉพาะรายการซื้อเพิ่มที่ผูกกับ source นั้น และต้องเช็ค card สินค้าปลายทางก่อนลบ ถ้ายังมีเต๋าจริงหรือ source ซื้ออื่นอยู่ card ต้องคงอยู่
- ช่องเลือกสินค้าที่ปนมาของ `สินค้าอื่น` ต้องไม่แสดงสินค้าหลักของเต๋าต้นทาง เช่น เต๋ากระทะต้องเลือกกระทะเป็นสินค้าที่ปนมาไม่ได้
- ถ้าสินค้าที่ซื้อจากสิ่งปนมามีอยู่แล้วในรายการสินค้าหลักของเอกสาร ให้รวมเข้ากับ product summary ของสินค้านั้น แต่ UI ต้องยังแสดงแหล่งที่มาว่ามาจากเต๋าใด
- ถ้าสินค้าที่ซื้อจากสิ่งปนมายังไม่มีในรายการสินค้าหลักของเอกสาร ให้สร้างรายการสินค้าหลักใหม่โดยใช้ weight จากรายการ `สินค้าอื่น` ที่เลือกซื้อ
- รายการสินค้าซื้อเพิ่มจากสิ่งปนมาต้องไม่แสดงในรูปแบบตารางเต๋าหรือสร้างเต๋าว่าง และต้องแสดงแยกเป็น section readonly ต่อจากข้อมูลเต๋าแต่ละเต๋า ก่อน section รายการหักสิ่งเจือปน เพื่อให้เห็นชัดว่าน้ำหนักใดถูกซื้อเพิ่มจากเต๋าไหน
- ใบพิมพ์ต้องแสดงสินค้าเดียวกันในกลุ่มเดียว แต่แยกแหล่งที่มาเป็นรายเต๋าจริงและรายการซื้อเพิ่มจากสิ่งเจือปน; แถวเต๋าย่อยใช้ชื่อสินค้าแบบ `{ชื่อสินค้า} - 1`, `- 2`, `- 3` ตามลำดับ โดยไม่แสดงบรรทัด `เต๋าที่ ...` และไม่แสดง `-` แทนหมายเหตุว่าง แต่ยังคงหมายเหตุจริงเมื่อมีข้อมูล; รายการหักสิ่งเจือปนต้องไม่เป็น row แยก แต่รวมอยู่ในแถว `สรุปรวมจากเต๋า`; บรรทัด `รวมสินค้า` ต้องใช้ยอดจาก product summary ของ server
- ก่อน section `ซื้อเพิ่มจากสิ่งเจือปน` ต้องแสดง card สรุปน้ำหนักเต๋าจริงของสินค้านั้น โดยรวมเฉพาะเต๋าหลัก/เต๋าเพิ่มจริง ไม่รวมรายการที่สร้างจากการซื้อสิ่งเจือปน
- card สินค้าที่ถูกสร้าง/รวมจากสิ่งปนมาต้องแสดง section readonly `ซื้อเพิ่มจากสิ่งเจือปน` โดยดึง source line ย้อนกลับมาแสดงน้ำหนัก ประเภทการหัก ที่มา และหมายเหตุ; section นี้ต้องอยู่ใน card ของสินค้าที่ซื้อเพิ่ม ไม่ใช่ card ของสินค้าต้นทางที่มีสิ่งปนมา
- ถ้า card สินค้ามาจากสิ่งปนมาอย่างเดียวและไม่มีเต๋าจริง หมายเหตุรายการต้องแสดง summary ที่คำนวณจากรายการซื้อเพิ่มทั้งหมด เช่น จำนวน source และน้ำหนักรวม แทนการใช้ note ของแถวแรกเพียงแถวเดียว
- เมื่อลบ source impurity line ที่เคยสร้าง card สินค้าซื้อเพิ่มไว้ ถ้า card นั้นมีเต๋าจริงหรือ child/source อื่นแล้ว ห้ามลบ card หลักทิ้ง; ต้องลบเฉพาะ purchase line ที่ผูกกับ source นั้น และ promote/reparent เต๋าจริงให้เป็นรายการหลักต่อ
- Runtime contract ต้องไม่พึ่ง `note` เพื่อ trace ความสัมพันธ์นี้เพียงอย่างเดียว; ต้องมี field/relation ที่ระบุ source impurity line, target product, buy decision, และ target purchase line/summary
- สำหรับ `WTO`, `warehouseId` เป็น line-level stock location ไม่ใช่ header field เพราะแต่ละสินค้าอาจออกจากคลังต่างกัน
- `warehouseId` ที่ส่งออก client ควรเป็น business code ของ warehouse; server resolve เป็น internal bigint id ก่อนเขียน DB

### Target Impurity Purchase Flow

| Case | User input | System result |
|---|---|---|
| สิ่งเจือปนปกติ | เลือกสิ่งเจือปน เช่น ทราย และกรอกน้ำหนักหัก | หักน้ำหนักจากเต๋าต้นทางเท่านั้น, ไม่แสดงปุ่มซื้อ |
| `สินค้าอื่น` ไม่ซื้อ | เลือก `สินค้าอื่น`, เลือกสินค้าที่ปนมา, เลือก `ไม่ซื้อ`, กรอกน้ำหนักหัก | หักน้ำหนักจากเต๋าต้นทาง, เก็บ trace ว่าสินค้าอะไรปนมาแต่ไม่ซื้อ |
| `สินค้าอื่น` ซื้อและมีสินค้าหลักอยู่แล้ว | เลือก `สินค้าอื่น`, เลือกสินค้าที่ปนมา, เลือก `ซื้อ`, กรอกน้ำหนักหัก | หักน้ำหนักจากเต๋าต้นทาง และรวมเข้ากับ summary ของสินค้านั้น พร้อมแสดงใน table ซื้อเพิ่มจากสิ่งปนมา |
| `สินค้าอื่น` ซื้อแต่ยังไม่มีสินค้าหลัก | เลือก `สินค้าอื่น`, เลือกสินค้าที่ปนมา, เลือก `ซื้อ`, กรอกน้ำหนักหัก | สร้างรายการสินค้าหลักใหม่ในเอกสาร แล้วรวมเข้า summary พร้อม source trace |

### Schema / API Contract

- `weight_ticket_lines` หรือ relation ใหม่ต้องรองรับข้อมูลอย่างน้อย:
  - `impurity_purchase_action`: `none | buy`
  - `impurity_purchase_product_id`: product ที่เลือกเมื่อ impurity เป็น `สินค้าอื่น`
  - `impurity_purchase_source_line_id`: line สิ่งเจือปนต้นทาง ถ้าแยกเป็น target purchase line
  - `impurity_purchase_target_line_id`: line สินค้าหลักที่ถูกสร้าง/รวมจากสิ่งปนมา
- Current durable line relation:
  - `weight_ticket_lines.parent_line_no` เก็บ line แม่ของเต๋าย่อยและแถวหักสิ่งเจือปนภายในเอกสารเดียวกัน
  - `weight_ticket_lines.impurity_source_line_no` เก็บ source impurity line เมื่อ line นั้นเป็นรายการสินค้าที่ซื้อเพิ่มจากสิ่งเจือปน
  - API read model ส่ง `lineNo`, `parentLineNo`, และ `impuritySourceLineNo` กลับให้ modal edit เพื่อ restore card/เต๋า/source ได้ตรงกับตอนสร้าง
- API create/edit ต้อง validate ว่า:
  - ถ้า impurity ไม่ใช่ `สินค้าอื่น`, `impurity_purchase_action` ต้องเป็น `none`
  - ถ้า impurity เป็น `สินค้าอื่น`, ต้องเลือก target product เสมอ
  - ถ้าเลือก `buy`, target product ต้องเป็น active product และต้องสร้าง/รวม purchase line ใน transaction เดียวกัน
  - น้ำหนักซื้อเพิ่มจากสิ่งปนมาต้องเท่ากับน้ำหนักหักของ source impurity line เพื่อไม่ให้ยอดสุทธิ drift
- Read model detail/print/share/PB source options ต้องอ่าน relation นี้กลับมาได้ เพื่อแสดงว่าแต่ละ summary มีน้ำหนักที่มาจากเต๋า/สิ่งปนใด

## Validation / Status Rules

- WTI supplier/branch/product/weight required ตาม receipt mode
- WTO customer/branch/product/warehouse/qty required และ target validate available qty จาก branch+product+warehouse
- WTI supplier ต้อง active และมี active `supplier_branches` กับ branch ของ WTI; WTO customer ต้อง active และมี active `customer_branches` กับ branch ของ WTO; API ต้อง reject ถ้าไม่ตรง mapping และห้าม fallback เป็นทุกสาขา
- WTO warehouse ต้อง active, อยู่ใน branch ที่เลือก, และเป็นคลัง `RM` หรือ `FG`
- WTI/WTO status ใน target filter: `WTI = แบบร่าง/รับของแล้ว/เสร็จสิ้น/ยกเลิก`, `WTO = แบบร่าง/ส่งของแล้ว/ออกบิลแล้วบางส่วน/ออกบิลแล้ว/ยกเลิก`
- WTI ไม่มีสถานะ `partially_billed`; การออก PB ต้องจัดสรรน้ำหนัก WTI ให้ครบในบิลซื้อใบเดียว ส่วน `partially_billed` ใช้กับ WTO เท่านั้น
- `WTO.partially_billed` ใช้เฉพาะกรณีใบส่งของถูกนำไปออก `SB` แล้วบางส่วนและยังมี active `pending_out` เหลือเพื่อรอ action `รับของคืน`; remaining นี้ห้ามนำไปเปิดบิลขายใบอื่นแบบเงียบ ๆ
- ประเภทเอกสาร (`WTI`/`WTO`) เปลี่ยนไม่ได้หลังเปิดจาก create context เฉพาะประเภทหรือหลังสร้างเอกสารแล้ว; API ต้อง reject payload ที่พยายามเปลี่ยน `type`
- edit/cancel lock เมื่อ PB/SB active ใช้งานแล้ว
- Sales Bill consume must validate that the selected WTO belongs to the same branch and same customer as the Sales Bill. If WTO customer was corrected before billing, the Sales Bill must use the corrected customer; using the old customer must be rejected.
- product image ต้องมาจาก storage thumbnail key/url ตาม target ไม่ใช้ fallback runtime

## Side Effects

- WTI save สร้าง evidence/summary แต่ไม่ stock ledger
- WTO draft save ยังไม่สร้าง `pending_out`; WTO confirm ตรวจ stock แล้วสร้าง pending_out พร้อม snapshot ราคาต้นทุนเฉลี่ยแบบแยกเต๋า/line
- WTO delivered ที่ยังไม่ถูกใช้ใน Sales Bill ใช้วิธี release/rebuild ทั้งชุด: release active pending_out เดิมและเขียน immutable `edit_release` event ก่อนสร้าง pending_out ชุดใหม่จากรายการล่าสุด พร้อม snapshot ต้นทุนเฉลี่ยปัจจุบันและ immutable `edit_rebuild` event ใน transaction เดียวกัน. ไม่ใช้ Delta และไม่ preserve cost snapshot เดิม; ถ้ามี downstream usage แล้วห้ามแก้
- WTO customer edit before SB usage must not release/recreate pending_out by itself unless line, product, warehouse, branch, or qty data also changes. The customer is a billing/customer ownership guard for later SB validation, not a stock movement dimension.
- PB/SB เป็นผู้ consume source และเขียน ledger
- WTO detail แสดงปุ่ม `รับของคืน` เฉพาะเมื่อ `GET /api/daily/weight-tickets/[id]/stock-returns` พบ active `pending_out` ที่ถูกนำไปออก `SB` แล้วบางส่วน; modal ให้กรอกน้ำหนักชั่งคืนจริง และถ้าคืนน้อยกว่ายอดค้างต้องระบุเหตุผลเพื่อให้ระบบบันทึก loss ledger ผ่าน Sales Bill stock-return API
- WTI/WTO user-facing weight labels use Thai terms: `น้ำหนักรวม` for gross weight, `หักภาชนะ`, `หักสิ่งเจือปน`, and `น้ำหนักสุทธิ` for net weight. English Gross/Net remains only in internal field names or external/export contracts when required.

## Form UI Behavior

- ปุ่มเลือกสินค้าจากรูปและปุ่มเพิ่มเต๋าเป็น action ปกติ จึงใช้สีหลักของระบบ ไม่ใช้สีแดงซึ่งสงวนไว้สำหรับยกเลิกหรือลบ
- ตัวเลือกสินค้าจากรูปใน modal `เพิ่มสินค้า` แสดง 3 ใบต่อแถวบนมือถือ, 3 ใบบนจอเล็ก และ 4 ใบบนจอ `md` ขึ้นไป เพื่อเห็นตัวเลือกมากขึ้นโดยยังคงรูปสี่เหลี่ยมและชื่อสินค้าไม่เกิน 2 บรรทัด
- บนมือถือ รายการหักสิ่งเจือปนปกติจัดเป็น 2 แถว: เลือกสิ่งเจือปนเต็มแถวแรก แล้ววางประเภทการหักและค่าน้ำหนักในแถวที่สอง; กรณีหัก `%` ให้น้ำหนักที่คำนวณได้อยู่แถวที่สองด้วย. ปุ่มลบเต็มความกว้างอยู่ท้าย card เฉพาะขณะขยาย; กรณี `สินค้าอื่น` คงฟิลด์เรียงเต็มแถวเพื่อไม่บีบการเลือกสินค้าที่ปนมาและซื้อ/ไม่ซื้อ
- ข้อมูลหัวเอกสารจัดเป็นฟิลด์ 2 คอลัมน์คู่กับหลักฐานรูปภาพรถ เพื่อลดพื้นที่ว่างและยังคงลำดับกรอกข้อมูลเดิม; บนมือถือใช้ 2 คอลัมน์ 2 บรรทัดตามลำดับเดียวกัน
- เมื่อเพิ่มเต๋าใหม่ ระบบยุบเต๋าเดิมของสินค้านั้นและเปิดเฉพาะเต๋าใหม่ เพื่อให้กรอกต่อเนื่องโดยไม่เปลี่ยนข้อมูลเต๋าเดิม
- ปุ่มลบรายการสินค้าแสดงเฉพาะเมื่อเอกสารมีมากกว่า 1 รายการ เพราะเอกสารต้องคงรายการเริ่มต้นอย่างน้อยหนึ่งรายการ
- footer ของฟอร์มบนมือถือแสดงเฉพาะจำนวนรายการ น้ำหนักรวม และน้ำหนักสุทธิ พร้อมปุ่มกลับ/บันทึกเหนือ bottom navigation; ค่าหักภาชนะและสิ่งเจือปนยังแสดงครบในจอใหญ่และใน summary ภายในฟอร์ม

## Current Code Baseline

- Current `apps/next` page/API code is accepted as the P0 implementation baseline as of 2026-06-11.
- This page belongs to the transaction/stock/payment risk group; accepted baseline means proofed against current code, not target-complete.
- Runtime changes must preserve documented status, allocation, ledger, payment, lock, and reversal boundaries, or update this page-flow and the canonical flow first.
- See [[P0 Transaction Stock Payment Current Code Baseline]] for API/permission/side-effect proof notes and open critical gaps.

## Current Gap

- SB cancel write path must reverse stock ledger with `SB-CANCEL` and restore the consumed WTO `pending_out`; WTO remains the source document and can be billed again after cancellation
- stock balance ยังไม่มี drilldown UI ให้เห็นว่า `pending_out` มาจาก `WTO` ใบไหน/line ไหน
- ต้องทำ browser QA เต็ม flow create/edit/cancel/detail/print/share และ handoff ไป `PB/SB`
- ต้องทำ report/reconciliation สำหรับ `WTI/WTO ค้างออกบิล`, aging bucket, legacy partial-billed debt, และ `status ไม่ตรง usage`
- WTI impurity purchase flow ปัจจุบันยังไม่ครบ target ทั้งหมด: UI จำกัด action `ซื้อ/ไม่ซื้อ` ไว้เฉพาะ `สินค้าอื่น` แล้ว สร้าง/รวมรายการหลักใน modal เมื่อเลือก `ซื้อ` โดยไม่แสดงเป็นเต๋าปลอม และแสดง source table ใน card ของสินค้าที่ซื้อเพิ่ม; DB/API มี line-level source/parent relation แล้วผ่าน `parent_line_no` และ `impurity_source_line_no` แต่ยังไม่มี field แยกสำหรับ buy decision/target product แบบ normalized เต็มรูป

## Implementation Checklist

- [x] Verify current Next page/component against this page-flow
- [x] Verify API route handlers match Current API and status rules above
- [x] Add `warehouse_id` to WTO lines and expose it in form/detail/read models
- [x] Add pending_out-aware stock-options API for branch+product warehouse availability
- [x] Add pending_out service and integrate WTO save/edit/cancel + SB create consume
- [x] Add WTO detail/modal average-cost display at product summary, real scale/line, and pending_out history levels
- [x] Add WTO detail `รับของคืน` entry point for partial-billed pending_out and keep Sales Bill detail free of the return form
- [x] Lock WTI/WTO document type in create context and edit API
- [x] Add durable line relation for `สินค้าอื่น` impurity purchase to schema/API/read model (`parent_line_no`, `impurity_source_line_no`)
- [x] Add per-te๋า table `รายการสินค้าซื้อเพิ่มจากสิ่งปนมา` before impurity deduction section
- [x] Hide buy action for normal impurities and show product + buy/not-buy controls only for `สินค้าอื่น`
- [x] Ensure bought impurity product creates or merges into main product card in current UI with source trace
- [x] Add card `สรุปน้ำหนักเต๋า` before `ซื้อเพิ่มจากสิ่งเจือปน`
- [x] Calculate `%` impurity deduction from real lot gross summary only
- [x] Keep real-lot card when changing impurity purchase from `ซื้อ` to `ไม่ซื้อ`
- [x] Add collapse/expand for each เต๋า
- [x] Disable adding impurity rows when the product card has no real lots
- [x] Persist impurity purchase source/target relation through schema/API/read model
- [x] Replace WTI/WTO user-facing Gross/Net labels with Thai `น้ำหนักรวม` and `น้ำหนักสุทธิ`
- [x] Document WTO customer edit impact boundary and Sales Bill same-customer validation
- [x] Keep WTO current cost visible in the product breakdown and move pending_out audit rows into collapsed timeline change tables
- [ ] Verify legacy behavior for remaining SB edit/cancel/reversal gap before implementing runtime change
- [ ] Add/adjust tests or browser QA checklist before changing runtime
- [ ] Filter/validate WTI Supplier and WTO Customer selectors by branch mapping
- [ ] Update this file and canonical reference if contract changes
# Department access boundary checkpoint — 2026-08-04

What is what: WTI/WTO list visibility and lifecycle actions are shared operational work for the sorting and production departments. The API returns `canOpenPurchaseBill` / `canOpenSalesBill` only from `daily.weight_tickets.open_bill`; the list action menu renders the handoff links only when those server flags are true.

Why it has to be like this: opening a Purchase/Sales Bill changes the business boundary from an operational weight ticket to an accounting document. The two department roles therefore keep view/create/update/confirm/cancel/share for WTI/WTO but receive no open-bill permission and no Purchase/Sales Bill permission. The target bill pages and APIs remain independently guarded as defense in depth.
