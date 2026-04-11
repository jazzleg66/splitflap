const WebSocket = require('ws');

const ws = new WebSocket('wss://splitflap.onrender.com/ws');

ws.on('open', () => {
  console.log('✅ WebSocket connected');
  console.log('📤 Sending tv_hello...');
  ws.send(JSON.stringify({ type: 'tv_hello' }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  console.log('📥 Received:', JSON.stringify(msg, null, 2));
  
  if (msg.type === 'tv_paired') {
    console.log(`✅ Got sessionId: ${msg.sessionId}`);
    console.log(`✅ Got pairCode: ${msg.pairCode}`);
    console.log(`✅ QR endpoint should be: /qr/${msg.sessionId}`);
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => {
  console.error('❌ WebSocket error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('❌ Timeout - no tv_paired response');
  process.exit(1);
}, 5000);
