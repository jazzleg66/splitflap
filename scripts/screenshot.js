// Screenshot utility — captures board and controller pages for visual QA.
// Usage: node scripts/screenshot.js [board|controller|all]
// Saves PNGs to .screenshots/ and prints the paths so Claude can read them.

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const OUT_DIR = path.join(__dirname, '../.screenshots');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const TARGET = process.argv[2] || 'all';

const targets = {
  board: `${BASE}/board`,
  controller: `${BASE}/controller?code=TEST00`,
};

async function shoot(name, url) {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 10000 });
    // Wait a moment for fonts and initial render
    await new Promise(r => setTimeout(r, 1500));
    const file = path.join(OUT_DIR, `${name}-${Date.now()}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log(`SCREENSHOT: ${file}`);
  } catch (e) {
    console.error(`Error screenshotting ${name}: ${e.message}`);
  } finally {
    await browser.close();
  }
}

(async () => {
  const toShoot = TARGET === 'all'
    ? Object.entries(targets)
    : [[TARGET, targets[TARGET]]];

  for (const [name, url] of toShoot) {
    if (!url) { console.error(`Unknown target: ${name}`); continue; }
    await shoot(name, url);
  }
})();
