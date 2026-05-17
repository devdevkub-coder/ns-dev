# 04 Master Data Definition

## Objective

กำหนด master data และ key basic data ที่ต้องนิ่งก่อนเริ่ม transaction refactor

## Master Data Groups

### Organization

- company
- branches
- warehouses

### Commercial Parties

- customers
- suppliers
- salespersons

### Product Domain

- products
- product grade
- item status
- unit of measure

### Finance Domain

- accounts
- currencies
- payment methods
- expense categories
- remittance purposes

### Channel and Classification

- purchase channels
- sales channels
- transaction modes
- VAT / WHT flags

### Thai Address Reference

- provinces: `thai_provinces`
- districts / amphoes: `thai_districts`
- subdistricts / tambons: `thai_subdistricts`
- postal codes come from the selected subdistrict and should be auto-filled in forms

### Security

- app users
- roles
- permissions
- user branch access

## Key Basic Data to Define

- primary key strategy
- document number strategy
- branch scope rules
- warehouse scope rules
- product status model
- grade model
- account mapping rules
- tax behavior flags
- opening balance structure
- active/inactive semantics

## Source of Truth Rules

- master data ต้องมี source of truth เดียว
- ห้ามซ้ำระหว่าง frontend hardcode กับ DB
- identity และ security data ต้องไม่มีหลาย source โดยไม่จำเป็น

## Completion Checklist

- branch list approved
- warehouse list approved
- customer/supplier keys approved
- Thai address reference imported into dev-target and wired to customer form
- product structure approved
- account structure approved
- channel definitions approved
- role matrix approved
- company setup approved
- opening balance approach approved
