/** @jest-environment node */

const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '../public');
const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.svg', '.txt', '.xml']);
const MOJIBAKE_PATTERN = /[鈥鈹馃脳鈫鉁鈻锟�]|Ã|Â|â€|ðŸ/u;

function publicTextFiles(dir = PUBLIC_DIR) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return publicTextFiles(fullPath);
    return TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) ? [fullPath] : [];
  });
}

describe('published text encoding', () => {
  test('contains no known mojibake markers', () => {
    const corruptedFiles = publicTextFiles()
      .filter(file => MOJIBAKE_PATTERN.test(fs.readFileSync(file, 'utf8')))
      .map(file => path.relative(PUBLIC_DIR, file));

    expect(corruptedFiles).toEqual([]);
  });

  test('preserves user-visible Unicode punctuation and symbols', () => {
    const home = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
    const board = fs.readFileSync(path.join(PUBLIC_DIR, 'board/index.html'), 'utf8');

    expect(home).toContain('fixed spool — exactly like physical hardware — with every');
    expect(home).toContain('🟢 <span id="live-count">0</span> BOARDS LIVE');
    expect(board).toContain('<title>Split Flap — Board</title>');
    expect(board).toContain('<kbd>↵</kbd>');
  });
});
