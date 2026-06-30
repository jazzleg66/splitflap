/**
 * @jest-environment node
 *
 * End-to-end pairing / control chain tests (Sections 1 & 2). Spins up the real
 * server on an ephemeral port and drives it with actual WebSocket clients.
 */
const WebSocket = require('ws');
const { server, start } = require('../server/index');

let baseUrl;
const openSockets = [];

// The server logs verbosely on every pairing/close event; those fire
// asynchronously (including during/after teardown). Silence them so they don't
// trip Jest's "cannot log after tests are done" guard.
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

beforeAll((done) => {
  start(0);
  server.on('listening', () => {
    baseUrl = `ws://127.0.0.1:${server.address().port}/ws`;
    done();
  });
  if (server.listening) {
    baseUrl = `ws://127.0.0.1:${server.address().port}/ws`;
    done();
  }
});

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Close a client socket and resolve once it's fully closed, so the server-side
// 'close' handler runs while the test environment is still alive (otherwise its
// logging trips Jest's "cannot log after tests are done" guard → exit 1).
function gracefulClose(ws) {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) return resolve();
    ws.removeAllListeners('message');
    ws.once('close', resolve);
    try {
      ws.close();
    } catch (_) {
      resolve();
    }
    setTimeout(resolve, 500); // safety net
  });
}

afterEach(async () => {
  await Promise.all(openSockets.splice(0).map(gracefulClose));
  // Give the server's socket-close handlers a tick to flush before teardown.
  await delay(50);
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await delay(50);
});

function open() {
  const ws = new WebSocket(baseUrl);
  openSockets.push(ws);
  ws._buf = [];
  ws.on('message', (d) => ws._buf.push(JSON.parse(d)));
  return new Promise((resolve, reject) => {
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function send(ws, obj) {
  ws.send(JSON.stringify(obj));
}

function waitFor(ws, type, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const hit = ws._buf.find((m) => m.type === type);
    if (hit) return resolve(hit);
    const onMsg = (d) => {
      const m = JSON.parse(d);
      if (m.type === type) {
        clearTimeout(timer);
        ws.off('message', onMsg);
        resolve(m);
      }
    };
    const timer = setTimeout(() => {
      ws.off('message', onMsg);
      reject(new Error(`timeout waiting for "${type}"; saw: ${ws._buf.map((m) => m.type)}`));
    }, timeout);
    ws.on('message', onMsg);
  });
}

// Pair a fresh board + phone. Returns { tv, phone, pairCode, token }.
async function pair() {
  const tv = await open();
  send(tv, { type: 'tv_hello' });
  const paired = await waitFor(tv, 'tv_paired');
  const phone = await open();
  send(phone, { type: 'phone_hello', pairCode: paired.pairCode });
  const approved = await waitFor(phone, 'phone_approved');
  return { tv, phone, pairCode: paired.pairCode, token: approved.token };
}

describe('pairing chain', () => {
  test('TV pairs and receives a session + valid pair code', async () => {
    const tv = await open();
    send(tv, { type: 'tv_hello' });
    const paired = await waitFor(tv, 'tv_paired');
    expect(paired.sessionId).toMatch(/[0-9a-f-]{36}/);
    expect(paired.pairCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(paired.ttl).toBeGreaterThan(0);
  });

  test('phone pairs (instant mode) and is issued a resume token', async () => {
    const { token } = await pair();
    expect(token).toMatch(/^[0-9a-f]{48}$/);
  });

  test('unknown pair code is rejected with not_found', async () => {
    const phone = await open();
    send(phone, { type: 'phone_hello', pairCode: 'ZZZZZZ' });
    const res = await waitFor(phone, 'not_found');
    expect(res.type).toBe('not_found');
  });

  test('a controller can reconnect with its resume token', async () => {
    const { token, phone } = await pair();
    phone.terminate();
    const phone2 = await open();
    send(phone2, { type: 'phone_hello', token });
    const res = await waitFor(phone2, 'phone_approved');
    expect(res.token).toBe(token);
  });
});

describe('control & moderation', () => {
  test('clean message reaches the board, sanitized', async () => {
    const { tv, phone } = await pair();
    // Avoid letters that double as color codes (r/o/y/g/b/p/w).
    send(phone, { type: 'phone_send', payload: { rows: ['hi mate', '', '', '', '', ''] } });
    const upd = await waitFor(tv, 'display_update');
    expect(upd.rows).toHaveLength(6);
    expect(upd.rows[0]).toBe('HI MATE'.padEnd(22, ' '));
  });

  test('profanity is rejected and never reaches the board', async () => {
    const { tv, phone } = await pair();
    send(phone, { type: 'phone_send', payload: { rows: ['THIS IS SHIT', '', '', '', '', ''] } });
    await waitFor(phone, 'content_rejected');
    // A subsequent clean message should still get through; the bad one did not.
    send(phone, { type: 'phone_send', payload: { rows: ['CLEAN', '', '', '', '', ''] } });
    const upd = await waitFor(tv, 'display_update');
    expect(upd.rows[0].trimEnd()).toBe('CLEAN');
  });

  test('owner lock blocks a new device from taking over', async () => {
    const { tv, pairCode } = await pair();
    send(tv, { type: 'tv_lock' });
    await waitFor(tv, 'lock_state');
    const intruder = await open();
    send(intruder, { type: 'phone_hello', pairCode });
    const res = await waitFor(intruder, 'board_locked');
    expect(res.type).toBe('board_locked');
  });
});
