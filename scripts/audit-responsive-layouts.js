import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve('.');
const directories = [
  'apps/next/src/components/daily',
  'apps/next/src/components/purchase-flow',
  'apps/next/src/components/sales',
  'apps/next/src/components/master-data',
];

const report = [];

function auditFile(filePath, relativePath) {
  const content = readFileSync(filePath, 'utf-8');
  
  if (!relativePath.endsWith('PageClient.tsx')) {
    return;
  }

  const hasTable = content.includes('<Table') || content.includes('<table');
  const hasDesktopTableWrap = content.includes('hidden md:block') || content.includes('hidden lg:block') || content.includes('hidden md:inline-flex') || content.includes('hidden lg:inline-flex');
  const hasMobileCardWrap = content.includes('block md:hidden') || content.includes('block lg:hidden') || content.includes('md:hidden block') || content.includes('lg:hidden block');
  
  const hasFAB = content.includes('fixed bottom-') || content.includes('fixed bottom-6') || content.includes('fixed bottom-16');
  const hasFABHide = content.includes('md:hidden') || content.includes('lg:hidden');

  const hasColDefault = content.includes('Set col to default');
  const hasColDefaultHide = content.includes('hidden md:inline-flex') || content.includes('hidden lg:inline-flex') || content.includes('hidden md:block') || content.includes('hidden lg:block');

  const createButtons = [];
  const createBtnRegex = /<button[^>]*>[\s\S]*?(?:สร้าง|เพิ่ม|นำเข้า|ส่งออก)[\s\S]*?<\/button>|<UiButton[^>]*>[\s\S]*?(?:สร้าง|เพิ่ม|นำเข้า|ส่งออก)[\s\S]*?<\/UiButton>/g;
  let match;
  while ((match = createBtnRegex.exec(content)) !== null) {
    createButtons.push(match[0]);
  }

  const potentialDuplicateButtons = createButtons.filter(btn => {
    const isFAB = btn.includes('fixed') || btn.includes('bottom-');
    const isHiddenOnMobile = btn.includes('hidden md:') || btn.includes('hidden lg:') || btn.includes('hidden xl:');
    const isMobileOnly = btn.includes('md:hidden') || btn.includes('lg:hidden') || btn.includes('xl:hidden');
    return !isFAB && !isHiddenOnMobile && !isMobileOnly;
  });

  report.push({
    file: relativePath,
    hasTable,
    hasDesktopTableWrap,
    hasMobileCardWrap,
    hasFAB,
    hasFABHide,
    hasColDefault,
    hasColDefaultHide,
    potentialDuplicateButtonsCount: potentialDuplicateButtons.length,
    potentialDuplicateButtons,
  });
}

function walk(dir) {
  const absoluteDir = join(root, dir);
  if (!statSync(absoluteDir).isDirectory()) return;

  const files = readdirSync(absoluteDir);
  for (const file of files) {
    const fullPath = join(absoluteDir, file);
    const relPath = join(dir, file);
    if (statSync(fullPath).isDirectory()) {
      walk(relPath);
    } else {
      auditFile(fullPath, relPath.replace(/\\/g, '/'));
    }
  }
}

directories.forEach(walk);

writeFileSync('scripts/audit-report.json', JSON.stringify(report, null, 2), 'utf-8');
console.log('Saved report to scripts/audit-report.json');
