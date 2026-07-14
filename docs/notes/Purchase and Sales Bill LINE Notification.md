# Purchase, Sales Bill, Supplier Payment, and Customer Receipt LINE Notification

## Scope

This flow sends a LINE Flex Message after a new financial document is saved successfully from:

- `/purchase/bills` -> document type `PB` -> configured Purchase Bill LINE group
- `/sales/bills` -> document type `SB` -> configured Sales Bill LINE group
- `/purchase/payments` -> document type `PMT` -> configured Supplier Payment LINE group
- `/sales/receipts` -> document type `RCP` -> configured Customer Receipt LINE group

WTI/WTO notifications remain owned by the confirmed weight-ticket flow and route to the configured receipt/delivery group.

## What is what

- `line_targets` is the registry of LINE groups known through the webhook.
- `line_notification_rules` maps document types (`WTI`, `WTO`, `PB`, `SB`, `PMT`, `RCP`) to a target group.
- `line_notification_jobs` is the post-commit delivery queue and retry record.
- `line_notification_attempts` records each delivery attempt.
- `purchase_bill`, `sales_bill`, `purchase_payment`, and `customer_receipt` are notification source types; `PB`, `SB`, `PMT`, and `RCP` are the routing document types.

## Trigger and failure policy

The trigger is a committed new financial event: a new PB, a new SB, a posted PMT, or an RCP that becomes active. Auto-created pending RCP rows do not notify. Cancelling an RCP does not notify; cancel-and-reissue sends only the newly issued RCP number after the replacement transaction commits.

Notification work runs after the business transaction commits. A LINE or routing failure must not roll back a valid bill, supplier payment, or customer receipt. Failed delivery stays visible in the existing LINE job/attempt history and follows the existing retry policy.

## Routing contract

| Document type | Intended target |
|---|---|
| `WTI`, `WTO` | Receipt/delivery group |
| `PB` | Purchase Bill group |
| `SB` | Sales Bill group |
| `PMT` | Supplier Payment group |
| `RCP` | Customer Receipt group |

PB/SB/PMT/RCP use explicit rules only. If no matching rule exists, the system creates no delivery job; it must not fall back to a default target or broadcast to every active group. This fail-closed rule prevents financial documents from leaking into the wrong LINE group.

The same LINE Official Account can be invited to all groups. Each group is registered by its own LINE target ID after the bot receives a webhook event.

## Flex Message content

The PB and SB cards use the same compact dark-card language while keeping bill-specific labels.

- document type, document number, document date, and counterparty
- branch and warehouse/channel information when available
- at most five product rows, followed by an `อีก N รายการ` summary
- bill total and actual paid/received balance state
- button linking to `/purchase/bills/[docNo]` or `/sales/bills/[docNo]`

Do not include tax IDs, bank accounts, COGS, gross profit, or other internal cost fields in LINE messages.

The PMT card is an aggregated payment snapshot because one outward PMT can contain several payment rows/PMA allocations. It shows the PMT number and status, payment date and branch, payee, payment method, destination bank with only the final four account digits, PMA/source documents, company payout accounts, paid amount, discount, withholding tax, fee, net cash out, note, and an open-system button. Repeated PMA and payout-account lists are capped with a remaining-count summary. It never exposes internal payment IDs, voucher IDs, source IDs, tax IDs, or full account numbers. The PMT bubble uses LINE size `mega`; detail labels wrap in a 3:4 label/value layout so financial headings are not replaced by ellipses.

The RCP card is an aggregated receipt snapshot because one outward RCP can allocate one customer receipt across several Sales Bills and company receiving accounts. It shows the RCP number/status/date/branch, customer, primary payment-method snapshot, capped SB allocation breakdowns, capped receiving-account rows, gross receipt, discount, withholding tax, AR reduction, bank fee, net cash in, note, and an open-system button. It uses the same `mega` bubble and wrapped 3:4 detail labels as PMT. After customer readability feedback, RCP keeps the dark header but uses a light high-contrast body and white footer; LINE's native font is retained because Flex does not support custom font families. Labels remain bold `sm`, ordinary details stay `sm`, and only the customer, key totals, list identities/amounts, and status use selective `md/bold` emphasis. The financial green is `#047857`, which clears normal-text contrast on both light surfaces. A full-width rectangular multicolor highlight treatment was trialed from the supplied reference, but the user chose the earlier light-green rounded tabs as final. The three tabs label `SB / ตัดลูกหนี้`, `บัญชีบริษัทที่รับเงิน`, and `สรุปยอดรับเงิน`; they group content without filling the individual financial rows. It never selects or renders full account numbers, internal receipt/allocation/statement IDs, tax IDs, or customer contact/address fields.

## Why it has to work this way

The saved PB/SB establishes AP/AR, the saved PMT records actual supplier cash out, and the active RCP records actual customer cash in plus AR reduction; each committed transaction is therefore the earliest reliable notification point for its document. Routing by document type keeps operational weight tickets separate from financial documents. Queueing and retry keep LINE availability outside the business transaction, so an external messaging outage cannot damage ERP data.

## Configuration checklist

1. Invite the existing LINE bot to the receipt/delivery, Purchase Bill, Sales Bill, Supplier Payment, and Customer Receipt groups.
2. Send a message in each group so the webhook registers its target ID.
3. In `/admin/line-settings`, create explicit rules for `WTI,WTO`, `PB`, `SB`, `PMT`, and `RCP` and select the intended target for each rule.
4. Set `stop after match` for the one-group-per-document policy.
5. Create one PB, one SB, one PMT, and one active RCP in the development target and verify the job, attempt log, target group, and detail link.

## Admin setup UX

The rule form at `/admin/line-settings` keeps the normal setup to two required choices: select one or more document types, then select an active LINE group. WTI/WTO and PB/SB/PMT/RCP are kept in separate rule categories so weight-ticket-only conditions cannot silently block financial-document delivery. The system generates the rule name automatically and new rules default to one destination after the first match. Branch, priority, weight, and photo conditions remain under optional advanced settings; weight and photo conditions are available only for WTI/WTO because PB/SB/PMT/RCP do not carry that matching context. The API rechecks that the destination is an active LINE group and that selected branch codes are active before saving.

The add/edit rule form uses the shared application dialog so typography and switch sizing are not distorted by page-level LINE settings overrides. The normal view shows only document type and destination group; advanced settings stay collapsed by default and show a small marker when existing optional conditions are present. Status and save/cancel actions stay in the sticky footer so long advanced forms do not move the primary actions out of view.

LINE target avatars are loaded only from the exact `https://sprofile.line-scdn.net` origin allowed by the application CSP. Target rows render avatars inside fixed-size wrappers with a group/room/user initial underneath; if a CDN URL later expires or fails, the image hides and the initial remains without changing table-row height.

## Dev-target verification (2026-07-13)

Dev-target `fhglqymcdmrgbsbadnwr` uses active test LINE groups for five separate rules:

- `WTI,WTO` -> `ทดสอบ`
- `PB` -> `ทดสอบ`
- `SB` -> `Peach, NAMPEC Official, Meng Watcharathat🤖`
- `PMT` -> `ทดสอบ`
- `RCP` -> `ทดสอบ`

Split-group live delivery verification succeeded for Purchase Bill `PB012607-0013` and Sales Bill `SB2607-0011`. Both jobs reached `status = sent` and recorded one successful attempt; PB resolved to `ทดสอบ` while SB resolved to `Peach, NAMPEC Official, Meng Watcharathat🤖`. These are temporary test mappings; change only each rule's target when the dedicated customer groups are registered.

The PMT rule was created independently with `stop after match` and the real resolver returned only `ทดสอบ` for document type `PMT`. A read-only check against the latest dev-target PMT loaded its PMA and payout-account snapshots, reconciled account splits to net cash out, rendered a 4,870-byte Flex payload, retained only the final four destination-account digits, and produced the history link. The official LINE push validator returned HTTP 200 for the capped six-PMA/six-account case. Live delivery of `PMT012607-0007` then reached `status = sent` in `ทดสอบ`; after screenshot review, the final `mega`/wrapped-label revision was sent and LINE accepted it.

The RCP rule was created independently with `stop after match`; no prior or duplicate RCP rule existed, and the real loader/resolver returned only `ทดสอบ`. The latest active RCP had one active SB allocation and one positive bank-statement row; receipt, discount, WHT, AR-allocation, fee, net-cash, and statement totals all reconciled. The payload privacy check found no account-number, tax, contact, address, or internal-ID fields, and the official LINE push validator returned HTTP 200. Live job `168` reached `sent` on attempt 1 with one successful HTTP 200 attempt and no duplicate source-target job.

Dev-target has no `NEXT_PUBLIC_APP_URL`, so the verified live RCP card used `http://localhost:3000` for its open-system button. The message itself is valid and delivered, but the button cannot work from a phone until the real public URL for this environment is configured; do not reuse the UAT URL by assumption.
