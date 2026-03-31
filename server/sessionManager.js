const { v4: uuidv4 } = require('uuid');

// Alphabet for pair codes: excludes O, 0, I, 1
const PAIR_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Map<sessionId, session>
const sessions = new Map();

function generatePairCode() {
  let code;
  do {
    code = Array.from({ length: 6 }, () =>
      PAIR_ALPHA[Math.floor(Math.random() * PAIR_ALPHA.length)]
    ).join('');
  } while ([...sessions.values()].some(s => s.pairCode === code));
  return code;
}

function createSession() {
  const id = uuidv4();
  const session = {
    id,
    pairCode: generatePairCode(),
    tvSocket: null,
    phoneSocket: null,
    // 'waiting' | 'pending_approval' | 'active'
    state: 'waiting',
    lastActivity: new Date(),
    currentRows: ['', '', '', '', '', ''],
  };
  sessions.set(id, session);
  return session;
}

function getByCode(code) {
  for (const s of sessions.values()) {
    if (s.pairCode === code) return s;
  }
  return null;
}

function getById(id) {
  return sessions.get(id) || null;
}

function touch(session) {
  session.lastActivity = new Date();
}

function purgeExpired() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, s] of sessions) {
    const idle = s.lastActivity.getTime() < cutoff;
    const noSockets = !s.tvSocket && !s.phoneSocket;
    if (idle && noSockets) sessions.delete(id);
  }
}

// Auto-purge every 5 minutes
setInterval(purgeExpired, 5 * 60 * 1000);

module.exports = { createSession, getByCode, getById, touch, sessions };
