const puppeteer = require('puppeteer');

(async () => {
  // Launch with real browser (not headless)
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 768 });
  
  console.log('🌐 Opening https://splitflap.onrender.com/board in real browser...');
  
  try {
    await page.goto('https://splitflap.onrender.com/board', { 
      waitUntil: 'networkidle2',
      timeout: 25000
    });
    
    console.log('⏳ Waiting 8 seconds for full load and WebSocket...');
    await page.evaluate(() => new Promise(r => setTimeout(r, 8000)));
    
    // Take screenshot
    await page.screenshot({ path: 'real_browser_screenshot.png', fullPage: true });
    console.log('✅ Screenshot saved: real_browser_screenshot.png');
    
    // Check QR details
    const qrInfo = await page.evaluate(() => {
      const img = document.getElementById('qr-img');
      const screen = document.getElementById('qr-screen');
      return {
        src: img.src,
        visible: !screen.classList.contains('hidden'),
        width: img.width,
        height: img.height,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight
      };
    }).catch(e => ({error: e.message}));
    
    console.log('\n📊 QR Image Status:');
    if (qrInfo.error) {
      console.log(`   Error: ${qrInfo.error}`);
    } else {
      console.log(`   Src: ${qrInfo.src ? qrInfo.src.substring(0, 60) + '...' : '(empty)'}`);
      console.log(`   Visible: ${qrInfo.visible}`);
      console.log(`   Display Size: ${qrInfo.width}x${qrInfo.height}`);
      console.log(`   Actual Size: ${qrInfo.naturalWidth}x${qrInfo.naturalHeight}`);
      
      if (qrInfo.src && qrInfo.src.includes('/qr/') && qrInfo.naturalWidth > 200) {
        console.log('\n✅ QR CODE IS DISPLAYING!');
      } else if (!qrInfo.src) {
        console.log('\n⚠️  QR image src not set');
      }
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
  
  // Keep browser open for 3 seconds to see the page
  await page.evaluate(() => new Promise(r => setTimeout(r, 3000)));
  await browser.close();
})();
