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

// ── Artwork templates ─────────────────────────────────────────────────────────
// K = space/black, R/W/Y/G/B/P/O = color tile (converted at apply-time)
const _AW = { K:' ', R:'r', W:'w', Y:'y', G:'g', B:'b', P:'p', O:'o' };
const artworkToRows = data =>
  data.map(row => row.map(c => _AW[c] ?? ' ').join('').padEnd(COLS, ' '));

const ARTWORKS = [
  {
    name: 'BLOOM',
    data: [
      ['K','K','R','R','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K'],
      ['K','R','W','W','R','K','R','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K'],
      ['R','W','Y','Y','W','R','K','K','O','K','K','K','K','K','K','K','K','K','K','K','K','K'],
      ['K','R','W','W','R','K','K','K','K','K','R','K','K','K','K','K','K','K','K','K','K','K'],
      ['K','K','R','R','K','G','K','K','K','K','K','K','K','O','K','K','K','K','K','K','K','K'],
      ['K','G','G','G','G','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K'],
    ],
  },
  {
    name: 'MEADOW',
    data: [
      ['K','K','K','K','K','K','K','P','K','K','K','K','K','K','R','K','K','K','K','K','K','K'],
      ['K','K','O','K','K','K','P','W','P','K','K','Y','K','R','W','R','K','K','K','P','K','K'],
      ['K','O','W','O','K','K','K','P','K','K','Y','W','Y','K','R','K','K','K','P','W','P','K'],
      ['K','K','G','K','K','K','G','K','K','K','K','G','K','K','G','K','K','K','K','P','K','K'],
      ['G','G','G','G','G','G','G','G','G','G','G','G','G','G','G','G','G','G','G','G','G','G'],
      ['G','G','G','G','G','G','G','G','G','G','G','G','G','G','G','G','G','G','G','G','G','G'],
    ],
  },
  {
    name: 'HORIZON',
    data: [
      ['K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K'],
      ['B','B','B','B','B','B','B','B','B','B','B','B','B','B','B','B','B','B','B','B','B','B'],
      ['B','B','B','B','B','B','B','B','B','P','P','P','P','P','P','P','P','B','B','B','B','B'],
      ['P','P','P','R','R','R','R','R','R','R','R','R','R','R','R','R','R','R','R','R','R','P'],
      ['R','R','O','O','O','O','O','O','O','O','O','O','O','O','O','O','O','O','O','O','O','O'],
      ['Y','Y','Y','Y','Y','Y','Y','Y','Y','Y','Y','Y','Y','Y','Y','Y','Y','Y','Y','Y','Y','Y'],
    ],
  },
  {
    name: 'TWINS',
    data: [
      ['K','K','G','G','G','K','K','K','K','K','K','K','K','R','R','R','K','K','K','K','K','K'],
      ['K','G','W','G','W','G','K','K','K','K','K','K','R','W','R','W','R','K','K','K','K','K'],
      ['K','G','G','G','G','G','K','K','K','K','K','K','R','R','R','R','R','K','K','K','K','K'],
      ['K','K','G','K','G','K','K','K','K','K','K','K','K','R','K','R','K','K','K','K','K','K'],
      ['K','G','K','K','K','G','K','K','K','K','K','K','R','K','K','K','R','K','K','K','K','K'],
      ['K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K','K'],
    ],
  },
  {
    name: 'INVADER',
    data: [
      ['B','B','B','Y','B','B','B','B','B','B','B','B','B','B','B','B','B','B','Y','B','B','B'],
      ['B','B','B','B','B','B','B','B','P','P','P','P','P','P','B','B','B','B','B','B','B','B'],
      ['B','Y','B','B','B','B','B','P','P','W','P','P','W','P','P','B','B','B','B','B','Y','B'],
      ['B','B','B','B','B','B','B','P','P','P','P','P','P','P','P','B','B','B','B','B','B','B'],
      ['B','B','B','B','B','B','B','B','P','B','P','P','B','P','B','B','B','B','B','B','B','B'],
      ['B','B','B','Y','B','B','B','P','B','B','B','B','B','B','P','B','B','B','Y','B','B','B'],
    ],
  },
];

// ── State ─────────────────────────────────────────────────────────────────────
let messages           = DEFAULT_MESSAGES();
let activeMessageIndex = 0;
let loopInterval       = DEFAULT_LOOP_S;
let isPlaying          = false;
let playIndex          = 0;
let playTimer          = null;
let currentMode        = 'message';
let clockTimer         = null;
let currentPairCode    = '';
// Grid input state
let gridCursorIndex   = 0;
let gridCells         = [];
let dragSourceIndex   = null;
let dragOverIndex     = null;
let longPressTimer    = null;
let dragActive        = false;
let dragPointerOrigin = null;
let dragBoundMove     = null;
let dragBoundUp       = null;
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
    currentMode        = (d.currentMode === 'artwork' ? 'message' : d.currentMode) ?? 'message';
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

// ── Message cell grid ─────────────────────────────────────────────────────────
/*
 * A 22×6 grid of individual <div class="cell"> elements replaces the textarea.
 * Keyboard input is captured by a hidden off-screen <input id="grid-capture">
 * which is focused on cell tap — this summons the virtual keyboard on mobile.
 * Drag-to-swap uses pointer events with a 320ms long-press threshold.
 */

function getCharAt(index) {
  const row = Math.floor(index / COLS);
  const col = index % COLS;
  return ((messages[activeMessageIndex].rows[row] ?? '').padEnd(COLS, ' '))[col] ?? ' ';
}

function updateCellDOM(cellEl, ch) {
  const isEmpty = !ch || ch === ' ';
  const isColor = isColorChar(ch);
  cellEl.classList.toggle('is-empty', isEmpty);
  cellEl.classList.toggle('is-color', isColor);
  if (isColor) {
    cellEl.style.setProperty('--cell-color', COLOR_MAP[ch]);
    cellEl.textContent = '';
  } else {
    cellEl.style.removeProperty('--cell-color');
    cellEl.textContent = isEmpty ? '' : ch;
  }
}

// Write ch to messages state + update DOM cell. Does NOT sync preview.
function setCellCharRaw(index, ch) {
  const row = Math.floor(index / COLS);
  const col = index % COLS;
  const r = (messages[activeMessageIndex].rows[row] ?? '').padEnd(COLS, ' ');
  messages[activeMessageIndex].rows[row] = r.slice(0, col) + ch + r.slice(col + 1);
  updateCellDOM(gridCells[index], ch);
}

// Write ch, then sync preview + save.
function setCellChar(index, ch) {
  setCellCharRaw(index, ch);
  syncPreview(messages[activeMessageIndex].rows);
  saveDrafts();
}

function updateCursorCell() {
  gridCells.forEach(c => c.classList.remove('is-cursor'));
  if (gridCells[gridCursorIndex]) gridCells[gridCursorIndex].classList.add('is-cursor');
}

// ── Grid keyboard handler ──────────────────────────────────────────────────────
function handleGridKey(e) {
  const cursor = gridCursorIndex;
  const row    = Math.floor(cursor / COLS);
  const col    = cursor % COLS;

  if (e.key === 'Backspace') {
    if (col > 0) {
      gridCursorIndex--;
      setCellChar(gridCursorIndex, ' ');
    } else if (row > 0) {
      gridCursorIndex = (row - 1) * COLS + (COLS - 1);
      setCellChar(gridCursorIndex, ' ');
    }
    updateCursorCell();
    e.preventDefault();
    return;
  }

  if (e.key === 'Delete') {
    setCellChar(cursor, ' ');
    e.preventDefault();
    return;
  }

  const navMap = {
    ArrowRight: () => Math.min(cursor + 1, ROWS * COLS - 1),
    ArrowLeft:  () => Math.max(cursor - 1, 0),
    ArrowDown:  () => Math.min(cursor + COLS, ROWS * COLS - 1),
    ArrowUp:    () => Math.max(cursor - COLS, 0),
    Home:       () => row * COLS,
    End:        () => row * COLS + COLS - 1,
  };
  if (navMap[e.key]) {
    gridCursorIndex = navMap[e.key]();
    updateCursorCell();
    e.preventDefault();
    return;
  }

  if (e.key === 'Enter') {
    if (row < ROWS - 1) { gridCursorIndex = (row + 1) * COLS; updateCursorCell(); }
    e.preventDefault();
    return;
  }

  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    const ch = e.key.toUpperCase();
    if (SPOOL.includes(ch) && !isColorChar(ch)) {
      setCellChar(cursor, ch);
      // Advance: next cell in row, or wrap to start of next row
      gridCursorIndex = col < COLS - 1
        ? cursor + 1
        : (row < ROWS - 1 ? (row + 1) * COLS : cursor);
      updateCursorCell();
    }
    e.preventDefault();
  }
}

// ── Drag-to-swap (pointer events) ─────────────────────────────────────────────
function cleanupDrag() {
  clearTimeout(longPressTimer);
  if (dragSourceIndex !== null) gridCells[dragSourceIndex]?.classList.remove('is-drag-source');
  if (dragOverIndex   !== null) gridCells[dragOverIndex]?.classList.remove('is-drag-over');
  dragActive        = false;
  dragSourceIndex   = null;
  dragOverIndex     = null;
  dragPointerOrigin = null;
  if (dragBoundMove) { document.removeEventListener('pointermove', dragBoundMove); dragBoundMove = null; }
  if (dragBoundUp)   { document.removeEventListener('pointerup',   dragBoundUp);   dragBoundUp   = null; }
}

function onDragPointerMove(e) {
  if (!dragPointerOrigin) return;
  const dist = Math.hypot(e.clientX - dragPointerOrigin.x, e.clientY - dragPointerOrigin.y);
  if (!dragActive) {
    if (dist > 6) { clearTimeout(longPressTimer); cleanupDrag(); }
    return;
  }
  e.preventDefault();
  const el   = document.elementFromPoint(e.clientX, e.clientY);
  const cell = el?.closest?.('.cell');
  const idx  = cell ? +cell.dataset.index : null;
  if (idx !== null && idx !== dragOverIndex) {
    if (dragOverIndex !== null) gridCells[dragOverIndex]?.classList.remove('is-drag-over');
    dragOverIndex = idx;
    gridCells[dragOverIndex]?.classList.add('is-drag-over');
  }
}

function onDragPointerUp() {
  clearTimeout(longPressTimer);
  if (dragActive && dragOverIndex !== null && dragOverIndex !== dragSourceIndex) {
    const srcCh = getCharAt(dragSourceIndex);
    const tgtCh = getCharAt(dragOverIndex);
    // Move to empty cell, swap if occupied
    if (tgtCh === ' ') {
      setCellCharRaw(dragSourceIndex, ' ');
      setCellCharRaw(dragOverIndex,   srcCh);
    } else {
      setCellCharRaw(dragSourceIndex, tgtCh);
      setCellCharRaw(dragOverIndex,   srcCh);
    }
    gridCursorIndex = dragOverIndex;
    updateCursorCell();
    syncPreview(messages[activeMessageIndex].rows);
    saveDrafts();
  }
  cleanupDrag();
}

// ── Artwork mode ───────────────────────────────────────────────────────────────
const MSG_ELEMENTS = ['msg-nav', 'type-row', 'message-list', 'loop-timer-row'];

function showArtworkMode() {
  MSG_ELEMENTS.forEach(id => { document.getElementById(id).hidden = true; });
  renderArtworkList();
  document.getElementById('artwork-section').hidden = false;
}

function hideArtworkMode() {
  document.getElementById('artwork-section').hidden = true;
  MSG_ELEMENTS.forEach(id => { document.getElementById(id).hidden = false; });
}

function renderArtworkList() {
  const section = document.getElementById('artwork-section');
  section.innerHTML = '';

  const label = document.createElement('div');
  label.id = 'artwork-section-label';
  label.textContent = 'CHOOSE ARTWORK';
  section.appendChild(label);

  ARTWORKS.forEach(artwork => {
    const btn = document.createElement('button');
    btn.className = 'artwork-item';
    btn.textContent = artwork.name;
    btn.addEventListener('click', () => applyArtwork(artwork));
    section.appendChild(btn);
  });
}

function applyArtwork(artwork) {
  const rows = artworkToRows(artwork.data);
  messages[activeMessageIndex].rows = rows;
  gridCursorIndex = 0;
  currentMode = 'message';
  document.querySelector('input[name="mode"][value="message"]').checked = true;
  hideArtworkMode();
  renderMessageGrid();
  syncPreview(rows);
  saveDrafts();
}

// ── Message grid rendering ─────────────────────────────────────────────────────
function renderMessageGrid() {
  cleanupDrag();  // abort any in-progress drag before tearing down the old grid
  const list = document.getElementById('message-list');
  list.innerHTML = '';
  gridCells = [];

  const msg = messages[activeMessageIndex];

  const container = document.createElement('div');
  container.id = 'msg-grid-container';

  const grid = document.createElement('div');
  grid.id = 'msg-grid';
  grid.setAttribute('aria-label', 'Message grid (22 columns × 6 rows)');

  for (let i = 0; i < ROWS * COLS; i++) {
    const row  = Math.floor(i / COLS);
    const col  = i % COLS;
    const cell = document.createElement('div');
    cell.className    = 'cell';
    cell.dataset.index = String(i);
    updateCellDOM(cell, ((msg.rows[row] ?? '').padEnd(COLS, ' '))[col] ?? ' ');
    gridCells.push(cell);
    grid.appendChild(cell);
  }

  container.appendChild(grid);
  list.appendChild(container);

  gridCursorIndex = Math.max(0, Math.min(gridCursorIndex, ROWS * COLS - 1));
  updateCursorCell();

  // Tap → move cursor + focus keyboard capture
  container.addEventListener('click', e => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    gridCursorIndex = +cell.dataset.index;
    updateCursorCell();
    document.getElementById('grid-capture').focus();
  });

  // Long-press drag detection
  container.addEventListener('pointerdown', e => {
    const cell = e.target.closest('.cell');
    if (!cell) return;
    const index       = +cell.dataset.index;
    dragPointerOrigin = { x: e.clientX, y: e.clientY };
    dragSourceIndex   = index;
    longPressTimer = setTimeout(() => {
      dragActive = true;
      gridCells[dragSourceIndex]?.classList.add('is-drag-source');
    }, 320);
    dragBoundMove = onDragPointerMove;
    dragBoundUp   = onDragPointerUp;
    document.addEventListener('pointermove', dragBoundMove, { passive: false });
    document.addEventListener('pointerup',   dragBoundUp);
  });

  renderMsgTabs();
}

function setActiveMessage(index) {
  if (index === activeMessageIndex) return;
  activeMessageIndex = Math.max(0, Math.min(index, messages.length - 1));
  gridCursorIndex = 0;
  renderMessageGrid();
  syncPreview(messages[activeMessageIndex].rows);
  saveDrafts();
}

function addMessage() {
  if (messages.length >= MAX_MESSAGES) return;
  messages.push({ rows: Array(ROWS).fill('') });
  activeMessageIndex = messages.length - 1;
  gridCursorIndex = 0;
  renderMessageGrid();
  syncPreview(messages[activeMessageIndex].rows);
  saveDrafts();
}

function deleteMessage(index) {
  if (messages.length <= 1) return;
  messages.splice(index, 1);
  activeMessageIndex = Math.max(0, Math.min(activeMessageIndex, messages.length - 1));
  if (playIndex >= messages.length) playIndex = 0;
  gridCursorIndex = 0;
  renderMessageGrid();
  syncPreview(messages[activeMessageIndex].rows);
  saveDrafts();
}

function insertColorChar(char) {
  const cursor = gridCursorIndex;
  const row    = Math.floor(cursor / COLS);
  const col    = cursor % COLS;
  setCellChar(cursor, char);
  gridCursorIndex = col < COLS - 1
    ? cursor + 1
    : (row < ROWS - 1 ? (row + 1) * COLS : cursor);
  updateCursorCell();
  document.getElementById('grid-capture')?.focus();
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
  gridCursorIndex = 0;
  renderMessageGrid();
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
  renderMessageGrid();
  syncPreview(messages[activeMessageIndex].rows);

  // Restore mode radio
  document.querySelector(`input[name="mode"][value="${currentMode}"]`).checked = true;
  document.getElementById('timer-slider').value = loopInterval;
  document.getElementById('timer-value').textContent = loopInterval;

  // ── Grid capture input ────────────────────────────────────────────────────
  // The hidden off-screen <input> captures keyboard events for the cell grid.
  const captureEl = document.getElementById('grid-capture');
  captureEl.addEventListener('keydown', handleGridKey);
  // Drain any characters the browser accumulates (prevents buffer build-up)
  captureEl.addEventListener('input', e => { e.target.value = ''; });
  // Toggle focus ring on the grid container
  captureEl.addEventListener('focus', () => {
    document.getElementById('msg-grid-container')?.classList.add('grid-active');
  });
  captureEl.addEventListener('blur', () => {
    document.getElementById('msg-grid-container')?.classList.remove('grid-active');
  });

  // ── Color picker ─────────────────────────────────────────────────────────
  // mousedown preventDefault stops the swatch from stealing focus from the
  // capture input — without this, blur fires before click and the keyboard
  // disappears on mobile.
  document.getElementById('emoji-picker').addEventListener('mousedown', e => {
    if (e.target.closest('.color-swatch')) e.preventDefault();
  });
  document.getElementById('emoji-picker').addEventListener('click', e => {
    const btn = e.target.closest('.color-swatch');
    if (btn) insertColorChar(btn.dataset.color);
  });

  // ── Mode toggle ──────────────────────────────────────────────────────────
  document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener('change', e => {
      const prevMode = currentMode;
      currentMode = e.target.value;
      // Clean up previous mode
      if (prevMode === 'artwork') hideArtworkMode();
      if (prevMode === 'clock') stopClockMode();
      // Activate new mode
      if (currentMode === 'clock') {
        stopPlay();
        startClockMode();
        saveDrafts();
      } else if (currentMode === 'artwork') {
        stopPlay();
        showArtworkMode();
        // don't persist 'artwork' — it's ephemeral
      } else {
        switchToMessage();
        saveDrafts();
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
    ws.connect(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  }
});
