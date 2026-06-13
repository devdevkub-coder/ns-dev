import fs from 'fs';
import path from 'path';

const files = [
  {
    path: 'c:/new-ns-scrap-erp/apps/next/src/components/daily/BillSwapHistoryPageClient.tsx',
    targets: [
      {
        find: '{billSwapColumns.map((column) => <col key={column.key} style={getColumnStyle(column.key)} />)}',
        replace: `{billSwapColumns.map((column, index) => {\n              const style = getColumnStyle(column.key);\n              if (index === billSwapColumns.length - 1) {\n                return <col key={column.key} style={{ minWidth: column.minWidth }} />;\n              }\n              return <col key={column.key} style={style} />;\n            })}`
      }
    ]
  },
  {
    path: 'c:/new-ns-scrap-erp/apps/next/src/components/daily/DailyExpensePageClient.tsx',
    targets: [
      {
        find: '{dashboardColumns.map((column) => <col key={column.key} style={dashboardColumnResize.getColumnStyle(column.key)} />)}',
        replace: `{dashboardColumns.map((column, index) => {\n              const style = dashboardColumnResize.getColumnStyle(column.key);\n              if (index === dashboardColumns.length - 1) {\n                return <col key={column.key} style={{ minWidth: column.minWidth }} />;\n              }\n              return <col key={column.key} style={style} />;\n            })}`
      },
      {
        find: '{expenseColumns.map((column) => <col key={column.key} style={columnResize.getColumnStyle(column.key)} />)}',
        replace: `{expenseColumns.map((column, index) => {\n              const style = columnResize.getColumnStyle(column.key);\n              if (index === expenseColumns.length - 1) {\n                return <col key={column.key} style={{ minWidth: column.minWidth }} />;\n              }\n              return <col key={column.key} style={style} />;\n            })}`
      }
    ]
  },
  {
    path: 'c:/new-ns-scrap-erp/apps/next/src/components/daily/DailyPettyAdvancePageClient.tsx',
    targets: [
      {
        find: '{pettyAdvanceColumns.map((column) => <col key={column.key} style={columnResize.getColumnStyle(column.key)} />)}',
        replace: `{pettyAdvanceColumns.map((column, index) => {\n              const style = columnResize.getColumnStyle(column.key);\n              if (index === pettyAdvanceColumns.length - 1) {\n                return <col key={column.key} style={{ minWidth: column.minWidth }} />;\n              }\n              return <col key={column.key} style={style} />;\n            })}`
      }
    ]
  },
  {
    path: 'c:/new-ns-scrap-erp/apps/next/src/components/daily/DailyTransferPageClient.tsx',
    targets: [
      {
        find: '{transferColumns.map((column) => <col key={column.key} style={columnResize.getColumnStyle(column.key)} />)}',
        replace: `{transferColumns.map((column, index) => {\n              const style = columnResize.getColumnStyle(column.key);\n              if (index === transferColumns.length - 1) {\n                return <col key={column.key} style={{ minWidth: column.minWidth }} />;\n              }\n              return <col key={column.key} style={style} />;\n            })}`
      }
    ]
  },
  {
    path: 'c:/new-ns-scrap-erp/apps/next/src/components/daily/MoneyMovementPageClient.tsx',
    targets: [
      {
        find: '{paymentQueueColumns.map((column) => <col key={column.key} style={paymentQueueColumnResize.getColumnStyle(column.key)} />)}',
        replace: `{paymentQueueColumns.map((column, index) => {\n              const style = paymentQueueColumnResize.getColumnStyle(column.key);\n              if (index === paymentQueueColumns.length - 1) {\n                return <col key={column.key} style={{ minWidth: column.minWidth }} />;\n              }\n              return <col key={column.key} style={style} />;\n            })}`
      },
      {
        find: '{historyColumns.map((column) => <col key={column.key} style={historyColumnResize.getColumnStyle(column.key)} />)}',
        replace: `{historyColumns.map((column, index) => {\n              const style = historyColumnResize.getColumnStyle(column.key);\n              if (index === historyColumns.length - 1) {\n                return <col key={column.key} style={{ minWidth: column.minWidth }} />;\n              }\n              return <col key={column.key} style={style} />;\n            })}`
      }
    ]
  },
  {
    path: 'c:/new-ns-scrap-erp/apps/next/src/components/daily/PaymentApprovalPageClient.tsx',
    targets: [
      {
        find: '{paymentApprovalApColumns.map((column) => <col key={column.key} style={apColumnResize.getColumnStyle(column.key)} />)}',
        replace: `{paymentApprovalApColumns.map((column, index) => {\n              const style = apColumnResize.getColumnStyle(column.key);\n              if (index === paymentApprovalApColumns.length - 1) {\n                return <col key={column.key} style={{ minWidth: column.minWidth }} />;\n              }\n              return <col key={column.key} style={style} />;\n            })}`
      },
      {
        find: '{paymentApprovalExpenseColumns.map((column) => <col key={column.key} style={expenseColumnResize.getColumnStyle(column.key)} />)}',
        replace: `{paymentApprovalExpenseColumns.map((column, index) => {\n              const style = expenseColumnResize.getColumnStyle(column.key);\n              if (index === paymentApprovalExpenseColumns.length - 1) {\n                return <col key={column.key} style={{ minWidth: column.minWidth }} />;\n              }\n              return <col key={column.key} style={style} />;\n            })}`
      }
    ]
  },
  {
    path: 'c:/new-ns-scrap-erp/apps/next/src/components/daily/ReceiptVouchersPageClient.tsx',
    targets: [
      {
        find: '{receiptVoucherColumns.map((column) => <col key={column.key} style={columnResize.getColumnStyle(column.key)} />)}',
        replace: `{receiptVoucherColumns.map((column, index) => {\n              const style = columnResize.getColumnStyle(column.key);\n              if (index === receiptVoucherColumns.length - 1) {\n                return <col key={column.key} style={{ minWidth: column.minWidth }} />;\n              }\n              return <col key={column.key} style={style} />;\n            })}`
      }
    ]
  },
  {
    path: 'c:/new-ns-scrap-erp/apps/next/src/components/daily/StockTransferPageClient.tsx',
    targets: [
      {
        find: '{stockTransferColumns.map((column) => <col key={column.key} style={columnResize.getColumnStyle(column.key)} />)}',
        replace: `{stockTransferColumns.map((column, index) => {\n              const style = columnResize.getColumnStyle(column.key);\n              if (index === stockTransferColumns.length - 1) {\n                return <col key={column.key} style={{ minWidth: column.minWidth }} />;\n              }\n              return <col key={column.key} style={style} />;\n            })}`
      }
    ]
  },
  {
    path: 'c:/new-ns-scrap-erp/apps/next/src/components/daily/TransactionBillsPageClient.tsx',
    targets: [
      {
        find: '{tableColumns.map((column) => <col key={column.key} style={columnResize.getColumnStyle(column.key)} />)}',
        replace: `{tableColumns.map((column, index) => {\n              const style = columnResize.getColumnStyle(column.key);\n              if (index === tableColumns.length - 1) {\n                return <col key={column.key} style={{ minWidth: column.minWidth }} />;\n              }\n              return <col key={column.key} style={style} />;\n            })}`
      }
    ]
  },
  {
    path: 'c:/new-ns-scrap-erp/apps/next/src/components/daily/WeightTicketListPageClient.tsx',
    targets: [
      {
        find: '{weightTicketColumns.map((column) => <col key={column.key} style={columnResize.getColumnStyle(column.key)} />)}',
        replace: `{weightTicketColumns.map((column, index) => {\n              const style = columnResize.getColumnStyle(column.key);\n              if (index === weightTicketColumns.length - 1) {\n                return <col key={column.key} style={{ minWidth: column.minWidth }} />;\n              }\n              return <col key={column.key} style={style} />;\n            })}`
      }
    ]
  },
  {
    path: 'c:/new-ns-scrap-erp/apps/next/src/components/purchase-flow/AdvancePaymentsPageClient.tsx',
    targets: [
      {
        find: '{advancePaymentColumns.map((column) => <col key={column.key} style={columnResize.getColumnStyle(column.key)} />)}',
        replace: `{advancePaymentColumns.map((column, index) => {\n              const style = columnResize.getColumnStyle(column.key);\n              if (index === advancePaymentColumns.length - 1) {\n                return <col key={column.key} style={{ minWidth: column.minWidth }} />;\n              }\n              return <col key={column.key} style={style} />;\n            })}`
      }
    ]
  },
  {
    path: 'c:/new-ns-scrap-erp/apps/next/src/components/purchase-flow/StockLedgerPageClient.tsx',
    targets: [
      {
        find: '{stockLedgerColumns.map((column) => <col key={column.key} style={columnResize.getColumnStyle(column.key)} />)}',
        replace: `{stockLedgerColumns.map((column, index) => {\n              const style = columnResize.getColumnStyle(column.key);\n              if (index === stockLedgerColumns.length - 1) {\n                return <col key={column.key} style={{ minWidth: column.minWidth }} />;\n              }\n              return <col key={column.key} style={style} />;\n            })}`
      }
    ]
  }
];

files.forEach(file => {
  if (!fs.existsSync(file.path)) {
    console.log(`File not found: ${file.path}`);
    return;
  }
  let content = fs.readFileSync(file.path, 'utf-8');
  let changed = false;
  
  file.targets.forEach(target => {
    if (content.includes(target.find)) {
      content = content.replace(target.find, target.replace);
      changed = true;
    } else {
      console.log(`Warning: Target string not found in ${path.basename(file.path)}`);
    }
  });

  if (changed) {
    fs.writeFileSync(file.path, content, 'utf-8');
    console.log(`Successfully modified ${path.basename(file.path)}`);
  }
});
