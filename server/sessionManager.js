const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');

// Alphabet for pair codes: excludes O, 0, I, 1
const PAIR_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Map<sessionId, session>
const sessions = new Map();
const sessionsByCode = new Map();

// Supabase client (initialized if env vars are set)
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function generatePairCode() {
  let code;
  let exists;
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += PAIR_ALPHA[crypto.randomInt(PAIR_ALPHA.length)];
    }

    exists = sessionsByCode.has(code);
  } while (exists);
  return code;
}

async function createSession() {
  const id = uuidv4();
  const pairCode = generatePairCode();
  const session = {
    id,
    pairCode,
    tvSocket: null,
    phoneSocket: null,
    // 'waiting' | 'pending_approval' | 'active'
    state: 'waiting',
    lastActivity: new Date(),
    currentRows: ['', '', '', '', '', ''],
  };
  sessions.set(id, session);
  sessionsByCode.set(pairCode, session);

  // Persist to Supabase (fire-and-forget, never block)
  if (supabase) {
    supabase
      .from('sessions')
      .insert([{
        id,
        pair_code: pairCode,
        state: 'waiting',
        current_rows: session.currentRows,
        last_active: new Date().toISOString(),
      }])
      .then(() => {
        console.log(`[supabase] session persisted: ${id}`);
      })
      .catch(err => {
        console.error('[supabase] failed to insert session:', err.message);
      });
  }

  return session;
}

function getByCode(code) {
  return sessionsByCode.get(code) || null;
}

function getById(id) {
  return sessions.get(id) || null;
}

function touch(session) {
  session.lastActivity = new Date();

  // Persist to Supabase (fire-and-forget)
  if (supabase) {
    supabase
      .from('sessions')
      .update({ last_active: session.lastActivity.toISOString() })
      .eq('id', session.id)
      .then(() => {})
      .catch(err => console.error('[supabase] failed to update session:', err.message));
  }
}

function updateState(session, newState) {
  session.state = newState;

  // Persist to Supabase (fire-and-forget)
  if (supabase) {
    supabase
      .from('sessions')
      .update({ state: newState, last_active: new Date().toISOString() })
      .eq('id', session.id)
      .then(() => {})
      .catch(err => console.error('[supabase] failed to update state:', err.message));
  }
}

function updateRows(session, rows) {
  session.currentRows = rows;

  // Persist to Supabase (fire-and-forget)
  if (supabase) {
    supabase
      .from('sessions')
      .update({ current_rows: rows, last_active: new Date().toISOString() })
      .eq('id', session.id)
      .then(() => {})
      .catch(err => console.error('[supabase] failed to update rows:', err.message));
  }
}

async function loadSessionsFromDB() {
  if (!supabase) return;

  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: rows, error } = await supabase
      .from('sessions')
      .select('*')
      .gte('last_active', cutoff);

    if (error) {
      console.error('[supabase] failed to load sessions:', error.message);
      return;
    }

    // Repopulate in-memory map (sockets are transient, so set to null)
    for (const row of rows) {
      if (!sessions.has(row.id)) {
        const session = {
          id: row.id,
          pairCode: row.pair_code,
          tvSocket: null,
          phoneSocket: null,
          state: row.state,
          lastActivity: new Date(row.last_active),
          currentRows: row.current_rows || ['', '', '', '', '', ''],
        };
        sessions.set(row.id, session);
        sessionsByCode.set(row.pair_code, session);
      }
    }
    console.log(`[supabase] loaded ${rows.length} sessions from database`);
  } catch (err) {
    console.error('[supabase] error loading sessions:', err.message);
  }
}

function purgeExpired() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const expiredIds = [];
  for (const [id, s] of sessions) {
    const idle = s.lastActivity.getTime() < cutoff;
    const noSockets = !s.tvSocket && !s.phoneSocket;
    if (idle && noSockets) {
      sessionsByCode.delete(s.pairCode);
      sessions.delete(id);
      expiredIds.push(id);
    }
  }

  // Purge from Supabase (fire-and-forget)
  if (supabase && expiredIds.length > 0) {
    supabase
      .from('sessions')
      .delete()
      .lt('last_active', new Date(cutoff).toISOString())
      .then(() => {})
      .catch(err => console.error('[supabase] failed to purge sessions:', err.message));
  }
}

// Load sessions from DB on startup
loadSessionsFromDB();

// Auto-purge every 5 minutes
setInterval(purgeExpired, 5 * 60 * 1000);

module.exports = {
  createSession,
  getByCode,
  getById,
  touch,
  updateState,
  updateRows,
  loadSessionsFromDB,
  sessions,
  sessionsByCode,
};
