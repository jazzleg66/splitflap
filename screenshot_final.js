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
    
    // Wait for WebSocket and QR to load
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 3000)));
    
    // Take screenshot
    await page.screenshot({ path: 'board_final_screenshot.png', fullPage: true });
    console.log('✅ Screenshot saved');
    
    // Check QR image
    const qrData = await page.$eval('#qr-img', el => ({
      src: el.src,
      visible: !el.parentElement.classList.contains('hidden')
    })).catch(() => null);
    
    if (qrData) {
      console.log(`✅ QR Image Found:`);
      console.log(`   src: ${qrData.src}`);
      console.log(`   visible: ${qrData.visible}`);
      
      if (qrData.src && qrData.src.includes('/qr/')) {
        console.log(`\n✅ QR CODE ENDPOINT SET CORRECTLY!`);
      }
    } else {
      console.log('❌ QR image not found');
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
  
  await browser.close();
})();
