const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle2' });
  
  await new Promise(r => setTimeout(r, 2000));
  
  // Scroll to the bottom to see demo controls clearly
  await page.evaluate(() => {
    window.scrollBy(0, document.body.scrollHeight);
  });
  
  await new Promise(r => setTimeout(r, 500));
  
  const dir = 'temporary screenshots';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  
  const filepath = path.join(dir, `buttons-detail-${Date.now()}.png`);
  await page.screenshot({ path: filepath, fullPage: false });
  console.log(`SCREENSHOT: ${filepath}`);

  await browser.close();
})();
