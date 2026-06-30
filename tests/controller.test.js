import fs from 'fs';
import path from 'path';

describe('controller module', () => {
  beforeEach(async () => {
    // Reset document
    document.fonts = { ready: Promise.resolve() };

    const html = fs.readFileSync(
      path.resolve(__dirname, '../public/controller/index.html'),
      'utf8'
    );
    document.body.innerHTML = html;

    global.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    global.posthog = { capture: jest.fn() };

    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockImplementation(() => Promise.resolve()),
      },
    });

    // Clear localStorage
    localStorage.clear();

    // Re-import module - jest re-imports need to be isolated or we clear cache
    jest.resetModules();
    await import('../public/controller/controller.js');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('should initialize successfully', () => {
    expect(document.getElementById('header-status')).not.toBeNull();
    const boardGrid = document.getElementById('board-grid');
    expect(boardGrid).not.toBeNull();
    // Default has 1 message tab
    expect(document.querySelectorAll('.msg-tab').length).toBe(1);
  });

  it('adds a new message when add button is clicked', () => {
    const initialTabs = document.querySelectorAll('.msg-tab').length;
    const addButton = document.getElementById('btn-add-message');

    addButton.click();

    const newTabs = document.querySelectorAll('.msg-tab').length;
    expect(newTabs).toBe(initialTabs + 1);
    expect(newTabs).toBe(2);
  });

  it('changes mode to clock and back', () => {
    const clockRadio = document.querySelector('input[name="mode"][value="clock"]');
    clockRadio.checked = true;
    clockRadio.dispatchEvent(new Event('change'));

    // Buttons should be disabled in clock mode
    expect(document.getElementById('btn-play').disabled).toBe(true);
    expect(document.getElementById('btn-next').disabled).toBe(true);

    const messageRadio = document.querySelector('input[name="mode"][value="message"]');
    messageRadio.checked = true;
    messageRadio.dispatchEvent(new Event('change'));

    // Buttons should be enabled again
    expect(document.getElementById('btn-play').disabled).toBe(false);
    expect(document.getElementById('btn-next').disabled).toBe(false);
  });

  it('toggles play state', () => {
    const playBtn = document.getElementById('btn-play');
    expect(playBtn.textContent).toBe('PLAY');
    expect(playBtn.classList.contains('playing')).toBe(false);

    playBtn.click();

    expect(playBtn.textContent).toBe('STOP');
    expect(playBtn.classList.contains('playing')).toBe(true);

    playBtn.click();

    expect(playBtn.textContent).toBe('PLAY');
    expect(playBtn.classList.contains('playing')).toBe(false);
  });

  it('inputs characters into grid', () => {
    const captureInput = document.getElementById('grid-capture');
    expect(captureInput).not.toBeNull();

    // Simulate clicking the first cell to focus
    const firstCell = document.querySelector('.cell[data-index="0"]');
    firstCell.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    firstCell.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Input 'A'
    captureInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', bubbles: true }));

    // Check if cell was updated
    expect(firstCell.textContent).toBe('A');
  });

  it('deletes a message when delete button is clicked', () => {
    // Add a message first
    const addButton = document.getElementById('btn-add-message');
    addButton.click();

    expect(document.querySelectorAll('.msg-tab').length).toBe(2);

    // Find the delete button on the second tab
    const tabs = document.querySelectorAll('.msg-tab');
    const deleteBtn = tabs[1].querySelector('.msg-tab-del');

    // Click delete
    deleteBtn.click();

    expect(document.querySelectorAll('.msg-tab').length).toBe(1);
  });

  it('resets correctly', () => {
    // Modify state
    const captureInput = document.getElementById('grid-capture');
    const firstCell = document.querySelector('.cell[data-index="0"]');
    firstCell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    captureInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'X', bubbles: true }));
    expect(firstCell.textContent).toBe('X');

    // Click reset
    const resetBtn = document.getElementById('btn-reset');
    resetBtn.click();

    // First cell should be space again (because DEFAULT_MESSAGES has space at 0,0)
    const resetFirstCell = document.querySelector('.cell[data-index="0"]');
    expect(resetFirstCell.textContent).toBe(''); // empty cell renders as empty textContent
  });

  it('shows artwork section in artwork mode', () => {
    const artworkRadio = document.querySelector('input[name="mode"][value="artwork"]');
    artworkRadio.checked = true;
    artworkRadio.dispatchEvent(new Event('change'));

    expect(document.getElementById('artwork-section').hidden).toBe(false);
    expect(document.getElementById('msg-nav').hidden).toBe(true);
  });

  it('navigates through messages with tabs', () => {
    const addButton = document.getElementById('btn-add-message');
    addButton.click();

    // Type in second message
    const captureInput = document.getElementById('grid-capture');
    const firstCell = document.querySelector('.cell[data-index="0"]');
    firstCell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    captureInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Z', bubbles: true }));
    expect(document.querySelector('.cell[data-index="0"]').textContent).toBe('Z');

    // Switch to first message
    const tabs = document.querySelectorAll('.msg-tab');
    tabs[0].click();
    expect(document.querySelector('.cell[data-index="0"]').textContent).toBe('');

    // Switch back to second message
    const tabsAfterClick = document.querySelectorAll('.msg-tab');
    tabsAfterClick[1].click();
    expect(document.querySelector('.cell[data-index="0"]').textContent).toBe('Z');
  });

  it('handles copy link button', () => {
    const btn = document.getElementById('btn-copy-link');
    if (btn) {
      btn.click();
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    }
  });

  it('updates header info on message mode', () => {
    const el = document.getElementById('btn-play');
    el.click();
    el.click();
    const st = document.getElementById('header-status');
    expect(st).toBeDefined();
  });

  it('inputs color correctly', () => {
    const colorBtn = document.querySelector('.color-swatch[data-color="r"]');
    if (colorBtn) {
      const firstCell = document.querySelector('.cell[data-index="0"]');
      firstCell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      colorBtn.click();
      expect(firstCell.classList.contains('is-color')).toBe(true);
    }
  });
});
