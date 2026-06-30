const {
  createSession,
  getByCode,
  getById,
  touch,
  updateState,
  updateRows,
  loadSessionsFromDB,
  sessions,
  sessionsByCode,
} = require('../server/sessionManager');

// We mock Supabase
let mockSupabase = {
  from: jest.fn().mockReturnThis(),
  insert: jest.fn().mockResolvedValue({}),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockResolvedValue({}),
  select: jest.fn().mockReturnThis(),
  gte: jest.fn().mockResolvedValue({ data: [], error: null }),
  delete: jest.fn().mockReturnThis(),
  lt: jest.fn().mockResolvedValue({}),
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => mockSupabase,
}));

process.env.SUPABASE_URL = 'http://mock-url';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-key';

let sessionManager;

describe('sessionManager', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    sessionManager = require('../server/sessionManager');
    sessionManager.sessions.clear();
    sessionManager.sessionsByCode.clear();
  });

  describe('createSession', () => {
    test('creates a session with a valid UUID and 6-char pair code', async () => {
      const session = await sessionManager.createSession();
      expect(session.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(session.pairCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      expect(session.state).toBe('waiting');
      expect(session.currentRows).toEqual(['', '', '', '', '', '']);
      expect(session.tvSocket).toBeNull();
      expect(session.phoneSocket).toBeNull();

      expect(mockSupabase.insert).toHaveBeenCalled();
    });

    test('generates unique pair codes', async () => {
      const codes = new Set();
      for (let i = 0; i < 20; i++) {
        const session = await sessionManager.createSession();
        codes.add(session.pairCode);
      }
      expect(codes.size).toBe(20);
    });

    test('stores session in the sessions map', async () => {
      const session = await sessionManager.createSession();
      expect(sessionManager.sessions.has(session.id)).toBe(true);
      expect(sessionManager.sessions.get(session.id)).toBe(session);
    });

    test('handles supabase error silently', async () => {
      mockSupabase.insert.mockRejectedValueOnce(new Error('test error'));
      const session = await sessionManager.createSession();
      expect(session).toBeDefined();
    });
  });

  describe('getByCode', () => {
    test('finds session by pair code', async () => {
      const session = await sessionManager.createSession();
      const found = sessionManager.getByCode(session.pairCode);
      expect(found).toBe(session);
    });

    test('returns null for unknown code', () => {
      expect(sessionManager.getByCode('ZZZZZZ')).toBeNull();
    });
  });

  describe('getById', () => {
    test('finds session by ID', async () => {
      const session = await sessionManager.createSession();
      const found = sessionManager.getById(session.id);
      expect(found).toBe(session);
    });

    test('returns null for unknown ID', () => {
      expect(sessionManager.getById('nonexistent-id')).toBeNull();
    });
  });

  describe('touch', () => {
    test('updates lastActivity timestamp', async () => {
      const session = await sessionManager.createSession();
      const before = session.lastActivity;
      await new Promise((r) => setTimeout(r, 10));
      sessionManager.touch(session);
      expect(session.lastActivity.getTime()).toBeGreaterThanOrEqual(before.getTime());

      expect(mockSupabase.update).toHaveBeenCalled();
    });

    test('handles supabase error silently', async () => {
      const session = await sessionManager.createSession();
      mockSupabase.eq.mockRejectedValueOnce(new Error('test error'));
      sessionManager.touch(session);
    });
  });

  describe('updateState', () => {
    test('transitions session state', async () => {
      const session = await sessionManager.createSession();
      expect(session.state).toBe('waiting');
      sessionManager.updateState(session, 'active');
      expect(session.state).toBe('active');

      expect(mockSupabase.update).toHaveBeenCalled();
    });

    test('handles supabase error silently', async () => {
      const session = await sessionManager.createSession();
      mockSupabase.eq.mockRejectedValueOnce(new Error('test error'));
      sessionManager.updateState(session, 'active');
    });
  });

  describe('updateRows', () => {
    test('stores current rows', async () => {
      const session = await sessionManager.createSession();
      const rows = ['HELLO WORLD', '', '', '', '', ''];
      sessionManager.updateRows(session, rows);
      expect(session.currentRows).toEqual(rows);

      expect(mockSupabase.update).toHaveBeenCalled();
    });

    test('handles supabase error silently', async () => {
      const session = await sessionManager.createSession();
      mockSupabase.eq.mockRejectedValueOnce(new Error('test error'));
      sessionManager.updateRows(session, []);
    });
  });

  describe('pair code alphabet', () => {
    test('codes never contain ambiguous characters (0, O, 1, I)', async () => {
      for (let i = 0; i < 50; i++) {
        const session = await sessionManager.createSession();
        expect(session.pairCode).not.toMatch(/[01OI]/);
      }
    });
  });

  describe('pair code expiry & rotation', () => {
    test('new sessions have a future expiry and are valid', async () => {
      const session = await sessionManager.createSession();
      expect(session.pairCodeExpiresAt).toBeGreaterThan(Date.now());
      expect(sessionManager.isPairCodeValid(session)).toBe(true);
    });

    test('isPairCodeValid is false once expiry has passed', async () => {
      const session = await sessionManager.createSession();
      session.pairCodeExpiresAt = Date.now() - 1;
      expect(sessionManager.isPairCodeValid(session)).toBe(false);
    });

    test('rotatePairCode issues a new code and drops the old lookup', async () => {
      const session = await sessionManager.createSession();
      const oldCode = session.pairCode;
      const newCode = sessionManager.rotatePairCode(session);
      expect(newCode).not.toBe(oldCode);
      expect(newCode).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
      expect(sessionManager.getByCode(oldCode)).toBeNull();
      expect(sessionManager.getByCode(newCode)).toBe(session);
      expect(sessionManager.isPairCodeValid(session)).toBe(true);
    });
  });

  describe('phone resume token', () => {
    test('issuePhoneToken sets a 48-char hex token resolvable via getByToken', async () => {
      const session = await sessionManager.createSession();
      expect(session.phoneToken).toBeNull();
      const token = sessionManager.issuePhoneToken(session);
      expect(token).toMatch(/^[0-9a-f]{48}$/);
      expect(sessionManager.getByToken(token)).toBe(session);
    });

    test('getByToken returns null for unknown / empty tokens', () => {
      expect(sessionManager.getByToken('')).toBeNull();
      expect(sessionManager.getByToken('deadbeef')).toBeNull();
    });
  });

  describe('loadSessionsFromDB', () => {
    test('loads sessions correctly', async () => {
      mockSupabase.gte.mockResolvedValueOnce({
        data: [
          {
            id: 'test-id',
            pair_code: 'TEST12',
            state: 'active',
            last_active: new Date().toISOString(),
            current_rows: ['', '', '', '', '', ''],
          },
        ],
        error: null,
      });
      await sessionManager.loadSessionsFromDB();
      expect(sessionManager.sessions.has('test-id')).toBe(true);
    });

    test('does not duplicate existing session', async () => {
      const session = await sessionManager.createSession();
      mockSupabase.gte.mockResolvedValueOnce({
        data: [
          {
            id: session.id,
            pair_code: session.pairCode,
            state: 'active',
            last_active: new Date().toISOString(),
            current_rows: ['', '', '', '', '', ''],
          },
        ],
        error: null,
      });
      await sessionManager.loadSessionsFromDB();
      expect(sessionManager.sessions.get(session.id)).toBe(session);
    });

    test('handles errors correctly', async () => {
      mockSupabase.gte.mockResolvedValueOnce({
        data: null,
        error: new Error('mock error'),
      });
      await sessionManager.loadSessionsFromDB();
    });

    test('handles exception correctly', async () => {
      mockSupabase.gte.mockRejectedValueOnce(new Error('mock error'));
      await sessionManager.loadSessionsFromDB();
    });
  });
});
