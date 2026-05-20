# Validation Rules

## Input Validation

For every new or changed form/API field, define validation before saving data:
- Required fields must be explicit in the shared schema and shown in the UI.
- Validate syntax for every input field, not just presence. Examples: email syntax, phone number shape, tax ID length/digits, numeric ranges, date format/order, enum membership, text length, and allowed characters for names/codes.
- Validate on both client-side form submission and server/API boundaries. Client validation is for UX; server validation is authoritative.
- For constrained fields, filter invalid characters while typing/pasting in addition to submit validation.
- Email inputs must strip/prevent non-ASCII characters.
- Phone inputs must strip/prevent letters and unsupported symbols, allowing only digits, spaces, dashes, parentheses, dots, and leading plus.
- Phone inputs must enforce 9-15 digits; do not allow more than 15 digits to remain in the field.
- Display Thai phone numbers in readable form where possible: 10-digit mobile numbers as `085-555-5555` and 9-digit local numbers as `02-555-5555`.
- Tax ID inputs must strip/prevent every non-digit character while typing/pasting. Do not let spaces, dashes, Thai letters, English letters, or punctuation remain in the field. For Thai party tax IDs, limit the input to 13 digits and validate the same rule again in the shared schema/API boundary.
- Thai postcode inputs must strip/prevent every non-digit character while typing/pasting and limit the visible value to 5 digits. Validate the same 5-digit rule again in the shared schema/API boundary.
- Bank account number inputs must strip/prevent every non-digit character while typing/pasting. Store account numbers as digits only; do not keep spaces, dashes, Thai letters, English letters, or punctuation in `account_no` / `bank_account` fields. Keep account holder/name fields separate and text-capable.
- Supplier receiving accounts must capture payment method first: `เงินสด` does not require bank/account fields, while `โอนเงิน` must validate bank and digit-only account number before save. Strip cash markers such as `เงินสด` from imported bank/account text instead of storing them in bank or account fields.
- Show field-level error messages in the form for all validation failures.
- Do not rely on HTML input types alone. Use Zod or the module's existing schema layer as the source of truth.
- Keep validation practical for Thai business data: allow Thai text where appropriate, but reject control characters, obviously invalid punctuation, malformed identifiers, and negative values where not allowed.

## Master Data List Pattern

For small/medium master data screens, prefer loading the master list once and doing table UX in the frontend:
- search in frontend
- filter in frontend
- sort in frontend
- count in frontend
- pagination in frontend

This applies to master/reference data such as customers, suppliers, products, branches, warehouses, currencies, channels, payment methods, machines, and production lines while row counts remain practical for a browser payload.

Keep DB/server-side filtering and pagination for:
- transaction lists
- stock ledger
- audit/activity logs
- reports
- very large master tables
- permission/branch-scope filtering that must not be trusted to the browser

Export may still call a server API that queries the database with the current search/filter/sort so the exported file matches the visible intent without depending on the current page slice.
