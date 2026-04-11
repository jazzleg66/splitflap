const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const dom = new JSDOM(`
  <!DOCTYPE html>
  <html>
    <body>
      <div id="board-grid" style="width: 1000px; height: 1000px;"></div>
    </body>
  </html>
`);

global.document = dom.window.document;
global.window = dom.window;
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock dependencies
global.tileEls = [
  [
    {
      getBoundingClientRect: () => ({ height: 100 })
    }
  ]
];

// Provide function definition
function syncTileSizing_original() {
  const tile = tileEls[0]?.[0];
  if (!tile) return;
  const h = tile.getBoundingClientRect().height;
  if (h === 0) return;
  const boardGrid = document.getElementById('board-grid');
  boardGrid.style.setProperty('--tile-fs', h + 'px');
  boardGrid.style.setProperty('--tile-ty', (h / 4) + 'px');
}

let boardGridCached = document.getElementById('board-grid');
function syncTileSizing_optimized() {
  const tile = tileEls[0]?.[0];
  if (!tile) return;
  const h = tile.getBoundingClientRect().height;
  if (h === 0) return;
  boardGridCached.style.setProperty('--tile-fs', h + 'px');
  boardGridCached.style.setProperty('--tile-ty', (h / 4) + 'px');
}

const ITERATIONS = 1000000;

console.time('Original');
for (let i = 0; i < ITERATIONS; i++) {
  syncTileSizing_original();
}
console.timeEnd('Original');

console.time('Optimized');
for (let i = 0; i < ITERATIONS; i++) {
  syncTileSizing_optimized();
}
console.timeEnd('Optimized');
