**NS SCRAP TRADING ERP**  
**Business Requirement Document**  
**(BRD)**  
---

Physical Commodity Trading System  
Inventory Management System  
Procurement & Sales Management  
Financial & Payment Management

Version 1.0  
May 2026

**Prepared For**  
New Solutions (Thailand) Co., Ltd.

# 

# 

**Prepared By**  
Business Analysis Team  
---

# 

# **สารบัญ** {#สารบัญ}

**[สารบัญ	2](#สารบัญ)**

[**NS Scrap Trading ERP	8**](#ns-scrap-trading-erp)

[Business Requirement Document (BRD)	8](#business-requirement-document-\(brd\))

[1\. Project Information	8](#project-information)

[2\. Document Revision History	8](#document-revision-history)

[3\. Document Approval	9](#document-approval)

[4\. Project Objective	9](#project-objective)

[5\. Scope ขอบเขตการพัฒนา Phase 1	10](#scope-ขอบเขตการพัฒนา-phase-1)

[6\. User Roles	10](#user-roles)

[7\. Functional Requirement	11](#functional-requirement)

[7.1. การจัดการระบบ (System Administration)	11](#การจัดการระบบ-\(system-administration\))

[7.2. การเข้าสู่ระบบ (Login)	11](#การเข้าสู่ระบบ-\(login\))

[Purpose	11](#purpose)

[Features	11](#features)

[Main Flow	12](#main-flow)

[Business Rules	14](#business-rules)

[7.3. ระบบบันทึกรายการประจำวัน (Daily Operations)	15](#ระบบบันทึกรายการประจำวัน-\(daily-operations\))

[7.3.1. Weight Ticket (ใบรับของ)	15](#weight-ticket-\(ใบรับของ\))

[Purpose	15](#purpose-1)

[Features	15](#features-1)

[Main Flow	16](#main-flow-1)

[Business Rules	19](#business-rules-1)

[หน้ารายการใบชั่งเข้า/ออก	20](#หน้ารายการใบชั่งเข้า/ออก)

[Summary Dashboard Cards	20](#summary-dashboard-cards)

[ค้นหา	20](#ค้นหา)

[รายการใบชั่ง	21](#รายการใบชั่ง)

[ปุ่มสำหรับแต่ละรายการในตารางใบชั่ง	21](#ปุ่มสำหรับแต่ละรายการในตารางใบชั่ง)

[รายการสินค้า	22](#รายการสินค้า)

[หน้าเพิ่มและแก้ไขใบชั่งเข้า/ออก	23](#หน้าเพิ่มและแก้ไขใบชั่งเข้า/ออก)

[Direction Selector	23](#direction-selector)

[Basic Information Fields	23](#basic-information-fields)

[Product Items Section	24](#product-items-section)

[Bottom Actions	24](#bottom-actions)

[Printing	25](#printing)

[สรุปน้ำหนัก](#สรุปน้ำหนัก-สรุปน้ำหนักรวมของรายการสินค้าต่างๆ)  
[สรุปน้ำหนักรวมของรายการสินค้าต่างๆ	26](#สรุปน้ำหนัก-สรุปน้ำหนักรวมของรายการสินค้าต่างๆ)

[ส่วนหมายเหตุ	26](#ส่วนหมายเหตุ)

[ลายเซ็นต์	26](#ลายเซ็นต์)

[Attachment Image Section	26](#attachment-image-section)

[7.3.2. Purchase Receipt (บิลรับซื้อ)	27](#purchase-receipt-\(บิลรับซื้อ\))

[Purpose	27](#purpose-2)

[Features	27](#features-2)

[Main Flow	28](#main-flow-2)

[Business Rules	30](#business-rules-2)

[หน้ารายการบิลรับซื้อ	31](#หน้ารายการบิลรับซื้อ)

[ค้นหา	31](#ค้นหา-1)

[รายการตารางบิลซื้อ	31](#รายการตารางบิลซื้อ)

[Action Buttons	32](#action-buttons)

[หน้าเพิ่ม/แก้ไขบิลรับซื้อ	32](#หน้าเพิ่ม/แก้ไขบิลรับซื้อ)

[Basic Information Fields	32](#basic-information-fields-1)

[รายการสินค้า	33](#รายการสินค้า-1)

[Weight Formula	35](#weight-formula)

[ส่วนสรุปราคา	35](#ส่วนสรุปราคา)

[Bottom Actions	36](#bottom-actions-1)

[7.3.3. Sales Bill (บิลขาย)	37](#sales-bill-\(บิลขาย\))

[Purpose	37](#purpose-3)

[Features	37](#features-3)

[Main Flow	38](#main-flow-3)

[Business Rules	42](#business-rules-3)

[หน้าแสดงรายการบิลขาย	43](#หน้าแสดงรายการบิลขาย)

[Summary Dashboard Cards	43](#summary-dashboard-cards-1)

[Search / Filter Section	43](#search-/-filter-section)

[รายการบิลขาย	43](#รายการบิลขาย)

[Action Buttons	44](#action-buttons-1)

[หน้าเพิ่มบิลขาย	44](#หน้าเพิ่มบิลขาย)

[Basic Information Fields	44](#basic-information-fields-2)

[Product Items Section	45](#product-items-section-1)

[Bottom Actions	46](#bottom-actions-2)

[7.3.4. Pending Sale Release (เบิกออกรอบิล)	47](#pending-sale-release-\(เบิกออกรอบิล\))

[Purpose	47](#purpose-4)

[Features	47](#features-4)

[Main Flow	48](#main-flow-4)

[Business Rules	49](#business-rules-4)

[หน้าแสดงรายการ Pending Sale	49](#หน้าแสดงรายการ-pending-sale)

[Header Summary Cards	49](#header-summary-cards)

[Search / Filter Section	49](#search-/-filter-section-1)

[List Table Fields	50](#list-table-fields)

[Action Buttons	50](#action-buttons-2)

[หน้าเพิ่ม/แก้ไข Pending Sale	51](#หน้าเพิ่ม/แก้ไข-pending-sale)

[Basic Information Section	51](#basic-information-section)

[Product Item Fields	51](#product-item-fields)

[Summary Section	51](#summary-section)

[Bottom Actions	52](#bottom-actions-3)

[7.3.5. Payment Approval (อนุมัติโอนเงิน)	53](#payment-approval-\(อนุมัติโอนเงิน\))

[Purpose	53](#purpose-5)

[Features	53](#features-5)

[Main Flow	54](#main-flow-5)

[Business Rules	56](#business-rules-5)

[หน้าอนุมัติการจ่ายเงิน	56](#หน้าอนุมัติการจ่ายเงิน)

[Header Summary Section	56](#header-summary-section)

[Tabs	56](#tabs)

[Search / Filter Section	57](#search-/-filter-section-2)

[Action Buttons	57](#action-buttons-3)

[ตารางรายการอนุมัติการโอนเงิน	57](#ตารางรายการอนุมัติการโอนเงิน)

[ตารางค่าใช้จ่าย	58](#ตารางค่าใช้จ่าย)

[ตารางจ่ายเงินล่วงหน้าหรือเงินมัดจำ	59](#ตารางจ่ายเงินล่วงหน้าหรือเงินมัดจำ)

[7.3.6. Supplier Payment (จ่ายเงิน Supplier)	60](#supplier-payment-\(จ่ายเงิน-supplier\))

[Purpose	60](#purpose-6)

[Features	60](#features-6)

[Main Flow	61](#main-flow-6)

[Business Rules	63](#business-rules-6)

[หน้าจ่ายเงิน Supplier	63](#หน้าจ่ายเงิน-supplier)

[Summary Cards	63](#summary-cards)

[Search Section	63](#search-section)

[Outstanding Bill Table Fields	63](#outstanding-bill-table-fields)

[Action Button	64](#action-button)

[สร้าง Payment Voucher	64](#สร้าง-payment-voucher)

[Basic Information Fields	64](#basic-information-fields-3)

[รายการจ่าย	66](#รายการจ่าย)

[Calculation Fields	66](#calculation-fields)

[Summary Fields	66](#summary-fields)

[Bottom Actions	67](#bottom-actions-4)

[7.3.7. Payment History (ประวัติการจ่ายเงิน)	68](#payment-history-\(ประวัติการจ่ายเงิน\))

[Purpose	68](#purpose-7)

[Features	68](#features-7)

[Main Flow	69](#main-flow-7)

[Business Rules	70](#business-rules-7)

[หน้าประวัติการจ่ายเงิน](#หน้าประวัติการจ่ายเงิน-summary-cards)  
[Summary Cards	70](#หน้าประวัติการจ่ายเงิน-summary-cards)

[Fields \- Search & Filter	70](#fields---search-&-filter)

[ตารางประวัติการจ่ายเงิน	71](#ตารางประวัติการจ่ายเงิน)

[7.3.8. Receipt Voucher (ใบสำคัญรับเงิน)	72](#receipt-voucher-\(ใบสำคัญรับเงิน\))

[Purpose	72](#purpose-8)

[Features	72](#features-8)

[Main Flow	73](#main-flow-8)

[Business Rules	75](#business-rules-8)

[หน้าแสดงรายการ (List Page)	75](#หน้าแสดงรายการ-\(list-page\))

[Search / Filter	75](#search-/-filter)

[ตารางรายการ	75](#ตารางรายการ)

[Popup เพิ่ม / แก้ไข ใบสำคัญรับเงิน	76](#popup-เพิ่ม-/-แก้ไข-ใบสำคัญรับเงิน)

[Section : ดึงข้อมูลจากบิลซื้อ	76](#section-:-ดึงข้อมูลจากบิลซื้อ)

[Section : ข้อมูลเอกสาร	76](#section-:-ข้อมูลเอกสาร)

[Section : ผู้รับเงิน (Supplier บุคคล / นิติบุคคล)	76](#section-:-ผู้รับเงิน-\(supplier-บุคคล-/-นิติบุคคล\))

[Section : รายการ	77](#section-:-รายการ)

[Detail Row	77](#detail-row)

[Summary	77](#summary)

[Section : จำนวนเงินตัวอักษร	78](#section-:-จำนวนเงินตัวอักษร)

[Section : การรับเงิน	78](#section-:-การรับเงิน)

[Section : หมายเหตุ	78](#section-:-หมายเหตุ)

[Section : ลายเซ็น	78](#section-:-ลายเซ็น)

[ปุ่มการทำงาน	78](#ปุ่มการทำงาน)

[7.3.9. Customer Receipt (รับเงินลูกค้า)	79](#customer-receipt-\(รับเงินลูกค้า\))

[Purpose	79](#purpose-9)

[Features	79](#features-9)

[Main Flow	80](#main-flow-9)

[Business Rules	81](#business-rules-9)

[หน้าหลัก (Customer Receipt Dashboard)	81](#หน้าหลัก-\(customer-receipt-dashboard\))

[Dashboard Summary	81](#dashboard-summary)

[Search & Filter	81](#search-&-filter)

[ตารางบิลค้างรับ	81](#ตารางบิลค้างรับ)

[Customer ค้างรับมากสุด (Top 10\)	82](#customer-ค้างรับมากสุด-\(top-10\))

[ประวัติ Receipt Voucher	82](#ประวัติ-receipt-voucher)

[Popup สร้าง / แก้ไข Receipt Voucher	83](#popup-สร้าง-/-แก้ไข-receipt-voucher)

[ข้อมูลส่วนหัว	83](#ข้อมูลส่วนหัว)

[รายการรับเงิน	83](#รายการรับเงิน)

[Summary	84](#summary-1)

[Action Buttons	84](#action-buttons-4)

[7.3.10. Transfer Between Accounts (โอนเงินระหว่างบัญชี)	85](#transfer-between-accounts-\(โอนเงินระหว่างบัญชี\))

[Purpose	85](#purpose-10)

[Features	85](#features-10)

[Main Flow	86](#main-flow-10)

[Business Rules	88](#business-rules-10)

[หน้าหลัก (Transfer Between Accounts)	88](#หน้าหลัก-\(transfer-between-accounts\))

[Search & Filter	88](#search-&-filter-1)

[ตารางรายการโอนเงิน	88](#ตารางรายการโอนเงิน)

[Summary	89](#summary-2)

[Popup เพิ่ม / แก้ไข โอนเงินระหว่างบัญชี	89](#popup-เพิ่ม-/-แก้ไข-โอนเงินระหว่างบัญชี)

[ข้อมูลส่วนหัว	89](#ข้อมูลส่วนหัว-1)

[Action Buttons	90](#action-buttons-5)

[7.3.11. Expense Voucher (ค่าใช้จ่าย)	91](#expense-voucher-\(ค่าใช้จ่าย\))

[Purpose	91](#purpose-11)

[Features	91](#features-11)

[Main Flow	92](#main-flow-11)

[Business Rules	94](#business-rules-11)

[หน้าหลัก (Expense Voucher List)	94](#หน้าหลัก-\(expense-voucher-list\))

[Search & Filter	94](#search-&-filter-2)

[ตารางรายการค่าใช้จ่าย	95](#ตารางรายการค่าใช้จ่าย)

[Popup สร้าง / แก้ไข Expense Voucher	96](#popup-สร้าง-/-แก้ไข-expense-voucher)

[ข้อมูลส่วนหัว (Header)	96](#ข้อมูลส่วนหัว-\(header\))

[ข้อมูลบัญชีปลายทาง (สำหรับโอน)	96](#ข้อมูลบัญชีปลายทาง-\(สำหรับโอน\))

[รายการค่าใช้จ่าย	96](#รายการค่าใช้จ่าย)

[Summary	97](#summary-3)

[Action Buttons	97](#action-buttons-6)

[7.3.12. Petty Cash / Director Advance (เงินสำรองจ่าย / กู้กรรมการ)	98](#petty-cash-/-director-advance-\(เงินสำรองจ่าย-/-กู้กรรมการ\))

[Purpose	98](#purpose-12)

[Features	98](#features-12)

[Main Flow	99](#main-flow-12)

[Business Rules	100](#business-rules-12)

[หน้าหลัก	100](#หน้าหลัก)

[Dashboard Summary	100](#dashboard-summary-1)

[Top 10 ผู้รับเงินที่ค้างคืน	100](#top-10-ผู้รับเงินที่ค้างคืน)

[Search & Filter	101](#search-&-filter-3)

[ตารางรายการ	101](#ตารางรายการ-1)

[Popup เพิ่ม / แก้ไข เงินสำรองจ่าย	102](#popup-เพิ่ม-/-แก้ไข-เงินสำรองจ่าย)

[ข้อมูลส่วนหัว	102](#ข้อมูลส่วนหัว-2)

[รายละเอียด Field	102](#รายละเอียด-field)

[Action Buttons	103](#action-buttons-7)

[7.3.13. Expense Dashboard (แดชบอร์ดค่าใช้จ่าย)	104](#expense-dashboard-\(แดชบอร์ดค่าใช้จ่าย\))

[Purpose	104](#purpose-13)

[Features	104](#features-13)

[Main Flow	105](#main-flow-13)

[Business Rules	106](#business-rules-13)

[หน้าหลัก	106](#หน้าหลัก-1)

[ตัวเลือกช่วงวิเคราะห์	106](#ตัวเลือกช่วงวิเคราะห์)

[Dashboard Summary	106](#dashboard-summary-2)

[สถานะการวิเคราะห์	107](#สถานะการวิเคราะห์)

[ตารางเปรียบเทียบค่าใช้จ่าย	107](#ตารางเปรียบเทียบค่าใช้จ่าย)

[แถวสรุปรวม	108](#แถวสรุปรวม)

[เกณฑ์ตรวจจับความผิดปกติ (จากหมายเหตุด้านล่างจอ)	108](#เกณฑ์ตรวจจับความผิดปกติ-\(จากหมายเหตุด้านล่างจอ\))

[7.3.14. Stock Transfer Between Branches (โอนสินค้าระหว่างสาขา)	109](#stock-transfer-between-branches-\(โอนสินค้าระหว่างสาขา\))

[Purpose	109](#purpose-14)

[Features	109](#features-14)

[Main Flow	110](#main-flow-14)

[Business Rules	111](#business-rules-14)

[หน้าหลัก (Transfer List)	111](#หน้าหลัก-\(transfer-list\))

[Search & Filter	111](#search-&-filter-4)

[Summary	111](#summary-4)

[ตารางรายการโอน	112](#ตารางรายการโอน)

[Popup เพิ่ม / แก้ไข การโอนสินค้า	112](#popup-เพิ่ม-/-แก้ไข-การโอนสินค้า)

[ข้อมูลเอกสาร	112](#ข้อมูลเอกสาร)

[ข้อมูลต้นทาง	112](#ข้อมูลต้นทาง)

[ข้อมูลปลายทาง	113](#ข้อมูลปลายทาง)

[รายการสินค้า	113](#รายการสินค้า-2)

[ผู้เกี่ยวข้อง	113](#ผู้เกี่ยวข้อง)

[Action Buttons	113](#action-buttons-8)

[7.3.15. Supplier Price Change History (ประวัติการเปลี่ยน Supplier)	114](#supplier-price-change-history-\(ประวัติการเปลี่ยน-supplier\))

[Purpose	114](#purpose-15)

[Features	114](#features-15)

[Main Flow	115](#main-flow-15)

[Business Flow	116](#business-flow)

[หน้าหลัก	116](#หน้าหลัก-2)

[Summary Section	116](#summary-section-1)

[Search Section	116](#search-section-1)

[ตารางประวัติการเปลี่ยนแปลง	116](#ตารางประวัติการเปลี่ยนแปลง)

[Footer Summary	117](#footer-summary)

# 

# 

# **NS Scrap Trading ERP** {#ns-scrap-trading-erp}

## **Business Requirement Document (BRD)** {#business-requirement-document-(brd)}

---

1. ## **Project Information** {#project-information}

|   | NS Scrap Commodity Trading ERP |
| :---- | :---- |
| Business Type | Physical Commodity Trading / Scrap / Inventory |
| Version | 1.0 |
| Date | 24/05/2026 |
| Target Go-live | TBD |
|  |  |

2. ## **Document Revision History**  {#document-revision-history}

| Version | Date | Author | Description | Remark |
| ----- | ----- | ----- | ----- | ----- |
| 0.1 | 24/05/2026 | BA Team | Initial Draft | Draft |
|  |  |  |  |  |
|  |  |  |  |  |
|  |  |  |  |  |

3. ## **Document Approval** {#document-approval}

| Role | Name | Signature | Date |
| ----- | ----- | ----- | ----- |
| Business Owner |  |  |  |
| Project Manager |  |  |  |
| Solution Architect |  |  |  |
| Accounting Representative |  |  |  |
| Warehouse Representative |  |  |  |
| IT / Development Lead |  |  |  |

4. ## **Project Objective** {#project-objective}

ระบบนี้ถูกพัฒนาขึ้นเพื่อใช้บริหารจัดการกระบวนการซื้อขายสินค้า commodity ภายในบริษัท ตั้งแต่การรับซื้อสินค้า การจัดการ stock การซื้อขาย การจัด shipment การออก invoice และการติดตาม payment

เป้าหมายหลัก:

* จัดการบริหารทรรพยากรของบริษัทอย่าเป็นงระบบ  
* ลดความผิดพลาดของ stock  
* ติดตาม profit/loss ต่อ deal  
* รองรับการเติบโตของธุรกิจ

5. ## **Scope ขอบเขตการพัฒนา Phase 1** {#scope-ขอบเขตการพัฒนา-phase-1}

ระบบนี้มีการพัฒนาแยกส่วน Phase 1 และ Phase 2 ในส่วนของ Phase จะมีการพัฒนาในส่วน

* ระบบบันทึกรายการประจำวัน (Daily Operations)  
* ระบบบันทึกการจองดีล (Dual Costing)  
* ระบบจับคู่การซื้อขาย (Trading Matching)  
* ระบบจัดการสต๊อกสินค้า (Stock Management)  
* แดชบอร์ด (Dashboard)  
* ระบบเข้าสู่ระบบ และยืนยันตัวตนผู้ใช้งาน (Authentication)  
* ระบบจัดการผู้ใช้งาน และกำหนดสิทธิ์การเข้าถึง (User & Role Management)  
* ระบอัพโหลดข้อมูลหลัก (Master Data Management)


6. ## **User Roles** {#user-roles}

| Role | Description |
| ----- | ----- |
| Admin | Full access |
| Operator | Create/Edit transaction |
| Accounting | Invoice & Payment |
| Logistics | Shipment management |
| Manager | Approve & Reporting |

7. ## **Functional Requirement** {#functional-requirement}

   1. ### **การจัดการระบบ (System Administration)** {#การจัดการระบบ-(system-administration)}

   2. #### **การเข้าสู่ระบบ (Login)** {#การเข้าสู่ระบบ-(login)}

##### **Purpose** {#purpose}

ใช้สำหรับยืนยันตัวตนของผู้ใช้งานก่อนเข้าใช้งานระบบ โดยระบบจะตรวจสอบชื่อผู้ใช้งานและรหัสผ่าน รวมถึงกำหนดสิทธิ์การเข้าถึงเมนูและข้อมูลตามบทบาทของผู้ใช้งาน (Role & Permission)

##### **Features** {#features}

* ยืนยันตัวตนผู้ใช้งาน (User Login Authentication)  
* ตรวจสอบชื่อผู้ใช้งานและรหัสผ่าน (Username and Password Validation)  
* ควบคุมสิทธิ์การเข้าถึงตามบทบาทผู้ใช้งาน (Role-Based Access Control: RBAC)  
* จดจำสถานะการเข้าสู่ระบบ (Remember Login Session)  
* ลืมรหัสผ่าน (Forgot Password)  
* เปลี่ยนรหัสผ่าน (Change Password)  
* ออกจากระบบ (Logout System)


##### 

##### 

##### 

##### 

##### 

##### 

##### 

##### 

##### 

##### 

##### 

##### **Main Flow** {#main-flow}

##### **Business Rules** {#business-rules}

1. ผู้ใช้งานต้องกรอก Username และ Password ให้ถูกต้องก่อนเข้าใช้งานระบบ  
2. ระบบจะแสดงเฉพาะเมนูที่ผู้ใช้งานมีสิทธิ์เข้าถึง  
3. หากกรอกรหัสผ่านผิดเกินจำนวนครั้งที่กำหนด ระบบจะล็อกบัญชีชั่วคราว  
4. ทุกการ Login และ Logout ต้องถูกบันทึกลง User Activity Log  
5. ผู้ใช้งานที่ถูก Disable หรือ Inactive จะไม่สามารถเข้าสู่ระบบได้  
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
     
   

   3. ### **ระบบบันทึกรายการประจำวัน (Daily Operations)** {#ระบบบันทึกรายการประจำวัน-(daily-operations)}

      1. #### **Weight Ticket (ใบรับของ)** {#weight-ticket-(ใบรับของ)}

##### **Purpose** {#purpose-1}

ใช้บันทึกรายการชั่งสินค้าเข้า-ออกของบริษัท เพื่อใช้เป็นต้นทางของ:

* การรับซื้อสินค้า  
* การขายสินค้า  
* การเคลื่อนไหว stock  
* การคำนวณน้ำหนักสุทธิจริง  
* การออกบิลซื้อ/ขาย

##### **Features** {#features-1}

* สร้างใบชั่งสินค้า (Weight Ticket)  
* รองรับการชั่งน้ำหนักเข้า / ชั่งออก  
* คำนวณน้ำหนักสุทธิอัตโนมัติ  
* พิมพ์ใบชั่งสินค้า  
* แนบรูปภาพรถขนส่งสินค้าและทะเบียนรถ  
* ค้นหาประวัติการชั่งสินค้า  
* ออกรายการใบชั่งเป็นบิลซื้อสินค้า  
* ออกรายการใบชั่งเป็นบิลขายสินค้า

##### **Main Flow** {#main-flow-1}

 

##### **Business Rules** {#business-rules-1}

1. กรณีชั่งเข้า  
   1. เมื่อชั่งน้ำหนักแล้วให้ผูกกับบิลซื้อ  
   2. กรณีที่ไม่ผูก PO Buy เมื่อชั่งเข้าแล้วต้องนำสินค้าเพิ่มเข้าใน Stock  
   3. กรณีที่ผูก PO Buy ตัดสินค้าออกจาก PO Buy เท่าที่รถขนส่งมาส่ง  
      1. กรณีตัดครบ PO ฺBuy นั้นจะเหลือ 0 และต้องนำสินค้าเข้า Stock  
      2. กรณีที่ตัดไม่ครบ PO Buy ให้เอาส่วนที่ตัดแล้วเข้า Stock ส่วนที่เกินให้รอรถขนส่งมาส่ง ถ้ารถขนส่งมาส่งทีหลังครบให้สร้างใบชั่งมาใหม่แล้วผูก PO Buy ในส่วนที่เหลือ PO Buy รอบหลังจะเป็น 0 ถ้ารถขนส่งมาส่งไม่ครบแล้วผู้ใช้งานสามารถปิดสถานะ PO Buy ได้ ซึ่งสถานะจะเป็นบังคับปิด แล้วลดสินค้าใน PO Buy ลง กรณีสินค้าพิเศษที่เป็นทองเหลืองและทองแดง ต้องหักสินค้านั้นออกจาก Cost pool เพิ่มด้วย  
      3. กรณีที่ตัดเกิน PO Buy ให้เอาส่วนที่พอดี PO Buy เข้าระบบตามปกติ สำหรับส่วนที่เกินให้ผู้ใช้งานระบบบันทึกเข้า Stock เป็น SPOT BUY โดยที่ผู้ใช้งานระบบสามารถระบุ ราคา/กก. และน้ำหนักที่เกินได้ และเพิ่มสินค้าลงใน Stock กรณีสินค้าพิเศษที่เป็นทองเหลืองและทองแดง ต้องเพิ่มสินค้านั้นเข้า Cost Pool เพิ่มด้วย  
2. กรณีชั่งออก  
   1. เมื่อชั่งน้ำหนักเพื่อเตรียมขายออกเสร็จแล้วให้กดบันทึกแล้วไปรอที่เมนูเบิกออกรอบิล สินค้านั้นจะโดนตัดออกจาก Stock ทันที หลังจากนั้นให้ไปเปิดบิลขาย  
      1. กรณีเปิดบิลขายผูกกับ PO Sell  
         1. กรณีตัดไม่ครบ PO Sell ที่เป็นสินค้าประเภทอื่นที่ไม่ใช่ทองเหลืองทองแดง ผู้ใช้ระบบสามารถบังคับปิด แก้ไข PO sell ได้ เพื่อปรับน้ำหนัก จำนวนจริง ตามที่ส่งให้ลูกค้าจริง จะได้ PO Sell คงเหลือเป็น 0 แล้วต้องคืนของกลับเข้าไปใน Stock ด้วย  
         2. กรณีตัดไม่ครบ PO Sell ที่เป็นสินค้าประเภททองเหลืองทองแดง ผู้ใช้ระบบสามารถบังคับปิด แก้ไข PO sell ได้ เพื่อปรับน้ำหนัก จำนวนจริง ตามที่ส่งให้ลูกค้าจริง จะได้ PO Sell คงเหลือเป็น 0 แล้วต้องคืนของกลับเข้าไปใน Stock ด้วย และต้องเอาของนั้นคืนกลับเข้า Waitting Allocation  
         3. กรณีที่ตัดครบ PO Sell จะอัพเดต PO sell คงเหลือเป็น 0  
3. Gross Weight ต้องมากกว่า Tare Weight  
4. Net Weight ต้องมากกว่า 0  
5. เมื่อผูกบิลรับซื้อ/บิลขายแล้ว จะไม่สามารถยกเลิกใบชั่งได้ ยกเลิกได้กรณีที่ยังไม่เปิดบิลเท่านั้น

##### **หน้ารายการใบชั่งเข้า/ออก** {#หน้ารายการใบชั่งเข้า/ออก}

###### **Summary Dashboard Cards** {#summary-dashboard-cards}

| Field | Description |
| ----- | ----- |
| รอใช้ | จำนวนใบชั่งที่ยังไม่ผูกกับบิลซื้อหรือบิลขาย |
| ใช้แล้ว | จำนวนใบชั่งที่ถูกผูกกับบิลซื้อหรือบิลขายแล้ว |
| ชั่งเข้า | จำนวนใบชั่งเข้าทั้งหมดที่ผูกและยังไม่ผูกกับบิลซื้อ |
| ชั่งออก | จำนวนใบชั่งออกทั้งหมดที่ผูกและยังไม่ผูกกับบิลขาย |
| รวมทั้งหมด | จำนวนใบชั่งทั้งหมดในระบบทุกสถานะ |

###### **ค้นหา** {#ค้นหา}

| Field | Type | Description | Default |
| ----- | ----- | ----- | ----- |
| Search | text | ค้นหา (เลขใบชั่ง, ชื่อผู้ขาย, ทะเบียน, วันที่)  | \- |
| Direction Filter | dropdown | ทั้งหมด ชั่งเข้า ชั่งออก  | ทั้งหมด |
| Status Filter | dropdown | รอใช้ ใช้แล้ว ยกเลิก | รอใช้ |

###### 

###### 

###### 

###### 

###### **รายการใบชั่ง** {#รายการใบชั่ง}

| Field | Description |
| ----- | ----- |
| Ticket No | เลขใบชั่ง |
| Weigh DateTime | วันที่เวลา |
| Direction Icon | ชั่งเข้า / ชั่งออก  |
| Status Badge | รอใช้/ ใช้แล้ว/ ยกเลิก |
| ผู้ขาย/ลูกค้า | supplier/customer |
| สินค้า | ชื่อสินค้า |
| น้ำหนักรวม | น้ำหนักรวมของสินค้าที่หักสิ่งเจือปนแล้ว |

###### **ปุ่มสำหรับแต่ละรายการในตารางใบชั่ง** {#ปุ่มสำหรับแต่ละรายการในตารางใบชั่ง}

| Button | Action | Description | Rule |
| ----- | ----- | ----- | ----- |
| ดู | View | ดูรายการสินค้าที่ชั่งเข้า (สามารถมีได้หลายรายการ) |  |
| แก้ | Edit | แก้ไขรายการใบชั่งสินค้า | สามารถแก้ไขได้กรณีที่ใบชั่งนั้นยังไม่ได้ผูกกับบิลซื้อขาย |
| ใบชั่ง | Print | พิมพ์รายการใบชั่งสินค้า |  |
| ภาพ | View Images | คลิกเพื่อแสดงภาพรายการใบชั่งสินค้า รถ ทะเบียน |  |
| เปิดบิลซื้อ | Convert to Purchase | ปุ่มสำหรับใบชั่งเข้า คลิกเพื่อทำรายการผูกกับบิลซื้อ จะเด้งไป Pop up เพิ่มบิลซื้อที่เป็นประเภท Stock | ต้องผูกกับบิลซื้อประเภท Stock เท่านั้น ปุ่มสำหรับใบชั่งเข้า |
| เปิด Pending Sale | Convert to Pending Sale | ปุ่มสำหรับใบชั่งออก เมื่อคลิกจะไปหน้า Pending Sale ขึ้น Pop up “+เบิกออก Pending Sales” | ต้องผูกกับบิลขายประเภท Stock เท่านั้น ปุ่มสำหรับใบชั่งออก |
| ยกเลิก | Canceled | ปุ่มสำหรับยกเลิกรายการใบชั่ง | ยกเลิกได้กรณีที่ยังไม่ผูกกับบิลซื้อหรือบิลขาย |

###### **รายการสินค้า** {#รายการสินค้า}

| Field | Description |
| ----- | ----- |
| Product Name | ชื่อสินค้า |
| Gross Weight | น้ำหนักก่อนหัก (kg) |
| Deduction | น้ำหนักที่หัก (kg) |
| Net Weight | น้ำหนักสุทธิ (kg) |

## 

## 

## 

## 

## 

## 

## 

##### **หน้าเพิ่มและแก้ไขใบชั่งเข้า/ออก** {#หน้าเพิ่มและแก้ไขใบชั่งเข้า/ออก}

###### **Direction Selector** {#direction-selector}

| Field | Type | Description |
| ----- | ----- | ----- |
| Direction | toggle button | ให้เลือกว่าจะเป็นการสร้างใบชั่งสินค้าที่เป็น1.ช่างเข้า (รับซื้อ) 2.ช่างออก (ขาย) |

###### **Basic Information Fields** {#basic-information-fields}

| Field | Type | Required | Description | Rule |
| ----- | ----- | :---: | ----- | ----- |
| เลขที่ใบชั่ง | auto running | yes | ระบบสร้างให้อัตโนมัติ | ห้ามแก้ไข |
| วันที่ | date | yes | วันที่สร้างใบชั่งสินค้า |  |
| เวลา | time | yes | เวลาที่สร้างใบชั่งสินค้า |  |
| ผู้ขาย / ลูกค้า | autocomplete | yes | ชื่อผู้ทำรายการซื้อขายสินค้า | ผู้ขาย สำหรับใบชั่งเข้าลูกค้า สำหรับใบชั่งออก |
| ทะเบียนรถ | text | no | ทะเบียนรถที่ทำการขนส่งสินค้า |  |
| สาขา | dropdown | yes | สาขาของโรงงานที่ทำการชั่งสินค้าเข้าออก |  |
| พนักงานชั่ง | Input text | yes | พนักงานผู้ทำการชั่งสินค้า |  |
| หมายเหตุ | textarea | no | หมายเหตุเพิ่มเติม |  |

### 

### 

###### 

###### 

###### **Product Items Section** {#product-items-section}

รายการสินค้า (หลายรายการได้)

**Product Item Fields**

| Field | Type | Required | Description | Rule |
| ----- | ----- | :---: | ----- | ----- |
| สินค้า | select | yes | เลือกสินค้าที่มีในระบบ (ข้อมูลสินค้าดึงมาจาก Master) |  |
| น้ำหนักแต่ละตัน/ถุง | number | yes | น้ำหนักของสินค้า |  |
| หัก | text | no | หักสินเจือปนที่ติดมากับสินค้า |  |
| หน่วยหัก | kg / % | no | หักเป็นเปอร์เซ็นหรือกิโลกรัม |  |
| จำนวนหัก | decimal | no | แสดงที่หัก |  |
| น้ำหนักสุทธิ | auto |  | แสดงผลคำนวณน้ำหนักสุทธิ | น้ำหนักสุทธิ \= (น้ำหนักแต่ละตัน/ถุง ) \- จำนวนหัก |
| รูปสินค้า | upload | yes | อัพโหลดภาพสินต้า |  |
| รูปรถ/ทะเบียน/ตราชั่ง/ใบส่งของ (PO) | upload | yes | อัพโหลดภาพรถขนส่ง/ทะเบียน/มิเตอร์ตราชั่ง/ใบส่งของ PO Buy หรือ PO Sell |  |

###### **Bottom Actions** {#bottom-actions}

| Button | Action |
| ----- | ----- |
| ยกเลิก | cancel |
| บันทึกใบชั่ง | save |

### 

##### **Printing** {#printing}

**ใบชั่งสินค้า (เอกสารพิมพ์)**

| Field | Type |
| ----- | ----- |
| ชื่อบริษัท | text |
| ชื่อบริษัทภาษาอังกฤษ | text |
| ที่อยู่บริษัท | text |
| เบอร์โทรบริษัท | text |
| เลขประจำตัวผู้เสียภาษี | text |
| ชั่งเข้า / ชั่งออก | enum |
| ใบชั่งสินค้า | text |
| เลขที่ใบชั่ง | text |
| วันที่/เวลาพิมพ์ | datetime |
| วันที่/เวลาชั่งจริง | datetime |
| ชื่อลูกค้าหรือ Supplier | text |
| เลขทะเบียนรถขนส่ง | text |
| สาขาคลังของบริษัท | text |
| พนักงานชั่ง | text |
| แถวที่ | integer |
| ชื่อสินค้า | text |
| จำนวนสินค้า | text |
| น้ำหนัก (kg) | decimal |
| น้ำหนักหัก (kg) | text |
| น้ำหนักสุทธิ (kg) | decimal |

###### **สรุปน้ำหนัก** สรุปน้ำหนักรวมของรายการสินค้าต่างๆ {#สรุปน้ำหนัก-สรุปน้ำหนักรวมของรายการสินค้าต่างๆ}

| Field | Type |
| ----- | ----- |
| รวมเต๋าทั้งหมด | number |
| น้ำหนักรวม | decimal |
| น้ำหนักสุทธิ | decimal |

###### **ส่วนหมายเหตุ** {#ส่วนหมายเหตุ}

| Field | Type |
| ----- | ----- |
| Remark / Note | textarea |

###### **ลายเซ็นต์** {#ลายเซ็นต์}

| Field | Type |  |
| ----- | ----- | ----- |
| ผู้รับของ/ลูกค้า | signature/text | ลายเซ็นต์ผู้รับของ/ลูกค้า |
| พนักงานชั่ง | signature/text | ลายเซ็นต์พนักงานชั่ง |
| ผู้เบิกออกคลัง | signature/text | ลายเซ็นต์ผู้เบิกออกคลัง |
| ผู้อนุมัติ | signature/text | ลายเซ็นต์ผู้อนุมัติ |

###### **Attachment Image Section** {#attachment-image-section}

| Field | Type | Description |
| ----- | ----- | ----- |
| Attachment Images | image | ภาพแนบประกอบ (หลายรูป) |
| Image Caption | text | คำอธิบายภาพ |

2. #### **Purchase Receipt (บิลรับซื้อ)** {#purchase-receipt-(บิลรับซื้อ)}

##### **Purpose** {#purpose-2}

ใช้บันทึกรับซื้อสินค้าเข้าคลัง หรือรับซื้อเพื่อ trading

##### **Features** {#features-2}

* ระบบสร้างเอกสารบิลรับซื้อสินค้า (Create Purchase Bill)  
* ระบบแก้ไขข้อมูลบิลรับซื้อสินค้า (Edit Purchase Bill)  
* ระบบดูรายละเอียดบิลรับซื้อ และรายการสินค้า (View Purchase Detail)  
* ระบบพิมพ์บิลรับซื้อสินค้า และใบสำคัญรับเงิน (Print Purchase Receipt & Receipt Voucher)  
* ระบบค้นหา และกรองประวัติรายการบิลรับซื้อ (Search & Filter Purchase Records)  
* ระบบ Export ข้อมูลรายการรับซื้อเป็น Excel (Export Excel Report)

##### **Main Flow** {#main-flow-2}

##### 

##### 

##### 

##### **Business Rules** {#business-rules-2}

1. บิลรับซื้อ มี 2 ประเภท คือ Stock เป็นการซื้อสินค้าเข้ามาเก็บไว้ใน Stock และต้นคำนวณ WAC (Weighted Average Cost) หรือราคาเฉลี่ยถ่วงน้ำหนัก และอีกประเภทคือ Trading เป็นการจับคู่ซื้อขายผ่านมือโดยจะไม่นำสินค้ามาเก็บไว้ใน Stock และไม่จำเป็นต้นคำนวณ WAC  
   1. กรณีบิลรับซื้อสินค้าเป็นประเภท Stock จำต้องผูกบิลรับซื้อกับใบชั่งขาเข้า โดยจะเลือกผูกหรือไม่ผูก PO Buy หรือไม่ก็ได้ ถ้าไม่ผูก PO Buy สินค้านั้นจะเป็น Spot Buy   
      1. กรณีที่ผูก PO Buy ต้องนำไปตัด PO Buy โดยมีเงื่อนไขตามข้อ [1.3.1.](#bookmark=id.45rgcg4qkwop)  
      2. น้ำหนักที่แสดงในบิลรับซื้อต้องมาจากใบรับของขาเข้า และต้องเพิ่มสินค้านั้นลงใน Stock  
      3. กรณีบิลรับซื้อที่เป็น Spoy buy และเป็นสินค้าประเภททองเหลืองกับทองแดง ต้องนำสินค้าดังกล่าวไปใส่ใน Cost pool ด้วย  
      4. สินค้าชนิดเดี๋ยวกันสามารถเพิ่มเข้าได้และมีหลายราคาได้ โดยราคาที่เข้ามาจะนำไปคิดแบบราคาเฉลี่ยถ่วงน้ำหนัก WAC  
   2. กรณีบิลรับซื้อสินค้าเป็นประเภท Trading สามารถผูกหรือไม่ผูกกับ PO Buy ก็ได้ และสินค้าที่เปิดบิลรับซื้อประเภทนี้ไม่ต้องเพิ่มลงใน Stock  
      1. จากนั้นบิลรับซื้อที่เป็น Trading จะถูกนำไป Match กับ บิลขายที่ผูกหรือไม่ผูก PO Sell ก็ได้ และจะถูกส่งต่อไปจับคู่ใน Trading Matching  
2. บิลรับซื้อที่มีการจ่ายเงินไปแล้วหรือจ่ายบางส่วนไม่สามารถลบได้  
3. บิลรับซื้อไม่สามารถลบได้ แต่ยกเลิกได้  
4. บิลซื้อทุกประเภทที่เป็น Stock และ Trading ถ้าบิลนั้นมีการผูกบิลกับใบ PO Buy ให้ไปตัดจำนวนน้ำหนักที่รับซื้อมาออกจาก PO  
5. บิลรับซื้อที่มีการรับน้ำหนักครบตาม PO แล้ว จะเหลือ 0  
6. กรณีที่รถบรรทุกส่งสินค้าที่มีน้ำหนักเกิน PO แล้ว PO นั้นคัดจนเหลือ 0 แล้ว user สามารถทำการเพิ่มเองใหม่โดยการสร้างบิลรับซื้อแยกเองและตั้งราคาสินค้าและน้ำหนักเองได้  
7. บิลรับซื้อที่เป็นประเภท Stock เมื่อรับสินค้าเข้ามาแล้ว ให้นำสินค้านั้นไปเพิ่มลงใน Stock  
8. บิลรับซื้อที่เป็นประเภท Trading ไม่ต้องนำสินค้าเข้ามาใน Stock เนื่องจากเป็นสินค้าที่จับคู่ขาย ยกเว้นกรณีที่ในรถบรรทุกนั้นบรรทุกสินค้าที่เป็น Trading แต่มีสินค้าจากทางบริษัทใน Stock ติดออกไป กรณีนี้จำเป็นต้องตัดสินค้าใน Stock ออกด้วย

#####  **หน้ารายการบิลรับซื้อ** {#หน้ารายการบิลรับซื้อ}

###### **ค้นหา** {#ค้นหา-1}

| Field | Type | Description | Default |
| ----- | :---: | ----- | ----- |
| Search | text | ค้นหาเลขบิล / เลขอ้างอิง / ชื่อ Supplier |  |
| Date From | date |  |  |
| Date To | date |  |  |
| Transaction Type | dropdown | ทั้งหมด Stock Trading | ทั้งหมด |
| Source Type | dropdown | ทั้งหมด Spot buy PO Receipt | ทั้งหมด |

###### **รายการตารางบิลซื้อ** {#รายการตารางบิลซื้อ}

| Field | Description | Rule |
| ----- | ----- | ----- |
| เลขที่ | เลขที่บิลซื้อ |  |
| เลขที่อ้างอิง | reference no |  |
| วันที่ | วันที่ออกบิลซื้อ |  |
| Supplier | ชื่อ Supplier |  |
| สาขา | สาขาคลังของโรงงาน |  |
| ยอดรวม | ยอดรวมสินค้าของบิลซื้อ (บาท) |  |
| ค้างจ่าย | ยอดค้างจ่ายที่ยังไม่ได้รับการชำระ (บาท) |  |
| สถานะ | สถานะบิลซื้อ ทั้งหมด ชำระแล้วชำระบางส่วน ยังไม่ได้ชำระ |  |
| ผู้ทำ / เวลา | ผู้ทำการสร้างหรือแก้ไขบิลซื้อ |  |

###### **Action Buttons** {#action-buttons}

| Button | Action | Rule |
| ----- | ----- | ----- |
| แก้ไข | แก้ไขบิลซื้อ | แก้ไขได้ต่อเมื่อบิลซื้อนั้นยังไม่ได้ทำการชำระเงิน |
| พิมพ์ | พิมพ์บิลซื้อ |  |
| พิมพ์ | พิมพ์ใบสำคัญรับเงิน |  |
| ยกเลิก | canceled | ยกเลิกได้ต่อเมื่อบิลซื้อนั้นยังไม่ได้ทำการชำระเงิน |

## 

##### **หน้าเพิ่ม/แก้ไขบิลรับซื้อ** {#หน้าเพิ่ม/แก้ไขบิลรับซื้อ}

###### **Basic Information Fields** {#basic-information-fields-1}

| Field | Type | Required | Description | Rule |
| ----- | ----- | :---: | ----- | ----- |
| ประเภทบิลซื้อ | radio card | yes | ประเภทบิลซื้อที่เป็นStock หรือ Trading | 1.บิลซื้อที่เป็น Stock ต้องผูกกับใบชั่งของขาเข้า 2.บิลซื้อที่เป็น Trading ไม่ผูกกับใบชั่งใดๆ |
| สาขา | dropdown | yes | เลขที่บิลซื้อระบบสร้างมาให้อัตโนมัติ |  |
| ชื่อผู้ขาย Supplier | auto | \- | ชื่อผู้ขายที่ผูกกับบิลซื้อ |  |
| ใบชั่ง | dropdown | yes | เลือกใบชั่งที่ผูกกับบิลซื้อ |  |

###### **รายการสินค้า** {#รายการสินค้า-1}

กรณีเป็น Stock รายการสินค้า (เลือกได้หลายรายการ)

| Field | Type | Description | Rule |
| ----- | ----- | ----- | ----- |
| สินค้า | autocomplete | สินค้าที่ผูกกับใบชั่งน้ำหนัก | ต้องเลือกผู้ขายและใบรับของ WTI มาก่อน สินค้าในตารางจะขึ้นมาให้อัตโนมัติ |
| Gross (กก.) | decimal | น้ำหนักก่อนหักสิ่งเจือปน |  |
| หัก  (กก.) | decimal | หักน้ำหนักสิ่งเจือปน |  |
| น้ำหนักสุทธิ (กก.) | calculated | น้ำหนักสุทธิที่ได้หลังหักสิ่งเจือปน |  |
| จำนวนตัดบิล | number | จำนวนน้ำหนักของสินค้าที่นำส่ง | น้ำหนักของสินค้านี้อาจจะมีค่ามากกว่าน้อยกว่าหรือเท่ากับ เมื่อเทียบจาก PO ก็ได้  |
| PO อ้างอิง | select | คือ PO Buy อ้างอิงในการจองสินค้า | เมื่อเลือก PO Buy แล้วถ้าสินค้ายังจัดสรรน้ำหนักไม่ครบตาม PO Buy ผู้ใช้สามารถกดปุ่มเพิ่มแถวด้านล่างเพื่อเพิ่มสินค้าให้ครบตาม PO Buy |
| ราคา/กก. | decimal | ราคาของสินค้าต่อ 1 กิโลกรัม |  |
| ราคาหน้าใบ | decimal | ราคาหน้าใบที่เซลล์ของทางบริษัททำการสั่งซื้อ | มีผลต่อค่า commision เมื่อราคาหน้าใบน้อยกว่าหรือเท่ากับราคาต่อกิโลกรัม จะถูกนำไปคำนวณค่า commision |
| ยอดรวม | calculated | ยอดรวมของราคาสินค้านั้นๆ |  |
| เพิ่มแถว | button | เพิ่มรายการสินค้ากรณีที่ยังส่งสินค้าไม่ครบตาม PO Buy |  |
| ลบ |  | ลบรายการสินค้านั้นออก |  |

กรณีเป็น Trading รายการสินค้า (เลือกได้หลายรายการ)

| Field | Type | Description | Rule |
| ----- | ----- | ----- | ----- |
| เพิ่มรายการ | button | เพิ่มรายการสินค้า |  |
| สินค้า | autocomplete | สินค้าที่ผูกกับใบชั่งน้ำหนัก | ต้องเลือกผู้ขายและใบรับของ WTI มาก่อน สินค้าในตารางจะขึ้นมาให้อัตโนมัติ |
| PO อ้างอิง | select | คือ PO Buy อ้างอิงในการจองสินค้า | เมื่อเลือก PO Buy แล้วถ้าสินค้ายังจัดสรรน้ำหนักไม่ครบตาม PO Buy ผู้ใช้สามารถกดปุ่มเพิ่มแถวด้านล่างเพื่อเพิ่มสินค้าให้ครบตาม PO Buy |
| Gross (กก.) | decimal | น้ำหนักก่อนหักสิ่งเจือปน |  |
| หัก  (กก.) | decimal | หักน้ำหนักสิ่งเจือปน |  |
| น้ำหนักสุทธิ (กก.) | calculated | น้ำหนักสุทธิที่ได้หลังหักสิ่งเจือปน |  |
| ราคา/กก. | decimal | ราคาของสินค้าต่อ 1 กิโลกรัม |  |
|  |  |  |  |
| จำนวนตัดบิล | number | จำนวนน้ำหนักของสินค้าที่นำส่ง | น้ำหนักของสินค้านี้อาจจะมีค่ามากกว่าน้อยกว่าหรือเท่ากับ เมื่อเทียบจาก PO ก็ได้  |
| ราคาหน้าใบ | decimal | ราคาหน้าใบที่เซลล์ของทางบริษัททำการสั่งซื้อ | มีผลต่อค่า commision เมื่อราคาหน้าใบน้อยกว่าหรือเท่ากับราคาต่อกิโลกรัม จะถูกนำไปคำนวณค่า commision |
| ยอดรวม | calculated | ยอดรวมของราคาสินค้านั้นๆ |  |

###### **Weight Formula** {#weight-formula}

Net Weight \= Gross Weight \- Deduction

Line Total \= Net Weight × Price Per KG

###### **ส่วนสรุปราคา** {#ส่วนสรุปราคา}

| Field | Type | Description |
| ----- | ----- | ----- |
| มี VAT 7% | checkbox | VAT toggle |
| ส่วนลดท้ายบิล | decimal | ส่วนลดท้ายบิลลดทุกสินค้ารวมกัน |
| น้ำหนักรวมสุทธิ | decimal | น้ำหนักรวมสุทธิ |
| ยอดรวมรายการ | decimal | ราคารวมของสินค้าก่อนหักส่วนลด |
| หลังส่วนลด | decimal | ราคารวมของสินค้าหลังหักส่วนลด |
| ยอดสุทธิ | decimal | ยอดรวมสุทธิ |
| หมายเหตุ | textarea | หมายเหตุ |

###### **Bottom Actions** {#bottom-actions-1}

| Button | Action |
| ----- | ----- |
| ยกเลิก | cancel |
| บันทึกบิล | save |

3. #### **Sales Bill (บิลขาย)** {#sales-bill-(บิลขาย)}

##### **Purpose** {#purpose-3}

ใช้เปิดบิลขายบันทึกการขายสินค้าออกจากคลังสินค้า

##### **Features** {#features-3}

* สร้างบิลขายสินค้า  
* ผูกบิลขายกับใบชั่งขาออก  
* แก้ไขข้อมูลบิลขาย  
* ดูรายละเอียดบิลขาย  
* หักสต็อกสินค้าอัตโนมัติเมื่อบันทึกบิลขาย  
* คำนวณต้นทุนสินค้า (WAC) อัตโนมัติ  
* รองรับการขายแบบ Stock และ Trading  
* พิมพ์บิลขายในนามบริษัท  
* ค้นหาและกรองรายการขาย  
* ติดตามยอดค้างชำระของลูกค้า  
* บันทึกสถานะการรับชำระเงิน  
* รองรับการขายแบบเครดิต (Credit Term)  
* รองรับการส่งออกสินค้า (Export)  
* เชื่อมโยงกับเบิกออกรอบิล Pending Sale  
* Export ข้อมูลเป็น Excel  
* ตรวจสอบประวัติการแก้ไขบิลขาย

##### **Main Flow** {#main-flow-3}

##### 

##### 

##### 

##### **Business Rules** {#business-rules-3}

1. บิลขายมี 2 ประเภท คือประเภทที่เป็น Stock โดยจะใช้ WAC (Weighted Average Cost) ต้นทุนเฉลี่ยถ่วงน้ำหนัก ที่ซื้อสินค้าเข้ามาหลายรอบ มาคำนวณเป็นต้นทุนเฉลี่ย ต้นทุนขาย หรือ COGS (Cost of Goods Sold) กับ บิลขายอีกประเภทคือ Trading โดยประเภท Trading เมื่ออกบิลขายมาแล้วจะไม่ตัดสินค้าออกจาก Stock และจะไม่กระทบกับต้นทุนเฉลี่ยถ่วงน้ำหนักหรือ WAC  
   1. กรณีบิลขายเป็นประเภท Stock  เมื่อขายออกต้องมีการผูกกับใบชั่งฝั่งขาออก จากนั้นบันทึกข้อมูลแล้วไปที่เมนูเบิกออกรอบิลเพื่อทำการตัด Stock ทันที หลังจากนั้นจะทำการผูกกับบิลบิลขายที่สร้างขึ้นมา แล้วถึงจะสามารถเลือกได้ต่อว่าจะผูกหรือไม่ผูก PO Sell โดยสินค้าที่อยู่ในเมนูเบิกออกรอบิลจะสามารถตัดของใน Stock ได้ ต้องมีของใน Stock เท่านั้น  
      1. กรณีไม่ได้ผูก PO Sell แล้วสินค้าเป็นประเภททองเหลืองทองแดงให้นำสินค้านั้นไปใส่ใน Waitting Allocation  
      2. กรณีที่ผูก PO Sell แล้วตัดครบ PO Sell ต้องอัพเดตให้ PO Sell คงเหลือ 0  
      3. กรณีที่ผูก PO Sell แล้วตัดไม่ครบ PO Sell จะสามารถบังคับปิด PO Sell ได้ โดยจะทำได้ก็ต่อเมื่อสินค้านั้นไม่ใช่ทองเหลืองกับทองแดง  
      4. กรณีที่ผูก PO Sell แล้วตัดไม่ครบ PO Sell แล้วสินค้าเป็นประเภททองเหลืองกับทองแดง เมื่อตัดไม่ครบ PO Sell ผู้ใช้จะต้องสามารถทำการปรับแก้ไข PO Sell ได้เพื่อปรับน้ำหนัก จำนวนจริง ตามที่ส่งให้ลูกค้าจริง จากนั้นปรับให้ PO Sell คงเหลือ เป็นศูนย์ สินค้าที่เป็นทองเหลืองทองแดงที่ตัดไม่ครบ ต้องเอาสินค้านั้นกลับไปใส่ใน Waitting Allocation   
   2. กรณีบิลขายเป็นประเภท Trading เมื่อเปิดบิลขายออกสามารถเลือกผูกหรือไม่ผูกกับ PO Sell ได้ กรณีที่ผูก PO Sell ต้องตัดของออกจาก PO Sell ด้วย  
      1. สินค้าที่เปิดบิลขายประเภท Trading นี้ไม่ต้องตัดของออกจาก Stock จากนั้นบิลขายที่เป็น Trading จะถูกนำไป Match กับ บิลรับซื้อที่ผูกหรือไม่ผูก PO Buy ก็ได้ และจะถูกส่งต่อไปจับคู่ใน Trading Matching  
      2. กรณีทองเหลืองทองแดง ที่เป็น Trading (ทั้งเปิดและไม่เปิด PO sell) เมื่อเปิดบิลขายแล้วไม่ต้องตัด Stock ตัวเอง เพราะเป็นสินค้าที่จับคู่การขาย ให้ไปไว้ใน Trading Matching เพื่อตัดขาย (ตัดขายนอกระบบ)    
2. สินค้าที่เปิดบิลขายไปแล้วจะขึ้นสถานะ ยังไม่ได้รับเงิน ครั้งแรก และ สามารถเปลี่ยนเป็น รับครบ หรือ รับเงินบางส่วนได้  
3. จะสามารถแก้ไขหรือยกเลิกบิลขายได้เมื่อสถานะบิลขายนั้น ยังไม่ได้รับเงินเท่านั้น สถานะ รับครบ แล้ว รับบางส่วน ไม่สามารถแก้ไขหรือยกเลิกบิลได้

##### **หน้าแสดงรายการบิลขาย** {#หน้าแสดงรายการบิลขาย}

###### **Summary Dashboard Cards** {#summary-dashboard-cards-1}

| Field | Description |
| ----- | ----- |
| Pending Sale | จำนวน Pending Sale |
| จำนวนบิลทั้งหมด | total sales bill |
| ยอดขายรวม | total sales amount |
| กำไรรวม | total profit |

###### **Search / Filter Section** {#search-/-filter-section}

| Field | Type | Description |
| ----- | ----- | ----- |
| Search | text | ค้นหาเลขบิล / เลขอ้างอิง / ชื่อลูกค้า |
| Date From | date |  |
| Date To | date |  |
| Transaction Type | dropdown | STOCK TRADING |
| Payment Status | dropdown | ยังไม่ได้รับเงิน รับครบ รับบางส่วน ยกเลิก |

###### **รายการบิลขาย** {#รายการบิลขาย}

| Field | Description |
| ----- | ----- |
| เลขที่ | sales bill no |
| เลขที่อ้่งอิง | Weight ticket number |
| วันที่ | bill date |
| Customer | customer |
| ต้นทุน | cost type |
| ยอดขาย | sales amount |
| กำไร | profit |
| ค้างรับ | outstanding |
| สถานะ | payment status |
| ผู้ทำ | created by |

###### **Action Buttons** {#action-buttons-1}

| Button | Action |
| ----- | ----- |
| ดู | view |
| แก้ | edit |
| ใบเสร็จบิลรับซื้อ | print |
| ใบสำคัญรับเงิน |  |
| เปิดบิล | open bill |
| ลบ | delete |

##### **หน้าเพิ่มบิลขาย** {#หน้าเพิ่มบิลขาย}

###### **Basic Information Fields** {#basic-information-fields-2}

| Field | Type | Required | Description |
| ----- | ----- | ----- | ----- |
| Transaction Mode | Options | yes | Stock Trading |
| ชื่อ Supplier | dropdown | yes | เฉพาะ Trading reference purchase bill |
| เลขที่ | auto running | yes |  |
| วันที่ | date | yes |  |
| Customer | autocomplete | yes |  |
| Credit Term | number | yes |  |
| สาขาคลัง | dropdown | yes |  |
| ช่องทางขาย | dropdown | yes |  |
| ทะเบียนรถส่งของ | text | no |  |
| เบอร์โทรลูกค้า | text | no |  |
| ผู้รับของ | text | no |  |
| หมายเหตุ | textarea | no |  |

###### **Product Items Section** {#product-items-section-1}

รายการสินค้า (หลายรายการ)

| Field | Type | Description |
| ----- | ----- | ----- |
| สินค้า | autocomplete |  |
| ที่มา | dropdown | Stock (ตัดคลัง) Trading (PB) กรณีเลือก Transaction Mode เป็น Trading และเลือก Supplier ตัวสินค้าคอลัมน์บนจะขึ้นมา Auto และที่มาจะขึ้นเป็น Trading (PB) และ User สามารถเพิ่มสินค้าอย่างอื่นนอกเหนือจากที่มีมาแล้วได้ |
| จำนวน (กก.) | decimal |  |
| ราคา/หน่วย | decimal |  |
| ยอดรวม | calculated |  |
| Stock/ทุน หลังขาย | calculated |  |
| ตัด PO Sell | PO selector |  |
| VAT 7% | checkbox |  |
| ส่วนลดท้ายบิล |  |  |
| ยอดรวมรายการ |  | subtotal |
| หลังส่วนลด |  | after discount |
| ยอดรวมสุมธิ |  | grand total |

###### **Bottom Actions** {#bottom-actions-2}

| Button | Action |
| ----- | ----- |
| ยกเลิก | cancel |
| บันทึกบิล | save |

4. #### **Pending Sale Release (เบิกออกรอบิล)** {#pending-sale-release-(เบิกออกรอบิล)}

##### **Purpose** {#purpose-4}

ใช้จองหรือเบิกสินค้าออกก่อนสร้างบิลขายจริง

##### **Features** {#features-4}

* ระบบจองสินค้าในคลัง (Reserve Stock)  
* ระบบยกเลิกการจองสินค้า (Release Reserved Stock)  
* ระบบแปลงรายการ Pending Sale เป็นบิลขายสินค้า (Convert Pending to Sales Bill)  
* ระบบติดตามจำนวนสินค้าที่ถูกจอง และคงเหลือ (Track Reserved Quantity)  
* ระบบตรวจสอบปริมาณสินค้า Available / Reserved / Used  
* ระบบเชื่อมโยง Pending Sale กับ Sales Transaction  
* ระบบป้องกันการขายเกินจำนวนสต๊อกที่มีอยู่ (Over Selling Protection)

##### **Main Flow** {#main-flow-4}

##### **Business Rules** {#business-rules-4}

1. เบิกออกรอบิลใช้เมื่อต้องการเบิกของจาก Stock ให้ลูกค้าก่อนสร้างบิลขายจริง  
2. โดยจะต้องผ่านการช่างสินค้าโดยมีใบชั่งขาออกมาก่อนจากนั้นจากนั้นมาที่เมนูเบิกออกรอบิล  
3. เมื่อมีการเพิ่มสินค้ามาผูกที่รายการในเมนูเบิกออกรอบิล สินค้าที่อยู่ในรายการนั้นจะถูกตัด Stock ทันที และจะมีสถานะเป็น pending  
4. เมื่อมีการผูกบิลขายกับรายการนั้นแล้ว รายการนั้นจะถูกเปลี่ยนเป็นสถานะเปิดบิลแล้ว  
5. ห้ามเบิกออกรอบิลสินค้าเกินของที่มีใน Stock

##### **หน้าแสดงรายการ Pending Sale** {#หน้าแสดงรายการ-pending-sale}

###### **Header Summary Cards** {#header-summary-cards}

| Field | Description |
| ----- | ----- |
| Pending | จำนวนรายการ Pending |
| น้ำหนักรวม | น้ำหนักรวมทั้งหมด |
| ต้นทุน (WAC) | ต้นทุนรวม |
| ยอดขายคาด | ยอดขายประมาณการ |

###### **Search / Filter Section** {#search-/-filter-section-1}

| Field | Type |
| ----- | ----- |
| Search | text |
| Date From | date |
| Date To | date |
| Status Filter | dropdown |

###### 

###### **List Table Fields** {#list-table-fields}

| Column | Description |
| ----- | ----- |
| เลขที่ | เลขที่ใบเบิกออกรอบิล |
| วันที่ | วันที่ทำรายการ |
| ลูกค้า (ถ้ามี) | ชื่อลูกค้า |
| คลัง | ชื่อคลังสินค้า |
| น้ำหนัก | น้ำหนักรวม |
| ต้นทุน | ต้นทุนรวม |
| ยอดขายคาด | ยอดขายประมาณการ |
| สถานะ | สถานะรายการเปิดออกรอบิล |

###### **Action Buttons** {#action-buttons-2}

| Button | Action |
| ----- | ----- |
| เปิดบิลขาย | สร้างบิลขายจากรายการเปิดออกรอบิล และเปลี่ยนสถานะรายการเป็นเปิดบิลแล้ว |
| แก้ไข | แก้ไขข้อมูลรายการเปิดออกบิลก่อนทำการเปิดบิลขาย |
| ยกเลิก | ยกเลิกรายการเปิดออกรอบิล โดยไม่สร้างบิลขาย |

##### 

##### 

##### 

##### 

##### **หน้าเพิ่ม/แก้ไข Pending Sale** {#หน้าเพิ่ม/แก้ไข-pending-sale}

###### **Basic Information Section** {#basic-information-section}

| Field | Type | Required | Description |
| ----- | ----- | :---: | ----- |
| เลขที่ | auto running | \- | เลขที่รายการเปิดออกรอบิล |
| วันที่ | auto | \- | วันที่เพิ่มรายการเปิดออกรอบิล |
| ลูกค้า | autocomplete | no | ชื่อลูกค้า |

###### **Product Item Fields** {#product-item-fields}

รายการสินค้า (หลายรายการ)

| Field | Type | Required | Description |
| ----- | ----- | :---: | ----- |
| สินค้า | autocomplete | yes | ชื่อสินค้า |
| สาขาคลัง | select | yes | เลือกสาขาคลังสินค้า |
| จำนวน (กก.) | decimal | yes | น้ำหนักสินค้า |
| ต้นทุน WAC | calculated/readonly | yes | ต้นทุนเฉลี่ยถ่วงน้ำหนักของสินค้า |
| ราคาขายคาด | decimal | yes | ราคาขายที่คาดว่าจะได้เมื่อจะทำการขายสินค้าในอนาคต |
| ปุ่มกากบาท | \- | \- | ไว้สำหรับกดลบสินค้าที่เพิ่มไป |

###### **Summary Section** {#summary-section}

| Field | Type | Required | Description |
| ----- | ----- | :---: | ----- |
| น้ำหนักรวม | auto | \- | น้ำหนักรวมของสินค้าทุกรายการ |
| ต้นทุนรวม | auto | \- | ต้นทุนรวมของสินค้าทุกรายการ |
| ยอดขายคาด | auto | \- | การประมาณยอดขายที่จะได้ |
| หมายเหตุ | textarea | no | หมายเหตุ |

###### **Bottom Actions** {#bottom-actions-3}

| Button | Action |
| ----- | ----- |
| ยกเลิก | ปิด Pop uo |
| บันทึก \+ ตัด Stock | กดปุ่มบันทึกและตัดสินค้าออกจาก Stock |

5. #### **Payment Approval (อนุมัติโอนเงิน)** {#payment-approval-(อนุมัติโอนเงิน)}

##### **Purpose** {#purpose-5}

ใช้สำหรับตรวจสอบและอนุมัติรายการโอนเงินก่อนดำเนินการโอนเงินจริง เพื่อให้มั่นใจว่ารายการจ่ายเงินได้รับการตรวจสอบและอนุมัติตามขั้นตอนที่กำหนด

##### **Features** {#features-5}

* อนุมัติรายการโอนเงินที่เกิดจากบิลรับซื้อ  
* อนุมัติรายการโอนเงินสำหรับค่าใช้จ่ายต่าง ๆ  
* อนุมัติรายการจ่ายเงินล่วงหน้า หรือเงินมัดจำ  
* ตรวจสอบรายการรออนุมัติโอนเงิน (View Payment)

##### **Main Flow** {#main-flow-5}

##### 

##### 

##### 

##### **Business Rules** {#business-rules-5}

1. บิลซื้อที่ต้องชำระเงินให้ลูกค้า ค่าใช้จ่าย และ การจ่ายเงินล่วงหน้า/มัดจำ รายการเหล่านี้ต้องเข้ามาอนุมัติที่เมนูอนุมัติการโอนเงิน  
2. สำหรับบิลซื้อ เมื่อได้รับการอนุมัติการโอนเงินเรียบร้อยแล้ว รายการจะเข้าไปอัพเดตให้สามารถทำรายการจ่ายเงินให้ลูกค้าได้ในเมนูจ่ายเงิน Supplier และเมื่อชำระเงินเรียบร้อยแล้วเงินนั้นจะถูกเอาไปอัพเดตในเมนู Cash/Bank Statement  
3. สำหรับค่าใช้จ่าย เมื่อได้รับการอนุมัติการโอนเงินเรียบร้อยแล้ว รายการจะเข้าไปอัพเดตให้สามารถทำรายการจ่ายเงินเพื่อให้ทางบริษัทชำระเกี่ยวกับค่าใช้จ่ายได้ในเมนูค่าใช้จ่าย และเมื่อชำระเงินเรียบร้อยแล้วเงินนั้นจะถูกเอาไปอัพเดตในเมนู Cash/Bank Statement  
4. สำหรับการจ่ายเงินล่วงหน้า/มัดจำ เมื่อได้รับการอนุมัติการโอนเงินเรียบร้อยแล้ว รายการจะเข้าไปอัพเดตให้สามารถทำรายการจ่ายเงินล่วงหน้า/มัดจำได้ในเมนูจ่ายเงินล่วงหน้า/มัดจำ และเมื่อชำระ เงินเรียบร้อยแล้ว เงินแล้วเงินนั้นจะถูกเอาไปอัพเดตในเมนู Cash/Bank Statement  
5. ทุกรายการที่ทำการจ่ายเงินจะถูกส่งไปบันทึกที่หน้าประวัติการจ่ายเงิน  
6. เมื่อรายการได้รับการอนุมัติแล้ว จะไม่สามารถแก้ไขข้อมูลรายการได้ 

##### **หน้าอนุมัติการจ่ายเงิน** {#หน้าอนุมัติการจ่ายเงิน}

###### **Header Summary Section** {#header-summary-section}

| Field | Description |
| ----- | ----- |
| รายการทั้งหมด | total records |
| ยอดเต็ม | total payable amount |
| ชำระแล้ว | paid amount |
| คงเหลือ | remaining payable |
| เลือกจ่าย | selected payment amount |

###### **Tabs** {#tabs}

| Tab | Description |
| ----- | ----- |
| ต้นทุน (AP / บิลซื้อ) | supplier payable |
| ค่าใช้จ่าย | expense payable |

###### **Search / Filter Section** {#search-/-filter-section-2}

| Field | Type |
| ----- | ----- |
| Search | text |
| Date From | date |
| Date To | date |
| เฉพาะอนุมัติแล้ว | checkbox |
| เลือกทั้งหมด | button |
| ล้างเลือก | button |

###### **Action Buttons** {#action-buttons-3}

| Button | Action |
| ----- | ----- |
| Refresh ยอดค้าง | refresh outstanding |
| อนุมัติที่เลือก | approve selected |
| พิมพ์ใบอนุมัติส่งให้ Cashier | print payment approval |

###### **ตารางรายการอนุมัติการโอนเงิน** {#ตารางรายการอนุมัติการโอนเงิน}

| Field | Description | Mark |
| ----- | ----- | ----- |
| Select | checkbox |  |
| เลขที่บิล | purchase bill no |  |
| วันที่ | bill date |  |
| Supplier | supplier name |  |
| เลขบัญชี | supplier bank account | TTB // 235-2-56372-6SCB // 223-203-7540เงินสด |
| ยอดเต็ม | total amount |  |
| ชำระแล้ว | paid amount |  |
| คงเหลือ | remaining amount |  |
| ยอดที่จะจ่าย | payment amount |  |
| สถานะ | approval/payment status | อนุมัติแล้ว |

###### **ตารางค่าใช้จ่าย** {#ตารางค่าใช้จ่าย}

| Fields | Description | Mark |
| ----- | ----- | ----- |
| Select | checkbox |  |
| เลขที่ | เลขที่บิลค่าใช้จ่าย |  |
| วันที่ | วันที่สร้างบิลค่าใช้จ่าย |  |
| ครบกำหนด | วันครบกำหนดการจ่ายเงินคืน |  |
| ผู้รับเงิน | ผู้รับเงินค่าใช้จ่าย |  |
| เลขบัญชี / ธนาคาร | บัญชีและเลขบัญชีธนาคาร | TTB // 235-2-56372-6SCB // 223-203-7540เงินสด |
| รายละเอียด | รายละเอียด |  |
| อ้างอิง | บิลที่อ้างอิง |  |
| ยอดเต็ม | ยอดชำระเต็ม |  |
| ยอดที่จะจ่าย | ยอดชำระที่จ่ายคืน |  |
| สถานะ | สถานะการอนุมัติ | อนุมัติแล้ว |

###### **ตารางจ่ายเงินล่วงหน้าหรือเงินมัดจำ** {#ตารางจ่ายเงินล่วงหน้าหรือเงินมัดจำ}

| Fields | Description | Mark |
| ----- | ----- | ----- |
| Select | checkbox |  |
| เลขที่ | เลขที่บิลจ่ายเงินล่วงหน้า/มัดจำ |  |
| วันที่ | วันที่สร้างบิลจ่ายเงินล่วงหน้า/มัดจำ |  |
| ครบกำหนด | วันครบกำหนดการจ่ายเงินคืน |  |
| ผู้รับเงิน | ผู้รับเงินการจ่ายเงินล่วงหน้า/มัดจำ |  |
| เลขบัญชี / ธนาคาร | บัญชีและเลขบัญชีธนาคาร | TTB // 235-2-56372-6SCB // 223-203-7540เงินสด |
| รายละเอียด | รายละเอียด |  |
| อ้างอิง | บิลที่อ้างอิง |  |
| ยอดเต็ม | ยอดชำระเต็ม |  |
| ยอดที่จะจ่าย | ยอดชำระที่จ่ายคืน |  |
| สถานะ | สถานะการอนุมัติ | อนุมัติแล้ว |

6. #### **Supplier Payment (จ่ายเงิน Supplier)** {#supplier-payment-(จ่ายเงิน-supplier)}

##### **Purpose** {#purpose-6}

ใช้สำหรับบันทึกการจ่ายเงินให้ Supplier จากบิลรับซื้อ

##### **Features** {#features-6}

* สร้างรายการจ่ายเงินให้ Supplier  
* เชื่อมโยงรายการจ่ายเงินกับบิลรับซื้อ (Purchase Bill)  
* รองรับการชำระเงินบางส่วน (Partial Payment)  
* แสดงประวัติการจ่ายเงินย้อนหลัง (Payment History)

##### **Main Flow** {#main-flow-6}

##### 

##### 

##### 

##### **Business Rules** {#business-rules-6}

1. รายการการจ่ายเงินในตารางของการจ่ายเงิน Supplier มาจากบิลรับซื้อที่สร้างขึ้น  
2. การจะจ่ายเงิน Supplier ได้ ต้องผ่านการอนุมัติมาจากเมนูอนุมัติการโอนเงินก่อน  
3. ทางบริษัทสามารถแบ่งจ่ายให้ Supplier ได้หลายบัญชี และทางบัญชี Supplier สามารถรับได้หลายบัญชีได้  
4. บริษัทสามารถแบ่งจ่ายครบในครั้งเดียวหรือถยอยแบ่งจ่ายมากกว่า 1 ครั้ง จนครบได้   
5. ทุก transaction การจ่ายเงินเมื่อจ่ายแล้วจะถูกบันทึกลงตารางประวัติการชำระเงิน และเงินที่จ่ายไปจะถูกนำไปหักออกในเมนู Cash/Bank Statement

##### **หน้าจ่ายเงิน Supplier** {#หน้าจ่ายเงิน-supplier}

###### **Summary Cards** {#summary-cards}

| Field | Description |
| ----- | ----- |
| ยอดค้างจ่ายรวม | ยอดรวมที่ยังค้างจ่าย Supplier |
| เกินกำหนด | ยอดค้างจ่ายที่เกินกำหนด |
| ครบกำหนดวันนี้ | ยอดที่ครบกำหนดจ่ายวันนี้ |
| ครบใน 7 วัน | ยอดที่ต้องจ่ายภายใน 7 วัน |

###### **Search Section** {#search-section}

ค้นหา: เลขบิล / ชื่อ supplier / รหัส supplier / Ref No.

###### **Outstanding Bill Table Fields** {#outstanding-bill-table-fields}

| Field | Description |
| ----- | ----- |
| เลขบิล | purchase bill no |
| วันที่ | bill date |
| Supplier | supplier name |
| เลขบัญชี | supplier bank account / payment account |
| ยอดรวม | bill total amount |
| จ่ายแล้ว | paid amount |
| คงเหลือ | outstanding amount |
| อายุ(วัน) | aging days |
| Action | action button |

###### **Action Button** {#action-button}

| Button | Action |
| ----- | ----- |
| จ่ายบิลนี้ | open payment voucher popup |

##### **สร้าง Payment Voucher** {#สร้าง-payment-voucher}

Create Payment Voucher Popup

###### **Basic Information Fields** {#basic-information-fields-3}

| Field | Type | Required | Description | Mark |
| ----- | ----- | :---: | ----- | ----- |
| เลขที่ | auto running | yes |  |  |
| วันที่ | date | yes |  |  |
| สาขา (filter) | dropdown | no |  |  |
| วิธีจ่าย | dropdown | yes |  | โอนเงินสดเช็คอื่น ๆ |
| หมายเหตุ | textarea | no |  |  |
| Paid By Type | toggle / radio button | yes |  |  |
| บริษัท (บัญชีบริษัท) |  |  | จ่ายจากบัญชีธนาคาร/เงินสดของบริษัท |  |
| กรรมการ (เงินกรรมการ) |  |  | กรรมการหรือผู้ถือหุ้นจ่ายแทนบริษัท |  |
| เงินทดลอง/สำรองจ่าย |  |  | ใช้เงินสำรองจ่าย หรือเงินทดรองจ่าย |  |
| ชื่อกรรมการ / ผู้สำรองจ่าย | text | yes\* |  | \*แสดงเมื่อเลือก “กรรมการ” หรือ “เงินทดลอง/สำรองจ่าย” |
| บัญชีจ่าย | dropdown | yes |  |  |
| จำนวนเงินที่จ่ายจากบัญชีนี้ | decimal | yes |  |  |
| คงเหลือ | auto |  |  | จำนวนคงเหลือก่อนชำระเงิน |
| จ่าย | auto |  |  | จำนวนเงินที่จ่าย |
| หลังจ่าย | auto |  |  | จำนวนเงินคงเหลือหลังชำระเงิน |
| เพิ่มบัญชี | button |  |  | เพิ่มบัญชีบริษัทในการแบ่งชำระ |

###### 

###### 

###### 

###### **รายการจ่าย** {#รายการจ่าย}

ใช้เลือกบิลที่ต้องการจ่าย โดยระบบสามารถ auto-fill Supplier จากบิลที่เลือกได้

**Table Fields**

| Field | Type | Description |
| ----- | ----- | ----- |
| เพิ่ม | button | เพิ่มรายการจ่ายเงิน |
| บิล (เลขที่ • วันที่ • Supplier • ยอดค้าง) | autocomplete / reference | เลือกบิลค้างจ่าย |
| Supplier | readonly | supplier จากบิล |
| ค้าง | readonly | outstanding amount |
| จ่าย | decimal | amount to pay |
| WHT | decimal | withholding tax |
| Discount | decimal | discount amount |
| Bank Fee | decimal | bank fee |
| Delete | button | ลบรายการ |

###### **Calculation Fields** {#calculation-fields}

Item Level

Net Cash Out \= ยอดจ่าย \- WHT \+ Bank Fee

###### **Summary Fields** {#summary-fields}

| Field | Description |
| ----- | ----- |
| รวมยอดค้าง | total outstanding |
| รวมยอดจ่าย | total payment amount |
| รวม WHT | total withholding tax |
| รวม Discount | total discount |
| รวม Bank Fee | total bank fee |
| Net Cash Out | เงินสด/เงินโอนที่ออกจริง |

###### **Bottom Actions** {#bottom-actions-4}

| Button | Action |
| ----- | ----- |
| ยกเลิก | close popup |
| บันทึก | save payment voucher |

7. #### **Payment History (ประวัติการจ่ายเงิน)** {#payment-history-(ประวัติการจ่ายเงิน)}

##### **Purpose** {#purpose-7}

วัตถุประสงค์ของระบบประวัติการจ่ายเงิน

* ใช้สำหรับตรวจสอบประวัติการจ่ายเงิน Supplier ที่ถูกจ่ายไปแล้ว  
* ใช้ติดตาม Payment Voucher และรายการบิลที่เกี่ยวข้อง  
* ใช้ตรวจสอบยอดจ่าย, WHT, Bank Fee และยอดสุทธิย้อนหลัง  
* ใช้สำหรับ Audit และตรวจสอบเส้นทางการเงิน  
* ใช้ตรวจสอบบัญชีที่ใช้จ่ายเงินจริง  
* ใช้ค้นหาและอ้างอิงรายการจ่ายย้อนหลังได้

##### **Features** {#features-7}

* แสดงประวัติ Payment Voucher ทั้งหมด  
* แสดงรายการบิลที่ถูกจ่ายในแต่ละ Voucher  
* แสดงบัญชีที่ใช้ในการจ่ายเงิน  
* แสดงยอดจ่าย, WHT, Bank Fee และยอดสุทธิ  
* ค้นหารายการจ่ายย้อนหลัง  
* กรองข้อมูลตามช่วงวันที่  
* กรองข้อมูลตามบัญชีที่ใช้จ่าย  
* เรียงลำดับรายการจ่าย  
* รองรับการแบ่งหลายบิลใน 1 Voucher  
* รองรับการใช้หลายบัญชีจ่ายใน 1 Voucher  
* รองรับการ Export ประวัติการจ่ายเงิน

##### **Main Flow** {#main-flow-7}

##### **Business Rules** {#business-rules-7}

1. รายการเมนูประวัติการจ่ายเงินมาจากรายการการจ่ายบิลซื้อ รายการการจ่ายเงินประเภทค่าใช้จ่าย และรายการการจ่ายเงินที่เป็นจ่ายล่วงหน้า / มัดจำ  
2. ประวัติการจ่ายเงินทั้งหมดจะแสดงลงในตาราง  
3. ประวัติการจ่ายเงินไม่สามารถลบออกจากระบบได้

##### **หน้าประวัติการจ่ายเงิน** **Summary Cards** {#หน้าประวัติการจ่ายเงิน-summary-cards}

| Field | Description |
| ----- | ----- |
| จำนวน Voucher |  |
| ยอดจ่ายรวม |  |
| ยอดสุทธิ |  |
| WHT รวม |  |
| Fee รวม |  |
| ค้างจ่าย |  |

###### **Fields \- Search & Filter** {#fields---search-&-filter}

| Field | Type | Description |
| ----- | ----- | ----- |
| ค้นหาเลขที่ / ชื่อ / บัญชี / หมายเหตุ | Textbox |  |
| วันที่เริ่มต้น | Date |  |
| วันที่สิ้นสุด | Date |  |
| เรียงตาม | Dropdown |  |
| บัญชี | Dropdown |  |
| สถานะ | Toggle/Filter |  |
| ปุ่มล้าง Filter | Button |  |
| เรียงตาม |  | วันที่ล่าสุดวันที่เก่าสุดเลขที่รายการยอดจ่ายมากสุดยอดจ่ายน้อยสุด |
| ตัวเลือกสถานะ |  | ทั้งหมดเสร็จสิ้นยกเลิกแล้ว |

###### **ตารางประวัติการจ่ายเงิน** {#ตารางประวัติการจ่ายเงิน}

| Field | Type | Description |
| ----- | ----- | ----- |
| เลขที่รายการ | Text | เลขที่รายการ PMT2605-0293 PMA012605-0008/1 เลข Payment Voucher |
| วันที่สร้างรายการ | Date | วันที่สร้างรายการ หรือ วันที่สร้าง Payment Voucher |
| ผู้ขาย (Supplier) | Text | ชื่อ Supplier |
| บิลอ้างอิง | Text/List | บิลอ้างอิงที่รองรับหลายบิลใน Voucher เดียว |
| บัญชีที่ใช้จ่าย | Text | บัญชีต้นทางที่ใช้จ่าย |
| ยอดจ่าย | Currency | จำนวนเงินที่จ่ายจริงก่อนหัก WHT |
| WHT | Currency | ภาษีหัก ณ ที่จ่าย |
| Bank Fee | Currency | ค่าธรรมเนียมธนาคาร |
| สุทธิ | Currency | ยอดเงินสุทธิที่ Supplier ได้รับ |
| สถานะ | Status | เสร็จสิ้น หรือ ยกเลิก |
| หมายเหตุ | Text | ข้อความที่ผู้ใช้งานบันทึกไว้ |
| Action | Action Button | ดู พิมพ์ ดูเอกสาร Voucher |

8. #### **Receipt Voucher (ใบสำคัญรับเงิน)** {#receipt-voucher-(ใบสำคัญรับเงิน)}

##### **Purpose** {#purpose-8}

ใช้บันทึกรายการรับเงินจากลูกค้า หรือบุคคลภายนอก พร้อมออกใบสำคัญรับเงินเพื่อใช้เป็นหลักฐานการรับชำระเงิน

##### **Features** {#features-8}

* สร้างใบสำคัญรับเงิน  
* แก้ไขใบสำคัญรับเงิน  
* ดูรายละเอียดใบสำคัญรับเงิน  
* ค้นหาใบสำคัญรับเงิน  
* บันทึกรายการรับเงินหลายรายการในใบสำคัญรับเงินเดียว  
* บันทึกข้อมูลผู้จ่ายเงินและผู้รับเงิน  
* พิมพ์ใบสำคัญรับเงิน  
* ติดตามประวัติการออกใบสำคัญรับเงิน  
* เชื่อมโยงข้อมูลกับบิลซื้อ (Purchase Bill)

##### **Main Flow** {#main-flow-8}

##### **Business Rules** {#business-rules-8}

1. Receipt Voucher ไม่ใช่เอกสารทางบัญชีที่กระทบยอดรับเงิน  
2. เป็นการดึงข้อมูลจากบิลซื้อ และสามารถแก้ไขส่วนที่ขาดได้ และสามารถพิมพ์ออกได้  
3. ใช้เป็นเอกสารรับรองการรับเงินจากผู้ขาย/บุคคลภายนอก (ใบสำคัญรับเงิน) กรณีไม่มีใบเสร็จรับเงินจาก Supplier

##### **หน้าแสดงรายการ (List Page)** {#หน้าแสดงรายการ-(list-page)}

###### **Search / Filter** {#search-/-filter}

| Field | Type |
| ----- | ----- |
| ค้นหาเลขที่ | Text |
| ค้นหาชื่อผู้รับเงิน | Text |
| ค้นหาเลขบิลซื้อ | Text |

###### **ตารางรายการ** {#ตารางรายการ}

| Column | Type | Description |
| ----- | ----- | ----- |
| เลขที่ | Text |  |
| วันที่ | Date |  |
| ผู้รับเงิน | Text |  |
| เลขประจำตัวผู้เสียภาษี | Text |  |
| บิลซื้อ | Text |  |
| น้ำหนัก (กก.) | Decimal |  |
| จำนวนเงิน | Currency |  |
| พิมพ์ | Action |  |
| แก้ไข | Action |  |
| ลบ | Action |  |

##### **Popup เพิ่ม / แก้ไข ใบสำคัญรับเงิน** {#popup-เพิ่ม-/-แก้ไข-ใบสำคัญรับเงิน}

ใช้ Popup เดียวกันสำหรับ **Create** และ **Edit**

###### **Section : ดึงข้อมูลจากบิลซื้อ** {#section-:-ดึงข้อมูลจากบิลซื้อ}

| Field | Type |
| ----- | ----- |
| เลือกบิลซื้อเพื่อ Pre-Fill ข้อมูล | Dropdown |

###### **Section : ข้อมูลเอกสาร** {#section-:-ข้อมูลเอกสาร}

| Field | Type | Description |
| ----- | ----- | ----- |
| เลขที่ | Text |  |
| วันที่ | Date |  |
| ทะเบียนรถ | Text |  |

###### **Section : ผู้รับเงิน (Supplier บุคคล / นิติบุคคล)** {#section-:-ผู้รับเงิน-(supplier-บุคคล-/-นิติบุคคล)}

| Field | Type | Description |
| ----- | :---- | ----- |
| ชื่อ-สกุล / ชื่อบริษัท | Text |  |
| เลขประจำตัวผู้เสียภาษี / เลขบัตรประชาชน | Text |  |
| ที่อยู่ | Textarea |  |
| เบอร์โทร | Text |  |
| ช่องทางติดต่อ Sale | Text |  |

###### **Section : รายการ** {#section-:-รายการ}

**Header**

| Field | Type | Description |
| ----- | ----- | ----- |
| รายการ | Text |  |
| จำนวน / กก. | Decimal |  |
| ราคา / บาท | Currency |  |
| จำนวนเงิน | Currency (Calculated) |  |

###### **Detail Row** {#detail-row}

| Field | Type | Description |
| ----- | ----- | ----- |
| รายการ | Text |  |
| จำนวน / กก. | Decimal |  |
| ราคา / บาท | Currency |  |
| จำนวนเงิน | Currency |  |

###### **Summary** {#summary}

| Field | Type | Description |
| ----- | ----- | ----- |
| รวมจำนวนเงิน | Currency |  |

###### **Section : จำนวนเงินตัวอักษร** {#section-:-จำนวนเงินตัวอักษร}

| Field | Type | Description |
| ----- | ----- | ----- |
| จำนวนเงิน (ตัวอักษร) | Text (Auto Generate) |  |
| คำนวณใหม่ | Button |  |

###### **Section : การรับเงิน** {#section-:-การรับเงิน}

| Field | Type | Description |
| ----- | ----- | ----- |
| วิธีรับเงิน | Dropdown | รับเงินสดโอนเงินเช็คอื่น ๆ |

###### **Section : หมายเหตุ** {#section-:-หมายเหตุ}

| Field | Type | Description |
| ----- | ----- | ----- |
| หมายเหตุ | Textarea |  |

###### **Section : ลายเซ็น** {#section-:-ลายเซ็น}

| Field | Type |
| ----- | ----- |
| ผู้จ่ายเงิน (ลายเซ็น) | Text |
| ผู้รับเงิน (ลายเซ็น) | Text |

###### **ปุ่มการทำงาน** {#ปุ่มการทำงาน}

| Button | Action |
| ----- | :---: |
| บันทึก |  |
| ยกเลิก |  |

9. #### **Customer Receipt (รับเงินลูกค้า)** {#customer-receipt-(รับเงินลูกค้า)}

##### **Purpose** {#purpose-9}

ใช้บันทึกรับชำระเงินจากลูกค้า (Customer) สำหรับบิลขายที่ยังมียอดค้างรับ และสร้างเอกสาร Receipt Voucher เพื่อบันทึกประวัติการรับเงินเข้าสู่ระบบ

##### **Features** {#features-9}

* รับชำระเงินจากลูกค้า  
* รองรับการรับเงินหลายบิลใน 1 Receipt Voucher  
* รองรับการรับเงินบางส่วน (Partial Receipt)  
* คำนวณยอดคงเหลืออัตโนมัติ  
* รองรับส่วนลด (Discount)  
* รองรับค่าธรรมเนียมธนาคาร (Bank Fee)  
* รองรับภาษีหัก ณ ที่จ่าย (WHT)  
* แสดงยอดรับสุทธิ (Net Cash In)  
* บันทึกประวัติ Receipt Voucher  
* ค้นหาและติดตามสถานะการรับเงิน  
* แก้ไข Receipt Voucher  
* ยกเลิก Receipt Voucher

##### **Main Flow** {#main-flow-9}

##### 

##### 

##### **Business Rules** {#business-rules-9}

1. รับเงินได้เฉพาะบิลขายที่มียอดค้างรับ  
2. ระบบสามารถเลือกหลายบิลขายใน Receipt Voucher เดียวได้  
3. ระบบคำนวณยอดคงเหลือหลังรับเงินอัตโนมัติ  
4. ยอดรับต้องไม่เกินยอดค้างรับของบิล  
5. การรับเงินบางส่วนจะเปลี่ยนสถานะบิลเป็น Partial  
6. เมื่อรับเงินครบ ระบบเปลี่ยนสถานะบิลเป็น Paid  
7. ระบบบันทึกประวัติการรับเงินทุกครั้ง  
8. สามารถระบุบัญชีรับเงินได้

##### **หน้าหลัก (Customer Receipt Dashboard)** {#หน้าหลัก-(customer-receipt-dashboard)}

###### **Dashboard Summary** {#dashboard-summary}

| Field | Type |
| ----- | ----- |
| ยอดค้างรับรวม | Display |
| เกินกำหนด | Display |
| ครบกำหนดวันนี้ | Display |
| ครบใน 7 วัน | Display |

###### **Search & Filter** {#search-&-filter}

| Field | Type |
| ----- | ----- |
| ค้นหาเลขบิล / ชื่อลูกค้า / รหัสลูกค้า / Ref No | Textbox |
| วันที่เริ่มต้น | Date |
| วันที่สิ้นสุด | Date |

###### **ตารางบิลค้างรับ** {#ตารางบิลค้างรับ}

| Field | Type |
| ----- | ----- |
| เลขบิล | Display |
| วันที่ | Display |
| Customer | Display |
| ยอดรวม | Display |
| รับแล้ว | Display |
| คงเหลือ | Display |
| อายุ (วัน) | Display |
| ปุ่ม "รับบิลนี้" | Button |

###### **Customer ค้างรับมากสุด (Top 10\)** {#customer-ค้างรับมากสุด-(top-10)}

| Field | Type |
| ----- | ----- |
| ชื่อลูกค้า | Display |
| จำนวนบิลค้าง | Display |
| ยอดค้างรับ | Display |
| Progress Bar | Display |

###### **ประวัติ Receipt Voucher** {#ประวัติ-receipt-voucher}

| Field | Type |
| ----- | ----- |
| เลขที่ Voucher | Display |
| วันที่ | Display |
| Customer | Display |
| ตัดบิล | Display |
| บัญชีรับเงิน | Display |
| วิธีรับเงิน | Display |
| ยอดรวม | Display |
| แก้ไข | Button |
| พิมพ์ | Button |
| ลบ | Button |

##### **Popup สร้าง / แก้ไข Receipt Voucher** {#popup-สร้าง-/-แก้ไข-receipt-voucher}

ใช้ Popup เดียวกันสำหรับ Create และ Edit

###### **ข้อมูลส่วนหัว** {#ข้อมูลส่วนหัว}

| Field | Type | Required |
| ----- | ----- | ----- |
| เลขที่ | Auto Generate | ✓ |
| วันที่ | Date | ✓ |
| สาขา (Filter) | Dropdown |  |
| วิธีรับเงิน | Dropdown | ✓ |
| บัญชีรับเงิน | Dropdown | ✓ |
| หมายเหตุ | Textbox |  |

###### **รายการรับเงิน** {#รายการรับเงิน}

| Field | Type | Required |
| ----- | ----- | ----- |
| เลือกบิลขาย | Lookup/Search | ✓ |
| Customer | Auto Display |  |
| ค้างรับ | Auto Display |  |
| รับ | Numeric | ✓ |
| Discount | Numeric |  |
| Bank Fee | Numeric |  |
| WHT | Numeric |  |
| ลบรายการ | Button |  |

###### **Summary** {#summary-1}

| Field | Type |
| ----- | ----- |
| รวมยอดรับ | Auto Calculate |
| รวม Discount | Auto Calculate |
| รวม Bank Fee | Auto Calculate |
| รวม WHT | Auto Calculate |
| Net Cash In | Auto Calculate |

###### **Action Buttons** {#action-buttons-4}

| Button | Action |
| ----- | ----- |
| เพิ่มบรรทัด |  |
| บันทึก |  |
| ยกเลิก |  |

10. #### **Transfer Between Accounts (โอนเงินระหว่างบัญชี)** {#transfer-between-accounts-(โอนเงินระหว่างบัญชี)}

##### **Purpose** {#purpose-10}

ใช้บันทึกรายการโอนเงินระหว่างบัญชีธนาคารหรือบัญชีเงินสดภายในองค์กร เพื่อใช้ติดตามการเคลื่อนไหวของเงินและสร้างรายการ Bank Statement ทั้งฝั่งบัญชีต้นทางและปลายทาง

##### **Features** {#features-10}

* สร้างรายการโอนเงินระหว่างบัญชี  
* ระบุบัญชีต้นทางและบัญชีปลายทาง  
* รองรับค่าธรรมเนียมการโอน (Transfer Fee)  
* บันทึกผู้ทำรายการ  
* ค้นหารายการโอนย้อนหลัง  
* กรองข้อมูลตามช่วงวันที่  
* กรองตามบัญชีต้นทางและปลายทาง  
* แก้ไขรายการโอนเงิน  
* จัดเก็บประวัติการโอนเงินทุกครั้ง  
* อัพเดตยอดเงินของบัญชีลงในเมนู Cash/Bank Statement อัตโนมัติ

##### **Main Flow** {#main-flow-10}

##### 

##### **Business Rules** {#business-rules-10}

1. บัญชีต้นทางและบัญชีปลายทางต้องไม่เป็นบัญชีเดียวกัน  
2. จำนวนเงินโอนต้องมากกว่า 0  
3. ค่าธรรมเนียมการโอนสามารถระบุได้  
4. ระบบสร้างรายการ Bank Statement 2 ฝั่ง (ถอนจากต้นทาง / ฝากเข้าปลายทาง)  
5. การแก้ไขรายการต้องอัปเดตยอดทั้งสองบัญชี  
   

##### **หน้าหลัก (Transfer Between Accounts)** {#หน้าหลัก-(transfer-between-accounts)}

###### **Search & Filter** {#search-&-filter-1}

| Field | Type |
| ----- | ----- |
| ค้นหาเลขที่ / หมายเหตุ | Textbox |
| วันที่เริ่มต้น | Date |
| วันที่สิ้นสุด | Date |
| บัญชีต้นทาง | Dropdown |
| บัญชีปลายทาง | Dropdown |
| ช่วงเวลา (ทั้งหมด / วันนี้ / 7 วัน / เดือนนี้) | Button Group |

###### **ตารางรายการโอนเงิน** {#ตารางรายการโอนเงิน}

| Field | Type |
| ----- | ----- |
| เลขที่ | Display |
| วันที่ | Display |
| จาก (บัญชีต้นทาง) | Display |
| เข้า (บัญชีปลายทาง) | Display |
| จำนวน | Display |
| Fee | Display |
| ผู้ทำ | Display |
| แก้ไข | Button |
| ลบ | Button |

###### **Summary** {#summary-2}

| Field | Type |
| ----- | ----- |
| จำนวนรายการทั้งหมด | Display |
| ยอดรวมรายการโอน | Display |

##### **Popup เพิ่ม / แก้ไข โอนเงินระหว่างบัญชี** {#popup-เพิ่ม-/-แก้ไข-โอนเงินระหว่างบัญชี}

ใช้ Popup เดียวกันสำหรับ Create และ Edit

###### **ข้อมูลส่วนหัว** {#ข้อมูลส่วนหัว-1}

| Field | Type | Required |
| ----- | ----- | ----- |
| เลขที่ | Auto Generate | ✓ |
| วันที่ | Date | ✓ |
| จากบัญชี | Dropdown | ✓ |
| เข้าบัญชี | Dropdown | ✓ |
| จำนวน | Decimal | ✓ |
| ค่าธรรมเนียม | Decimal |  |
| ผู้ทำรายการ | Textbox |  |
| หมายเหตุ | Textarea |  |

###### **Action Buttons** {#action-buttons-5}

| Button | Action |
| ----- | ----- |
| บันทึก |  |
| ยกเลิก |  |

11. #### **Expense Voucher (ค่าใช้จ่าย)** {#expense-voucher-(ค่าใช้จ่าย)}

##### **Purpose** {#purpose-11}

ใช้บันทึกค่าใช้จ่ายของบริษัท ทั้งแบบจ่ายทันทีและค้างจ่าย พร้อมรองรับ VAT, WHT และสร้างรายการจ่ายเงินออกจากบัญชีบริษัท

##### **Features** {#features-11}

* สร้าง Expense Voucher  
* แก้ไข Expense Voucher  
* ลบ Expense Voucher  
* บันทึกค่าใช้จ่ายหลายรายการใน Voucher เดียว  
* รองรับการจ่ายทันที  
* รองรับการบันทึกค้างจ่าย  
* รองรับ VAT 7%  
* รองรับภาษีหัก ณ ที่จ่าย (WHT)  
* รองรับอ้างอิง Invoice หรือใบเสร็จ  
* ระบุผู้รับเงิน  
* ระบุบัญชีจ่ายเงิน  
* คำนวณ Net Pay อัตโนมัติ  
* Export Excel  
* Dashboard สรุปค่าใช้จ่าย

##### **Main Flow** {#main-flow-11}

##### **Business Rules** {#business-rules-11}

1. สร้างใบแจ้งหนี้ค่าใช้จ่ายโดยการกดปุ่มสร้าง Expense Voucher  
2. ก่อนบันทึกจะมี 2 เงื่อนไข คือ บันทึกรอจ่าย หรือ บันทึกจ่ายทันที  
   1. กรณีบันทึกรอจ่าย รายการรอจ่ายจะเข้าไปอยู่ที่เมนูอนุมัติโอนเงินในส่วนของค่าใช้จ่าย ซึ่งจะต้องรอการอนุมัติ เมื่อได้รับการอนุมัติแล้ว สถานะรายการในประวัติรายการค่าใช้จ่ายจะเปลี่ยนสถานะจากรออนุมัติเป็นอนุมัติแล้ว  
   2. เมื่อสถานะเปลี่ยนเป็นอนุมัติแล้ว ผู้ใช้ระบบก็สามารถกดชำระเงินได้ในเมนูหน้าค่าใช้จ่าย เมื่อเสร็จสิ้นสถานะรายการในเมนูค่าใช้จ่ายนั้นจะถูกเปลี่ยนเป็นจ่ายแล้ว และจะถูกบันทึกลงตารางประวัติการชำระเงิน และเงินที่จ่ายไปจะถูกนำไปหักออกในเมนู Cash/Bank Statement  
   3. กรณีบันทึกจ่ายทันที สถานะรายการในเมนูค่าใช้จ่ายนั้นจะถูกเปลี่ยนเป็นจ่ายแล้ว และจะถูกบันทึกลงตารางประวัติการชำระเงิน และเงินที่จ่ายไปจะถูกนำไปหักออกในเมนู Cash/Bank Statement  
3. ถ้าจ่ายเงินแล้วจะแก้ไขไม่ได้และลบไม่ได้ 

##### **หน้าหลัก (Expense Voucher List)** {#หน้าหลัก-(expense-voucher-list)}

**Dashboard Summary**

| Field | Description |
| ----- | ----- |
| ค่าใช้จ่ายเดือนนี้ |  |
| รอจ่าย (Net Pay) |  |
| จ่ายแล้ว (Net Pay) |  |
| กราฟค่าใช้จ่าย 6 เดือนล่าสุด |  |
| หมวดค่าใช้จ่าย (เดือนนี้) |  |
| Top 5 ผู้รับเงิน (เดือนนี้) |  |

###### **Search & Filter** {#search-&-filter-2}

| Field | Description |
| ----- | ----- |
| ค้นหาเลข Voucher / ชื่อผู้รับ |  |
| วันที่เริ่มต้น |  |
| วันที่สิ้นสุด |  |
| หมวดค่าใช้จ่าย |  |
| ผู้รับ / Supplier |  |
| บัญชี |  |
| สถานะ (รอจ่าย / บางส่วน / จ่ายแล้ว / ทั้งหมด) |  |

###### **ตารางรายการค่าใช้จ่าย** {#ตารางรายการค่าใช้จ่าย}

| Field | Description |
| ----- | ----- |
| เลขที่ |  |
| วันที่ |  |
| ครบกำหนด |  |
| อ้างอิง |  |
| ผู้รับ |  |
| บัญชี |  |
| สถานะ |  |
| จำนวนรายการ |  |
| Net Pay |  |
| ยอด VAT |  |
| ยอด WHT |  |
| การกระทำ (แก้ไข / ลบ) |  |

##### **Popup สร้าง / แก้ไข Expense Voucher** {#popup-สร้าง-/-แก้ไข-expense-voucher}

ใช้ Popup เดียวกันสำหรับ Create และ Edit

###### **ข้อมูลส่วนหัว (Header)** {#ข้อมูลส่วนหัว-(header)}

| Field | Required |
| ----- | ----- |
| เลขที่ | ✓ |
| วันที่บิล | ✓ |
| วันครบกำหนดชำระ (เครดิต) |  |
| อ้างอิงเอกสาร (Invoice / ใบเสร็จ) |  |
| ผู้รับเงิน | ✓ |
| วิธีจ่าย | ✓ |
| บัญชีจ่าย | ✓ |
| สาขา |  |

###### **ข้อมูลบัญชีปลายทาง (สำหรับโอน)** {#ข้อมูลบัญชีปลายทาง-(สำหรับโอน)}

| Field | Description |
| ----- | ----- |
| ธนาคาร |  |
| เลขที่บัญชี |  |
| ชื่อบัญชี |  |

###### **รายการค่าใช้จ่าย** {#รายการค่าใช้จ่าย}

| Field | Required |
| ----- | ----- |
| หมวดค่าใช้จ่าย | ✓ |
| รายละเอียด | ✓ |
| จำนวน | ✓ |
| ใช้ VAT |  |
| VAT 7% |  |
| ประเภท WHT |  |
| ยอดหัก ณ ที่จ่าย |  |
| ลบรายการ |  |

###### **Summary** {#summary-3}

| Field | Description |
| ----- | ----- |
| รวมค่าใช้จ่าย |  |
| รวม VAT |  |
| รวม WHT |  |
| Net Pay |  |
| หมายเหตุ |  |

###### **Action Buttons** {#action-buttons-6}

| Button | Description |
| ----- | ----- |
| เพิ่มบรรทัด |  |
| บันทึก (รอจ่าย) |  |
| บันทึก \+ จ่ายทันที |  |
| ยกเลิก |  |

12. #### **Petty Cash / Director Advance (เงินสำรองจ่าย / กู้กรรมการ)** {#petty-cash-/-director-advance-(เงินสำรองจ่าย-/-กู้กรรมการ)}

##### **Purpose** {#purpose-12}

ใช้บันทึกการจ่ายเงินสำรองให้กรรมการหรือพนักงานเพื่อนำไปใช้จ่ายแทนบริษัท และติดตามการเคลียร์เงินสำรอง การคืนเงิน หรือการนำใบเสร็จมาเบิกหักล้างภายหลัง

##### **Features**  {#features-12}

* สร้างรายการเงินสำรองจ่าย  
* รองรับเงินสำรองให้กรรมการ  
* รองรับเงินสำรองให้พนักงาน  
* ระบุผู้รับเงินสำรอง  
* ระบุบัญชีที่ใช้จ่ายออก  
* ติดตามยอดคงค้าง  
* ติดตามยอดใช้ไปแล้ว  
* ติดตามยอดคืนเงิน  
* ค้นหารายการย้อนหลัง  
* แก้ไขรายการ  
* ยกเลิกรายการ  
* เคลียร์เงินสำรอง (คืนเงิน / ส่งใบเสร็จ)  
* Dashboard สรุปสถานะเงินสำรอง

##### **Main Flow** {#main-flow-12}

##### **Business Rules** {#business-rules-12}

1. ผู้รับเงินต้องเป็นกรรมการหรือพนักงาน  
2. เงินสำรองต้องมีบัญชีจ่ายออก  
3. ยอดจ่ายต้องมากกว่า 0  
4. เงินสำรองสามารถถูกเคลียร์ได้หลายครั้ง  
5. ยอดใช้ไป \+ ยอดคืนเงิน ต้องไม่เกินยอดจ่าย  
6. ระบบคำนวณยอดคงค้างอัตโนมัติ  
7. รายการที่คงค้างจะอยู่ในสถานะ "ค้างคืน"  
8. เมื่อเคลียร์ครบ ระบบเปลี่ยนสถานะเป็น "ปิดรายการ"

##### **หน้าหลัก** {#หน้าหลัก}

###### **Dashboard Summary** {#dashboard-summary-1}

| Field |
| ----- |
| รายการทั้งหมด |
| ค้างคืน (Active) |
| จ่ายไปทั้งหมด |
| ใช้จ่าย/คืนแล้ว |
| คงค้าง |

###### **Top 10 ผู้รับเงินที่ค้างคืน** {#top-10-ผู้รับเงินที่ค้างคืน}

| Field |
| ----- |
| ชื่อผู้รับเงิน |
| จำนวนครั้ง |
| ยอดคงค้าง |

###### **Search & Filter** {#search-&-filter-3}

| Field |
| ----- |
| ค้นหา |
| ประเภท |
| สถานะ |

###### **ตารางรายการ** {#ตารางรายการ-1}

| Field | Description |
| ----- | ----- |
| เลขที่ |  |
| วันที่ |  |
| ประเภท |  |
| ผู้รับเงิน |  |
| ยอดจ่าย |  |
| ใช้ไปแล้ว |  |
| คืนแล้ว |  |
| คงค้าง |  |
| สถานะ |  |
| ดูรายละเอียด |  |
| คืนเงิน |  |
| แก้ไข |  |
| ลบ |  |

##### 

##### **Popup เพิ่ม / แก้ไข เงินสำรองจ่าย** {#popup-เพิ่ม-/-แก้ไข-เงินสำรองจ่าย}

ใช้ Popup เดียวกันสำหรับ Create และ Edit

###### **ข้อมูลส่วนหัว** {#ข้อมูลส่วนหัว-2}

| Field | Required |
| ----- | ----- |
| เลขที่ | ✓ |
| วันที่ | ✓ |
| ประเภท | ✓ |
| ผู้รับเงิน | ✓ |
| จำนวนเงิน | ✓ |
| บัญชีจ่ายออก | ✓ |
| หมายเหตุ |  |

###### **รายละเอียด Field** {#รายละเอียด-field}

| Field | Type |
| ----- | ----- |
| เลขที่ | Auto Generate |
| วันที่ | Date Picker |
| ประเภท | Dropdown (กรรมการ / พนักงาน) |
| ผู้รับเงิน | Textbox / Lookup |
| จำนวนเงิน | Decimal |
| บัญชีจ่ายออก | Dropdown |
| หมายเหตุ | Textarea |

###### 

###### **Action Buttons** {#action-buttons-7}

| Button |
| ----- |
| บันทึก \+ จ่ายเงิน |
| ยกเลิก |

13. #### **Expense Dashboard (แดชบอร์ดค่าใช้จ่าย)** {#expense-dashboard-(แดชบอร์ดค่าใช้จ่าย)}

##### **Purpose** {#purpose-13}

ใช้ติดตาม วิเคราะห์ และเปรียบเทียบค่าใช้จ่ายรายหมวดในแต่ละเดือน เพื่อช่วยตรวจสอบแนวโน้มค่าใช้จ่าย ความผิดปกติ และสรุปภาพรวมการใช้จ่ายขององค์กร

##### **Features** {#features-13}

* แสดงสรุปค่าใช้จ่ายย้อนหลัง  
* เปรียบเทียบค่าใช้จ่ายรายเดือน  
* แสดงค่าเฉลี่ยค่าใช้จ่าย  
* วิเคราะห์แนวโน้มค่าใช้จ่าย  
* ตรวจจับค่าใช้จ่ายผิดปกติ (Anomaly Detection)  
* แสดงค่าใช้จ่ายแยกตามหมวด  
* แสดงยอดรวมรายเดือน  
* แสดงสถานะปกติ / ผิดปกติของแต่ละหมวด  
* เลือกช่วงวิเคราะห์ย้อนหลัง (3 เดือน / 6 เดือน / 12 เดือน)

##### **Main Flow** {#main-flow-13}

##### **Business Rules** {#business-rules-13}

1. ข้อมูลอ้างอิงจาก Expense Voucher ที่บันทึกในระบบ  
2. คำนวณค่าเฉลี่ยจากช่วงเวลาที่ผู้ใช้เลือก  
3. ระบบตรวจจับความผิดปกติจากค่าเฉลี่ยย้อนหลัง  
4. ค่าใช้จ่ายที่สูงหรือต่ำผิดปกติจะแสดงสถานะแจ้งเตือน  
5. ข้อมูลแสดงผลแยกตามหมวดค่าใช้จ่าย  
6. Dashboard เป็นข้อมูลสรุป ไม่สามารถแก้ไขข้อมูลได้

##### **หน้าหลัก** {#หน้าหลัก-1}

###### **ตัวเลือกช่วงวิเคราะห์** {#ตัวเลือกช่วงวิเคราะห์}

| Field | Type |
| ----- | ----- |
| ย้อนหลัง 3 เดือน | Button |
| ย้อนหลัง 6 เดือน | Button |
| ย้อนหลัง 12 เดือน | Button |

###### **Dashboard Summary** {#dashboard-summary-2}

| Field | Type |
| ----- | ----- |
| รวม 6 เดือน | Display |
| เฉลี่ย / เดือน | Display |
| เดือนนี้ | Display |
| เทียบเฉลี่ย (%) | Display |

## 

## 

## 

###### **สถานะการวิเคราะห์** {#สถานะการวิเคราะห์}

| Field | Type |
| ----- | ----- |
| ข้อความสรุปผลการวิเคราะห์ | Display |

**ตัวอย่าง**

* ไม่พบความผิดปกติ  
* ค่าใช้จ่ายสูงกว่าค่าเฉลี่ย  
* ค่าใช้จ่ายต่ำกว่าค่าเฉลี่ย

###### **ตารางเปรียบเทียบค่าใช้จ่าย** {#ตารางเปรียบเทียบค่าใช้จ่าย}

| Field | Type |
| ----- | ----- |
| หมวด | Display |
| ม.ค. | Display |
| ก.พ. | Display |
| มี.ค. | Display |
| เม.ย. | Display |
| พ.ค. | Display |
| มิ.ย. | Display |
| เฉลี่ย | Display |
| รวม | Display |
| สถานะ | Display |

###### 

###### 

###### 

###### **แถวสรุปรวม** {#แถวสรุปรวม}

| Field | Type |
| ----- | ----- |
| รวมทุกหมวด (แต่ละเดือน) | Display |
| ค่าเฉลี่ยรวม | Display |
| ยอดรวมทั้งหมด | Display |

###### **เกณฑ์ตรวจจับความผิดปกติ (จากหมายเหตุด้านล่างจอ)** {#เกณฑ์ตรวจจับความผิดปกติ-(จากหมายเหตุด้านล่างจอ)}

| Field | Type |
| ----- | ----- |
| เกณฑ์ความผิดปกติ | Display |

14. #### **Stock Transfer Between Branches (โอนสินค้าระหว่างสาขา)** {#stock-transfer-between-branches-(โอนสินค้าระหว่างสาขา)}

##### **Purpose** {#purpose-14}

ใช้บันทึกการโอนสินค้าระหว่างสาขาหรือคลังสินค้า เพื่อย้ายสินค้าออกจากคลังต้นทางและเพิ่มสินค้าเข้าคลังปลายทาง พร้อมติดตามประวัติการเคลื่อนไหวของสินค้า

##### **Features** {#features-14}

* สร้างรายการโอนสินค้าระหว่างสาขา  
* เลือกสาขาและคลังต้นทาง  
* เลือกสาขาและคลังปลายทาง  
* โอนสินค้าได้หลายรายการในเอกสารเดียว  
* ตรวจสอบสต๊อกคงเหลือก่อนโอน  
* รองรับการระบุ Lot สินค้า  
* บันทึกผู้ส่งและผู้รับ  
* คำนวณน้ำหนักรวมอัตโนมัติ  
* ค้นหารายการโอนย้อนหลัง  
* ยกเลิกรายการโอน  
* ติดตามประวัติการโอนสินค้า

##### **Main Flow** {#main-flow-14}

##### **Business Rules** {#business-rules-14}

1. สาขาต้นทางและปลายทางต้องไม่เป็นสถานที่เดียวกัน  
2. คลังต้นทางและปลายทางต้องถูกกำหนดก่อนบันทึก  
3. จำนวนที่โอนต้องไม่เกินสต๊อกคงเหลือต้นทาง  
4. เมื่อบันทึกรายการ ระบบตัดสต๊อกจากคลังต้นทาง  
5. เมื่อบันทึกรายการ ระบบเพิ่มสต๊อกเข้าคลังปลายทาง  
6. สินค้าสามารถอ้างอิง Lot ได้  
7. เอกสารที่บันทึกแล้วต้องถูกเก็บเป็นประวัติการเคลื่อนไหวสินค้า  
8. การยกเลิกรายการต้องคืนสต๊อกกลับต้นทางและลบผลกระทบที่ปลายทาง

##### **หน้าหลัก (Transfer List)** {#หน้าหลัก-(transfer-list)}

###### **Search & Filter** {#search-&-filter-4}

| Field | Type |
| ----- | ----- |
| ค้นหาเลขที่ / ผู้ส่ง / ผู้รับ / หมายเหตุ | Textbox |
| วันที่เริ่มต้น | Date |
| วันที่สิ้นสุด | Date |
| สาขาต้นทาง | Dropdown |
| สาขาปลายทาง | Dropdown |
| ช่วงเวลา (ทั้งหมด / วันนี้ / 7 วัน / เดือนนี้) | Button Group |

###### **Summary** {#summary-4}

| Field | Type |
| ----- | ----- |
| จำนวนรายการที่พบ | Display |
| น้ำหนักรวม | Display |

###### **ตารางรายการโอน** {#ตารางรายการโอน}

| Field | Type |
| ----- | ----- |
| เลขที่ | Display |
| วันที่ | Display |
| จาก (สาขา/คลังต้นทาง) | Display |
| ไป (สาขา/คลังปลายทาง) | Display |
| รายการ | Display |
| น้ำหนักรวม | Display |
| ยกเลิก | Button |

##### **Popup เพิ่ม / แก้ไข การโอนสินค้า** {#popup-เพิ่ม-/-แก้ไข-การโอนสินค้า}

ใช้ Popup เดียวกันสำหรับ Create และ Edit

###### **ข้อมูลเอกสาร** {#ข้อมูลเอกสาร}

| Field | Type | Required |
| ----- | ----- | ----- |
| เลขที่ | Auto Generate | ✓ |
| วันที่ | Date Picker | ✓ |

###### **ข้อมูลต้นทาง** {#ข้อมูลต้นทาง}

| Field | Type | Required |
| ----- | ----- | ----- |
| สาขาต้นทาง | Dropdown | ✓ |
| คลังต้นทาง | Dropdown | ✓ |

###### **ข้อมูลปลายทาง** {#ข้อมูลปลายทาง}

| Field | Type | Required |
| ----- | ----- | ----- |
| สาขาปลายทาง | Dropdown | ✓ |
| คลังปลายทาง | Dropdown | ✓ |

###### **รายการสินค้า** {#รายการสินค้า-2}

| Field | Type | Required |
| ----- | ----- | ----- |
| สินค้า | Lookup/Search | ✓ |
| น้ำหนัก | Decimal | ✓ |
| คงเหลือต้นทาง | Auto Display |  |
| Lot | Textbox / Lookup |  |
| ลบรายการ | Button |  |

###### **ผู้เกี่ยวข้อง** {#ผู้เกี่ยวข้อง}

| Field | Type |
| ----- | ----- |
| ผู้ส่ง | Textbox |
| ผู้รับ | Textbox |

###### **Action Buttons** {#action-buttons-8}

| Button | Description |
| ----- | ----- |
| เพิ่มรายการ |  |
| บันทึก |  |
| ยกเลิก |  |

15. #### **Supplier Price Change History (ประวัติการเปลี่ยน Supplier)** {#supplier-price-change-history-(ประวัติการเปลี่ยน-supplier)}

##### **Purpose** {#purpose-15}

ใช้ติดตามประวัติการเปลี่ยนแปลงราคาซื้อสินค้าของ Supplier ในบิลซื้อ เพื่อเปรียบเทียบราคาเดิมและราคาใหม่ รวมถึงวิเคราะห์ผลต่างของมูลค่าการซื้อก่อน VAT

##### **Features** {#features-15}

* แสดงประวัติการเปลี่ยนแปลงราคาสินค้า  
* เปรียบเทียบราคาเดิมและราคาใหม่  
* แสดงยอดก่อน VAT ก่อนและหลังการเปลี่ยนแปลง  
* คำนวณส่วนต่างของมูลค่าซื้ออัตโนมัติ  
* ค้นหาประวัติจาก Supplier หรือสินค้า  
* แสดงผลกระทบของการเปลี่ยนราคาในแต่ละรายการ  
* สรุปจำนวนรายการที่มีการเปลี่ยนแปลง  
* สรุปผลต่างรวมก่อน VAT

##### **Main Flow** {#main-flow-15}

##### **Business Flow** {#business-flow}

1. เก็บเฉพาะรายการที่มีการเปลี่ยนแปลงราคา  
2. คำนวณยอดก่อน VAT เท่านั้น  
3. ระบบต้องบันทึกราคาเดิมและราคาใหม่ทุกครั้งที่มีการแก้ไข  
4. ผลต่างคำนวณจาก (ยอดใหม่ \- ยอดเดิม)  
5. หากราคาใหม่สูงกว่าเดิม ส่วนต่างเป็นบวก  
6. หากราคาใหม่ต่ำกว่าเดิม ส่วนต่างเป็นลบ  
7. ประวัติการเปลี่ยนแปลงไม่สามารถแก้ไขย้อนหลังได้  
8. ใช้สำหรับ Audit Trail และการตรวจสอบย้อนหลัง  
 


##### **หน้าหลัก** {#หน้าหลัก-2}

###### **Summary Section** {#summary-section-1}

| Field | Type |
| ----- | ----- |
| จำนวนรายการการเปลี่ยน | Display |
| ส่วนต่างรวม (ก่อน VAT) | Display |

###### **Search Section** {#search-section-1}

| Field | Type |
| ----- | ----- |
| ค้นหาชื่อ Supplier / สินค้า | Textbox |

###### **ตารางประวัติการเปลี่ยนแปลง** {#ตารางประวัติการเปลี่ยนแปลง}

| Field | Type |
| ----- | ----- |
| Supplier เดิม | Display |
| สินค้า | Display |
| น้ำหนัก (กก.) | Decimal |
| ราคาเก่า | Currency |
| ราคาใหม่ | Currency |
| ยอดเก่า (ก่อน VAT) | Currency |
| ยอดใหม่ (ก่อน VAT) | Currency |
| ส่วนต่าง (ก่อน VAT) | Currency |

###### **Footer Summary** {#footer-summary}

| Field | Type |
| ----- | ----- |
| ส่วนต่างรวม (ก่อน VAT) | Auto Calculate |

