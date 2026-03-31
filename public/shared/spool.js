// Spool engine — pure logic, no DOM dependency.
// Shared between display board and mobile controller (ES module).

export const SPOOL = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$()-+=;:'\"\",.?/\u00b0ROYGBPW";

export function spoolIndex(char) {
  const i = SPOOL.indexOf(char);
  return i === -1 ? 0 : i;
}

export function spoolChar(index) {
  const len = SPOOL.length;
  return SPOOL[((index % len) + len) % len];
}

// Always counts forward (wrapping). Returns 0 if from === to.
export function stepsToReach(from, to) {
  const len = SPOOL.length;
  return (spoolIndex(to) - spoolIndex(from) + len) % len;
}

// ── Grid model ────────────────────────────────────────────────────────────────

export function initGrid(rows = 6, cols = 22) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({ current: ' ', target: ' ', stepsLeft: 0 }))
  );
}

export function setTargets(grid, targetRows) {
  grid.forEach((row, r) =>
    row.forEach((tile, c) => {
      const ch = (targetRows[r]?.[c] ?? ' ').toUpperCase();
      tile.target = ch;
      tile.stepsLeft = stepsToReach(tile.current, tile.target);
    })
  );
}

// Advance every tile one step. Returns { anyChanged, allSettled }.
export function stepAll(grid) {
  let anyChanged = false;
  let allSettled = true;
  grid.forEach(row =>
    row.forEach(tile => {
      if (tile.stepsLeft > 0) {
        tile.current = spoolChar(spoolIndex(tile.current) + 1);
        tile.stepsLeft--;
        anyChanged = true;
      }
      if (tile.stepsLeft > 0) allSettled = false;
    })
  );
  return { anyChanged, allSettled };
}

// Snap all tiles to their targets instantly (no animation — used by preview).
export function snapToTargets(grid) {
  grid.forEach(row =>
    row.forEach(tile => {
      tile.current = tile.target;
      tile.stepsLeft = 0;
    })
  );
}

// ── Color helpers ─────────────────────────────────────────────────────────────

export const COLOR_MAP = {
  R: '#FF0000',
  O: '#FF7F00',
  Y: '#FFFF00',
  G: '#00AA00',
  B: '#0000FF',
  P: '#800080',
  W: '#FFFFFF',
};

export function isColorChar(char) {
  return Object.prototype.hasOwnProperty.call(COLOR_MAP, char);
}
