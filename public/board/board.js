import {
  initGrid, setTargets, stepAll, snapToTargets,
  isColorChar, COLOR_MAP,
} from '/shared/spool.js';
import WsClient from '/shared/wsClient.js';

// ── WebSocket ─────────────────────────────────────────────────────────────────
let sessionId = null;
const ws = new WsClient(() => {
  ws.send({ type: 'tv_hello', sessionId });
});
ws.connect(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);

// ── Constants ─────────────────────────────────────────────────────────────────
const ROWS = 6;
const COLS = 22;
const FLIP_INTERVAL_MS = 60;
const DEMO_HOLD_MS = 7000;

const DEMO_MESSAGES = [
  [
    '                      ',
    '                      ',
    'r   ROSES ARE RED    r',
    'b  VIOLETS ARE BLUE  b',
    '                      ',
    '                      ',
  ],
  [
    '                      ',
    'IN REAL LIFE, I ASSURE',
    "YOU, THERE IS NO SUCH ",
    'THING AS ALGEBRA.     ',
    '    - FRAN LEBOWITZ   ',
    '                      ',
  ],
  [
    'gggggggggggggggggggggg',
    'gbbbbbbbbbbbbbbbbbbbbg',
    'gb SCAN THE QR CODE bg',
    'gb  TRY IT YOURSELF bg',
    'gbbbbbbbbbbbbbbbbbbbbg',
    'gggggggggggggggggggggg',
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
let pendingFlips = 0; // CSS animations in flight; audio stops when this reaches 0 after settling

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

fetch('/assets/audio/split-flap.wav')
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
      tile.className = 'tile space-tile';
      tile.innerHTML = `
        <div class="tile-top">
          <div class="top-half-static"><span class="tile-char"></span></div>
          <div class="bottom-flap-animating"><span class="tile-char"></span></div>
          <div class="top-flap-animating"><span class="tile-char"></span></div>
        </div>
        <div class="tile-bottom">
          <div class="bottom-half-static"><span class="tile-char"></span></div>
        </div>`;
      container.appendChild(tile);
      tileEls[r][c] = tile;
    }
  }

  document.getElementById('board-container').appendChild(container);
}

// ── Rendering ─────────────────────────────────────────────────────────────────
// Space glyph in SplitFlapTVBlackLine renders cream — use empty string instead.
const renderChar = ch => (ch === ' ' ? '' : ch);

function applyTileChar(tileEl, char) {
  if (isColorChar(char)) {
    tileEl.classList.add('color-tile');
    tileEl.classList.remove('space-tile');
    tileEl.style.setProperty('--tile-color', COLOR_MAP[char]);
  } else {
    tileEl.classList.remove('color-tile');
    tileEl.style.removeProperty('--tile-color');
    tileEl.classList.toggle('space-tile', char === ' ');
    tileEl.classList.toggle('degree-tile', char === '°');
    tileEl.querySelector('.top-half-static .tile-char').textContent = renderChar(char);
    tileEl.querySelector('.top-flap-animating .tile-char').textContent = renderChar(char);
    tileEl.querySelector('.bottom-flap-animating .tile-char').textContent = renderChar(char);
    tileEl.querySelector('.bottom-half-static .tile-char').textContent = renderChar(char);
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

    // Snap bottom half to next char immediately — static, no animation
    tileEl.querySelector('.bottom-half-static .tile-char').textContent = renderChar(newChar);
    // Pre-load next char behind the falling top flap (starts edge-on, unfolds)
    tileEl.querySelector('.bottom-flap-animating .tile-char').textContent = renderChar(newChar);
    // .top-flap-animating already holds the current char from the previous settle

    tileEl.classList.remove('flipping');
    tileEl.offsetHeight; // force reflow to restart animation
    tileEl.classList.add('flipping');
    pendingFlips++;

    tileEl.addEventListener('animationend', () => {
      // Snap top panels to new char; the flap is now flat showing newChar
      tileEl.querySelector('.top-half-static .tile-char').textContent = renderChar(newChar);
      tileEl.querySelector('.top-flap-animating .tile-char').textContent = renderChar(newChar);
      tileEl.classList.remove('flipping');
      tileEl.classList.toggle('space-tile', newChar === ' ');
      tileEl.classList.toggle('degree-tile', newChar === '°');
      pendingFlips--;
      if (pendingFlips === 0 && !animRunning) stopAudio();
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
      if (pendingFlips === 0) stopAudio(); // no animations in flight — stop immediately
      // else: last animationend handler stops audio when the final flap lands
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
    if (animRunning) startAudio(); // board already flipping — start audio now that buffer is ready
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
  if (typeof posthog !== 'undefined') posthog.capture('board_mute_toggled', { muted: audioMuted });
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
  // Track demo skip event
  if (typeof posthog !== 'undefined') posthog.capture('board_demo_skipped');
}

// ── QR screen helpers ─────────────────────────────────────────────────────────
function showQrScreen(pairCode, sessionId) {
  document.getElementById('pair-code').textContent =
    pairCode.slice(0, 3) + '-' + pairCode.slice(3);

  const qrImg = document.getElementById('qr-img');
  const qrLoading = document.getElementById('qr-loading');
  const qrUrl = `/qr/${sessionId}`;

  // Show loading spinner and hide image
  qrLoading.classList.remove('hidden');
  qrImg.classList.remove('loaded');

  // Add error handling for QR image load failures
  qrImg.onerror = () => {
    console.error(`[board] Failed to load QR image from ${qrUrl}`);
    qrLoading.classList.add('hidden');
    qrImg.style.border = '2px solid rgba(200, 50, 50, 0.5)';
  };

  qrImg.onload = () => {
    console.log(`[board] QR image loaded successfully from ${qrUrl}`);
    qrLoading.classList.add('hidden');
    qrImg.classList.add('loaded');
    qrImg.style.border = 'none';
  };

  // Pre-fetch the QR image to warm the cache on both server and browser
  // This is especially important for Safari which can be slow at generating QR codes
  fetch(qrUrl, { priority: 'high' }).catch(() => {});

  qrImg.src = qrUrl;
  document.getElementById('qr-screen').classList.remove('hidden');
  document.body.classList.remove('board-active');
}

function hideQrScreen() {
  document.getElementById('qr-screen').classList.add('hidden');
  document.body.classList.add('board-active');
  // Trigger ResizeObserver so tile sizing recalculates for the new board dimensions
  syncTileSizing();
}

// ── WebSocket client ──────────────────────────────────────────────────────────
let lastPairCode = null;

ws.onMessage(msg => {
  switch (msg.type) {
    case 'tv_paired':
      sessionId = msg.sessionId;
      lastPairCode = msg.pairCode;
      showQrScreen(msg.pairCode, msg.sessionId);
      break;

    case 'phone_request':
      // Auto-approve — QR code itself is the security token
      unlockAudio();
      ws.send({ type: 'tv_approve' });
      break;

    case 'phone_approved':
      document.getElementById('approval-overlay').hidden = true;
      hideQrScreen();
      stopDemo();
      displayRows(STANDBY_ROWS);
      document.getElementById('conn-dot').className = 'connected';
      if (typeof posthog !== 'undefined') posthog.capture('board_connected');
      document.getElementById('conn-dot').setAttribute('aria-label', 'Connected');
      break;

    case 'display_update':
      displayRows(msg.rows);
      break;

    case 'hard_reset':
      snapDisplay(Array(6).fill('                      '));
      setTimeout(startDemo, 500);
      break;

    case 'disconnected':
      stopDemo();
      displayRows(DISCONNECTED_ROWS);
      document.getElementById('conn-dot').className = 'disconnected';
      document.getElementById('conn-dot').setAttribute('aria-label', 'Disconnected');
      break;

    case 'boards_live':
      document.getElementById('live-count').textContent = msg.count;
      break;
  }
});

// Approve/reject — keyboard and click
function approveConnection() {
  unlockAudio();
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
function toggleFullscreen(element) {
  const isFs = document.fullscreenElement || document.webkitFullscreenElement || element.classList.contains('pseudo-fullscreen');

  if (!isFs) {
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen();
    } else {
      element.classList.add('pseudo-fullscreen');
      document.dispatchEvent(new Event('fullscreenchange'));
    }
    if (typeof posthog !== 'undefined') posthog.capture('board_fullscreen_enabled');
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else {
      element.classList.remove('pseudo-fullscreen');
      document.dispatchEvent(new Event('fullscreenchange'));
    }
    if (typeof posthog !== 'undefined') posthog.capture('board_fullscreen_disabled');
  }
}

document.getElementById('btn-fullscreen').addEventListener('click', () => {
  toggleFullscreen(document.body);
});

['fullscreenchange', 'webkitfullscreenchange'].forEach(evt => {
  document.addEventListener(evt, () => {
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.body.classList.contains('pseudo-fullscreen'));
    document.getElementById('btn-fullscreen').textContent = isFs ? '\u2715' : '\u26F6';
  });
});

// ── Tile sizing — sync font-size and translateY to actual rendered tile height ─
function syncTileSizing() {
  const tile = tileEls[0]?.[0];
  if (!tile) return;
  const h = tile.getBoundingClientRect().height;
  if (h === 0) return;
  const boardGrid = document.getElementById('board-grid');
  boardGrid.style.setProperty('--tile-fs', h + 'px');
  boardGrid.style.setProperty('--tile-ty', (h / 4) + 'px');
}

// ── Init ──────────────────────────────────────────────────────────────────────
// ── Manual code reveal ────────────────────────────────────────────────────────
document.getElementById('btn-show-code').addEventListener('click', () => {
  const code = document.getElementById('pair-code');
  const btn  = document.getElementById('btn-show-code');
  code.hidden = !code.hidden;
  btn.textContent = code.hidden ? 'ENTER CODE MANUALLY' : 'HIDE CODE';
});

document.fonts.ready.then(() => {
  buildGrid();
  syncTileSizing();
  new ResizeObserver(syncTileSizing).observe(document.getElementById('board-grid'));
  // Board starts hidden behind #qr-screen; demo only runs after phone approval
});

// Unlock audio on first user interaction so phone-connect flip has sound
document.addEventListener('click', function _unlock() {
  unlockAudio();
  document.removeEventListener('click', _unlock);
});
