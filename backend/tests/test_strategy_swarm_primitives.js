const assert = require('node:assert/strict');
const adapter = require('../src/services/strategyExecutionAdapter');

(async () => {
  const flock = await adapter.executePrimitive('separation', { points: [{ id: 'a', position: { x: 0, y: 0 }, velocity: { x: 1, y: 0 } }, { id: 'b', position: { x: 2, y: 0 }, velocity: { x: 0, y: 1 } }] });
  assert.equal(flock.success, true);
  const center = await adapter.executePrimitive('weighted_barycenter', { points: [{ position: { x: 0, y: 0 }, weight: 1 }, { position: { x: 4, y: 0 }, weight: 3 }] });
  assert.equal(center.barycenter.x, 3);
  const paths = await adapter.executePrimitive('path_conductivity', { paths: [{ id: 'weak', conductivity: 1 }, { id: 'strong', conductivity: 4 }] });
  assert.equal(paths.selected.id, 'strong');
  const roles = await adapter.executePrimitive('role_gradient', { points: [{ id: 'a' }, { id: 'b' }], roles: ['scout', 'builder'] });
  assert.deepEqual(roles.assignments.map((item) => item.role), ['scout', 'builder']);
  const ranking = await adapter.executePrimitive('elo', { players: [{ id: 'a', wins: 2 }, { id: 'b', losses: 2 }] });
  assert.equal(ranking.winner.id, 'a');
  console.log('Strategy swarm primitive checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });