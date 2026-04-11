const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
let sessionId = null;

const ws = new WebSocket(`ws://localhost:${PORT}/ws`);

ws.on('open', () => {
  console.log('✓ WebSocket connected');
  ws.send(JSON.stringify({ type: 'tv_hello' }));
});

ws.on('message', (msg) => {
  const data = JSON.parse(msg);
  
  if (data.type === 'tv_paired') {
    sessionId = data.sessionId;
    console.log(`✓ Received tv_paired with sessionId: ${sessionId}`);
    testQrEndpoint();
  }
});

ws.on('error', (err) => {
  console.error('✗ WebSocket error:', err.message);
  process.exit(1);
});

function testQrEndpoint() {
  const qrUrl = `http://localhost:${PORT}/qr/${sessionId}`;
  console.log(`\nTesting QR endpoint: ${qrUrl}`);
  
  const req = http.get(qrUrl, (res) => {
    console.log(`✓ Status: ${res.statusCode}`);
    console.log(`✓ Content-Type: ${res.headers['content-type']}`);
    console.log(`✓ Content-Length: ${res.headers['content-length']}`);
    
    let size = 0;
    res.on('data', chunk => {
      size += chunk.length;
    });
    
    res.on('end', () => {
      if (size > 1000) {
        console.log(`✓ QR image data received: ${size} bytes`);
        console.log('\n✅ QR endpoint test PASSED - Image generated successfully!');
      } else {
        console.log(`✗ QR image too small: ${size} bytes`);
      }
      ws.close();
      process.exit(size > 1000 ? 0 : 1);
    });
  });
  
  req.on('error', (err) => {
    console.error(`✗ Request failed: ${err.message}`);
    ws.close();
    process.exit(1);
  });
}

setTimeout(() => {
  console.error('✗ Test timeout');
  process.exit(1);
}, 5000);
