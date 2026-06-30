# Contributing to Digital Solari

Thanks for your interest in contributing! This project is a web-based split-flap display system that prioritizes mechanical accuracy and zero-friction user experience.

## Getting Started

```bash
git clone https://github.com/jazzleg66/splitflap.git
cd splitflap
npm install
cp .env.example .env
npm run dev
```

The server starts at `http://localhost:3000`.

## Development Setup

- **Node.js ≥ 18** required
- `npm run dev` — starts the server with nodemon (auto-restart on changes)
- `npm test` — runs the Jest test suite
- `npm run lint` — ESLint
- `npm run format` — Prettier (server + tests)
- `npm run typecheck` — TypeScript `checkJs` on the logic modules
- `npm run screenshot` — takes Puppeteer screenshots (requires server running)

Before opening a PR, make sure `npm run lint`, `npm run format:check`,
`npm run typecheck`, and `npm test` all pass — CI runs the same checks.

## Core Rules

These mechanical constraints are **non-negotiable** and must be preserved:

### The Spool

Characters cycle sequentially through this exact array — **never randomly**:

```js
const SPOOL = ` ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$()-+=;:'"%,.?/°wroygbp`;
```

To go from `A` to `D`, the tile **must** render `B` then `C` as intermediate frames.

### Animation

- All changing tiles flip **simultaneously** at **constant velocity** (no easing)
- Color characters (`roygbpw`) are stored lowercase — they render as solid-color tiles, not text
- Audio starts when the first flap moves, stops when the last flap settles

### Architecture

- Vanilla HTML/CSS/JS frontend — **no framework**
- Single Node.js server with WebSockets
- In-memory session state (no database required)
- Static asset path resolution uses `<base href>` tags — don't remove these

For the full specification, see [CLAUDE.md](CLAUDE.md) and [Digital_Solari_PRD.md](Digital_Solari_PRD.md).

## Making Changes

1. Fork the repo and create a feature branch from `main`
2. Make your changes
3. Run `npm test` and ensure all tests pass
4. Open a Pull Request with a clear description of what changed and why

### Code Style

- Use vanilla JavaScript (ES modules on the frontend, CommonJS on the server)
- No external CSS frameworks — write vanilla CSS
- Use `textContent` (not `innerHTML`) when inserting user-provided data
- Keep the server lightweight — no unnecessary dependencies

### Commit Messages

Use clear, descriptive commit messages:

```
feat: add color gradient animation to tiles
fix: WebSocket reconnect loop on iOS Safari
docs: update deployment guide for Render
```

## Reporting Issues

When filing a bug report, please include:

- Browser and version
- Steps to reproduce
- Expected vs. actual behavior
- Console errors (if any)

All contributors are expected to follow our [Code of Conduct](CODE_OF_CONDUCT.md).
For security issues, see [SECURITY.md](SECURITY.md) — please don't file public issues.

## Questions?

Open an issue with the `question` label.
