const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 768 });
  
  console.log('🌐 Loading https://splitflap.onrender.com/board...');
  try {
    await page.goto('https://splitflap.onrender.com/board', { 
      waitUntil: 'networkidle2',
      timeout: 15000
    });
    
    // Wait for scripts to execute
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 2000)));
    
    // Take screenshot
    await page.screenshot({ path: 'board_screenshot.png', fullPage: true });
    console.log('✅ Screenshot saved: board_screenshot.png');
    
    // Check if QR image is visible
    const qrVisible = await page.$('#qr-img');
    if (qrVisible) {
      const src = await page.$eval('#qr-img', el => el.src);
      const visible = await page.$eval('#qr-screen', el => !el.classList.contains('hidden'));
      console.log(`✅ QR image element found`);
      console.log(`   src: ${src}`);
      console.log(`   visible: ${visible}`);
    } else {
      console.log('❌ QR image element not found');
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
  
  await browser.close();
})();
