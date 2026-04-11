const { createSession, getByCode, sessions } = require('./server/sessionManager');

async function benchmark() {
  const numSessions = 5000;

  console.time('Populate sessions');
  const sessionCodes = [];
  for (let i = 0; i < numSessions; i++) {
    const session = await createSession();
    sessionCodes.push(session.pairCode);
  }
  console.timeEnd('Populate sessions');

  console.time('Lookup sessions (getByCode)');
  for (let i = 0; i < numSessions; i++) {
    getByCode(sessionCodes[i]);
  }
  console.timeEnd('Lookup sessions (getByCode)');

  console.time('Generate pair code in full sessions');
  for (let i = 0; i < 500; i++) {
    await createSession();
  }
  console.timeEnd('Generate pair code in full sessions');
  process.exit(0);
}

benchmark();
