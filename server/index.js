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
const compression = require('compression');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const os = require('os');
const fs = require('fs');
const QRCode = require('qrcode');
const {
  createSession,
  getByCode,
  getById,
  getByToken,
  isPairCodeValid,
  rotatePairCode,
  issuePhoneToken,
  touch,
  updateState,
  updateRows,
  sessions,
} = require('./sessionManager');
const config = require('./config');
const { processRows, readableText } = require('./contentFilter');

// ── Validation helpers ────────────────────────────────────────────────────────
const PAIR_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[0-9a-f]{48}$/i;

// ── Origin allow-list check for WebSocket upgrades ─────────────────────────────
// Empty ALLOWED_ORIGINS = allow any (LAN / self-host without a fixed domain).
// Set ALLOWED_ORIGINS in production to reject cross-origin ws hijacking attempts.
function isAllowedOrigin(origin) {
  if (config.ALLOWED_ORIGINS.length === 0) return true;
  if (!origin) return false;
  return config.ALLOWED_ORIGINS.includes(origin);
}

// ── Performance & Caching ───────────────────────────────────────────────────
const qrCache = new Map(); // sessionId -> buffer
let cachedLanIp = null;
const htmlCache = {};

const app = express();
app.use(compression()); // Gzip compression
const server = http.createServer(app);
const wss = new WebSocket.Server({
  server,
  path: '/ws',
  maxPayload: 1024 * 10,
  verifyClient: (info, done) => {
    const origin = info.req.headers.origin;
    if (isAllowedOrigin(origin)) return done(true);
    console.warn(`[ws] rejected connection from disallowed origin: ${origin}`);
    return done(false, 403, 'Forbidden origin');
  },
});

// ── Per-socket rate limiter (token bucket) ─────────────────────────────────────
// Throttles inbound messages to prevent flooding/screen-spam abuse.
function makeRateLimiter() {
  let tokens = config.RATE_LIMIT_BURST;
  let last = Date.now();
  return function allow() {
    const now = Date.now();
    tokens = Math.min(
      config.RATE_LIMIT_BURST,
      tokens + ((now - last) / 1000) * config.RATE_LIMIT_PER_SEC
    );
    last = now;
    if (tokens < 1) return false;
    tokens -= 1;
    return true;
  };
}

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

function preloadHtmlCache() {
  const filesToCache = [
    path.join(__dirname, '../public/index.html'),
    path.join(__dirname, '../public/board/index.html'),
    path.join(__dirname, '../public/controller/index.html'),
  ];

  for (const filePath of filesToCache) {
    try {
      let data = fs.readFileSync(filePath, 'utf8');
      // Safely stringify and escape variables before injection to prevent XSS and broken JS.
      // We also escape '<' as '\u003c' and '>' as '\u003e' to prevent </script> tag breakout,
      // and use a replacement function to avoid special regex patterns like '$&'.
      const safeSentryDsn = JSON.stringify(sentryDsn)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e');
      const safePhKey = JSON.stringify(phKey).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

      data = data.replace(
        /var sentryDsn = 'YOUR_SENTRY_DSN_HERE';?/g,
        () => `var sentryDsn = ${safeSentryDsn};`
      );
      data = data.replace(
        /var phKey = 'YOUR_POSTHOG_KEY_HERE';?/g,
        () => `var phKey = ${safePhKey};`
      );
      htmlCache[filePath] = data;
    } catch (err) {
      console.error(`[server] Error preloading HTML file ${filePath}:`, err.message);
    }
  }
}
preloadHtmlCache();

// Warm up DNS cache for critical domains — reduces latency on first requests
function warmDnsCache() {
  const dns = require('dns');
  const domains = ['fonts.googleapis.com', 'fonts.gstatic.com'];
  domains.forEach((domain) => {
    dns.lookup(domain, (err) => {
      if (err) console.warn(`[dns] Failed to warm ${domain}:`, err.message);
      else console.log(`[dns] Warmed ${domain}`);
    });
  });
}
// Warm DNS on startup (fire-and-forget)
setImmediate(warmDnsCache);

// ── Static files ──────────────────────────────────────────────────────────────
// Intercept requests for HTML files before express.static to serve the injected versions
app.use((req, res, next) => {
  // Ensure trailing slash for /board and /controller to fix relative path issues
  if ((req.path === '/board' || req.path === '/controller') && !req.url.endsWith('/')) {
    const query = req.url.slice(req.path.length);
    return res.redirect(301, req.path + '/' + query);
  }

  let targetPath = null;

  if (req.path === '/' || req.path === '/index.html') {
    targetPath = path.join(__dirname, '../public/index.html');
  } else if (req.path === '/board' || req.path === '/board/' || req.path === '/board/index.html') {
    targetPath = path.join(__dirname, '../public/board/index.html');
  } else if (
    req.path === '/controller' ||
    req.path === '/controller/' ||
    req.path === '/controller/index.html'
  ) {
    targetPath = path.join(__dirname, '../public/controller/index.html');
  }

  if (targetPath) {
    if (htmlCache[targetPath]) {
      return res.send(htmlCache[targetPath]);
    } else {
      return res
        .status(500)
        .send('Internal Server Error: Application failed to initialize correctly.');
    }
  }

  next();
});

app.use(
  express.static(path.join(__dirname, '../public'), {
    maxAge: '1h', // Cache HTML/JS/CSS for 1 hour by default
    setHeaders: (res, path) => {
      if (path.includes('shared/')) {
        // Shared libraries change rarely, cache longer
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  })
);

// Assets (fonts, audio) are truly static and should be cached aggressively
app.use(
  '/assets',
  express.static(path.join(__dirname, '../assets'), {
    maxAge: '365d',
    immutable: true,
  })
);

// ── Health check endpoint (for monitoring / uptime probes) ────────────────────
const START_TIME = Date.now();
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
    sessions: sessions.size,
    activeBoards: activeSessions.size,
    timestamp: new Date().toISOString(),
  });
});

// ── QR code endpoint ──────────────────────────────────────────────────────────
app.get('/qr/:sessionId', async (req, res) => {
  try {
    if (!UUID_RE.test(req.params.sessionId)) {
      return res.status(400).end();
    }

    const session = getById(req.params.sessionId);
    if (!session) {
      return res.status(404).end();
    }

    // Cache keyed by the CURRENT pair code so a rotation produces a fresh QR.
    const cacheKey = session.pairCode;
    if (qrCache.has(cacheKey)) {
      const cached = qrCache.get(cacheKey);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Length', cached.length);
      // Short browser cache — the code rotates, so don't cache past its TTL.
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.send(cached);
    }

    const host = getLanHost(req);

    let scheme = req.headers['x-forwarded-proto'] || req.protocol;
    if (process.env.APP_URL) {
      try {
        scheme = new URL(process.env.APP_URL).protocol.replace(':', '');
      } catch (e) {}
    } else if (process.env.NODE_ENV === 'production' && !req.headers['x-forwarded-proto']) {
      scheme = 'https';
    }

    const url = `${scheme}://${host}/controller?code=${session.pairCode}`;
    // Use 'L' error correction (7% redundancy) instead of 'M' to generate QR faster
    // This is safe since our 6-char code + URL is short and doesn't need high redundancy
    const buf = await QRCode.toBuffer(url, { errorCorrectionLevel: 'L', width: 280, margin: 1 });

    // Store in cache (keyed by pair code)
    qrCache.set(cacheKey, buf);
    // Cleanup old cache entries (simple logic)
    if (qrCache.size > 1000) {
      const firstKey = qrCache.keys().next().value;
      qrCache.delete(firstKey);
    }

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Length', buf.length);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.send(buf);
  } catch (e) {
    console.error(`[qr] Failed to generate QR code: ${e.message}`);
    res.status(500).send('Failed to generate QR code');
  }
});

function getLanIp() {
  if (cachedLanIp) return cachedLanIp;

  const nets = os.networkInterfaces();
  const candidates = [];
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      const isIPv4 = iface.family === 'IPv4' || iface.family === 4;
      if (isIPv4 && !iface.internal) candidates.push(iface.address);
    }
  }
  cachedLanIp =
    candidates.find((ip) => ip.startsWith('192.168.')) ||
    candidates.find((ip) => ip.startsWith('10.')) ||
    candidates[0] ||
    null;
  return cachedLanIp;
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
    console.warn(
      '[server] APP_URL not set. Falling back to Host header (consider setting APP_URL for security).'
    );
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

// Track active sessions to provide O(1) count instead of O(N) traversals
const activeSessions = new Set();

function updateActiveCount(session) {
  if (!session) return;
  const isActive =
    session.state === 'active' &&
    session.tvSocket?.readyState === WebSocket.OPEN &&
    session.phoneSocket?.readyState === WebSocket.OPEN;

  if (isActive) {
    activeSessions.add(session.id);
  } else {
    activeSessions.delete(session.id);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function send(socket, obj) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(obj));
  }
}

function broadcastLiveCount() {
  // Use the O(1) count from PR #8
  const count = activeSessions.size;

  // Use the optimized single-pass gathering from PR #5
  const tvSockets = [];
  for (const s of sessions.values()) {
    if (s.tvSocket) {
      tvSockets.push(s.tvSocket);
    }
  }

  // Use the cached payload object from PR #5
  const payload = { type: 'boards_live', count };

  // Broadcast to board TVs
  for (let i = 0; i < tvSockets.length; i++) {
    send(tvSockets[i], payload);
  }

  // Broadcast to homepage counter watchers
  for (const sock of counterWatchers) {
    send(sock, payload);
  }
}

// ── WebSocket heartbeat — detect dead iOS Safari / mobile connections ─────────
// iOS Safari can leave WebSocket connections in a zombie state (TCP gone but no
// close event). A periodic ping detects this and terminates stale sockets so
// wsClient on the phone can reconnect and get phone_approved.
const HEARTBEAT_INTERVAL = 20000; // ping every 20 seconds
const heartbeatTimer = setInterval(() => {
  wss.clients.forEach((socket) => {
    if (socket.isAlive === false) {
      console.log('[heartbeat] No pong received — terminating zombie socket');
      socket.terminate();
      return;
    }
    socket.isAlive = false;
    try {
      socket.ping();
    } catch (_) {}
  });
}, HEARTBEAT_INTERVAL);
// Don't keep the process (or tests) alive solely for the heartbeat.
if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref();

// ── WebSocket connection handler ───────────────────────────────────────────────
wss.on('connection', (socket) => {
  socket.isAlive = true;
  socket.on('pong', () => {
    socket.isAlive = true;
  });

  let session = null;
  let role = null; // 'tv' | 'phone'
  const msgStartTime = {};
  const allow = makeRateLimiter();

  socket.on('message', async (raw) => {
    try {
      // Rate limit: drop messages that exceed the per-socket budget. pong/ping
      // are handled at the protocol layer and don't reach here.
      if (!allow()) {
        send(socket, { type: 'rate_limited' });
        return;
      }

      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return;
      }
      msgStartTime[msg.type] = Date.now();

      if (!role) {
        // Homepage live-counter watcher — no session, just receives broadcasts
        if (msg.type === 'counter_watch') {
          counterWatchers.add(socket);
          // Send current count immediately
          send(socket, { type: 'boards_live', count: activeSessions.size });
          return;
        }

        // Silent heartbeat
        if (msg.type === 'ping') return;
        if (msg.type === 'tv_hello') {
          console.log('[pair] tv_hello received');
          role = 'tv';
          // Try to resume existing session (validate session ID format first)
          const existing =
            msg.sessionId && UUID_RE.test(msg.sessionId) ? getById(msg.sessionId) : null;
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
              send(socket, {
                type: 'error',
                message: `Session creation failed: ${createErr.message}`,
              });
              socket.close();
              return;
            }
          }
          // If the code expired (resumed/DB-loaded session) and no controller is
          // attached, rotate to a fresh code before showing the QR.
          const phoneActive = session.phoneSocket?.readyState === WebSocket.OPEN;
          if (!isPairCodeValid(session) && !phoneActive) {
            rotatePairCode(session);
          }
          touch(session);
          updateActiveCount(session);
          console.log(`[pair] tv_hello → session=${session.id} resumed=${!!existing}`);
          console.log(`[pair] Sending tv_paired response...`);
          send(socket, {
            type: 'tv_paired',
            sessionId: session.id,
            pairCode: session.pairCode,
            ttl: config.PAIR_CODE_TTL_MS,
          });
          console.log(`[pair] Broadcast live count`);
          broadcastLiveCount();
          console.log(`[pair] tv_hello complete`);
          return;
        }

        if (msg.type === 'phone_hello') {
          role = 'phone';
          const t0 = Date.now();

          // ── Path 1: reconnect via resume token ─────────────────────────────
          // Decoupled from the short-lived pair code: a controller keeps control
          // across network blips even after the displayed code has rotated.
          if (msg.token && TOKEN_RE.test(msg.token)) {
            const byToken = getByToken(msg.token);
            if (byToken) {
              session = byToken;
              if (
                session.phoneSocket &&
                session.phoneSocket !== socket &&
                session.phoneSocket.readyState === WebSocket.OPEN
              ) {
                session.phoneSocket.close();
              }
              session.phoneSocket = socket;
              session.state = 'active';
              touch(session);
              updateActiveCount(session);
              send(socket, { type: 'phone_approved', token: session.phoneToken });
              if (session.tvSocket) send(session.tvSocket, { type: 'phone_approved' });
              broadcastLiveCount();
              console.log(`[pair] phone resumed via token (${Date.now() - t0}ms)`);
              return;
            }
            // Unknown token (server restart / purged) → fall through to code pairing.
          }

          // ── Path 2: fresh pairing via short-lived code ─────────────────────
          if (typeof msg.pairCode !== 'string' || !PAIR_RE.test(msg.pairCode)) {
            console.log('[pair] phone_hello invalid pair code format');
            send(socket, { type: 'not_found' });
            socket.close();
            return;
          }
          const found = getByCode(msg.pairCode);
          console.log(`[pair] phone_hello found=${!!found}`);
          if (!found) {
            send(socket, { type: 'not_found' });
            socket.close();
            return;
          }

          // Expired code — the board has (or will) rotate to a new QR.
          if (!isPairCodeValid(found)) {
            console.log('[pair] phone_hello expired pair code');
            send(socket, { type: 'code_expired' });
            socket.close();
            return;
          }

          session = found;
          const tvOpen = found.tvSocket?.readyState === WebSocket.OPEN;
          if (!tvOpen) {
            console.log(`[pair] board_offline — TV not connected`);
            send(socket, { type: 'board_offline' });
            socket.close();
            return;
          }

          // Owner-priority lock: while locked, a controller already holds the
          // board and no new device may take over.
          const heldByOther =
            found.phoneSocket &&
            found.phoneSocket !== socket &&
            found.phoneSocket.readyState === WebSocket.OPEN;
          if (found.locked && heldByOther) {
            console.log(`[pair] board_locked — rejecting new device for ${found.id}`);
            send(socket, { type: 'board_locked' });
            socket.close();
            return;
          }

          // Single controller: a new valid pairing displaces the previous phone.
          if (heldByOther) {
            send(found.phoneSocket, { type: 'kicked', reason: 'replaced' });
            found.phoneSocket.close();
          }

          // ── Approve mode (B): owner must confirm on the board ───────────────
          if (config.PAIRING_MODE === 'approve' && found.state !== 'active') {
            found.phoneSocket = socket;
            found.state = 'pending_approval';
            touch(found);
            updateActiveCount(found);
            send(found.tvSocket, { type: 'pairing_request' });
            send(socket, { type: 'awaiting_approval' });
            console.log(`[pair] pairing_request sent to board (approve mode)`);
            return;
          }

          // ── Instant mode (A): take control immediately ─────────────────────
          found.phoneSocket = socket;
          found.state = 'active';
          const token = issuePhoneToken(found);
          touch(found);
          updateActiveCount(found);
          send(found.tvSocket, { type: 'phone_approved' });
          send(socket, { type: 'phone_approved', token });
          broadcastLiveCount();
          console.log(`[pair] phone_approved (instant) total=${Date.now() - t0}ms`);
          return;
        }

        return; // unknown first message
      }

      // ── Subsequent messages ────────────────────────────────────────────────────
      if (!session) return;
      touch(session);

      if (role === 'tv') {
        if (msg.type === 'tv_approve') {
          // Owner approved a pending pairing request (approve mode).
          updateState(session, 'active');
          const token = issuePhoneToken(session);
          updateActiveCount(session);
          send(session.phoneSocket, { type: 'phone_approved', token });
          send(session.tvSocket, { type: 'phone_approved' });
          broadcastLiveCount();
        } else if (msg.type === 'tv_reject') {
          updateState(session, 'waiting');
          session.phoneToken = null;
          send(session.phoneSocket, { type: 'phone_rejected' });
          session.phoneSocket?.close();
          session.phoneSocket = null;
          updateActiveCount(session);
        } else if (msg.type === 'tv_lock' || msg.type === 'tv_unlock') {
          // Owner-priority lock toggle.
          session.locked = msg.type === 'tv_lock';
          send(session.tvSocket, { type: 'lock_state', locked: session.locked });
          console.log(`[owner] session ${session.id} locked=${session.locked}`);
        } else if (msg.type === 'tv_kick') {
          // Owner ejects the current controller and rotates the code so the old
          // QR/code can no longer reconnect.
          session.phoneToken = null;
          if (session.phoneSocket) {
            send(session.phoneSocket, { type: 'kicked', reason: 'owner' });
            session.phoneSocket.close();
            session.phoneSocket = null;
          }
          const newCode = rotatePairCode(session);
          updateState(session, 'waiting');
          updateActiveCount(session);
          send(session.tvSocket, { type: 'session_reset', pairCode: newCode });
          broadcastLiveCount();
          console.log(`[owner] session ${session.id} kicked controller, code rotated`);
        } else if (msg.type === 'tv_clear') {
          // Owner wipes the board content without disconnecting the controller.
          updateRows(session, ['', '', '', '', '', '']);
          send(session.tvSocket, { type: 'hard_reset' });
          send(session.phoneSocket, { type: 'board_cleared' });
        } else if (msg.type === 'tv_refresh_code') {
          // Board requests a fresh pair code (e.g. when the current one expires
          // with no controller connected). Only rotate if no active controller.
          if (!session.phoneSocket || session.phoneSocket.readyState !== WebSocket.OPEN) {
            const newCode = rotatePairCode(session);
            send(session.tvSocket, { type: 'code_rotated', pairCode: newCode });
            console.log(`[pair] code refreshed for ${session.id}`);
          }
        }
      }

      if (role === 'phone') {
        if (msg.type === 'phone_send') {
          // Validate rows payload shape
          if (!Array.isArray(msg.payload?.rows)) return;

          // Sanitize to the legal charset + run moderation (Section 2).
          const result = processRows(msg.payload.rows);
          if (!result.ok) {
            send(socket, { type: 'content_rejected', reason: result.reason });
            console.log(
              `[moderation] rejected message for session ${session.id} (${result.reason})`
            );
            return;
          }
          const rows = result.rows;

          // Optional audit log for traceability on public boards.
          if (config.AUDIT_LOG) {
            console.log(
              `[audit] session=${session.id} text=${JSON.stringify(readableText(rows).trim())}`
            );
          }

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
      console.log(`[pair] TV socket closed for session ${session.id}`);
      session.tvSocket = null;
      // Close the phone's socket so its wsClient detects the drop and reconnects.
      // On reconnect, phone sends phone_hello → server sends board_offline.
      // This is more reliable than sending a message, especially on Safari/iOS.
      if (session.phoneSocket) {
        const phoneState = session.phoneSocket.readyState;
        const stateNames = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
        console.log(
          `[pair] TV disconnected. Closing phone socket (state: ${stateNames[phoneState]})`
        );
        try {
          session.phoneSocket.close();
          console.log('[pair] ✅ Phone socket closed — phone will reconnect and get board_offline');
        } catch (e) {
          console.error('[pair] ❌ Failed to close phone socket:', e.message);
        }
      }
      // Reset session so next phone_hello gets board_offline
      session.state = 'waiting';
      session.phoneSocket = null;
      updateActiveCount(session);
    } else if (role === 'phone') {
      console.log(`[pair] Phone socket closed for session ${session.id}`);
      // Guard against stale close events: if this socket was already replaced by a
      // new reconnect, do NOT null out the new socket or reset session state.
      // This race occurs when the old socket close event fires AFTER phone_hello
      // from the new socket has already updated session.phoneSocket.
      if (session.phoneSocket !== socket) {
        console.log(
          `[pair] Stale phone close ignored (socket already replaced) for session ${session.id}`
        );
        broadcastLiveCount();
        return;
      }
      session.phoneSocket = null;
      // Only notify TV if session was active
      if (session.state === 'active' || session.state === 'pending_approval') {
        updateState(session, 'waiting');
        send(session.tvSocket, { type: 'disconnected' });
      }
      updateActiveCount(session);
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

function start(port = PORT) {
  return server.listen(port, '0.0.0.0', () => {
    const lanIp = getLanIp();
    const p = server.address().port;
    console.log(`Digital Solari running on http://localhost:${p}`);
    console.log(`  Homepage:   http://localhost:${p}/`);
    console.log(`  Board:      http://localhost:${p}/board`);
    console.log(`  Controller: http://localhost:${p}/controller`);
    if (lanIp) {
      console.log(`  QR codes use LAN IP: http://${lanIp}:${p}/controller`);
      console.log(`  → Open Board on this machine, then scan QR from a phone on the same Wi-Fi`);
    } else {
      console.log(
        `  WARNING: No LAN IP detected — QR codes will use localhost (phone scanning won't work)`
      );
    }
  });
}

// Only auto-start when run directly (`node server/index.js`), so tests can
// import the app/server and listen on an ephemeral port.
if (require.main === module) {
  start();
}

module.exports = { app, server, wss, start };
