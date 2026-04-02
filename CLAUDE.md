# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Digital Solari** is a web-based split-flap display system. It has two components:
- **Display Board (Receiver):** TV/browser showing a 6×22 animated character grid
- **Mobile Controller (Sender):** Phone-friendly remote for sending messages to the display

Full spec is in `Digital_Solari_PRD.md`.

## Architecture

**Stack:** Node.js WebSocket server (`ws` library) + vanilla HTML/CSS/JS frontend. No framework, no database — 100% in-memory state.

**Communication:** WebSocket only. TV and phone pair via a 6-digit alphanumeric code (no O, 0, I, 1). QR code on TV encodes the pairing URL. One phone per board (hijack protection).

**Two frontend pages:**
- `index.html` (or `/board`) — Display board, auto-starts demo loop on load
- `controller.html` (or `/controller?code=XXXXXX`) — Mobile UI

## Core Mechanical Rules

These constraints are non-negotiable and must be preserved exactly:

**Character Spool** — tiles cycle sequentially through this exact array, never randomly:
```js
const SPOOL = ` ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$()-+=;:'"%,.?/°roygbpw`;
```
Color characters are stored as **lowercase** (`roygbpw`) so they don't collide with the uppercase letter set. `isColorChar(ch)` checks `'roygbpw'.includes(ch)`.

**Animation:** All changing tiles flip simultaneously at constant velocity (no easing). To go from `A` to `D`, the tile must render `B` then `C` as intermediate frames.

**Audio:** Single `pragotron_split-flap-display.wav` loop — starts when the first flap moves, stops when the last flap settles.

**Color characters (ROYGBPW):** Render as full solid-color tiles, not text.

## Visual Specs

- Board background: `#1B1B1B` (Eerie Black)
- Each tile has a 1px horizontal center line (flap seam simulation)
- Font: Doto (Google Fonts, weight 700, `ROND: 0` square dot-matrix style)

## State & Persistence

- Server: in-memory only, sessions auto-purge after 24h inactivity
- TV: `localStorage` stores last paired session ID (auto-reconnect on network blip)
- Mobile: `localStorage` saves draft messages
- Phone socket close → TV shows `DISCONNECTED`; re-opening phone resumes session

## Mobile Controller Behavior

- 6 text inputs, 22-char max each; JS forces uppercase; unsupported chars become `?`
- Up to 10 messages; loop timer 5–60s (default 7s)
- **Clock Mode:** only the changing second-digit tiles flip; rows 2–4 show Day/Date, HH:MM:SS AM/PM, Year
- Switching from Clock → Message Mode snaps board to `DEVICE CONNECTED` standby

## Demo Mode (Display Board)

On load, cycles through:
1. `"IMPOSSIBLE IS NOTHING" - ADIDAS`
2. `"IN REAL LIFE, I ASSURE YOU, THERE IS NO SUCH THING AS ALGEBRA." - FRAN LEBOWITZ`
3. `SCAN THE QRCODE AND TRY YOURSELF`

Demo controls: [Skip], [Mute/Unmute], [Fullscreen]. Live counter top-left: `🟢 X BOARDS LIVE` (counts active paired sessions only).

## Pending Tasks

_(none)_

## Workflow Notes

**UI work:** Always invoke the `frontend-design` skill before making any UI/CSS/HTML changes.

**Visual QA:** Use Puppeteer to take screenshots for verification. Run `npm run screenshot` (requires server running on port 3000). Screenshots save to `temporary screenshots/` and Claude can read them directly to check for layout or rendering issues.

## Tile Rendering Architecture

**Font:** Doto via Google Fonts (`family=Doto:wght@100..900`). All three HTML pages load it via `<link>` preconnect tags before `splitflap.css`.

**Rendering approach:** Direct — Doto is a standard dot-matrix font, not a stencil. Characters render as amber (`#E8D5A3`) text on dark (`#1B1B1B`) panels. No white-backing trick needed.

**Space character rendering:** Always set `textContent = ''` (empty string) for space characters — use the `renderChar` helper in `board.js`: `const renderChar = ch => (ch === ' ' ? '' : ch);`

**Character sizing:**
- Tile: `width: 2.2rem; height: 3rem`
- Each panel (`.tile-top`, `.tile-bottom`): `height: 50% = 1.5rem`
- `font-size: 1.5rem` — fills panel height; adjust if characters clip or feel cramped
- `translateY(0.75rem)` on top-panel chars — shifts character center to the seam (= `panel_height / 2`)
- `translateY(-0.75rem)` on bottom-panel chars — same logic, upward
- **Do not use percentage-based translateY** — the correct value is always `panel_height / 2` as an absolute rem

**4-panel CSS 3D flip architecture:**
- `.top-half-static` (z:1) — static background, holds current char top half; updated after flip settles
- `.bottom-flap-animating` (z:2) — incoming char top, pre-rotated edge-on (-90°); unfolds during flip
- `.top-flap-animating` (z:3) — current char top, flat at rest; folds down (90°) during flip
- `.bottom-half-static` — incoming char bottom, snapped immediately; never animates
- JS writes new char to `.bottom-flap-animating`/`.bottom-half-static` → adds `.flipping` → `animationend` copies to `.top-half-static`/`.top-flap-animating` and removes `.flipping`

**Audio:** Use Web Audio API (`AudioBufferSourceNode` with `loop=true`), NOT `<audio loop>`. Browsers have a gap between `<audio>` loop cycles. Pattern: prefetch raw bytes on page load (no user gesture needed), decode to `AudioBuffer` only after user gesture (e.g. Skip click).

**Mute button state:** Shows `SOUND OFF` (dimmed, non-interactive) until audio is unlocked via Skip. After unlock, becomes `MUTE`/`UNMUTE`.
