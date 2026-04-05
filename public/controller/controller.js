import {
  SPOOL, initGrid, setTargets, snapToTargets,
  isColorChar, COLOR_MAP,
} from '/shared/spool.js';
import WsClient from '/shared/wsClient.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const ROWS = 6;
const COLS = 22;
const MAX_MESSAGES = 10;
const DEFAULT_LOOP_S = 7;
const NEXT_DEBOUNCE_MS = 1500;

// Default message set — shown on first load (no saved drafts)
// Bump DEFAULT_VERSION whenever DEFAULT_MESSAGES changes to clear stale drafts
const DEFAULT_VERSION = 2;
const DEFAULT_MESSAGES = () => ([{
  rows: [
    '                      ',
    '                      ',
    '     HELLO WORLD!     ',
    '                      ',
    '                      ',
    '                      ',
  ],
}]);

const STANDBY_ROWS = [
  '                      ',
  '                      ',
  '   DEVICE CONNECTED   ',
  '                      ',
  '                      ',
  '                      ',
];

const DAY_NAMES   = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
const MONTH_NAMES = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                     'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

// ── State ─────────────────────────────────────────────────────────────────────
let messages           = DEFAULT_MESSAGES();
let activeMessageIndex = 0;
let loopInterval       = DEFAULT_LOOP_S;
let isPlaying          = false;
let playIndex          = 0;
let playTimer          = null;
let currentMode        = 'message';
let clockTimer         = null;
let focusedInput       = null;
let currentPairCode    = '';
let nextDebouncing     = false;

// Preview grid
const previewGrid    = initGrid(ROWS, COLS);
const previewTileEls = [];

// ── Persistence ───────────────────────────────────────────────────────────────
function saveDrafts() {
  localStorage.setItem('solari_drafts', JSON.stringify({
    version: DEFAULT_VERSION, messages, activeMessageIndex, loopInterval, currentMode,
  }));
}

function savePlayState(playing, index) {
  localStorage.setItem('solari_play_state', JSON.stringify({
    wasPlaying: playing, playIndex: index, loopInterval, pairCode: currentPairCode,
  }));
}

function loadDrafts() {
  try {
    const raw = localStorage.getItem('solari_drafts');
    if (!raw) return;
    const d = JSON.parse(raw);
    if (d.version !== DEFAULT_VERSION) { localStorage.removeItem('solari_drafts'); return; }
    if (Array.isArray(d.messages) && d.messages.length) messages = d.messages;
    activeMessageIndex = Math.min(d.activeMessageIndex ?? 0, messages.length - 1);
    loopInterval       = d.loopInterval ?? DEFAULT_LOOP_S;
    currentMode        = d.currentMode  ?? 'message';
  } catch {}
}

// ── Header helpers ────────────────────────────────────────────────────────────
function updateHeader(connected, code) {
  const dot    = document.getElementById('status-dot');
  const box    = document.getElementById('status-box');
  const codeEl = document.getElementById('header-code');

  if (code) {
    currentPairCode = code;
    const formatted = code.slice(0, 3) + '-' + code.slice(3);
    codeEl.textContent = formatted;
    const badge = document.getElementById('preview-code-badge');
    if (badge) badge.textContent = formatted;
  }

  if (connected) {
    dot.classList.add('connected');
    box.classList.add('connected');
    box.textContent = 'CONNECTED';
    document.querySelector('.preview-dot')?.classList.add('connected');
  } else {
    dot.classList.remove('connected');
    box.classList.remove('connected');
    box.textContent = 'DISCONNECTED';
    document.querySelector('.preview-dot')?.classList.remove('connected');
  }
}

// ── Preview grid DOM ──────────────────────────────────────────────────────────
function buildPreviewGrid() {
  const container = document.createElement('div');
  container.id = 'board-grid';

  for (let r = 0; r < ROWS; r++) {
    previewTileEls[r] = [];
    for (let c = 0; c < COLS; c++) {
      const tile = document.createElement('div');
      tile.className = 'tile space-tile';
      tile.innerHTML = `
        <div class="tile-top"><span class="tile-char tf"> </span></div>
        <div class="tile-bottom"><span class="tile-char bf"> </span></div>`;
      container.appendChild(tile);
      previewTileEls[r][c] = tile;
    }
  }

  document.getElementById('board-preview').appendChild(container);
}

function renderPreview() {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = previewGrid[r][c].current;
      const el = previewTileEls[r][c];
      if (isColorChar(ch)) {
        el.classList.add('color-tile');
        el.classList.remove('space-tile');
        el.style.setProperty('--tile-color', COLOR_MAP[ch]);
      } else {
        el.classList.remove('color-tile');
        el.style.removeProperty('--tile-color');
        el.classList.toggle('space-tile', ch === ' ');
        el.querySelector('.tf').textContent = ch === ' ' ? '' : ch;
        el.querySelector('.bf').textContent = ch === ' ' ? '' : ch;
      }
    }
  }
}

function syncPreview(targetRows) {
  setTargets(previewGrid, targetRows);
  snapToTargets(previewGrid);
  renderPreview();
}

// ── Message tab bar ───────────────────────────────────────────────────────────
/*
 * Renders the compact numbered tab strip above the row inputs.
 * Each tab shows the message number and a × delete button (hidden when only 1 message).
 * Active tab is highlighted; the currently-playing tab gets a green border.
 */
function renderMsgTabs() {
  const tabs = document.getElementById('msg-tabs');
  if (!tabs) return;
  tabs.innerHTML = '';

  messages.forEach((_, i) => {
    const tab = document.createElement('button');
    tab.className = 'msg-tab' +
      (i === activeMessageIndex ? ' active' : '') +
      (isPlaying && i === playIndex ? ' playing' : '');
    tab.setAttribute('aria-label', `Message ${i + 1}`);

    tab.appendChild(document.createTextNode(i + 1));

    if (messages.length > 1) {
      const del = document.createElement('span');
      del.className = 'msg-tab-del';
      del.textContent = '×';
      del.setAttribute('role', 'button');
      del.setAttribute('aria-label', `Delete message ${i + 1}`);
      del.addEventListener('click', e => {
        e.stopPropagation();
        deleteMessage(i);
      });
      tab.appendChild(del);
    }

    tab.addEventListener('click', () => setActiveMessage(i));
    tabs.appendChild(tab);
  });

  document.getElementById('btn-add-message').disabled = messages.length >= MAX_MESSAGES;
}

// ── Character-grid row ────────────────────────────────────────────────────────
/*
 * Creates one 22-cell visual row for a message row.
 * A nearly-transparent <input> overlays the grid to capture keyboard input
 * and iOS space-bar-trackpad cursor movement. selectionchange fires as the
 * cursor moves, updating the blinking underline cursor in the visual cells.
 */

// Single document-level selectionchange handler — dispatches a custom event
// onto whichever hidden input is currently focused so each row's updateCellDisplay
// closure is called without accumulating listeners on document.
document.addEventListener('selectionchange', () => {
  if (focusedInput && document.activeElement === focusedInput) {
    focusedInput.dispatchEvent(new CustomEvent('_cursor'));
  }
});

function createCharRow(rowIndex, msgIndex, initialValue) {
  const wrapper = document.createElement('div');
  wrapper.className = 'char-grid-wrapper';

  const grid = document.createElement('div');
  grid.className = 'char-grid';

  // Build 22 visual cells
  const cells = [];
  for (let c = 0; c < COLS; c++) {
    const cell = document.createElement('div');
    cell.className = 'char-cell';
    cells.push(cell);
    grid.appendChild(cell);
  }

  // Hidden overlay input — receives all keyboard events
  const inp = document.createElement('input');
  inp.type          = 'text';
  inp.className     = 'char-hidden-input';
  inp.maxLength     = COLS;
  inp.value         = initialValue || '';
  inp.autocomplete  = 'off';
  inp.autocorrect   = 'off';
  inp.autocapitalize = 'characters';
  inp.spellcheck    = false;
  inp.setAttribute('inputmode', 'text');

  // Re-render cells from current input value + cursor position
  function updateCells() {
    const raw = inp.value;
    const cursorPos = (document.activeElement === inp) ? inp.selectionStart : -1;
    for (let c = 0; c < COLS; c++) {
      const ch   = raw[c] ?? ' ';
      const cell = cells[c];
      // Reset classes
      cell.className = 'char-cell';
      cell.style.removeProperty('--cell-color');
      cell.textContent = '';

      if (isColorChar(ch)) {
        cell.classList.add('is-color');
        cell.style.setProperty('--cell-color', COLOR_MAP[ch]);
      } else if (ch !== ' ') {
        cell.classList.add('has-char');
        cell.textContent = ch;
      }
      if (c === cursorPos) cell.classList.add('cursor-pos');
    }
  }

  // Normalize value:
  //   • lowercase color chars ('r','o','y','g','b','p','w') → keep as-is (from color picker)
  //   • everything else → uppercase and keep only if it exists in SPOOL (drops emoji, unsupported chars)
  //   • autocapitalize="characters" on mobile ensures keyboard 'r' arrives as 'R' (letter, not color)
  function normalizeValue(raw) {
    const out = [];
    for (const ch of raw) {
      if (isColorChar(ch)) {
        out.push(ch);          // color char — always from insertColorChar, never the keyboard on mobile
      } else {
        const up = ch.toUpperCase();
        if (SPOOL.includes(up)) out.push(up);  // valid letter/digit/symbol → uppercase
        // else: emoji, unsupported unicode, etc. → silently dropped
      }
    }
    return out.join('');
  }

  inp.addEventListener('focus', () => {
    focusedInput = inp;
    wrapper.classList.add('row-focused');
    updateCells();
  });

  inp.addEventListener('blur', () => {
    if (focusedInput === inp) focusedInput = null;
    wrapper.classList.remove('row-focused');
    updateCells(); // clears cursor-pos highlight
  });

  inp.addEventListener('input', () => {
    const cursorBefore = inp.selectionStart;
    const raw = inp.value;
    const normalized = normalizeValue(raw);
    inp.value = normalized;
    // Clamp cursor: dropped chars shrink the string, so cap to new length
    inp.setSelectionRange(
      Math.min(cursorBefore, normalized.length),
      Math.min(cursorBefore, normalized.length)
    );
    messages[msgIndex].rows[rowIndex] = normalized.slice(0, COLS).padEnd(COLS, ' ');
    updateCells();
    syncPreview(messages[activeMessageIndex].rows);
    saveDrafts();
  });

  inp.addEventListener('keyup', updateCells);

  // Custom event fired by the global selectionchange handler
  inp.addEventListener('_cursor', updateCells);

  // Tap anywhere in the row: calculate which column was tapped and set cursor
  inp.addEventListener('click', e => {
    const rect = inp.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const col  = Math.min(Math.max(0, Math.floor((relX / rect.width) * COLS)), COLS);
    inp.setSelectionRange(col, col);
    updateCells();
  });

  wrapper.appendChild(grid);
  wrapper.appendChild(inp);

  // Initial render
  updateCells();

  return wrapper;
}

// ── Message inputs rendering ──────────────────────────────────────────────────
/*
 * Renders only the ACTIVE message's 6 row inputs using the character grid.
 * Each row maps 1:1 to the board preview above it.
 */
function renderMessageList() {
  const list = document.getElementById('message-list');
  list.innerHTML = '';
  focusedInput = null;

  const i   = activeMessageIndex;
  const msg = messages[i];

  const msgDiv = document.createElement('div');
  msgDiv.className = 'message-inputs';

  for (let r = 0; r < ROWS; r++) {
    const group = document.createElement('div');
    group.className = 'row-input-group';

    const label = document.createElement('div');
    label.className = 'row-label';
    label.textContent = String(r + 1).padStart(2, '0');

    const charWrapper = createCharRow(r, i, msg.rows[r] || '');

    group.appendChild(label);
    group.appendChild(charWrapper);
    msgDiv.appendChild(group);
  }

  list.appendChild(msgDiv);
  renderMsgTabs();
}

function setActiveMessage(index) {
  if (index === activeMessageIndex) return;
  activeMessageIndex = Math.max(0, Math.min(index, messages.length - 1));
  renderMessageList();
  syncPreview(messages[activeMessageIndex].rows);
  saveDrafts();
}

function addMessage() {
  if (messages.length >= MAX_MESSAGES) return;
  messages.push({ rows: Array(ROWS).fill('') });
  activeMessageIndex = messages.length - 1;
  renderMessageList();
  syncPreview(messages[activeMessageIndex].rows);
  saveDrafts();
}

function deleteMessage(index) {
  if (messages.length <= 1) return;
  messages.splice(index, 1);
  activeMessageIndex = Math.max(0, Math.min(activeMessageIndex, messages.length - 1));
  if (playIndex >= messages.length) playIndex = 0;
  renderMessageList();
  syncPreview(messages[activeMessageIndex].rows);
  saveDrafts();
}

function insertColorChar(char) {
  if (!focusedInput) return;
  const start = focusedInput.selectionStart ?? 0;
  const end   = focusedInput.selectionEnd   ?? 0;
  const v     = focusedInput.value;
  // Always write directly to .value (avoids autocapitalize converting lowercase color chars)
  if (start === end) {
    // No selection: insert at cursor (overwrite if at max length)
    if (v.length >= COLS) {
      focusedInput.value = v.slice(0, start) + char + v.slice(start + 1);
    } else {
      focusedInput.value = v.slice(0, start) + char + v.slice(start);
    }
  } else {
    // Replace selection
    focusedInput.value = v.slice(0, start) + char + v.slice(end);
  }
  const next = Math.min(start + 1, COLS);
  focusedInput.setSelectionRange(next, next);
  focusedInput.dispatchEvent(new Event('input', { bubbles: true }));
}

// ── Preview scale ─────────────────────────────────────────────────────────────
/*
 * Scales the board preview to fill the full width of #preview-wrapper.
 * No upper cap — the preview always spans edge-to-edge.
 */
function fitPreview() {
  const wrapper = document.getElementById('preview-wrapper');
  const preview = document.getElementById('board-preview');
  const grid    = preview?.querySelector('#board-grid');
  if (!grid || !wrapper || !grid.offsetWidth) return;
  const scale = wrapper.clientWidth / grid.offsetWidth;
  preview.style.transform = `scale(${scale})`;
  wrapper.style.height = Math.ceil(grid.offsetHeight * scale) + 'px';
}

// ── Playing highlight ─────────────────────────────────────────────────────────
function updatePlayingHighlight() {
  renderMsgTabs();
}

// ── Row padding ───────────────────────────────────────────────────────────────
function padRows(rows) {
  return Array.from({ length: ROWS }, (_, i) =>
    (rows[i] ?? '').slice(0, COLS).padEnd(COLS, ' ')
  );
}

// ── Play / Next / Reset ───────────────────────────────────────────────────────
function sendMessage(index) {
  const rows = padRows(messages[index]?.rows ?? []);
  ws.send({ type: 'phone_send', payload: { rows, mode: 'message' } });
}

function startPlay() {
  if (isPlaying) return;
  isPlaying = true;
  document.getElementById('btn-play').classList.add('playing');
  document.getElementById('btn-play').textContent = 'STOP';
  playIndex = activeMessageIndex;
  sendMessage(playIndex);
  scheduleNext();
  savePlayState(true, playIndex);
  updatePlayingHighlight();
}

function stopPlay() {
  isPlaying = false;
  clearTimeout(playTimer);
  document.getElementById('btn-play').classList.remove('playing');
  document.getElementById('btn-play').textContent = 'PLAY';
  savePlayState(false, playIndex);
  updatePlayingHighlight();
}

function scheduleNext() {
  clearTimeout(playTimer);
  playTimer = setTimeout(() => {
    if (!isPlaying) return;
    playIndex = (playIndex + 1) % messages.length;
    sendMessage(playIndex);
    savePlayState(true, playIndex);
    updatePlayingHighlight();
    scheduleNext();
  }, loopInterval * 1000);
}

function nextMessage() {
  if (!isPlaying || nextDebouncing) return;

  // Spam protection: disable for NEXT_DEBOUNCE_MS
  nextDebouncing = true;
  const btn = document.getElementById('btn-next');
  btn.disabled = true;
  setTimeout(() => {
    nextDebouncing = false;
    btn.disabled = false;
  }, NEXT_DEBOUNCE_MS);

  playIndex = (playIndex + 1) % messages.length;
  sendMessage(playIndex);
  savePlayState(true, playIndex);
  updatePlayingHighlight();
  scheduleNext();
}

function hardReset() {
  stopPlay();
  messages = DEFAULT_MESSAGES();
  activeMessageIndex = 0;
  renderMessageList();
  syncPreview(messages[0].rows);
  saveDrafts();
  ws.send({ type: 'phone_reset' });
}

// ── Clock mode ────────────────────────────────────────────────────────────────
function buildClockRows() {
  const now  = new Date();
  const day  = DAY_NAMES[now.getDay()];
  const mon  = MONTH_NAMES[now.getMonth()];
  const date = String(now.getDate()).padStart(2, ' ');
  const year = String(now.getFullYear());

  let h = now.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const hh = String(h).padStart(2, ' ');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  const row2 = ('   ' + `${day} ${mon} ${date}`).slice(0, COLS).padEnd(COLS, ' ');
  const row3 = `${hh}:${mm}:${ss} ${ampm}`.padStart(16, ' ').padEnd(COLS, ' ');
  const yPad = Math.floor((COLS - year.length) / 2);
  const row4 = (' '.repeat(yPad + 2) + year).slice(0, COLS).padEnd(COLS, ' ');

  return ['                      ', row2, row3, row4, '                      ', '                      '];
}

function startClockMode() {
  document.getElementById('btn-play').disabled = true;
  document.getElementById('btn-next').disabled = true;
  const send = () => {
    const rows = buildClockRows();
    ws.send({ type: 'phone_send', payload: { rows, mode: 'clock' } });
    syncPreview(rows);
  };
  send();
  clockTimer = setInterval(send, 1000);
}

function stopClockMode() {
  clearInterval(clockTimer);
  clockTimer = null;
  document.getElementById('btn-play').disabled = false;
  document.getElementById('btn-next').disabled = false;
}

function switchToMessage() {
  stopClockMode();
  ws.send({ type: 'phone_send', payload: { rows: STANDBY_ROWS, mode: 'message' } });
  syncPreview(STANDBY_ROWS);
}

// ── WebSocket ─────────────────────────────────────────────────────────────────
const pairCode = new URLSearchParams(location.search).get('code') || '';

const ws = new WsClient(() => {
  ws.send({ type: 'phone_hello', pairCode });
  document.getElementById('connect-status').textContent = 'WAITING FOR APPROVAL...';
});

ws.onMessage(msg => {
  switch (msg.type) {
    case 'phone_approved': {
      document.getElementById('connect-screen').remove();
      document.getElementById('controller-ui').hidden = false;
      updateHeader(true, pairCode);

      // Auto-resume loop if it was playing before disconnect
      try {
        const ps = JSON.parse(localStorage.getItem('solari_play_state') || '{}');
        if (ps.wasPlaying && ps.pairCode === pairCode) {
          playIndex = Math.min(ps.playIndex ?? 0, messages.length - 1);
          loopInterval = ps.loopInterval ?? loopInterval;
          document.getElementById('timer-slider').value = loopInterval;
          document.getElementById('timer-value').textContent = loopInterval;
          startPlay();
        }
      } catch {}
      break;
    }

    case 'phone_rejected':
      document.getElementById('connect-status').textContent = 'CONNECTION DENIED';
      updateHeader(false, pairCode);
      break;

    case 'board_occupied':
      document.getElementById('connect-status').textContent = 'BOARD OCCUPIED — TRY AGAIN LATER';
      break;

    case 'not_found':
      document.getElementById('connect-status').textContent = 'INVALID CODE';
      break;
  }
});

// ── Init ──────────────────────────────────────────────────────────────────────
document.fonts.ready.then(() => {
  loadDrafts();
  buildPreviewGrid();
  // Defer fitPreview until after layout paint — fonts.ready can fire before
  // the browser has calculated offsetWidth (especially on iOS Safari).
  // ResizeObserver catches any subsequent wrapper-width changes (orientation, etc.).
  const wrapper = document.getElementById('preview-wrapper');
  new ResizeObserver(fitPreview).observe(wrapper);
  requestAnimationFrame(fitPreview);
  window.addEventListener('resize', fitPreview);
  renderMessageList();
  syncPreview(messages[activeMessageIndex].rows);

  // Restore mode radio
  document.querySelector(`input[name="mode"][value="${currentMode}"]`).checked = true;
  document.getElementById('timer-slider').value = loopInterval;
  document.getElementById('timer-value').textContent = loopInterval;

  // ── Emoji color picker ────────────────────────────────────────────────────
  document.getElementById('emoji-picker').addEventListener('click', e => {
    const btn = e.target.closest('.color-swatch');
    if (btn) insertColorChar(btn.dataset.color);
  });

  // ── Mode toggle ──────────────────────────────────────────────────────────
  document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener('change', e => {
      currentMode = e.target.value;
      saveDrafts();
      if (currentMode === 'clock') {
        stopPlay();
        startClockMode();
      } else {
        switchToMessage();
      }
    });
  });

  // ── Loop timer ───────────────────────────────────────────────────────────
  document.getElementById('timer-slider').addEventListener('input', e => {
    loopInterval = Number(e.target.value);
    document.getElementById('timer-value').textContent = loopInterval;
    saveDrafts();
    if (isPlaying) scheduleNext();
  });

  // ── Buttons ──────────────────────────────────────────────────────────────
  document.getElementById('btn-add-message').addEventListener('click', addMessage);

  document.getElementById('btn-play').addEventListener('click', () => {
    if (isPlaying) stopPlay(); else startPlay();
  });

  document.getElementById('btn-next').addEventListener('click', nextMessage);
  document.getElementById('btn-reset').addEventListener('click', hardReset);

  // ── Connect ──────────────────────────────────────────────────────────────
  if (!pairCode) {
    document.getElementById('connect-status').textContent = 'NO CODE — SCAN QR ON BOARD';
  } else {
    ws.connect(`ws://${location.host}/ws`);
  }
});
