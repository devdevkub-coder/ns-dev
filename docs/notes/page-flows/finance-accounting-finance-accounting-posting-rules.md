---
title: Posting Rules Page Flow
tags:
  - page-flow
  - menu
  - finance-accounting
  - posting-rules
status: accepted-baseline
updated: 2026-06-24
route: /finance-accounting/posting-rules
---

# Posting Rules Page Flow

## Scope

| Field | Value |
|---|---|
| Menu section | Finance Accounting |
| Route | `/finance-accounting/posting-rules` |
| Page | Posting Rules |
| Current Next | direct FA5 policy/readiness page baseline |

## Canonical References

[[Finance Accounting Flow]], [[Finance And Accounting Menu Summary]], `docs/migration/23-finance-accounting-fa5-hardening-contract.md`

## Page Purpose

หน้า Posting Rules เป็น readiness/mapping surface สำหรับกำหนดว่า source document หรือ movement ประเภทใดจะ map ไป account ใดเมื่อเปิด GL/statutory posting ในอนาคต.

สถานะปัจจุบันยังไม่ post GL อัตโนมัติ และไม่ควรทำให้ report page กลายเป็น accounting journal source.

## Page Responsibilities

- แสดง source-to-account mapping ที่จำเป็นก่อนเปิด GL/statutory close.
- ตรวจ completeness ของ mapping ต่อ source type เช่น Sales, Purchase, Stock, Bank, Asset, Loan, Tax, Equity.
- แยก rule ของ management report ออกจาก rule ของ statutory GL.
- แสดง readiness issue เมื่อ source type ยังไม่มี mapping.
- เป็น policy/readiness page สำหรับ FA5 hardening.

## Non-Responsibilities

- ไม่สร้าง GL journal เองใน runtime ปัจจุบัน.
- ไม่แก้ source document/fact เช่น `SB`, `PB`, `stock_ledger`, `bank_statement`, `assets`, `loans`.
- ไม่คำนวณ AR/AP/Stock/WAC แทน source owner.
- ไม่เปิด fallback account mapping แบบเงียบเมื่อ rule หาย.

## Target Rule Groups

| Group | Example source | Target mapping concern |
|---|---|---|
| Sales | `SB`, `RCP`, customer advance allocation | revenue, AR, VAT output, cash/bank, advance liability |
| Purchase | `PB`, `PMT`, supplier advance allocation | inventory/expense, AP, VAT input, cash/bank, advance asset |
| Stock | `stock_ledger`, WAC/COGS, status convert | inventory account, COGS, adjustment gain/loss |
| Bank/Cash | `bank_statement`, transfer, correction | cash/bank/OD/FCD account and movement classification |
| Assets | acquisition, depreciation, disposal | asset cost, accumulated depreciation, depreciation expense, gain/loss |
| Loans | loan schedule/payment/interest | principal, interest, current/non-current liability |
| Tax | VAT/WHT facts | tax payable/receivable and filing readiness |
| Equity | opening/equity/year close | capital, retained earnings, current year profit/loss |

## Data Contract

- Missing mapping must be visible as readiness issue, not silently defaulted.
- Rule must refer to stable source type and outward business meaning, not UI labels only.
- Mapping changes need audit because they affect future close/posting.
- Historical reports must keep the rule version or snapshot used at close time once GL/statutory posting is enabled.

## Close / Freeze Direction

- Posting Rules must be complete before enabling GL/statutory period close.
- Once a period is locked, mappings used for that period must not be edited in place.
- Any mapping correction after close should create a new version and require reopen/repost or adjustment policy.

## Current Gap

- No normalized GL journal/posting layer is active yet.
- Rule versioning and audit are not finalized.
- Runtime reports currently derive management numbers from operational facts/helpers, not from posted GL.
- No source-to-account enforcement is wired into transaction write APIs.

## Implementation Checklist

- [x] Document page purpose and target rule groups
- [x] Add direct Next route that explains source-to-account rule groups, readiness controls, GL/report boundaries, and pending hardening work without enabling write/posting actions
- [ ] Define posting rule schema/versioning/audit
- [ ] Define required mapping list per source type
- [ ] Define readiness check API
- [ ] Define relationship to Accounting Periods lock/close
- [ ] Keep GL/statutory posting separate from current management report helpers
