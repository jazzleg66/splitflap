// Polyfill fetch and others before any imports
global.fetch = jest.fn(() => Promise.resolve({
  arrayBuffer: () => Promise.resolve(new ArrayBuffer(8))
}));

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

global.AudioContext = class {
  createBufferSource() { return { start: jest.fn(), stop: jest.fn(), connect: jest.fn() }; }
  decodeAudioData() { return Promise.resolve({}); }
};

document.fonts = {
  ready: Promise.resolve()
};

// Scaffold DOM since module import executes scripts that expect DOM
document.body.innerHTML = `
  <div id="qr-screen"></div>
  <img id="qr-img" />
  <button id="btn-show-code"></button>
  <div id="pair-code"></div>
  <div id="conn-dot"></div>
  <div id="live-count"></div>
  <div id="board-container"></div>
  <button id="btn-skip"></button>
  <button id="btn-mute"></button>
  <button id="btn-fullscreen"></button>
  <div id="approval-overlay"></div>
  <button id="btn-approve"></button>
  <button id="btn-reject"></button>
`;
