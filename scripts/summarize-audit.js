import { readFileSync } from 'node:fs';

const report = JSON.parse(readFileSync('scripts/audit-report.json', 'utf-8'));

let summary = '# Layout Responsive Audit Summary\n\n';

report.forEach((item) => {
  const issues = [];
  
  if (item.file.includes('DesignMockupPageClient.tsx')) {
    return; // Skip mockup/documentation files
  }

  // 1. Table responsiveness check
  if (item.hasTable) {
    if (!item.hasDesktopTableWrap) {
      issues.push('❌ ตารางหลักของ Desktop ไม่ได้ถูกซ่อนบนมือถือ (ขาด `hidden md:block` / `hidden lg:block` หรือ wrap container)');
    }
    if (!item.hasMobileCardWrap) {
      issues.push('❌ ไม่มีโครงสร้างรายการการ์ดบนมือถือ (`block md:hidden` / `block lg:hidden`)');
    }
  }

  // 2. FAB responsiveness check
  if (item.hasFAB && !item.hasFABHide) {
    issues.push('❌ ปุ่ม FAB ไม่ได้ถูกซ่อนบน Desktop (ขาด `md:hidden` / `lg:hidden`)');
  }

  // 3. Set col default responsiveness check
  if (item.hasColDefault && !item.hasColDefaultHide) {
    issues.push('❌ ปุ่ม "Set col to default" ไม่ได้ถูกซ่อนบนมือถือ (ขาด `hidden md:` / `hidden lg:`)');
  }

  // 4. Potential duplicate buttons in toolbar
  if (item.potentialDuplicateButtonsCount > 0) {
    issues.push(`⚠️ พบปุ่มสร้าง/เพิ่ม/ส่งออกใน Toolbar ที่ไม่ได้ซ่อนบนมือถือ (${item.potentialDuplicateButtonsCount} ปุ่ม)`);
  }

  if (issues.length > 0) {
    summary += `### 📂 [${item.file.split('/').pop()}](file:///${process.cwd().replace(/\\/g, '/')}/${item.file})\n`;
    issues.forEach(issue => {
      summary += `- ${issue}\n`;
    });
    summary += '\n';
  }
});

console.log(summary);
