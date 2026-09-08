const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const memory = require('../src/services/primitiveHandlers/memory');

const originalDb = dbModule.getDatabase;
dbModule.getDatabase = async () => ({ all: async () => [] });
memory.stdpUpdate({ agentId: 'missing-pair' })
  .then((result) => { assert.equal(result.success, false); assert.equal(result.skipped, true); console.log('STDP skip contract checks passed.'); })
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => { dbModule.getDatabase = originalDb; });