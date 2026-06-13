import fs from 'fs';
import path from 'path';

const files = [
  'c:/new-ns-scrap-erp/apps/next/src/components/daily/BillSwapHistoryPageClient.tsx',
  'c:/new-ns-scrap-erp/apps/next/src/components/daily/DailyExpensePageClient.tsx',
  'c:/new-ns-scrap-erp/apps/next/src/components/daily/DailyPettyAdvancePageClient.tsx',
  'c:/new-ns-scrap-erp/apps/next/src/components/daily/DailyTransferPageClient.tsx',
  'c:/new-ns-scrap-erp/apps/next/src/components/daily/MoneyMovementPageClient.tsx',
  'c:/new-ns-scrap-erp/apps/next/src/components/daily/PaymentApprovalPageClient.tsx',
  'c:/new-ns-scrap-erp/apps/next/src/components/daily/ReceiptVouchersPageClient.tsx',
  'c:/new-ns-scrap-erp/apps/next/src/components/daily/StockTransferPageClient.tsx',
  'c:/new-ns-scrap-erp/apps/next/src/components/daily/TransactionBillsPageClient.tsx',
  'c:/new-ns-scrap-erp/apps/next/src/components/daily/WeightTicketListPageClient.tsx',
  'c:/new-ns-scrap-erp/apps/next/src/components/purchase-flow/AdvancePaymentsPageClient.tsx',
  'c:/new-ns-scrap-erp/apps/next/src/components/purchase-flow/StockLedgerPageClient.tsx'
];

files.forEach(filePath => {
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return;
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const baseName = path.basename(filePath);
  
  console.log(`=== ${baseName} ===`);
  lines.forEach((lineText, index) => {
    if (lineText.includes('<colgroup>') || lineText.includes('</colgroup>') || (index > 0 && lines[index-1].includes('<colgroup>')) || (index > 1 && lines[index-2].includes('<colgroup>'))) {
      console.log(`${index + 1}: ${lineText.trim()}`);
    }
  });
});
