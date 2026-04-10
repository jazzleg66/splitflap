const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');

// Alphabet for pair codes: excludes O, 0, I, 1
const PAIR_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Map<sessionId, session>
const sessions = new Map();

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
  do {
    code = Array.from({ length: 6 }, () =>
      PAIR_ALPHA[Math.floor(Math.random() * PAIR_ALPHA.length)]
    ).join('');
  } while ([...sessions.values()].some(s => s.pairCode === code));
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
      .catch(err => console.error('[supabase] failed to insert session:', err.message));
  }

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

  // Persist to Supabase (fire-and-forget)
  if (supabase) {
    supabase
      .from('sessions')
      .update({ last_active: session.lastActivity.toISOString() })
      .eq('id', session.id)
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
        sessions.set(row.id, {
          id: row.id,
          pairCode: row.pair_code,
          tvSocket: null,
          phoneSocket: null,
          state: row.state,
          lastActivity: new Date(row.last_active),
          currentRows: row.current_rows || ['', '', '', '', '', ''],
        });
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
};
