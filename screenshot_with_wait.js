const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 768 });
  
  // Capture console logs
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });
  
  console.log('🌐 Loading board page...');
  
  try {
    await page.goto('https://splitflap.onrender.com/board', { 
      waitUntil: 'networkidle2',
      timeout: 20000
    });
    
    console.log('⏳ Waiting 5 seconds for WebSocket connection and QR load...');
    // Wait for QR image to have a src attribute
    let qrSrc = '';
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
      qrSrc = await page.$eval('#qr-img', el => el.src).catch(() => '');
      if (qrSrc) {
        console.log(`✅ QR image src detected after ${(i + 1) * 500}ms`);
        break;
      }
    }
    
    // Take screenshot
    await page.screenshot({ path: 'board_with_qr.png' });
    console.log('📸 Screenshot saved: board_with_qr.png');
    
    // Check QR image
    const qrData = await page.$eval('#qr-img', el => ({
      src: el.src,
      visible: !el.parentElement.classList.contains('hidden')
    })).catch(() => null);
    
    console.log('\n✅ Results:');
    if (qrData) {
      console.log(`   QR visible: ${qrData.visible}`);
      console.log(`   QR src: ${qrData.src ? qrData.src.substring(0, 60) + '...' : '(empty)'}`);
      if (qrData.src && qrData.src.includes('/qr/')) {
        console.log(`\n🎉 SUCCESS: QR CODE IS LOADING!`);
      } else if (!qrData.src) {
        console.log(`\n⚠️  QR image src not set yet`);
      }
    }
    
    if (consoleLogs.length > 0) {
      console.log('\n📋 Browser console:');
      consoleLogs.slice(-10).forEach(log => console.log(`   ${log}`));
    }
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
  
  await browser.close();
})();
