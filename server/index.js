// placeholder — full implementation in Phase 2
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

app.use(express.static(path.join(__dirname, '../public')));

app.get('/board', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/board/index.html'));
});

app.get('/controller', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/controller/index.html'));
});

wss.on('connection', socket => {
  console.log('WS client connected');
  socket.on('message', data => console.log('msg:', data.toString()));
  socket.on('close', () => console.log('WS client disconnected'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Digital Solari running on http://localhost:${PORT}`));
