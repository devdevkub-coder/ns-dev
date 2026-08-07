---
title: Form Safety and Confirmation Policy
aliases:
  - Unsaved Form Safety
  - Discard Confirmation Policy
tags:
  - ns-scrap-erp
  - forms
  - confirmation
  - audit
status: active
created: 2026-07-30
updated: 2026-07-30
---

# Form Safety and Confirmation Policy

## Purpose

กติกานี้ป้องกันข้อมูลที่ผู้ใช้กำลังกรอกหายโดยไม่ตั้งใจ และแยกให้ชัดเจนระหว่างการปิดฟอร์มที่ยังไม่บันทึกกับการยกเลิกธุรกรรมที่บันทึกแล้ว

## What is what

| Situation | Required behavior | Why |
| --- | --- | --- |
| ฟอร์มสร้างใหม่ที่ยังไม่มีการแก้ไข | ปิด/ยกเลิกได้ทันที | ไม่มีข้อมูลของผู้ใช้ที่จะสูญหาย |
| ฟอร์มสร้างหรือแก้ไขที่เปลี่ยนจากข้อมูลตั้งต้น | ถาม `ละทิ้งการแก้ไขหรือไม่?` ก่อนปิด, เปลี่ยนหน้า, หรือออกจากเว็บ | ผู้ใช้ต้องเลือกเองว่าจะทิ้งข้อมูลที่ยังไม่บันทึกหรือแก้ไขต่อ |
| ยกเลิก, ลบ, void, reverse, deactivate | ถามยืนยันแบบ destructive ก่อนเรียก API ทุกครั้ง | ป้องกันการเปลี่ยนสถานะหรือผลกระทบต่อข้อมูลโดยไม่ตั้งใจ |
| ลบรูปหลักฐานในฟอร์มใบรับ/ส่งของ | ถามยืนยันก่อนนำรูปออกจาก state ของฟอร์ม แม้ยังไม่ได้กดบันทึกเอกสาร | รูปหลักฐานเป็นข้อมูลที่ผู้ใช้เพิ่งแนบ และการลบต้องไม่เกิดจากการกดพลาด |
| เปลี่ยน selector/mode/source/allocation ที่ล้างข้อมูลลูก | ถ้ามีแถว, ยอด, หรือ allocation ที่กรอกแล้ว ให้ถามยืนยันก่อนล้าง; ฟอร์มและแถวว่างเปลี่ยนได้ทันที | ป้องกันข้อมูลร่างที่พึ่งกรอกหายเพราะเปลี่ยนตัวเลือกต้นทาง |
| ธุรกรรมการเงิน, สต็อก, การผลิต, เอกสารซื้อ/ขาย | คง dialog เหตุผล, permission, payload, timeline และ ledger ของ flow นั้น แล้วค่อยยืนยันก่อนส่งคำสั่ง | การยืนยัน UI ห้ามแทน policy การเก็บประวัติหรือการย้อนรายการแบบ append-only |

## Shared implementation contract

- `FormSafetyProvider` เป็นเจ้าของ confirmation dialog กลางและทะเบียน dirty form.
- confirmation กลางต้องใช้ compact dialog (`mobileAppShell={false}`) ทั้ง Desktop และ Mobile ไม่ใช่ mobile app shell เต็มจอ เพื่อให้ผู้ใช้เห็นบริบทเดิมใต้ backdrop และไม่มีพื้นที่พื้นหลังเข้มว่างเต็มจอ.
- ฟอร์มต้องสร้าง snapshot ของ state ที่บันทึกได้เมื่อเปิด/โหลด/บันทึกสำเร็จ แล้วคำนวณ dirty จาก snapshot ปัจจุบันเทียบ baseline.
- ใช้ `useUnsavedChangesGuard(isDirty)` ใน write form เท่านั้น และส่งทุกทางออกของฟอร์มผ่าน `requestDiscard`.
- `GuardedLink` ครอบ navigation หลักของ AppShell (sidebar, mobile navigation, เมนูค้นหา และ breadcrumb). เมื่อมี dirty form จะถามก่อนเปลี่ยนหน้า.
- เมนูค้นหาบนมือถือหน่วงการปิดผลลัพธ์เล็กน้อยหลัง input เสีย focus เพื่อให้ tap รายการที่ทำให้ keyboard ปิดยังส่ง navigation ได้ครบ; เมื่อเลือกสำเร็จ `GuardedLink` ยังคงใช้กติกา dirty-form confirmation เดิม.
- ขณะที่มี dirty form, provider ผูก `beforeunload` เพื่อให้ browser แสดงคำเตือนสำหรับ refresh, ปิด tab และออกจากเว็บ.
- ถ้า mutation ใน confirmation ล้มเหลว callback ต้อง reject/throw หลังแสดง error เฉพาะ flow เพื่อให้ dialog ยังเปิดอยู่และป้องกันการกดย้ำ.
- dialog ที่ให้กรอกเหตุผลเพื่อยกเลิก, void, reverse, short-close หรือ deactivate ถือเป็น mini form: เมื่อผู้ใช้พิมพ์แล้ว ปุ่มปิด/backdrop/Escape ต้องผ่าน `requestDiscard`; validation เหตุผลต้องเกิดก่อน final confirmation และ API ต้องเกิดหลัง final confirmation เท่านั้น.
- `WeightTicketAttachmentGrid` ต้องส่งการลบรูปทุกชนิด (รูปรถ, รูปเต๋า, รูปสิ่งเจือปน) ผ่าน `requestConfirmation`; callback `onRemove` จะทำงานหลังผู้ใช้กด `ลบรูปภาพ` เท่านั้น.
- Selector ที่ reset ข้อมูลลูกต้องตรวจว่ามีข้อมูลจริงก่อนเรียก updater; เมื่อมีข้อมูลให้ห่อ action เดิมด้วย `requestConfirmation` และเมื่อไม่มีข้อมูลให้ทำ action เดิมทันที.
- Selector ที่เลือกค่าเดิมอยู่แล้วต้องเป็น no-op: ห้าม reset ค่า manual หรือแสดง confirmation เพราะไม่มีข้อมูลที่จะถูกล้าง.

## Boundaries

- ห้ามใช้ guard กับ filter, search, pagination, read-only detail หรือ dialog ดูข้อมูล เพราะไม่ใช่ข้อมูลธุรกรรมที่กำลังแก้ไข.
- ห้ามใช้ global click-capture เพื่อเดาสถานะของทุกหน้า; แต่ละ write form ต้องประกาศ baseline ของตัวเองเพื่อไม่ให้ถามผิดจังหวะ.
- Browser Back/Forward ของ Next App Router ไม่มี API ที่ block ได้อย่างปลอดภัยในชุดนี้. ปุ่มกลับภายใน form ต้องเรียก `requestDiscard`; refresh/tab close และ navigation หลักถูกคุ้มครองแล้ว.
- การกด Escape/backdrop ของ form ต้องผ่าน guard เดียวกับปุ่ม `ยกเลิก`, และต้องไม่แข่งกับ confirmation dialog ที่เปิดอยู่หรือกับ mutation ที่กำลังบันทึก.
- native browser `window.prompt` ที่ยังอยู่ใน production/stock flow เก่าเป็น contract เฉพาะของ flow นั้น ไม่ใช่ custom dialog และใช้การยกเลิกของ browser prompt เอง; ห้ามเพิ่ม prompt ใหม่. เมื่อย้าย flow เหล่านี้เป็น dialog ต้องใช้กติกา mini form ข้างต้น.

## Standard wording

- discard title: `ละทิ้งการแก้ไขหรือไม่?`
- discard description: `ข้อมูลที่แก้ไขแล้วแต่ยังไม่ได้บันทึกจะหายไป`
- cancel action: `แก้ไขต่อ`
- destructive discard action: `ละทิ้งการแก้ไข`
- destructive document action: ใช้ชื่อธุรกิจที่ชัด เช่น `ยืนยันยกเลิก`, `ยืนยันลบ`, `ยืนยันย้อนกลับ` และอธิบายผลกระทบจริงของรายการนั้น

## Verification

ตรวจอย่างน้อย:

1. ฟอร์มใหม่ที่ยังไม่เปลี่ยนค่า ปิดได้โดยไม่เห็น dialog.
2. ฟอร์มที่เปลี่ยนค่า เลือก `แก้ไขต่อ` แล้วข้อมูลยังอยู่.
3. เลือก discard แล้วทางออกทำงานครั้งเดียว.
4. destructive action ไม่เรียก API ก่อนกดยืนยัน.
5. ฟอร์ม dirty บล็อก AppShell navigation และ browser unload.
6. reason/ledger/history ของ flow การเงิน สต็อก และการผลิตยังอยู่ครบ.
7. กดลบรูปใน WTI/WTO แล้วรูปยังอยู่จนกว่าจะกด `ลบรูปภาพ`; กด `ไม่ลบ` แล้วรูปยังอยู่.
8. เปลี่ยน source/mode/allocation ที่จะล้างข้อมูลที่กรอกแล้ว ต้องยังคงค่าเดิมเมื่อกดไม่ยืนยัน และทำ action เดิมเพียงครั้งเดียวเมื่อยืนยัน.
9. บนมือถือ confirmation กลางต้องอยู่กึ่งกลางเป็น compact dialog ไม่ขยายเป็น full-screen app shell.

## Rollout coverage (2026-07-30)

| Surface | Included flows |
| --- | --- |
| Navigation and account exit | AppShell sidebar, breadcrumb, search, mobile navigation, profile links, logout, login/forgot/reset password |
| Daily transactions | WTI/WTO create/edit/detail/return/list, purchase/sales bills, daily expense, petty advance/return, transfer, money movement, payment approval, receipt voucher, stock transfer |
| Purchase and sales | PO Buy, PO Sell, supplier/customer advance, advance tab switch, cancel and short-close reason dialogs |
| Stock, production, costing | stock operation, production order/input return, cost allocator/reverse, trading cost source |
| Finance and administration | fixed assets/disposal/depreciation reverse, loan/equity, FX, overseas receipt/transfer, company/profile/password/system/user/role/permission/LINE settings |
| Master data | shared master-data, customer, supplier, product, impurity, impurity-product |

The rollout only changes client-side exit/confirmation control. API payloads, server authorization, reason validation, audit/timeline and append-only ledger behavior remain owned by their existing flows.
