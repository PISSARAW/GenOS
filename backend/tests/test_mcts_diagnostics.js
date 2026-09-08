const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const search = require('../src/services/primitiveHandlers/search');

const originalDb = dbModule.getDatabase;
dbModule.getDatabase = async () => ({ get: async () => null });
search.mctsSelect({ candidates: ['missing-a', 'missing-b'] })
  .then((result) => { assert.equal(result.success, false); assert.equal(result.reason, 'all_candidates_missing'); assert.equal(result.diagnostics.missingCount, 2); console.log('MCTS diagnostic checks passed.'); })
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => { dbModule.getDatabase = originalDb; });