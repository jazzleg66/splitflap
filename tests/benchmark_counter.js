const { performance } = require('perf_hooks');

const sessions = new Map();

for (let i = 0; i < 10000; i++) {
  sessions.set(`session-${i}`, {
    state: i % 2 === 0 ? 'active' : 'waiting',
    tvSocket: { readyState: 1 },
    phoneSocket: { readyState: 1 }
  });
}

function countActive() {
  let count = 0;
  for (const s of sessions.values()) {
    if (
      s.state === 'active' &&
      s.tvSocket?.readyState === 1 &&
      s.phoneSocket?.readyState === 1
    ) count++;
  }
  return count;
}

const start = performance.now();
for (let i = 0; i < 1000; i++) {
  countActive();
}
const end = performance.now();

console.log(`Original Time: ${(end - start).toFixed(2)} ms`);

let activeSessionCount = 0;
function updateSessionActive(session) {
  const isNowActive = session.state === 'active' &&
                      session.tvSocket?.readyState === 1 &&
                      session.phoneSocket?.readyState === 1;
  if (session._isActive !== isNowActive) {
    session._isActive = isNowActive;
    activeSessionCount += isNowActive ? 1 : -1;
  }
}

for (const s of sessions.values()) {
  updateSessionActive(s);
}

const start2 = performance.now();
for (let i = 0; i < 1000; i++) {
  let count = activeSessionCount;
}
const end2 = performance.now();

console.log(`Optimized Time: ${(end2 - start2).toFixed(2)} ms`);
