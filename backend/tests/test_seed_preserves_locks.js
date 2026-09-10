const assert = require('node:assert/strict');
const { getDatabase } = require('../src/db');
const { seedMcpTools } = require('../src/db/seedTools');

(async () => {
  const db = await getDatabase();
  const name = 'genos_run';
  await db.run('UPDATE mcp_tools SET is_locked = 1, circuit_state = ? WHERE name = ?', 'OPEN', name);
  await seedMcpTools(db);
  const row = await db.get('SELECT is_locked, circuit_state FROM mcp_tools WHERE name = ?', name);
  assert.equal(row.is_locked, 1, 're-seeding must not unlock a quarantined tool');
  assert.equal(row.circuit_state, 'OPEN', 're-seeding must not reset an OPEN breaker');
  await db.run('UPDATE mcp_tools SET is_locked = 0, circuit_state = ? WHERE name = ?', 'CLOSED', name);
  console.log('Seed preserves quarantine: PASS');
  process.exit(0);
})().catch((error) => {
  console.error('Seed quarantine test failed:', error);
  process.exit(1);
});
