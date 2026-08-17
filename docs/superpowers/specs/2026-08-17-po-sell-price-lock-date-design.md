# PO Sell Price-Lock Date Design

**Date:** 2026-08-17
**Status:** Approved for implementation by the user in this task

## Goal

แยกวันที่ล็อคราคา (business date) ออกจากวันที่สร้างเอกสาร (audit timestamp) ใน PO Sell ทุกจุดที่ผู้ใช้เห็นหรือใช้เป็น business filter โดยให้ `created_at` คงอยู่เฉพาะข้อมูล audit และไม่เพิ่มคอลัมน์ฐานข้อมูลใหม่

## Contract

| Field | Storage | Meaning | User-facing usage |
|---|---|---|---|
| `priceLockDate` | `po_sells.date` (`date`) | วันที่ผู้ใช้เลือกเพื่อเป็นวันที่ล็อคราคา | ฟอร์ม, list, detail, filter, sort, export, print, downstream business readers |
| `createdAt` | `po_sells.created_at` (`timestamptz`) | วันเวลา server ที่บันทึกเอกสารครั้งแรก | audit log/detail audit เท่านั้น |
| `createdBy` | `po_sells.created_by` | actor ที่สร้างเอกสาร | audit log/detail audit เท่านั้น |
| `updatedAt` | `po_sells.updated_at` | วันเวลาแก้ไขล่าสุด | audit log/detail audit เท่านั้น |
| `updatedBy` | `po_sells.updated_by` | actor ที่แก้ไขล่าสุด | audit log/detail audit เท่านั้น |
| `expectedDelivery` | `po_sells.expected_delivery` | วันที่กำหนดส่งมอบ | ฟอร์มและเอกสารเป็นข้อมูลคนละความหมายกับ price lock |

`priceLockDate` ต้องเป็นวันที่ `YYYY-MM-DD` ที่ผ่าน shared Zod schema และ backend validation; ห้าม fallback ไป `createdAt` เมื่อค่าไม่ครบหรือผิดรูปแบบ

## Date and document-number policy

- ผู้ใช้เลือก `priceLockDate` ได้ทั้งวันที่ย้อนหลังและอนาคตที่เป็นวันที่ถูกต้อง
- `po_sells.date` จะถูกบันทึกจาก `priceLockDate`
- `created_at` จะถูกสร้างจาก server clock แยกต่างหาก และไม่ถูกแก้เมื่อแก้ PO Sell
- เลข PO Sell และ prefix เดือนที่สร้างโดย `nextPoSellDocNo` จะอิง `priceLockDate` เพื่อให้เลขเอกสารสะท้อน business date เดียวกับเอกสาร
- VAT effective-rate lookup ที่รับวันที่เอกสารจะอิง `priceLockDate`; หาก implementation ของ `activeVatRatePercent` ใช้เพียงวันที่ lookup ปัจจุบัน ให้คง API เดิมแต่ส่ง lock-date context อย่างชัดเจน
- รายการเก่าที่ `date` เคยถูกเติมจาก `created_at` ให้ถือค่าเดิมเป็น legacy price-lock date; ไม่ทำ data backfill ใน batch นี้

## UI behavior

### Create/edit form

`/sales/po-sell` เพิ่ม `วันที่ล็อคราคา` เป็น required `DatePickerInput` ในกลุ่มข้อมูลเอกสาร ค่าเริ่มต้นของ create และ Sales Plan handoff เป็นวันที่ปัจจุบันตาม Bangkok date; edit โหลดจาก `row.priceLockDate`. `วันส่งมอบ` คงเป็นช่องแยกและไม่ถูกเปลี่ยนความหมาย

### List and mobile cards

Desktop table, mobile cards, sorting, pagination result, and date filters use `priceLockDate` and label it `วันที่ล็อคราคา`. The list no longer presents `createdAt` as the document date. `อัปเดตล่าสุด` remains an audit display from `updatedAt`/`updatedBy`.

### Detail modal

The document section shows `วันที่ล็อคราคา` and `วันส่งมอบ`. A separate audit section shows `สร้างโดย`, `สร้างเอกสารเมื่อ`, `แก้ไขล่าสุดโดย`, and `แก้ไขล่าสุดเมื่อ`, all sourced from audit fields. No fallback or duplicate ambiguous `วันที่สร้างรายการ` label remains in the document section.

## API behavior

- Shared `poSellFormSchema` and page schema require `priceLockDate`.
- POST maps `priceLockDate -> date`, while `created_at` and initial `updated_at` use server time.
- PATCH update maps `priceLockDate -> date`, preserves `created_at`, and updates only audit update fields.
- Cancel and short-close preserve both business date and creation audit date.
- GET response exposes both `priceLockDate` and `createdAt`; filters `from`/`to` query `po_sells.date`, and default ordering is `date desc, doc_no desc`.
- XLSX export exposes `วันที่ล็อคราคา` from `priceLockDate`; it does not relabel `createdAt` as a business date.

## Print behavior

PO Sell customer-facing print uses `priceLockDate` for the document date and labels it `วันที่ล็อคราคา`. `createdAt` is not shown as the document date or as a customer-facing approval date. If audit information is retained in a non-customer audit surface, it must be separately labelled as creation time and must not be confused with the price-lock date. Existing A4 pagination/layout and company-profile contracts remain unchanged.

## Downstream behavior

Readers that already use `po_sells.date` (Main Sales Control, Dual Costing, matching/aging/read models) continue to do so. No consumer may switch to `created_at` to obtain the business date. PO Sell remains a commitment and does not create AR, stock ledger, receipt, or bank side effects by itself.

## Validation and error behavior

- Client and server both reject missing/invalid `priceLockDate`.
- Field-level form error is shown and the first invalid field receives the existing form focus/scroll behavior.
- No compatibility fallback, silent coercion, or skip-row behavior is introduced.
- Existing permissions and downstream-lock rules for edit/cancel are unchanged.

## Tests and acceptance

Focused tests must cover schema, POST/PATCH date separation, immutable `created_at`, GET response/filter/order, list/detail wording, print date source, and XLSX date source. Workspace lint, type-check, production build, and `git diff --check` must pass. Browser UAT is not part of this code-only request unless separately requested.

## Scope exclusions

- No new database column or migration.
- No backfill or mutation of existing Production/SIT business rows.
- No change to PO Sell status, allocation, Sales Bill, stock, AR, or permission rules.
- No change to unrelated dirty WTI/WTO files in the current workspace.
