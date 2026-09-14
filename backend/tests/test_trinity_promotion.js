const assert = require('node:assert/strict');
const barrier = require('../src/services/trinityComparativeBarrier');

const updates = [];
const fakeDb = { run: async (sql, ...params) => { updates.push({ sql, params }); return { changes: 1 }; } };

const result = {
  canMerge: true,
  selectedWorld: 2,
  selectedRole: 'planned',
  bestScore: 0.9,
  comparativeAnalysis: { scoredWorlds: [
    { worldNumber: 1, agentId: 'w1', score: 0.5 },
    { worldNumber: 2, agentId: 'w2', score: 0.9 },
    { worldNumber: 3, agentId: 'w3', score: 0.4 }
  ] }
};

(async () => {
  const promotion = await barrier.promoteWinner(fakeDb, { missionId: 'm', orchestratorId: 'orch', result });
  assert.equal(promotion.promoted, true);
  assert.equal(promotion.worldNumber, 2);
  assert.equal(promotion.agentId, 'w2');
  assert.ok(updates.some((entry) => /status = 'promoted'/.test(entry.sql) && entry.params[0] === 'w2'));
  assert.ok(updates.some((entry) => entry.params[0] === 'w1'));
  assert.ok(updates.some((entry) => entry.params[0] === 'w3'));

  assert.deepEqual(await barrier.promoteWinner(fakeDb, { result: { canMerge: false } }), { promoted: false, reason: 'no_merge' });
  assert.deepEqual(await barrier.promoteWinner(null, { result }), { promoted: false, reason: 'no_winner_agent' });
  console.log('Trinity promotion checks: PASS');
})().catch((error) => {
  console.error('Trinity promotion test failed:', error);
  process.exit(1);
});
