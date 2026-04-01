# Backlog

## Bug Log

Document bugs encountered during development, their root cause, and how they were resolved.

| # | Description | Root Cause | Resolution | Status |
|---|-------------|------------|------------|--------|
| 1 | `-` character showed as `6` mid-animation | Expected: space→`-` is 43 spool steps × 60ms = 2.58s; screenshot taken at 2s hit index 33 = `6`. Fully settled at 4s. | Not a bug — raised screenshot wait from 1.5s → 4s to confirm. | Resolved |
| 2 | Demo not auto-starting on load | `startDemo()` was only called inside a click-to-start handler | Removed click gate; call `startDemo()` directly in `document.fonts.ready` | Resolved |
| 3 | Tiles showed beige/cream background instead of black with white letters | SplitFlapFont is a stencil/inverse font — glyph fills the tile face, letter is a cutout. Needed light panel background to show through the cutout | Set panel `background: #F5F0E8`; `color: #1a1a1a`; added `space-tile` class to override panels to dark `#1B1B1B` for space/empty tiles | Resolved |
| 4 | Audio had a gap between loop cycles | `<audio loop>` has a browser-level decode/seek gap between loops | Replaced with Web Audio API `AudioBufferSourceNode.loop = true` for truly seamless looping | Resolved |
| 5 | Audio autoplay blocked | Browser blocks AudioContext creation without user gesture | Prefetch raw bytes on load (no gesture needed); create `AudioContext` + decode only after Skip click | Resolved |
| 6 | Color picker broken — inserted color chars converted to letters | Input handler called `.toUpperCase()` before checking `isColorChar()`, converting e.g. `r` → `R` (letter) | Check `isColorChar(ch)` first, only uppercase non-color chars | Resolved |
| 7 | 2-panel animation regression — new char flashed before flip | Refactor pre-loaded new char into visible front panels before CSS sweep | Restored 4-panel architecture: back panels (`.tb`/`.bb`) hold new char at -90°/+90° (invisible); reveal on flip | Resolved |
| 8 | `%` missing from SPOOL | Not included in original scaffold | Added `%` to spool in `public/shared/spool.js` | Resolved |

---

## Known Issues / Tech Debt

Items that are acknowledged but deferred.

| # | Description | Priority |
|---|-------------|----------|
| 1 | Controller preview uses 2-panel tiles (no back panels) — preview animation is instant snap, not a real flip. Low impact since it's a small preview. | Low |
| 2 | Clock mode: only sends update every 1s — if the second hasn't changed (e.g. within the same second), no flip occurs. Correct behavior but could look jittery at transition boundaries. | Low |
| 3 | No reconnection backoff on WebSocket client — reconnects immediately. Could spam server on repeated failures. | Medium |
| 4 | `temporary screenshots/` folder is not gitignored — Puppeteer screenshots will accumulate in git history if committed. Consider adding to `.gitignore`. | Low |
