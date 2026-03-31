import {
  SPOOL, initGrid, setTargets, stepAll, snapToTargets,
  isColorChar, COLOR_MAP,
} from '/shared/spool.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const ROWS = 6;
const COLS = 22;
const FLIP_INTERVAL_MS = 60; // ms between spool steps (mechanical cadence)
const DEMO_HOLD_MS = 7000;   // pause between demo messages after settling

// ── Demo messages (each row padded to exactly 22 chars) ───────────────────────
const DEMO_MESSAGES = [
  [
    ' IMPOSSIBLE IS NOTHING',
    '         - ADIDAS     ',
    '                      ',
    '                      ',
    '                      ',
    '                      ',
  ],
  [
    'IN REAL LIFE, I ASSURE',
    "YOU, THERE IS NO SUCH ",
    'THING AS ALGEBRA.     ',
    '                      ',
    '    - FRAN LEBOWITZ   ',
    '                      ',
  ],
  [
    '                      ',
    '  SCAN THE QR CODE    ',
    '    AND TRY YOURSELF  ',
    '                      ',
    '                      ',
    '                      ',
  ],
];

const DISCONNECTED_ROWS = [
  '                      ',
  '                      ',
  '    DISCONNECTED      ',
  '                      ',
  '                      ',
  '                      ',
];

const STANDBY_ROWS = [
  '                      ',
  '                      ',
  '   DEVICE CONNECTED   ',
  '                      ',
  '                      ',
  '                      ',
];

// ── State ─────────────────────────────────────────────────────────────────────
const grid = initGrid(ROWS, COLS);
const tileEls = []; // tileEls[row][col] → DOM element

let animRunning = false;
let lastFlipTime = 0;
let onSettledCallback = null;

// Demo
let demoActive = false;
let demoIndex = 0;
let demoTimer = null;

// Audio
const sfx = document.getElementById('sfx');
let audioMuted = false;
let audioUnlocked = false;

// ── DOM: build 6×22 grid ──────────────────────────────────────────────────────
function buildGrid() {
  const container = document.createElement('div');
  container.id = 'board-grid';

  for (let r = 0; r < ROWS; r++) {
    tileEls[r] = [];
    for (let c = 0; c < COLS; c++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.dataset.row = r;
      tile.dataset.col = c;

      // Four panels: top-front, top-back, bottom-front, bottom-back
      tile.innerHTML = `
        <div class="tile-top">
          <span class="tile-char tf"> </span>
          <span class="tile-char tb"> </span>
        </div>
        <div class="tile-bottom">
          <span class="tile-char bf"> </span>
          <span class="tile-char bb"> </span>
        </div>`;

      container.appendChild(tile);
      tileEls[r][c] = tile;
    }
  }

  document.getElementById('board-container').appendChild(container);
}

// ── Rendering ─────────────────────────────────────────────────────────────────
function applyTileChar(tileEl, char) {
  if (isColorChar(char)) {
    tileEl.classList.add('color-tile');
    tileEl.style.setProperty('--tile-color', COLOR_MAP[char]);
  } else {
    tileEl.classList.remove('color-tile');
    tileEl.style.removeProperty('--tile-color');
    // Update all four panels to current char content
    tileEl.querySelector('.tf').textContent = char;
    tileEl.querySelector('.tb').textContent = char;
    tileEl.querySelector('.bf').textContent = char;
    tileEl.querySelector('.bb').textContent = char;
  }
}

function renderDirtyTiles(dirtyTiles) {
  // dirtyTiles: array of { r, c, prevChar, newChar }
  for (const { r, c, newChar } of dirtyTiles) {
    const tileEl = tileEls[r][c];

    if (isColorChar(newChar)) {
      tileEl.classList.add('color-tile');
      tileEl.style.setProperty('--tile-color', COLOR_MAP[newChar]);
      continue;
    }

    tileEl.classList.remove('color-tile');
    tileEl.style.removeProperty('--tile-color');

    // Set back panels to new char, trigger flip
    tileEl.querySelector('.tb').textContent = newChar;
    tileEl.querySelector('.bb').textContent = newChar;
    tileEl.classList.remove('flipping'); // reset in case of re-trigger

    // Force reflow so the class removal registers before re-adding
    // eslint-disable-next-line no-unused-expressions
    tileEl.offsetHeight;

    tileEl.classList.add('flipping');

    // After animation completes, swap front panels to new char
    const onEnd = () => {
      tileEl.classList.remove('flipping');
      tileEl.querySelector('.tf').textContent = newChar;
      tileEl.querySelector('.bf').textContent = newChar;
      tileEl.removeEventListener('animationend', onEnd);
    };
    tileEl.addEventListener('animationend', onEnd, { once: true });
  }
}

// ── Animation loop ────────────────────────────────────────────────────────────
function animLoop(timestamp) {
  if (!animRunning) return;

  if (timestamp - lastFlipTime >= FLIP_INTERVAL_MS) {
    // Collect tiles that will change this step
    const dirtyTiles = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (grid[r][c].stepsLeft > 0) {
          dirtyTiles.push({ r, c, newChar: null }); // newChar filled after stepAll
        }
      }
    }

    const { anyChanged, allSettled } = stepAll(grid);

    if (anyChanged) {
      // Fill in newChar after stepping
      for (const d of dirtyTiles) {
        d.newChar = grid[d.r][d.c].current;
      }
      renderDirtyTiles(dirtyTiles);
    }

    if (allSettled) {
      animRunning = false;
      stopAudio();
      if (onSettledCallback) {
        const cb = onSettledCallback;
        onSettledCallback = null;
        cb();
      }
      return;
    }

    lastFlipTime = timestamp;
  }

  requestAnimationFrame(animLoop);
}

// ── Public: display target rows ───────────────────────────────────────────────
export function displayRows(targetRows, onSettled) {
  setTargets(grid, targetRows);

  // Check if anything actually needs to move
  let anyWork = false;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c].stepsLeft > 0) { anyWork = true; break; }
    }
    if (anyWork) break;
  }

  if (!anyWork) {
    if (onSettled) onSettled();
    return;
  }

  onSettledCallback = onSettled || null;
  startAudio();

  if (!animRunning) {
    animRunning = true;
    lastFlipTime = 0;
    requestAnimationFrame(animLoop);
  }
}

// Instantly snap grid to target (no animation) — used for hard reset
export function snapDisplay(targetRows) {
  setTargets(grid, targetRows);
  snapToTargets(grid);
  animRunning = false;
  onSettledCallback = null;
  // Re-render all tiles
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      applyTileChar(tileEls[r][c], grid[r][c].current);
    }
  }
}

// ── Audio ─────────────────────────────────────────────────────────────────────
function startAudio() {
  if (audioMuted || !audioUnlocked) return;
  sfx.play().catch(() => {});
}

function stopAudio() {
  sfx.pause();
}

function toggleMute() {
  audioMuted = !audioMuted;
  const btn = document.getElementById('btn-mute');
  btn.textContent = audioMuted ? 'UNMUTE' : 'MUTE';
  if (audioMuted) stopAudio();
}

// ── Demo mode ─────────────────────────────────────────────────────────────────
function startDemo() {
  demoActive = true;
  showDemoMessage();
}

function showDemoMessage() {
  if (!demoActive) return;
  displayRows(DEMO_MESSAGES[demoIndex], () => {
    if (!demoActive) return;
    demoTimer = setTimeout(() => {
      demoIndex = (demoIndex + 1) % DEMO_MESSAGES.length;
      showDemoMessage();
    }, DEMO_HOLD_MS);
  });
}

function stopDemo() {
  demoActive = false;
  if (demoTimer) { clearTimeout(demoTimer); demoTimer = null; }
}

function skipDemo() {
  stopDemo();
  demoIndex = (demoIndex + 1) % DEMO_MESSAGES.length;
  startDemo();
}

// ── WebSocket client ──────────────────────────────────────────────────────────
import WsClient from '/shared/wsClient.js';

let sessionId = localStorage.getItem('solari_session_id') || null;
const ws = new WsClient(() => {
  // Called on (re)connect — send hello
  ws.send({ type: 'tv_hello', sessionId });
});

ws.onMessage(msg => {
  switch (msg.type) {
    case 'tv_paired':
      sessionId = msg.sessionId;
      localStorage.setItem('solari_session_id', sessionId);
      showPairCode(msg.pairCode);
      showQR(sessionId);
      break;

    case 'phone_request':
      document.getElementById('approval-overlay').hidden = false;
      break;

    case 'phone_approved':
      // Phone connected — stop demo, show standby
      stopDemo();
      document.getElementById('approval-overlay').hidden = true;
      displayRows(STANDBY_ROWS);
      break;

    case 'display_update':
      displayRows(msg.rows);
      break;

    case 'phone_next':
      // TV-side multi-message is managed by phone; nothing to do here
      break;

    case 'hard_reset':
      snapDisplay(Array(6).fill('                      '));
      setTimeout(startDemo, 500);
      break;

    case 'disconnected':
      displayRows(DISCONNECTED_ROWS, () => {
        setTimeout(startDemo, 10000);
      });
      break;

    case 'boards_live':
      document.getElementById('live-count').textContent = msg.count;
      break;
  }
});

// Keyboard: approve/reject
window.addEventListener('keydown', e => {
  const overlay = document.getElementById('approval-overlay');
  if (overlay.hidden) return;
  if (e.key === 'Enter') { overlay.hidden = true; ws.send({ type: 'tv_approve' }); }
  if (e.key === 'Escape') { overlay.hidden = true; ws.send({ type: 'tv_reject' }); }
});

// ── Pair panel helpers ────────────────────────────────────────────────────────
function showPairCode(code) {
  // Format as ABC-123
  document.getElementById('pair-code').textContent =
    code.slice(0, 3) + '-' + code.slice(3);
}

function showQR(sid) {
  const img = document.getElementById('qr-img');
  img.src = `/qr/${sid}`;
  img.hidden = false;
}

// ── Controls ──────────────────────────────────────────────────────────────────
document.getElementById('btn-skip').addEventListener('click', skipDemo);
document.getElementById('btn-mute').addEventListener('click', toggleMute);
document.getElementById('btn-fullscreen').addEventListener('click', () => {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
});
document.addEventListener('fullscreenchange', () => {
  document.getElementById('btn-fullscreen').textContent =
    document.fullscreenElement ? '\u2715' : '\u26F6';
});

// ── Audio unlock + init ───────────────────────────────────────────────────────
const clickToStart = document.getElementById('click-to-start');
clickToStart.addEventListener('pointerdown', () => {
  audioUnlocked = true;
  clickToStart.remove();
  sfx.play().then(() => sfx.pause()).catch(() => {});
  startDemo();
}, { once: true });

// Wait for font before building grid
document.fonts.ready.then(() => {
  buildGrid();
  ws.connect(`ws://${location.host}/ws`);
});
