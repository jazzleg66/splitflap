require('dotenv').config();

// Initialize Sentry for error tracking (optional, only if DSN is set)
let Sentry = null;
if (process.env.SENTRY_DSN) {
  Sentry = require('@sentry/node');
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
}

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');
const QRCode = require('qrcode');
const { createSession, getByCode, getById, touch, updateState, updateRows, sessions } = require('./sessionManager');

// ── Validation helpers ────────────────────────────────────────────────────────
const PAIR_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

// ── Security headers ──────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// ── HTTPS redirect in production ──────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.header('x-forwarded-proto') && req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(301, `https://${req.header('host')}${req.url}`);
    }
    next();
  });
}

// ── Preload and inject env vars into HTML ─────────────────────────────────────
const sentryDsn = process.env.SENTRY_DSN || '';
const phKey = process.env.VITE_POSTHOG_KEY || '';

const htmlCache = {};
function preloadHtmlCache() {
  const filesToCache = [
    path.join(__dirname, '../public/index.html'),
    path.join(__dirname, '../public/board/index.html'),
    path.join(__dirname, '../public/controller/index.html')
  ];

  for (const filePath of filesToCache) {
    try {
      let data = fs.readFileSync(filePath, 'utf8');
      data = data.replace(/var sentryDsn = 'YOUR_SENTRY_DSN_HERE';?/g, `var sentryDsn = '${sentryDsn}';`);
      data = data.replace(/var phKey = 'YOUR_POSTHOG_KEY_HERE';?/g, `var phKey = '${phKey}';`);
      htmlCache[filePath] = data;
    } catch (err) {
      console.error(`[server] Error preloading HTML file ${filePath}:`, err.message);
    }
  }
}
preloadHtmlCache();

// ── Static files ──────────────────────────────────────────────────────────────
// Intercept requests for HTML files before express.static to serve the injected versions
app.use((req, res, next) => {
  let targetPath = null;

  if (req.path === '/' || req.path === '/index.html') {
    targetPath = path.join(__dirname, '../public/index.html');
  } else if (req.path === '/board' || req.path === '/board/' || req.path === '/board/index.html') {
    targetPath = path.join(__dirname, '../public/board/index.html');
  } else if (req.path === '/controller' || req.path === '/controller/' || req.path === '/controller/index.html') {
    targetPath = path.join(__dirname, '../public/controller/index.html');
  }

  if (targetPath) {
    if (htmlCache[targetPath]) {
      return res.send(htmlCache[targetPath]);
    } else {
      return res.status(500).send('Internal Server Error: Application failed to initialize correctly.');
    }
  }

  next();
});

app.use(express.static(path.join(__dirname, '../public')));
app.use('/assets', express.static(path.join(__dirname, '../assets')));

// ── QR code endpoint ──────────────────────────────────────────────────────────
app.get('/qr/:sessionId', async (req, res) => {
  try {
    // Validate session ID format before lookup
    if (!UUID_RE.test(req.params.sessionId)) {
      return res.status(400).end();
    }
    const session = getById(req.params.sessionId);
    if (!session) {
      console.warn(`[qr] Session not found: ${req.params.sessionId}`);
      return res.status(404).end();
    }

    const host = getLanHost(req);

    let scheme = req.headers['x-forwarded-proto'] || req.protocol;
    if (process.env.APP_URL) {
      try {
        scheme = new URL(process.env.APP_URL).protocol.replace(':', '');
      } catch (e) {
        console.warn(`[qr] Invalid APP_URL for scheme extraction: ${process.env.APP_URL}`);
      }
    } else if (process.env.NODE_ENV === 'production' && !req.headers['x-forwarded-proto']) {
      scheme = 'https';
    }

    const url = `${scheme}://${host}/controller?code=${session.pairCode}`;
    console.log(`[qr] encoding URL: ${url}`);

    const buf = await QRCode.toBuffer(url, { errorCorrectionLevel: 'M', width: 300 });

    // Explicitly set Content-Type and Content-Length headers
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

    res.send(buf);
  } catch (e) {
    console.error(`[qr] Failed to generate QR code: ${e.message}`);
    res.status(500).send('Failed to generate QR code');
  }
});

function getLanIp() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      // Support both string ('IPv4') and numeric (4) family — Node.js changed this across versions
      const isIPv4 = iface.family === 'IPv4' || iface.family === 4;
      if (isIPv4 && !iface.internal) candidates.push(iface.address);
    }
  }
  // Prefer typical home/office LAN ranges (192.168.x.x, 10.x.x.x)
  // over virtual adapter ranges used by VMware/Hyper-V/Docker (172.x.x.x, 169.x.x.x, etc.)
  return (
    candidates.find(ip => ip.startsWith('192.168.')) ||
    candidates.find(ip => ip.startsWith('10.'))       ||
    candidates[0] || null
  );
}

function getLanHost(req) {
  // 1. Prefer explicit APP_URL from environment
  if (process.env.APP_URL) {
    try {
      const appHost = new URL(process.env.APP_URL).host;
      console.log(`[server] Using APP_URL host: ${appHost}`);
      return appHost;
    } catch (e) {
      console.error(`[server] Invalid APP_URL: ${process.env.APP_URL}, error: ${e.message}`);
    }
  }

  const reqHost = req.get('host') || '';

  // 2. If no APP_URL is provided, and we are running on localhost,
  // substitute with the machine's LAN IP to allow phone pairing on the local network.
  if (reqHost.startsWith('localhost') || reqHost.startsWith('127.0.0.1')) {
    const port = process.env.PORT || 3000;
    const ip = getLanIp();
    if (ip) {
      const lanHost = `${ip}:${port}`;
      console.log(`[server] Using LAN IP: ${lanHost}`);
      return lanHost;
    }
  }

  // 3. Fallback to Host header if APP_URL and LAN IP are unavailable.
  // In production, APP_URL should always be set to prevent Host Header Injection.
  if (process.env.NODE_ENV === 'production') {
    console.warn('[server] APP_URL not set. Falling back to Host header (consider setting APP_URL for security).');
  }

  if (!reqHost) {
    console.warn('[server] No Host header found, using default localhost:3000');
    return 'localhost:3000';
  }

  console.log(`[server] Using Host header: ${reqHost}`);
  return reqHost;
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

  socket.on('message', async raw => {
    try {
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
          console.log('[pair] tv_hello received');
          role = 'tv';
          // Try to resume existing session (validate session ID format first)
          const existing = (msg.sessionId && UUID_RE.test(msg.sessionId)) ? getById(msg.sessionId) : null;
          console.log(`[pair] Existing session: ${existing ? existing.id : 'none'}`);
          if (existing) {
            existing.tvSocket = socket;
            existing.state = 'waiting';
            session = existing;
          } else {
            console.log('[pair] Creating new session...');
            try {
              console.log('[pair] About to call createSession()...');
              session = await createSession();
              console.log(`[pair] Created session: ${session.id}`);
              session.tvSocket = socket;
            } catch (createErr) {
              console.error('[pair] ❌ createSession FAILED!');
              console.error('[pair] Error type:', createErr.constructor.name);
              console.error('[pair] Error message:', createErr.message);
              console.error('[pair] Error stack:', createErr.stack);
              send(socket, { type: 'error', message: `Session creation failed: ${createErr.message}` });
              socket.close();
              return;
            }
          }
          touch(session);
          console.log(`[pair] tv_hello → session=${session.id} code=${session.pairCode} resumed=${!!existing}`);
          console.log(`[pair] Sending tv_paired response...`);
          send(socket, { type: 'tv_paired', sessionId: session.id, pairCode: session.pairCode });
          console.log(`[pair] Broadcast live count`);
          broadcastLiveCount();
          console.log(`[pair] tv_hello complete`);
          return;
        }

        if (msg.type === 'phone_hello') {
          role = 'phone';
          // Validate pair code format before lookup
          if (typeof msg.pairCode !== 'string' || !PAIR_RE.test(msg.pairCode)) {
            send(socket, { type: 'not_found' }); socket.close(); return;
          }
          const found = getByCode(msg.pairCode);
          console.log(`[pair] phone_hello code=${msg.pairCode} found=${!!found}`);
          if (!found) { send(socket, { type: 'not_found' }); socket.close(); return; }

          // Phone reconnecting with same pair code: close old socket and admit new one
          // (The pair code itself is the security token — whoever has it is authorized)
          if (
            found.state === 'active' &&
            found.phoneSocket?.readyState === WebSocket.OPEN
          ) {
            console.log(`[pair] phone reconnect — closing old socket for code=${msg.pairCode}`);
            found.phoneSocket.close();
            found.phoneSocket = socket;
            touch(found);
            send(socket, { type: 'phone_approved' });
            broadcastLiveCount();
            return;
          }

          session = found;
          const tvOpen = found.tvSocket?.readyState === WebSocket.OPEN;
          console.log(`[pair] session state=${found.state} tvConnected=${tvOpen}`);

          // Phone reconnecting to an active session (socket dropped) — skip re-approval
          if (found.state === 'active') {
            found.phoneSocket = socket;
            touch(found);
            send(socket, { type: 'phone_approved' });
            broadcastLiveCount();
            return;
          }

          if (!tvOpen) {
            send(socket, { type: 'board_offline' });
            socket.close();
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
          updateState(session, 'active');
          send(session.phoneSocket, { type: 'phone_approved' });
          send(session.tvSocket,    { type: 'phone_approved' });
          broadcastLiveCount();
        } else if (msg.type === 'tv_reject') {
          updateState(session, 'waiting');
          send(session.phoneSocket, { type: 'phone_rejected' });
          session.phoneSocket?.close();
          session.phoneSocket = null;
        }
      }

      if (role === 'phone') {
        if (msg.type === 'phone_send') {
          // Validate rows payload shape
          if (!Array.isArray(msg.payload?.rows)) return;
          const rows = padRows(msg.payload.rows);
          updateRows(session, rows);
          send(session.tvSocket, { type: 'display_update', rows });
        } else if (msg.type === 'phone_next') {
          send(session.tvSocket, { type: 'phone_next' });
        } else if (msg.type === 'phone_reset') {
          updateRows(session, ['', '', '', '', '', '']);
          send(session.tvSocket, { type: 'hard_reset' });
        }
      }
    } catch (err) {
      console.error('[ws] Message handler error:', err.message, err.stack);
      send(socket, { type: 'error', message: 'Internal server error' });
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
        updateState(session, 'waiting');
        send(session.tvSocket, { type: 'disconnected' });
      }
    }
    broadcastLiveCount();
  });
});

// Add Sentry error handler (if initialized)
if (Sentry && Sentry.Handlers && Sentry.Handlers.errorHandler) {
  app.use(Sentry.Handlers.errorHandler());
} else if (Sentry && Sentry.setupExpressErrorHandler) {
  Sentry.setupExpressErrorHandler(app);
}

// Fallback error handler (always present, regardless of Sentry)
app.use((err, req, res, _next) => {
  console.error('[error]', err.message, err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  console.error('[unhandled rejection]', reason);
  if (Sentry) Sentry.captureException(reason);
});

// ── Start ──────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  const lanIp = getLanIp();
  console.log(`Digital Solari running on http://localhost:${PORT}`);
  console.log(`  Homepage:   http://localhost:${PORT}/`);
  console.log(`  Board:      http://localhost:${PORT}/board`);
  console.log(`  Controller: http://localhost:${PORT}/controller`);
  if (lanIp) {
    console.log(`  QR codes use LAN IP: http://${lanIp}:${PORT}/controller`);
    console.log(`  → Open Board on this machine, then scan QR from a phone on the same Wi-Fi`);
  } else {
    console.log(`  WARNING: No LAN IP detected — QR codes will use localhost (phone scanning won't work)`);
  }
});
