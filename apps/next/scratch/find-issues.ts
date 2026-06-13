import fs from 'fs';
import path from 'path';

const dirs = [
  'c:/new-ns-scrap-erp/apps/next/src/components/daily',
  'c:/new-ns-scrap-erp/apps/next/src/components/purchase-flow'
];

interface Issue {
  file: string;
  type: 'table-number-cell' | 'table-minwidth' | 'dialog-header';
  line: number;
  content: string;
}

const issues: Issue[] = [];

dirs.forEach(dir => {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    if (!file.endsWith('.tsx')) return;
    const filePath = path.join(dir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((lineText, index) => {
      const lineNum = index + 1;
      
      // 1. TableNumberCell with widthClass
      if (lineText.includes('TableNumberCell') && lineText.includes('widthClass=')) {
        issues.push({
          file: filePath,
          type: 'table-number-cell',
          line: lineNum,
          content: lineText.trim()
        });
      }

      // 2. Table styling with minWidth
      if ((lineText.includes('<Table ') || lineText.includes('<table ')) && lineText.includes('minWidth:')) {
        issues.push({
          file: filePath,
          type: 'table-minwidth',
          line: lineNum,
          content: lineText.trim()
        });
      }

      // 3. DialogHeader or custom backgrounds on dialogs
      if (lineText.includes('DialogHeader') && (lineText.includes('bg-') || lineText.includes('className='))) {
        issues.push({
          file: filePath,
          type: 'dialog-header',
          line: lineNum,
          content: lineText.trim()
        });
      }
    });
  });
});

console.log(JSON.stringify(issues, null, 2));
