const assert = require('node:assert/strict');
const adapter = require('../src/services/strategyExecutionAdapter');

(async () => {
  assert.equal((await adapter.executePrimitive('frontier_escalation', { entropy: 0.9 })).route, 'frontier');
  assert.equal((await adapter.executePrimitive('invalidate_assumption', { assumption: 'a', evidence: [{ refutes: 'a' }] })).invalidated, true);
  assert.equal((await adapter.executePrimitive('paired_evaluation', { leftScore: 1, rightScore: 2 })).winner, 'right');
  assert.equal((await adapter.executePrimitive('impact_graph', { nodes: [{ id: 'a' }], edges: [] })).success, true);
  assert.equal((await adapter.executePrimitive('adversarial_review', { claims: [{ id: 'a', evidence: ['test'] }], counterclaims: [] })).success, true);
  assert.equal((await adapter.executePrimitive('context_compaction', { items: [1, 2, 3], limit: 2 })).removed, 1);
  console.log('Remaining strategy primitive checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });