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
const DEFAULT_MESSAGES = () => ([{
  rows: ['HELLO WORLD', '', 'HOPE YOU ENJOY', 'CHEERS', '', ''],
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
    messages, activeMessageIndex, loopInterval, currentMode,
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
    codeEl.textContent = code.slice(0, 3) + '-' + code.slice(3);
  }

  if (connected) {
    dot.classList.add('connected');
    box.classList.add('connected');
    box.textContent = 'CONNECTED';
  } else {
    dot.classList.remove('connected');
    box.classList.remove('connected');
    box.textContent = 'DISCONNECTED';
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

// ── Message inputs rendering ──────────────────────────────────────────────────
/*
 * Renders only the ACTIVE message's 6 row inputs, each labelled with its
 * board row number (01–06). This creates a 1:1 WYSIWYG mapping between
 * the input rows and the preview mirror above.
 */
function renderMessageList() {
  const list = document.getElementById('message-list');
  list.innerHTML = '';

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

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'row-input';
    input.maxLength = COLS;
    input.placeholder = `ROW ${r + 1}`;
    input.value = msg.rows[r] || '';
    input.dataset.rowIndex = r;
    input.dataset.msgIndex = i;

    input.addEventListener('focus', () => {
      focusedInput = input;
    });

    input.addEventListener('input', e => {
      // Preserve lowercase color chars (inserted by emoji picker); uppercase everything else
      const val = e.target.value.split('').map(ch => {
        if (isColorChar(ch)) return ch;
        const up = ch.toUpperCase();
        return SPOOL.includes(up) ? up : '?';
      }).join('');
      e.target.value = val;
      messages[i].rows[r] = val;
      syncPreview(messages[activeMessageIndex].rows);
      saveDrafts();
    });

    group.appendChild(label);
    group.appendChild(input);
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
  const start = focusedInput.selectionStart;
  const end   = focusedInput.selectionEnd;
  if (focusedInput.value.length >= COLS && start === end) return;
  focusedInput.setRangeText(char, start, end, 'end');
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
  fitPreview();
  window.addEventListener('resize', fitPreview);
  renderMessageList();
  syncPreview(messages[activeMessageIndex].rows);

  // Restore mode radio
  document.querySelector(`input[name="mode"][value="${currentMode}"]`).checked = true;
  document.getElementById('timer-slider').value = loopInterval;
  document.getElementById('timer-value').textContent = loopInterval;

  // ── Emoji color picker ────────────────────────────────────────────────────
  document.getElementById('emoji-picker').addEventListener('click', e => {
    const btn = e.target.closest('.emoji-btn');
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
