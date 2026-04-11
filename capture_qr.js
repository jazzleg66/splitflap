const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 768 });
  
  console.log('📱 Loading board page...');
  
  try {
    await page.goto('https://splitflap.onrender.com/board', { 
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    console.log('⏳ Waiting 10 seconds for WebSocket and QR to load...');
    let qrLoaded = false;
    
    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
      
      const qrSrc = await page.$eval('#qr-img', el => el.src).catch(() => '');
      if (qrSrc && qrSrc.includes('/qr/')) {
        qrLoaded = true;
        console.log(`✅ QR src set: ${qrSrc.substring(0, 50)}...`);
        break;
      }
    }
    
    if (!qrLoaded) {
      console.log('⚠️  QR src not set, but taking screenshot anyway...');
    }
    
    // Take screenshot
    await page.screenshot({ path: 'qr_screenshot.png', fullPage: true });
    console.log('📸 Screenshot saved: qr_screenshot.png');
    
    // Get image details
    const imgDetails = await page.evaluate(() => {
      const img = document.getElementById('qr-img');
      const screen = document.getElementById('qr-screen');
      return {
        src: img.src,
        visible: !screen.classList.contains('hidden'),
        width: img.width,
        height: img.height,
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight
      };
    }).catch(e => ({ error: e.message }));
    
    console.log('\n📊 QR Image Details:');
    console.log(JSON.stringify(imgDetails, null, 2));
    
    if (imgDetails.src && imgDetails.src.includes('/qr/') && imgDetails.complete && imgDetails.naturalWidth > 100) {
      console.log('\n✅ QR CODE IS DISPLAYING CORRECTLY!');
    } else if (!imgDetails.src) {
      console.log('\n⚠️  QR image src not set');
    } else if (!imgDetails.complete) {
      console.log('\n⚠️  QR image not fully loaded');
    }
    
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  await browser.close();
  console.log('\n✅ Screenshot captured - check qr_screenshot.png');
})();
