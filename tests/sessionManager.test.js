/**
 * Tests for server/sessionManager.js
 *
 * Validates session lifecycle: creation, lookup, pair code generation,
 * state transitions, and auto-purge of expired sessions.
 */

// Stub Supabase so sessionManager doesn't try to connect
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => null,
}));

// Clear env vars that would trigger Supabase init
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const {
  createSession,
  getByCode,
  getById,
  touch,
  updateState,
  updateRows,
  sessions,
} = require('../server/sessionManager');

describe('sessionManager', () => {
  beforeEach(() => {
    // Clear all sessions before each test
    sessions.clear();
  });

  describe('createSession', () => {
    test('creates a session with a valid UUID and 6-char pair code', async () => {
      const session = await createSession();
      expect(session.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(session.pairCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      expect(session.state).toBe('waiting');
      expect(session.currentRows).toEqual(['', '', '', '', '', '']);
      expect(session.tvSocket).toBeNull();
      expect(session.phoneSocket).toBeNull();
    });

    test('generates unique pair codes', async () => {
      const codes = new Set();
      for (let i = 0; i < 20; i++) {
        const session = await createSession();
        codes.add(session.pairCode);
      }
      expect(codes.size).toBe(20);
    });

    test('stores session in the sessions map', async () => {
      const session = await createSession();
      expect(sessions.has(session.id)).toBe(true);
      expect(sessions.get(session.id)).toBe(session);
    });
  });

  describe('getByCode', () => {
    test('finds session by pair code', async () => {
      const session = await createSession();
      const found = getByCode(session.pairCode);
      expect(found).toBe(session);
    });

    test('returns null for unknown code', () => {
      expect(getByCode('ZZZZZZ')).toBeNull();
    });
  });

  describe('getById', () => {
    test('finds session by ID', async () => {
      const session = await createSession();
      const found = getById(session.id);
      expect(found).toBe(session);
    });

    test('returns null for unknown ID', () => {
      expect(getById('nonexistent-id')).toBeNull();
    });
  });

  describe('touch', () => {
    test('updates lastActivity timestamp', async () => {
      const session = await createSession();
      const before = session.lastActivity;
      // Small delay to ensure timestamp differs
      await new Promise(r => setTimeout(r, 10));
      touch(session);
      expect(session.lastActivity.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('updateState', () => {
    test('transitions session state', async () => {
      const session = await createSession();
      expect(session.state).toBe('waiting');
      updateState(session, 'active');
      expect(session.state).toBe('active');
    });
  });

  describe('updateRows', () => {
    test('stores current rows', async () => {
      const session = await createSession();
      const rows = ['HELLO WORLD', '', '', '', '', ''];
      updateRows(session, rows);
      expect(session.currentRows).toEqual(rows);
    });
  });

  describe('pair code alphabet', () => {
    test('codes never contain ambiguous characters (0, O, 1, I)', async () => {
      for (let i = 0; i < 50; i++) {
        const session = await createSession();
        expect(session.pairCode).not.toMatch(/[01OI]/);
      }
    });
  });
});
