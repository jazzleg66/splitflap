# Privacy

This document describes what data Digital Solari handles, where it goes, and how
to control it. It applies to the reference implementation in this repository.
**If you self-host, you are the data controller** for your deployment.

## What data is handled

| Data                                                 | Where                                                    | Persisted?                                                        | Purpose                                           |
| ---------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------- |
| **Message text** (the 6×22 grid you send to a board) | In-memory on the server; mirrored to the connected board | Only if Supabase is configured (see below)                        | Display the message on the board                  |
| **Pair codes & session IDs**                         | In-memory; Supabase if configured                        | Same as above                                                     | Pair a phone with a board                         |
| **Phone resume token**                               | Server memory + the phone's `localStorage`               | Until kicked / session purged                                     | Reconnect after a network blip without re-pairing |
| **Draft messages**                                   | The phone's `localStorage` only (key `solari_drafts`)    | Until the browser clears it                                       | Convenience — never leaves the device unless sent |
| **IP addresses**                                     | Standard HTTP/WebSocket connection metadata              | Not stored by the app; may appear in your host/reverse-proxy logs | Networking                                        |
| **Error reports**                                    | Sentry, **only if `SENTRY_DSN` is set**                  | Per your Sentry retention                                         | Debugging                                         |
| **Product analytics**                                | PostHog, **only if `VITE_POSTHOG_KEY` is set**           | Per your PostHog retention                                        | Usage metrics                                     |
| **Font/CDN requests**                                | Google Fonts; optional Sentry/PostHog CDNs               | Per those providers                                               | Fonts and optional telemetry                      |

## Message persistence — "display and discard" vs. stored

- **Default (no Supabase):** messages live **only in server memory** and are gone
  on restart or when the session is purged. Nothing is written to disk.
- **With Supabase configured** (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`):
  the current board content, pair code, and session state are written to the
  `sessions` table so a board survives a server restart. Rows are **purged after
  the idle window** (`SESSION_IDLE_HOURS`, default 24h) by `purgeExpired()`.

## Logging

- The server logs pairing/connection events (no message text) by default.
- Pair codes are treated as short-lived credentials and are not intentionally
  printed in server or browser logs.
- **Content is only logged if you set `AUDIT_LOG=true`** — intended for public
  boards that need a moderation trail. It logs the session ID and the readable
  message text. Leave it off if you don't need it.
- Review your reverse proxy / hosting logs separately; they may record IPs.

## Optional telemetry

- Sentry and PostHog browser scripts are loaded only when their keys are
  configured by the server.
- Controller URLs scrub the `code` query parameter from the address bar after
  reading it, before optional telemetry initializes.
- Sentry events are scrubbed for `code=` query parameters before upload.
- PostHog is initialized with autocapture and automatic pageview/pageleave
  capture disabled; the app sends only explicit product events.

## Data subject controls

- **Clear a board:** owner presses `X` on the board (or the controller resets).
- **Kick a device:** owner presses `K` — drops the controller and rotates the code.
- **Purge:** sessions auto-expire after `SESSION_IDLE_HOURS`. To wipe persisted
  data immediately, truncate the Supabase `sessions` table.
- **Drafts:** clearing the phone browser's site data removes local drafts.

## If you run a public demo

State clearly to your users that anything they send is shown publicly and may be
logged for moderation. See the "When NOT to use instant mode" guidance in the
README. Consider enabling `PAIRING_MODE=approve` and `AUDIT_LOG=true`.
