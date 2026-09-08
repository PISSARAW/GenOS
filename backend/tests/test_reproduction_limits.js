const assert = require('node:assert/strict');
const { enforceReproductionLimits } = require('../src/services/primitiveHandlers/fundamentals');

async function run() {
  const calls = [];
  const db = {
    get: async (sql, id) => {
      calls.push({ sql, id });
      if (sql.includes('COUNT(*)')) return { count: 0 };
      return id === 'root' ? { parent_agent_id: null } : null;
    }
  };

  const allowed = await enforceReproductionLimits(db, 'root', { maxDepth: 1000, maxBuds: 1000 });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.maxDepth, 32, 'caller cannot raise the hard generation ceiling');
  assert.equal(allowed.maxBuds, 50, 'caller cannot raise the hard fan-out ceiling');

  const blockedDb = {
    get: async (sql) => sql.includes('COUNT(*)') ? { count: 50 } : { parent_agent_id: null }
  };
  const blocked = await enforceReproductionLimits(blockedDb, 'root', {});
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.blockedByHayflick, true);
  assert.match(blocked.error, /spawn storms|Reproduction blocked/);
  console.log('Reproduction limit guard passed.');
}

run().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
