# 📑 Production PRD: Digital Solari (v1.1)

> Source of truth for the Digital Solari split-flap display system.
> All decisions in this document were finalized through the Gemini design conversation and supersede any earlier drafts.

---

## 1. Product Concept

A high-fidelity, web-based digital split-flap display system consisting of two components:

- **Display Board (Receiver):** Any TV or browser tab — shows a 6×22 animated character grid.
- **Mobile Controller (Sender):** Phone-friendly web remote — sends messages to the display over WebSockets.

**Design principles:** Tactile mechanical accuracy, zero-friction connectivity (no accounts, no login, no install), and strict physical animation constraints that set it apart from cheap clones that scramble characters randomly.

---

## 2. Visual Identity & Assets

### 2.1 Aesthetic Specs

- **Board Background / Casing:** Eerie Black (`#1B1B1B`). Deeper and "inkier" than Slate — makes the subtle flap seam look like a gap in a physical plastic casing.
- **Tile Design:** Each of the 132 modules has a subtle **1px horizontal static line** across the center to simulate the mechanical flap seam. Empty/space tiles remain Eerie Black — no separate "Black" color block.
- **Color Blocks:** The 7 color characters (R O Y G B P W) render as **pure, solid blocks of color filling the entire tile** — not circles, not outlines, not partial fills.
- **Typography:** **Vintage Solari Style.** Use the [Split-Flap Font](https://splitflaptv.com/blog/split-flap-font/) to mimic physical plastic-molded characters — tall, thick, high-contrast, monospaced sans-serif.
- **Overall UI aesthetic:** Minimalist, abstract, polished. No AI-style gradients, no soft shadows, no over-rendered 3D lighting.

### 2.2 Audio Engine

- **Asset:** `pragotron_split-flap-display.wav` (single file, loops).
- **Mode:** One global sound — NOT one sound per tile. A single continuous mechanical "clacking" loop.
- **Trigger:** Starts the millisecond the first flap begins to move.
- **Halt:** Stops immediately when the final flap reaches its target state.
- **Browser restriction:** Audio cannot auto-play on page load. The demo starts visually muted. Users unlock audio by clicking the `[SKIP]` demo control (which also advances the demo) or a visible "CLICK TO START" overlay. The `[MUTE/UNMUTE]` toggle is always available after unlock.

---

## 3. Core Mechanical Logic

### 3.1 The Grid

- **Layout:** 6 Rows × 22 Columns = **132 characters total.**

### 3.2 The Character Spool

Tiles **cannot scramble randomly**. They must cycle sequentially through this exact array:

```js
const SPOOL = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$()-+=;:'"%,.?/°roygbpw";
```

> Note: Color characters are stored as lowercase `roygbpw` to disambiguate them from the uppercase letter set. They render as solid color tiles, not as text.

**Spool order:** `[Space]` → `A–Z` → `0–9` → Symbols (`!@#$()-+=;:'"%,.?/°`) → Colors (`roygbpw`)

To move from `A` to `D`, the tile must render `B` then `C` as intermediate frames — no skipping.

### 3.3 Animation Physics

- **Simultaneous:** All changing tiles begin flipping at the exact same time when a new target is set.
- **Constant velocity:** Steady mechanical speed — no ease-in, no ease-out, no bounce or dampening.
- **Sequential stepping:** Each tile advances one step per animation tick through the spool.
- **Implementation:** A single `requestAnimationFrame` loop drives all tiles. On each tick (every ~60ms), every tile with `stepsLeft > 0` advances one position and triggers a CSS flip animation on its DOM element.

### 3.4 Flip Animation (Per Tile — CSS 3D)

Each tile uses a **4-panel CSS 3D card-flip** architecture:

| Panel | Class | State at rest | Contents at rest |
|---|---|---|---|
| Top front | `.tf` | `rotateX(0°)` — visible | Current character (top half) |
| Top back | `.tb` | `rotateX(-180°)` — hidden | Pre-loaded: next character (top half) |
| Bottom front | `.bf` | `rotateX(0°)` — visible | Current character (bottom half) |
| Bottom back | `.bb` | `rotateX(180°)` — hidden | Pre-loaded: next character (bottom half) |

**Flip sequence per step:**
1. Set `.tb` and `.bb` content to the next character.
2. Add `.flipping` class — triggers the CSS animations.
3. Front panels sweep away (`.tf`: `0°→-90°`, `.bf`: `0°→90°`).
4. Back panels reveal in sync (`.tb`: `-180°→0°` with half-duration delay, `.bb`: `180°→0°` with half-duration delay).
5. On `animationend`: copy next character to `.tf`/`.bf`, remove `.flipping`.

All panels use `backface-visibility: hidden`. The `perspective` is set on the tile container.

---

## 4. Website — Display Board Page (`/board`)

### 4.1 Layout

- Full-browser-window dark canvas.
- Live counter in the **top-left corner**: `🟢 [X] BOARDS LIVE` — tracks only actively paired TV-to-phone WebSocket sessions (not idle open tabs).
- 6×22 tile grid centered on the page.
- Demo controls fixed **below** the board: `[SKIP]` · `[MUTE/UNMUTE]` · `[FULLSCREEN]`.

### 4.2 Demo Mode (auto-plays on page load)

The board starts animating immediately on load. The demo is **muted by default** — audio requires user interaction to unlock.

**Demo sequence (continuous loop, 7-second hold per design):**

1. `"IMPOSSIBLE IS NOTHING" - ADIDAS` — quote-aligned layout (attribution right-aligned / indented below the quote text)
2. `"IN REAL LIFE, I ASSURE YOU, THERE IS NO SUCH THING AS ALGEBRA." - FRAN LEBOWITZ`
3. `SCAN THE QRCODE AND TRY YOURSELF`

**Demo controls:**
- `[SKIP]` — Immediately advances to the next design **and enables audio** (satisfies browser autoplay restriction via user gesture).
- `[MUTE]` / `[UNMUTE]` — Toggles audio after it has been unlocked.
- `[FULLSCREEN]` — Enters/exits browser fullscreen mode.

A "CLICK TO START" overlay is visible on load to communicate audio is available but muted. Clicking it unlocks audio. Clicking `[SKIP]` also unlocks audio and dismisses the overlay.

### 4.3 QR Code & Manual Code Panel

The QR code and manual code are displayed as a **full-screen overlay** on top of the running demo (the demo is still visible and running behind it).

**Layout (top to bottom):**
1. "SCAN TO CONNECT" label
2. QR code image — encodes the controller URL with the pair code embedded (`/controller?code=XXXXXX`), so scanning bypasses the manual entry screen entirely
3. "OR ENTER CODE MANUALLY" hint
4. 6-digit pair code — displayed with a dash separator (e.g., `XJ9-4L2`)

**Code generation rules:**
- 6 alphanumeric characters
- Excludes ambiguous characters: `0` (zero), `O` (letter O), `1` (one), `I` (letter I)
- Code remains active as long as the TV browser tab is open; refreshing generates a new code

### 4.4 Connection Approval

When a phone attempts to connect, a **minimalist overlay** appears over the board (not a full board flip):

```
CONNECTION REQUEST
APPROVE? [ENTER]
REJECT?  [ESC]
```

- Resolvable via a keyboard connected to the TV (`Enter` = approve, `Esc` = reject)
- Also clickable for touchscreen/mouse setups
- If rejected: the phone shows `"CONNECTION DENIED"` and stays on the code entry screen

### 4.5 Session & Presence States

| Board state | Display |
|---|---|
| Demo (no phone connected) | Demo loop running |
| Phone request pending | Approval overlay visible |
| Phone approved / active | `DEVICE CONNECTED` (row 3, centered) |
| Phone socket dropped / screen locked | `DISCONNECTED` (row 3, centered) |
| Hard Reset received | Board blanks to Eerie Black, then demo restarts after 500ms |

**Hijack protection:** If a board already has an active phone connection and a second phone tries to connect with the same code, the second phone receives `"BOARD OCCUPIED — TRY AGAIN LATER"`. The active session is not disturbed.

**Auto-reconnect (TV side):** The TV stores its last `sessionId` in `localStorage`. On page reload or network blip, it sends `tv_hello` with the stored ID and resumes the existing session without generating a new code.

**Reconnect on disconnect:** When the phone re-opens (wakes from sleep, returns to tab), the session resumes exactly where it left off — including any active message loop.

---

## 5. Mobile Controller (`/controller?code=XXXXXX`)

### 5.1 Persistent Header (always visible, sticky)

Positioned at the top of the screen — stays visible as the user scrolls.

| Element | Connected state | Disconnected state |
|---|---|---|
| 6-digit code (with dash) | `XJ9-4L2` (static) | `XJ9-4L2` (static) |
| Status dot | 🟢 Green | 🔴 Red |
| Status text box | Green, "CONNECTED" | Red, "DISCONNECTED" |

### 5.2 Persistent Footer (always visible, sticky)

Three fixed buttons at the bottom of the screen:

| Button | Behavior |
|---|---|
| `[PLAY]` | Starts the message loop. Becomes `[STOP]` while playing. Disabled in Clock Mode. |
| `[NEXT]` | Skips the current hold timer and immediately flips to the next message. Only active while playing. **Spam-protected:** locked for ~1.5 seconds after each tap. |
| `[RESET]` | **Hard Reset** — clears TV to blank Eerie Black and resets phone UI to "HELLO WORLD" defaults. |

### 5.3 Mode Toggle

A segmented control switches between two modes:

- `[MESSAGE]` (default)
- `[CLOCK]`

Switching from Clock → Message Mode: instantly flips the board to the `DEVICE CONNECTED` standby screen, re-enables `[PLAY]` and `[NEXT]`.

### 5.4 Board Preview

- Located at the **top of the Messages section** — scrolls away as the user scrolls down to add more messages.
- **Static** — updates immediately and silently as the user types. Does not animate (preserves mobile performance).
- Mirrors the exact layout of the TV grid (6×22, same character rendering, color blocks).

### 5.5 Message Mode

**Color picker row:**
- Label: `"Type below."`
- 7 emoji buttons: 🔴 🟠 🟡 🟢 🔵 🟣 ⚪ — clicking inserts the corresponding color character (`r`, `o`, `y`, `g`, `b`, `p`, `w`) at the cursor position in the focused input.

**Message list:**
- Default message on first load (no saved drafts):
  - Row 1: `HELLO WORLD`
  - Row 2: *(empty)*
  - Row 3: `HOPE YOU ENJOY`
  - Row 4: `CHEERS`
  - Rows 5–6: *(empty)*
- Each message is a block of 6 row inputs.
- **Add Message** button: creates a new blank message block. Turns **gray (disabled)** when 10 messages are reached.
- Each message block has an **× (delete) icon** — hidden when only 1 message remains.
- Maximum: **10 messages per session**.

**Input constraints:**
- System keyboard (not a custom built one).
- `maxLength = 22` enforced by the DOM.
- All keystrokes forced to uppercase in real-time via JS.
- Unsupported characters (including emojis) are **immediately converted to `?`** as the user types.
- Color characters can only be inserted via the emoji picker buttons (not by typing).

**Loop timer:**
- Default: **7 seconds** hold per message before advancing.
- Adjustable via a slider: **5s – 60s**.

### 5.6 Clock Mode

When Clock Mode is active:

- `[PLAY]` and `[NEXT]` are **disabled**.
- The board updates every second automatically.
- **Only the tiles whose characters change** (i.e., the digits of the seconds counter) perform a mechanical flip — the rest of the board remains static.
- Board layout:
  - Row 1: *(blank)*
  - Row 2: `DAY MONTH DATE` (e.g., `TUESDAY APRIL 1`)
  - Row 3: `HH:MM:SS AM/PM` (e.g., ` 3:07:42 PM`)
  - Row 4: `YEAR` (e.g., `2026`, centered)
  - Rows 5–6: *(blank)*

### 5.7 Persistence

- **Draft messages** are saved to `localStorage` after every keystroke and UI change (`solari_drafts`).
- **Play state** (playing/stopped, current message index, loop interval) is saved to `localStorage` (`solari_play_state`).
- On reconnect (phone wakes, tab refocused): if the play state indicates the loop was active for this pair code, it **automatically resumes** from the last message index and loop interval.

---

## 6. Technical Infrastructure

### 6.1 Server

- **Runtime:** Node.js
- **Transport:** WebSockets (`ws` library) — single `/ws` endpoint
- **HTTP:** Express serves static files; one endpoint `/qr/:sessionId` generates the QR code PNG on demand

### 6.2 State Management

- **No database.** All session data lives in server RAM (`Map<sessionId, session>`).
- **Auto-purge:** A background interval runs every 5 minutes and deletes sessions that have had no activity for 24 hours and have no open sockets.

### 6.3 WebSocket Message Protocol

**TV → Server:**
| Message | Purpose |
|---|---|
| `{ type: 'tv_hello', sessionId? }` | Register as a board; resume existing session if ID provided |
| `{ type: 'tv_approve' }` | Approve pending phone connection |
| `{ type: 'tv_reject' }` | Reject pending phone connection |

**Phone → Server:**
| Message | Purpose |
|---|---|
| `{ type: 'phone_hello', pairCode }` | Connect using 6-digit code |
| `{ type: 'phone_send', payload: { rows, mode } }` | Push message rows to TV |
| `{ type: 'phone_next' }` | Signal board to advance (currently handled via phone_send) |
| `{ type: 'phone_reset' }` | Hard reset board |

**Server → Client:**
| Message | Recipient | Purpose |
|---|---|---|
| `{ type: 'tv_paired', sessionId, pairCode }` | TV | Session created or resumed |
| `{ type: 'phone_request' }` | TV | Phone wants to connect |
| `{ type: 'phone_approved' }` | Phone | Connection accepted |
| `{ type: 'phone_rejected' }` | Phone | Connection denied by TV |
| `{ type: 'board_occupied' }` | Phone | Board already has active controller |
| `{ type: 'not_found' }` | Phone | Invalid pair code |
| `{ type: 'display_update', rows }` | TV | New content to display |
| `{ type: 'hard_reset' }` | TV | Blank board, restart demo |
| `{ type: 'disconnected' }` | TV | Phone socket closed |
| `{ type: 'boards_live', count }` | TV + homepage watchers | Live session count |

**Homepage (no session):**
| Message | Direction | Purpose |
|---|---|---|
| `{ type: 'counter_watch' }` | Homepage → Server | Subscribe to live count updates |
| `{ type: 'boards_live', count }` | Server → Homepage | Pushed on any session state change |

### 6.4 Scalability

- WebSocket connections are lightweight; Node.js handles many concurrent connections natively.
- The in-memory model means no DB bottleneck; the 24-hour auto-purge prevents unbounded growth.
- For very high concurrency: the architecture supports horizontal scaling via a shared Redis session store (future consideration; out of scope for v1.0).

---

## 7. Routing

| URL | Page |
|---|---|
| `/` | Homepage (demo + about + CTA) |
| `/board` | Display board (demo → pair → active display) |
| `/controller?code=XXXXXX` | Mobile controller (requires valid pair code) |
| `/qr/:sessionId` | QR code PNG (generated server-side) |
