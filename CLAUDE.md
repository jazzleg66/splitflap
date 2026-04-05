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

**Audio:** Single `split-flap.wav` loop — starts when the first flap moves, stops when the last flap settles (exactly when the last CSS flip animation completes, tracked via `pendingFlips` counter).

**Color characters (ROYGBPW):** Render as full solid-color tiles, not text. Color palette (defined in `public/shared/spool.js` `COLOR_MAP`):
- `r` Red `#B34444`
- `o` Orange `#CC8F52`
- `y` Yellow `#F2D046`
- `g` Green `#3A5944`
- `b` Blue `#4365A8`
- `p` Purple `#744471`
- `w` White `#FAFAFA`

## Visual Specs

- Page background (homepage hero + board page): `#ffffff` white — the dark board sits in contrast against it
- Board/tile background: `#1B1B1B` (Eerie Black)
- Each tile has a **2px black center seam** (`.tile-top { border-bottom: 2px solid #000 }`) with a faint light glint below it, splitting the visual into top and bottom flap
- Three fold-score lines in the lower portion of `.tile-bottom` (at 60%, 74.5%, 89% of the half-height) via `::after` gradient — each line is a light ridge + dark shadow. `z-index: 10` keeps them above all panels and textures
- Font: Doto (Google Fonts, weight 700, `ROND: 0` square dot-matrix style)

## State & Persistence

- Server: in-memory only, sessions auto-purge after 24h inactivity
- TV: `localStorage` stores last paired session ID (auto-reconnect on network blip)
- Mobile: `localStorage` saves draft messages under key `solari_drafts`
- Phone socket close → TV shows `DISCONNECTED`; re-opening phone resumes session

**Default message versioning:** `DEFAULT_VERSION` constant in `controller.js` guards against stale drafts. `saveDrafts()` writes the version into `solari_drafts`; `loadDrafts()` discards and removes any saved drafts whose version doesn't match. **Whenever `DEFAULT_MESSAGES` is changed, bump `DEFAULT_VERSION` by 1** so old phone localStorage is automatically cleared on next load.

## Mobile Controller Behavior

- 6 character-grid rows, 22-char max each; JS forces uppercase; unsupported chars (emoji, special unicode) are **silently dropped** (not replaced with `?`)
- Up to 10 messages; loop timer 5–60s (default 7s)
- **Clock Mode:** only the changing second-digit tiles flip; rows 2–4 show Day/Date, HH:MM:SS AM/PM, Year
- Switching from Clock → Message Mode snaps board to `DEVICE CONNECTED` standby

**Controller UI layout:**
- `#mirror-section` — `position: sticky; top: 50px` — contains `#preview-label` bar (status dot + code) above `#preview-wrapper`. Has rounded bottom corners and side margin for a card look. Scales to fill the viewport width (`fitPreview()` has no cap — `scale = wrapper.clientWidth / grid.offsetWidth`).
- `#preview-label` — bar at top of mirror showing "LIVE ON BOARD [CODE]" + a `.preview-dot` (green when connected, dim otherwise). Updated by `updateHeader()`.
- `#scroll-body` — scrollable area below the mirror; contains mode tabs, message nav, color picker, row inputs, and loop timer.
- `#msg-nav` / `#msg-tabs` — compact numbered tab strip for navigating between messages (1–10). Active tab: amber border. Playing tab: green border. Each tab has an inline `×` delete button when there are multiple messages. `#btn-add-message` lives here as a compact `+` button.
- `renderMessageList()` renders **only the active message's** 6 row character-grids — not all messages stacked. Rows labeled `01`–`06` on the left for 1:1 WYSIWYG mapping to the preview rows above. Switching active message via tab re-renders grids for the newly active message.
- `renderMsgTabs()` is called by `renderMessageList()` and `updatePlayingHighlight()`.

**Character grid input architecture:**
- Each row is a `.char-grid-wrapper` containing a 22-cell `.char-grid` (CSS grid `repeat(22, 1fr)`) + a `.char-hidden-input` overlay.
- The hidden input has `opacity: 0.001; position: absolute; inset: 0; font-size: 16px` — invisible but focusable; tapping the row opens the keyboard.
- Click position on the hidden input is translated to a column index → `setSelectionRange(col, col)` sets the cursor.
- `selectionchange` events (including iOS long-press-space trackpad) dispatch a custom `_cursor` event to the focused input, calling `updateCells()` to move the blinking underline cursor highlight.
- `normalizeValue()`: keeps lowercase color chars (from picker only), uppercases valid SPOOL chars, silently drops everything else.
- Color chars are inserted only via `insertColorChar()` which writes **directly to `.value`** (not `setRangeText`) to bypass `autocapitalize="characters"` converting lowercase to uppercase.
- `focusedInput` global tracks which row's hidden input is active for `insertColorChar()`.

**Color picker:**
- `#emoji-picker` contains 7 `.color-swatch` buttons (was emoji buttons) with inline `style="background: #XXXXXX"` using exact `COLOR_MAP` hex values. Order: white, red, orange, yellow, green, blue, purple.
- Click handler: `e.target.closest('.color-swatch')` → `insertColorChar(btn.dataset.color)`.
- Color cells render as solid-color fills (no text) via `.char-cell.is-color { background: var(--cell-color) }` and `cell.textContent = ''`.

**Controller preview grid CSS:** The controller does NOT load `board.css`. `controller.css` must declare `display: grid; grid-template-columns: repeat(22, auto)` on `#board-preview #board-grid` directly — otherwise the preview tiles stack in a single column.

**Controller preview tile rendering:** Preview tiles use a simplified 2-panel structure (`tile-top`/`tile-bottom` directly containing `.tile-char`) — no inner flex wrappers. `controller.css` must add `display: flex; align-items: center; justify-content: center` to `#board-preview .tile-top` and `.tile-bottom` so the span is centered before `translateY` shifts it to the seam. `translateY` must be `±1.075rem` (= `4.3rem ÷ 4`, half-panel height) and `font-size` must be `4.3rem` (full tile height) — the `splitflap.css` defaults of `0.75rem` / `1.5rem` are sized for the old 3rem tile and are wrong here.

**Controller preview scaling:** `fitPreview()` must be called via `requestAnimationFrame()` (not synchronously in `fonts.ready`) to ensure `grid.offsetWidth` is non-zero on load. A `ResizeObserver` on `#preview-wrapper` handles orientation changes and late-layout scenarios.

## Demo Mode (Display Board)

On load, cycles through:
1. `"IMPOSSIBLE IS NOTHING" - ADIDAS`
2. `"IN REAL LIFE, I ASSURE YOU, THERE IS NO SUCH THING AS ALGEBRA." - FRAN LEBOWITZ`
3. `SCAN THE QRCODE AND TRY YOURSELF`

Demo controls: [Skip], [Mute/Unmute], [Fullscreen], [Connect Board →]. Live counter top-left: `🟢 X BOARDS LIVE` (counts active paired sessions only).

**Homepage layout order:** About/steps section first (top), board demo section second (below). The Connect Board button lives inline with the demo controls under the board — not in a separate CTA section.

**Homepage fullscreen:** `#hero.requestFullscreen()` — `:fullscreen` CSS: background `#1B1B1B`, `#hero-header` hidden, board at `width: 100vw`, container `padding: 2vh 0`. Demo controls remain visible (~40px) providing natural bottom gap.

**Board page fullscreen:** `document.body.requestFullscreen()` (NOT `documentElement` — `body:fullscreen` selectors only match when `body` is the fullscreen element). CSS hides `#board-header`, sets container `padding: 2vh 0`. When `board-active` (phone connected, demo controls hidden), adds `padding-bottom: 40px` to compensate for the missing controls gap, matching homepage appearance.

**Phone disconnect behavior:** When phone disconnects, board stays open (keeps `board-active` state, QR screen stays hidden) and flips to `DISCONNECTED_ROWS`. Does NOT return to QR screen. When phone reconnects and re-approves, board flips to `STANDBY_ROWS`.

**Server binding:** Must listen on `'0.0.0.0'` explicitly — `server.listen(PORT, '0.0.0.0', ...)`. Without this, Node.js on Windows binds to `::` (IPv6 only) and rejects IPv4 connections from phones on the same LAN.

**QR code IP detection:** `getLanIp()` in `server/index.js` collects all non-internal IPv4 addresses and prefers `192.168.x.x` then `10.x.x.x` to avoid returning virtual adapter IPs (WSL, VMware, Hyper-V). QR URL hardcodes `http://` — do not use `req.protocol` which can return `https` unexpectedly.

**iOS / HTTPS:** iOS Safari may refuse `http://` URLs if typed without the `http://` prefix (Safari auto-upgrades bare `IP:port` to HTTPS). Always include the `http://` scheme. The QR code encodes the full `http://` URL so scanning works correctly.

## Pending Tasks

_(none)_

## Workflow Notes

**UI work:** Always invoke the `frontend-design` skill before making any UI/CSS/HTML changes.

**Visual QA:** Use Puppeteer to take screenshots for verification. Run `npm run screenshot` (requires server running on port 3000). Screenshots save to `temporary screenshots/` and Claude can read them directly to check for layout or rendering issues.

## Tile Rendering Architecture

**Font:** Doto via Google Fonts (`family=Doto:wght@100..900`). All three HTML pages load it via `<link>` preconnect tags before `splitflap.css`.

**Rendering approach:** Direct — Doto is a standard dot-matrix font, not a stencil. Characters render as white (`#FFFFFF`) text on dark (`#1B1B1B`) panels. No white-backing trick needed.

**Space character rendering:** Always set `textContent = ''` (empty string) for space characters — use the `renderChar` helper in `board.js`: `const renderChar = ch => (ch === ' ' ? '' : ch);`

**Character sizing:**
- Tile: `width: 2.2rem; height: 4.3rem` (base CSS in `splitflap.css`; overridden to `width: 100%; aspect-ratio: 2.2/4.3` on both homepage and board page for responsive scaling)
- Each panel (`.tile-top`, `.tile-bottom`): `height: 50%`
- `font-size` = full tile height (`h`) — set via `--tile-fs` CSS variable by a `ResizeObserver` in JS (`syncTileSizing`). Both pages set `--tile-fs = h` (full tile height), not panel height. This fills the tile with large Doto characters.
- `translateY` = `h / 4` (= half panel height) — set via `--tile-ty`. Shifts the character center to the seam.
- **Do not use percentage-based translateY** — the correct value is always `h / 4` as an absolute px value set by JS

**4-panel CSS 3D flip architecture:**
- `.top-half-static` (z:1) — static background, holds current char top half; updated after flip settles
- `.bottom-flap-animating` (z:2) — incoming char top, pre-rotated edge-on (-90°); unfolds during flip
- `.top-flap-animating` (z:3) — current char top, flat at rest; folds down (90°) during flip
- `.bottom-half-static` — incoming char bottom, snapped immediately; never animates
- JS writes new char to `.bottom-flap-animating`/`.bottom-half-static` → adds `.flipping` → `animationend` copies to `.top-half-static`/`.top-flap-animating` and removes `.flipping`

**Tile surface texture:** `.tile-top::before` and `.tile-bottom::before` at `z-index: 4` (above all face panels, max z-index 3) add a scanline grain + angled light-sheen overlay. This makes characters appear printed into the tile material rather than floating on top. Do not reduce these z-indexes below 4 or the texture will be buried under the flip panels.

**Audio:** Use Web Audio API (`AudioBufferSourceNode` with `loop=true`), NOT `<audio loop>`. Browsers have a gap between `<audio>` loop cycles. Pattern: prefetch raw bytes on page load (no user gesture needed), decode to `AudioBuffer` only after user gesture (e.g. Skip click). After `decodeAudioData` resolves, call `startAudio()` immediately if `animRunning` is true — this prevents the double-click-to-hear bug where the board starts flipping before the buffer is ready. Audio stop is tied to `pendingFlips`: a counter incremented per CSS flip animation start, decremented in each `animationend` handler. Audio stops when `pendingFlips === 0 && !animRunning` — exactly when the last visual flap lands.

**Mute button state:** Shows `SOUND OFF` (dimmed, non-interactive) until audio is unlocked via Skip. After unlock, becomes `MUTE`/`UNMUTE`.

**To-do List:**
_(none)_