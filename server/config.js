// Central runtime configuration, resolved from environment variables with safe
// defaults. Importing this module is the single source of truth for tunables —
// do not read process.env for these values elsewhere.

function intEnv(name, def) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : def;
}

function boolEnv(name, def) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return def;
  return /^(1|true|yes|on)$/i.test(raw.trim());
}

function listEnv(name, def = []) {
  const raw = process.env[name];
  if (!raw) return def;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── Pairing / control model ────────────────────────────────────────────────
// 'instant'  → scanning the QR / entering the code takes control immediately (A)
// 'approve'  → scanning sends a control request; the board owner must approve (B)
const PAIRING_MODE =
  (process.env.PAIRING_MODE || 'instant').toLowerCase() === 'approve' ? 'approve' : 'instant';

// Pair codes are short-lived. After this window the code shown on the board is
// rotated, so a photo of an old QR can no longer be used to take over.
const PAIR_CODE_TTL_MS = intEnv('PAIR_CODE_TTL_MIN', 10) * 60 * 1000;

// A session is purged after this much inactivity (no sockets, no writes).
const SESSION_IDLE_MS = intEnv('SESSION_IDLE_HOURS', 24) * 60 * 60 * 1000;

// ── Transport security ──────────────────────────────────────────────────────
// Comma-separated list of allowed Origin headers for WebSocket upgrades.
// Empty = allow any (suitable for LAN / self-host without a fixed domain).
// In production behind a domain, set ALLOWED_ORIGINS to lock this down.
const ALLOWED_ORIGINS = listEnv('ALLOWED_ORIGINS', []);

// ── Rate limiting (per socket) ───────────────────────────────────────────────
// Token-bucket: at most RATE_LIMIT_BURST messages, refilling RATE_LIMIT_PER_SEC/s.
const RATE_LIMIT_PER_SEC = intEnv('RATE_LIMIT_PER_SEC', 10);
const RATE_LIMIT_BURST = intEnv('RATE_LIMIT_BURST', 20);

// ── Content moderation ────────────────────────────────────────────────────────
const CONTENT_FILTER = boolEnv('CONTENT_FILTER', true); // profanity filter on by default
const CUSTOM_BLOCKLIST = listEnv('CONTENT_BLOCKLIST', []).map((s) => s.toUpperCase());

// Audit log of submitted content (who/when/what). Off by default for privacy;
// operators of public boards can enable it for moderation/traceability.
const AUDIT_LOG = boolEnv('AUDIT_LOG', false);

module.exports = {
  PAIRING_MODE,
  PAIR_CODE_TTL_MS,
  SESSION_IDLE_MS,
  ALLOWED_ORIGINS,
  RATE_LIMIT_PER_SEC,
  RATE_LIMIT_BURST,
  CONTENT_FILTER,
  CUSTOM_BLOCKLIST,
  AUDIT_LOG,
};
