const assert = require('assert');
const os = require('os');

// Redefine logic for testing as it is not exported from server/index.js
function getLanIp() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const ifaces of Object.values(nets)) {
    for (const iface of ifaces) {
      const isIPv4 = iface.family === 'IPv4' || iface.family === 4;
      if (isIPv4 && !iface.internal) candidates.push(iface.address);
    }
  }
  return (
    candidates.find(ip => ip.startsWith('192.168.')) ||
    candidates.find(ip => ip.startsWith('10.'))       ||
    candidates[0] || null
  );
}

function getLanHost(req, env) {
  // 1. Prefer explicit APP_URL from environment
  if (env.APP_URL) {
    try {
      return new URL(env.APP_URL).host;
    } catch (e) {
      // console.error(`[server] Invalid APP_URL: ${env.APP_URL}`);
    }
  }

  // 2. In development, prefer LAN IP for phone pairing
  if (env.NODE_ENV !== 'production') {
    const port = env.PORT || 3000;
    const ip = getLanIp();
    if (ip) return `${ip}:${port}`;
  }

  // 3. Fallback to Host header if APP_URL and LAN IP are unavailable.
  return req.get('host');
}

// Test cases
function runTests() {
  console.log('Running tests for getLanHost security fix...');

  // Test 1: APP_URL is respected (Production)
  {
    const env = { NODE_ENV: 'production', APP_URL: 'https://mysite.com' };
    const req = { get: (h) => 'attacker.com' };
    const host = getLanHost(req, env);
    assert.strictEqual(host, 'mysite.com', 'Should use APP_URL host in production');
    console.log('✅ Test 1 Passed: APP_URL is respected in production');
  }

  // Test 2: APP_URL is respected (Development)
  {
    const env = { NODE_ENV: 'development', APP_URL: 'https://dev.mysite.com' };
    const req = { get: (h) => 'localhost:3000' };
    const host = getLanHost(req, env);
    assert.strictEqual(host, 'dev.mysite.com', 'Should use APP_URL host even in development if provided');
    console.log('✅ Test 2 Passed: APP_URL is respected in development');
  }

  // Test 3: Fallback to Host header when APP_URL is missing
  {
    const env = { NODE_ENV: 'production' };
    const req = { get: (h) => 'legit-site.com:3000' };
    const host = getLanHost(req, env);
    assert.strictEqual(host, 'legit-site.com:3000', 'Should fallback to Host header for backward compatibility');
    console.log('✅ Test 3 Passed: Fallback to Host header when APP_URL is missing');
  }

  console.log('All tests passed successfully!');
}

runTests();
