const http = require('http');
const WebSocket = require('ws');

// Start a WebSocket connection to create a session
const ws = new WebSocket('ws://localhost:3000/ws');

ws.on('open', () => {
  console.log('[test] WebSocket connected');
  ws.send(JSON.stringify({ type: 'tv_hello' }));
});

ws.on('message', (msg) => {
  const data = JSON.parse(msg);
  console.log('[test] Received:', data.type);

  if (data.type === 'tv_paired') {
    const sessionId = data.sessionId;
    console.log('[test] Got sessionId:', sessionId);

    // Now test the QR endpoint
    const req = http.get('http://localhost:3000/qr/' + sessionId, (res) => {
      console.log('[test] QR endpoint status:', res.statusCode);
      console.log('[test] Content-Type:', res.headers['content-type']);
      console.log('[test] Content-Length:', res.headers['content-length']);

      let size = 0;
      res.on('data', chunk => {
        size += chunk.length;
      });

      res.on('end', () => {
        console.log('[test] QR image size:', size, 'bytes');
        console.log('[test] Test completed successfully!');
        ws.close();
        process.exit(0);
      });
    });

    req.on('error', (e) => {
      console.error('[test] QR request failed:', e.message);
      process.exit(1);
    });
  }
});

ws.on('error', (e) => {
  console.error('[test] WebSocket error:', e.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('[test] Timeout waiting for response');
  process.exit(1);
}, 5000);
