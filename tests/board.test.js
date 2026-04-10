// Mock wsClient before importing board.js
jest.mock('../public/shared/wsClient.js', () => {
  return class MockWsClient {
    constructor(onConnect) { this.onConnect = onConnect; }
    connect() {}
    send() {}
    onMessage() {}
    destroy() {}
  };
});

import { displayRows, snapDisplay } from '../public/board/board.js';

describe('Connected Board Display Module', () => {
  let initialRAF;
  let rafCallback;
  beforeEach(() => {
    // We don't overwrite document.body.innerHTML here so that the module's
    // initialized grid elements (from setup.js initialization) are preserved.
    initialRAF = global.requestAnimationFrame;
    // Mock RAF to step manually
    global.requestAnimationFrame = jest.fn((cb) => {
      rafCallback = cb;
    });
  });

  afterEach(() => {
    global.requestAnimationFrame = initialRAF;
    jest.clearAllMocks();
  });

  it('should initialize and run displayRows accurately', async () => {
      // First, let's reset the display to empty to establish a baseline
      snapDisplay(Array(6).fill('                      '));

      const targetRows = [
        'A                     ',
        'B                     ',
        '                      ',
        '                      ',
        '                      ',
        '                      '
      ];

      let settled = false;

      displayRows(targetRows, () => {
         settled = true;
      });

      // Simulate the animation loops
      let currentTime = 0;
      let failsafe = 0;
      while (!settled && failsafe < 1000) {
         if (rafCallback) {
             const cb = rafCallback;
             rafCallback = null;
             currentTime += 100; // FLIP_INTERVAL_MS is 60
             cb(currentTime);

             // Simulate animation events firing immediately for anything that was marked .flipping
             document.querySelectorAll('.flipping').forEach(el => {
                el.dispatchEvent(new Event('animationend'));
             });
         }
         failsafe++;
      }

      expect(settled).toBe(true);

      const staticChars = document.querySelectorAll('.top-half-static .tile-char');
      expect(staticChars.length).toBe(132); // 6 rows * 22 cols

      // Index 0 is row 0 col 0, which should be 'A'
      expect(staticChars[0].textContent).toBe('A');
      // Index 22 is row 1 col 0, which should be 'B'
      expect(staticChars[22].textContent).toBe('B');
  });

  it('should snap directly to targets without animation in snapDisplay', () => {
      // First, reset the display
      snapDisplay(Array(6).fill('                      '));

      const targetRows = [
        'X                     ',
        'Y                     ',
        'Z                     ',
        '                      ',
        '                      ',
        '                      '
      ];

      snapDisplay(targetRows);

      const staticChars = document.querySelectorAll('.top-half-static .tile-char');

      // Index 0 is row 0 col 0, which should be 'X'
      expect(staticChars[0].textContent).toBe('X');
      // Index 22 is row 1 col 0, which should be 'Y'
      expect(staticChars[22].textContent).toBe('Y');
      // Index 44 is row 2 col 0, which should be 'Z'
      expect(staticChars[44].textContent).toBe('Z');

      // The rest of the first row should be space (' ') which renders as ''
      expect(staticChars[1].textContent).toBe('');

      // Since it's a snap, no items should be flipping
      const flipping = document.querySelectorAll('.flipping');
      expect(flipping.length).toBe(0);
  });
});
