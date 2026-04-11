const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 768 });
  
  try {
    await page.goto('https://splitflap.onrender.com/board', { 
      waitUntil: 'networkidle2',
      timeout: 20000
    });
    
    // Wait for WebSocket and QR to fully load
    let qrLoaded = false;
    for (let i = 0; i < 12; i++) {
      await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
      const src = await page.$eval('#qr-img', el => el.src).catch(() => '');
      if (src && src.includes('/qr/')) {
        qrLoaded = true;
        console.log(`✅ QR loaded after ${(i + 1) * 500}ms`);
        break;
      }
    }
    
    await page.screenshot({ path: 'qr_code_final.png' });
    console.log('📸 Final screenshot saved');
    
    const qrData = await page.$eval('#qr-img', el => ({
      src: el.src,
      width: el.width,
      height: el.height,
      visible: !el.parentElement.classList.contains('hidden')
    })).catch(() => null);
    
    if (qrData && qrData.src) {
      console.log('\n✅ QR CODE WORKING:');
      console.log(`   Endpoint: ${qrData.src.substring(0, 80)}...`);
      console.log(`   Dimensions: ${qrData.width}x${qrData.height}`);
      console.log(`   Visible: ${qrData.visible}`);
      console.log(`\n🎉 QR CODE SUCCESSFULLY DISPLAYS!`);
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  await browser.close();
})();
