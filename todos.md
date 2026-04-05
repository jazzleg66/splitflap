  Implementation Plan: Textarea Message Box Refactor                                                                                                                                                                                                                        
                                                                                                                                                                                                                                                                              What changes                                                                                                                                                                                                                                                              
                                                                                                                                                                                                                                                                            
  Replace the 22-cell-per-row character grid (.char-grid, .char-hidden-input, etc.) with a single <textarea> per message, styled as a clean dark monospace text area. All 6 rows of a message live in one textarea, separated internally by \n.                         

  ---
  HTML

  Remove #message-list content generation from JS (kept as container). The textarea is injected by renderMessageList() replacing createCharRow().

  <!-- injected by renderMessageList() -->
  <div id="message-list">
    <textarea id="msg-textarea"
      rows="6"
      maxlength="137"
      autocomplete="off"
      autocorrect="off"
      autocapitalize="characters"
      spellcheck="false"></textarea>
  </div>

  maxlength = 6×22 + 5 newlines = 137. Row labels (01–06) are removed — the textarea is self-explaining.

  ---
  CSS

  #msg-textarea {
    width: 100%;
    background: #0d0d0d;
    border: 1px solid #1e1e1e;
    border-radius: 3px;
    color: var(--text);              /* amber */
    font-family: 'Courier New', Courier, monospace;
    font-size: 16px;                 /* ≥16px prevents iOS Safari zoom */
    line-height: 1.6;
    letter-spacing: 0.08em;
    resize: none;
    outline: none;
    padding: 10px 12px;
    caret-color: var(--text);
    margin-bottom: 0.75rem;
    /* Subtle focus ring */
    transition: border-color 0.12s;
  }
  #msg-textarea:focus {
    border-color: #3a3020;
  }

  No visible grid. Characters align naturally via monospace font. No row numbers.

  ---
  Internal State Mapping

  The existing messages[i].rows array (6 strings of 22 chars each) is the source of truth. The textarea's .value is derived from it:

  textarea.value  = rows.join('\n')        // rows → textarea
  rows            = value.split('\n')       // textarea → rows (after normalization)

  When loading a message into the textarea: trim trailing spaces per row so the textarea looks clean, then join with \n.

  When reading back: split by \n, normalize each line (see below), pad each to 22 chars for messages storage.

  ---
  Normalization (normalizeTextareaValue)

  Called on every input event. Returns { value, rows }.

  Steps:
  1. Split raw value by \n → array of line strings
  2. For each line:
    - For each character: keep lowercase color chars as-is, uppercase valid SPOOL chars, drop everything else (same logic as current normalizeValue)
    - Hard-truncate to 22 chars max (no soft-wrap, no overflow-to-next-line — just cut)
  3. Truncate to 6 lines max
  4. Re-join with \n → new textarea value
  5. Return rows as 6 padded strings for messages state

  Why truncate instead of wrap overflow to next line:
  Wrapping overflow shifts line positions and makes cursor restoration unreliable. Truncation is predictable — the user sees their text cut at 22 chars and knows to press Enter.

  ---
  Hard-Wrap Enforcement (keydown handler)

  Intercept before characters land:

  keydown on textarea:
    1. If key === 'Enter':
         count lines in current value
         if lines >= 6 → preventDefault() and return
         else → allow (native \n insertion)

    2. If printable character (length === 1, not ctrl/meta/alt):
         find which line cursor is on: lines before selectionStart
         find col in that line: selectionStart - (chars before this line + newlines)
         if col >= 22:
           if lineCount >= 6 → preventDefault()   // can't go further
           else → preventDefault(), insert '\n' at selectionStart, move cursor, re-dispatch char

  For step 2 ("re-dispatch char"): simplest approach is preventDefault() + insert '\n' + key.key via document.execCommand('insertText', false, '\n' + key.key) or direct .value manipulation, then fire input event.

  ---
  Color Insertion (insertColorChar)

  Virtually unchanged. focusedInput points to the textarea:

  function insertColorChar(char) {
    if (!focusedInput) return;
    const s = focusedInput.selectionStart;
    const e = focusedInput.selectionEnd;
    const v = focusedInput.value;
    focusedInput.value = v.slice(0, s) + char + v.slice(e);
    focusedInput.setSelectionRange(s + 1, s + 1);
    focusedInput.dispatchEvent(new Event('input', { bubbles: true }));
  }

  Writes directly to .value (same as current fix) to bypass autocapitalize.

  ---
  renderMessageList() rewrite

  function renderMessageList() {
    const list = document.getElementById('message-list');
    list.innerHTML = '';
    focusedInput = null;

    const msg = messages[activeMessageIndex];
    // Convert rows to textarea value (trim trailing spaces per row)
    const textareaValue = msg.rows.map(r => r.trimEnd()).join('\n');

    const ta = document.createElement('textarea');
    ta.id = 'msg-textarea';
    ta.rows = 6;
    ta.maxLength = 137;  // 6×22 + 5 newlines
    // … other attributes …
    ta.value = textareaValue;

    ta.addEventListener('focus', () => { focusedInput = ta; });
    ta.addEventListener('blur',  () => { if (focusedInput === ta) focusedInput = null; });
    ta.addEventListener('keydown', handleTextareaKeydown);
    ta.addEventListener('input', handleTextareaInput);

    list.appendChild(ta);
    renderMsgTabs();
  }

  ---
  Functions to delete

  - createCharRow() — entirely replaced
  - The global document.addEventListener('selectionchange', ...) — no longer needed
  - CSS: .char-grid-wrapper, .char-grid, .char-cell, .char-hidden-input, @keyframes cell-blink, .row-label, .row-input-group — all removed

  ---
  Functions to add

  - handleTextareaKeydown(e) — Enter/printable gating
  - handleTextareaInput(e) — normalize + sync preview + save drafts
  - normalizeTextareaValue(raw) → { value: string, rows: string[] }

  ---
  Edge Cases

  ┌───────────────────────────────────┬──────────────────────────────────────────────────────────────────────┐
  │               Case                │                               Handling                               │
  ├───────────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ Paste with >22 chars per line     │ normalizeTextareaValue truncates each line to 22                     │
  ├───────────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ Paste with >6 lines               │ Lines beyond 6 are dropped                                           │
  ├───────────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ Backspace across newline          │ Native textarea behavior — allowed                                   │
  ├───────────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ Color char at end of 22-char line │ Color char replaces last char (overwrite at max length)              │
  ├───────────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ Switching messages                │ renderMessageList() re-creates textarea with new message rows        │
  ├───────────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ loadDrafts / saveDrafts           │ messages structure unchanged — no impact                             │
  ├───────────────────────────────────┼──────────────────────────────────────────────────────────────────────┤
  │ Preview sync                      │ syncPreview(messages[activeMessageIndex].rows) called same as before │
  └───────────────────────────────────┴──────────────────────────────────────────────────────────────────────┘

  ---
  What stays the same

  - messages[] data structure (6×22 padded strings per message)
  - saveDrafts / loadDrafts / DEFAULT_VERSION
  - insertColorChar (minor tweak only)
  - syncPreview / renderMsgTabs / renderPreview
  - Color swatch buttons, mode tabs, loop timer, footer buttons
  - All WebSocket logic

  ---
  Ready to implement when you are. The scope is contained to renderMessageList, two new event handlers, one new normalizer, and the CSS swap — no other files need changes.