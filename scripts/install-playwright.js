import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

process.env.PLAYWRIGHT_BROWSERS_PATH = join(rootDir, '.playwright-browsers');

try {
  console.log('Installing Playwright chromium browser to:', process.env.PLAYWRIGHT_BROWSERS_PATH);
  execSync('npx playwright install chromium', { stdio: 'inherit' });
} catch (err) {
  console.error('Failed to install playwright browser:', err);
  process.exit(1);
}
