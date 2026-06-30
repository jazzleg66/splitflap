# Digital Solari — Split-Flap Display for Any Screen

[![Tests](https://github.com/jazzleg66/splitflap/actions/workflows/test.yml/badge.svg)](https://github.com/jazzleg66/splitflap/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

A high-fidelity, web-based split-flap display system. Turn any TV, monitor, or browser into a mechanical departure board — controlled from your phone.

Characters cycle through a fixed spool exactly like physical hardware. No random scrambling, no shortcuts — every flip passes through every intermediate character.

<!-- TODO: add a short demo GIF here — boards without one are a hard sell.
     Record the board flipping a message and save it as docs/demo.gif, then:
     ![Digital Solari demo](docs/demo.gif) -->

> **Control model at a glance:** scanning the board's QR pairs your phone to it.
> Pair codes are **short-lived and rotate** (default 10 min), and the board owner
> has **lock / kick / clear** controls. For public placement you can require
> owner approval before a phone takes over. See
> [Pairing & control](#-pairing--control-security) and [SECURITY.md](SECURITY.md).

## ✨ Features

- **6×22 tile grid** — 132 characters, each with a CSS 3D flip animation
- **Sequential spool** — characters advance through `A→Z→0→9→symbols→colors` like real hardware
- **Phone controller** — scan a QR code, type messages, hit Play
- **Clock mode** — only the changing digits flip, the rest stays static
- **Color tiles** — 7 solid-color blocks (Red, Orange, Yellow, Green, Blue, Purple, White)
- **Real-time pairing** — WebSocket connection with QR code, 6-digit manual code
- **Sound** — continuous mechanical clacking loop, synced to animation
- **Zero friction** — no accounts, no login, no install
- **Demo mode** — auto-plays curated quotes on the homepage
- **Owner controls** — lock the board, kick a device, or clear content from the TV
- **Content safety** — server-side character whitelist + configurable profanity filter
- **Accessible** — honors `prefers-reduced-motion`; board content exposed to screen readers via `aria-live`

## 🚀 Quick Start

```bash
# Clone the repo
git clone https://github.com/jazzleg66/splitflap.git
cd splitflap

# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Run with Docker

```bash
# Build and start (reads .env if present; runs on defaults otherwise)
docker compose up -d

# …or plain Docker
docker build -t digital-solari .
docker run -p 3000:3000 --env-file .env digital-solari
```

The container exposes a `/health` endpoint used by its built-in `HEALTHCHECK`.

### Try it out

1. Open the homepage → click **Connect Board**
2. Scan the QR code with your phone (same Wi-Fi network)
3. Type a message on the phone controller → hit **Play**
4. Watch the board flip ✨

## 🏗️ Architecture

```
┌─────────────────┐     WebSocket      ┌─────────────┐
│  Display Board   │◄──────────────────►│  Node.js    │
│  (TV / Browser)  │                    │  Server     │
└─────────────────┘                    └──────┬──────┘
                                              │
┌─────────────────┐     WebSocket      ┌──────┴──────┐
│  Phone Controller│◄──────────────────►│  Express +  │
│  (Mobile Browser)│                    │  ws library │
└─────────────────┘                    └─────────────┘
```

- **Server:** Node.js + Express + `ws` WebSocket library
- **Frontend:** Vanilla HTML/CSS/JS — no framework
- **State:** In-memory (sessions auto-purge after `SESSION_IDLE_HOURS`, default 24h)
- **Database:** Optional Supabase for session persistence across restarts
- **Monitoring:** Optional Sentry (errors) + PostHog (analytics)

**Request flow:** a board (TV) opens a WebSocket and is issued a session + a
short-lived pair code, rendered as a QR. A phone scans it, opens its own
WebSocket, and presents the code; the server links the two sockets and relays
validated/moderated `display_update` messages from phone → board. Reconnection
uses a per-phone resume token, not the (rotating) code. All state is per-process
in memory; Supabase, when configured, is a write-through backup for restart
recovery only.

## 🔐 Pairing & control (security)

Digital Solari favors low-friction pairing while giving the board owner real
control. Configure it via environment variables (see [Configuration](#️-configuration)):

- **Short-lived pair codes** — a code is valid for `PAIR_CODE_TTL_MIN` (default
  10 min). The board auto-rotates the QR before expiry, so a photographed code
  can't be reused indefinitely. The QR encodes the code, **not** a durable token.
- **Pairing modes** (`PAIRING_MODE`):
  - `instant` (default) — scanning takes control immediately. Good for private
    or supervised settings.
  - `approve` — scanning sends a request; the **owner approves on the TV** first.
    Recommended for public placement.
- **Single controller** with **owner-priority lock**: one phone controls a board
  at a time. While locked, no new device can take over (last-writer-wins otherwise).
- **Resume tokens** keep a controller connected across network blips without the
  pair code being a permanent key.
- **Transport hardening** — Origin allow-list on WebSocket upgrades
  (`ALLOWED_ORIGINS`) and per-connection rate limiting (`RATE_LIMIT_PER_SEC`).

### Owner controls (on the board / TV)

While a controller is connected, the board responds to keyboard shortcuts:

| Key | Action                                               |
| --- | ---------------------------------------------------- |
| `L` | Lock / unlock the board (block new devices)          |
| `K` | Kick the current controller and rotate the pair code |
| `X` | Clear the board content                              |

## 🛡️ Content safety

- A **server-side character whitelist** (always on) accepts only the characters
  on the spool; anything else (emoji, unsupported unicode) is silently dropped.
- A **profanity filter** is **on by default** (`CONTENT_FILTER=true`). Extend it
  with your own terms via `CONTENT_BLOCKLIST`, or disable it. Blocked messages
  are rejected and never reach the board.
- Optional **audit log** (`AUDIT_LOG=true`) records submitted text for moderation.

See [PRIVACY.md](PRIVACY.md) for exactly what is stored and for how long.

## ♿ Accessibility

- Respects the OS **reduce-motion** setting — the board snaps to content instantly
  (no flip animation, no audio) when set.
- The flip tiles are visual-only; current board text is mirrored into an
  `aria-live` region so screen readers announce updates.

## 📁 Project Structure

```
├── server/
│   ├── index.js              # Express + WebSocket server
│   └── sessionManager.js     # Session lifecycle, pair codes, persistence
├── public/
│   ├── index.html            # Homepage with live demo
│   ├── home.js / home.css    # Homepage logic and styles
│   ├── board/                # Display board page
│   │   ├── index.html
│   │   ├── board.js
│   │   └── board.css
│   ├── controller/           # Mobile controller page
│   │   ├── index.html
│   │   ├── controller.js
│   │   └── controller.css
│   └── shared/               # Shared modules
│       ├── splitflap.css     # Core tile/flip CSS
│       ├── spool.js          # Spool engine (character cycling)
│       └── wsClient.js       # Reconnecting WebSocket wrapper
├── assets/audio/             # Sound effects
├── scripts/                  # Utilities (screenshots, DB schema)
├── tests/                    # Jest test suite
├── Dockerfile / docker-compose.yml  # One-command self-host
├── Digital_Solari_PRD.md     # Product requirements document
└── CLAUDE.md                 # AI coding context / architecture guide
```

## ⚙️ Configuration

All configuration is via environment variables. Copy `.env.example` to `.env`:

| Variable                    | Required | Description                                                  |
| --------------------------- | -------- | ------------------------------------------------------------ |
| `PORT`                      | No       | Server port (default: 3000)                                  |
| `NODE_ENV`                  | No       | `development` or `production`                                |
| `APP_URL`                   | No       | Public URL for QR code generation (set in production)        |
| **Pairing & control**       |          |                                                              |
| `PAIRING_MODE`              | No       | `instant` (default) or `approve`                             |
| `PAIR_CODE_TTL_MIN`         | No       | Minutes a pair code stays valid before rotation (default 10) |
| `SESSION_IDLE_HOURS`        | No       | Idle hours before a session is purged (default 24)           |
| `ALLOWED_ORIGINS`           | No       | Comma-separated WebSocket Origin allow-list (empty = any)    |
| `RATE_LIMIT_PER_SEC`        | No       | Sustained inbound message rate per connection (default 10)   |
| `RATE_LIMIT_BURST`          | No       | Burst allowance per connection (default 20)                  |
| **Content**                 |          |                                                              |
| `CONTENT_FILTER`            | No       | Profanity filter on/off (default `true`)                     |
| `CONTENT_BLOCKLIST`         | No       | Extra blocked words, comma-separated                         |
| `AUDIT_LOG`                 | No       | Log submitted message text for moderation (default `false`)  |
| **Optional services**       |          |                                                              |
| `SUPABASE_URL`              | No       | Supabase project URL (enables session persistence)           |
| `SUPABASE_SERVICE_ROLE_KEY` | No       | Supabase service role key                                    |
| `SENTRY_DSN`                | No       | Sentry DSN for error monitoring                              |
| `VITE_POSTHOG_KEY`          | No       | PostHog project API key                                      |
| `VITE_POSTHOG_HOST`         | No       | PostHog host (default: `https://app.posthog.com`)            |

The app works without any external services — Supabase, Sentry, and PostHog are all optional.

## 🧪 Testing & quality

```bash
npm test            # Jest (jsdom) unit + integration tests
npm run test:coverage
npm run lint        # ESLint
npm run format      # Prettier (server + tests)
npm run typecheck   # TypeScript checkJs on the logic modules
```

CI runs lint, format check, type-check, the test matrix (Node 18/20/22), and a
Docker build on every push and pull request.

## 📈 Capacity / scaling

State is in-memory per process, so one instance is bounded by Node's WebSocket
fan-out and event loop. As a **rough reference**, a single modest instance
(1 vCPU / 512 MB) comfortably handles **on the order of a few hundred concurrent
paired boards** for this workload (small, human-paced text updates) — message
relay is O(1) per send and the live count is tracked in O(1). Real numbers depend
on update frequency and hardware; **benchmark your own deployment** before relying
on a figure. To scale horizontally you'd need a shared session store / pub-sub
(e.g. Redis) since sockets and session state are currently node-local.

## 🚢 Deployment

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for full instructions. The project includes configs for:

- **Railway** (`railway.toml`)
- **Render** (`render.yaml`)

Both platforms auto-detect Node.js and deploy with `npm start`.

## 🗺️ Roadmap

Planned / under consideration (contributions welcome — see an issue or open one):

- Horizontal scaling via a shared session store (Redis pub/sub)
- On-screen owner control panel (currently keyboard shortcuts)
- UI internationalization (i18n) — separate from the fixed display character set
- Optional JSDoc type coverage across the server (`index.js`)

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please also read our
[Code of Conduct](CODE_OF_CONDUCT.md). To report a vulnerability, see
[SECURITY.md](SECURITY.md). For data handling, see [PRIVACY.md](PRIVACY.md).

> **Maintenance note:** this is a community project maintained on a best-effort,
> volunteer basis. Issues and PRs are reviewed when time allows — please be
> patient, and feel free to fork.

## ⚖️ Trademarks

"Solari", "Vestaboard", and other split-flap display brands are trademarks of
their respective owners. This project is an independent, unaffiliated work and
is not endorsed by or associated with them.

## 📄 License

[MIT](LICENSE) © jazzleg66
