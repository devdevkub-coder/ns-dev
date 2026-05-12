/* ════════════════════════════════════════════════════════════════
   📥 NS ERP — Universal Export to Excel
   - 9 sheets: สรุป + บิลซื้อ/บิลขาย/ค่าใช้จ่าย/จ่ายเงิน/รับเงิน
                + StockLedger + PO Buy + PO Sell
   - Join ID → ชื่อจริง ทุก reference
   - 1 บรรทัดต่อ 1 รายการสินค้า
   ════════════════════════════════════════════════════════════════
   วิธีติดตั้งใน index.html — เพิ่มบรรทัดเดียวก่อน body close tag:

     <script src="./export-button.js"><\/script>

   ════════════════════════════════════════════════════════════════ */
(function() {
  'use strict';

  const fmt = v => v ?? '';
  const num = v => Number(v||0);
  const mapById = arr => Object.fromEntries((arr||[]).map(x => [x.id, x]));
  const nm = (m, id, key='name') => m[id]?.[key] || '';

  function buildLookups() {
    const live = window.$erp?.db;
    if (!live) return null;
    return {
      live,
      sup: mapById(live.suppliers),
      cus: mapById(live.customers),
      prod: mapById(live.products),
      br: mapById(live.branches),
      wh: mapById(live.warehouses),
      pch: mapById(live.purchaseChannels),
      sch: mapById(live.salesChannels),
      cat: mapById(live.expenseCategories),
      acc: mapById(live.accounts),
      sp: mapById(live.salespersons),
    };
  }

  function buildPurchaseBills(L) {
    const rows = [];
    (L.live.purchaseBills||[]).forEach(b => {
      const items = b.items?.length ? b.items : [{productId:b.productId, qty:b.qty, unitPrice:b.unitPrice, totalAmount:b.totalAmount}];
      items.forEach((it, idx) => {
        const p = L.prod[it.productId] || {};
        rows.push({
          'Doc No': b.docNo,
          'Ref No': fmt(b.refNo),
          'Date': b.date,
          'Mode': fmt(b.transactionMode),
          'Bill Type': fmt(b.purchaseSource || b.billType),
          'Supplier Code': fmt(b.supplierId),
          'Supplier Name': nm(L.sup, b.supplierId),
          'Supplier Phone': L.sup[b.supplierId]?.phone || '',
          'Supplier TaxID': L.sup[b.supplierId]?.taxId || '',
          'Branch': nm(L.br, b.branchId),
          'Warehouse': nm(L.wh, b.warehouseId),
          'Channel': nm(L.pch, b.channelId),
          'Credit Term (วัน)': num(b.creditTerm),
          'ทะเบียนรถ': fmt(b.licensePlate),
          'ผู้ติดต่อ': fmt(b.contactName),
          'เบอร์ติดต่อ': fmt(b.contactPhone),
          '#รายการ': idx+1,
          'รหัสสินค้า': fmt(it.productId),
          'Code': fmt(p.code),
          'ชื่อสินค้า': fmt(p.name),
          'กลุ่มโลหะ': fmt(p.metalGroup),
          'รายละเอียด': fmt(it.desc),
          'หน่วย': fmt(p.unit || 'กก.'),
          'Lot': fmt(it.lotNo),
          'น้ำหนักรวม(Gross)': num(it.grossWeight),
          'น้ำหนักหัก(Tare)': num(it.deductWeight),
          'จำนวน(กก.)': num(it.netWeight || it.qty),
          'ราคา/หน่วย': num(it.price || it.unitPrice),
          'มูลค่าก่อนหักส่วนลด': num(it.amount),
          'ส่วนลดบรรทัด': num(it.discount),
          'มูลค่าบรรทัด(สุทธิ)': num(it.netAmount || it.totalAmount),
          'หมายเหตุบรรทัด': fmt(it.note),
          'VAT Type': fmt(b.vatType),
          'VAT': num(b.vatAmount),
          'มูลค่ารวมบิล': num(b.totalAmount),
          'จ่ายแล้ว': num(b.paidAmount),
          'คงค้าง': num(b.payableBalance),
          'เลขใบกำกับภาษี': fmt(b.taxInvoiceNo),
          'รับใบกำกับ?': b.vatInvoiceReceived ? 'รับแล้ว' : '',
          'วันที่ใบกำกับ': fmt(b.vatInvoiceDate),
          'PO Buy ID': fmt(b.poBuyId),
          'หมายเหตุ': fmt(b.note),
          'ผู้บันทึก': fmt(b.createdBy),
          'บันทึกเมื่อ': fmt(b.createdAt),
          'แก้ไขล่าสุด': fmt(b.updatedAt),
          'รหัสบิล (Internal)': b.id,
        });
      });
    });
    return rows;
  }

  function buildSalesBills(L) {
    const rows = [];
    (L.live.salesBills||[]).forEach(b => {
      const items = b.items?.length ? b.items : [{productId:b.productId, qty:b.qty, unitPrice:b.unitPrice, totalAmount:b.totalAmount}];
      items.forEach((it, idx) => {
        const p = L.prod[it.productId] || {};
        rows.push({
          'Doc No': b.docNo,
          'Ref No': fmt(b.refNo),
          'Date': b.date,
          'Mode': fmt(b.transactionMode),
          'Bill Type': fmt(b.billType || b.saleType),
          'Customer Code': fmt(b.customerId),
          'Customer Name': nm(L.cus, b.customerId),
          'Customer Phone': L.cus[b.customerId]?.phone || '',
          'Customer TaxID': L.cus[b.customerId]?.taxId || '',
          'Branch': nm(L.br, b.branchId),
          'Warehouse': nm(L.wh, b.warehouseId),
          'Channel': nm(L.sch, b.channelId),
          'Credit Term (วัน)': num(b.creditTerm),
          'ทะเบียนรถ': fmt(b.licensePlate),
          'ผู้ติดต่อ': fmt(b.contactName),
          'เบอร์ติดต่อ': fmt(b.contactPhone),
          '#รายการ': idx+1,
          'รหัสสินค้า': fmt(it.productId),
          'Code': fmt(p.code),
          'ชื่อสินค้า': fmt(p.name),
          'กลุ่มโลหะ': fmt(p.metalGroup),
          'หน่วย': fmt(p.unit || 'กก.'),
          'Lot': fmt(it.lotNo),
          'จำนวน(กก.)': num(it.weight || it.qty),
          'ราคา/หน่วย': num(it.price || it.unitPrice),
          'มูลค่าก่อนหักส่วนลด': num(it.amount),
          'ส่วนลดบรรทัด': num(it.discount),
          'มูลค่าบรรทัด(สุทธิ)': num(it.netAmount || it.totalAmount),
          'ราคาทุน/หน่วย (FIFO)': num(it.unitCost),
          'ทุนรวม(บรรทัด)': num(it.totalCost),
          'กำไรบรรทัด': num(it.profit),
          'หมายเหตุบรรทัด': fmt(it.note),
          'VAT Type': fmt(b.vatType),
          'VAT': num(b.vatAmount),
          'มูลค่ารวมบิล': num(b.totalAmount),
          'รับชำระแล้ว': num(b.receivedAmount),
          'คงค้าง(ลูกหนี้)': num(b.receivableBalance),
          'COGS': num(b.cogsAmount),
          'กำไรขั้นต้น': num(b.grossProfit),
          'อ้างอิงบิลซื้อ (Trading)': fmt(b.tradingFromPurchaseId),
          'หมายเหตุ': fmt(b.note),
          'ผู้บันทึก': fmt(b.createdBy),
          'บันทึกเมื่อ': fmt(b.createdAt),
          'รหัสบิล (Internal)': b.id,
        });
      });
    });
    return rows;
  }

  function buildExpenses(L) {
    return (L.live.expenses||[]).map(e => ({
      'เลขที่บิล': e.docNo,
      'วันที่': e.date,
      'หมวด ID': fmt(e.categoryId),
      'หมวดค่าใช้จ่าย': nm(L.cat, e.categoryId),
      'รายละเอียด': fmt(e.description || e.note),
      'จำนวนเงิน(ก่อน VAT)': num(e.amount),
      'VAT': num(e.vatAmount),
      'WHT': num(e.whtAmount),
      'จำนวนสุทธิ': num(e.netAmount),
      'สาขา': nm(L.br, e.branchId),
      'จ่ายผ่านบัญชี': nm(L.acc, e.accountId),
      'เลขใบกำกับภาษี': fmt(e.taxInvoiceNo),
      'ผู้รับเงิน/Vendor': fmt(e.payee),
      'ผู้อนุมัติ': fmt(e.approvedBy),
      'อนุมัติเมื่อ': fmt(e.approvedAt),
      'จ่ายเมื่อ': fmt(e.paidAt),
      'ผู้บันทึก': fmt(e.createdBy),
      'บันทึกเมื่อ': fmt(e.createdAt),
      'รหัสบิล (Internal)': e.id,
    }));
  }

  function buildPayments(L) {
    return (L.live.payments||[]).map(p => ({
      'เลขที่ใบจ่าย': p.docNo,
      'วันที่จ่าย': p.date,
      'อ้างอิงบิลซื้อ ID': fmt(p.billId),
      'รหัสผู้รับเงิน': fmt(p.supplierId),
      'ชื่อผู้รับเงิน': nm(L.sup, p.supplierId),
      'จำนวนเงินก่อนหัก': num(p.amount),
      'หักภาษี ณ ที่จ่าย': num(p.withholdingTax),
      'จำนวนเงินสุทธิ': num(p.netAmount),
      'บัญชีจ่าย': nm(L.acc, p.accountId),
      'เลขที่เช็ค/อ้างอิง': fmt(p.refNo),
      'สาขา': nm(L.br, p.branchId),
      'หมายเหตุ': fmt(p.note),
      'ผู้บันทึก': fmt(p.createdBy),
      'บันทึกเมื่อ': fmt(p.createdAt),
      'รหัส (Internal)': p.id,
    }));
  }

  function buildReceipts(L) {
    return (L.live.receipts||[]).map(r => ({
      'เลขที่ใบรับ': r.docNo,
      'วันที่รับ': r.date,
      'อ้างอิงบิลขาย ID': fmt(r.billId),
      'รหัสลูกค้า': fmt(r.customerId),
      'ชื่อลูกค้า': nm(L.cus, r.customerId),
      'จำนวนเงินก่อนหัก': num(r.amount),
      'หักภาษี ณ ที่จ่าย': num(r.withholdingTax),
      'จำนวนเงินสุทธิ': num(r.netAmount),
      'บัญชีรับ': nm(L.acc, r.accountId),
      'เลขที่เช็ค/อ้างอิง': fmt(r.refNo),
      'สาขา': nm(L.br, r.branchId),
      'หมายเหตุ': fmt(r.note),
      'ผู้บันทึก': fmt(r.createdBy),
      'บันทึกเมื่อ': fmt(r.createdAt),
      'รหัส (Internal)': r.id,
    }));
  }

  function buildStockLedger(L) {
    return (L.live.stockLedger||[]).map(s => {
      const p = L.prod[s.productId] || {};
      return {
        'วันที่': s.date,
        'ประเภท': fmt(s.movementType),
        'อ้างอิง Type': fmt(s.refType),
        'เลขที่อ้างอิง': fmt(s.refNo),
        'รหัสสินค้า': fmt(s.productId),
        'Code': fmt(p.code),
        'ชื่อสินค้า': fmt(p.name),
        'กลุ่มโลหะ': fmt(p.metalGroup),
        'คลัง': nm(L.wh, s.warehouseId),
        'สาขา': nm(L.br, s.branchId),
        'จำนวนเข้า(กก.)': num(s.qtyIn),
        'จำนวนออก(กก.)': num(s.qtyOut),
        'มูลค่าเข้า': num(s.valueIn),
        'มูลค่าออก': num(s.valueOut),
        'ราคาทุน/หน่วย': num(s.unitCost),
        'ช่องทางซื้อ': nm(L.pch, s.purchaseChannelId),
        'ช่องทางขาย': nm(L.sch, s.salesChannelId),
        'หมายเหตุ': fmt(s.note),
        'อ้างอิง ID': fmt(s.refId),
        'ผู้บันทึก': fmt(s.createdBy),
        'บันทึกเมื่อ': fmt(s.createdAt),
        'รหัส (Internal)': s.id,
      };
    });
  }

  function buildPOBuys(L) {
    const rows = [];
    (L.live.poBuys||[]).forEach(po => {
      const items = po.items?.length ? po.items : [{productId:po.productId, qty:po.qty, unitPrice:po.unitPrice, totalCost:po.totalCost, remainingQty:po.remainingQty}];
      items.forEach((it, idx) => {
        const p = L.prod[it.productId] || {};
        rows.push({
          'เลขที่ PO': po.docNo,
          'วันที่': po.date,
          'รหัสผู้ขาย': fmt(po.supplierId),
          'ชื่อผู้ขาย': nm(L.sup, po.supplierId),
          'สาขา': nm(L.br, po.branchId),
          'ช่องทาง': nm(L.pch, po.channelId),
          'สถานะ': fmt(po.status),
          'ประเภทใช้งาน': po.requireDelivery === false ? 'Cost Pool / Costing' : 'ส่งของจริง',
          'Cost Pool (Opening)': po.isOpeningPool ? 'YES' : '',
          'วันที่คาดส่ง': fmt(po.expectedDelivery),
          '#รายการ': idx+1,
          'รหัสสินค้า': fmt(it.productId),
          'Code': fmt(p.code),
          'ชื่อสินค้า': fmt(p.name),
          'จำนวนสั่ง(กก.)': num(it.qty),
          'รับแล้ว(กก.)': num(it.qty) - num(it.remainingQty),
          'คงเหลือรับ(กก.)': num(it.remainingQty),
          'ราคา/หน่วย': num(it.unitPrice),
          'มูลค่าบรรทัด': num(it.totalCost),
          'มูลค่ารวม PO': num(po.totalCost),
          'หมายเหตุ': fmt(po.note),
          'ผู้บันทึก': fmt(po.createdBy),
          'บันทึกเมื่อ': fmt(po.createdAt),
          'รหัส (Internal)': po.id,
        });
      });
    });
    return rows;
  }

  function buildPOSells(L) {
    const rows = [];
    (L.live.poSells||[]).forEach(po => {
      const items = po.items?.length ? po.items : [{productId:po.productId, qty:po.qty, unitPrice:po.unitPrice, totalAmount:po.totalAmount, remainingQty:po.remainingQty}];
      items.forEach((it, idx) => {
        const p = L.prod[it.productId] || {};
        rows.push({
          'เลขที่ PO': po.docNo,
          'วันที่': po.date,
          'รหัสลูกค้า': fmt(po.customerId),
          'ชื่อลูกค้า': nm(L.cus, po.customerId),
          'สาขา': nm(L.br, po.branchId),
          'ช่องทาง': nm(L.sch, po.channelId),
          'สถานะ': fmt(po.status),
          'ประเภทใช้งาน': po.requireDelivery === false ? 'Cost Pool / Costing' : 'ส่งของจริง',
          'วันที่คาดส่ง': fmt(po.expectedDelivery),
          '#รายการ': idx+1,
          'รหัสสินค้า': fmt(it.productId),
          'Code': fmt(p.code),
          'ชื่อสินค้า': fmt(p.name),
          'จำนวนสั่ง(กก.)': num(it.qty),
          'ส่งแล้ว(กก.)': num(it.qty) - num(it.remainingQty),
          'คงเหลือส่ง(กก.)': num(it.remainingQty),
          'ราคา/หน่วย': num(it.unitPrice),
          'มูลค่าบรรทัด': num(it.totalAmount),
          'มูลค่ารวม PO': num(po.totalAmount),
          'หมายเหตุ': fmt(po.note),
          'ผู้บันทึก': fmt(po.createdBy),
          'บันทึกเมื่อ': fmt(po.createdAt),
          'รหัส (Internal)': po.id,
        });
      });
    });
    return rows;
  }

  /* ─── main export function ─── */
  window.exportNsErpToExcel = function exportNsErpToExcel(opts = {}) {
    if (typeof XLSX === 'undefined') {
      alert('❌ XLSX library ยังไม่โหลด — รอสักครู่แล้วลองใหม่');
      return;
    }
    const L = buildLookups();
    if (!L) {
      alert('❌ ระบบยังไม่พร้อม — ลองรีเฟรช + Login Supabase ก่อน');
      return;
    }

    const include = opts.sheets || {
      summary:true, purchaseBills:true, salesBills:true, expenses:true,
      payments:true, receipts:true, stockLedger:true, poBuys:true, poSells:true
    };

    const sheets = {};
    if (include.purchaseBills) sheets['บิลซื้อ'] = buildPurchaseBills(L);
    if (include.salesBills)    sheets['บิลขาย'] = buildSalesBills(L);
    if (include.expenses)      sheets['ค่าใช้จ่าย'] = buildExpenses(L);
    if (include.payments)      sheets['จ่ายเงิน'] = buildPayments(L);
    if (include.receipts)      sheets['รับเงิน'] = buildReceipts(L);
    if (include.stockLedger)   sheets['Stock Ledger'] = buildStockLedger(L);
    if (include.poBuys)        sheets['PO Buy'] = buildPOBuys(L);
    if (include.poSells)       sheets['PO Sell'] = buildPOSells(L);

    const wb = XLSX.utils.book_new();

    if (include.summary) {
      const summary = [
        ['ประเภท', 'จำนวนรายการ', 'จำนวนบรรทัด', 'มูลค่ารวม (บาท)'],
        ['บิลซื้อ', L.live.purchaseBills?.length||0, sheets['บิลซื้อ']?.length||0, (L.live.purchaseBills||[]).reduce((s,b)=>s+num(b.totalAmount),0)],
        ['บิลขาย', L.live.salesBills?.length||0, sheets['บิลขาย']?.length||0, (L.live.salesBills||[]).reduce((s,b)=>s+num(b.totalAmount),0)],
        ['ค่าใช้จ่าย', L.live.expenses?.length||0, sheets['ค่าใช้จ่าย']?.length||0, (L.live.expenses||[]).reduce((s,e)=>s+num(e.netAmount),0)],
        ['จ่ายเงิน', L.live.payments?.length||0, sheets['จ่ายเงิน']?.length||0, (L.live.payments||[]).reduce((s,p)=>s+num(p.netAmount),0)],
        ['รับเงิน', L.live.receipts?.length||0, sheets['รับเงิน']?.length||0, (L.live.receipts||[]).reduce((s,r)=>s+num(r.netAmount),0)],
        ['Stock Ledger', L.live.stockLedger?.length||0, sheets['Stock Ledger']?.length||0, ''],
        ['PO Buy', L.live.poBuys?.length||0, sheets['PO Buy']?.length||0, (L.live.poBuys||[]).reduce((s,p)=>s+num(p.totalCost),0)],
        ['PO Sell', L.live.poSells?.length||0, sheets['PO Sell']?.length||0, (L.live.poSells||[]).reduce((s,p)=>s+num(p.totalAmount),0)],
        [''],
        ['Export ณ', new Date().toLocaleString('th-TH')],
        ['Exporter', window.$erp?.currentUser?.name || ''],
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'สรุป');
    }

    Object.entries(sheets).forEach(([name, rows]) => {
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ '': 'ไม่มีข้อมูล' }]);
      XLSX.utils.book_append_sheet(wb, ws, name);
    });

    const today = new Date().toISOString().slice(0,10);
    const filename = `NS_ERP_Export_${today}.xlsx`;
    XLSX.writeFile(wb, filename);

    if (window.$erp?.showToast) {
      window.$erp.showToast(`✓ Export สำเร็จ — ${filename}`, 'success');
    } else {
      console.log(`✓ ${filename}`);
    }
  };

  /* ─── floating button — draggable + minimizable ─── */
  const POS_KEY = 'ns_export_btn_pos';
  const MIN_KEY = 'ns_export_btn_minimized';
  function loadPos() { try { return JSON.parse(localStorage.getItem(POS_KEY)||'null'); } catch(e){return null;} }
  function savePos(p) { try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch(e){} }
  function loadMin() { try { return localStorage.getItem(MIN_KEY) === '1'; } catch(e){return false;} }
  function saveMin(v) { try { localStorage.setItem(MIN_KEY, v?'1':'0'); } catch(e){} }

  function injectButton() {
    if (document.getElementById('ns-export-btn-wrap')) return;
    const minimized = loadMin();
    const saved = loadPos();
    const wrap = document.createElement('div');
    wrap.id = 'ns-export-btn-wrap';
    Object.assign(wrap.style, {
      position: 'fixed',
      bottom: saved ? '' : '20px',
      right: saved ? '' : '20px',
      top: saved ? saved.top + 'px' : '',
      left: saved ? saved.left + 'px' : '',
      zIndex: '30',
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
    });

    // Minimized state: ปุ่มกลมเล็กแสดง 📥 (click → restore)
    const miniBtn = document.createElement('button');
    miniBtn.id = 'ns-export-mini';
    miniBtn.innerHTML = '📥';
    miniBtn.title = 'คลิกเพื่อขยายปุ่ม Export';
    Object.assign(miniBtn.style, {
      width: '32px', height: '32px',
      borderRadius: '50%',
      background: 'rgba(16,185,129,0.85)',
      color: 'white',
      border: 'none',
      cursor: 'pointer',
      fontSize: '14px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      display: minimized ? 'block' : 'none',
    });

    // Full state: ปุ่ม Export + ปุ่ม X
    const fullDiv = document.createElement('div');
    fullDiv.id = 'ns-export-full';
    Object.assign(fullDiv.style, {
      display: minimized ? 'none' : 'flex',
      alignItems: 'center',
      gap: '2px',
    });

    const btn = document.createElement('button');
    btn.id = 'ns-export-btn';
    btn.innerHTML = '📥 Export Excel';
    btn.title = 'Export บิลซื้อ/ขาย/ค่าใช้จ่าย/Payments/Receipts/Stock Ledger/PO เป็น Excel';
    Object.assign(btn.style, {
      padding: '6px 12px',
      borderRadius: '999px 0 0 999px',
      background: 'linear-gradient(135deg,#10b981,#059669)',
      color: 'white',
      fontWeight: '600',
      fontSize: '11px',
      border: 'none',
      cursor: 'pointer',
      boxShadow: '0 2px 8px rgba(16,185,129,0.25)',
      opacity: '0.65',
      fontFamily: 'inherit',
      transition: 'opacity 0.15s',
    });
    btn.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
    btn.addEventListener('mouseleave', () => { btn.style.opacity = '0.65'; });
    btn.addEventListener('click', (ev) => {
      if (wrap._dragged) { wrap._dragged = false; return; }
      btn.disabled = true;
      btn.innerHTML = '⏳ กำลัง Export…';
      setTimeout(() => {
        try { window.exportNsErpToExcel(); }
        catch(e) { console.error(e); alert('❌ Export ผิดพลาด: ' + e.message); }
        btn.disabled = false;
        btn.innerHTML = '📥 Export Excel';
      }, 50);
    });

    // ปุ่ม X close → minimize
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '✕';
    closeBtn.title = 'ย่อปุ่ม (คลิก 📥 เพื่อขยาย)';
    Object.assign(closeBtn.style, {
      padding: '6px 8px',
      borderRadius: '0 999px 999px 0',
      background: 'rgba(127,127,127,0.6)',
      color: 'white',
      fontWeight: '700',
      fontSize: '11px',
      border: 'none',
      cursor: 'pointer',
      opacity: '0.65',
      fontFamily: 'inherit',
    });
    closeBtn.addEventListener('mouseenter', () => { closeBtn.style.opacity = '1'; });
    closeBtn.addEventListener('mouseleave', () => { closeBtn.style.opacity = '0.65'; });
    closeBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      fullDiv.style.display = 'none';
      miniBtn.style.display = 'block';
      saveMin(true);
    });

    miniBtn.addEventListener('click', () => {
      miniBtn.style.display = 'none';
      fullDiv.style.display = 'flex';
      saveMin(false);
    });

    // Drag support — ลากย้ายตำแหน่งได้
    let dragData = null;
    function startDrag(ev) {
      const touch = ev.touches ? ev.touches[0] : ev;
      dragData = { startX: touch.clientX, startY: touch.clientY, origLeft: wrap.offsetLeft, origTop: wrap.offsetTop };
      wrap._dragged = false;
    }
    function onDrag(ev) {
      if (!dragData) return;
      const touch = ev.touches ? ev.touches[0] : ev;
      const dx = touch.clientX - dragData.startX;
      const dy = touch.clientY - dragData.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) wrap._dragged = true;
      const newLeft = Math.max(0, Math.min(window.innerWidth - wrap.offsetWidth, dragData.origLeft + dx));
      const newTop = Math.max(0, Math.min(window.innerHeight - wrap.offsetHeight, dragData.origTop + dy));
      wrap.style.left = newLeft + 'px';
      wrap.style.top = newTop + 'px';
      wrap.style.right = '';
      wrap.style.bottom = '';
    }
    function endDrag() {
      if (dragData && wrap._dragged) {
        savePos({ left: wrap.offsetLeft, top: wrap.offsetTop });
      }
      dragData = null;
    }
    wrap.addEventListener('mousedown', startDrag);
    wrap.addEventListener('touchstart', startDrag, { passive: true });
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('touchmove', onDrag, { passive: true });
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchend', endDrag);

    fullDiv.appendChild(btn);
    fullDiv.appendChild(closeBtn);
    wrap.appendChild(fullDiv);
    wrap.appendChild(miniBtn);
    document.body.appendChild(wrap);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectButton);
  } else {
    injectButton();
  }
  setTimeout(injectButton, 2000);
  setTimeout(injectButton, 5000);
})();
