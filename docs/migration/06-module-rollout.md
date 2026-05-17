# 06 Module Rollout

## Objective

กำหนดลำดับ rollout ตาม business dependency และความเสี่ยง

## Rollout Order

### Wave 1: Foundation

- auth
- app users
- roles / permissions
- company setup
- branch / warehouse

### Wave 2: Master Data

- customers
- suppliers
- products
- accounts
- channels
- currencies
- expense categories

### Wave 3: Core Transaction

- purchase
- sales
- payments
- receipts
- transfer

### Wave 4: Inventory Control

- stock transaction model
- stock balance
- stock adjustments
- returns
- grade adjustment

### Wave 5: Operational Finance

- expense
- AR/AP
- cash/bank statement
- opening balances

### Wave 6: Advanced Business

- production
- dual costing
- trading
- overseas finance
- bank reconciliation

### Wave 7: Reporting

- management dashboard
- P&L / balance sheet / cash flow
- tracking reports

## Gate Criteria

ก่อนขึ้น wave ถัดไปต้องมี:
- schema ready
- migration mapping ready
- test cases ready
- reconciliation query ready
- business sign-off ของ module ก่อนหน้า
