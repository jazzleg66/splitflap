const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1024, height: 768 });
  
  const consoleLogs = [];
  const errors = [];
  
  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });
  
  page.on('error', err => {
    errors.push(err.message);
  });
  
  page.on('pageerror', err => {
    errors.push(`Page error: ${err.message}`);
  });
  
  console.log('📱 Loading page and waiting for execution...');
  
  try {
    await page.goto('https://splitflap.onrender.com/board', { 
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    // Wait and collect logs
    await page.evaluate(() => new Promise(r => setTimeout(r, 5000)));
    
    console.log('\n📋 Browser Console Output:');
    if (consoleLogs.length > 0) {
      consoleLogs.forEach(log => console.log(`  ${log}`));
    } else {
      console.log('  (no console messages)');
    }
    
    if (errors.length > 0) {
      console.log('\n❌ Errors:');
      errors.forEach(err => console.log(`  ${err}`));
    }
    
    const wsStatus = await page.evaluate(() => {
      return {
        scripts: Array.from(document.querySelectorAll('script')).map(s => s.src || '(inline)'),
        wsSupported: typeof WebSocket !== 'undefined',
        qrImg: {
          src: document.getElementById('qr-img')?.src,
          alt: document.getElementById('qr-img')?.alt,
          visible: !document.getElementById('qr-screen')?.classList.contains('hidden')
        }
      };
    });
    
    console.log('\n🔍 Page Status:');
    console.log(JSON.stringify(wsStatus, null, 2));
    
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  await browser.close();
})();
