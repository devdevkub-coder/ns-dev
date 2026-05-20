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
- Email: validate email syntax and ASCII-safe address format; email inputs must also prevent or strip non-ASCII characters during typing/paste so Thai or other Unicode characters cannot remain in the field before submit. Use server-side domain/MX checks when the user wants real domain validation.
- Phone: validate phone shape and digit count; phone inputs must also prevent or strip letters and unsupported symbols during typing/paste, allowing only digits, spaces, dashes, parentheses, dots, and leading plus. Phone inputs must enforce 9-15 digits and must not allow more than 15 digits to remain in the field. When displaying Thai phone numbers, format readable 10-digit mobile numbers as `085-555-5555` and 9-digit local numbers as `02-555-5555` where possible.
- Tax ID: validate expected digit length before saving.
- Thai postcode: strip every non-digit character while typing/pasting, cap the value at 5 digits, and validate the same 5-digit rule in the shared schema/API boundary.
- Bank account number: strip every non-digit character while typing/pasting and store account numbers as digits only. Do not keep spaces, dashes, Thai letters, English letters, or punctuation in `account_no` / `bank_account` fields. Keep account holder/name fields separate and text-capable.
- Supplier receiving accounts: choose payment method before account fields. `เงินสด` does not require bank/account data; `โอนเงิน` must require a bank and digit-only account number. Imported cash markers such as `เงินสด` must be stripped from bank/account fields.
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
2. While typing or pasting `รหัสไปรษณีย์`, keep only digits and cap the value at 5 digits.
3. When a 5-digit postcode is entered, filter address choices to matching records.
4. If the postcode maps to one province, auto-fill `จังหวัด`.
5. If it maps to one district, auto-fill `อำเภอ/เขต`.
6. If it maps to one subdistrict, auto-fill `ตำบล/แขวง`.
7. If multiple records match, keep the dropdown enabled but restrict options to that postcode.
8. Preserve the selected postcode when changing province/district/subdistrict unless the new selection has a known postcode.
9. Keep address syntax validation practical: postcode must be 5 digits, Thai address text may include Thai/English text, numbers, spaces, and normal address punctuation, but must reject control characters and unreasonable length.

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
