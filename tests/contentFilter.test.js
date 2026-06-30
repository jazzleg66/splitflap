// Tests for server-side charset whitelist + profanity moderation (Section 2).

describe('contentFilter — charset whitelist (always on)', () => {
  let cf;
  beforeEach(() => {
    jest.resetModules();
    delete process.env.CONTENT_FILTER;
    delete process.env.CONTENT_BLOCKLIST;
    cf = require('../server/contentFilter');
  });

  test('uppercases letters and pads rows to 22 columns', () => {
    // NB: lowercase roygbpw are color codes, not letters — so use letters that
    // don't collide with the color set here (matches browser setTargets()).
    const [row] = cf.sanitizeRows(['cat']);
    expect(row).toBe('CAT'.padEnd(22, ' '));
    expect(row.length).toBe(22);
  });

  test('treats lowercase color letters as color tiles, uppercase as letters', () => {
    // 'O' (uppercase) is the letter O; 'o' (lowercase) is the orange color tile.
    expect(cf.sanitizeRows(['O'])[0][0]).toBe('O');
    expect(cf.sanitizeRows(['o'])[0][0]).toBe('o');
  });

  test('always returns exactly 6 rows', () => {
    expect(cf.sanitizeRows(['A']).length).toBe(6);
    expect(cf.sanitizeRows([]).length).toBe(6);
    expect(cf.sanitizeRows(null).length).toBe(6);
  });

  test('drops unsupported characters instead of replacing them', () => {
    // Emoji / unsupported unicode are removed, not turned into '?'
    const [row] = cf.sanitizeRows(['A😀B❤️C']);
    expect(row.trimEnd()).toBe('ABC');
  });

  test('clips rows longer than 22 characters', () => {
    const [row] = cf.sanitizeRows(['ABCDEFGHIJKLMNOPQRSTUVWXYZ']);
    expect(row.length).toBe(22);
    expect(row).toBe('ABCDEFGHIJKLMNOPQRSTUV');
  });

  test('preserves lowercase color codes', () => {
    const [row] = cf.sanitizeRows(['rgb']);
    expect(row.startsWith('rgb')).toBe(true);
  });

  test('keeps supported punctuation and the degree symbol', () => {
    const [row] = cf.sanitizeRows(["IT'S 20°!"]);
    expect(row.trimEnd()).toBe("IT'S 20°!");
  });
});

describe('contentFilter — profanity (on by default)', () => {
  let cf;
  beforeEach(() => {
    jest.resetModules();
    delete process.env.CONTENT_FILTER;
    delete process.env.CONTENT_BLOCKLIST;
    cf = require('../server/contentFilter');
  });

  test('rejects a message containing a blocked word', () => {
    const res = cf.processRows(['THIS IS SHIT', '', '', '', '', '']);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('blocked_content');
  });

  test('catches blocked words spread across tiles (de-spaced)', () => {
    const res = cf.processRows(['S H I T', '', '', '', '', '']);
    expect(res.ok).toBe(false);
  });

  test('allows clean messages', () => {
    const res = cf.processRows(['HELLO WORLD', '', '', '', '', '']);
    expect(res.ok).toBe(true);
    expect(res.rows.length).toBe(6);
  });
});

describe('contentFilter — configuration', () => {
  test('CONTENT_FILTER=off disables profanity checks', () => {
    jest.resetModules();
    process.env.CONTENT_FILTER = 'off';
    const cf = require('../server/contentFilter');
    expect(cf.processRows(['SHIT', '', '', '', '', '']).ok).toBe(true);
    delete process.env.CONTENT_FILTER;
  });

  test('CONTENT_BLOCKLIST adds custom blocked terms', () => {
    jest.resetModules();
    process.env.CONTENT_BLOCKLIST = 'FOOBAR,BANNED';
    const cf = require('../server/contentFilter');
    expect(cf.processRows(['SAY FOOBAR NOW', '', '', '', '', '']).ok).toBe(false);
    delete process.env.CONTENT_BLOCKLIST;
  });
});
