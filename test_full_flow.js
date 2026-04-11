const WebSocket = require('ws');
const http = require('http');

console.log('Testing full QR flow...\n');

const ws = new WebSocket('wss://splitflap.onrender.com/ws');

ws.on('open', () => {
  console.log('✅ WebSocket connected');
  ws.send(JSON.stringify({ type: 'tv_hello' }));
});

ws.on('message', async (data) => {
  const msg = JSON.parse(data);
  console.log(`📬 Received: ${msg.type}`);
  
  if (msg.type === 'tv_paired') {
    console.log(`✅ Session created: ${msg.sessionId}`);
    console.log(`✅ Pair code: ${msg.pairCode}`);
    
    // Now test the QR endpoint
    const qrUrl = `https://splitflap.onrender.com/qr/${msg.sessionId}`;
    console.log(`\n📸 Testing QR endpoint: ${qrUrl}`);
    
    http.get(qrUrl.replace('https', 'http'), (res) => {
      console.log(`   Status: ${res.statusCode}`);
      console.log(`   Content-Type: ${res.headers['content-type']}`);
      
      let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
      });
      res.on('end', () => {
        if (res.statusCode === 200 && size > 1000) {
          console.log(`   Image size: ${size} bytes`);
          console.log(`\n🎉 SUCCESS: QR image generated!`);
        } else {
          console.log(`   Error: Status ${res.statusCode}, size ${size}`);
        }
        ws.close();
        process.exit(0);
      });
    }).on('error', err => {
      console.error('Request failed:', err.message);
      ws.close();
      process.exit(1);
    });
  }
});

ws.on('error', err => {
  console.error('❌ WebSocket error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('❌ Timeout');
  process.exit(1);
}, 10000);
