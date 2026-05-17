---
name: ns-scrap-erp-input-validation
description: Project-specific validation checklist for NS Scrap ERP forms, API payloads, master data, and customer/business records. Use when adding or changing any input field, Zod schema, form, API mutation, or database-backed write flow.
---

# NS Scrap ERP Input Validation

Follow `AGENTS.md` first. This skill expands the project rule that every new or changed input field needs syntax validation before data is saved.

## Required Workflow

1. Identify every input field touched by the change, including hidden/derived fields and API-only payload fields.
2. Define required vs optional explicitly in the shared schema layer, usually Zod.
3. Validate syntax for every field, not only presence.
4. Reuse the same schema at the server/API boundary. Client-side validation is for UX; server-side validation is authoritative.
5. Show field-level errors in the UI for all validation failures.
6. Keep database changes additive unless the user explicitly approves stricter constraints that can reject existing rows.
7. Run lint, type-check, and a build or targeted test before calling the change complete.

## Field Syntax Checklist

- Names: allow Thai/English letters, spaces, dots, hyphens, and apostrophes where appropriate; reject numbers and random symbols for person names.
- Company/business names: allow Thai/English letters, numbers, spaces, and common business punctuation; reject control characters.
- Email: validate email syntax and ASCII-safe address format; use server-side domain/MX checks when the user wants real domain validation.
- Phone: validate phone shape and digit count; allow common separators such as spaces, dashes, parentheses, and leading plus.
- Tax ID: validate expected digit length before saving.
- Codes/IDs: validate allowed characters and length; prefer stable machine-safe characters.
- Numbers/money/percentages: validate min/max, integer vs decimal, and reject negative values unless the business rule allows them.
- Dates: validate format, valid calendar dates, and start/end ordering.
- Enums/selects: validate against known values, never trust UI options alone.
- Addresses/notes: allow practical Thai business text, but reject control characters and unreasonable length.

## Thai Business Data

Validation should be strict enough to prevent malformed data, but not so strict that real Thai business names or addresses are blocked. When unsure, prefer field-level syntax rules plus server-side schema validation over database `not null` or `check` constraints until legacy rows are reconciled.

## Thai Address Form Pattern

For Thai address forms, use postcode-first entry:

1. Put `รหัสไปรษณีย์` before `จังหวัด`, `อำเภอ/เขต`, and `ตำบล/แขวง`.
2. When a 5-digit postcode is entered, filter address choices to matching records.
3. If the postcode maps to one province, auto-fill `จังหวัด`.
4. If it maps to one district, auto-fill `อำเภอ/เขต`.
5. If it maps to one subdistrict, auto-fill `ตำบล/แขวง`.
6. If multiple records match, keep the dropdown enabled but restrict options to that postcode.
7. Preserve the selected postcode when changing province/district/subdistrict unless the new selection has a known postcode.
8. Keep address syntax validation practical: postcode must be 5 digits, Thai address text may include Thai/English text, numbers, spaces, and normal address punctuation, but must reject control characters and unreasonable length.

Recommended visible order:

```text
รหัสไปรษณีย์
จังหวัด
อำเภอ/เขต
ตำบล/แขวง
บ้านเลขที่
หมู่
หมู่บ้าน/อาคาร
ถนน
ประเทศ
ที่อยู่เต็ม/หมายเหตุที่อยู่
```
