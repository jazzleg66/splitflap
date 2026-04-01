import {
  initGrid, setTargets, stepAll, snapToTargets,
  isColorChar, COLOR_MAP,
} from '/shared/spool.js';
import WsClient from '/shared/wsClient.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const ROWS = 6;
const COLS = 22;
const FLIP_INTERVAL_MS = 60;
const DEMO_HOLD_MS = 7000;

const DEMO_MESSAGES = [
  [
    ' IMPOSSIBLE IS NOTHING',
    '          - ADIDAS    ',
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
  '     DISCONNECTED     ',
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
const tileEls = [];

let animRunning = false;
let lastFlipTime = 0;
let onSettledCallback = null;

let demoActive = false;
let demoIndex = 0;
let demoTimer = null;

// ── Web Audio API — seamless looping (no gap between loop cycles) ─────────────
let audioCtx    = null;
let audioBuffer = null;
let sourceNode  = null;
let rawAudio    = null;
let audioMuted  = false;
let audioUnlocked = false;

fetch('/assets/audio/split-flap-display.wav')
  .then(r => r.arrayBuffer())
  .then(buf => { rawAudio = buf; })
  .catch(() => {});

// ── Build grid DOM ────────────────────────────────────────────────────────────
function buildGrid() {
  const container = document.createElement('div');
  container.id = 'board-grid';

  for (let r = 0; r < ROWS; r++) {
    tileEls[r] = [];
    for (let c = 0; c < COLS; c++) {
      const tile = document.createElement('div');
      tile.className = 'tile space-tile'; // space until first character is applied
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
    tileEl.classList.remove('space-tile');
    tileEl.style.setProperty('--tile-color', COLOR_MAP[char]);
  } else {
    tileEl.classList.remove('color-tile');
    tileEl.style.removeProperty('--tile-color');
    tileEl.classList.toggle('space-tile', char === ' ');
    tileEl.querySelector('.tf').textContent = char;
    tileEl.querySelector('.tb').textContent = char;
    tileEl.querySelector('.bf').textContent = char;
    tileEl.querySelector('.bb').textContent = char;
  }
}

function renderDirtyTiles(dirtyTiles) {
  for (const { r, c, newChar } of dirtyTiles) {
    const tileEl = tileEls[r][c];

    if (isColorChar(newChar)) {
      tileEl.classList.add('color-tile');
      tileEl.style.setProperty('--tile-color', COLOR_MAP[newChar]);
      continue;
    }

    tileEl.classList.remove('color-tile');
    tileEl.style.removeProperty('--tile-color');

    // Pre-load new char on back panels, then flip — front folds away, back reveals
    tileEl.querySelector('.tb').textContent = newChar;
    tileEl.querySelector('.bb').textContent = newChar;

    tileEl.classList.remove('flipping');
    tileEl.offsetHeight; // force reflow to restart animation
    tileEl.classList.add('flipping');

    tileEl.addEventListener('animationend', () => {
      tileEl.querySelector('.tf').textContent = newChar;
      tileEl.querySelector('.bf').textContent = newChar;
      tileEl.classList.remove('flipping');
      tileEl.classList.toggle('space-tile', newChar === ' ');
    }, { once: true });
  }
}

// ── Animation loop ────────────────────────────────────────────────────────────
function animLoop(timestamp) {
  if (!animRunning) return;

  if (timestamp - lastFlipTime >= FLIP_INTERVAL_MS) {
    const dirty = [];
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++)
        if (grid[r][c].stepsLeft > 0) dirty.push({ r, c });

    const { anyChanged, allSettled } = stepAll(grid);

    if (anyChanged) {
      for (const d of dirty) d.newChar = grid[d.r][d.c].current;
      renderDirtyTiles(dirty);
    }

    if (allSettled) {
      animRunning = false;
      stopAudio();
      if (onSettledCallback) { const cb = onSettledCallback; onSettledCallback = null; cb(); }
      return;
    }
    lastFlipTime = timestamp;
  }

  requestAnimationFrame(animLoop);
}

export function displayRows(targetRows, onSettled) {
  setTargets(grid, targetRows);
  let anyWork = false;
  for (let r = 0; r < ROWS && !anyWork; r++)
    for (let c = 0; c < COLS && !anyWork; c++)
      if (grid[r][c].stepsLeft > 0) anyWork = true;

  if (!anyWork) { if (onSettled) onSettled(); return; }

  onSettledCallback = onSettled || null;
  startAudio();
  if (!animRunning) { animRunning = true; lastFlipTime = 0; requestAnimationFrame(animLoop); }
}

export function snapDisplay(targetRows) {
  setTargets(grid, targetRows);
  snapToTargets(grid);
  animRunning = false;
  onSettledCallback = null;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      applyTileChar(tileEls[r][c], grid[r][c].current);
}

// ── Audio ─────────────────────────────────────────────────────────────────────
async function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (rawAudio) {
    audioBuffer = await audioCtx.decodeAudioData(rawAudio.slice(0));
  }
  // Update mute button now that audio is active
  const btn = document.getElementById('btn-mute');
  btn.textContent = audioMuted ? 'UNMUTE' : 'MUTE';
  btn.classList.remove('audio-locked');
}

function startAudio() {
  if (audioMuted || !audioUnlocked || !audioBuffer || sourceNode) return;
  sourceNode = audioCtx.createBufferSource();
  sourceNode.buffer = audioBuffer;
  sourceNode.loop = true;
  sourceNode.connect(audioCtx.destination);
  sourceNode.start();
}

function stopAudio() {
  if (!sourceNode) return;
  try { sourceNode.stop(); } catch {}
  sourceNode = null;
}

function toggleMute() {
  audioMuted = !audioMuted;
  document.getElementById('btn-mute').textContent = audioMuted ? 'UNMUTE' : 'MUTE';
  if (audioMuted) stopAudio();
}

// ── Demo ──────────────────────────────────────────────────────────────────────
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
  unlockAudio();
  stopDemo();
  demoIndex = (demoIndex + 1) % DEMO_MESSAGES.length;
  startDemo();
}

// ── Pair panel helpers ────────────────────────────────────────────────────────
function showPairPanel(pairCode, sessionId) {
  // Format code as ABC-123
  document.getElementById('pair-code').textContent =
    pairCode.slice(0, 3) + '-' + pairCode.slice(3);
  document.getElementById('qr-img').src = `/qr/${sessionId}`;
  document.getElementById('pair-panel').hidden = false;
}

function hidePairPanel() {
  document.getElementById('pair-panel').hidden = true;
}

// ── WebSocket client ──────────────────────────────────────────────────────────
let sessionId = localStorage.getItem('solari_session_id') || null;

const ws = new WsClient(() => {
  ws.send({ type: 'tv_hello', sessionId });
});

ws.onMessage(msg => {
  switch (msg.type) {
    case 'tv_paired':
      sessionId = msg.sessionId;
      localStorage.setItem('solari_session_id', sessionId);
      showPairPanel(msg.pairCode, msg.sessionId);
      break;

    case 'phone_request':
      hidePairPanel();
      document.getElementById('approval-overlay').hidden = false;
      break;

    case 'phone_approved':
      document.getElementById('approval-overlay').hidden = true;
      hidePairPanel();
      stopDemo();
      displayRows(STANDBY_ROWS);
      break;

    case 'display_update':
      displayRows(msg.rows);
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

// Approve/reject — keyboard and click
function approveConnection() {
  document.getElementById('approval-overlay').hidden = true;
  ws.send({ type: 'tv_approve' });
}
function rejectConnection() {
  document.getElementById('approval-overlay').hidden = true;
  ws.send({ type: 'tv_reject' });
}

window.addEventListener('keydown', e => {
  if (document.getElementById('approval-overlay').hidden) return;
  if (e.key === 'Enter') approveConnection();
  if (e.key === 'Escape') rejectConnection();
});

document.getElementById('btn-approve').addEventListener('click', approveConnection);
document.getElementById('btn-reject').addEventListener('click', rejectConnection);

// ── Controls ──────────────────────────────────────────────────────────────────
// Set initial mute button to locked state (audio not yet unlocked)
document.getElementById('btn-mute').textContent = 'SOUND OFF';
document.getElementById('btn-mute').classList.add('audio-locked');

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

// ── Init ──────────────────────────────────────────────────────────────────────
document.fonts.ready.then(() => {
  buildGrid();
  ws.connect(`ws://${location.host}/ws`);
  startDemo();
});
