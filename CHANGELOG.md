# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres
to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Historical development bug notes live in [BACKLOG.md](BACKLOG.md).

## [Unreleased]

## [1.1.0] - 2026-06-30

Pre-open-source hardening release.

### Added

- **Short-lived pair codes** that auto-rotate (`PAIR_CODE_TTL_MIN`, default 10 min);
  the QR no longer encodes a durable control token.
- **Per-phone resume tokens** so reconnection survives code rotation.
- **Pairing modes** (`PAIRING_MODE`): `instant` (default) and owner-`approve`.
- **Owner controls** on the board: lock (`L`), kick + rotate code (`K`), clear (`X`).
- **WebSocket Origin allow-list** (`ALLOWED_ORIGINS`) and **per-connection rate
  limiting** (`RATE_LIMIT_PER_SEC` / `RATE_LIMIT_BURST`).
- **Server-side content safety**: always-on charset whitelist + configurable
  profanity filter (`CONTENT_FILTER`, `CONTENT_BLOCKLIST`) and optional audit log
  (`AUDIT_LOG`).
- **`/health`** endpoint.
- **Accessibility**: `prefers-reduced-motion` support and an `aria-live` screen-reader
  mirror of board content.
- **Tooling**: ESLint + Prettier + `checkJs` type-checking; Docker + docker-compose;
  expanded CI (lint, format, type-check, test matrix, Docker build).
- **Docs**: `SECURITY.md`, `PRIVACY.md`, `CODE_OF_CONDUCT.md`; expanded README
  (pairing/control, content safety, accessibility, capacity, roadmap).
- Tests for content filtering, spool parity (browser ↔ server), and pair-code
  expiry / rotation / resume tokens.

### Changed

- Central runtime configuration via `server/config.js`.
- QR cache keyed by pair code (fresh QR after rotation).
- Session purge uses a configurable idle window (`SESSION_IDLE_HOURS`).
- `phone_send` now sanitizes and moderates content server-side.

### Removed

- Stray dev/scratch files (benchmark scripts, zoom-buttons helper, generated
  explainer HTML, stale issue list).

## [1.0.0] - 2026-04

- Initial split-flap display system: 6×22 board, mobile controller, WebSocket
  pairing with QR codes, demo mode, clock mode, color tiles, optional Supabase
  persistence, Sentry, and PostHog.
