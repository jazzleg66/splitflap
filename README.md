# Digital Solari — Split-Flap Display for Any Screen

[![Tests](https://github.com/jazzleg66/splitflap/actions/workflows/test.yml/badge.svg)](https://github.com/jazzleg66/splitflap/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

A high-fidelity, web-based split-flap display system. Turn any TV, monitor, or browser into a mechanical departure board — controlled from your phone.

Characters cycle through a fixed spool exactly like physical hardware. No random scrambling, no shortcuts — every flip passes through every intermediate character.

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
- **State:** In-memory (sessions auto-purge after 24h)
- **Database:** Optional Supabase for session persistence across restarts
- **Monitoring:** Optional Sentry (errors) + PostHog (analytics)

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
├── Digital_Solari_PRD.md     # Product requirements document
├── CLAUDE.md                 # AI coding context / architecture guide
└── BACKLOG.md                # Bug log and known issues
```

## ⚙️ Configuration

All configuration is via environment variables. Copy `.env.example` to `.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | `development` or `production` |
| `APP_URL` | No | Public URL for QR code generation |
| `SUPABASE_URL` | No | Supabase project URL (enables session persistence) |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Supabase service role key |
| `SENTRY_DSN` | No | Sentry DSN for error monitoring |
| `VITE_POSTHOG_KEY` | No | PostHog project API key |
| `VITE_POSTHOG_HOST` | No | PostHog host (default: `https://app.posthog.com`) |

The app works without any external services — Supabase, Sentry, and PostHog are all optional.

## 🧪 Testing

```bash
npm test
```

Tests use Jest with jsdom for DOM testing.

## 🚢 Deployment

See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md) for full instructions. The project includes configs for:

- **Railway** (`railway.toml`)
- **Render** (`render.yaml`)

Both platforms auto-detect Node.js and deploy with `npm start`.

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

[MIT](LICENSE) © jazzleg66
