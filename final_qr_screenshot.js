const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 768 });
  
  console.log('📱 Capturing final screenshot of QR code...\n');
  
  try {
    await page.goto('https://splitflap.onrender.com/board', { 
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    console.log('Waiting for QR to load...');
    
    // Wait for QR image to load
    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
      
      const qrData = await page.$eval('#qr-img', el => ({
        src: el.src,
        complete: el.complete,
        naturalWidth: el.naturalWidth
      })).catch(() => ({}));
      
      if (qrData.src && qrData.src.includes('/qr/') && qrData.complete && qrData.naturalWidth > 200) {
        console.log(`✅ QR image loaded: ${qrData.src.substring(0, 50)}...\n`);
        break;
      }
    }
    
    // Take final screenshot
    await page.screenshot({ path: 'FINAL_QR_CODE.png', fullPage: true });
    console.log('✅ Screenshot saved: FINAL_QR_CODE.png\n');
    
    const details = await page.$eval('#qr-img', el => ({
      src: el.src ? '✅ SET' : '❌ EMPTY',
      complete: el.complete,
      naturalWidth: el.naturalWidth,
      naturalHeight: el.naturalHeight,
      visible: !el.parentElement.classList.contains('hidden')
    })).catch(() => ({}));
    
    console.log('QR Image Details:');
    console.log(`  src: ${details.src}`);
    console.log(`  complete: ${details.complete}`);
    console.log(`  dimensions: ${details.naturalWidth}x${details.naturalHeight}`);
    console.log(`  visible: ${details.visible}`);
    
    if (details.src === '✅ SET' && details.naturalWidth > 200) {
      console.log('\n🎉 QR CODE IS DISPLAYING!\n');
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  await browser.close();
})();
