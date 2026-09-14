const assert = require('node:assert/strict');
const algo = require('../src/services/swarmTopologyAlgorithms');

const boids = algo.flockingBoids([
  { id: 'a', x: 0, y: 0, heading: 0 },
  { id: 'b', x: 0.5, y: 0, heading: 1 }
], { cohesion: 0.1, separation: 0.2, separationRadius: 1 });
assert.equal(boids.length, 2);
assert.ok(Number.isFinite(boids[0].vector.x) && Number.isFinite(boids[0].vector.y));
assert.ok(Number.isFinite(boids[0].heading));
assert.notEqual(boids[0].heading, 0);

const school = algo.fishSchoolSearch([
  { id: 'a', x: 0, y: 0, fitness: 1 },
  { id: 'b', x: 10, y: 0, fitness: 9 }
]);
assert.equal(school.barycenter.x, 9);
assert.equal(school.individuals.length, 2);
assert.ok(school.individuals[0].volitive.x > 0);

const edges = algo.slimeMouldNetwork([
  { id: 'e1', conductivity: 0.5, flow: 1 },
  { id: 'e2', conductivity: 0.04, flow: 0 }
]);
assert.equal(edges.length, 1);
assert.equal(edges[0].id, 'e1');
assert.equal(edges[0].conductivity, 0.55);

const pack = algo.greyWolfOptimizer([
  { id: 'w1', x: 0, y: 0, fitness: 1 },
  { id: 'w2', x: 5, y: 5, fitness: 9 },
  { id: 'w3', x: 2, y: 2, fitness: 5 }
], { step: 0.5 });
assert.equal(pack.length, 3);
assert.equal(pack[0].role, 'alpha');
assert.equal(pack[0].id, 'w2');
assert.equal(pack[1].role, 'beta');
assert.equal(pack[2].role, 'delta');

assert.deepEqual(algo.runTopologyStep('flocking_boids', { agents: [] }).agents, []);
assert.equal(algo.runTopologyStep('unknown_org', {}), null);

console.log('Swarm topology algorithms checks: PASS');
