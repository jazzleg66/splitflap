# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security vulnerabilities.

Instead, use GitHub's private vulnerability reporting:

1. Go to the repository's **Security** tab → **Report a vulnerability**.
2. Describe the issue, affected version/commit, and reproduction steps.

We aim to acknowledge reports within a few days. This is a community project
maintained on a best-effort basis (see the maintenance note in the README) —
please allow reasonable time for a fix before any public disclosure.

## Supported versions

The latest release on the default branch receives security fixes. Older tags are
not maintained.

## Security model (what to expect)

Digital Solari is designed so that **the person who can see the board can control
it** — pairing is intentionally low-friction. Hardening that exists:

- **Short-lived pair codes** that rotate (default 10 min, `PAIR_CODE_TTL_MIN`),
  so a photographed QR cannot be reused indefinitely.
- **Per-phone resume tokens** decouple reconnection from the displayed code.
- **Owner controls**: lock (block new takeovers), kick (+ rotate code), clear.
- **Approve mode** (`PAIRING_MODE=approve`) requires owner confirmation on the TV.
- **Origin allow-list** for WebSocket upgrades (`ALLOWED_ORIGINS`).
- **Per-connection rate limiting** and a **server-side charset whitelist +
  content filter**.

### Operator responsibilities

- Set `APP_URL` and `ALLOWED_ORIGINS` in production.
- Terminate TLS (run behind HTTPS) — pair codes and content are otherwise sent in
  the clear on your network.
- For public placement, prefer `PAIRING_MODE=approve` and consider `AUDIT_LOG=true`.
- Keep dependencies patched (`npm audit`).

### Known limitations

- There is **no per-user authentication or accounts** — control is by possession
  of a valid, unexpired pair code (or resume token). This is by design.
- In-memory state means a single instance; see the README on scaling.
