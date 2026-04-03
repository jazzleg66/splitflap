# Backlog

## Bug Log

Document bugs encountered during development, their root cause, and how they were resolved.

| # | Description | Root Cause | Resolution | Status |
|---|-------------|------------|------------|--------|
| 1 | `-` character showed as `6` mid-animation | Expected: space→`-` is 43 spool steps × 60ms = 2.58s; screenshot taken at 2s hit index 33 = `6`. Fully settled at 4s. | Not a bug — raised screenshot wait from 1.5s → 4s to confirm. | Resolved |
| 2 | Demo not auto-starting on load | `startDemo()` was only called inside a click-to-start handler | Removed click gate; call `startDemo()` directly in `document.fonts.ready` | Resolved |
| 3 | Tiles showed beige/cream background instead of black with white letters | SplitFlapTV-Regular is a stencil/inverse font — glyph fills the tile face, letter is a cutout. Cream panel background bled around glyph bounds. | Switched to `SplitFlapTVBlackLine-Regular` font with direct white characters on black panels. No stencil tricks needed. | Resolved |
| 4 | Audio had a gap between loop cycles | `<audio loop>` has a browser-level decode/seek gap between loops | Replaced with Web Audio API `AudioBufferSourceNode.loop = true` for truly seamless looping | Resolved |
| 5 | Audio autoplay blocked | Browser blocks AudioContext creation without user gesture | Prefetch raw bytes on load (no gesture needed); create `AudioContext` + decode only after Skip click | Resolved |
| 6 | Color picker broken — inserted color chars converted to letters | Input handler called `.toUpperCase()` before checking `isColorChar()`, converting e.g. `r` → `R` (letter) | Check `isColorChar(ch)` first, only uppercase non-color chars | Resolved |
| 7 | 2-panel animation regression — new char flashed before flip | Refactor pre-loaded new char into visible front panels before CSS sweep | Restored 4-panel architecture: back panels (`.tb`/`.bb`) hold new char at -90°/+90° (invisible); reveal on flip | Resolved |
| 8 | `%` missing from SPOOL | Not included in original scaffold | Added `%` to spool in `public/shared/spool.js` | Resolved |
| 9 | Numbers and special characters showed 2 glyphs per tile | `SplitFlapTV-Regular` (stencil font) renders number/special glyphs at double advance width | Switched to `SplitFlapTVBlackLine-Regular` — single-width glyphs for all characters | Resolved |
| 10 | Characters too small relative to tile / same size as color cards | `font-size: 1.5rem` only fills 50% of tile height. `translateY(50%)` incorrect for larger font sizes. | Set `font-size: 3rem` (= tile height) and `translateY(0.75rem)` = panel_height/2 (absolute). Characters now fill the full tile. | Resolved |
| 17 | Audio stopped at spool-settle, not at last visual flap — sound cut out ~60ms early | `stopAudio()` called when `allSettled` (spool state done) but last CSS flip animations still in flight | Added `pendingFlips` counter: incremented per flip start, decremented in `animationend`; audio stops when `pendingFlips === 0 && !animRunning` | Resolved |
| 18 | Board page tiles fixed at `2.2rem` — did not scale responsively like homepage | Board page had no responsive tile-sizing CSS or `syncTileSizing` JS | Added `width:100%; aspect-ratio:2.2/3` override in `board.css` and `syncTileSizing` + `ResizeObserver` in `board.js` | Resolved |
| 19 | Homepage hero and board page had dark `#1B1B1B` background — board hard to distinguish from page chrome | Design decision: white page, dark board for contrast | Set `background: #ffffff` on `#hero` (home.css) and `body` (board.css); updated text/button colors for legibility on white | Resolved |
| 20 | Audio WAV file outdated — new `split-flap.wav` uploaded | Old file `split-flap-display.wav` referenced in both `home.js` and `board.js` | Updated fetch path in both files to `/assets/audio/split-flap.wav` | Resolved |
| 15 | Space tiles rendered cream/white instead of dark | `SplitFlapTVBlackLine-Regular` space glyph fills the em-square with CSS `color` (#FFFFFF) → visible cream box on dark panel | Set `textContent = ''` (empty string) for spaces via `renderChar` helper; empty span → no glyph painted → dark panel shows | Resolved |
| 16 | Character tiles inverted (white face, dark letterforms) instead of dark face with white characters | `SplitFlapTVBlackLine-Regular` is stencil/inverse: `color` fills em-square; letterforms are transparent cutouts. Setting `color: #FFFFFF` makes the fill white. | Set `color: #1B1B1B` + add white backing via CSS `:has(.tile-char:not(:empty))` on panels; dark glyph covers full panel, cutouts reveal white → white chars on dark tile | Resolved |
| 11 | Approval overlay keyboard-only — blocks touch/mouse TVs | Only `keydown` listener wired | Added APPROVE/REJECT buttons with green/red hover states; click handlers alongside keyboard | Resolved |
| 12 | Mute button misleading before audio unlock | `[MUTE]` label shown even when audio never started | Shows `SOUND OFF` (dimmed, non-interactive) until Skip unlocks audio; updates to `MUTE` after unlock | Resolved |
| 13 | iOS Safari: footer hidden behind home indicator | Fixed `bottom: 0` doesn't account for safe area | Added `env(safe-area-inset-bottom)` to footer height and body padding; `viewport-fit=cover` in meta tag | Resolved |
| 14 | iOS Safari: input tap zooms the page | Input `font-size < 16px` triggers iOS auto-zoom | Set `font-size: 16px` on `.row-input` for mobile; reverts to `0.72rem` at ≥480px | Resolved |

---

## Known Issues / Tech Debt

Items that are acknowledged but deferred.

| # | Description | Priority |
|---|-------------|----------|
| 1 | Controller preview uses 2-panel tiles (no back panels) — preview animation is instant snap, not a real flip. Low impact since it's a small preview. | Low |
| 2 | Clock mode: only sends update every 1s — if the second hasn't changed (e.g. within the same second), no flip occurs. Correct behavior but could look jittery at transition boundaries. | Low |
| 3 | No reconnection backoff on WebSocket client — reconnects immediately. Could spam server on repeated failures. | Medium |
| 4 | Real-device pairing: Windows Firewall blocks inbound port 3000 by default — phones on the same LAN can't reach the server. `getLanHost` correctly encodes the LAN IP; the blocker is OS firewall. Fix: `netsh advfirewall firewall add rule name="Digital Solari :3000" protocol=TCP dir=in localport=3000 action=allow` (requires admin). | High |
