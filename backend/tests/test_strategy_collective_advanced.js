const assert = require('node:assert/strict');
const adapter = require('../src/services/strategyExecutionAdapter');

(async () => {
  const wolves = await adapter.executePrimitive('alpha_beta_delta', { wolves: [{ id: 'a', score: 3 }, { id: 'b', score: 2 }, { id: 'c', score: 1 }] });
  assert.deepEqual([wolves.alpha.id, wolves.beta.id, wolves.delta.id], ['a', 'b', 'c']);
  const route = await adapter.executePrimitive('capability_route', { requiredCapabilities: ['security'], agents: [{ id: 'a', capabilities: [] }, { id: 'b', capabilities: ['security'] }] });
  assert.equal(route.selected.id, 'b');
  const assignment = await adapter.executePrimitive('dynamic_assignment', { agents: [{ id: 'a' }, { id: 'b' }], roles: ['scout', 'reviewer'] });
  assert.deepEqual(assignment.assignments.map((item) => item.role), ['scout', 'reviewer']);
  const silence = await adapter.executePrimitive('local_buffer', { messages: [{ status: 'progress' }, { status: 'success' }] });
  assert.equal(silence.flushed.length, 1);
  const tournament = await adapter.executePrimitive('solver_tournament', { solvers: [{ id: 'a', score: 1 }, { id: 'b', score: 2 }] });
  assert.equal(tournament.winner.id, 'b');
  console.log('Strategy collective advanced checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });