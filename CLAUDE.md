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
const SPOOL = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$()-+=;:'\"\",.?/°ROYGBPW";
```

**Animation:** All changing tiles flip simultaneously at constant velocity (no easing). To go from `A` to `D`, the tile must render `B` then `C` as intermediate frames.

**Audio:** Single `pragotron_split-flap-display.wav` loop — starts when the first flap moves, stops when the last flap settles.

**Color characters (ROYGBPW):** Render as full solid-color tiles, not text.

## Visual Specs

- Board background: `#1B1B1B` (Eerie Black)
- Each tile has a 1px horizontal center line (flap seam simulation)
- Font: Split-Flap Font (vintage Solari style)

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

## Workflow Notes

**UI work:** Always invoke the `frontend-design` skill before making any UI/CSS/HTML changes.

**Visual QA:** Use Puppeteer to take screenshots for verification. Run `npm run screenshot` (requires server running on port 3000). Screenshots save to `.screenshots/` and Claude can read them directly to check for layout or rendering issues.
