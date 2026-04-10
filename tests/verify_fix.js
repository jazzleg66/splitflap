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

  const reqHost = req.get('host') || '';

  // 2. If no APP_URL is provided, and we are running on localhost,
  // substitute with the machine's LAN IP to allow phone pairing on the local network.
  if (reqHost.startsWith('localhost') || reqHost.startsWith('127.0.0.1')) {
    const port = env.PORT || 3000;
    const ip = getLanIp();
    if (ip) return `${ip}:${port}`;
  }

  // 3. Fallback to Host header if APP_URL and LAN IP are unavailable.
  return reqHost;
}

function getScheme(req, env) {
  let scheme = req.headers['x-forwarded-proto'] || req.protocol;
  if (env.APP_URL) {
    try {
      scheme = new URL(env.APP_URL).protocol.replace(':', '');
    } catch (e) {}
  } else if (env.NODE_ENV === 'production' && !req.headers['x-forwarded-proto']) {
    scheme = 'https';
  }
  return scheme;
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

  // Test 4: LAN IP substitution for localhost
  {
    const env = { NODE_ENV: 'development', PORT: 3000 };
    const req = { get: (h) => 'localhost:3000' };
    const host = getLanHost(req, env);
    assert.strictEqual(host !== 'localhost:3000', true, 'Should use LAN IP instead of localhost');
    console.log('✅ Test 4 Passed: Substitutes LAN IP for localhost requests');
  }

  // Test 5: Scheme from APP_URL
  {
    const env = { APP_URL: 'https://mysite.com' };
    const req = { headers: {}, protocol: 'http' };
    const scheme = getScheme(req, env);
    assert.strictEqual(scheme, 'https', 'Should use scheme from APP_URL');
    console.log('✅ Test 5 Passed: Scheme from APP_URL');
  }

  // Test 6: Scheme from x-forwarded-proto
  {
    const env = { NODE_ENV: 'production' };
    const req = { headers: { 'x-forwarded-proto': 'https' }, protocol: 'http' };
    const scheme = getScheme(req, env);
    assert.strictEqual(scheme, 'https', 'Should use scheme from x-forwarded-proto');
    console.log('✅ Test 6 Passed: Scheme from x-forwarded-proto');
  }

  // Test 7: Scheme fallback to https in production without x-forwarded-proto
  {
    const env = { NODE_ENV: 'production' };
    const req = { headers: {}, protocol: 'http' };
    const scheme = getScheme(req, env);
    assert.strictEqual(scheme, 'https', 'Should fallback to https in production');
    console.log('✅ Test 7 Passed: Scheme fallback to https in production');
  }

  console.log('All tests passed successfully!');
}

runTests();
