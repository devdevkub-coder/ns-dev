const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'src');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(filePath));
    } else if (filePath.endsWith('.tsx') || filePath.endsWith('.ts')) {
      results.push(filePath);
    }
  });
  return results;
}

const files = walk(srcDir);
const report = [];

files.forEach((file) => {
  const content = fs.readFileSync(file, 'utf-8');
  const relPath = path.relative(path.join(__dirname, '..', '..'), file).replace(/\\/g, '/');
  
  // 1. Check for Table tag without responsive wrapper (hidden lg: or hidden md: or similar)
  if (content.includes('<table') || content.includes('<Table')) {
    const tableIndex = content.indexOf('<table') !== -1 ? content.indexOf('<table') : content.indexOf('<Table');
    
    // Check if file contains mobile hidden wrapper classes
    const hasResponsiveWrapper = content.includes('lg:hidden') || 
                                 content.includes('md:hidden') || 
                                 content.includes('sm:hidden') ||
                                 content.includes('lg:table') || 
                                 content.includes('md:table');
                                 
    if (!hasResponsiveWrapper) {
      report.push({
        file: relPath,
        issue: 'Table lacks responsive hidden classes (e.g. hidden lg:block or lg:hidden cards)',
        type: 'responsive'
      });
    }
  }

  // 2. Check for potential dark borders/outlines or legacy shadows
  if (content.includes('border-black') || content.includes('border-gray-900') || content.includes('border-slate-900') || content.includes('shadow-lg')) {
    const match = content.match(/(border-black|border-gray-900|border-slate-900|shadow-lg)/g);
    report.push({
      file: relPath,
      issue: `Legacy border/shadow class found: ${Array.from(new Set(match)).join(', ')}`,
      type: 'border'
    });
  }

  // 3. Check for DialogContent pattern
  if (content.includes('DialogContent') && content.includes('<DialogContent')) {
    const hasCorrectDialogClasses = content.includes('!p-0') && content.includes('border-0');
    const hasHideClose = content.includes('hideClose');
    
    if (!hasCorrectDialogClasses || !hasHideClose) {
      report.push({
        file: relPath,
        issue: `DialogContent missing user-favored classes (${!hasCorrectDialogClasses ? 'missing !p-0 / border-0' : ''} ${!hasHideClose ? 'missing hideClose' : ''})`,
        type: 'dialog'
      });
    }
  }
});

console.log(JSON.stringify(report, null, 2));
