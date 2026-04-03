const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');
const { createSession, getByCode, getById, touch, sessions } = require('./sessionManager');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));
app.use('/assets', express.static(path.join(__dirname, '../assets')));

app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, '../public/index.html')));

app.get('/board', (req, res) =>
  res.sendFile(path.join(__dirname, '../public/board/index.html')));

app.get('/controller', (req, res) =>
  res.sendFile(path.join(__dirname, '../public/controller/index.html')));

// ── QR code endpoint ──────────────────────────────────────────────────────────
app.get('/qr/:sessionId', async (req, res) => {
  const session = getById(req.params.sessionId);
  if (!session) return res.status(404).end();

  // In dev, use LAN IP so phones on the same network can scan
  const host = getLanHost(req);
  const url = `${req.protocol}://${host}/controller?code=${session.pairCode}`;

  try {
    const buf = await QRCode.toBuffer(url, { errorCorrectionLevel: 'M', width: 300 });
    res.type('png').send(buf);
  } catch (e) {
    res.status(500).end();
  }
});

function getLanHost(req) {
  if (process.env.NODE_ENV === 'production') return req.get('host');
  const nets = os.networkInterfaces();
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return `${iface.address}:${process.env.PORT || 3000}`;
      }
    }
  }
  return req.get('host');
}

// Sockets watching the live counter from the homepage (no session created)
const counterWatchers = new Set();

// ── Helpers ───────────────────────────────────────────────────────────────────
function send(socket, obj) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(obj));
  }
}

function broadcastLiveCount() {
  let count = 0;
  for (const s of sessions.values()) {
    if (
      s.state === 'active' &&
      s.tvSocket?.readyState === WebSocket.OPEN &&
      s.phoneSocket?.readyState === WebSocket.OPEN
    ) count++;
  }
  // Broadcast to board TVs
  for (const s of sessions.values()) {
    send(s.tvSocket, { type: 'boards_live', count });
  }
  // Broadcast to homepage counter watchers
  for (const sock of counterWatchers) {
    send(sock, { type: 'boards_live', count });
  }
}

function padRows(rows) {
  const out = [];
  for (let i = 0; i < 6; i++) {
    const row = (rows[i] ?? '').slice(0, 22);
    out.push(row.padEnd(22, ' '));
  }
  return out;
}

// ── WebSocket connection handler ───────────────────────────────────────────────
wss.on('connection', socket => {
  let session = null;
  let role = null; // 'tv' | 'phone'

  socket.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (!role) {
      // Homepage live-counter watcher — no session, just receives broadcasts
      if (msg.type === 'counter_watch') {
        counterWatchers.add(socket);
        // Send current count immediately
        let count = 0;
        for (const s of sessions.values()) {
          if (
            s.state === 'active' &&
            s.tvSocket?.readyState === WebSocket.OPEN &&
            s.phoneSocket?.readyState === WebSocket.OPEN
          ) count++;
        }
        send(socket, { type: 'boards_live', count });
        return;
      }

      // First message determines role
      if (msg.type === 'tv_hello') {
        role = 'tv';
        // Try to resume existing session
        const existing = msg.sessionId ? getById(msg.sessionId) : null;
        if (existing) {
          existing.tvSocket = socket;
          existing.state = 'waiting';
          session = existing;
        } else {
          session = createSession();
          session.tvSocket = socket;
        }
        touch(session);
        send(socket, { type: 'tv_paired', sessionId: session.id, pairCode: session.pairCode });
        broadcastLiveCount();
        return;
      }

      if (msg.type === 'phone_hello') {
        role = 'phone';
        const found = getByCode(msg.pairCode);
        if (!found) { send(socket, { type: 'not_found' }); socket.close(); return; }

        // Hijack protection: active session with live phone socket
        if (
          found.state === 'active' &&
          found.phoneSocket?.readyState === WebSocket.OPEN
        ) {
          send(socket, { type: 'board_occupied' });
          socket.close();
          return;
        }

        session = found;

        // Phone reconnecting to an active session (socket dropped) — skip re-approval
        if (found.state === 'active') {
          found.phoneSocket = socket;
          touch(found);
          send(socket, { type: 'phone_approved' });
          broadcastLiveCount();
          return;
        }

        found.phoneSocket = socket;
        found.state = 'pending_approval';
        touch(found);
        send(found.tvSocket, { type: 'phone_request' });
        return;
      }

      return; // unknown first message
    }

    // ── Subsequent messages ────────────────────────────────────────────────────
    if (!session) return;
    touch(session);

    if (role === 'tv') {
      if (msg.type === 'tv_approve') {
        session.state = 'active';
        send(session.phoneSocket, { type: 'phone_approved' });
        send(session.tvSocket,    { type: 'phone_approved' });
        broadcastLiveCount();
      } else if (msg.type === 'tv_reject') {
        session.state = 'waiting';
        send(session.phoneSocket, { type: 'phone_rejected' });
        session.phoneSocket?.close();
        session.phoneSocket = null;
      }
    }

    if (role === 'phone') {
      if (msg.type === 'phone_send') {
        const rows = padRows(msg.payload?.rows ?? []);
        session.currentRows = rows;
        send(session.tvSocket, { type: 'display_update', rows });
      } else if (msg.type === 'phone_next') {
        send(session.tvSocket, { type: 'phone_next' });
      } else if (msg.type === 'phone_reset') {
        session.currentRows = ['', '', '', '', '', ''];
        send(session.tvSocket, { type: 'hard_reset' });
      }
    }
  });

  socket.on('close', () => {
    // Clean up counter watchers (homepage)
    counterWatchers.delete(socket);

    if (!session) return;

    if (role === 'tv') {
      session.tvSocket = null;
    } else if (role === 'phone') {
      session.phoneSocket = null;
      // Only notify TV if session was active
      if (session.state === 'active' || session.state === 'pending_approval') {
        session.state = 'waiting';
        send(session.tvSocket, { type: 'disconnected' });
      }
    }
    broadcastLiveCount();
  });
});

// ── Start ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Digital Solari running on http://localhost:${PORT}`);
  console.log(`  Homepage:   http://localhost:${PORT}/`);
  console.log(`  Board:      http://localhost:${PORT}/board`);
  console.log(`  Controller: http://localhost:${PORT}/controller`);
});
