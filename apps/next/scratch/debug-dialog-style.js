import { chromium } from '@playwright/test';

(async () => {
  console.log('Launching browser...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  try {
    const page = await browser.newPage();
    console.log('Logging in...');
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'watcharathat@gmail.com');
    await page.fill('input[type="password"]', 'p@ssw0rd');
    await page.click('button[type="submit"]');
    
    console.log('Waiting for navigation...');
    await page.waitForURL('**/dashboard');
    
    console.log('Navigating to PO Buy...');
    await page.goto('http://localhost:3000/purchase/po-buy');
    
    console.log('Clicking the first row...');
    // Wait for the table rows to render and click the first row
    await page.waitForSelector('table tbody tr');
    await page.click('table tbody tr:first-child');
    
    console.log('Waiting for modal to open...');
    await page.waitForSelector('[role="dialog"]');
    
    console.log('Inspecting styles...');
    const result = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return { error: 'Dialog not found' };
      
      const computedStyle = window.getComputedStyle(dialog);
      const header = dialog.querySelector('h2')?.closest('div'); // DialogHeader container
      const headerStyle = header ? window.getComputedStyle(header) : null;
      
      return {
        dialogTag: dialog.tagName,
        dialogClasses: dialog.className,
        dialogPadding: computedStyle.padding,
        dialogMargin: computedStyle.margin,
        dialogWidth: computedStyle.width,
        dialogMaxWidth: computedStyle.maxWidth,
        dialogBackground: computedStyle.backgroundColor,
        
        headerClasses: header ? header.className : null,
        headerPadding: headerStyle ? headerStyle.padding : null,
        headerMargin: headerStyle ? headerStyle.margin : null,
        headerBackground: headerStyle ? headerStyle.backgroundColor : null,
        
        // Also check if there's any other element wrapping the header
        headerParentClasses: header && header.parentElement ? header.parentElement.className : null,
        headerParentPadding: header && header.parentElement ? window.getComputedStyle(header.parentElement).padding : null,
      };
    });
    
    console.log('STYLE RESULTS:', JSON.stringify(result, null, 2));
    
  } catch (err) {
    console.error('Error during execution:', err);
  } finally {
    await browser.close();
  }
})();
