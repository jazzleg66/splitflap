// Guards Section 5's single-source-of-truth requirement: the server's charset
// (server/contentFilter.js) must stay byte-identical to the browser spool
// (public/shared/spool.js). If they ever drift, validation/rendering/docs would
// disagree — so this test fails CI to force them back into sync.

import { SPOOL as BROWSER_SPOOL, COLOR_MAP } from '../public/shared/spool.js';

const { SPOOL: SERVER_SPOOL, COLOR_CHARS } = require('../server/contentFilter');

describe('spool parity (browser ↔ server)', () => {
  test('SPOOL strings are identical', () => {
    expect(SERVER_SPOOL).toBe(BROWSER_SPOOL);
  });

  test('color characters match COLOR_MAP keys', () => {
    const mapKeys = Object.keys(COLOR_MAP).sort().join('');
    expect([...COLOR_CHARS].sort().join('')).toBe(mapKeys);
  });
});
