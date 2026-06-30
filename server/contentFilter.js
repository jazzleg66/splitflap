// Server-side content validation & moderation.
//
// Two responsibilities:
//   1. Charset whitelist (ALWAYS on) — only characters that exist on the physical
//      spool are accepted. This mirrors public/shared/spool.js; a parity test
//      (tests/spool-parity.test.js) fails CI if the two ever drift apart.
//   2. Profanity filter (configurable) — a small built-in wordlist plus an
//      operator-supplied blocklist. Toggle with CONTENT_FILTER, extend with
//      CONTENT_BLOCKLIST. See server/config.js.

const { CONTENT_FILTER, CUSTOM_BLOCKLIST } = require('./config');

// Canonical spool — MUST stay byte-identical to SPOOL in public/shared/spool.js.
const SPOOL = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$()-+=;:\'"%,.?/°wroygbp';
const COLOR_CHARS = 'roygbpw';

const SPOOL_SET = new Set(SPOOL);
const isColorChar = (ch) => COLOR_CHARS.includes(ch);

// Built-in default blocklist. Intentionally small and English-only — operators
// of public boards should extend it via CONTENT_BLOCKLIST for their context.
// Stored uppercase; matched case-insensitively after normalization.
const DEFAULT_BLOCKLIST = [
  'FUCK',
  'SHIT',
  'BITCH',
  'CUNT',
  'ASSHOLE',
  'DICK',
  'PUSSY',
  'BASTARD',
  'NIGGER',
  'NIGGA',
  'FAGGOT',
  'FAG',
  'RETARD',
  'SLUT',
  'WHORE',
  'RAPE',
  'KIKE',
  'SPIC',
  'CHINK',
  'WETBACK',
  'TRANNY',
];

const blocklist = [...new Set([...DEFAULT_BLOCKLIST, ...CUSTOM_BLOCKLIST])].filter(Boolean);

// Sanitize a single raw row to the legal charset: color chars stay lowercase,
// everything else is uppercased; unknown characters are silently dropped (NOT
// replaced with '?'), then the row is clipped/padded to exactly 22 columns.
function sanitizeRow(raw) {
  const str = typeof raw === 'string' ? raw : '';
  let out = '';
  for (const ch of str) {
    const c = isColorChar(ch.toLowerCase()) && ch === ch.toLowerCase() ? ch : ch.toUpperCase();
    if (SPOOL_SET.has(c)) out += c;
    if (out.length === 22) break;
  }
  return out.padEnd(22, ' ');
}

function sanitizeRows(rows) {
  const arr = Array.isArray(rows) ? rows : [];
  const out = [];
  for (let i = 0; i < 6; i++) out.push(sanitizeRow(arr[i]));
  return out;
}

// Extract readable text for moderation: drop color tiles and collapse spaces.
function readableText(rows) {
  return rows.map((row) => [...row].filter((ch) => !isColorChar(ch)).join('')).join(' ');
}

// Returns { ok, reason }. When CONTENT_FILTER is off, always ok.
function checkProfanity(rows) {
  if (!CONTENT_FILTER || blocklist.length === 0) return { ok: true };

  const text = readableText(rows).toUpperCase();
  // Check both the spaced text (word boundaries) and a de-spaced version so
  // "F U C K" spread across tiles is still caught.
  const despaced = text.replace(/[^A-Z0-9]/g, '');
  for (const word of blocklist) {
    if (text.includes(word) || despaced.includes(word)) {
      return { ok: false, reason: 'blocked_content' };
    }
  }
  return { ok: true };
}

// Full pipeline: sanitize to charset, then moderate.
// Returns { ok, rows, reason }.
function processRows(rows) {
  const clean = sanitizeRows(rows);
  const verdict = checkProfanity(clean);
  if (!verdict.ok) return { ok: false, rows: clean, reason: verdict.reason };
  return { ok: true, rows: clean };
}

module.exports = {
  SPOOL,
  COLOR_CHARS,
  sanitizeRow,
  sanitizeRows,
  readableText,
  checkProfanity,
  processRows,
  blocklist,
};
