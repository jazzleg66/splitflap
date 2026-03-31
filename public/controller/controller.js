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

const COLOR_CHARS = [
  { char: 'R', color: '#FF0000' },
  { char: 'O', color: '#FF7F00' },
  { char: 'Y', color: '#FFFF00' },
  { char: 'G', color: '#00AA00' },
  { char: 'B', color: '#0000FF' },
  { char: 'P', color: '#800080' },
  { char: 'W', color: '#FFFFFF' },
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
let messages = [{ rows: Array(ROWS).fill('') }];
let activeMessageIndex = 0;
let loopInterval = DEFAULT_LOOP_S;
let isPlaying = false;
let playIndex = 0;
let playTimer = null;
let currentMode = 'message'; // 'message' | 'clock'
let clockTimer = null;
let focusedInput = null;

// Preview grid (snaps instantly, no animation)
const previewGrid = initGrid(ROWS, COLS);
const previewTileEls = [];

// ── Load/save drafts ──────────────────────────────────────────────────────────
function saveDrafts() {
  localStorage.setItem('solari_drafts', JSON.stringify({
    messages, activeMessageIndex, loopInterval, currentMode,
  }));
}

function loadDrafts() {
  try {
    const raw = localStorage.getItem('solari_drafts');
    if (!raw) return;
    const d = JSON.parse(raw);
    if (Array.isArray(d.messages) && d.messages.length) messages = d.messages;
    activeMessageIndex = Math.min(d.activeMessageIndex ?? 0, messages.length - 1);
    loopInterval = d.loopInterval ?? DEFAULT_LOOP_S;
    currentMode = d.currentMode ?? 'message';
  } catch {}
}

// ── Preview grid DOM ──────────────────────────────────────────────────────────
function buildPreviewGrid() {
  const container = document.createElement('div');
  container.id = 'board-grid';

  for (let r = 0; r < ROWS; r++) {
    previewTileEls[r] = [];
    for (let c = 0; c < COLS; c++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
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
      const tileEl = previewTileEls[r][c];
      if (isColorChar(ch)) {
        tileEl.classList.add('color-tile');
        tileEl.style.setProperty('--tile-color', COLOR_MAP[ch]);
      } else {
        tileEl.classList.remove('color-tile');
        tileEl.style.removeProperty('--tile-color');
        tileEl.querySelector('.tf').textContent = ch;
        tileEl.querySelector('.bf').textContent = ch;
      }
    }
  }
}

function syncPreview(targetRows) {
  setTargets(previewGrid, targetRows);
  snapToTargets(previewGrid);
  renderPreview();
}

// ── Message list UI ───────────────────────────────────────────────────────────
function getActiveRows() {
  return messages[activeMessageIndex].rows;
}

function renderMessageList() {
  const list = document.getElementById('message-list');
  list.innerHTML = '';

  messages.forEach((msg, i) => {
    const row = document.createElement('div');
    row.className = 'message-row' + (i === activeMessageIndex ? ' active' : '');
    row.dataset.index = i;

    // 6 text inputs
    const inputsDiv = document.createElement('div');
    inputsDiv.className = 'row-inputs';
    for (let r = 0; r < ROWS; r++) {
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
        setActiveMessage(i);
      });

      input.addEventListener('input', e => {
        let val = e.target.value.toUpperCase();
        // Replace chars not in spool with ?
        val = val.split('').map(ch => SPOOL.includes(ch) ? ch : '?').join('');
        e.target.value = val;
        messages[i].rows[r] = val;
        syncPreview(messages[activeMessageIndex].rows);
        saveDrafts();
      });

      inputsDiv.appendChild(input);
    }

    // Color picker
    const colorPicker = document.createElement('div');
    colorPicker.className = 'row-color-picker';
    for (const { char, color } of COLOR_CHARS) {
      const btn = document.createElement('button');
      btn.className = 'color-btn';
      btn.dataset.color = char;
      btn.style.background = color;
      btn.title = char;
      btn.setAttribute('aria-label', `Insert color ${char}`);
      btn.addEventListener('click', () => insertColorChar(char));
      colorPicker.appendChild(btn);
    }

    // Delete button (hide if only one message)
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-delete-message';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', () => deleteMessage(i));
    if (messages.length === 1) delBtn.style.visibility = 'hidden';

    row.appendChild(inputsDiv);
    row.appendChild(colorPicker);
    row.appendChild(delBtn);
    list.appendChild(row);
  });

  // Update Add button
  const addBtn = document.getElementById('btn-add-message');
  addBtn.disabled = messages.length >= MAX_MESSAGES;
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
  const input = focusedInput;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const current = input.value;

  // Don't exceed maxLength
  if (current.length >= COLS && start === end) return;

  input.setRangeText(char, start, end, 'end');
  // Trigger input event to sync
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

// ── Play / Next / Reset ───────────────────────────────────────────────────────
function sendMessage(index) {
  const rows = padRows(messages[index]?.rows ?? []);
  ws.send({ type: 'phone_send', payload: { rows, mode: 'message' } });
}

function padRows(rows) {
  return Array.from({ length: ROWS }, (_, i) =>
    (rows[i] ?? '').slice(0, COLS).padEnd(COLS, ' ')
  );
}

function startPlay() {
  if (isPlaying) return;
  isPlaying = true;
  document.getElementById('btn-play').classList.add('playing');
  document.getElementById('btn-play').textContent = 'STOP';
  playIndex = activeMessageIndex;
  sendMessage(playIndex);
  scheduleNext();
}

function stopPlay() {
  isPlaying = false;
  clearTimeout(playTimer);
  document.getElementById('btn-play').classList.remove('playing');
  document.getElementById('btn-play').textContent = 'PLAY';
}

function scheduleNext() {
  clearTimeout(playTimer);
  playTimer = setTimeout(() => {
    if (!isPlaying) return;
    playIndex = (playIndex + 1) % messages.length;
    sendMessage(playIndex);
    scheduleNext();
  }, loopInterval * 1000);
}

function nextMessage() {
  if (!isPlaying) return;
  playIndex = (playIndex + 1) % messages.length;
  sendMessage(playIndex);
  scheduleNext(); // reset timer
}

function hardReset() {
  stopPlay();
  ws.send({ type: 'phone_reset' });
}

// ── Clock mode ────────────────────────────────────────────────────────────────
const DAY_NAMES = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
const MONTH_NAMES = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE',
                     'JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

function buildClockRows() {
  const now = new Date();
  const day = DAY_NAMES[now.getDay()];
  const month = MONTH_NAMES[now.getMonth()];
  const date = String(now.getDate()).padStart(2, ' ');
  const year = String(now.getFullYear());

  let hours = now.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const hh = String(hours).padStart(2, ' ');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  // Row 2: DAY  MONTH DATE
  const row2 = `${day} ${month} ${date}`.slice(0, COLS).padEnd(COLS, ' ');
  // Row 3: HH:MM:SS AM/PM
  const timeStr = `${hh}:${mm}:${ss} ${ampm}`;
  const row3 = timeStr.padStart(12, ' ').padEnd(COLS, ' ');
  // Row 4: year centered
  const yearPad = Math.floor((COLS - year.length) / 2);
  const row4 = (' '.repeat(yearPad) + year).padEnd(COLS, ' ');

  return [
    '                      ',
    row2,
    row3,
    row4,
    '                      ',
    '                      ',
  ];
}

function startClockMode() {
  document.getElementById('btn-play').disabled = true;
  clockTimer = setInterval(() => {
    const rows = buildClockRows();
    ws.send({ type: 'phone_send', payload: { rows, mode: 'clock' } });
    syncPreview(rows);
  }, 1000);
  // Send immediately
  const rows = buildClockRows();
  ws.send({ type: 'phone_send', payload: { rows, mode: 'clock' } });
  syncPreview(rows);
}

function stopClockMode() {
  clearInterval(clockTimer);
  clockTimer = null;
  document.getElementById('btn-play').disabled = false;
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
    case 'phone_approved':
      document.getElementById('connect-screen').remove();
      document.getElementById('controller-ui').hidden = false;
      break;

    case 'phone_rejected':
      document.getElementById('connect-status').textContent = 'REQUEST REJECTED';
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
  renderMessageList();
  syncPreview(messages[activeMessageIndex].rows);

  // Restore mode radio
  document.querySelector(`input[name="mode"][value="${currentMode}"]`).checked = true;

  // Restore timer slider
  document.getElementById('timer-slider').value = loopInterval;
  document.getElementById('timer-value').textContent = loopInterval;

  // ── Event listeners ─────────────────────────────────────────────────────────

  // Mode toggle
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

  // Loop timer
  document.getElementById('timer-slider').addEventListener('input', e => {
    loopInterval = Number(e.target.value);
    document.getElementById('timer-value').textContent = loopInterval;
    saveDrafts();
    if (isPlaying) scheduleNext(); // reset timer with new interval
  });

  // Add message
  document.getElementById('btn-add-message').addEventListener('click', addMessage);

  // Play/Stop
  document.getElementById('btn-play').addEventListener('click', () => {
    if (isPlaying) stopPlay();
    else startPlay();
  });

  // Next
  document.getElementById('btn-next').addEventListener('click', nextMessage);

  // Hard Reset
  document.getElementById('btn-reset').addEventListener('click', hardReset);

  // Connect
  if (!pairCode) {
    document.getElementById('connect-status').textContent = 'NO CODE PROVIDED';
  } else {
    ws.connect(`ws://${location.host}/ws`);
  }
});
