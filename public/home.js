// Homepage — demo-only animation + live counter.
// No pairing logic. Imports spool engine and WsClient from shared/.

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

// ── Grid state ────────────────────────────────────────────────────────────────
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
let audioBuffer = null; // decoded AudioBuffer, ready to play
let sourceNode  = null; // currently playing node
let rawAudio    = null; // prefetched ArrayBuffer (fetched without user gesture)
let audioMuted  = false;
let audioUnlocked = false;

// Prefetch raw bytes immediately — doesn't require user gesture
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
    tileEl.offsetHeight; // force reflow
    tileEl.classList.add('flipping');
    pendingFlips++;

    tileEl.addEventListener('animationend', () => {
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

function displayRows(targetRows, onSettled) {
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

function skipDemo() {
  unlockAudio(); // async — fetches context + decodes buffer on first call
  if (demoTimer) clearTimeout(demoTimer);
  demoActive = false;
  demoIndex = (demoIndex + 1) % DEMO_MESSAGES.length;
  startDemo();
}

// ── Live counter via WebSocket (counter_watch — no session created) ───────────
const ws = new WsClient(() => {
  ws.send({ type: 'counter_watch' });
});

ws.onMessage(msg => {
  if (msg.type === 'boards_live') {
    document.getElementById('live-count').textContent = msg.count;
  }
});

// ── Controls ──────────────────────────────────────────────────────────────────
// Set initial mute button to locked state (audio not yet unlocked)
document.getElementById('btn-mute').textContent = 'SOUND OFF';
document.getElementById('btn-mute').classList.add('audio-locked');

document.getElementById('btn-skip').addEventListener('click', skipDemo);
document.getElementById('btn-mute').addEventListener('click', toggleMute);
function toggleFullscreen(element) {
  const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || element.classList.contains('pseudo-fullscreen');

  if (!isFullscreen) {
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen();
    } else {
      // Fallback for iOS iPhone where native fullscreen is unavailable
      element.classList.add('pseudo-fullscreen');
      document.dispatchEvent(new Event('fullscreenchange'));
    }
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else {
      element.classList.remove('pseudo-fullscreen');
      document.dispatchEvent(new Event('fullscreenchange'));
    }
  }
}

document.getElementById('btn-fullscreen').addEventListener('click', () => {
  toggleFullscreen(document.getElementById('hero'));
});

['fullscreenchange', 'webkitfullscreenchange'].forEach(evt => {
  document.addEventListener(evt, () => {
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement || document.getElementById('hero').classList.contains('pseudo-fullscreen'));
    document.getElementById('btn-fullscreen').textContent = isFs ? '\u2715' : '\u26F6';
  });
});

// ── Code Entry Modal ──────────────────────────────────────────────────────────
const VALID_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No O, I, 0, 1
const codeBoxes = document.querySelectorAll('.code-box');
const codeModal = document.getElementById('code-modal');
const codeModalInner = document.getElementById('code-modal-inner');
const codeError = document.getElementById('code-error');
const codeConnectBtn = document.getElementById('code-connect');

// Track the current code being entered
let currentCode = ['', '', '', '', '', ''];

function openModal() {
  codeModal.classList.remove('hidden');
  resetModal();
  codeBoxes[0].focus();
}

function closeModal() {
  codeModal.classList.add('hidden');
  resetModal();
}

function resetModal() {
  currentCode = ['', '', '', '', '', ''];
  codeBoxes.forEach(box => {
    box.value = '';
    box.classList.remove('filled', 'invalid');
  });
  codeError.classList.add('hidden');
  codeConnectBtn.disabled = true;
}

function isValidCodeChar(char) {
  return VALID_CODE_CHARS.includes(char.toUpperCase());
}

function updateBoxDisplay(index) {
  const box = codeBoxes[index];
  box.classList.toggle('filled', currentCode[index] !== '');
}

function updateConnectButton() {
  const isFull = currentCode.every(c => c !== '');
  codeConnectBtn.disabled = !isFull;
}

function setCodeChar(index, char) {
  if (index < 0 || index >= 6) return;
  currentCode[index] = char.toUpperCase();
  codeBoxes[index].value = currentCode[index];
  updateBoxDisplay(index);
  updateConnectButton();
}

function advanceBox(index) {
  if (index < 5) {
    codeBoxes[index + 1].focus();
  }
}

function backtrackBox(index) {
  if (index > 0) {
    codeBoxes[index - 1].focus();
  }
}

// Handle typing in code boxes
codeBoxes.forEach((box, index) => {
  box.addEventListener('keydown', (e) => {
    const char = e.key.toUpperCase();

    if (e.key === 'Backspace') {
      e.preventDefault();
      if (currentCode[index]) {
        setCodeChar(index, '');
        updateConnectButton();
      } else if (index > 0) {
        setCodeChar(index - 1, '');
        codeBoxes[index - 1].focus();
      }
      return;
    }

    if (e.key === 'Delete') {
      e.preventDefault();
      setCodeChar(index, '');
      updateConnectButton();
      return;
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      backtrackBox(index);
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      advanceBox(index);
      return;
    }

    if (e.key === 'Home') {
      e.preventDefault();
      codeBoxes[0].focus();
      return;
    }

    if (e.key === 'End') {
      e.preventDefault();
      codeBoxes[5].focus();
      return;
    }

    // Printable characters
    if (char.length === 1 && /[A-Z0-9\-]/.test(char)) {
      e.preventDefault();

      // Skip dashes
      if (char === '-') {
        advanceBox(index);
        return;
      }

      if (!isValidCodeChar(char)) {
        // Flash error on this box
        box.classList.add('invalid');
        codeError.classList.remove('hidden');
        setTimeout(() => box.classList.remove('invalid'), 500);
        setTimeout(() => codeError.classList.add('hidden'), 2000);
        return;
      }

      setCodeChar(index, char);
      advanceBox(index);
    }
  });

  // Handle paste
  box.addEventListener('paste', (e) => {
    e.preventDefault();
    const paste = (e.clipboardData || window.clipboardData).getData('text');
    const cleaned = paste.replace(/-/g, '').toUpperCase();

    let boxIdx = index;
    for (let i = 0; i < cleaned.length && boxIdx < 6; i++) {
      const char = cleaned[i];
      if (isValidCodeChar(char)) {
        setCodeChar(boxIdx, char);
        boxIdx++;
      }
    }
    updateConnectButton();

    if (boxIdx < 6) {
      codeBoxes[boxIdx].focus();
    }
  });

  // Also handle input event for programmatic changes (e.g., from paste via execCommand)
  box.addEventListener('input', (e) => {
    let value = box.value.toUpperCase().trim();

    // If multiple characters pasted, try to distribute them
    if (value.length > 1) {
      value = value.replace(/-/g, '');
      let boxIdx = index;
      for (let i = 0; i < value.length && boxIdx < 6; i++) {
        const char = value[i];
        if (isValidCodeChar(char)) {
          setCodeChar(boxIdx, char);
          boxIdx++;
        }
      }
      updateConnectButton();
      if (boxIdx < 6) {
        codeBoxes[boxIdx].focus();
      }
    } else if (value.length === 1) {
      // Single character - validate and advance
      if (!isValidCodeChar(value)) {
        box.classList.add('invalid');
        codeError.classList.remove('hidden');
        setTimeout(() => box.classList.remove('invalid'), 500);
        setTimeout(() => codeError.classList.add('hidden'), 2000);
        box.value = '';
        return;
      }
      setCodeChar(index, value);
      if (value) advanceBox(index);
    } else {
      // Empty
      currentCode[index] = '';
      updateBoxDisplay(index);
      updateConnectButton();
    }
  });

  // Handle click to focus
  box.addEventListener('click', () => {
    box.focus();
  });
});

// Modal controls
document.getElementById('cta-enter-code').addEventListener('click', openModal);
document.getElementById('demo-enter-code').addEventListener('click', openModal);
document.getElementById('code-modal-close').addEventListener('click', closeModal);

// Close on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !codeModal.classList.contains('hidden')) {
    closeModal();
  }
});

// Close on backdrop click (click outside modal)
codeModal.addEventListener('click', (e) => {
  if (e.target === codeModal) {
    closeModal();
  }
});

// Connect button handler
codeConnectBtn.addEventListener('click', () => {
  const code = currentCode.join('');
  if (code.length === 6) {
    location.href = `/controller?code=${code}`;
  }
});

// ── Tile sizing — sync font-size and translateY to actual rendered tile height ─
// CSS container queries (cqi/cqh) have cross-browser inconsistencies when the
// tile height comes from aspect-ratio. ResizeObserver gives exact pixel values.
let boardGridEl = null;
function syncTileSizing() {
  const tile = tileEls[0]?.[0];
  if (!tile) return;
  const h = tile.getBoundingClientRect().height;
  if (h === 0) return;
  if (!boardGridEl) {
    boardGridEl = document.getElementById('board-grid');
  }
  boardGridEl.style.setProperty('--tile-fs', h + 'px');
  boardGridEl.style.setProperty('--tile-ty', (h / 4) + 'px');
}

// ── Rotating headline word ────────────────────────────────────────────────────
// Cycles the animated word in #word-strip with a split-flap style transition:
// current word falls out downward, next drops in from above.
(function initWordRotation() {
  const words = [...document.querySelectorAll('.rotating-word')];
  if (!words.length) return;

  let activeIdx = words.findIndex(w => w.classList.contains('active'));
  if (activeIdx === -1) { words[0].classList.add('active'); activeIdx = 0; }

  setInterval(() => {
    const nextIdx = (activeIdx + 1) % words.length;

    // Exit current
    words[activeIdx].classList.remove('active');
    words[activeIdx].classList.add('exiting');

    // Reset next to top (no transition), then animate in
    words[nextIdx].classList.remove('exiting');
    // Force style recalc so the snap-to-top is applied before adding active
    void words[nextIdx].offsetHeight;
    words[nextIdx].classList.add('active');

    // Clean up exiting class after its transition ends (~380ms)
    const prev = activeIdx;
    setTimeout(() => words[prev].classList.remove('exiting'), 420);

    activeIdx = nextIdx;
  }, 2400);
}());

// ── Init ──────────────────────────────────────────────────────────────────────
document.fonts.ready.then(() => {
  buildGrid();
  syncTileSizing();
  new ResizeObserver(syncTileSizing).observe(document.getElementById('board-grid'));
  ws.connect(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  startDemo();
});
